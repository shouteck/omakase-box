import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import Fastify from 'fastify';
import { SessionStore } from '../../../packages/contracts/auth/store.js';
import { hashPassword } from '../../../packages/contracts/auth/crypto.js';
import { installPrivateAuth } from '../auth/routes.js';
import { installOwnerAssignmentRoutes } from './routes.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { canonicalize } from '../../../packages/contracts/hash.js';
import { PrivateAssignmentStore } from './store.js';
import type { SignedAssignmentCommand } from '../../external-api/reservations/assignment-protocol.js';

export async function runOwnerAssignmentFixture(input: { taskId: string; taskVersion: number; packageDigest: string; contributorId: string }) {
  const database = `synthetic_owner_assignment_${randomBytes(16).toString('hex')}`;
  assert.match(database, /^synthetic_owner_assignment_[a-f0-9]{32}$/);
  const configuration = { host: process.env.PRIVATE_DATABASE_HOST, user: process.env.PRIVATE_DATABASE_USER, password: readFileSync(process.env.PRIVATE_DATABASE_PASSWORD_FILE!, 'utf8').trim(), max: 4 };
  const admin = new Pool({ ...configuration, database: process.env.PRIVATE_DATABASE_NAME });
  await admin.query(`CREATE DATABASE "${database}"`); await admin.end();
  const pool = new Pool({ ...configuration, database });
  const report: Record<string, unknown> = { assurance: 'unverified', database, readinessInjected: true, realReadinessVerified: false, candidateExecution: false };
  let stage = 'migrations';
  try {
    await migrate(drizzle(pool), { migrationsFolder: 'db/migrations' });
    assert.match(readFileSync('db/migrations/0008_assignment_delivery.sql', 'utf8'), /CREATE TABLE private_assignments \(/, 'migration 0008 must create private_assignments');
    const ownerId = randomUUID(), sessionHash = randomBytes(32).toString('hex'), csrfHash = randomBytes(32).toString('hex');
    const password = 'synthetic-owner-assignment-password', passwordHash = await hashPassword(password);
    await pool.query("INSERT INTO private_accounts (id,username,password_hash,role) VALUES ($1,$2,$3,'owner')", [ownerId, 'synthetic.assignment.owner', passwordHash]);
    await pool.query("INSERT INTO private_sessions (token_hash,account_id,csrf_hash,expires_at) VALUES ($1,$2,$3,now()+interval '1 hour')", [sessionHash,ownerId,csrfHash]);
    const actor = { id: ownerId, role: 'owner' as const, sessionHash, csrfHash }, keys = generateKeyPairSync('ed25519');
    const readiness = async () => ({ taskId: input.taskId, taskVersion: input.taskVersion, packageDigest: input.packageDigest, ready: true });
    const store = new PrivateAssignmentStore(pool, keys.privateKey, readiness);
    const request = { taskId: input.taskId, taskVersion: input.taskVersion, packageDigest: input.packageDigest, idempotencyKey: randomUUID(), executor: { kind: 'human', label: 'Synthetic customer-selected contributor', contributorId: input.contributorId } };
    stage = 'owner_choice';
    const race = await Promise.all([store.choose(actor, request), store.choose(actor, request)]);
    report.concurrentIdempotent = race[0].id === race[1].id;
    report.ownerSessionBound = race[0].status === 'queued';
    report.choiceRows = (await pool.query('SELECT count(*)::int AS n FROM private_assignments')).rows[0].n;
    report.outboxRows = (await pool.query('SELECT count(*)::int AS n FROM private_assignment_outbox')).rows[0].n;
    report.invitationIssued = typeof race[0].invitation === 'object' && /^[a-f0-9]{64}$/.test(race[0].invitation.token) && race[0].invitation.contributorId === input.contributorId && race[0].invitation.revoked === false;
    report.changedChoiceDenied = await store.choose(actor, { ...request, executor: { ...request.executor, label: 'Changed executor choice' } }).then(() => false, error => error.code === 'stale_version');
    stage = 'authority';
    await pool.query('UPDATE private_accounts SET disabled=true WHERE id=$1', [ownerId]);
    report.disabledOwnerDenied = await store.choose(actor, request).then(() => false, error => error.code === 'forbidden_role');
    await pool.query('UPDATE private_accounts SET disabled=false WHERE id=$1', [ownerId]);
    await pool.query("UPDATE private_sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1", [sessionHash]);
    report.expiredSessionDenied = await store.choose(actor, request).then(() => false, error => error.code === 'forbidden_role');
    await pool.query("UPDATE private_sessions SET expires_at=now()+interval '1 hour' WHERE token_hash=$1", [sessionHash]);
    report.missingReadinessDenied = await new PrivateAssignmentStore(pool, keys.privateKey).choose(actor, request).then(() => false, error => error.code === 'missing_evidence');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      try { await client.query('UPDATE private_assignments SET executor=$2 WHERE id=$1', [race[0].id,{ kind: 'ai', label: 'Changed executor' }]); report.choiceImmutable = false; }
      catch { report.choiceImmutable = true; }
    } finally { await client.query('ROLLBACK'); client.release(); }
    stage = 'owner_http_authority';
    const sessions = new SessionStore(pool, 'private', randomBytes(32)), api = Fastify({ logger: false, bodyLimit: 65536, trustProxy: false });
    const handlers = installPrivateAuth(api, sessions, 'localhost_demo');
    installOwnerAssignmentRoutes(api, handlers, store);
    try {
      const login = await sessions.login('synthetic.assignment.owner', password);
      const headers = { origin: 'http://private.localhost:3000', cookie: `private_session=${login.cookie}`, 'x-csrf-token': login.csrfToken };
      const ownerResponse = await api.inject({ method: 'POST', url: '/v1/assignments', headers, payload: request });
      report.ownerHttpAuthority = ownerResponse.statusCode === 201 && ownerResponse.json().id === race[0].id;
      const noCsrf = await api.inject({ method: 'POST', url: '/v1/assignments', headers: { ...headers,'x-csrf-token': 'f'.repeat(64) }, payload: request });
      report.ownerCsrfDenied = noCsrf.statusCode === 401;
      const forged = await api.inject({ method: 'POST', url: '/v1/assignments', headers, payload: { ...request, chosenBy: 'forged-owner', publicationReady: true } });
      report.clientAuthorityDenied = forged.statusCode === 400 && forged.body === '{"error":"invalid_input"}';
      await pool.query("INSERT INTO private_accounts (id,username,password_hash,role) VALUES ($1,$2,$3,'operator')", [randomUUID(),'synthetic.assignment.operator',passwordHash]);
      const operator = await sessions.login('synthetic.assignment.operator',password);
      const denied = await api.inject({ method: 'POST', url: '/v1/assignments', headers: { ...headers,cookie: `private_session=${operator.cookie}`,'x-csrf-token': operator.csrfToken }, payload: { ...request, role: 'owner' } });
      report.operatorHttpDenied = denied.statusCode === 403;
      stage = 'invitation_revocation';
      const revoked = await api.inject({ method: 'POST', url: `/v1/assignments/${race[0].id}/invitation-revocation`, headers });
      report.revocationQueued = revoked.statusCode === 201 && revoked.json().status === 'revocation_queued' && revoked.json().duplicate === false;
      const twice = await api.inject({ method: 'POST', url: `/v1/assignments/${race[0].id}/invitation-revocation`, headers });
      report.revocationIdempotent = twice.statusCode === 201 && twice.json().duplicate === true;
      const missing = await api.inject({ method: 'POST', url: `/v1/assignments/${randomUUID()}/invitation-revocation`, headers });
      report.revocationMissingDenied = missing.statusCode === 404;
      const noCsrfRevoke = await api.inject({ method: 'POST', url: `/v1/assignments/${race[0].id}/invitation-revocation`, headers: { ...headers, 'x-csrf-token': 'f'.repeat(64) } });
      report.revocationCsrfDenied = noCsrfRevoke.statusCode === 401;
    } finally { await api.close(); }
    const packet = (await pool.query("SELECT packet FROM private_assignment_outbox WHERE assignment_id=$1 AND kind='choice'", [race[0].id])).rows[0].packet as SignedAssignmentCommand;
    const revocation = (await pool.query("SELECT packet FROM private_assignment_outbox WHERE assignment_id=$1 AND kind='invitation_revocation'", [race[0].id])).rows[0].packet;
    const signed = (payload: SignedAssignmentCommand['payload']) => ({ payload, signature: sign(null, Buffer.from(canonicalize(payload)), keys.privateKey).toString('base64') });
    report.packet = packet;
    report.revocationPacket = revocation;
    report.invitationToken = race[0].invitation?.token;
    report.invitationBound = packet.payload.invitation?.contributorId === input.contributorId && /^[a-f0-9]{64}$/.test(packet.payload.invitation?.tokenHash ?? '') && packet.payload.invitation?.tokenHash !== race[0].invitation?.token;
    report.revocationBound = revocation?.payload?.contributorId === input.contributorId && revocation?.payload?.tokenHash === packet.payload.invitation?.tokenHash;
    report.verificationKeyPem = keys.publicKey.export({ format: 'pem', type: 'spki' }).toString();
    report.replayPacket = signed({ ...packet.payload, nonce: randomUUID() });
    report.stalePackagePacket = signed({ ...packet.payload, eventId: randomUUID(), nonce: randomUUID(), packageDigest: 'f'.repeat(64) });
    report.conflictPacket = signed({ ...packet.payload, eventId: randomUUID(), nonce: randomUUID(), assignmentId: randomUUID(), executor: { ...packet.payload.executor, label: 'Different customer choice' } });
    report.assurance = 'tested';
    return report;
  } catch (error) { return { ...report, failure: error && typeof error === 'object' && 'code' in error ? String(error.code) : 'fixture_failure', failureStage: stage }; }
  finally { await pool.end(); }
}
