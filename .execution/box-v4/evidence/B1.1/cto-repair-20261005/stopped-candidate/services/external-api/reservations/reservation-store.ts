import { contentHash } from '../../../packages/contracts/hash.js';
import { assertTransition } from '../../../packages/contracts/workflow/index.js';
import type { ExternalTaskContract } from '../../../packages/contracts/public/index.js';
import type { PublishedReleaseRecord, PublishedTaskPersistence } from '../tasks/persistence.js';
import { MemoryAssignmentStore, isUuid, type AssignmentRecord } from './assignments.js';

export const RESERVATION_REJECTIONS = ['assignment_required', 'executor_not_contributor', 'invitation_required', 'invitation_denied', 'task_unavailable', 'already_reserved', 'stale_version', 'invalid_transition', 'forbidden', 'not_found', 'in_review_conflict', 'stale_submission', 'reservation_expired', 'reservation_closed', 'invalid_input'] as const;
export type ReservationRejection = typeof RESERVATION_REJECTIONS[number];

/** Fixed safe boundary error: only the code is enumerable on the wire. */
export class ReservationRejected extends Error {
  readonly code: ReservationRejection;
  constructor(code: ReservationRejection) {
    super(code);
    Object.defineProperty(this, 'name', { value: 'ReservationRejected', enumerable: false, writable: false, configurable: true });
    this.code = code;
  }
}

export type Caller = { id: string; role: 'contributor' | 'owner' };
export type ReservationState = 'active' | 'in_review' | 'accepted' | 'expired' | 'cancelled';

export interface FrozenTerms {
  termsHash: string;
  reservationDurationSeconds: number;
  maxEvaluatedAttempts: number;
  maxPatchBytes: number;
  maxChangedLines: number;
  revisionPolicy: 'preserve_original_expiry';
  cancellationPolicy: string;
  packageDefectCompensation: { currency: string; amountMinor: number };
  budgetExhaustionPolicy: string;
}

export interface ReservationView {
  schemaVersion: 1;
  id: string;
  taskId: string;
  taskVersion: number;
  contributorId: string;
  state: ReservationState;
  executor: { kind: string; label: string };
  expiresAt: string;
  terms: FrozenTerms;
  version: number;
  reservedAt: string;
}

export interface ReservationRecord {
  id: string;
  taskId: string;
  taskVersion: number;
  contributorId: string;
  assignmentId: string;
  state: ReservationState;
  /** Frozen before any work starts; never reset or extended afterwards. */
  expiresAtMs: number;
  terms: FrozenTerms;
  version: number;
  reservedAtMs: number;
  attempts: string[];
  supersededAttempts: string[];
  acceptedAttempt: string | null;
}

export interface PublishedDependencies {
  published: PublishedTaskPersistence;
  assignments: MemoryAssignmentStore;
}

