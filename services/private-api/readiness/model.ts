/**
 * Readiness evidence model (M4.3). Records are immutable, hash-bound and
 * honestly classified: a failed external-context solve is a classified
 * failure — never automatically "ambiguity" or proof of human difficulty.
 * Pending evidence is never completed evidence; missing mandatory records or
 * approvals always block publication.
 */

export const READINESS_KINDS = Object.freeze(['fresh_build', 'traceability', 'ambiguity_review', 'external_solve', 'human_review', 'preservation_check', 'integration_check', 'reference_patch'] as const);
export type ReadinessKind = (typeof READINESS_KINDS)[number];
export const SOLVE_CAUSES = Object.freeze(['infrastructure', 'specification', 'implementation', 'other'] as const);
export type SolveCause = (typeof SOLVE_CAUSES)[number];
export const RECORD_STATUSES = Object.freeze(['passed', 'failed', 'unverified'] as const);
export type RecordStatus = (typeof RECORD_STATUSES)[number];
/** Kinds that must hold passed evidence before publication is even considered. */
export const MANDATORY_KINDS = Object.freeze(['fresh_build', 'traceability', 'preservation_check', 'integration_check'] as const);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const CODE = /^[a-z0-9_.-]{1,64}$/;

export interface ReadinessRecord {
  readonly recordId: string;
  readonly taskId: string;
  readonly taskVersion: number;
  readonly packageDigest: string;
  readonly kind: ReadinessKind;
  readonly status: RecordStatus;
  readonly reasonCode: string | null;
  readonly classifiedOutcome: SolveCause | null;
  readonly detailsDigest: string | null;
  readonly assurance: 'tested' | 'unverified';
  readonly recordedBy: string;
  readonly recordedAt: string;
}

export class ReadinessInvalid extends Error {
  constructor(readonly code: string) { super(`Readiness record rejected: ${code}.`); }
}

/** Classify a failed external-context solve. Never yields 'ambiguity'. */
export function classifySolveOutcome(cause: unknown): SolveCause {
  if (cause === 'infrastructure' || cause === 'specification' || cause === 'implementation' || cause === 'other') return cause;
  return 'other';
}

/** Strict validation — unknown fields, unbounded strings and bad statuses rejected. */
export function validateReadinessRecord(input: unknown): ReadinessRecord {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new ReadinessInvalid('invalid_record');
  const record = input as Record<string, unknown>;
  const allowed = ['recordId', 'taskId', 'taskVersion', 'packageDigest', 'kind', 'status', 'reasonCode', 'classifiedOutcome', 'detailsDigest', 'assurance', 'recordedBy', 'recordedAt'];
  if (Object.keys(record).some(key => !allowed.includes(key))) throw new ReadinessInvalid('invalid_record');
  for (const field of ['recordId', 'taskId', 'recordedBy']) if (typeof record[field] !== 'string' || !UUID.test(record[field] as string)) throw new ReadinessInvalid('invalid_record');
  if (!Number.isInteger(record['taskVersion']) || (record['taskVersion'] as number) < 1) throw new ReadinessInvalid('invalid_record');
  if (typeof record['packageDigest'] !== 'string' || !HASH.test(record['packageDigest'])) throw new ReadinessInvalid('invalid_record');
  if (!READINESS_KINDS.includes(record['kind'] as ReadinessKind)) throw new ReadinessInvalid('invalid_kind');
  if (!RECORD_STATUSES.includes(record['status'] as RecordStatus)) throw new ReadinessInvalid('invalid_status');
  if (record['status'] === 'passed' && record['reasonCode'] !== null && record['reasonCode'] !== undefined) throw new ReadinessInvalid('invalid_record');
  if (record['status'] !== 'passed' && (typeof record['reasonCode'] !== 'string' || !CODE.test(record['reasonCode']))) throw new ReadinessInvalid('invalid_record');
  const classified = record['classifiedOutcome'];
  if (record['kind'] === 'external_solve' && record['status'] === 'failed') {
    if (classified === undefined || classified === null) throw new ReadinessInvalid('solve_unclassified');
    if (classifySolveOutcome(classified) !== classified) throw new ReadinessInvalid('invalid_record');
  } else if (classified !== null && classified !== undefined && classifySolveOutcome(classified) !== classified) throw new ReadinessInvalid('invalid_record');
  if (record['detailsDigest'] !== null && record['detailsDigest'] !== undefined && (typeof record['detailsDigest'] !== 'string' || !HASH.test(record['detailsDigest']))) throw new ReadinessInvalid('invalid_record');
  if (record['assurance'] !== 'tested' && record['assurance'] !== 'unverified') throw new ReadinessInvalid('invalid_record');
  if (typeof record['recordedAt'] !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(record['recordedAt'])) throw new ReadinessInvalid('invalid_record');
  return Object.freeze({
    recordId: record['recordId'], taskId: record['taskId'], taskVersion: record['taskVersion'], packageDigest: record['packageDigest'],
    kind: record['kind'], status: record['status'],
    reasonCode: (record['reasonCode'] as string | undefined) ?? null,
    classifiedOutcome: (record['classifiedOutcome'] as SolveCause | undefined) ?? null,
    detailsDigest: (record['detailsDigest'] as string | undefined) ?? null,
    assurance: record['assurance'], recordedBy: record['recordedBy'], recordedAt: record['recordedAt'],
  } as ReadinessRecord);
}

