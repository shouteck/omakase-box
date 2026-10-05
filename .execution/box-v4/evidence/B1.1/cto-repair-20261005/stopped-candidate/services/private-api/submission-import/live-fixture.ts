import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { byteHash } from '../../../packages/contracts/hash.js';
import { signAttemptPermit, verifyAttemptPermit, type SignedPermit } from '../../external-api/submissions/protocol.js';
import { PRIVATE_SUBMISSION_IMPORT_DDL, SqlSubmissionImportStore, type ExportRecord } from './store.js';
import { SubmissionImporter, type ImportTransport } from './importer.js';

function faultOf(reason: unknown): string {
  const candidate = reason as { code?: unknown; message?: unknown };
  if (typeof candidate?.code === 'string') return candidate.code;
  return typeof candidate?.message === 'string' ? candidate.message.slice(0, 160) : 'unexpected';
}

function makeExport(permitKey: Parameters<typeof signAttemptPermit>[1], overrides: Partial<{ submissionHash: string; patchBytes: Uint8Array }> = {}) {
  const patchBytes = overrides.patchBytes ?? Buffer.from('diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n');
  const ids = { permitId: randomUUID(), submissionId: randomUUID(), reservationId: randomUUID(), contributorId: randomUUID(), taskId: randomUUID(), lineageId: randomUUID() };
  const taskVersion = 1;
  const packageDigest = byteHash(Buffer.from('synthetic package'));
  const permit: SignedPermit = signAttemptPermit(
    {
      schemaVersion: 1,
      audience: 'private-submission-import/v1',
      ...ids,
      eventId: randomUUID(),
      nonce: randomUUID(),
      taskId: ids.taskId,
      taskVersion,
      packageDigest,
      submissionHash: overrides.submissionHash ?? byteHash(patchBytes),
      attemptSequence: 1,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    },
    permitKey,
  );
  const record: ExportRecord = {
    permit,
    submission: {
      id: ids.submissionId,
      reservationId: ids.reservationId,
      contributorId: ids.contributorId,
      taskId: ids.taskId,
      taskVersion,
      packageHash: packageDigest,
      submissionHash: overrides.submissionHash ?? byteHash(patchBytes),
      patchBase64: Buffer.from(patchBytes).toString('base64'),
    },
  };
  return { record, patchBytes };
}

/**
 * Container-side durable acceptance fixture (M6.3). An isolated synthetic
 * private PostgreSQL database carries all forward migrations; signed-permit
 * import, idempotent replay and crash-safe re-delivery are exercised on real
 * rows. No evaluation job is ever created without a committed permit.
 */
