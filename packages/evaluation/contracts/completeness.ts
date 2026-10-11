import { ADAPTER_REGISTRY, PublicCheckSchema, PublicInterfaceSchema, RequirementSchema, WorkUnitSchema } from '../../contracts/public/index.js';
import { CompositionShape, validateComposition } from '../../contracts/public/composition.js';
import type { Composition, PublicInterface, WorkUnit } from '../../contracts/public/composition.js';
import type { Requirement } from '../../contracts/common.js';
import { PrivateIntegrationPlanSchema } from '../../contracts/private/index.js';
import type { PrivateIntegrationPlan } from '../../contracts/private/index.js';

export const COMPLETENESS_ASSURANCE = 'bounded' as const;

export const COMPLETENESS_LIMITS: readonly string[] = Object.freeze([
  'Obligation completeness is assessed structurally over the supplied composed-partition data and observed check results; semantic equivalence of implementations is not established.',
  'Observed results are supplied data from trusted evaluation adapters; this module never imports, loads or executes analyzed, proposed or untrusted code.',
  'Missing, unknown, timed-out or malformed observed evidence blocks any passed aggregate and is reported explicitly; unknown verification is never passing verification.',
  'Unit success alone never implies complete composed fit: interface compatibility and end-to-end obligations must also be observed as passed.',
  'This checker does not claim semantic confidentiality or a correctness proof and cannot authorize acceptance, publication or payment.'
]);

export const COMPLETENESS_DISCLAIMER =
  'Structural obligation-completeness checking over bounded synthetic data; not a semantic confidentiality or correctness proof.';

export type EvaluationOutcome = 'contract_failure' | 'integration_failure' | 'package_defect' | 'infrastructure_failure' | 'passed' | 'unverified';

export interface ObservedCheckResult {
  readonly checkId: string;
  readonly jobKind: 'public' | 'private';
  readonly outcome: 'passed' | 'failed' | 'unverified';
  readonly requirementId: string | null;
  readonly detail: string;
}

export interface UnsupportedRecord {
  readonly kind: string;
  readonly detail: string;
}

export interface RequiredUnitRecord {
  readonly id: string;
  readonly adapterKind: string;
  readonly adapterVersion: number;
  readonly supported: boolean;
  readonly mappedInIntegrationPlan: boolean;
}

export interface RequiredInterfaceRecord {
  readonly id: string;
  readonly mappedInIntegrationPlan: boolean;
  readonly hasCompatibilityCheck: boolean;
}

export interface CompositionCompletenessReport {
  readonly assurance: typeof COMPLETENESS_ASSURANCE;
  readonly partitionStatus: 'proposed' | 'not_supported' | 'invalid';
  readonly taskId: string | null;
  readonly partitionReason: string | null;
  readonly missingCapabilities: readonly string[];
  readonly completeness: 'complete' | 'incomplete' | 'not_assessable';
  readonly requiredUnits: readonly RequiredUnitRecord[];
  readonly requiredInterfaces: readonly RequiredInterfaceRecord[];
  readonly endToEndObligations: readonly string[];
  readonly endToEndWholeTaskCoverage: boolean | null;
  readonly untraceableRequirements: readonly string[];
  readonly unsupported: readonly UnsupportedRecord[];
  readonly shapeProblems: readonly string[];
  readonly packageDefectSuspected: boolean;
  readonly limits: readonly string[];
  readonly disclaimer: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Array.isArray(value) === false;
}

function boundedStrings(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return Object.freeze(value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0 && entry.length <= 256));
}

export function compositionFromPartition(partition: unknown): unknown {
  if (!isPlainObject(partition)) return null;
  const record = partition as Record<string, unknown>;
  return record.status === 'proposed' && isPlainObject(record.composition) ? record.composition : null;
}

interface CompositionAssessment {
  readonly status: 'assessed' | 'invalid';
  readonly composition: Composition | null;
  readonly issues: readonly string[];
}

