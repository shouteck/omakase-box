import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { AttemptPermitPayload } from '../../external-api/submissions/envelope.js';

/**
 * Requested coordinator migration (M6.3). The durable import record binds a
 * verified external permit to the private evaluation row it authorized; the
 * permit_id primary key makes every replay resolve to the same attempt.
 * Migration file `db/migrations/0009_submission_import.sql` must be byte-equal.
 */
export const PRIVATE_SUBMISSION_IMPORT_DDL = `CREATE TABLE private_submission_imports (
  permit_id uuid PRIMARY KEY REFERENCES private_evaluations(permit_id),
  evaluation_id uuid NOT NULL REFERENCES private_evaluations(id),
  submission_hash char(64) NOT NULL CHECK (submission_hash ~ '^[a-f0-9]{64}$'),
  patch bytea NOT NULL CHECK (octet_length(patch) BETWEEN 1 AND 1048576),
  envelope jsonb NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION private_submission_import_immutable() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'submission_import_immutable';
END;
$fn$;
CREATE TRIGGER private_submission_import_guard BEFORE UPDATE OR DELETE ON private_submission_imports FOR EACH ROW EXECUTE FUNCTION private_submission_import_immutable();
`;

export class ImportRejected extends Error {
  constructor(
    readonly code: 'invalid_permit' | 'invalid_export' | 'missing_release' | 'persistence_unavailable',
  ) {
    super(code);
    this.name = 'ImportRejected';
  }
}

export interface ImportResult {
  readonly status: 'imported' | 'duplicate';
  readonly evaluationId: string;
  readonly permitId: string;
}

export interface ExportRecord {
  readonly permit: AttemptPermitPayload & { signature: string };
  readonly submission: {
    id: string;
    reservationId: string;
    contributorId: string;
    taskId: string;
    taskVersion: number;
    packageHash: string;
    submissionHash: string;
    patchBase64: string;
  };
}

async function rollbackQuietly(client: PoolClient): Promise<void> {
  try {
    await client.query('ROLLBACK');
  } catch {
    /* transaction already aborted */
  }
}

export class SqlSubmissionImportStore {
  constructor(private readonly pool: Pool) {}

  /**
   * Idempotent bounded import. The permit was already signature-verified by the
   * caller; here we bind it to the approved private release revision and commit
   * evaluation + import rows atomically. Replays resolve to the same evaluation.
   * No private evaluation job is ever created without a committed permit row.
   */
  async importPermit(record: ExportRecord, patchBytes: Uint8Array): Promise<ImportResult> {
    const permit = record.permit;
    const submission = record.submission;
    if (permit.submissionId !== submission.id || permit.reservationId !== submission.reservationId || permit.contributorId !== submission.contributorId) {
      throw new ImportRejected('invalid_export');
    }
    if (permit.taskId !== submission.taskId || permit.taskVersion !== submission.taskVersion || permit.packageDigest !== submission.packageHash || permit.submissionHash !== submission.submissionHash) {
      throw new ImportRejected('invalid_export');
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const release = await client.query<{ private_revision: string }>(
        `SELECT private_revision FROM private_release_approvals WHERE task_id=$1 AND task_version=$2`,
        [submission.taskId, submission.taskVersion],
      );
      const baseRevision = release.rows[0]?.private_revision;
      if (!baseRevision) throw new ImportRejected('missing_release');

      const evaluationId = randomUUID();
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO private_evaluations (id,permit_id,task_id,task_version,submission_id,submission_hash,package_hash,private_base_revision,state,version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'received',1)
         ON CONFLICT (permit_id) DO NOTHING
         RETURNING id`,
        [evaluationId, permit.permitId, submission.taskId, submission.taskVersion, submission.id, submission.submissionHash, submission.packageHash, baseRevision],
      );
      if (inserted.rowCount === 1) {
        await client.query(
          `INSERT INTO private_submission_imports (permit_id,evaluation_id,submission_hash,patch,envelope) VALUES ($1,$2,$3,$4,$5)`,
          [permit.permitId, evaluationId, submission.submissionHash, Buffer.from(patchBytes), JSON.stringify(record)],
        );
        await client.query('COMMIT');
        return { status: 'imported', evaluationId, permitId: permit.permitId };
      }
      // Replay: the durable row is authoritative; resolve to it.
      const existing = await client.query<{ evaluation_id: string; submission_hash: string }>(
        `SELECT evaluation_id,submission_hash FROM private_submission_imports WHERE permit_id=$1`,
        [permit.permitId],
      );
      const prior = existing.rows[0];
      if (!prior || prior.submission_hash !== submission.submissionHash) throw new ImportRejected('invalid_export');
      await client.query('COMMIT');
      return { status: 'duplicate', evaluationId: prior.evaluation_id, permitId: permit.permitId };
    } catch (error) {
      await rollbackQuietly(client);
      if (error instanceof ImportRejected) throw error;
      throw new ImportRejected('persistence_unavailable');
    } finally {
      client.release();
    }
  }
}
