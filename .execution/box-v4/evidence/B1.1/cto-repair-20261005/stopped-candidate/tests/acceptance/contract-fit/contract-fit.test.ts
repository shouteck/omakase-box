import { expect, it } from 'vitest';
import {
  checkAggregateFit,
  checkComposedObligationCompleteness
} from '../../../packages/evaluation/contracts/completeness.js';
import type { AggregateFitReport, CompositionCompletenessReport } from '../../../packages/evaluation/contracts/completeness.js';
import { checkContractFit } from '../../../packages/evaluation/contracts/contract-fit.js';
import type { ContractFitReport } from '../../../packages/evaluation/contracts/contract-fit.js';
import {
  FIT_CANARY,
  RANKING_CHECK_IDS,
  SELECTION_CHECK_IDS,
  alternativeSelectionEvidence,
  compositionWithConflictingClientSchema,
  compositionWithUnknownAdapterVersion,
  compositionWithoutInterfaceCheck,
  completeSelectionEvidence,
  composedRanking,
  composedSelection,
  composedWithPolicy,
  observed,
  partitionWithoutUnitMapping,
  unpublishedPrivateRequirementEvidence,
  unsupportedCloudPartition
} from './fixtures.js';
import { withinBoundsCallerAssumptions, verifiedCallerRun } from './caller-fixtures.js';

function asFit(value: ContractFitReport): ContractFitReport {
  if (value.status !== 'fit') throw new Error(`expected contract fit, received ${value.status} with outcome ${value.aggregateOutcome}`);
  return value;
}

function completenessOf(value: CompositionCompletenessReport, expected: 'complete' | 'incomplete' | 'not_assessable'): void {
  expect(value.completeness).toBe(expected);
}

it('the delivered composed selection partition is statically complete: every required unit and interface is supported', async () => {
  const partition = await composedSelection();
  const report = checkComposedObligationCompleteness(partition);
  expect(report.assurance).toBe('bounded');
  expect(report.partitionStatus).toBe('proposed');
  expect(report.taskId).toBe(partition.taskId);
  completenessOf(report, 'complete');
  expect(report.unsupported).toEqual([]);
  expect(report.shapeProblems).toEqual([]);
  expect(report.requiredUnits.map(unit => unit.id).sort()).toEqual(['selection_api', 'selection_ui']);
  expect(report.requiredUnits.every(unit => unit.supported && unit.mappedInIntegrationPlan)).toBe(true);
  expect(report.requiredInterfaces.map(item => item.id)).toEqual(['selection_http']);
  expect(report.requiredInterfaces.every(item => item.mappedInIntegrationPlan && item.hasCompatibilityCheck)).toBe(true);
  expect(report.endToEndObligations).toEqual(['selection_journey']);
  expect(report.endToEndWholeTaskCoverage).toBe(true);
  expect(report.untraceableRequirements).toEqual([]);
  expect(report.packageDefectSuspected).toBe(false);
});

it('the composed frontend+backend+policy partition is complete across all three units and both interfaces', async () => {
  const partition = await composedWithPolicy();
  const report = checkComposedObligationCompleteness(partition);
  completenessOf(report, 'complete');
  expect(report.requiredUnits.map(unit => unit.id).sort()).toEqual(['response_policy', 'selection_api', 'selection_ui']);
  expect(report.requiredInterfaces.map(item => item.id).sort()).toEqual(['response_policy', 'selection_http']);
  expect(report.endToEndWholeTaskCoverage).toBe(true);
});

it('unit success alone never implies complete fit: missing interface and end-to-end evidence keeps the aggregate unverified', async () => {
  const partition = await composedSelection();
  const report = checkContractFit({ partition, observed: completeSelectionEvidence('units_passed_only') });
  expect(report.status).toBe('unverified');
  expect(report.aggregateOutcome).toBe('unverified');
  expect(report.observedFit!.checksFailed).toEqual([]);
  expect(report.observedFit!.checksMissing.length).toBe(2);
  expect(SELECTION_CHECK_IDS.filter(checkId => report.observedFit!.checksMissing.includes(checkId)).sort()).toEqual(['selection_http_check', 'selection_journey_check']);
  expect(report.status !== 'fit').toBe(true);
});