function runCompositionLinks(task: Composition): readonly string[] {
  const issues: string[] = [];
  const context = {
    addIssue: (issue: { readonly message?: unknown }) => {
      issues.push(typeof issue?.message === 'string' && issue.message.length > 0 ? issue.message.slice(0, 240) : 'composition link issue');
    }
  } as unknown as Parameters<typeof validateComposition>[1];
  try {
    validateComposition(task, context);
  } catch (error) {
    issues.push(`composition link validation threw: ${error instanceof Error ? error.message.slice(0, 120) : 'unknown error'}`);
  }
  return issues;
}

function perItemIssues(parse: { readonly success: boolean; readonly error?: { readonly issues: readonly { readonly message: string }[] } }, label: string, issues: string[]): boolean {
  if (parse.success) return true;
  for (const issue of (parse.error?.issues ?? []).slice(0, 3)) issues.push(`${label}: ${issue.message.slice(0, 200)}`);
  return false;
}

function assessComposition(raw: unknown): CompositionAssessment {
  if (!isPlainObject(raw)) return { status: 'invalid', composition: null, issues: ['the composition is not a strict object'] };
  const record = raw as Record<string, unknown>;
  const issues: string[] = [];
  for (const key of Object.keys(CompositionShape)) if (!Object.hasOwn(record, key)) issues.push(`the composition is missing the ${key} field`);
  for (const key of ['disciplines', 'workUnits', 'interfaces', 'requirements', 'endToEndRequirements', 'publicChecks', 'editablePaths']) {
    if (Object.hasOwn(record, key) && !Array.isArray(record[key])) issues.push(`the composition ${key} is not an array`);
  }
  if (issues.length > 0) return { status: 'invalid', composition: null, issues };
  const units: WorkUnit[] = [];
  (record.workUnits as unknown[]).forEach((entry, index) => {
    const parsed = WorkUnitSchema.safeParse(entry);
    if (parsed.success) units.push(parsed.data);
    else perItemIssues(parsed, `work unit #${index}`, issues);
  });
  const interfaces: PublicInterface[] = [];
  (record.interfaces as unknown[]).forEach((entry, index) => {
    const parsed = PublicInterfaceSchema.safeParse(entry);
    if (parsed.success) interfaces.push(parsed.data);
    else perItemIssues(parsed, `interface #${index}`, issues);
  });
  const checks: Composition['publicChecks'] = [];
  (record.publicChecks as unknown[]).forEach((entry, index) => {
    const parsed = PublicCheckSchema.safeParse(entry);
    if (parsed.success) checks.push(parsed.data);
    else perItemIssues(parsed, `public check #${index}`, issues);
  });
  const requirements: Requirement[] = [];
  (record.requirements as unknown[]).forEach((entry, index) => {
    const parsed = RequirementSchema.safeParse(entry);
    if (parsed.success) requirements.push(parsed.data);
    else perItemIssues(parsed, `requirement #${index}`, issues);
  });
  const endToEnd: Requirement[] = [];
  (record.endToEndRequirements as unknown[]).forEach((entry, index) => {
    const parsed = RequirementSchema.safeParse(entry);
    if (parsed.success) endToEnd.push(parsed.data);
    else perItemIssues(parsed, `end-to-end requirement #${index}`, issues);
  });
  (record.disciplines as unknown[]).forEach((entry, index) => {
    if (typeof entry !== 'string' || entry.length === 0 || entry.length > 64) issues.push(`discipline #${index} is not a bounded identifier`);
  });
  (record.editablePaths as unknown[]).forEach((entry, index) => {
    if (typeof entry !== 'string' || entry.length === 0 || entry.length > 240) issues.push(`editable path #${index} is not a bounded string`);
  });
  if (units.length === 0) issues.push('the composition declares no work units');
  if (issues.length > 0) return { status: 'invalid', composition: null, issues };
  const task = raw as unknown as Composition;
  const linkIssues = runCompositionLinks(task);
  if (linkIssues.length > 0) return { status: 'invalid', composition: null, issues: linkIssues };
  return { status: 'assessed', composition: task, issues: [] };
}

