import { InternalEvaluationResultSchema } from '../../contracts/private/index.js';
import type { InternalEvaluationResult } from '../../contracts/private/index.js';
import { PublicFeedbackSchema } from '../../contracts/public/index.js';
import type { PublicFeedback } from '../../contracts/public/index.js';
import { byteHash } from '../../contracts/hash.js';

/** Outcome vocabulary shared with packages/contracts InternalEvaluationResult. */
export type EvaluationOutcome = 'contract_failure' | 'integration_failure' | 'package_defect' | 'infrastructure_failure' | 'passed' | 'unverified';

/**
 * Pure evaluation result classification over bounded runner-output records.
 * This module never imports private service internals and never executes
 * candidate code. It only classifies trusted runner data and projects bounded
 * public vocabulary from evidence records.
 */

export const LOG_BYTE_LIMIT = 1048576;
export const PAYLOAD_DIGEST_INPUT_LIMIT = 65536;
export const FEEDBACK_CATEGORY_LIMIT = 512;

export type JobKind = 'public' | 'private';
export type VerifiedOutcome = 'passed' | 'failed' | 'unverified';
export type EvidenceClass = 'verified' | 'unverified' | 'infrastructure';
export type EvidenceOutcome = VerifiedOutcome | 'infrastructure';
export type InfrastructureCause =
  | 'timeout'
  | 'interrupted'
  | 'lease_lost'
  | 'runner_unavailable';
export type AnomalyCause =
  | 'unauthenticated_result'
  | 'binding_mismatch'
  | 'stale_result'
  | 'late_result'
  | 'replayed_result'
  | 'malformed_result'
  | 'incomplete_result'
  | 'contradictory_result'
  | 'log_mismatch'
  | 'lease_missing'
  | 'untrusted_source'
  | 'runner_reported_unverified';

export const INFRASTRUCTURE_CAUSES: readonly InfrastructureCause[] = Object.freeze(['timeout', 'interrupted', 'lease_lost', 'runner_unavailable']);
export const ANOMALY_CAUSES: readonly AnomalyCause[] = Object.freeze(['unauthenticated_result', 'binding_mismatch', 'stale_result', 'late_result', 'replayed_result', 'malformed_result', 'incomplete_result', 'contradictory_result', 'log_mismatch', 'lease_missing', 'untrusted_source', 'runner_reported_unverified']);

export type EvaluationState =
  | 'received'
  | 'public_evaluating'
  | 'private_evaluating'
  | 'owner_review'
  | 'accepted'
  | 'changes_required'
  | 'package_defect'
  | 'infrastructure_failure'
  | 'expired';

export type FeedbackCategory = PublicFeedback['category'];

const CATEGORY_BY_STATE: Record<EvaluationState, FeedbackCategory> = {
  received: 'received',
  public_evaluating: 'processing',
  private_evaluating: 'processing',
  owner_review: 'owner_review',
  accepted: 'accepted',
  changes_required: 'changes_required',
  package_defect: 'package_defect',
  infrastructure_failure: 'infrastructure_issue',
  expired: 'expired'
};

export interface VerifiedCheck {
  readonly checkId: string;
  readonly outcome: VerifiedOutcome;
}

export interface ResultRecord {
  readonly jobId: string;
  readonly jobKind: JobKind;
  readonly packageHash: string;
  readonly submissionHash: string;
  readonly artifactHash: string;
  readonly imageDigest: string;
  readonly harnessId: string;
  readonly harnessDigest: string;
  readonly outcome: VerifiedOutcome;
  readonly checks: readonly VerifiedCheck[];
  readonly logDigest: string;
}

export interface JobBinding {
  readonly jobId: string;
  readonly jobKind: JobKind;
  readonly packageHash: string;
  readonly submissionHash: string;
  readonly artifactHash: string;
  readonly imageDigest: string;
  readonly harnessId: string;
  readonly harnessDigest: string;
  readonly revision: {
    readonly taskId: string;
    readonly taskVersion: number;
    readonly privateBaseRevision: string;
  };
}

export interface EvidenceRecord {
  readonly jobId: string;
  readonly jobKind: JobKind;
  readonly evidenceClass: EvidenceClass;
  readonly outcome: EvidenceOutcome;
  readonly cause: InfrastructureCause | AnomalyCause | null;
  readonly checks: readonly VerifiedCheck[];
  readonly logDigest: string | null;
  readonly payloadDigest: string | null;
  readonly binding: JobBinding;
}

