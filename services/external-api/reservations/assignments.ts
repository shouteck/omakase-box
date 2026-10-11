import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const ASSIGNMENT_API_PREFIX = '/v1/assignments';

export const EXECUTOR_KINDS = ['human', 'ai', 'team'] as const;
export type ExecutorKind = typeof EXECUTOR_KINDS[number];

export const ASSIGNMENT_REJECTIONS = ['invalid_input', 'not_found', 'assignment_conflict', 'invitation_denied'] as const;
export type AssignmentRejection = typeof ASSIGNMENT_REJECTIONS[number];

/** Fixed safe boundary error: only the code is enumerable on the wire. */
export class AssignmentRejected extends Error {
  readonly code: AssignmentRejection;
  constructor(code: AssignmentRejection) {
    super(code);
    Object.defineProperty(this, 'name', { value: 'AssignmentRejected', enumerable: false, writable: false, configurable: true });
    this.code = code;
  }
}

export type ExecutorChoice = Readonly<{ kind: ExecutorKind; label: string }>;
export type AssignmentStatus = 'open' | 'active' | 'expired' | 'completed' | 'withdrawn';

export interface AssignmentRecord {
  id: string;
  taskId: string;
  taskVersion: number;
  executor: ExecutorChoice;
  status: AssignmentStatus;
  chosenBy: string;
  /** Present only for `human` choices: exactly one invitation, bound to the chosen contributor account. */
  invitation?: { tokenHash: string; expiresAtMs: number; redeemedAtMs: number | null; revoked: boolean; contributorId: string };
  version: number;
  createdAtMs: number;
}

export interface AssignmentView {
  schemaVersion: 1;
  id: string;
  taskId: string;
  taskVersion: number;
  executor: ExecutorChoice;
  status: AssignmentStatus;
  chosenBy: string;
  createdAt: string;
}