it('a client/API mismatch that passes local unit checks is caught by interface completeness and never aggregate-passed', async () => {
  const partition = await composedSelection();
  const report = checkContractFit({ partition, observed: completeSelectionEvidence('mismatch') });
  expect(report.status).toBe('not_fit');
  expect(report.aggregateOutcome).toBe('contract_failure');
  expect(report.observedFit!.checksFailed).toHaveLength(1);
  expect(report.observedFit!.checksFailed[0]!.checkId).toBe('selection_http_check');
  expect(report.observedFit!.checksFailed[0]!.classification).toBe('contract_failure');
  expect(report.observedFit!.checksFailed[0]!.detail).toContain('client response {planId} disagrees with the published {selectedId}');
  expect(report.observedFit!.missingPublishedObligations).toEqual([]);
  expect(report.packageDefectSuspected).toBe(false);
  expect(report.completeness.completeness).toBe('complete');
});

it('a published client/API schema conflict is caught statically by the composition completeness check', async () => {
  const partition = await composedSelection();
  const conflicted = compositionWithConflictingClientSchema(partition.composition!);
  const report = checkContractFit({ partition: { ...partition, composition: conflicted }, observed: completeSelectionEvidence() });
  expect(report.status).toBe('not_fit');
  expect(report.aggregateOutcome).toBe('package_defect');
  expect(report.packageDefectSuspected).toBe(true);
  expect(report.completeness.completeness).toBe('not_assessable');
  expect(report.completeness.unsupported[0]!.kind).toBe('broken_published_contract');
  expect(report.completeness.unsupported[0]!.detail).toContain('Conflicting schema definition, version or ownership');
});

it('a private integration requirement missing from the published contract is classified as a package defect', async () => {
  const partition = await composedSelection();
  const report = checkContractFit({ partition, observed: unpublishedPrivateRequirementEvidence() });
  expect(report.status).toBe('not_fit');
  expect(report.aggregateOutcome).toBe('package_defect');
  expect(report.packageDefectSuspected).toBe(true);
  expect(report.observedFit!.missingPublishedObligations).toHaveLength(1);
  expect(report.observedFit!.missingPublishedObligations[0]!.requirementId).toBe('browser_context_cannot_override');
  expect(report.observedFit!.missingPublishedObligations[0]!.checkId).toBe('private_integration_context_guard');
  expect(report.observedFit!.missingPublishedObligations[0]!.detail).toContain('missing from the published obligations');
  expect(report.observedFit!.checksFailed).toEqual([]);
});

it('a package that omits the private integration mapping for a required unit is a package defect, not a contributor failure', async () => {
  const partition = await composedSelection();
  const defective = partitionWithoutUnitMapping(partition);
  const report = checkContractFit({ partition: defective, observed: completeSelectionEvidence() });
  expect(report.status).toBe('not_fit');
  expect(report.aggregateOutcome).toBe('package_defect');
  expect(report.packageDefectSuspected).toBe(true);
  expect(report.completeness.completeness).toBe('incomplete');
  expect(report.completeness.unsupported.some(record => record.kind === 'missing_private_mapping' && record.detail.includes('selection_api'))).toBe(true);
  expect(report.completeness.requiredUnits.find(unit => unit.id === 'selection_api')!.mappedInIntegrationPlan).toBe(false);
});

it('a published contract without an interface compatibility check is statically incomplete', async () => {
  const partition = await composedSelection();
  const defective = compositionWithoutInterfaceCheck(partition.composition!);
  const report = checkContractFit({ partition: { ...partition, composition: defective } });
  expect(report.status).toBe('not_fit');
  expect(report.aggregateOutcome).toBe('package_defect');
  expect(report.completeness.completeness).toBe('not_assessable');
  expect(report.completeness.unsupported[0]!.detail).toContain('Interface compatibility has no trusted check');
});

it('an alternative valid implementation is accepted: fit is not tied to one exact shape', async () => {
  const partition = await composedSelection();
  const reference = checkContractFit({ partition, observed: completeSelectionEvidence() });
  const alternative = checkContractFit({ partition, observed: alternativeSelectionEvidence('B') });
  asFit(reference);
  asFit(alternative);
  expect(reference.status).toBe('fit');
  expect(alternative.status).toBe('fit');
  expect(alternative.aggregateOutcome).toBe('passed');
  expect(alternative.observedFit!.checksObserved).toBe(SELECTION_CHECK_IDS.length);
});

