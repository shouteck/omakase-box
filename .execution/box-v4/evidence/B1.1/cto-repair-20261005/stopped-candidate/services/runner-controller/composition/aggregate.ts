import type { TrustedResult } from '../../../packages/runner-protocol/index.js';
import type { buildAttemptDescriptor } from '../../../packages/evaluation/composition/descriptor.js';

type Descriptor = ReturnType<typeof buildAttemptDescriptor>;

export type AttemptOutcome = 'passed' | 'failed' | 'unverified';

/**
 * Trusted aggregate verdict for one authorized attempt. Every required child
 * job must yield a verified result bound to the attempt: a missing unit
 * result, an unknown job, a forged/contradictory result or any unverified
 * child keeps the attempt out of `passed`. Fan-out width never multiplies
 * the spend — exactly one attempt is counted.
 */
export interface ChildEvidence {
  readonly jobId: string;
  readonly result: TrustedResult | null;
}

export interface AttemptVerdict {
  readonly attemptId: string;
  readonly outcome: AttemptOutcome;
  readonly cause: string | null;
  readonly missingJobIds: readonly string[];
  readonly attemptsConsumed: 1;
  readonly assurance: 'unverified';
}

export function aggregateAttemptVerdict(descriptor: Descriptor, evidence: readonly ChildEvidence[]): AttemptVerdict {
  const expected = new Map(descriptor.children.map(child => [child.jobId, child]));
  const seen = new Set<string>();
  const missingJobIds: string[] = [];
  const failedChecks: string[] = [];
  let cause: string | null = null;
  for (const item of evidence) {
    const child = expected.get(item.jobId);
    if (!child) { cause = 'unexpected_job_result'; break; }
    if (seen.has(item.jobId)) { cause = 'duplicate_child_result'; break; }
    seen.add(item.jobId);
    const result = item.result;
    if (result === null) { cause = 'missing_child_result'; break; }
    if (result.jobId !== item.jobId) { cause = 'job_id_mismatch'; break; }
    if (result.packageHash !== descriptor.packageHash || result.submissionHash !== descriptor.submissionHash) { cause = 'binding_mismatch'; break; }
    if (result.harnessId !== child.harnessId) { cause = 'harness_mismatch'; break; }
    if (result.outcome === 'unverified') { cause = 'unverified_child'; break; }
    const checkMap = new Map(result.checks.map(check => [check.checkId, check.outcome]));
    if (result.checks.some(check => check.outcome === 'unverified')) { cause = 'unverified_check'; break; }
    if (result.outcome === 'passed' && [...checkMap.values()].some(checkOutcome => checkOutcome !== 'passed')) { cause = 'contradictory_result'; break; }
    for (const required of child.requiredCheckIds) {
      if (!checkMap.has(required)) { cause = 'missing_required_check'; break; }
      if (checkMap.get(required) === 'failed') failedChecks.push(required);
    }
    if (cause !== null) break;
    if (result.outcome === 'failed' || failedChecks.length > 0) { cause = 'candidate_failure'; break; }
  }
  if (cause === null) {
    for (const child of descriptor.children) if (!seen.has(child.jobId)) missingJobIds.push(child.jobId);
    if (missingJobIds.length > 0) cause = 'missing_unit_result';
  }
  if (cause === null && failedChecks.length === 0) cause = null;
  const outcome: AttemptOutcome = cause === null ? 'passed' : cause === 'candidate_failure' ? 'failed' : 'unverified';
  return Object.freeze({
    attemptId: descriptor.attemptId,
    outcome,
    cause,
    missingJobIds: Object.freeze(missingJobIds),
    attemptsConsumed: 1 as const,
    assurance: 'unverified' as const,
  });
}