export interface InvitationView {
  schemaVersion: 1;
  assignmentId: string;
  token: string;
  expiresAt: string;
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

export function assertExecutorInput(input: unknown): asserts input is { taskId: string; taskVersion: number; executor: { kind: ExecutorKind; label: string; contributorId?: string }; chosenBy: string } {
  const value = input as { taskId?: unknown; taskVersion?: unknown; executor?: { kind?: unknown; label?: unknown; contributorId?: unknown }; chosenBy?: unknown };
  if (
    value === null || typeof value !== 'object' ||
    !isUuid(value.taskId) ||
    !Number.isSafeInteger(value.taskVersion) || (value.taskVersion as number) < 1 || (value.taskVersion as number) > 2147483647 ||
    typeof value.executor !== 'object' || value.executor === null ||
    typeof value.executor.kind !== 'string' || !EXECUTOR_KINDS.includes(value.executor.kind as ExecutorKind) ||
    typeof value.executor.label !== 'string' || value.executor.label.length < 3 || value.executor.label.length > 120 || value.executor.label !== value.executor.label.trim() ||
    typeof value.chosenBy !== 'string' || value.chosenBy.length < 3 || value.chosenBy.length > 120
  ) throw new AssignmentRejected('invalid_input');
  const kind = value.executor.kind as ExecutorKind;
  const { contributorId } = value.executor;
  if (contributorId !== undefined && !isUuid(contributorId)) throw new AssignmentRejected('invalid_input');
  if (kind === 'human' && contributorId === undefined) throw new AssignmentRejected('invalid_input');
  if (kind !== 'human' && contributorId !== undefined) throw new AssignmentRejected('invalid_input');
}

export function tokenHash(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function safeTokenCompare(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

/**
 * Customer executor-choice store (M6.2). The customer/owner picks `human`,
 * `ai` or `team` explicitly with a descriptive label; this store persists the
 * choice and performs no routing, ranking or capability inference. A `human`
 * choice carries a one-time M1.3-style invitation bound to the exact invited
 * contributor account; `ai` and `team` remain descriptive labels only.
 */
export class MemoryAssignmentStore {
  private readonly byTaskIndex = new Map<string, string>();
  private readonly assignments = new Map<string, AssignmentRecord>();

  /** Records the explicit customer choice. One assignment per task version. */
  async chooseExecutor(input: unknown, nowMs: number): Promise<AssignmentView> {
    assertExecutorInput(input);
    const { taskId, taskVersion, executor, chosenBy } = input;
    if (this.byTaskIndex.has(`${taskId}:${taskVersion}`)) throw new AssignmentRejected('assignment_conflict');
    const id = randomUUID();
    const record: AssignmentRecord = {
      id, taskId, taskVersion,
      executor: { kind: executor.kind, label: executor.label },
      status: 'open', chosenBy,
      ...executor.kind === 'human' && executor.contributorId ? { invitation: { tokenHash: '', expiresAtMs: 0, redeemedAtMs: null, revoked: false, contributorId: executor.contributorId } } : {},
      version: 1, createdAtMs: nowMs
    };
    this.assignments.set(id, record);
    this.byTaskIndex.set(`${taskId}:${taskVersion}`, id);
    return projection(record);
  }

  async byTask(taskId: string, taskVersion: number): Promise<AssignmentRecord | null> {
    return structuredClone(this.assignments.get(this.byTaskIndex.get(`${taskId}:${taskVersion}`) ?? '') ?? null);
  }

  async byId(id: string): Promise<AssignmentRecord | null> {
    return structuredClone(this.assignments.get(id) ?? null);
  }

  /** Issues a fresh one-time invitation for a human assignment. Owner caller only. */
  async issueInvitation(assignmentId: string, actor: { role: string }, nowMs: number): Promise<InvitationView> {
    if (actor.role !== 'owner') throw new AssignmentRejected('invalid_input');
    const record = this.assignments.get(assignmentId);
    if (!record) throw new AssignmentRejected('not_found');
    if (!record.invitation || record.invitation.revoked) throw new AssignmentRejected('invalid_input');
    const token = randomBytes(32).toString('hex');
    record.invitation = { ...record.invitation, tokenHash: tokenHash(token), expiresAtMs: nowMs + 3600_000, redeemedAtMs: null, revoked: false, contributorId: record.invitation.contributorId };
    return { schemaVersion: 1, assignmentId: record.id, token, expiresAt: new Date(record.invitation.expiresAtMs).toISOString() };
  }

  /**
   * Redeems the invitation exactly per the accepted M1.3 semantics: valid
   * digest, unexpired, not revoked, not already redeemed, and the redeeming
   * account must match the bound contributor.
   */
  async recordRedemption(token: string, contributorId: string, nowMs: number): Promise<void> {
    if (!/^[0-9a-f]{64}$/.test(token) || !isUuid(contributorId)) throw new AssignmentRejected('invalid_input');
    const digest = tokenHash(token);
    for (const record of this.assignments.values()) {
      if (record.invitation?.tokenHash !== digest) continue;
      const invitation = record.invitation;
      if (invitation.revoked || invitation.redeemedAtMs !== null || invitation.expiresAtMs <= nowMs || invitation.contributorId !== contributorId) throw new AssignmentRejected('invitation_denied');
      invitation.redeemedAtMs = nowMs;
      record.status = 'active';
      return;
    }
    throw new AssignmentRejected('invitation_denied');
  }

  /** True exactly when the assignment is a redeemed human invitation for this contributor. */
  async runtimeContributorBinding(taskId: string, taskVersion: number, contributorId: string, nowMs: number): Promise<'redeemed' | 'none' | 'invited_pending'> {
    const record = await this.byTask(taskId, taskVersion);
    if (!record || record.invitation === undefined || record.invitation.contributorId !== contributorId) return 'none';
    if (record.invitation.redeemedAtMs === null || record.invitation.revoked) return 'invited_pending';
    return record.status === 'active' ? 'redeemed' : 'none';
  }

  projectionOf(record: AssignmentRecord): AssignmentView {
    return projection(record);
  }
}

export function projection(record: AssignmentRecord): AssignmentView {
  return {
    schemaVersion: 1,
    id: record.id,
    taskId: record.taskId,
    taskVersion: record.taskVersion,
    executor: { ...record.executor },
    status: record.status,
    chosenBy: record.chosenBy,
    createdAt: new Date(record.createdAtMs).toISOString()
  };
}

export const ASSIGNMENT_DDL = `
CREATE TABLE external_task_assignments (
  id uuid PRIMARY KEY,
  task_id uuid NOT NULL,
  task_version integer NOT NULL CHECK (task_version BETWEEN 1 AND 2147483647),
  executor_kind varchar(8) NOT NULL CHECK (executor_kind IN ('human','ai','team')),
  executor_label text NOT NULL,
  contributor_id uuid REFERENCES external_accounts(id),
  status varchar(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open','active','expired','completed','withdrawn')),
  chosen_by text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_task_assignment_content UNIQUE (task_id, task_version),
  CONSTRAINT external_task_assignment_contributor_shape CHECK (
    (executor_kind = 'human' AND contributor_id IS NOT NULL) OR (executor_kind <> 'human' AND contributor_id IS NULL)
  )
);

CREATE TABLE external_task_invitations (
  id uuid PRIMARY KEY,
  assignment_id uuid NOT NULL REFERENCES external_task_assignments(id),
  token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  contributor_id uuid NOT NULL REFERENCES external_accounts(id),
  expires_at timestamptz NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  redeemed_at timestamptz,
  CONSTRAINT external_task_invitation_one_active UNIQUE (assignment_id)
);

CREATE TABLE external_reservation_attempts (
  submission_id uuid PRIMARY KEY,
  reservation_id uuid NOT NULL REFERENCES external_reservations(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  superseded boolean NOT NULL DEFAULT false
);
CREATE INDEX external_reservation_attempts_live ON external_reservation_attempts (reservation_id) WHERE NOT superseded;

CREATE TABLE external_package_defect_reports (
  id uuid PRIMARY KEY,
  reservation_id uuid NOT NULL REFERENCES external_reservations(id),
  contributor_id uuid NOT NULL REFERENCES external_accounts(id),
  task_id uuid NOT NULL,
  task_version integer NOT NULL CHECK (task_version BETWEEN 1 AND 2147483647),
  category varchar(48) NOT NULL CHECK (category IN ('missing_context','missing_dependency','environment_failure','documentation_failure','other')),
  description text NOT NULL CHECK (char_length(description) BETWEEN 12 AND 4000),
  idempotency_key uuid NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_package_defect_idempotency UNIQUE (contributor_id, idempotency_key)
);

CREATE INDEX external_package_defect_reports_reservation ON external_package_defect_reports (reservation_id, received_at);

CREATE FUNCTION external_reservation_record_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'external_task_assignments' AND TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'assignment_records_preserved';
  END IF;
  IF TG_TABLE_NAME = 'external_package_defect_reports' THEN
    RAISE EXCEPTION 'defect_reports_immutable';
  END IF;
  IF TG_TABLE_NAME = 'external_reservation_attempts' AND TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'attempt_lineage_preserved';
  END IF;
  IF TG_TABLE_NAME = 'external_task_invitations' AND TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'invitation_records_preserved';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'external_task_assignments' THEN
      IF OLD.id IS DISTINCT FROM NEW.id OR OLD.task_id IS DISTINCT FROM NEW.task_id OR OLD.task_version IS DISTINCT FROM NEW.task_version
        OR OLD.executor_kind IS DISTINCT FROM NEW.executor_kind OR OLD.executor_label IS DISTINCT FROM NEW.executor_label
        OR OLD.contributor_id IS DISTINCT FROM NEW.contributor_id OR OLD.chosen_by IS DISTINCT FROM NEW.chosen_by
        OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
        RAISE EXCEPTION 'assignment_choice_immutable';
      END IF;
    END IF;
    IF TG_TABLE_NAME = 'external_task_invitations' THEN
      IF OLD.id IS DISTINCT FROM NEW.id OR OLD.assignment_id IS DISTINCT FROM NEW.assignment_id
        OR OLD.token_hash IS DISTINCT FROM NEW.token_hash OR OLD.contributor_id IS DISTINCT FROM NEW.contributor_id THEN
        RAISE EXCEPTION 'invitation_binding_immutable';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
ALTER TABLE external_reservations ADD COLUMN reserved_at timestamptz NOT NULL DEFAULT now();
CREATE TRIGGER external_task_assignments_preserved BEFORE DELETE ON external_task_assignments FOR EACH ROW EXECUTE FUNCTION external_reservation_record_guard();
CREATE TRIGGER external_task_assignments_choice_immutable BEFORE UPDATE ON external_task_assignments FOR EACH ROW EXECUTE FUNCTION external_reservation_record_guard();
CREATE TRIGGER external_task_invitations_preserved BEFORE DELETE ON external_task_invitations FOR EACH ROW EXECUTE FUNCTION external_reservation_record_guard();
CREATE TRIGGER external_task_invitations_binding_immutable BEFORE UPDATE ON external_task_invitations FOR EACH ROW EXECUTE FUNCTION external_reservation_record_guard();
CREATE TRIGGER external_reservation_attempts_preserved BEFORE DELETE ON external_reservation_attempts FOR EACH ROW EXECUTE FUNCTION external_reservation_record_guard();
CREATE TRIGGER external_package_defect_reports_immutable BEFORE UPDATE OR DELETE ON external_package_defect_reports FOR EACH ROW EXECUTE FUNCTION external_reservation_record_guard();
`;
