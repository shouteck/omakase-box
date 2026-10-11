import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { canonicalize } from '../../../packages/contracts/hash.js';
import { signAssignmentReceipt, type ReceiptCommand } from '../../external-api/reservations/assignment-receipt.js';
import { verifyAssignmentCommand } from '../../external-api/reservations/assignment-protocol.js';
import { PrivateAssignmentStore, PRIVATE_ASSIGNMENT_DDL } from './store.js';
import { AssignmentDeliveryStore, ASSIGNMENT_DELIVERY_DDL, type AssignmentDeliveryClaim } from './delivery.js';

const codeOf = (error: unknown) => error && typeof error === 'object' && 'code' in error ? String(error.code) : 'fixture_failure';
export async function runAssignmentDeliveryFixture() {
  const database = `synthetic_delivery_${randomBytes(16).toString('hex')}`;
  assert.match(database,/^synthetic_delivery_[a-f0-9]{32}$/);
  const configuration = { host: process.env.PRIVATE_DATABASE_HOST, user: process.env.PRIVATE_DATABASE_USER, password: readFileSync(process.env.PRIVATE_DATABASE_PASSWORD_FILE!,'utf8').trim(), max: 4 };
  const admin = new Pool({ ...configuration, database: process.env.PRIVATE_DATABASE_NAME });
  await admin.query(`CREATE DATABASE "${database}"`); await admin.end();
  const pool = new Pool({ ...configuration, database });
  const report: Record<string, unknown> = { assurance: 'unverified', database, externalReceiptMocked: true, realReadinessVerified: false, candidateExecution: false, expirationClockInjected: true };
  let stage = 'schema';
  try {
    assert.equal(readFileSync('db/migrations/0008_assignment_delivery.sql','utf8'), PRIVATE_ASSIGNMENT_DDL + ASSIGNMENT_DELIVERY_DDL, 'migration 0008 must stay byte-identical to the module DDL');
    await migrate(drizzle(pool),{ migrationsFolder: 'db/migrations' });
    const ownerId = randomUUID(), actor = { id: ownerId, role: 'owner' as const, sessionHash: 'a'.repeat(64), csrfHash: 'b'.repeat(64) };
    await pool.query("INSERT INTO private_accounts (id,username,password_hash,role) VALUES ($1,'synthetic.delivery.owner','unused-synthetic-password-hash','owner')",[ownerId]);
    await pool.query("INSERT INTO private_sessions (token_hash,account_id,csrf_hash,expires_at) VALUES ($1,$2,$3,now()+interval '1 hour')",[actor.sessionHash,ownerId,actor.csrfHash]);
    const signing = generateKeyPairSync('ed25519'), external = generateKeyPairSync('ed25519');
    let offset = 0, ready = true, drift = false;
    const clock = () => Date.now()+offset;
    const gate = async (_client: unknown, taskId: string, taskVersion: number) => ({ taskId, taskVersion, packageDigest: (drift ? 'd' : 'c').repeat(64), ready });
    const choices = new PrivateAssignmentStore(pool,signing.privateKey,gate);
    const delivery = new AssignmentDeliveryStore(pool,signing.privateKey,external.publicKey,gate,clock);
    const enqueue = () => choices.choose(actor,{ taskId: randomUUID(), taskVersion: 1, packageDigest: 'c'.repeat(64), idempotencyKey: randomUUID(), executor: { kind: 'team', label: 'Synthetic customer-selected team' } });
    const receipt = (claim: AssignmentDeliveryClaim) => signAssignmentReceipt(claim.packet.payload as ReceiptCommand,{ assignmentId: (claim.packet.payload as ReceiptCommand).assignmentId, taskId: (claim.packet.payload as ReceiptCommand).taskId, taskVersion: (claim.packet.payload as ReceiptCommand).taskVersion, status: 'recorded', duplicate: false },external.privateKey,clock());
    const pending = async () => (await pool.query('SELECT count(*)::int AS n FROM private_assignment_outbox WHERE delivered_at IS NULL')).rows[0].n;
    const rejectsMutation = async (sql: string, values: unknown[]) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        try { await client.query(sql,values); return false; }
        catch (error) { return codeOf(error) === 'P0001'; }
      } finally { await client.query('ROLLBACK'); client.release(); }
    };
    stage = 'claim_race';
    await enqueue();
    const race = await Promise.all([delivery.claim(),delivery.claim()]);
    report.concurrentOneLease = race.filter(Boolean).length === 1;
    assert.equal(report.concurrentOneLease,true);
    const first = race.find(Boolean)!;
    offset += 30001;
    const second = (await delivery.claim())!;
    report.crashReusesPacket = canonicalize(first.packet) === canonicalize(second.packet) && first.token !== second.token;
    report.staleLeaseDenied = await delivery.acknowledge(first,receipt(first)).then(() => false,error => codeOf(error) === 'lease_lost');
    report.staleReleaseDenied = await delivery.release(first) === false;
    report.unsignedReceiptDenied = await delivery.acknowledge(second,receipt(second).payload).then(() => false,error => codeOf(error) === 'delivery_unverified');
    report.pendingBeforeAck = await pending() === 1;
    const ack = await delivery.acknowledge(second,receipt(second));
    report.acknowledgedOnce = ack.status === 'delivered' && await pending() === 0 && (await pool.query('SELECT count(*)::int AS n FROM private_assignment_delivery_attempts WHERE receipt IS NOT NULL')).rows[0].n === 1;
    report.duplicateAckIdempotent = (await delivery.acknowledge(second,receipt(second))).duplicate === true;
    report.attemptHistoryImmutable = await rejectsMutation('UPDATE private_assignment_delivery_attempts SET packet=jsonb_set(packet,\'{payload,executor,label}\',\'"Changed executor"\') WHERE event_id=$1',[second.packet.payload.eventId]);
    report.receiptHistoryImmutable = await rejectsMutation('UPDATE private_assignment_delivery_attempts SET receipt=jsonb_set(receipt,\'{payload,duplicate}\',\'true\') WHERE event_id=$1',[second.packet.payload.eventId]);
    report.outboxHistoryImmutable = await rejectsMutation('UPDATE private_assignment_outbox SET delivered_at=NULL WHERE event_id=$1',[second.outboxEventId]);
    stage = 'expired_frame';
    const choice = await enqueue();
    const original = (await pool.query('SELECT packet FROM private_assignment_outbox WHERE assignment_id=$1',[choice.id])).rows[0].packet;
    const prior = (await delivery.claim())!;
    offset += 300001;
    const renewed = (await delivery.claim())!;
    report.expiredFrameRenewed = renewed.packet.payload.eventId !== prior.packet.payload.eventId && verifyAssignmentCommand(renewed.packet,signing.publicKey,clock()).assignmentId === choice.id;
    const { eventId: _event,nonce: _nonce,issuedAt: _issued,expiresAt: _expires,...facts } = renewed.packet.payload;
    const { eventId: _oldEvent,nonce: _oldNonce,issuedAt: _oldIssued,expiresAt: _oldExpires,...oldFacts } = original.payload;
    report.originalChoiceUnchanged = canonicalize(facts) === canonicalize(oldFacts) && canonicalize((await pool.query('SELECT packet FROM private_assignment_outbox WHERE assignment_id=$1',[choice.id])).rows[0].packet) === canonicalize(original);
    const wrong = generateKeyPairSync('ed25519');
    const forged = signAssignmentReceipt(renewed.packet.payload as ReceiptCommand,{ assignmentId: choice.id, taskId: (renewed.packet.payload as ReceiptCommand).taskId, taskVersion: 1, status: 'recorded', duplicate: false },wrong.privateKey,clock());
    report.wrongReceiptDenied = await delivery.acknowledge(renewed,forged).then(() => false,error => codeOf(error) === 'delivery_unverified');
    await delivery.release(renewed);
    stage = 'authority_and_readiness';
    report.missingReadinessDenied = await new AssignmentDeliveryStore(pool,signing.privateKey,external.publicKey).claim().then(() => false,error => codeOf(error) === 'readiness_unavailable');
    drift = true;
    report.changedReadinessDenied = await delivery.claim().then(() => false,error => codeOf(error) === 'binding_drift');
    drift = false;
    await pool.query('UPDATE private_accounts SET disabled=true WHERE id=$1',[ownerId]);
    report.disabledOwnerSkipped = await delivery.claim() === null;
    await pool.query('UPDATE private_accounts SET disabled=false WHERE id=$1',[ownerId]);
    stage = 'transport_failure';
    const failed = await delivery.dispatchOne({ send: async () => { throw new Error('SYNTHETIC_PRIVATE_TRANSPORT_CANARY'); } });
    report.transportFailurePending = failed.status === 'retryable' && await pending() === 1 && !JSON.stringify(failed).includes('SYNTHETIC_PRIVATE_TRANSPORT_CANARY');
    stage = 'transport_timeout';
    const start = Date.now();
    const timeout = await delivery.dispatchOne({ send: () => new Promise<never>(() => {}) });
    report.transportTimeoutPending = timeout.status === 'retryable' && await pending() === 1 && Date.now()-start < 20000;
    stage = 'cancellation';
    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    let sent = false;
    const skipped = await delivery.dispatchOne({ send: async () => { sent = true; return {}; } },alreadyAborted.signal);
    report.preCancelledNotSent = skipped.status === 'retryable' && !sent && await pending() === 1;
    const controller = new AbortController();
    const cancelled = await delivery.dispatchOne({ send: () => { setTimeout(() => controller.abort(),5); return new Promise<never>(() => {}); } },controller.signal);
    report.cancellationPending = cancelled.status === 'retryable' && await pending() === 1;
    report.assurance = 'tested';
    return report;
  } catch (error) { return { ...report, failure: codeOf(error), failureMessage: error instanceof Error ? error.message : String(error), failureStage: stage }; }
  finally { await pool.end(); }
}
