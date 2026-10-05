import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { byteHash, contentHash } from '../../../packages/contracts/hash.js';
import { PUBLISHED_TASK_DDL } from '../tasks/ddl.js';
import { SqlAssignmentStore, SqlDefectReportStore, SqlReservationStore, REQUESTED_RESERVATION_DDL } from './reservation-sql.js';
import { tokenHash } from './assignments.js';
import { ASSIGNMENT_COMMAND_DDL } from './assignment-receiver.js';

interface FixtureInput {
  contract: unknown;
  listing: unknown;
}

function faultOf(reason: unknown): string {
  const candidate = reason as { code?: unknown };
  return typeof candidate?.code === 'string' ? candidate.code : 'unexpected';
}

/**
 * Container-side durable acceptance fixture (M6.2). An isolated synthetic
 * external PostgreSQL database carries the ten foundation tables, the M6.1
 * published tables and the requested reservation DDL; two real concurrent
 * connections race to reserve, and frozen-expiry/reactivity/supersession/
 * defect-idempotency are observed on real rows. Structural rows only — never
 * an approved release, runnable job or customer data.
 */
export async function runReservationPersistenceFixture(input: FixtureInput): Promise<Record<string, unknown>> {
  const database = `synthetic_reservations_${randomBytes(16).toString('hex')}`;
  assert.match(database, /^synthetic_reservations_[a-f0-9]{32}$/);
  const configuration = { host: process.env.EXTERNAL_DATABASE_HOST, user: process.env.EXTERNAL_DATABASE_USER, password: readFileSync(process.env.EXTERNAL_DATABASE_PASSWORD_FILE!, 'utf8').trim(), max: 4 };
  const admin = new Pool({ ...configuration, database: process.env.EXTERNAL_DATABASE_NAME });
  await admin.query(`CREATE DATABASE "${database}"`);
  await admin.end();
  const pool = new Pool({ ...configuration, database });
  const report: Record<string, unknown> = { assurance: 'unverified', database, realCustomerData: false, candidateExecution: false, integratedIntoRuntime: false };
  let stage = 'migrations';
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: 'db/migrations' });
    await migrate(db, { migrationsFolder: 'db/migrations' });
    report.migrationReplay = true;
    if (!(await pool.query("SELECT to_regclass('external_published_tasks') AS table_name")).rows[0].table_name) {
      await pool.query(PUBLISHED_TASK_DDL);
      report.supplementalM61Ddl = true;
    }
    assert.equal(readFileSync('db/migrations/0005_reservations_assignments.sql', 'utf8'), REQUESTED_RESERVATION_DDL + ASSIGNMENT_COMMAND_DDL, 'migration 0005 must stay byte-identical to the module DDL');
    report.requestedDdlApplied = true;
    stage = 'synthetic_binding';
    const contributorId = randomUUID(), strangerId = randomUUID();
    for (const id of [contributorId, strangerId]) await pool.query('INSERT INTO external_accounts (id,username,password_hash) VALUES ($1,$2,$3)', [id, `synthetic.portal.${id.slice(0, 8)}`, 'synthetic-unused-password-hash']);
    const contract = input.contract as { taskId: string; version: number; lineageId: string; terms: { reservationDurationSeconds: number } };
    const transport = Buffer.from('opaque synthetic structural transport; never executed');
    const digest = byteHash(transport), eventId = randomUUID();
    await pool.query('INSERT INTO external_bridge_claims (event_id,nonce,payload_hash,task_id,task_version,manifest_hash,expires_at) VALUES ($1,$2,$3,$4,$5,$6,now()+interval \'1 minute\')', [eventId, randomUUID(), digest, contract.taskId, contract.version, digest]);
    await pool.query('INSERT INTO external_published_tasks (event_id,task_id,lineage_id,version,manifest_hash,payload_hash,package_sha256,package_byte_size,package_bytes,contract,listing,manifest) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [eventId, contract.taskId, contract.lineageId, contract.version, digest, digest, digest, transport.length, transport, JSON.stringify(input.contract), JSON.stringify(input.listing), JSON.stringify({ syntheticStructuralFixture: true })]);
    await pool.query('INSERT INTO external_task_lineages (id) VALUES ($1)', [contract.lineageId]);
    await pool.query('INSERT INTO external_task_versions (id,version,lineage_id,package_hash,contract,listing,envelope) VALUES ($1,$2,$3,$4,$5,$6,$7)', [contract.taskId, contract.version, contract.lineageId, digest, JSON.stringify(input.contract), JSON.stringify(input.listing), JSON.stringify({ syntheticStructuralBinding: true })]);
    stage = 'assignment';
    const assignments = new SqlAssignmentStore(pool), reservations = new SqlReservationStore(pool), defects = new SqlDefectReportStore(pool);
    const now = Date.now(), contributor = { id: contributorId, role: 'contributor' as const }, owner = { id: randomUUID(), role: 'owner' as const };
    const assignment = await assignments.chooseExecutor({ taskId: contract.taskId, taskVersion: contract.version, executor: { kind: 'human', label: 'Synthetic contributor (durable component)', contributorId }, chosenBy: 'synthetic-customer-owner' }, now);
    report.assignmentBound = assignment.executor.kind === 'human' && assignment.status === 'open';
    const token = randomBytes(32).toString('hex');
    await assignments.applyInvitation(assignment.id, { contributorId, tokenHash: tokenHash(token), expiresAt: new Date(now + 3600_000).toISOString() }, now);
    report.invitationIssued = (await pool.query('SELECT count(*)::int AS n FROM external_task_invitations WHERE assignment_id=$1', [assignment.id])).rows[0].n === 1;
    await assignments.recordRedemption(token, contributorId, now);
    report.redemptionBound = await assignments.runtimeContributorBinding(contract.taskId, contract.version, contributorId, now) === 'redeemed';
    report.redemptionDeadlineNotReservationDeadline = await assignments.runtimeContributorBinding(contract.taskId, contract.version, contributorId, now + 3600_001) === 'redeemed';
    report.reissueDenied = await assignments.applyInvitation(assignment.id, { contributorId, tokenHash: tokenHash(randomBytes(32).toString('hex')), expiresAt: new Date(now + 3600_000).toISOString() }, now).then(() => false, error => faultOf(error) === 'invitation_denied');
    stage = 'reservation_race';
    const inputTask = { taskId: contract.taskId, taskVersion: contract.version };
    const race = await Promise.allSettled([reservations.reserve(contributor, inputTask, now), reservations.reserve(contributor, inputTask, now)]);
    const winners = race.filter(result => result.status === 'fulfilled'), losers = race.filter(result => result.status === 'rejected');
    report.concurrentOneWinner = winners.length === 1 && losers.length === 1 && faultOf((losers[0] as PromiseRejectedResult)?.reason) === 'already_reserved';
    assert.equal(report.concurrentOneWinner, true);
    const reservation = (winners[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof reservations.reserve>>>).value;
    report.liveReservations = (await pool.query("SELECT count(*)::int AS n FROM external_reservations WHERE task_id=$1 AND task_version=$2 AND state IN ('active','in_review')", [contract.taskId, contract.version])).rows[0].n;
    report.guessedSafe = await reservations.reservation(contributor, randomUUID(), now).then(() => false, error => faultOf(error) === 'not_found');
    report.foreignReservationDenied = await reservations.reservation({ id: strangerId, role: 'contributor' }, reservation.id, now).then(() => false, error => faultOf(error) === 'not_found');
    stage = 'defects';
    const defectInput = { ...inputTask, reservationId: reservation.id, category: 'missing_context', description: 'The synthetic package is missing its approved start instructions.', idempotencyKey: randomUUID() };
    const defect = await defects.file(contributor, defectInput, now + 1);
    report.defectAccepted = defect.reservationId === reservation.id && defect.category === 'missing_context';
    const retry = await defects.file(contributor, defectInput, now + 2);
    report.defectIdempotent = retry.id === defect.id && (await defects.listOwn(contributor, reservation.id, now)).length === 1;
    report.defectConflictDenied = await defects.file(contributor, { ...defectInput, description: 'A different defect with the same idempotency key.' }, now + 3).then(() => false, error => faultOf(error) === 'invalid_input');
    report.foreignDefectsDenied = await defects.listOwn({ id: strangerId, role: 'contributor' }, reservation.id, now).then(() => false, error => faultOf(error) === 'not_found');
    report.defectExpiredWithoutSweep = await defects.file(contributor, { ...defectInput, idempotencyKey: randomUUID() }, Date.parse(reservation.expiresAt)).then(() => false, error => faultOf(error) === 'reservation_expired');
    stage = 'lifecycle';
    const attemptA = randomUUID(), attemptB = randomUUID();
    const inReview = await reservations.submitForReview(contributor, { reservationId: reservation.id, submissionId: attemptA, expectedVersion: reservation.version }, now + 1_000);
    report.uploadToInReview = inReview.state === 'in_review';
    report.expiryFrozen = inReview.expiresAt === reservation.expiresAt && inReview.terms.termsHash === contentHash(contract.terms);
    const reactivated = await reservations.changesRequired(owner, { reservationId: reservation.id, expectedVersion: inReview.version }, now + 2_000);
    report.reactivationReactivates = reactivated.state === 'active';
    report.reactivationPreservesExpiry = reactivated.expiresAt === reservation.expiresAt && contentHash(reactivated.terms) === contentHash(reservation.terms);
    const again = await reservations.submitForReview(contributor, { reservationId: reservation.id, submissionId: attemptB, expectedVersion: reactivated.version }, now + 3_000);
    report.resubmissionSupersedes = again.state === 'in_review';
    report.staleAttemptRejected = await reservations.accept(owner, { reservationId: reservation.id, submissionId: attemptA, expectedVersion: again.version }, now + 4_000).then(() => false, error => faultOf(error) === 'stale_submission');
    const accepted = await reservations.accept(owner, { reservationId: reservation.id, submissionId: attemptB, expectedVersion: again.version }, now + 5_000);
    report.latestAttemptAccepted = accepted.state === 'accepted';
    report.acceptancePreservesExpiry = accepted.expiresAt === reservation.expiresAt;
    report.attemptRows = (await pool.query('SELECT count(*)::int AS n FROM external_reservation_attempts WHERE reservation_id=$1', [reservation.id])).rows[0].n;
    stage = 'immutability';
    const assignmentGuard = await rejectedUpdate(pool, 'UPDATE external_task_assignments SET executor_label=$2 WHERE id=$1', [assignment.id, 'Changed label']);
    const defectGuard = await rejectedUpdate(pool, 'UPDATE external_package_defect_reports SET description=$2 WHERE id=$1', [defect.id, 'Changed description']);
    report.immutableGuards = assignmentGuard && defectGuard;
    report.termsFrozen = await rejectedUpdate(pool, "UPDATE external_reservations SET expires_at=expires_at+interval '1 hour',version=version+1 WHERE id=$1", [reservation.id]);
    report.assurance = 'tested';
    return report;
  } catch (error) {
    report.failure = faultOf(error);
    report.failureStage = stage;
    return report;
  } finally { await pool.end(); }
}

async function rejectedUpdate(pool: Pool, sql: string, values: unknown[]) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    try { await client.query(sql, values); return false; } catch { return true; }
  } finally { await client.query('ROLLBACK'); client.release(); }
}
