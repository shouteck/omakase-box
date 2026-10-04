import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { ExternalTaskContractSchema } from '../../../packages/contracts/public/index.js';
import type { ExternalTaskContract, PublicListing } from '../../../packages/contracts/public/index.js';
import { contentHash } from '../../../packages/contracts/hash.js';
import { assertTransition, WorkflowError } from '../../../packages/contracts/workflow/index.js';
import { ASSIGNMENT_DDL, AssignmentRejected, assertExecutorInput, isUuid, tokenHash, type AssignmentStatus, type ExecutorKind } from './assignments.js';
import { ReservationRejected, type Caller, type FrozenTerms, type ReservationView } from './reservation-store.js';
import { DefectRejected, MAX_DEFECT_DESCRIPTION, type DefectCategory } from './defect-reports.js';

/**
 * Requested coordinator migration (M6.2). CREATE-only DDL on top of the ten
 * foundation tables and the M6.1 published tables; coordinator-owned.
 */
export const REQUESTED_RESERVATION_DDL = ASSIGNMENT_DDL;

const ASSIGNMENT_COLUMNS = 'assignment.id,assignment.task_id,assignment.task_version,assignment.executor_kind,assignment.executor_label,assignment.status,assignment.chosen_by,assignment.version,assignment.created_at';

interface AssignmentRow {
  id: string;
  task_id: string;
  task_version: number;
  executor_kind: ExecutorKind;
  executor_label: string;
  status: AssignmentStatus;
  chosen_by: string;
  version: number;
  created_at: Date | string;
}

interface InvitationRow extends AssignmentRow {
  invited_contributor: string | null;
  invitation_redeemed_at: Date | string | null;
  invitation_revoked: boolean | null;
  invitation_expires_at: Date | string | null;
}

function iso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function assignmentView(row: AssignmentRow) {
  return {
    schemaVersion: 1 as const,
    id: row.id,
    taskId: row.task_id,
    taskVersion: row.task_version,
    executor: { kind: row.executor_kind, label: row.executor_label },
    status: row.status,
    chosenBy: row.chosen_by,
    createdAt: iso(row.created_at)
  };
}

function termsOf(contract: ExternalTaskContract): FrozenTerms {
  return {
    termsHash: contentHash(contract.terms),
    reservationDurationSeconds: contract.terms.reservationDurationSeconds,
    maxEvaluatedAttempts: contract.terms.maxEvaluatedAttempts,
    maxPatchBytes: contract.terms.maxPatchBytes,
    maxChangedLines: contract.terms.maxChangedLines,
    revisionPolicy: 'preserve_original_expiry',
    cancellationPolicy: contract.terms.cancellationPolicy,
    packageDefectCompensation: contract.terms.packageDefectCompensation,
    budgetExhaustionPolicy: contract.terms.budgetExhaustionPolicy
  };
}

async function rollbackQuietly(client: PoolClient): Promise<void> {
  try { await client.query('ROLLBACK'); } catch { /* transaction already aborted */ }
}

function isConstraint(error: unknown, constraint: string): boolean {
  return typeof error === 'object' && error !== null && (error as { constraint?: string }).constraint === constraint;
}

/** PostgreSQL assignment/invitation store mirroring the injected semantics. */
export class SqlAssignmentStore {
  constructor(private readonly pool: Pool) {}

