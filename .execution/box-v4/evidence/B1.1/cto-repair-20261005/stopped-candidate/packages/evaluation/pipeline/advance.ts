import { aggregateAuthoritativeOutcome, buildInternalEvaluationResult } from '../runner-results/index.js';
import type { EvidenceRecord, EvaluationOutcome, JobBinding } from '../runner-results/index.js';
import type { PrivateFitReport } from './fit.js';
import type { CandidateDiff } from './candidate-diff.js';

/**
 * Evaluation advancement (M7.1). Maps authoritative job evidence plus the
 * private-fit report onto the private_evaluations state machine. Unknown or
 * pending evidence produces NO transition — it is never treated as failure
 * or success. Only a passed aggregate plus a passed private fit reaches
 * owner_review, and only with a schema-valid result bound to the exact
 * evaluation, attempt and candidate diff.
 */

export class AdvanceRejected extends Error {
  constructor(readonly code: string) { super(`Evaluation advance rejected: ${code}.`); }
}

export type DbEvaluationState = 'received' | 'public_evaluating' | 'private_evaluating' | 'owner_review' | 'accepted' | 'changes_required' | 'package_defect' | 'infrastructure_failure';

export interface JobEvidence {
  readonly jobKind: 'public' | 'private';
  readonly completed: boolean;
  readonly evidence: EvidenceRecord | null;
}

export interface AdvanceDecision {
  /** null = no transition warranted; callers keep the row unchanged (revalidate). */
  readonly nextState: DbEvaluationState | null;
  readonly outcome: EvaluationOutcome | null;
  /** Present only on the owner_review transition — schema-checked upstream. */
  readonly result: unknown | null;
}

export interface AdvanceInput {
  readonly state: DbEvaluationState;
  readonly evaluationId: string;
  readonly attemptId: string;
  readonly submissionHash: string;
  readonly packageHash: string;
  readonly privateBaseRevision: string;
  readonly jobs: readonly JobEvidence[];
  /** Required for the private_evaluating → terminal/owner_review transition. */
  readonly fit?: PrivateFitReport;
  readonly candidateDiff?: CandidateDiff;
  readonly privateLogs?: Uint8Array;
}

const none: AdvanceDecision = Object.freeze({ nextState: null, outcome: null, result: null });

/** Map the aggregate + fit onto the state machine. Infrastructure and unknown stay distinct. */
export function advanceEvaluation(input: AdvanceInput): AdvanceDecision {
  const publicJob = input.jobs.find(job => job.jobKind === 'public');
  const privateJob = input.jobs.find(job => job.jobKind === 'private');
  const evidence = input.jobs.filter(job => job.evidence !== null).map(job => job.evidence!);
  const terminal = (outcome: EvaluationOutcome): AdvanceDecision => {
    const state: DbEvaluationState = outcome === 'infrastructure_failure' ? 'infrastructure_failure'
      : outcome === 'package_defect' ? 'package_defect'
      : outcome === 'passed' ? 'owner_review'
      : 'changes_required';
    return Object.freeze({ nextState: state, outcome, result: null });
  };

  if (input.state === 'received') {
    return publicJob && privateJob ? Object.freeze({ nextState: 'public_evaluating', outcome: null, result: null }) : none;
  }
  if (input.state === 'public_evaluating') {
    if (!publicJob?.completed || publicJob.evidence === null) return none;
    if (publicJob.evidence.evidenceClass === 'infrastructure') return terminal('infrastructure_failure');
    if (publicJob.evidence.evidenceClass === 'unverified') return none;
    if (publicJob.evidence.outcome === 'failed') return terminal('contract_failure');
    return Object.freeze({ nextState: 'private_evaluating', outcome: null, result: null });
  }
  if (input.state === 'private_evaluating') {
    if (!privateJob?.completed || privateJob.evidence === null) return none;
    const aggregate = aggregateAuthoritativeOutcome(evidence);
    if (aggregate.outcome === 'infrastructure_failure') return terminal('infrastructure_failure');
    if (aggregate.outcome === 'unverified') return none;
    if (!input.fit) throw new AdvanceRejected('fit_required');
    if (input.fit.outcome === 'unverified') return none;
    if (input.fit.outcome !== 'passed') return terminal(input.fit.outcome);
    if (aggregate.outcome !== 'passed') return terminal(aggregate.outcome);
    if (!input.candidateDiff) throw new AdvanceRejected('candidate_diff_required');
    const result = buildInternalEvaluationResult(
      { evaluationId: input.evaluationId, attemptId: input.attemptId, submissionHash: input.submissionHash, packageHash: input.packageHash, privateBaseRevision: input.privateBaseRevision },
      evidence,
      input.privateLogs ?? new Uint8Array(0),
    );
    return Object.freeze({ nextState: 'owner_review', outcome: 'passed', result: Object.freeze({ ...result, candidateDiffHash: input.candidateDiff.candidateDiffHash }) });
  }
  return none;
}