export { type AssignmentRecord };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function isUuidValue(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function frozenTermsOf(contract: ExternalTaskContract): FrozenTerms {
  return {
    termsHash: contentHash(contract.terms),
    reservationDurationSeconds: contract.terms.reservationDurationSeconds,
    maxEvaluatedAttempts: contract.terms.maxEvaluatedAttempts,
    maxPatchBytes: contract.terms.maxPatchBytes,
    maxChangedLines: contract.terms.maxChangedLines,
    revisionPolicy: 'preserve_original_expiry',
    cancellationPolicy: contract.terms.cancellationPolicy,
    packageDefectCompensation: { ...contract.terms.packageDefectCompensation },
    budgetExhaustionPolicy: contract.terms.budgetExhaustionPolicy
  };
}

function contributor_only(caller: Caller): void {
  if (typeof caller?.id !== 'string' || caller.role !== 'contributor') throw new ReservationRejected('forbidden');
}

/**
 * One-live-reservation store (M6.2). Injected-store model of the SQL
 * semantics the coordinator applies from the requested DDL: `CREATE UNIQUE
 * INDEX external_one_live_reservation ... WHERE state IN ('active','in_review')`
 * plus `SELECT ... FOR UPDATE` row locks mean concurrent reservations cannot
 * both win. Expiry is fixed before work starts and never resets or extends.
 */
export class MemoryReservationStore {
  private readonly reservations = new Map<string, ReservationRecord>();
  private readonly liveTasks = new Map<string, string>();

  constructor(private readonly context: PublishedDependencies) {}

  private liveKey(taskId: string, taskVersion: number): string {
    return `${taskId}:${taskVersion}`;
  }

  private of(caller: Caller, record: ReservationRecord): void {
    if (record.contributorId === caller.id) return;
    throw new ReservationRejected('not_found');
  }

  /**
   * Serialized acquire: mirrors `SELECT external_published_tasks FOR SHARE`
   * plus a conditional live-reservation insert inside one transaction. The
   * synchronous critical section plays the row lock's part in this model, so
   * concurrent callers observe at most one winner.
   */
  async reserve(caller: Caller, input: { taskId: unknown; taskVersion: unknown }, nowMs: number): Promise<ReservationView> {
    contributor_only(caller);
    if (!isUuidValue(input.taskId) || !Number.isSafeInteger(input.taskVersion) || (input.taskVersion as number) < 1 || (input.taskVersion as number) > 2147483647) throw new ReservationRejected('invalid_input');
    const taskId = input.taskId as string;
    const taskVersion = input.taskVersion as number;
    const record = await this.context.published.publishedVersion(taskId, taskVersion);
    if (!record || record.contract.taskId !== taskId || record.contract.version !== taskVersion) throw new ReservationRejected('task_unavailable');
    const assignment = await this.context.assignments.byTask(taskId, taskVersion);
    if (!assignment) throw new ReservationRejected('assignment_required');
    if (assignment.executor.kind !== 'human' || !assignment.invitation) throw new ReservationRejected('executor_not_contributor');
    if (assignment.invitation.contributorId !== caller.id) throw new ReservationRejected('invitation_denied');
    const binding = await this.context.assignments.runtimeContributorBinding(taskId, taskVersion, caller.id, nowMs);
    if (binding === 'invited_pending') throw new ReservationRejected('invitation_required');
    if (binding !== 'redeemed') throw new ReservationRejected('invitation_denied');
    return this.acquire(caller, { taskId, taskVersion, record, assignment }, nowMs);
  }

  private acquire(caller: Caller, parameters: { taskId: string; taskVersion: number; record: PublishedReleaseRecord; assignment: AssignmentRecord }, nowMs: number): ReservationView {
    const identity = `${parameters.taskId}:${parameters.taskVersion}`;
    const existing = this.reservations.get(this.liveTasks.get(identity) ?? '');
    if (existing && this.isLive(existing, nowMs)) throw new ReservationRejected('already_reserved');
    const terms = frozenTermsOf(parameters.record.contract);
    if (!Number.isSafeInteger(terms.reservationDurationSeconds) || terms.reservationDurationSeconds <= 0) throw new ReservationRejected('invalid_input');
    const id = crypto.randomUUID();
    const next: ReservationRecord = {
      id,
      taskId: parameters.taskId,
      taskVersion: parameters.taskVersion,
      contributorId: caller.id,
      assignmentId: parameters.assignment.id,
      state: 'active',
      expiresAtMs: nowMs + terms.reservationDurationSeconds * 1000,
      terms,
      version: 1,
      reservedAtMs: nowMs,
      attempts: [],
      supersededAttempts: [],
      acceptedAttempt: null
    };
    this.reservations.set(id, next);
    this.liveTasks.set(identity, id);
    return projection(next, parameters.assignment);
  }

  isLive(record: ReservationRecord, nowMs: number): boolean {
    return (record.state === 'active' || record.state === 'in_review') && record.expiresAtMs > nowMs;
  }

  private requireLiveRow(reservationId: unknown): ReservationRecord {
    if (!isUuidValue(reservationId)) throw new ReservationRejected('not_found');
    const record = this.reservations.get(reservationId as string);
    if (!record) throw new ReservationRejected('not_found');
    return record;
  }

  private requireContributor(caller: Caller, reservationId: unknown): ReservationRecord {
    const record = this.requireLiveRow(reservationId);
    if (record.contributorId !== caller.id) throw new ReservationRejected('not_found');
    return record;
  }

  private requireVersion(record: ReservationRecord, expectedVersion: unknown): void {
    if (!Number.isSafeInteger(expectedVersion) || (expectedVersion as number) !== record.version) throw new ReservationRejected('stale_version');
  }

  private assertUnexpired(record: ReservationRecord, nowMs: number): void {
    if (record.expiresAtMs <= nowMs) {
      this.finalizeExpired(record);
      throw new ReservationRejected(record.state === 'expired' ? 'reservation_expired' : 'invalid_transition');
    }
  }

  private finalizeExpired(record: ReservationRecord): void {
    if (record.state === 'active' || record.state === 'in_review') {
      assertTransition({ kind: 'reservation', from: record.state, to: 'expired', actor: 'system', expectedVersion: record.version, currentVersion: record.version });
      record.state = 'expired';
      record.version += 1;
    }
  }

  private transition(record: ReservationRecord, to: ReservationState): void {
    assertTransition({ kind: 'reservation', from: record.state, to, actor: record.contributorId ? 'contributor' : 'system', expectedVersion: record.version, currentVersion: record.version }, { reservationValid: true });
    record.state = to;
    record.version += 1;
  }

  /** Contributor read of one own reservation; reads never mutate stored state. */
  async reservation(caller: Caller, reservationId: unknown, nowMs: number): Promise<ReservationView> {
    contributor_only(caller);
    const record = this.requireContributor(caller, reservationId);
    return this.view(record);
  }

  /** Owner listing of the live reservation of one task version. */
  async forTask(caller: Caller, taskId: unknown, taskVersion: unknown, nowMs: number): Promise<ReservationView[]> {
    if (caller.role !== 'owner') throw new ReservationRejected('forbidden');
    if (!isUuidValue(taskId) || !Number.isSafeInteger(taskVersion)) throw new ReservationRejected('invalid_input');
    const record = this.reservations.get(this.liveTasks.get(this.liveKey(taskId as string, taskVersion as number)) ?? '');
    if (!record) return [];
    if (this.isLive(record, nowMs)) this.assertUnexpired(record, nowMs);
    return [await this.view(record)];
  }

  /** Batch expiry sweep at an observing instant; returns the number expired. */
  async expireDue(nowMs: number): Promise<number> {
    let count = 0;
    for (const record of this.reservations.values()) {
      if (record.expiresAtMs <= nowMs && (record.state === 'active' || record.state === 'in_review')) {
        this.finalizeExpired(record);
        count++;
      }
    }
    return count;
  }

  /** Contributor upload: state to in_review, superseding previous attempts. */
  async submitForReview(caller: Caller, input: { reservationId: unknown; submissionId: unknown; expectedVersion: number }, nowMs: number): Promise<ReservationView> {
    contributor_only(caller);
    const record = this.requireContributor(caller, input.reservationId);
    if (typeof input.submissionId !== 'string' || input.submissionId.length < 1 || input.submissionId.length > 64) throw new ReservationRejected('invalid_input');
    this.requireVersion(record, input.expectedVersion);
    this.assertUnexpired(record, nowMs);
    if (record.state === 'in_review') throw new ReservationRejected('in_review_conflict');
    if (record.state === 'active') {
      assertTransition({ kind: 'reservation', from: 'active', to: 'in_review', actor: 'contributor', expectedVersion: record.version, currentVersion: record.version }, { reservationValid: true });
    } else {
      throw new ReservationRejected('invalid_transition');
    }
    record.supersededAttempts.push(...record.attempts);
    record.attempts = [String(input.submissionId)];
    record.state = 'in_review';
    record.version += 1;
    return this.view(record);
  }

  /** Owner decision: changes_required reactivates without extending expiry. */
  async changesRequired(caller: Caller, input: { reservationId: unknown; expectedVersion: number }, nowMs: number): Promise<ReservationView> {
    if (caller.role !== 'owner') throw new ReservationRejected('forbidden');
    const record = this.requireLiveRow(input.reservationId);
    if (record.contributorId === caller.id && caller.role !== 'owner') throw new ReservationRejected('forbidden');
    this.requireVersion(record, input.expectedVersion);
    this.assertUnexpired(record, nowMs);
    if (record.state !== 'in_review') throw new ReservationRejected('invalid_transition');
    assertTransition({ kind: 'reservation', from: 'in_review', to: 'active', actor: 'owner', expectedVersion: record.version, currentVersion: record.version }, { reservationValid: true });
    record.attempts = [];
    record.supersededAttempts = [];
    record.state = 'active';
    record.version += 1;
    return this.view(record);
  }

  /** Owner acceptance of the latest non-superseded attempt only. */
  async accept(caller: Caller, input: { reservationId: unknown; submissionId: unknown; expectedVersion: number }, nowMs: number): Promise<ReservationView> {
    if (caller.role !== 'owner') throw new ReservationRejected('forbidden');
    const record = this.requireLiveRow(input.reservationId);
    this.requireVersion(record, input.expectedVersion);
    this.assertUnexpired(record, nowMs);
    if (record.state !== 'in_review') throw new ReservationRejected('invalid_transition');
    if (typeof input.submissionId !== 'string' || input.submissionId.length < 1) throw new ReservationRejected('invalid_input');
    if (record.supersededAttempts.includes(input.submissionId) || (record.attempts[0] !== undefined && record.attempts[0] !== input.submissionId) || record.attempts.length === 0) throw new ReservationRejected('stale_submission');
    assertTransition({ kind: 'reservation', from: record.state, to: 'accepted', actor: 'owner', expectedVersion: record.version, currentVersion: record.version }, { reservationValid: true });
    record.acceptedAttempt = input.submissionId;
    record.state = 'accepted';
    record.version += 1;
    return this.view(record);
  }

  /** Contributor cancellation before expiry; frozen terms are preserved. */
  async cancel(caller: Caller, input: { reservationId: unknown; expectedVersion: number }, nowMs: number): Promise<ReservationView> {
    contributor_only(caller);
    const record = this.requireContributor(caller, input.reservationId);
    this.requireVersion(record, input.expectedVersion);
    this.assertUnexpired(record, nowMs);
    if (record.state !== 'active' && record.state !== 'in_review') throw new ReservationRejected('invalid_transition');
    assertTransition({ kind: 'reservation', from: record.state, to: 'cancelled', actor: 'contributor', expectedVersion: record.version, currentVersion: record.version }, { reservationValid: true });
    record.supersededAttempts.push(...record.attempts);
    record.attempts = [];
    record.state = 'cancelled';
    record.version += 1;
    return this.view(record);
  }

  private async view(record: ReservationRecord): Promise<ReservationView> {
    const assignment = await this.context.assignments.byId(record.assignmentId);
    if (!assignment) throw new ReservationRejected('not_found');
    return projection(record, assignment);
  }
}

export function projection(record: ReservationRecord, assignment: AssignmentRecord): ReservationView {
  return {
    schemaVersion: 1,
    id: record.id,
    taskId: record.taskId,
    taskVersion: record.taskVersion,
    contributorId: record.contributorId,
    state: record.state,
    executor: { ...assignment.executor },
    expiresAt: new Date(record.expiresAtMs).toISOString(),
    terms: structuredClone(record.terms),
    version: record.version,
    reservedAt: new Date(record.reservedAtMs).toISOString()
  };
}