  async chooseExecutor(input: unknown, nowMs: number): Promise<ReturnType<typeof assignmentView>> {
    assertExecutorInput(input);
    const { taskId, taskVersion, executor, chosenBy } = input as { taskId: string; taskVersion: number; executor: { kind: ExecutorKind; label: string; contributorId?: string }; chosenBy: string };
    const client = await this.acquire();
    try {
      await client.query('BEGIN');
      const id = randomUUID();
      const inserted = await client.query(
        'INSERT INTO external_task_assignments (id,task_id,task_version,executor_kind,executor_label,contributor_id,status,chosen_by,version,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,to_timestamp($9/1000.0)) ON CONFLICT (task_id, task_version) DO NOTHING',
        [id, taskId, taskVersion, executor.kind, executor.label, executor.contributorId ?? null, 'open', chosenBy, nowMs]);
      if (inserted.rowCount === 1) {
        await client.query('COMMIT');
        return assignmentView({ id, task_id: taskId, task_version: taskVersion, executor_kind: executor.kind, executor_label: executor.label, status: 'open', chosen_by: chosenBy, version: 1, created_at: new Date(nowMs) });
      }
      const existing = (await client.query(`SELECT ${ASSIGNMENT_COLUMNS} FROM external_task_assignments AS assignment WHERE assignment.task_id=$1 AND assignment.task_version=$2 FOR UPDATE`, [taskId, taskVersion])).rows[0] as AssignmentRow | undefined;
      await client.query('COMMIT');
      if (!existing || existing.executor_kind !== executor.kind || existing.executor_label !== executor.label) throw new AssignmentRejected('assignment_conflict');
      return assignmentView(existing);
    } catch (error) {
      await rollbackQuietly(client);
      throw error instanceof AssignmentRejected ? error : new AssignmentRejected('invalid_input');
    } finally { client.release(); }
  }

  async byTask(taskId: string, taskVersion: number): Promise<AssignmentRow | null> {
    try {
      const row = (await this.pool.query(`SELECT ${ASSIGNMENT_COLUMNS} FROM external_task_assignments AS assignment WHERE assignment.task_id=$1 AND assignment.task_version=$2`, [taskId, taskVersion])).rows[0] as AssignmentRow | undefined;
      return row ?? null;
    } catch {
      throw new AssignmentRejected('invalid_input');
    }
  }

  /** Applies an owner-issued invitation binding verified from a signed command. Exactly one per assignment. */
  async applyInvitation(assignmentId: string, invitation: { contributorId: unknown; tokenHash: unknown; expiresAt: unknown }, _nowMs: number): Promise<{ tokenHash: string; expiresAt: string }> {
    const expiresAtMs = typeof invitation.expiresAt === 'string' ? Date.parse(invitation.expiresAt) : Number.NaN;
    if (!isUuid(assignmentId) || !isUuid(invitation.contributorId) || typeof invitation.tokenHash !== 'string' || !/^[a-f0-9]{64}$/.test(invitation.tokenHash) || !Number.isFinite(expiresAtMs)) throw new AssignmentRejected('invalid_input');
    const client = await this.acquire();
    try {
      await client.query('BEGIN');
      const assignment = (await client.query('SELECT id,contributor_id,status FROM external_task_assignments WHERE id=$1 FOR UPDATE', [assignmentId])).rows[0] as { id: string; contributor_id: string | null; status: AssignmentStatus } | undefined;
      if (!assignment || assignment.contributor_id === null) {
        await rollbackQuietly(client);
        throw new AssignmentRejected(assignment ? 'invalid_input' : 'not_found');
      }
      if (assignment.contributor_id !== invitation.contributorId || (await client.query('SELECT 1 FROM external_task_invitations WHERE assignment_id=$1', [assignmentId])).rowCount) throw new AssignmentRejected('invitation_denied');
      const issued = await client.query(
        `INSERT INTO external_task_invitations (id,assignment_id,token_hash,contributor_id,expires_at,revoked,redeemed_at)
         VALUES ($1,$2,$3,$4,$5,false,NULL)`,
        [randomUUID(), assignmentId, invitation.tokenHash, invitation.contributorId, new Date(expiresAtMs).toISOString()]);
      if (issued.rowCount !== 1) {
        await rollbackQuietly(client);
        throw new AssignmentRejected('invalid_input');
      }
      await client.query('COMMIT');
      return { tokenHash: invitation.tokenHash, expiresAt: new Date(expiresAtMs).toISOString() };
    } catch (error) {
      await rollbackQuietly(client);
      throw error instanceof AssignmentRejected ? error : new AssignmentRejected('invalid_input');
    } finally { client.release(); }
  }