it('unknown and unavailable observed evidence is reported explicitly and never passes', async () => {
  const partition = await composedSelection();
  const withUnknown = checkContractFit({
    partition,
    observed: [...completeSelectionEvidence().slice(0, 3), observed('selection_journey_check', 'private', 'unverified', null, 'runner job timed out')]
  });
  expect(withUnknown.status).toBe('unverified');
  expect(withUnknown.aggregateOutcome).toBe('unverified');
  expect(withUnknown.observedFit!.checksUnknown[0]!.checkId).toBe('selection_journey_check');
  expect(withUnknown.observedFit!.checksUnknown[0]!.detail).toContain('timed out');

  const malformedObserved = checkContractFit({ partition, observed: [{ checkId: 7 }] });
  expect(malformedObserved.status).toBe('unverified');
  expect(malformedObserved.observedFit!.invalidReports.length).toBeGreaterThan(0);
});

it('public evaluation evidence alone cannot produce aggregate passed: both public and private jobs are required', async () => {
  const partition = await composedSelection();
  const publicOnly = completeSelectionEvidence().map(entry => ({ ...entry, jobKind: 'public' as const }));
  const report = checkContractFit({ partition, observed: publicOnly });
  expect(report.status).toBe('unverified');
  expect(report.aggregateOutcome).toBe('unverified');
  expect(report.observedFit!.jobKindCoverage).toEqual({ public: 4, private: 0, complete: false });
});

it('implementation errors are distinguished from missing published obligations in one report', async () => {
  const partition = await composedSelection();
  const observedResults = [
    ...completeSelectionEvidence('mismatch'),
    ...unpublishedPrivateRequirementEvidence().filter(entry => entry.checkId === 'private_integration_context_guard')
  ];
  const report = checkContractFit({ partition, observed: observedResults });
  expect(report.status).toBe('not_fit');
  expect(report.aggregateOutcome).toBe('package_defect');
  expect(report.observedFit!.checksFailed[0]!.classification).toBe('contract_failure');
  expect(report.observedFit!.missingPublishedObligations).toHaveLength(1);
});

it('an out-of-bounds caller assumption blocks contract fit even when the composed evidence is complete', async () => {
  const partition = await composedRanking();
  const complete = [
    observed('ranking_check', 'public', 'passed'),
    observed('ranking_check', 'private', 'passed')
  ];
  const fit = checkContractFit({ partition, observed: complete, callerAssumptions: withinBoundsCallerAssumptions, callerVerification: verifiedCallerRun });
  expect(fit.status).toBe('fit');
  expect(fit.aggregateOutcome).toBe('passed');

  const outOfBounds = checkContractFit({
    partition,
    observed: complete,
    callerAssumptions: { ...withinBoundsCallerAssumptions, maxSuppliedItems: 100 },
    callerVerification: verifiedCallerRun
  });
  expect(outOfBounds.status).toBe('not_fit');
  expect(outOfBounds.aggregateOutcome).toBe('unverified');
  expect(outOfBounds.callerAssumptions!.outOfBounds[0]!.id).toBe('max_items');

  const unverifiable = checkContractFit({ partition, observed: complete, callerAssumptions: withinBoundsCallerAssumptions });
  expect(unverifiable.status).toBe('unverified');
  expect(unverifiable.callerAssumptions!.unverifiable.map(check => check.id)).toEqual(['never_mutates_input', 'deterministic']);
});

it('the bounded ranker flow reaches contract fit through the façade with verified caller assumptions', async () => {
  const partition = await composedRanking();
  const staticOnly = checkContractFit({ partition });
  expect(staticOnly.status).toBe('unverified');
  expect(staticOnly.aggregateOutcome).toBe('unverified');
  const observedResults = RANKING_CHECK_IDS.flatMap(checkId => [observed(checkId, 'public', 'passed'), observed(checkId, 'private', 'passed')]);
  const fit = checkContractFit({ partition, observed: observedResults, callerAssumptions: withinBoundsCallerAssumptions, callerVerification: verifiedCallerRun });
  asFit(fit);
  expect(fit.completeness.requiredUnits[0]!.adapterKind).toBe('backend_pure_module');
  expect(fit.completeness.endToEndWholeTaskCoverage).toBe(true);
});

