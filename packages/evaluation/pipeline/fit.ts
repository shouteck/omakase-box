import { checkPolicyData } from '../policy/index.js';
import { checkContractFit } from '../contracts/contract-fit.js';
import type { EvaluationOutcome } from '../runner-results/index.js';

/**
 * Private-fit composition (M7.1). Verifies the response-policy document
 * through the bounded loader against its contract-pinned specification hash
 * BEFORE any header semantics are considered, then evaluates whole-task
 * contract fit over the partition plus observed per-unit results. An
 * unpublished private expectation surfaces as package_defect — never as
 * contributor fault.
 */

export interface PrivateFitInput {
  /** The contract partition (M3.3 composition) this evaluation was planned against. */
  readonly partition: unknown;
  /** Observed per-unit check results from verified private evidence. */
  readonly observed?: unknown;
  /** Caller-declared assumption bounds, when the task requires them. */
  readonly callerAssumptions?: unknown;
  /** Raw response-policy document when the task declares a policy unit. */
  readonly policySource?: string | null;
  /** The allow-listed policy specification (private, contract-bound). */
  readonly policySpecification?: unknown;
  /** Content hash of policySpecification — must match exactly. */
  readonly expectedPolicySpecHash?: string | null;
}

export interface PrivateFitReport {
  readonly outcome: EvaluationOutcome;
  readonly fitStatus: 'fit' | 'not_fit' | 'unverified' | 'not_supported' | 'skipped';
  readonly packageDefectSuspected: boolean;
  readonly policy: 'checked' | 'rejected' | 'absent' | 'unchecked';
  readonly policyReason: string | null;
}

export function evaluatePrivateFit(input: PrivateFitInput): PrivateFitReport {
  let policy: PrivateFitReport['policy'] = 'absent';
  let policyReason: string | null = null;
  const expectsPolicy = input.expectedPolicySpecHash !== undefined && input.expectedPolicySpecHash !== null;
  if (expectsPolicy) {
    if (typeof input.policySource !== 'string' || input.policySpecification === undefined) {
      policy = 'rejected'; policyReason = 'policy_input_missing';
    } else {
      const checked = checkPolicyData(input.policySource, input.policySpecification, input.expectedPolicySpecHash!);
      policy = checked.status === 'checked' ? 'checked' : 'rejected';
      policyReason = checked.reason;
    }
  }
  if (policy === 'rejected') {
    return Object.freeze({ outcome: 'integration_failure', fitStatus: 'not_fit', packageDefectSuspected: false, policy, policyReason });
  }
  const fit = checkContractFit({ partition: input.partition, observed: input.observed, callerAssumptions: input.callerAssumptions });
  let outcome: EvaluationOutcome;
  if (fit.packageDefectSuspected) outcome = 'package_defect';
  else if (fit.status === 'fit') outcome = fit.aggregateOutcome === 'passed' ? 'passed' : fit.aggregateOutcome;
  else if (fit.status === 'unverified') outcome = 'unverified';
  else if (fit.status === 'not_supported') outcome = 'package_defect';
  else outcome = fit.aggregateOutcome === 'passed' ? 'integration_failure' : fit.aggregateOutcome;
  return Object.freeze({
    outcome,
    fitStatus: fit.status,
    packageDefectSuspected: fit.packageDefectSuspected,
    policy: expectsPolicy ? policy : 'absent',
    policyReason,
  });
}