  async recordRedemption(token: string, contributorId: string, nowMs: number): Promise<void> {
    if (!/^[0-9a-f]{64}$/.test(token) || !isUuid(contributorId)) throw new AssignmentRejected('invalid_input');
    const client = await this.acquire();
    try {
      await client.query('BEGIN');
      const row = (await client.query(
        `SELECT invitation.assignment_id,invitation.revoked,invitation.redeemed_at,invitation.expires_at,invitation.contributor_id
         FROM external_task_invitations AS invitation WHERE invitation.token_hash=$1 FOR UPDATE`,
        [tokenHash(token)])).rows[0] as { assignment_id: string; revoked: boolean; redeemed_at: Date | null; expires_at: Date | string; contributor_id: string } | undefined;
      if (!row || row.revoked || row.redeemed_at !== null || new Date(row.expires_at as unknown as string).getTime() <= nowMs || row.contributor_id !== contributorId) {
        await rollbackQuietly(client);
        throw new AssignmentRejected('invitation_denied');
      }
      await client.query('UPDATE external_task_invitations SET redeemed_at=to_timestamp($2/1000.0) WHERE assignment_id=$1', [row.assignment_id, nowMs]);
      await client.query("UPDATE external_task_assignments SET status='active', version=version+1 WHERE id=$1", [row.assignment_id]);
      await client.query('COMMIT');
    } catch (error) {
      await rollbackQuietly(client);
      throw error instanceof AssignmentRejected ? error : new AssignmentRejected('invalid_input');
    } finally { client.release(); }
  }

  async runtimeContributorBinding(taskId: string, taskVersion: number, contributorId: string, nowMs: number): Promise<'redeemed' | 'none' | 'invited_pending'> {
    const row = (await this.pool.query(
      `SELECT assignment.id,invitation.redeemed_at,invitation.revoked,invitation.expires_at
       FROM external_task_assignments AS assignment
       LEFT JOIN external_task_invitations AS invitation ON invitation.assignment_id = assignment.id
       WHERE assignment.task_id=$1 AND assignment.task_version=$2 AND invitation.contributor_id=$3`,
      [taskId, taskVersion, contributorId])).rows[0] as { id: string; redeemed_at: Date | string | null; revoked: boolean | null; expires_at: Date | string | null } | undefined;
    if (!row) return 'none';
    if (row.redeemed_at === null || row.revoked === true) return 'invited_pending';
    return 'redeemed';
  }

  private async acquire(): Promise<PoolClient> {
    try {
      return await this.pool.connect();
    } catch {
      throw new AssignmentRejected('invalid_input');
    }
  }
}

interface ReservationRow {
  id: string;
  task_id: string;
  task_version: number;
  package_hash: string;
  contributor_id: string;
  terms_hash: string;
  state: ReservationStateString;
  expires_at: Date | string;
  version: number;
  reserved_at: Date | string;
}

type ReservationStateString = 'active' | 'in_review' | 'accepted' | 'expired' | 'cancelled';

const RESERVATION_ROW = 'reservation.id,reservation.task_id,reservation.task_version,reservation.package_hash,reservation.contributor_id,reservation.terms_hash,reservation.state,reservation.expires_at,reservation.version,reservation.reserved_at';

/** PostgreSQL one-live-reservation store; mirrors the injected semantics. */
export class SqlReservationStore {
  constructor(private readonly pool: Pool) {}

