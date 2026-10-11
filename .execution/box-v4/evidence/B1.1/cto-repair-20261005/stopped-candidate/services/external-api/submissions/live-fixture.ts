import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { byteHash, contentHash } from '../../../packages/contracts/hash.js';
import type { ExternalTaskContract } from '../../../packages/contracts/public/index.js';
import { EXTERNAL_SUBMISSION_EXPORT_DDL, LINEAGE_ATTEMPT_CAP, SqlSubmissionStore } from './store.js';
import { SubmissionExportReceiver } from './export-receiver.js';
import { signPayload } from './protocol.js';

function faultOf(reason: unknown): string {
  const candidate = reason as { code?: unknown; message?: unknown; cause?: unknown; constraint?: unknown };
  if (typeof candidate?.code === 'string') {
    const cause = (candidate.cause as { message?: unknown; constraint?: unknown } | undefined);
    const detail = typeof cause?.constraint === 'string' ? cause.constraint : typeof cause?.message === 'string' ? cause.message.slice(0, 160) : typeof candidate.constraint === 'string' ? candidate.constraint : '';
    return detail ? `${candidate.code}:${detail}` : candidate.code;
  }
  return typeof candidate?.message === 'string' ? candidate.message.slice(0, 160) : 'unexpected';
}

function patchFor(path: string): Uint8Array {
  const text = [
    `diff --git a/${path} b/${path}`,
    'index 1111111..2222222 100644',
    `--- a/${path}`,
    `+++ b/${path}`,
    '@@ -1,3 +1,3 @@',
    ' keep()',
    '-const selection = "old";',
    '+const selection = "new";',
    ' done()',
    '',
  ].join('\n');
  return Buffer.from(text, 'utf8');
}

/**
 * Container-side durable acceptance fixture (M6.3). An isolated synthetic
 * external PostgreSQL database carries all forward migrations; the real
 * atomic intake transaction is exercised for binding, patch policy,
 * idempotency, concurrency and all three budget counters, plus the signed
 * pull/ack export flow. No candidate byte is executed anywhere.
 */