it('a not_supported partition is reported without composition, with retained work and capability gaps, never as fit', async () => {
  const partition = await unsupportedCloudPartition();
  const report = checkContractFit({ partition, observed: completeSelectionEvidence() });
  expect(report.status).toBe('not_supported');
  expect(report.aggregateOutcome).toBe('unverified');
  expect(report.partition.status).toBe('not_supported');
  expect(report.partition.missingCapabilities.length).toBeGreaterThan(0);
  expect(report.partition.reason).toContain('cloud infrastructure adapter');
  expect(report.completeness.completeness).toBe('not_assessable');
  expect(report.completeness.requiredUnits).toEqual([]);
  expect(report.packageDefectSuspected).toBe(false);
  expect(report.observedFit).toBeNull();
});

it('every contract-fit report discloses limits and the no-confidentiality/no-correctness disclaimer and never leaks the private canary', async () => {
  const partition = await composedSelection();
  const reports = [
    checkComposedObligationCompleteness(partition),
    checkAggregateFit(partition.composition, completeSelectionEvidence()),
    checkContractFit({ partition, observed: completeSelectionEvidence() })
  ];
  for (const report of reports) {
    expect(report.assurance).toBe('bounded');
    expect(report.limits.length).toBeGreaterThanOrEqual(4);
    expect(report.disclaimer).toContain('not a semantic confidentiality or correctness proof');
    const serialized = JSON.stringify(report);
    expect(serialized).toContain('not a semantic confidentiality or correctness proof');
    expect(serialized).not.toContain(FIT_CANARY);
  }
  const fit = asFit(checkContractFit({ partition, observed: completeSelectionEvidence() }));
  expect(fit.limits.join(' ')).toContain('Unit success alone never implies complete composed fit');
  expect(fit.limits.join(' ')).toContain('analyzed, proposed or untrusted code');
});

it('the checker is independent of the composer: malformed and hostile partition data is assessed as data, never executed', async () => {
  const scalar = checkComposedObligationCompleteness('hostile-string');
  expect(scalar.partitionStatus).toBe('invalid');
  expect(scalar.shapeProblems[0]).toContain('not a strict object');

  const protoPartition = checkComposedObligationCompleteness(JSON.parse('{"status":"proposed","__proto__":{"polluted":true}}'));
  expect(protoPartition.partitionStatus).toBe('proposed');
  expect(protoPartition.completeness).toBe('not_assessable');
  expect(protoPartition.shapeProblems.length).toBeGreaterThan(0);
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();

  const missingComposition = checkComposedObligationCompleteness({ status: 'proposed', taskId: 'x'.repeat(8), composition: null, integrationPlan: {}, costRecord: {}, assurance: 'bounded' });
  expect(missingComposition.partitionStatus).toBe('proposed');
  expect(missingComposition.completeness).toBe('not_assessable');
  expect(missingComposition.shapeProblems[0]).toContain('must carry a composition object');

  const partition = await composedSelection();
  const unknownVersion = checkComposedObligationCompleteness({ ...partition, composition: compositionWithUnknownAdapterVersion(partition.composition!) });
  expect(unknownVersion.partitionStatus).toBe('proposed');
  expect(unknownVersion.completeness).toBe('not_assessable');
  expect(unknownVersion.unsupported[0]!.kind).toBe('broken_published_contract');
});

it('aggregate fit distinguishes check kinds: end-to-end failure is integration failure, unit failure is contract failure', async () => {
  const partition = await composedSelection();
  const unitFailure = checkAggregateFit(partition.composition, completeSelectionEvidence().map(entry => entry.checkId === 'selection_ui_check' ? observed('selection_ui_check', 'public', 'failed', null, 'keyboard navigation not observed') : entry));
  expect(unitFailure.aggregateOutcome).toBe('contract_failure');
  expect(unitFailure.checksFailed[0]!.checkId).toBe('selection_ui_check');

  const journeyFailure = checkAggregateFit(partition.composition, completeSelectionEvidence().map(entry => entry.checkId === 'selection_journey_check' ? observed('selection_journey_check', 'private', 'failed', null, 'server rejection not observed end to end') : entry));
  expect(journeyFailure.aggregateOutcome).toBe('integration_failure');
  expect(journeyFailure.checksFailed[0]!.classification).toBe('integration_failure');
});