  async reserve(caller: Caller, input: { taskId: unknown; taskVersion: unknown }, nowMs: number): Promise<ReservationView> {
    if (caller.role !== 'contributor') throw new ReservationRejected('forbidden');
    if (!isUuid(input.taskId) || !Number.isSafeInteger(input.taskVersion) || (input.taskVersion as number) < 1 || (input.taskVersion as number) > 2147483647) throw new ReservationRejected('invalid_input');
    const taskId = input.taskId as string;
    const taskVersion = input.taskVersion as number;
    const client = await this.acquireClient();
    try {
      await client.query('BEGIN');
      if (!(await client.query('SELECT 1 FROM external_accounts WHERE id=$1 AND NOT disabled FOR SHARE', [caller.id])).rowCount) throw new ReservationRejected('forbidden');
      const published = (await client.query('SELECT released.contract,released.listing,released.package_sha256 AS package_hash FROM external_published_tasks AS released JOIN external_task_versions AS binding ON binding.id=released.task_id AND binding.version=released.version AND binding.package_hash=released.package_sha256 AND NOT binding.withdrawn WHERE released.task_id=$1 AND released.version=$2 FOR SHARE OF released,binding', [taskId, taskVersion])).rows[0] as { contract: unknown; listing: unknown; package_hash: string } | undefined;
      if (!published) {
        await rollbackQuietly(client);
        throw new ReservationRejected('task_unavailable');
      }
      const contract = parseContract(published.contract);
      if (contract.taskId !== taskId || contract.version !== taskVersion) {
        await rollbackQuietly(client);
        throw new ReservationRejected('task_unavailable');
      }
      const assignment = (await client.query(
        `SELECT ${ASSIGNMENT_COLUMNS},invitation.contributor_id AS invited_contributor,invitation.redeemed_at AS invitation_redeemed_at,invitation.revoked AS invitation_revoked,invitation.expires_at AS invitation_expires_at
         FROM external_task_assignments AS assignment
         LEFT JOIN external_task_invitations AS invitation ON invitation.assignment_id = assignment.id
         WHERE assignment.task_id=$1 AND assignment.task_version=$2
         FOR UPDATE OF assignment`,
        [taskId, taskVersion])).rows[0] as InvitationRow | undefined;
      if (!assignment) {
        await rollbackQuietly(client);
        throw new ReservationRejected('assignment_required');
      }
      if (assignment.executor_kind !== 'human' || assignment.invited_contributor === null) {
        await rollbackQuietly(client);
        throw new ReservationRejected('executor_not_contributor');
      }
      if (assignment.invited_contributor !== caller.id) {
        await rollbackQuietly(client);
        throw new ReservationRejected('invitation_denied');
      }
      if (assignment.invitation_redeemed_at === null || assignment.invitation_revoked === true) {
        await rollbackQuietly(client);
        throw new ReservationRejected('invitation_required');
      }
      const invitation = (await client.query('SELECT revoked,redeemed_at FROM external_task_invitations WHERE assignment_id=$1 FOR SHARE', [assignment.id])).rows[0];
      if (!invitation || invitation.revoked || !invitation.redeemed_at) throw new ReservationRejected('invitation_denied');
      await client.query("UPDATE external_reservations SET state='expired',version=version+1 WHERE task_id=$1 AND task_version=$2 AND state IN ('active','in_review') AND expires_at<=to_timestamp($3/1000.0)", [taskId, taskVersion, nowMs]);
      const terms = termsOf(contract);
      const id = randomUUID();
      const inserted = await client.query(
        `INSERT INTO external_reservations (id,task_id,task_version,package_hash,contributor_id,terms_hash,expires_at,reserved_at)
         SELECT $3,$1,$2,$4,$5,$6,to_timestamp($7/1000.0),to_timestamp($8/1000.0)
         WHERE NOT EXISTS (
           SELECT 1 FROM external_reservations
           WHERE task_id=$1 AND task_version=$2 AND state IN ('active','in_review')
         )`,
        [taskId, taskVersion, id, published.package_hash, caller.id, terms.termsHash, nowMs + terms.reservationDurationSeconds * 1000, nowMs]);
      if (inserted.rowCount !== 1) {
        await rollbackQuietly(client);
        throw new ReservationRejected('already_reserved');
      }
      const row = (await client.query(`SELECT ${RESERVATION_ROW} FROM external_reservations AS reservation WHERE reservation.id=$1 FOR SHARE`, [id])).rows[0] as ReservationRow;
      await client.query('COMMIT');
      return this.viewOf(row, assignment, contract, published.listing as PublicListing);
    } catch (error) {
      await rollbackQuietly(client);
      throw this.mapped(error);
    } finally { client.release(); }
  }