export function checkComposedObligationCompleteness(partition: unknown): CompositionCompletenessReport {
  const shapeProblems: string[] = [];
  const unsupported: UnsupportedRecord[] = [];
  const requiredUnits: RequiredUnitRecord[] = [];
  const requiredInterfaces: RequiredInterfaceRecord[] = [];
  let endToEndObligations: readonly string[] = [];
  let endToEndWholeTaskCoverage: boolean | null = null;
  let untraceableRequirements: readonly string[] = [];
  let partitionStatus: 'proposed' | 'not_supported' | 'invalid' = 'invalid';
  let taskId: string | null = null;
  let partitionReason: string | null = null;
  let missingCapabilities: readonly string[] = [];
  let assessed = false;

  if (!isPlainObject(partition)) {
    shapeProblems.push('the composed partition is not a strict object');
  } else {
    const record = partition as Record<string, unknown>;
    if (record.assurance !== undefined && record.assurance !== 'bounded') shapeProblems.push('the composed partition does not declare bounded assurance');
    taskId = typeof record.taskId === 'string' && record.taskId.length > 0 ? record.taskId.slice(0, 64) : null;
    if (taskId === null) shapeProblems.push('the composed partition carries no task id');
    if (record.status === 'not_supported') {
      partitionStatus = 'not_supported';
      partitionReason = typeof record.reason === 'string' && record.reason.length > 0 ? record.reason.slice(0, 400) : null;
      missingCapabilities = boundedStrings(record.missingCapabilities);
      if (partitionReason === null) shapeProblems.push('the not_supported partition carries no reason');
      if (record.composition !== null && record.composition !== undefined) shapeProblems.push('a not_supported partition must not carry a composition');
      if (record.integrationPlan !== null && record.integrationPlan !== undefined) shapeProblems.push('a not_supported partition must not carry an integration plan');
    } else if (record.status === 'proposed') {
      partitionStatus = 'proposed';
      if (!isPlainObject(record.composition)) {
        shapeProblems.push('a proposed partition must carry a composition object');
      } else if (!isPlainObject(record.integrationPlan)) {
        shapeProblems.push('a proposed partition must carry a private integration plan object');
      } else {
        const assessment = assessComposition(record.composition);
        if (assessment.status === 'invalid') {
          unsupported.push({ kind: 'broken_published_contract', detail: assessment.issues.join(' | ').slice(0, 400) });
        } else {
          assessed = true;
          const composition = assessment.composition!;
          const costRecord = record.costRecord;
          if (!isPlainObject(costRecord)) unsupported.push({ kind: 'invalid_cost_record', detail: 'the composed partition carries no cost record object' });
          else {
            const cost = costRecord as Record<string, unknown>;
            if (cost.schemaVersion !== 1 || cost.assurance !== 'bounded') {
              unsupported.push({ kind: 'assurance_mislabelled', detail: 'the cost record must declare schemaVersion 1 with bounded assurance' });
            }
          }
          const planParse = PrivateIntegrationPlanSchema.safeParse(record.integrationPlan);
          if (!planParse.success) {
            unsupported.push({ kind: 'invalid_integration_plan', detail: (planParse.error.issues.slice(0, 3).map(issue => issue.message.slice(0, 120))).join(' | ') });
          } else {
            const plan = planParse.data;
            const mappedUnits = new Set(plan.workUnitMappings.map(mapping => mapping.unitId));
            for (const unit of composition.workUnits) {
              const registration = ADAPTER_REGISTRY[unit.adapterKind];
              const supported = registration !== undefined && registration.version === unit.adapterVersion;
              if (!supported) {
                unsupported.push({ kind: 'unsupported_adapter', detail: `work unit ${unit.id} uses ${unit.adapterKind} version ${unit.adapterVersion} which is not a registered supported adapter` });
              }
              const mapped = mappedUnits.has(unit.id);
              if (!mapped) {
                unsupported.push({ kind: 'missing_private_mapping', detail: `work unit ${unit.id} has no private integration mapping; connected work is not silently dropped` });
              }
              requiredUnits.push({ id: unit.id, adapterKind: unit.adapterKind, adapterVersion: unit.adapterVersion, supported, mappedInIntegrationPlan: mapped });
            }
            const mappedInterfaces = new Set(plan.interfaceMappings.map(mapping => mapping.interfaceId));
            for (const item of composition.interfaces) {
              const hasCompatibilityCheck = composition.publicChecks.some(check => check.kind === 'interface' && check.interfaceIds.includes(item.id) && item.compatibilityRequirementIds.every(id => check.requirementIds.includes(id)));
              const mapped = mappedInterfaces.has(item.id);
              if (!mapped) unsupported.push({ kind: 'missing_private_interface_mapping', detail: `interface ${item.id} has no declared private adapter mapping; the composed task cannot transfer privately` });
              requiredInterfaces.push({ id: item.id, mappedInIntegrationPlan: mapped, hasCompatibilityCheck });
            }
            for (const mapping of plan.workUnitMappings) {
              if (!mapping.retainedAdapterPath.split('/').includes('private')) {
                unsupported.push({ kind: 'non_private_retained_adapter', detail: `the retained adapter ${mapping.retainedAdapterPath} for unit ${mapping.unitId} is outside a private-managed path segment` });
              }
              const ownerUnit = composition.workUnits.find(unit => unit.id === mapping.unitId);
              if (ownerUnit !== undefined && ownerUnit.adapterKind !== 'application_policy' && composition.editablePaths.some(path => path.toLowerCase() === mapping.privateDestinationPath.toLowerCase())) {
                unsupported.push({ kind: 'private_path_candidate_editable', detail: `the private destination ${mapping.privateDestinationPath} for unit ${mapping.unitId} collides with candidate-editable paths` });
              }
            }
            const publishedRequirementIds = [...new Set([
              ...composition.requirements.map(requirement => requirement.id),
              ...composition.endToEndRequirements.map(requirement => requirement.id),
              ...composition.interfaces.flatMap(item => item.compatibilityRequirementIds)
            ])];
            endToEndObligations = Object.freeze(composition.endToEndRequirements.map(requirement => requirement.id));
            endToEndWholeTaskCoverage = composition.endToEndRequirements.every(requirement =>
              composition.publicChecks.some(check => check.kind === 'end_to_end' && check.requirementIds.includes(requirement.id) && composition.workUnits.every(unit => check.workUnitIds.includes(unit.id))));
            untraceableRequirements = Object.freeze(publishedRequirementIds.filter(id => !plan.privateTraceability.some(entry => entry.publicRequirementId === id)));
            for (const id of untraceableRequirements) {
              unsupported.push({ kind: 'untraceable_requirement', detail: `public requirement ${id} does not trace to an approved intent requirement` });
            }
          }
        }
      }
    } else {
      shapeProblems.push('the composed partition status is neither proposed nor not_supported');
    }
  }

  const completeness: 'complete' | 'incomplete' | 'not_assessable' =
    shapeProblems.length > 0 || !assessed || partitionStatus !== 'proposed'
      ? 'not_assessable'
      : unsupported.length > 0 ? 'incomplete' : 'complete';
  const packageDefectSuspected = partitionStatus !== 'not_supported' && completeness !== 'complete';
  return {
    assurance: COMPLETENESS_ASSURANCE,
    partitionStatus,
    taskId,
    partitionReason,
    missingCapabilities,
    completeness,
    requiredUnits: Object.freeze(requiredUnits),
    requiredInterfaces: Object.freeze(requiredInterfaces),
    endToEndObligations,
    endToEndWholeTaskCoverage,
    untraceableRequirements,
    unsupported: Object.freeze(unsupported),
    shapeProblems: Object.freeze(shapeProblems),
    packageDefectSuspected,
    limits: COMPLETENESS_LIMITS,
    disclaimer: COMPLETENESS_DISCLAIMER
  };
}

