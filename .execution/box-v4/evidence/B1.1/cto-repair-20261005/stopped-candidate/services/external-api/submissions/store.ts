import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { ExternalTaskContractSchema, type ExternalTaskContract } from '../../../packages/contracts/public/index.js';
import { contentHash } from '../../../packages/contracts/hash.js';
import { validatePatch, PatchRejected, type ValidatedPatch } from './patch-validation.js';
import { signAttemptPermit, SubmissionProtocolRejected, type SignedPermit } from './protocol.js';
import type { AttemptPermitPayload, SubmissionView } from './envelope.js';
import type { KeyObject } from 'node:crypto';

export const LINEAGE_ATTEMPT_CAP = 12;
export const WORKSPACE_ATTEMPT_CAP = 100;
export const WORKSPACE_WINDOW = '7 days';

/**
 * Requested coordinator migration (M6.3). Delivery ordering for the pull-based
 * export outbox. Migration file `db/migrations/0006_submission_export.sql`
 * must be byte-equal.
 */
export const EXTERNAL_SUBMISSION_EXPORT_DDL = `ALTER TABLE "external_attempt_outbox" ADD "created_at" timestamp with time zone DEFAULT now() NOT NULL;`;


export class SubmissionRejected extends Error {
  constructor(
    readonly code:
      | 'invalid_envelope'
      | 'invalid_identity'
      | 'reservation_unavailable'
      | 'reservation_expired'
      | 'task_version_mismatch'
      | 'package_hash_mismatch'
      | 'task_unavailable'
      | 'attempt_budget_exceeded'
      | 'idempotency_conflict'
      | 'invalid_permit'
      | 'persistence_unavailable'
      | 'permit_missing',
    cause?: unknown,
  ) {
    super(code, { cause });
    this.name = 'SubmissionRejected';
  }
}

export interface SubmissionResult {
  readonly status: 'created' | 'duplicate';
  readonly submission: SubmissionView;
  readonly permit: SignedPermit;
}

interface ReservationRow {
  id: string;
  task_id: string;
  task_version: number;
  package_hash: string;
  contributor_id: string;
  state: string;
  expires_at: Date | string;
  evaluated_attempts: number;
}

interface SubmissionRow {
  id: string;
  reservation_id: string;
  contributor_id: string;
  task_id: string;
  task_version: number;
  package_hash: string;
  submission_hash: string;
  permit: unknown;
  state: SubmissionView['state'];
  version: number;
}

function viewOf(row: SubmissionRow): SubmissionView {
  return {
    id: row.id,
    reservationId: row.reservation_id,
    taskId: row.task_id,
    taskVersion: row.task_version,
    packageHash: row.package_hash,
    submissionHash: row.submission_hash,
    state: row.state,
    version: row.version,
  };
}

async function rollbackQuietly(client: PoolClient): Promise<void> {
  try {
    await client.query('ROLLBACK');
  } catch {
    /* transaction already aborted */
  }
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string; constraint?: string }).code === '23505' && (error as { constraint?: string }).constraint === constraint;
}

export class SqlSubmissionStore {
  constructor(
    private readonly pool: Pool,
    private readonly permitKey: KeyObject | string | Buffer,
  ) {}