  async reservation(caller: Caller, reservationId: unknown, nowMs: number): Promise<ReservationView> {
    if (caller.role !== 'contributor') throw new ReservationRejected('forbidden');
    if (!isUuid(reservationId)) throw new ReservationRejected('not_found');
    try {
      const row = (await this.pool.query(
        `SELECT ${RESERVATION_ROW} FROM external_reservations AS reservation
         JOIN external_accounts AS actor ON actor.id = reservation.contributor_id AND NOT actor.disabled
         WHERE reservation.id=$1 AND reservation.contributor_id=$2`,
        [reservationId, caller.id])).rows[0] as ReservationRow | undefined;
      if (!row) throw new ReservationRejected('not_found');
      return await this.view(row);
    } catch (error) {
      throw this.mapped(error);
    }
  }

  async forTask(caller: Caller, taskId: unknown, taskVersion: unknown, nowMs: number): Promise<ReservationView[]> {
    if (caller.role !== 'owner') throw new ReservationRejected('forbidden');
    if (!isUuid(taskId) || !Number.isSafeInteger(taskVersion)) throw new ReservationRejected('invalid_input');
    const rows = (await this.pool.query(
      `SELECT ${RESERVATION_ROW} FROM external_reservations AS reservation WHERE reservation.task_id=$1 AND reservation.task_version=$2 AND reservation.state IN ('active','in_review')`,
      [taskId, taskVersion])).rows as ReservationRow[];
    return Promise.all(rows.map(row => this.view(row)));
  }

  async expireDue(nowMs: number): Promise<number> {
    const result = await this.pool.query(
      "UPDATE external_reservations SET state='expired', version=version+1 WHERE state IN ('active','in_review') AND expires_at <= to_timestamp($1/1000.0) RETURNING id",
      [nowMs]);
    return result.rowCount ?? 0;
  }

  async submitForReview(caller: Caller, input: { reservationId: unknown; submissionId: unknown; expectedVersion: number }, nowMs: number): Promise<ReservationView> {
    if (caller.role !== 'contributor') throw new ReservationRejected('forbidden');
    if (typeof input.submissionId !== 'string' || !isUuid(input.submissionId)) throw new ReservationRejected('invalid_input');
    return this.mutate(input.reservationId, async (client, row) => {
      this.requireOwn(row, caller);
      this.requireVersion(row, input.expectedVersion);
      this.requireUnexpired(row, nowMs);
      if (row.state === 'in_review') throw new ReservationRejected('in_review_conflict');
      assertTransition({ kind: 'reservation', from: row.state, to: 'in_review', actor: 'contributor', expectedVersion: row.version, currentVersion: row.version }, { reservationValid: true });
      await client.query('UPDATE external_reservation_attempts SET superseded=true WHERE reservation_id=$1 AND NOT superseded', [row.id]);
      await client.query('INSERT INTO external_reservation_attempts (submission_id,reservation_id) VALUES ($1,$2)', [input.submissionId as string, row.id]);
      return 'in_review';
    });
  }