export async function runSubmissionImportFixture(): Promise<Record<string, unknown>> {
  const database = `synthetic_imports_${randomBytes(16).toString('hex')}`;
  const configuration = { host: process.env.PRIVATE_DATABASE_HOST, user: process.env.PRIVATE_DATABASE_USER, password: readFileSync(process.env.PRIVATE_DATABASE_PASSWORD_FILE!, 'utf8').trim(), max: 4 };
  const admin = new Pool({ ...configuration, database: process.env.PRIVATE_DATABASE_NAME });
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
    assert.equal(readFileSync('db/migrations/0009_submission_import.sql', 'utf8'), PRIVATE_SUBMISSION_IMPORT_DDL, 'migration 0009 must stay byte-identical to the module DDL');
    report.requestedDdlApplied = true;

    stage = 'seed';
    const permitKeys = generateKeyPairSync('ed25519');
    const importKeys = generateKeyPairSync('ed25519');
    const store = new SqlSubmissionImportStore(pool);
    const { record, patchBytes } = makeExport(permitKeys.privateKey);

    stage = 'import_without_release';
    report.missingReleaseDenied = await store.importPermit(record, patchBytes).then(() => false, faultOf);
    report.noEvaluationWithoutPermit = (await pool.query(`SELECT count(*)::int AS n FROM private_evaluations`)).rows[0]!.n === 0;

    stage = 'seed_release';
    const baseRevision = byteHash(Buffer.from('synthetic private base revision'));
    const ownerId = randomUUID();
    await pool.query(`INSERT INTO private_accounts (id,username,password_hash,role) VALUES ($1,$2,$3,'owner')`, [ownerId, `synthetic.owner.${ownerId.slice(0, 8)}`, 'synthetic-unused-password-hash']);
    await pool.query(
      `INSERT INTO private_release_approvals (id,task_id,task_version,manifest_hash,manifest,private_revision,owner_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [randomUUID(), record.submission.taskId, record.submission.taskVersion, byteHash(Buffer.from('synthetic manifest')), JSON.stringify({ taskId: record.submission.taskId, version: record.submission.taskVersion }), baseRevision, ownerId],
    );

    stage = 'import';
    const first = await store.importPermit(record, patchBytes);
    report.imported = first.status === 'imported';
    const evaluation = await pool.query<{ state: string; private_base_revision: string; permit_id: string }>(`SELECT state,private_base_revision,permit_id FROM private_evaluations WHERE permit_id=$1`, [record.permit.permitId]);
    report.evaluationBound = evaluation.rows[0]!.state === 'received' && evaluation.rows[0]!.private_base_revision === baseRevision;
    report.importRowCommitted = (await pool.query(`SELECT count(*)::int AS n FROM private_submission_imports WHERE permit_id=$1`, [record.permit.permitId])).rows[0]!.n === 1;
    report.patchStored = byteHash((await pool.query<{ patch: Buffer }>(`SELECT patch FROM private_submission_imports WHERE permit_id=$1`, [record.permit.permitId])).rows[0]!.patch) === byteHash(patchBytes);

    stage = 'replay';
    const second = await store.importPermit(record, patchBytes);
    report.replayIdempotent = second.status === 'duplicate' && second.evaluationId === first.evaluationId;
    report.singleEvaluation = (await pool.query(`SELECT count(*)::int AS n FROM private_evaluations`)).rows[0]!.n === 1;
    const tamperedPermit = { ...record.permit, submissionHash: byteHash(Buffer.from('tampered')) };
    const forgedResult = await (async () => {
      try { verifyAttemptPermit(tamperedPermit, permitKeys.publicKey); return 'ok'; } catch (error) { return faultOf(error); }
    })();
    report.forgedPermitDenied = forgedResult === 'invalid_permit';
    const mismatched = makeExport(permitKeys.privateKey);
    const mismatchedRecord: ExportRecord = { ...mismatched.record, submission: { ...mismatched.record.submission, submissionHash: byteHash(Buffer.from('different')) } };
    report.bindingMismatchDenied = await store.importPermit(mismatchedRecord, Buffer.from(mismatchedRecord.submission.patchBase64, 'base64')).then(() => false, faultOf);

    stage = 'importer_poll';
    // Full pull→import→ack cycle through a stub transport over the real DB.
    const export2 = makeExport(permitKeys.privateKey);
    await pool.query(`INSERT INTO private_release_approvals (id,task_id,task_version,manifest_hash,manifest,private_revision,owner_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [randomUUID(), export2.record.submission.taskId, export2.record.submission.taskVersion, byteHash(Buffer.from('m2')), JSON.stringify({ taskId: export2.record.submission.taskId, version: export2.record.submission.taskVersion }), baseRevision, ownerId]);
    let delivered = false;
    const transport: ImportTransport = {
      async send(packet) {
        const payload = (packet as { payload: Record<string, unknown> }).payload;
        if (payload['audience'] === 'external-submission-export/v1') {
          return { status: 'export', eventId: randomUUID(), export: { permitId: export2.record.permit.permitId, payload: export2.record } };
        }
        if (payload['audience'] === 'external-submission-export-ack/v1') {
          delivered = true;
          return { status: 'delivered', eventId: randomUUID() };
        }
        throw new Error('unexpected');
      },
    };
    const importer = new SubmissionImporter(store, importKeys.privateKey, permitKeys.publicKey, transport);
    const polled = await importer.pollOnce();
    report.pollImported = polled.status === 'imported' && delivered;
    // Crash replay: the export is redelivered before the external outbox is
    // marked; the importer must resolve to the same evaluation and re-ack.
    delivered = false;
    const replayed = await importer.pollOnce();
    report.crashReplayIdempotent = replayed.status === 'duplicate' && replayed.permitId === export2.record.permit.permitId && delivered;
    report.noDuplicateAuthoritativeAttempt = (await pool.query(`SELECT count(*)::int AS n FROM private_evaluations WHERE permit_id=$1`, [export2.record.permit.permitId])).rows[0]!.n === 1;

    stage = 'immutability';
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE private_submission_imports SET envelope='{}' WHERE permit_id=$1`, [record.permit.permitId]);
      report.importImmutable = false;
    } catch {
      report.importImmutable = true;
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
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