export interface ObservedFit {
  readonly checkId: string;
  readonly classification: EvaluationOutcome;
  readonly detail: string;
}

export interface AggregateFitReport {
  readonly assurance: typeof COMPLETENESS_ASSURANCE;
  readonly status: 'fit' | 'not_fit' | 'unverified';
  readonly aggregateOutcome: EvaluationOutcome;
  readonly compositionAssessed: boolean;
  readonly compositionIssues: readonly string[];
  readonly checksTotal: number;
  readonly checksPassed: number;
  readonly checksObserved: number;
  readonly checksFailed: readonly ObservedFit[];
  readonly checksUnknown: readonly { readonly checkId: string; readonly detail: string }[];
  readonly checksMissing: readonly string[];
  readonly missingPublishedObligations: readonly { readonly requirementId: string | null; readonly checkId: string; readonly detail: string }[];
  readonly invalidReports: readonly string[];
  readonly jobKindCoverage: { readonly public: number; readonly private: number; readonly complete: boolean };
  readonly limits: readonly string[];
  readonly disclaimer: string;
}

function parseObservedResults(raw: unknown): { readonly results: readonly ObservedCheckResult[]; readonly invalidReports: readonly string[] } {
  if (!Array.isArray(raw)) return { results: [], invalidReports: ['the observed evaluation evidence must be an array of check results'] };
  const results: ObservedCheckResult[] = [];
  const invalidReports: string[] = [];
  (raw as unknown[]).forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      invalidReports.push(`observed result #${index} is not a strict object`);
      return;
    }
    const record = entry as Record<string, unknown>;
    const checkId = record.checkId;
    const jobKind = record.jobKind;
    const outcome = record.outcome;
    const requirementId = record.requirementId;
    const detail = record.detail;
    if (typeof checkId !== 'string' || checkId.length < 1 || checkId.length > 64) {
      invalidReports.push(`observed result #${index} carries no bounded checkId string`);
      return;
    }
    if (jobKind !== 'public' && jobKind !== 'private') {
      invalidReports.push(`observed result #${index} for check ${checkId} carries no public/private job kind`);
      return;
    }
    if (outcome !== 'passed' && outcome !== 'failed' && outcome !== 'unverified') {
      invalidReports.push(`observed result #${index} for check ${checkId} carries an unknown outcome label`);
      return;
    }
    if (requirementId !== null && requirementId !== undefined && (typeof requirementId !== 'string' || requirementId.length < 1 || requirementId.length > 64)) {
      invalidReports.push(`observed result #${index} names an invalid requirement id`);
      return;
    }
    if (detail !== undefined && detail !== null && typeof detail !== 'string') {
      invalidReports.push(`observed result #${index} carries a non-string detail`);
      return;
    }
    results.push({
      checkId,
      jobKind,
      outcome,
      requirementId: typeof requirementId === 'string' ? requirementId : null,
      detail: typeof detail === 'string' ? detail.slice(0, 400) : ''
    });
  });
  return { results, invalidReports };
}