export class EvidenceClassificationError extends Error {
  constructor(message: string) { super(message); }
}

function isHex64(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function assertHash(value: unknown, label: string): asserts value is string {
  if (!isHex64(value)) throw new EvidenceClassificationError(`${label} is not a bounded sha256 digest.`);
}

function assertOpaqueId(value: unknown, label: string): asserts value is string {
  if (!isUuid(value)) throw new EvidenceClassificationError(`${label} is not a bounded opaque id.`);
}

function assertJobBinding(binding: JobBinding): void {
  assertOpaqueId(binding.jobId, 'binding job id');
  if (binding.jobKind !== 'public' && binding.jobKind !== 'private') throw new EvidenceClassificationError('binding job kind is not public or private.');
  for (const field of ['packageHash', 'submissionHash', 'artifactHash', 'harnessDigest'] as const) assertHash(binding[field]!, `binding ${field}`);
  if (typeof binding.imageDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(binding.imageDigest)) throw new EvidenceClassificationError('binding image digest is not a bounded image digest.');
  if (typeof binding.harnessId !== 'string' || binding.harnessId.length === 0 || binding.harnessId.length > 64) throw new EvidenceClassificationError('binding harness id is not bounded.');
  assertOpaqueId(binding.revision.taskId, 'revision task id');
  if (!Number.isInteger(binding.revision.taskVersion) || binding.revision.taskVersion < 1) throw new EvidenceClassificationError('revision task version is not a bounded positive integer.');
  assertHash(binding.revision.privateBaseRevision, 'revision base');
}

function outcomeForClass(allowed: readonly EvidenceOutcome[], value: EvidenceOutcome, label: string): EvidenceOutcome {
  if (!allowed.includes(value)) throw new EvidenceClassificationError(`${label} is not consistent with the evidence class.`);
  return value;
}

function causeFor(cause: InfrastructureCause | AnomalyCause | null, allowed: readonly (InfrastructureCause | AnomalyCause)[]): InfrastructureCause | AnomalyCause | null {
  if (cause === null) return null;
  if (!allowed.includes(cause) || typeof cause !== 'string') throw new EvidenceClassificationError('evidence cause is not a bounded known value.');
  return cause;
}

export function verifiedResultEvidence(binding: JobBinding, record: ResultRecord): EvidenceRecord {
  assertJobBinding(binding);
  for (const field of ['packageHash', 'submissionHash', 'artifactHash', 'harnessDigest'] as const) if (record[field]! !== binding[field]!) throw new EvidenceClassificationError(`verified result ${field} does not match the immutable job binding.`);
  if (record.jobKind !== binding.jobKind) throw new EvidenceClassificationError('verified result job kind does not match the immutable job binding.');
  if (record.jobId !== binding.jobId) throw new EvidenceClassificationError('verified result job id does not match the immutable job binding.');
  if (record.imageDigest !== binding.imageDigest) throw new EvidenceClassificationError('verified result image digest does not match the immutable job binding.');
  if (record.harnessId !== binding.harnessId) throw new EvidenceClassificationError('verified result harness id does not match the immutable job binding.');
  assertHash(record.logDigest, 'verified log digest');
  if (!Array.isArray(record.checks) || record.checks.length === 0 || record.checks.length > 1024) throw new EvidenceClassificationError('verified result has no bounded check set.');
  for (const check of record.checks) {
    if (typeof check.checkId !== 'string' || check.checkId.length < 1 || check.checkId.length > 80 || /[^a-zA-Z0-9_.-]/.test(check.checkId)) throw new EvidenceClassificationError('verified result has an unbounded check id.');
    if (check.outcome !== 'passed' && check.outcome !== 'failed' && check.outcome !== 'unverified') throw new EvidenceClassificationError('verified result has an unknown check outcome.');
  }
  const outcome = outcomeForClass(['passed', 'failed'], record.outcome, 'verified outcome');
  if (outcome === 'passed' && record.checks.some(check => check.outcome !== 'passed')) throw new EvidenceClassificationError('verified passed verdict contradicts its own check outcomes.');
  return Object.freeze({
    jobId: binding.jobId,
    jobKind: binding.jobKind,
    evidenceClass: 'verified' as const,
    outcome,
    cause: null,
    checks: Object.freeze([...record.checks]),
    logDigest: record.logDigest,
    payloadDigest: null,
    binding
  });
}

export function infrastructureEvidence(binding: JobBinding, cause: InfrastructureCause, logDigest: string | null): EvidenceRecord {
  assertJobBinding(binding);
  causeFor(cause, INFRASTRUCTURE_CAUSES);
  if (logDigest !== null) assertHash(logDigest, 'infrastructure log digest');
  return Object.freeze({
    jobId: binding.jobId,
    jobKind: binding.jobKind,
    evidenceClass: 'infrastructure' as const,
    outcome: 'infrastructure' as const,
    cause,
    checks: Object.freeze([]),
    logDigest,
    payloadDigest: null,
    binding
  });
}

export function anomalyEvidence(binding: JobBinding, cause: AnomalyCause, logDigest: string | null, payloadDigest: string | null): EvidenceRecord {
  assertJobBinding(binding);
  causeFor(cause, ANOMALY_CAUSES);
  if (logDigest !== null) assertHash(logDigest, 'anomaly log digest');
  if (payloadDigest !== null) assertHash(payloadDigest, 'anomaly payload digest');
  return Object.freeze({
    jobId: binding.jobId,
    jobKind: binding.jobKind,
    evidenceClass: 'unverified' as const,
    outcome: 'unverified' as const,
    cause,
    checks: Object.freeze([]),
    logDigest,
    payloadDigest,
    binding
  });
}

export interface EvidenceCoverage {
  readonly public: number;
  readonly private: number;
  readonly complete: boolean;
}

export interface AuthoritativeAggregate {
  readonly outcome: EvaluationOutcome;
  readonly coverage: EvidenceCoverage;
}

/**
 * Aggregate authoritative evidence. Public results never satisfy private
 * requirements and vice versa: a passing aggregate requires verified passing
 * evidence for both job kinds. Infrastructure and unverified evidence can
 * never yield passed.
 */
export function aggregateAuthoritativeOutcome(records: readonly EvidenceRecord[]): AuthoritativeAggregate {
  const publicRecords = records.filter(record => record.jobKind === 'public');
  const privateRecords = records.filter(record => record.jobKind === 'private');
  const coverage: EvidenceCoverage = Object.freeze({
    public: publicRecords.length,
    private: privateRecords.length,
    complete: publicRecords.length > 0 && privateRecords.length > 0
  });
  const reject = (outcome: EvaluationOutcome): AuthoritativeAggregate => Object.freeze({ outcome, coverage });
  if (records.some(record => record.evidenceClass !== 'verified' && record.evidenceClass !== 'unverified' && record.evidenceClass !== 'infrastructure')) throw new EvidenceClassificationError('evidence class is unknown.');
  if (records.some(record => record.evidenceClass === 'infrastructure')) return reject('infrastructure_failure');
  if (records.some(record => record.evidenceClass === 'unverified')) return reject('unverified');
  if (!coverage.complete) return reject('unverified');
  if (privateRecords.some(record => record.outcome === 'failed')) return reject('integration_failure');
  if (publicRecords.some(record => record.outcome === 'failed')) return reject('contract_failure');
  for (const record of records) {
    if (record.outcome !== 'passed' || record.checks.length === 0 || record.checks.some(check => check.outcome !== 'passed')) return reject('unverified');
  }
  return Object.freeze({ outcome: 'passed', coverage });
}

export class EvaluationNotPassedError extends Error {
  constructor(readonly aggregate: EvaluationOutcome) { super('authoritative evidence does not establish a passed aggregate.'); }
}

const TRACE_LIMITATIONS = [
  'Evaluation evidence records bounded digests for evaluated bindings; semantic confidentiality is not established.'
] as const;

export interface EvaluationResultInput {
  readonly evaluationId: string;
  readonly attemptId: string;
  readonly submissionHash: string;
  readonly packageHash: string;
  readonly privateBaseRevision: string;
}

/**
 * Build the immutable internal evaluation result for owner review. Returns
 * only a schema-valid result whose outcome is passed; otherwise it throws
 * EvaluationNotPassedError. Raw private logs are bounded to 1 MiB and never
 * sent anywhere except private storage.
 */
export function buildInternalEvaluationResult(input: EvaluationResultInput, records: readonly EvidenceRecord[], privateLogs: Uint8Array): InternalEvaluationResult {
  const aggregate = aggregateAuthoritativeOutcome(records);
  if (aggregate.outcome !== 'passed') throw new EvaluationNotPassedError(aggregate.outcome);
  const evidence = records.flatMap(record => record.checks.map(check => ({
    checkId: check.checkId,
    jobId: record.jobId,
    jobKind: record.jobKind,
    artifactHash: record.binding.artifactHash,
    harnessDigest: record.binding.harnessDigest,
    outcome: check.outcome
  })));
  assertOpaqueId(input.evaluationId, 'evaluation id');
  assertOpaqueId(input.attemptId, 'attempt id');
  for (const field of ['submissionHash', 'packageHash', 'privateBaseRevision'] as const) assertHash(input[field]!, `evaluation ${field}`);
  if (privateLogs.length > LOG_BYTE_LIMIT) throw new EvidenceClassificationError('private log bound exceeded.');
  return InternalEvaluationResultSchema.parse({
    schemaVersion: 1,
    evaluationId: input.evaluationId,
    attemptId: input.attemptId,
    submissionHash: input.submissionHash,
    packageHash: input.packageHash,
    privateBaseRevision: input.privateBaseRevision,
    outcome: aggregate.outcome,
    evidence,
    privateLogs: new TextDecoder('utf-8', { fatal: false }).decode(privateLogs),
    limitations: [...TRACE_LIMITATIONS]
  });
}

export interface PreparedCapture {
  readonly bytes: Uint8Array;
  readonly digest: string;
  readonly complete: boolean;
  readonly originalByteCount: number;
}

/**
 * Bound and deterministically truncate a captured log. Truncation backs up at
 * most three bytes to avoid cutting inside a UTF-8 sequence and is stable for
 * identical inputs. The digest always names exactly the stored bytes.
 */
export function trimCapture(bytes: Uint8Array, limit: number = LOG_BYTE_LIMIT): PreparedCapture {
  const originalByteCount = bytes.length;
  if (originalByteCount > limit) {
    let cut = limit;
    while (cut > limit - 3 && cut > 0 && cut < originalByteCount && (bytes[cut]! & 0xc0) === 0x80) cut -= 1;
    const bounded = bytes.slice(0, cut);
    return Object.freeze({ bytes: bounded, digest: byteHash(bounded), complete: false, originalByteCount });
  }
  return Object.freeze({ bytes, digest: byteHash(bytes), complete: true, originalByteCount });
}

export interface ExactEvidenceBinding extends JobBinding {}

/** Compare a recorded evidence binding against the authoritative expectation and report every mismatch field. */
export function verifyEvidenceBinding(evidence: EvidenceRecord, expected: ExactEvidenceBinding): readonly string[] {
  const mismatches: string[] = [];
  const expectedFields: readonly (keyof JobBinding)[] = ['jobId', 'jobKind', 'packageHash', 'submissionHash', 'artifactHash', 'imageDigest', 'harnessId', 'harnessDigest'];
  for (const field of expectedFields) if (evidence.binding[field]! !== expected[field]!) mismatches.push(String(field));
  for (const field of ['taskId', 'taskVersion', 'privateBaseRevision'] as const) if (evidence.binding.revision[field]! !== expected.revision[field]!) mismatches.push(`revision.${field}`);
  return Object.freeze(mismatches);
}

export interface PublicFeedbackProjection {
  readonly publicId: string;
  readonly releasePolicyVersion: number;
  readonly evaluationState: EvaluationState;
  readonly evidence: readonly EvidenceRecord[];
}

/** Project the bounded public feedback vocabulary. Private evidence contributes no details and never leaks raw data. */
export function projectPublicFeedback(input: PublicFeedbackProjection): PublicFeedback {
  const category = CATEGORY_BY_STATE[input.evaluationState as EvaluationState];
  if (category === undefined) throw new EvidenceClassificationError('evaluation state is not part of the bounded public vocabulary.');
  if (typeof input.publicId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.publicId)) throw new EvidenceClassificationError('public id is not a bounded opaque id.');
  if (!Number.isInteger(input.releasePolicyVersion) || input.releasePolicyVersion < 1) throw new EvidenceClassificationError('release policy version is not a bounded positive integer.');
  const details = input.evidence
    .filter(record => record.jobKind === 'public' && record.evidenceClass === 'verified')
    .flatMap(record => record.checks.map(check => ({
      checkId: check.checkId,
      jobKind: 'public' as const,
      outcome: check.outcome,
      messageCode: check.outcome === 'passed' ? 'passed' as const : check.outcome === 'failed' ? 'requirement_not_met' as const : 'check_unavailable' as const
    })))
    .slice(0, FEEDBACK_CATEGORY_LIMIT);
  return PublicFeedbackSchema.parse({
    schemaVersion: 1,
    publicId: input.publicId,
    category,
    releasePolicyVersion: input.releasePolicyVersion,
    publicCheckDetails: details
  });
}