  async changesRequired(caller: Caller, input: { reservationId: unknown; expectedVersion: number }, nowMs: number): Promise<ReservationView> {
    if (caller.role !== 'owner') throw new ReservationRejected('forbidden');
    return this.mutate(input.reservationId, async (client, row) => {
      this.requireVersion(row, input.expectedVersion);
      this.requireUnexpired(row, nowMs);
      assertTransition({ kind: 'reservation', from: row.state, to: 'active', actor: 'owner', expectedVersion: row.version, currentVersion: row.version }, { reservationValid: true });
      await client.query('UPDATE external_reservation_attempts SET superseded=true WHERE reservation_id=$1 AND NOT superseded', [row.id]);
      return 'active';
    });
  }

  async accept(caller: Caller, input: { reservationId: unknown; submissionId: unknown; expectedVersion: number }, nowMs: number): Promise<ReservationView> {
    if (caller.role !== 'owner') throw new ReservationRejected('forbidden');
    if (typeof input.submissionId !== 'string' || !isUuid(input.submissionId)) throw new ReservationRejected('invalid_input');
    return this.mutate(input.reservationId, async (client, row) => {
      this.requireVersion(row, input.expectedVersion);
      this.requireUnexpired(row, nowMs);
      if (row.state !== 'in_review') throw new ReservationRejected('invalid_transition');
      const attempt = (await client.query('SELECT 1 FROM external_reservation_attempts WHERE submission_id=$1 AND reservation_id=$2 AND NOT superseded', [input.submissionId as string, row.id])).rowCount;
      if (!attempt) throw new ReservationRejected('stale_submission');
      assertTransition({ kind: 'reservation', from: row.state, to: 'accepted', actor: 'owner', expectedVersion: row.version, currentVersion: row.version }, { reservationValid: true });
      return 'accepted';
    });
  }

  async cancel(caller: Caller, input: { reservationId: unknown; expectedVersion: number }, nowMs: number): Promise<ReservationView> {
    if (caller.role !== 'contributor') throw new ReservationRejected('forbidden');
    return this.mutate(input.reservationId, async (client, row) => {
      this.requireOwn(row, caller);
      this.requireVersion(row, input.expectedVersion);
      this.requireUnexpired(row, nowMs);
      assertTransition({ kind: 'reservation', from: row.state, to: 'cancelled', actor: 'contributor', expectedVersion: row.version, currentVersion: row.version }, { reservationValid: true });
      await client.query('UPDATE external_reservation_attempts SET superseded=true WHERE reservation_id=$1 AND NOT superseded', [row.id]);
      return 'cancelled';
    });
  }

  private async mutate(reservationId: unknown, operation: (client: PoolClient, row: ReservationRow) => Promise<ReservationStateString>): Promise<ReservationView> {
    if (!isUuid(reservationId)) throw new ReservationRejected('not_found');
    const client = await this.acquireClient();
    try {
      await client.query('BEGIN');
      const row = (await client.query(`SELECT ${RESERVATION_ROW} FROM external_reservations AS reservation WHERE reservation.id=$1 FOR UPDATE`, [reservationId])).rows[0] as ReservationRow | undefined;
      if (!row) {
        await rollbackQuietly(client);
        throw new ReservationRejected('not_found');
      }
      const to = await operation(client, row);
      const updated = await client.query('UPDATE external_reservations SET state=$2, version=version+1 WHERE id=$1 AND version=$3 RETURNING version', [row.id, to, row.version]);
      if (updated.rowCount !== 1) {
        await rollbackQuietly(client);
        throw new ReservationRejected('stale_version');
      }
      const after = { ...row, state: to, version: row.version + 1 };
      await client.query('COMMIT');
      return await this.view(after);
    } catch (error) {
      await rollbackQuietly(client);
      throw this.mapped(error);
    } finally { client.release(); }
  }

  private requireOwn(row: ReservationRow, caller: Caller): void {
    if (row.contributor_id !== caller.id) throw new ReservationRejected('not_found');
  }

  private requireVersion(row: ReservationRow, expectedVersion: unknown): void {
    if (!Number.isSafeInteger(expectedVersion) || (expectedVersion as number) !== row.version) throw new ReservationRejected('stale_version');
  }