export function checkAggregateFit(composition: unknown, observed: unknown): AggregateFitReport {
  const parsed = parseObservedResults(observed);
  const assessment = assessComposition(composition);
  if (assessment.status === 'invalid') {
    return {
      assurance: COMPLETENESS_ASSURANCE,
      status: 'not_fit',
      aggregateOutcome: 'package_defect',
      compositionAssessed: false,
      compositionIssues: assessment.issues,
      checksTotal: 0,
      checksPassed: 0,
      checksObserved: 0,
      checksFailed: [],
      checksUnknown: [],
      checksMissing: [],
      missingPublishedObligations: [],
      invalidReports: parsed.invalidReports,
      jobKindCoverage: { public: 0, private: 0, complete: false },
      limits: COMPLETENESS_LIMITS,
      disclaimer: COMPLETENESS_DISCLAIMER
    };
  }
  const task = assessment.composition!;
  const checks = new Map(task.publicChecks.map(check => [check.id, check]));
  const tallies = new Map<string, { failed: string[]; unverified: string[]; passed: number }>();
  const missingPublishedObligations: { requirementId: string | null; checkId: string; detail: string }[] = [];
  let publicPassed = 0;
  let privatePassed = 0;
  for (const result of parsed.results) {
    const check = checks.get(result.checkId);
    if (check === undefined) {
      missingPublishedObligations.push({
        requirementId: result.requirementId,
        checkId: result.checkId,
        detail: `an observed ${result.jobKind} result references check ${result.checkId} which is not published in the composed contract${result.requirementId === null ? '' : `; requirement ${result.requirementId} is missing from the published obligations`}${result.detail === '' ? '' : `; observed detail: ${result.detail}`}`
      });
      continue;
    }
    const tally = tallies.get(result.checkId) ?? { failed: [], unverified: [], passed: 0 };
    if (result.outcome === 'passed') {
      tally.passed += 1;
      if (result.jobKind === 'public') publicPassed += 1;
      else privatePassed += 1;
    } else if (result.outcome === 'failed') {
      tally.failed.push(result.detail === '' ? `${result.jobKind} evaluation failed` : result.detail);
    } else {
      tally.unverified.push(result.detail === '' ? `${result.jobKind} evaluation outcome unknown` : result.detail);
    }
    tallies.set(result.checkId, tally);
  }
  const checksFailed: ObservedFit[] = [];
  const checksUnknown: { checkId: string; detail: string }[] = [];
  const checksMissing: string[] = [];
  let checksPassed = 0;
  for (const [checkId, check] of checks) {
    const tally = tallies.get(checkId);
    if (tally === undefined) {
      checksMissing.push(checkId);
      continue;
    }
    if (tally.failed.length > 0) {
      checksFailed.push({
        checkId,
        classification: check.kind === 'end_to_end' ? 'integration_failure' : 'contract_failure',
        detail: tally.failed.join(' | ').slice(0, 400)
      });
    } else if (tally.unverified.length > 0 || tally.passed === 0) {
      checksUnknown.push({ checkId, detail: tally.unverified.join(' | ').slice(0, 400) });
    } else {
      checksPassed += 1;
    }
  }
  const jobKindCoverage = { public: publicPassed, private: privatePassed, complete: publicPassed > 0 && privatePassed > 0 };
  let aggregateOutcome: EvaluationOutcome;
  if (missingPublishedObligations.length > 0) aggregateOutcome = 'package_defect';
  else if (checksFailed.length > 0) aggregateOutcome = checksFailed.some(failure => failure.classification === 'integration_failure') ? 'integration_failure' : 'contract_failure';
  else if (checksMissing.length > 0 || checksUnknown.length > 0 || parsed.invalidReports.length > 0 || !jobKindCoverage.complete) aggregateOutcome = 'unverified';
  else aggregateOutcome = 'passed';
  const status = aggregateOutcome === 'passed' ? 'fit' : aggregateOutcome === 'unverified' ? 'unverified' : 'not_fit';
  return {
    assurance: COMPLETENESS_ASSURANCE,
    status,
    aggregateOutcome,
    compositionAssessed: true,
    compositionIssues: [],
    checksTotal: checks.size,
    checksPassed,
    checksObserved: tallies.size,
    checksFailed: Object.freeze(checksFailed),
    checksUnknown: Object.freeze(checksUnknown),
    checksMissing: Object.freeze(checksMissing),
    missingPublishedObligations: Object.freeze(missingPublishedObligations),
    invalidReports: parsed.invalidReports,
    jobKindCoverage,
    limits: COMPLETENESS_LIMITS,
    disclaimer: COMPLETENESS_DISCLAIMER
  };
}