export async function runSubmissionIntakeFixture(input: { contract: unknown; listing: unknown }): Promise<Record<string, unknown>> {
  const database = `synthetic_submissions_${randomBytes(16).toString('hex')}`;
  const configuration = { host: process.env.EXTERNAL_DATABASE_HOST, user: process.env.EXTERNAL_DATABASE_USER, password: readFileSync(process.env.EXTERNAL_DATABASE_PASSWORD_FILE!, 'utf8').trim(), max: 8 };
  const admin = new Pool({ ...configuration, database: process.env.EXTERNAL_DATABASE_NAME });
  await admin.query(`CREATE DATABASE "${database}"`);
  await admin.end();
  const pool = new Pool({ ...configuration, database });
  const report: Record<string, unknown> = { assurance: 'unverified', database, realCustomerData: false, candidateExecution: false };
  let stage = 'migrations';
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: 'db/migrations' });
    await migrate(db, { migrationsFolder: 'db/migrations' });
    report.migrationReplay = true;
    assert.equal(readFileSync('db/migrations/0006_submission_export.sql', 'utf8'), EXTERNAL_SUBMISSION_EXPORT_DDL, 'migration 0006 must stay byte-identical to the module DDL');
    report.requestedDdlApplied = true;

    stage = 'seed';
    const contract = input.contract as ExternalTaskContract;
    const editable = contract.workUnits.flatMap(unit => unit.editablePaths);
    const packageHash = byteHash(Buffer.from('synthetic package bytes; never executed'));
    const digest = byteHash(Buffer.from('synthetic manifest'));
    const contributorId = randomUUID(), strangerId = randomUUID();
    for (const id of [contributorId, strangerId]) {
      await pool.query('INSERT INTO external_accounts (id,username,password_hash) VALUES ($1,$2,$3)', [id, `synthetic.sub.${id.slice(0, 8)}`, 'synthetic-unused-password-hash']);
    }
    const eventId = randomUUID();
    await pool.query(`INSERT INTO external_bridge_claims (event_id,nonce,payload_hash,task_id,task_version,manifest_hash,expires_at) VALUES ($1,$2,$3,$4,$5,$6,now()+interval '1 hour')`, [eventId, randomUUID(), digest, contract.taskId, contract.version, digest]);
    await pool.query('INSERT INTO external_published_tasks (event_id,task_id,lineage_id,version,manifest_hash,payload_hash,package_sha256,package_byte_size,package_bytes,contract,listing,manifest) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [eventId, contract.taskId, contract.lineageId, contract.version, digest, digest, packageHash, 32, Buffer.alloc(32), JSON.stringify(contract), JSON.stringify(input.listing), JSON.stringify({ synthetic: true })]);
    await pool.query('INSERT INTO external_task_lineages (id) VALUES ($1)', [contract.lineageId]);
    await pool.query('INSERT INTO external_task_versions (id,version,lineage_id,package_hash,contract,listing,envelope) VALUES ($1,$2,$3,$4,$5,$6,$7)', [contract.taskId, contract.version, contract.lineageId, packageHash, JSON.stringify(contract), JSON.stringify(input.listing), JSON.stringify({ synthetic: true })]);
    // One live reservation per task+version is the product invariant
    // (external_one_live_reservation). Retiring the previous live row to a
    // terminal state is the honest synthetic lifecycle when the fixture needs
    // a fresh reservation on the same task.
    const seedReservation = async (contributor: string, lifetime = '1 hour') => {
      await pool.query(
        `UPDATE external_reservations SET state='cancelled', version=version+1
         WHERE task_id=$1 AND task_version=$2 AND state IN ('active','in_review')`,
        [contract.taskId, contract.version],
      );
      const id = randomUUID();
      await pool.query(
        `INSERT INTO external_reservations (id,task_id,task_version,package_hash,contributor_id,terms_hash,state,expires_at,version,evaluated_attempts)
         VALUES ($1,$2,$3,$4,$5,$6,'active',now()+$7::interval,1,0)`,
        [id, contract.taskId, contract.version, packageHash, contributor, digest, lifetime],
      );
      return id;
    };
    const reservationId = await seedReservation(contributorId);

    stage = 'intake';
    const permitKeys = generateKeyPairSync('ed25519');
    const store = new SqlSubmissionStore(pool, permitKeys.privateKey);
    const base = { contributorId, taskId: contract.taskId, taskVersion: contract.version, packageHash };
    const patchBytes = patchFor(editable[0]!);

    const created = await store.submit({ ...base, reservationId, idempotencyKey: randomUUID(), patchBytes });
    report.created = created.status === 'created' && created.submission.state === 'received';
    report.permitSigned = typeof created.permit.signature === 'string' && created.permit.submissionHash === byteHash(patchBytes) && created.permit.packageDigest === packageHash;
    const counters = await pool.query<{ evaluated_attempts: number; state: string }>(`SELECT evaluated_attempts,state FROM external_reservations WHERE id=$1`, [reservationId]);
    report.atomicSpend = counters.rows[0]!.evaluated_attempts === 1 && counters.rows[0]!.state === 'in_review';
    report.lineageSpent = (await pool.query<{ evaluated_attempts: number }>(`SELECT evaluated_attempts FROM external_task_lineages WHERE id=$1`, [contract.lineageId])).rows[0]!.evaluated_attempts === 1;
    report.workspaceSpent = (await pool.query(`SELECT count(*)::int AS n FROM external_workspace_attempts`)).rows[0]!.n === 1;
    report.outboxCommitted = (await pool.query(`SELECT count(*)::int AS n FROM external_attempt_outbox WHERE permit_id=$1 AND delivered_at IS NULL`, [created.permit.permitId])).rows[0]!.n === 1;

    stage = 'idempotency';
    const dupKey = randomUUID();
    const reactivate = async (id: string) => {
      await pool.query(
        `UPDATE external_reservations SET state='cancelled', version=version+1
         WHERE task_id=$1 AND task_version=$2 AND state IN ('active','in_review') AND id<>$3`,
        [contract.taskId, contract.version, id],
      );
      await pool.query(`UPDATE external_reservations SET state='active', version=version+1 WHERE id=$1`, [id]);
    };
    // A same-key replay while the reservation is in_review still resolves to the
    // committed attempt, because idempotency is checked before state gating on
    // the replayed key — verified by submitting the same key again after
    // reactivation.
    await reactivate(reservationId);
    const first = await store.submit({ ...base, reservationId, idempotencyKey: dupKey, patchBytes });
    await reactivate(reservationId);
    const replay = await store.submit({ ...base, reservationId, idempotencyKey: dupKey, patchBytes });
    report.idempotentDuplicate = replay.status === 'duplicate' && replay.submission.id === first.submission.id;
    report.singleAttemptForKey = (await pool.query(`SELECT count(*)::int AS n FROM external_submissions WHERE idempotency_key=$1`, [dupKey])).rows[0]!.n === 1;
    // The key is scoped per contributor: replayed against a different owned
    // reservation it conflicts rather than resolving.
    const conflictRes = await seedReservation(contributorId);
    report.crossReservationKeyDenied = await store.submit({ ...base, reservationId: conflictRes, idempotencyKey: dupKey, patchBytes }).then(() => false, faultOf) === 'idempotency_conflict';

    stage = 'rejection';
    // `cancelled` is terminal in the lifecycle guard — the reservation retired
    // by seedReservation can never be revived. conflictRes is the live,
    // contributor-owned active reservation for the rest of the flow.
    report.forgedBaseDenied = await store.submit({ ...base, reservationId: conflictRes, packageHash: byteHash(Buffer.from('forged')), idempotencyKey: randomUUID(), patchBytes }).then(() => false, faultOf);
    report.wrongVersionDenied = await store.submit({ ...base, reservationId: conflictRes, taskVersion: contract.version + 1, idempotencyKey: randomUUID(), patchBytes }).then(() => false, faultOf);
    report.foreignReservationDenied = await store.submit({ ...base, contributorId: strangerId, reservationId: conflictRes, idempotencyKey: randomUUID(), patchBytes }).then(() => false, faultOf);
    report.traversalDenied = await store.submit({ ...base, reservationId: conflictRes, idempotencyKey: randomUUID(), patchBytes: patchFor('src/../../etc/passwd') }).then(() => false, faultOf);
    report.evaluatorPathDenied = await store.submit({ ...base, reservationId: conflictRes, idempotencyKey: randomUUID(), patchBytes: patchFor('tests/harness/evaluator.ts') }).then(() => false, faultOf);
    report.outsideAllowlistDenied = await store.submit({ ...base, reservationId: conflictRes, idempotencyKey: randomUUID(), patchBytes: patchFor('src/other.ts') }).then(() => false, faultOf);
    report.malformedDenied = await store.submit({ ...base, reservationId: conflictRes, idempotencyKey: randomUUID(), patchBytes: Buffer.from('not a diff') }).then(() => false, faultOf);
    report.oversizeDenied = await store.submit({ ...base, reservationId: conflictRes, idempotencyKey: randomUUID(), patchBytes: Buffer.alloc(1_048_577, 0x41) }).then(() => false, faultOf);
    report.rejectionUnspent = (await pool.query<{ evaluated_attempts: number }>(`SELECT evaluated_attempts FROM external_reservations WHERE id=$1`, [conflictRes])).rows[0]!.evaluated_attempts === 0;

    stage = 'budget';
    // Reservation cap is contract-frozen at 3 evaluated attempts; spend all
    // three on conflictRes then expect the fourth to be denied.
    for (let spend = 0; spend < 3; spend += 1) {
      await reactivate(conflictRes);
      await store.submit({ ...base, reservationId: conflictRes, idempotencyKey: randomUUID(), patchBytes });
    }
    await reactivate(conflictRes);
    report.reservationBudgetDenied = await store.submit({ ...base, reservationId: conflictRes, idempotencyKey: randomUUID(), patchBytes }).then(() => false, faultOf);
    // Lineage cap: set counter just below the cap across versions/contributors.
    await pool.query(`UPDATE external_task_lineages SET evaluated_attempts=$1 WHERE id=$2`, [LINEAGE_ATTEMPT_CAP - 1, contract.lineageId]);
    const freshRes = await seedReservation(strangerId);
    const lineageWinner = await store.submit({ contributorId: strangerId, reservationId: freshRes, taskId: contract.taskId, taskVersion: contract.version, packageHash, idempotencyKey: randomUUID(), patchBytes }).then(() => 'ok', faultOf);
    await reactivate(freshRes).catch(() => undefined);
    const lineageLoser = await store.submit({ contributorId: strangerId, reservationId: freshRes, taskId: contract.taskId, taskVersion: contract.version, packageHash, idempotencyKey: randomUUID(), patchBytes }).then(() => false, faultOf);
    report.lineageBudgetEnforced = lineageWinner === 'ok' && lineageLoser === 'attempt_budget_exceeded';

    stage = 'concurrency';
    // The lineage budget was deliberately exhausted above; reset the shared
    // counter so the concurrency race exercises the reservation lock and
    // idempotency path rather than the lineage cap.
    await pool.query(`UPDATE external_task_lineages SET evaluated_attempts=0 WHERE id=$1`, [contract.lineageId]);
    const raceRes = await seedReservation(contributorId);
    const raceKey = randomUUID();
    const race = await Promise.allSettled([
      store.submit({ ...base, reservationId: raceRes, idempotencyKey: raceKey, patchBytes }),
      store.submit({ ...base, reservationId: raceRes, idempotencyKey: raceKey, patchBytes }),
    ]);
    const outcomes = race.map(result => (result.status === 'fulfilled' ? result.value.status : faultOf(result.reason)));
    report.sameKeyOutcomes = outcomes;
    report.concurrentSameKeyOneAttempt = outcomes.filter(outcome => outcome === 'created').length === 1 && outcomes.filter(outcome => outcome === 'duplicate').length === 1;
    report.sameKeyRowCount = (await pool.query(`SELECT count(*)::int AS n FROM external_submissions WHERE reservation_id=$1`, [raceRes])).rows[0]!.n;
    report.concurrentAttemptsCount = report.sameKeyRowCount === 1;
    const raceRes2 = await seedReservation(contributorId);
    const race2 = await Promise.allSettled([
      store.submit({ ...base, reservationId: raceRes2, idempotencyKey: randomUUID(), patchBytes }),
      store.submit({ ...base, reservationId: raceRes2, idempotencyKey: randomUUID(), patchBytes }),
    ]);
    const outcomes2 = race2.map(result => (result.status === 'fulfilled' ? result.value.status : faultOf(result.reason)));
    report.distinctKeyOutcomes = outcomes2;
    report.concurrentDistinctKeysSerialized = outcomes2.filter(outcome => outcome === 'created').length === 1 && (await pool.query(`SELECT count(*)::int AS n FROM external_submissions WHERE reservation_id=$1`, [raceRes2])).rows[0]!.n === 1;

    stage = 'expiry';
    const expiring = await seedReservation(contributorId, '50 milliseconds');
    await new Promise(resolve => setTimeout(resolve, 150));
    report.expiredDenied = await store.submit({ ...base, reservationId: expiring, idempotencyKey: randomUUID(), patchBytes }).then(() => false, faultOf);

    stage = 'export';
    const importKeys = generateKeyPairSync('ed25519');
    const receiver = new SubmissionExportReceiver(store, importKeys.publicKey);
    const pull = () => signPayload({ schemaVersion: 1, audience: 'external-submission-export/v1', eventId: randomUUID(), nonce: randomUUID(), issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString() }, importKeys.privateKey);
    const drained: string[] = [];
    let exportResult: Awaited<ReturnType<typeof receiver.receive>> | null = null;
    for (let i = 0; i < 8; i += 1) {
      const result = await receiver.receive(pull());
      if (result.status === 'empty') break;
      if (result.status !== 'export' || !result.export) break;
      exportResult = result;
      drained.push(result.export.permitId);
      const permitPacket = (result.export.payload as { permit: unknown }).permit;
      const ack = signPayload({ schemaVersion: 1, audience: 'external-submission-export-ack/v1', eventId: randomUUID(), nonce: randomUUID(), permitId: result.export.permitId, payloadHash: contentHash(permitPacket), issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString() }, importKeys.privateKey);
      await receiver.receive(ack);
    }
    report.exportsDrained = drained.length >= 4;
    const after = await receiver.receive(pull());
    report.pullEmptyAfterAcks = after.status === 'empty';
    const wrongKeyPull = signPayload({ schemaVersion: 1, audience: 'external-submission-export/v1', eventId: randomUUID(), nonce: randomUUID(), issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString() }, generateKeyPairSync('ed25519').privateKey);
    report.forgedPullDenied = await receiver.receive(wrongKeyPull).then(() => false, faultOf);
    report.exportBinding = exportResult !== null && (exportResult.export?.payload as { submission?: { patchBase64?: string } }).submission?.patchBase64 === Buffer.from(patchBytes).toString('base64');
    report.assurance = 'tested';
    return report;
  } catch (error) {
    report.failure = faultOf(error);
    report.failureStage = stage;
    return report;
  } finally {
    await pool.end();
  }
}