  /**
   * One atomic intake: contributor identity, reservation ownership/state/expiry,
   * exact task/version/package binding, idempotency, all three budget counters,
   * the submission row, the signed attempt permit and the outbox record all
   * commit or none do. No candidate byte is executed here.
   */
  async submit(input: {
    contributorId: string;
    reservationId: string;
    taskId: string;
    taskVersion: number;
    packageHash: string;
    idempotencyKey: string;
    patchBytes: Uint8Array;
    now?: Date;
  }): Promise<SubmissionResult> {
    const now = input.now ?? new Date();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize budget checks: reservation row lock + lineage lock + a global
      // advisory lock make the rolling workspace counter atomic too.
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('external-workspace-attempt-budget'))`);
      const identity = await client.query(`SELECT id FROM external_accounts WHERE id=$1 AND NOT disabled FOR SHARE`, [input.contributorId]);
      if (identity.rowCount !== 1) throw new SubmissionRejected('invalid_identity');
      const reservationResult = await client.query<ReservationRow>(
        `SELECT id,task_id,task_version,package_hash,contributor_id,state,expires_at,evaluated_attempts
         FROM external_reservations WHERE id=$1 FOR UPDATE`,
        [input.reservationId],
      );
      const reservation = reservationResult.rows[0];
      if (!reservation || reservation.contributor_id !== input.contributorId) throw new SubmissionRejected('reservation_unavailable');
      // Idempotent replay resolves to the committed attempt before any state,
      // expiry or budget gate — it is a read of the authoritative result, never
      // a second spend.
      const duplicate = await client.query<SubmissionRow>(
        `SELECT id,reservation_id,contributor_id,task_id,task_version,package_hash,submission_hash,permit,state,version
         FROM external_submissions WHERE contributor_id=$1 AND idempotency_key=$2`,
        [input.contributorId, input.idempotencyKey],
      );
      if (duplicate.rowCount === 1) {
        const existing = duplicate.rows[0]!;
        if (existing.reservation_id !== input.reservationId) throw new SubmissionRejected('idempotency_conflict');
        await client.query('COMMIT');
        return { status: 'duplicate', submission: viewOf(existing), permit: existing.permit as SignedPermit };
      }
      if (reservation.state !== 'active') throw new SubmissionRejected('reservation_unavailable');
      if (new Date(reservation.expires_at).getTime() <= now.getTime()) throw new SubmissionRejected('reservation_expired');
      if (reservation.task_id !== input.taskId || reservation.task_version !== input.taskVersion) throw new SubmissionRejected('task_version_mismatch');
      if (reservation.package_hash !== input.packageHash) throw new SubmissionRejected('package_hash_mismatch');

      const publication = await client.query<{ contract: unknown }>(
        `SELECT contract FROM external_published_tasks WHERE task_id=$1 AND version=$2`,
        [input.taskId, input.taskVersion],
      );
      const contract = ExternalTaskContractSchema.safeParse(publication.rows[0]?.contract);
      if (!contract.success) throw new SubmissionRejected('task_unavailable');
      const editablePaths = editableSet(contract.data);
      let patch: ValidatedPatch;
      try {
        patch = validatePatch({
          bytes: input.patchBytes,
          editablePaths,
        });
      } catch (error) {
        if (error instanceof PatchRejected) throw new SubmissionRejected('invalid_envelope');
        throw error;
      }
      if (input.patchBytes.length > contract.data.terms.maxPatchBytes || patch.changedLines > contract.data.terms.maxChangedLines) {
        throw new SubmissionRejected('invalid_envelope');
      }

      const attemptSequence = reservation.evaluated_attempts + 1;
      if (attemptSequence > contract.data.terms.maxEvaluatedAttempts) throw new SubmissionRejected('attempt_budget_exceeded');
      const lineage = await client.query(
        `UPDATE external_task_lineages SET evaluated_attempts=evaluated_attempts+1
         WHERE id=(SELECT lineage_id FROM external_task_versions WHERE id=$1 AND version=$2)
           AND evaluated_attempts < $3
         RETURNING id`,
        [input.taskId, input.taskVersion, LINEAGE_ATTEMPT_CAP],
      );
      if (lineage.rowCount !== 1) throw new SubmissionRejected('attempt_budget_exceeded');
      const permitId = randomUUID();
      const submissionId = randomUUID();
      const permitPayload: AttemptPermitPayload = {
        schemaVersion: 1,
        audience: 'private-submission-import/v1',
        permitId,
        eventId: randomUUID(),
        nonce: randomUUID(),
        reservationId: input.reservationId,
        submissionId,
        contributorId: input.contributorId,
        taskId: input.taskId,
        taskVersion: input.taskVersion,
        lineageId: lineage.rows[0].id as string,
        packageDigest: input.packageHash,
        submissionHash: patch.hash,
        attemptSequence,
        issuedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const permit = signAttemptPermit(permitPayload, this.permitKey);
      let inserted: SubmissionRow;
      try {
        const submission = await client.query<SubmissionRow>(
          `INSERT INTO external_submissions (id,reservation_id,contributor_id,task_id,task_version,package_hash,submission_hash,patch,idempotency_key,permit_id,permit,state,version,superseded)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'received',1,false)
           RETURNING id,reservation_id,contributor_id,task_id,task_version,package_hash,submission_hash,permit,state,version`,
          [submissionId, input.reservationId, input.contributorId, input.taskId, input.taskVersion, input.packageHash, patch.hash, Buffer.from(input.patchBytes).toString('utf8'), input.idempotencyKey, permitId, JSON.stringify(permit)],
        );
        inserted = submission.rows[0]!;
      } catch (error) {
        if (isUniqueViolation(error, 'external_submission_idempotency')) {
          throw new SubmissionRejected('idempotency_conflict');
        }
        throw error;
      }
      const workspace = await client.query(
        `INSERT INTO external_workspace_attempts (permit_id) SELECT $1::uuid
         WHERE (SELECT count(*) FROM external_workspace_attempts WHERE recorded_at > now() - $2::interval) < $3
         RETURNING permit_id`,
        [permitId, WORKSPACE_WINDOW, WORKSPACE_ATTEMPT_CAP],
      );
      if (workspace.rowCount !== 1) throw new SubmissionRejected('attempt_budget_exceeded');
      await client.query(
        `UPDATE external_reservations SET evaluated_attempts=evaluated_attempts+1, version=version+1, state='in_review' WHERE id=$1`,
        [input.reservationId],
      );
      await client.query(
        `INSERT INTO external_attempt_outbox (permit_id,payload) VALUES ($1,$2)`,
        [permitId, JSON.stringify(permit)],
      );
      await client.query('COMMIT');
      return { status: 'created', submission: viewOf(inserted), permit };
    } catch (error) {
      await rollbackQuietly(client);
      if (error instanceof SubmissionRejected || error instanceof SubmissionProtocolRejected) throw error;
      throw new SubmissionRejected('persistence_unavailable', error);
    } finally {
      client.release();
    }
  }

  /**
   * Oldest undelivered outbox export, joined to the bounded patch bytes the
   * private importer needs. Pull is a read; the ack marks delivery.
   */
  async pullNext(): Promise<{ permitId: string; payload: { permit: unknown; submission: unknown } } | null> {
    const result = await this.pool.query<{ permit_id: string; payload: unknown; patch: string; id: string; reservation_id: string; contributor_id: string; task_id: string; task_version: number; package_hash: string; submission_hash: string }>(
      `SELECT outbox.permit_id,outbox.payload,submission.patch,submission.id,submission.reservation_id,submission.contributor_id,submission.task_id,submission.task_version,submission.package_hash,submission.submission_hash
       FROM external_attempt_outbox AS outbox
       JOIN external_submissions AS submission ON submission.permit_id=outbox.permit_id
       WHERE outbox.delivered_at IS NULL ORDER BY outbox.created_at LIMIT 1`,
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      permitId: row.permit_id,
      payload: {
        permit: row.payload,
        submission: {
          id: row.id,
          reservationId: row.reservation_id,
          contributorId: row.contributor_id,
          taskId: row.task_id,
          taskVersion: row.task_version,
          packageHash: row.package_hash,
          submissionHash: row.submission_hash,
          patchBase64: Buffer.from(row.patch, 'utf8').toString('base64'),
        },
      },
    };
  }

  /** Idempotent delivery ack bound to the pulled payload hash. */
  async acknowledge(permitId: string, payloadHash: string): Promise<'delivered' | 'already_delivered'> {
    const existing = await this.pool.query<{ payload: unknown; delivered_at: Date | null }>(
      `SELECT payload,delivered_at FROM external_attempt_outbox WHERE permit_id=$1`,
      [permitId],
    );
    const row = existing.rows[0];
    if (!row) throw new SubmissionRejected('permit_missing');
    if (contentHash(row.payload) !== payloadHash) throw new SubmissionRejected('idempotency_conflict');
    if (row.delivered_at) return 'already_delivered';
    await this.pool.query(`UPDATE external_attempt_outbox SET delivered_at=now() WHERE permit_id=$1 AND delivered_at IS NULL`, [permitId]);
    return 'delivered';
  }
}

function editableSet(contract: ExternalTaskContract): string[] {
  return contract.workUnits.flatMap(unit => unit.editablePaths);
}
