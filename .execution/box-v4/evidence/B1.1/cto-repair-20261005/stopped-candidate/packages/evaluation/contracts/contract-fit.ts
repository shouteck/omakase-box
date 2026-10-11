import { checkAggregateFit, checkComposedObligationCompleteness, compositionFromPartition } from './completeness.js';
import type { AggregateFitReport, CompositionCompletenessReport, EvaluationOutcome } from './completeness.js';
import { checkCallerAssumptions } from './caller-assumptions.js';
import type { CallerAssumptionReport, CallerVerification } from './caller-assumptions.js';
import { COMPLETENESS_ASSURANCE, COMPLETENESS_DISCLAIMER, COMPLETENESS_LIMITS } from './completeness.js';

export const CONTRACT_FIT_ASSURANCE = COMPLETENESS_ASSURANCE;
export const CONTRACT_FIT_DISCLAIMER = COMPLETENESS_DISCLAIMER;

export const CONTRACT_FIT_LIMITS: readonly string[] = Object.freeze([
  ...COMPLETENESS_LIMITS,
  'Contract fit is assessed only over the supplied partition, observed results and declared assumptions; nothing outside the request is inspected.',
  'Caller-assumption bounds are checked only when declared assumptions are supplied; their absence is disclosed in the report rather than assumed.'
]);

export type ContractFitStatus = 'fit' | 'not_fit' | 'unverified' | 'not_supported';

export interface ContractFitRequest {
  readonly partition: unknown;
  readonly observed?: unknown;
  readonly callerAssumptions?: unknown;
  readonly callerVerification?: CallerVerification;
}

export interface ContractFitReport {
  readonly assurance: typeof CONTRACT_FIT_ASSURANCE;
  readonly status: ContractFitStatus;
  readonly aggregateOutcome: EvaluationOutcome;
  readonly partition: {
    readonly status: 'proposed' | 'not_supported' | 'invalid';
    readonly taskId: string | null;
    readonly reason: string | null;
    readonly missingCapabilities: readonly string[];
  };
  readonly completeness: CompositionCompletenessReport;
  readonly observedFit: AggregateFitReport | null;
  readonly callerAssumptions: CallerAssumptionReport | null;
  readonly packageDefectSuspected: boolean;
  readonly limits: readonly string[];
  readonly disclaimer: string;
}

export function checkContractFit(request: ContractFitRequest): ContractFitReport {
  if (typeof request !== 'object' || request === null || Array.isArray(request) || !Object.hasOwn(request, 'partition')) {
    throw new Error('invalid_contract_fit_request');
  }
  const completeness = checkComposedObligationCompleteness(request.partition);
  const envelope = request as unknown as Record<string, unknown>;
  const observedProvided = Object.hasOwn(envelope, 'observed') && envelope.observed !== undefined;
  const observedFit = observedProvided && completeness.partitionStatus === 'proposed'
    ? checkAggregateFit(compositionFromPartition(request.partition), envelope.observed)
    : null;
  const assumptionsProvided = Object.hasOwn(envelope, 'callerAssumptions') && envelope.callerAssumptions !== undefined;
  const callerAssumptions = assumptionsProvided
    ? checkCallerAssumptions(envelope.callerAssumptions, Object.hasOwn(envelope, 'callerVerification') ? (envelope.callerVerification as CallerVerification | undefined) : undefined)
    : null;

  const packageDefectSuspected =
    completeness.packageDefectSuspected ||
    (observedFit !== null && observedFit.aggregateOutcome === 'package_defect') ||
    (callerAssumptions !== null && callerAssumptions.declarationProblem !== null);

  let status: ContractFitStatus;
  let aggregateOutcome: EvaluationOutcome;
  if (completeness.partitionStatus !== 'proposed') {
    status = 'not_supported';
    aggregateOutcome = 'unverified';
  } else if (completeness.completeness !== 'complete') {
    status = 'not_fit';
    aggregateOutcome = 'package_defect';
  } else if (observedFit === null) {
    status = 'unverified';
    aggregateOutcome = 'unverified';
  } else if (observedFit.status === 'not_fit') {
    status = 'not_fit';
    aggregateOutcome = observedFit.aggregateOutcome;
  } else if (observedFit.status === 'unverified') {
    status = 'unverified';
    aggregateOutcome = observedFit.aggregateOutcome;
  } else if (callerAssumptions !== null && callerAssumptions.outOfBounds.length > 0) {
    status = 'not_fit';
    aggregateOutcome = 'unverified';
  } else if (callerAssumptions !== null && (callerAssumptions.unverifiable.length > 0 || callerAssumptions.declarationProblem !== null)) {
    status = 'unverified';
    aggregateOutcome = 'unverified';
  } else {
    status = 'fit';
    aggregateOutcome = observedFit.aggregateOutcome;
  }

  return {
    assurance: CONTRACT_FIT_ASSURANCE,
    status,
    aggregateOutcome,
    partition: {
      status: completeness.partitionStatus,
      taskId: completeness.taskId,
      reason: completeness.partitionReason,
      missingCapabilities: completeness.missingCapabilities
    },
    completeness,
    observedFit,
    callerAssumptions,
    packageDefectSuspected,
    limits: CONTRACT_FIT_LIMITS,
    disclaimer: CONTRACT_FIT_DISCLAIMER
  };
}