  private requireUnexpired(row: ReservationRow, nowMs: number): void {
    if (new Date(row.expires_at as string).getTime() <= nowMs) throw new ReservationRejected('reservation_expired');
  }

  private async view(row: ReservationRow): Promise<ReservationView> {
    const assignment = (await this.pool.query(
      `SELECT ${ASSIGNMENT_COLUMNS} FROM external_task_assignments AS assignment WHERE assignment.task_id=$1 AND assignment.task_version=$2`,
      [row.task_id, row.task_version])).rows[0] as AssignmentRow | undefined;
    if (!assignment) throw new ReservationRejected('not_found');
    const published = (await this.pool.query('SELECT contract,listing FROM external_published_tasks WHERE task_id=$1 AND version=$2', [row.task_id, row.task_version])).rows[0] as { contract: unknown; listing: unknown } | undefined;
    if (!published) throw new ReservationRejected('not_found');
    const contract = parseContract(published.contract);
    return this.viewOf(row, assignment, contract, published.listing as PublicListing);
  }

  private viewOf(row: ReservationRow, assignment: AssignmentRow, contract: ExternalTaskContract, listing: PublicListing): ReservationView {
    const terms = termsOf(contract);
    if (row.terms_hash !== terms.termsHash || contract.taskId !== row.task_id || contract.version !== row.task_version) throw new ReservationRejected('task_unavailable');
    return {
      schemaVersion: 1,
      id: row.id,
      taskId: row.task_id,
      taskVersion: row.task_version,
      contributorId: row.contributor_id,
      state: row.state,
      executor: { kind: assignment.executor_kind, label: assignment.executor_label },
      expiresAt: iso(row.expires_at),
      terms,
      version: row.version,
      reservedAt: iso(row.reserved_at)
    };
  }

  private async acquireClient(): Promise<PoolClient> {
    try {
      return await this.pool.connect();
    } catch {
      throw new ReservationRejected('invalid_transition');
    }
  }

  private mapped(error: unknown): unknown {
    if (error instanceof ReservationRejected || error instanceof AssignmentRejected || error instanceof DefectRejected) return error;
    if (error instanceof WorkflowError) return new ReservationRejected(error.code === 'stale_version' ? 'stale_version' : 'invalid_transition');
    if (isConstraint(error, 'external_one_live_reservation')) return new ReservationRejected('already_reserved');
    if (isConstraint(error, 'external_package_defect_idempotency')) return new DefectRejected('invalid_input');
    if (isConstraint(error, 'external_task_assignment_content')) return new AssignmentRejected('assignment_conflict');
    if (isConstraint(error, 'external_task_invitation_one_active')) return new AssignmentRejected('invitation_denied');
    return new ReservationRejected('invalid_transition');
  }
}

function parseContract(value: unknown): ExternalTaskContract {
  try {
    return ExternalTaskContractSchema.parse(value);
  } catch {
    throw new ReservationRejected('task_unavailable');
  }
}

interface DefectRow {
  id: string;
  task_id: string;
  task_version: number;
  reservation_id: string;
  category: DefectCategory;
  description: string;
  received_at: Date | string;
}

/** PostgreSQL defect-report store; idempotent per (contributor, key). */
export class SqlDefectReportStore {
  constructor(private readonly pool: Pool) {}