export type BlockCode = 'missing_approval' | 'binding_mismatch' | 'missing_readiness' | 'readiness_unverified' | 'readiness_failure' | 'human_review_required';
export interface PublishGateInput {
  readonly taskId: string;
  readonly taskVersion: number;
  readonly packageDigest: string;
  readonly releaseApproved: boolean;
  readonly records: readonly ReadinessRecord[];
}
export interface PublishGateResult {
  readonly decision: 'publishable' | 'blocked';
  readonly reasons: readonly { code: BlockCode; kind: ReadinessKind | null }[];
  readonly evaluatedRecordIds: readonly string[];
}

/**
 * The publication gate. Every record must bind the exact task version and
 * package digest. Mandatory kinds require passed status; unverified is
 * blocked (pending evidence is not completed evidence). An external-solve
 * pass satisfies the solve requirement; a failed/absent solve requires a
 * passed human readiness review — the qualified-owner alternative — while
 * the classified solve failure stays on record.
 */
export function evaluatePublishGate(input: PublishGateInput): PublishGateResult {
  const reasons: { code: BlockCode; kind: ReadinessKind | null }[] = [];
  const relevant = input.records.filter(record => record.taskId === input.taskId && record.taskVersion === input.taskVersion);
  const mismatched = relevant.filter(record => record.packageDigest !== input.packageDigest);
  if (mismatched.length > 0) reasons.push({ code: 'binding_mismatch', kind: mismatched[0]!.kind });
  const bound = relevant.filter(record => record.packageDigest === input.packageDigest);
  const latest = new Map<ReadinessKind, ReadinessRecord>();
  for (const record of [...bound].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))) latest.set(record.kind, record);
  if (!input.releaseApproved) reasons.push({ code: 'missing_approval', kind: null });
  for (const kind of MANDATORY_KINDS) {
    const record = latest.get(kind);
    if (!record) reasons.push({ code: 'missing_readiness', kind });
    else if (record.status === 'unverified') reasons.push({ code: 'readiness_unverified', kind });
    else if (record.status === 'failed') reasons.push({ code: 'readiness_failure', kind });
  }
  const solve = latest.get('external_solve');
  const human = latest.get('human_review');
  if (solve?.status === 'passed') {
    // External-context solve evidence satisfied.
  } else if (solve?.status === 'unverified') {
    reasons.push({ code: 'readiness_unverified', kind: 'external_solve' });
  } else if (human?.status !== 'passed') {
    // Failed or absent solve requires the recorded qualified-owner review.
    reasons.push({ code: 'human_review_required', kind: 'external_solve' });
  }
  if (human?.status === 'unverified') reasons.push({ code: 'readiness_unverified', kind: 'human_review' });
  if (human?.status === 'failed') reasons.push({ code: 'readiness_failure', kind: 'human_review' });
  return Object.freeze({
    decision: reasons.length === 0 ? 'publishable' : 'blocked',
    reasons: Object.freeze(reasons),
    evaluatedRecordIds: Object.freeze(bound.map(record => record.recordId)),
  });
}