  async file(caller: Caller, input: unknown, nowMs: number) {
    if (caller.role !== 'contributor') throw new DefectRejected('not_found');
    if (input === null || typeof input !== 'object') throw new DefectRejected('invalid_input');
    const body = input as { taskId?: unknown; taskVersion?: unknown; reservationId?: unknown; category?: unknown; description?: unknown; idempotencyKey?: unknown };
    if (!isUuid(body.taskId) || !Number.isSafeInteger(body.taskVersion) || (body.taskVersion as number) < 1 || !isUuid(body.reservationId) || !isUuid(body.idempotencyKey)) throw new DefectRejected('invalid_input');
    if (typeof body.category !== 'string' || !['missing_context', 'missing_dependency', 'environment_failure', 'documentation_failure', 'other'].includes(body.category)) throw new DefectRejected('invalid_input');
    if (typeof body.description !== 'string' || body.description.length < 12 || body.description.length > MAX_DEFECT_DESCRIPTION) throw new DefectRejected('invalid_input');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const row = (await client.query('SELECT reservation.task_id,reservation.task_version,reservation.state,reservation.expires_at FROM external_reservations AS reservation JOIN external_accounts AS actor ON actor.id=reservation.contributor_id AND NOT actor.disabled WHERE reservation.id=$1 AND reservation.contributor_id=$2 FOR UPDATE OF reservation FOR SHARE OF actor', [body.reservationId, caller.id])).rows[0];
      if (!row) throw new DefectRejected('not_found');
      if (row.task_id !== body.taskId || row.task_version !== body.taskVersion) throw new DefectRejected('invalid_input');
      if (row.state === 'expired' || new Date(row.expires_at).getTime() <= nowMs) throw new DefectRejected('reservation_expired');
      if (row.state !== 'active' && row.state !== 'in_review') throw new DefectRejected('reservation_closed');
      const columns = 'id,task_id,task_version,reservation_id,category,description,received_at';
      const inserted = await client.query(`INSERT INTO external_package_defect_reports (id,reservation_id,contributor_id,task_id,task_version,category,description,idempotency_key,received_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,to_timestamp($9/1000.0)) ON CONFLICT (contributor_id,idempotency_key) DO NOTHING RETURNING ${columns}`, [randomUUID(), body.reservationId, caller.id, body.taskId, body.taskVersion, body.category, body.description, body.idempotencyKey, nowMs]);
      const report = (inserted.rows[0] ?? (await client.query(`SELECT ${columns} FROM external_package_defect_reports WHERE contributor_id=$1 AND idempotency_key=$2`, [caller.id, body.idempotencyKey])).rows[0]) as DefectRow | undefined;
      if (!report || report.task_id !== body.taskId || report.task_version !== body.taskVersion || report.reservation_id !== body.reservationId || report.category !== body.category || report.description !== body.description) throw new DefectRejected('invalid_input');
      await client.query('COMMIT');
      return this.project(report);
    } catch (error) {
      await rollbackQuietly(client);
      throw error instanceof DefectRejected ? error : new DefectRejected('invalid_input');
    } finally { client.release(); }
  }

  async listOwn(caller: Caller, reservationId: unknown, nowMs: number) {
    if (caller.role !== 'contributor' || !isUuid(reservationId)) throw new DefectRejected('not_found');
    try {
      if (!(await this.pool.query('SELECT 1 FROM external_reservations AS reservation JOIN external_accounts AS actor ON actor.id=reservation.contributor_id AND NOT actor.disabled WHERE reservation.id=$1 AND reservation.contributor_id=$2', [reservationId, caller.id])).rowCount) throw new DefectRejected('not_found');
      const rows = (await this.pool.query('SELECT id,task_id,task_version,reservation_id,category,description,received_at FROM external_package_defect_reports WHERE reservation_id=$1 AND contributor_id=$2 ORDER BY received_at,id', [reservationId, caller.id])).rows as DefectRow[];
      return rows.map(row => this.project(row));
    } catch (error) { throw error instanceof DefectRejected ? error : new DefectRejected('invalid_input'); }
  }

  private project(row: DefectRow) {
    return { schemaVersion: 1 as const, id: row.id, taskId: row.task_id, taskVersion: row.task_version, reservationId: row.reservation_id, category: row.category, description: row.description, receivedAt: iso(row.received_at) };
  }
}

export type { DefectCategory };

export type { PublicListing };
