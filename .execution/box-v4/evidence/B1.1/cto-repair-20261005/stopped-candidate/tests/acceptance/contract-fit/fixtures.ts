import { randomUUID } from 'node:crypto';
import { contentHash } from '../../../packages/contracts/hash.js';
import { InternalIntentSchema } from '../../../packages/contracts/private/index.js';
import type { InternalIntent } from '../../../packages/contracts/private/index.js';
import type { PrivateIntegrationPlan } from '../../../packages/contracts/private/index.js';
import { DemoPlannerProvider } from '../../../packages/planner/providers/demo.js';
import { demoFixtures } from '../../../packages/planner/providers/demo-fixtures.js';
import type { PrivatePlanningInput, PrivatePartitionInput } from '../../../packages/planner/providers/contracts.js';
import { composePartition } from '../../../packages/planner/partition/compose.js';
import type { ComposedPartition } from '../../../packages/planner/partition/compose.js';
import type { Composition } from '../../../packages/contracts/public/composition.js';
import type { ObservedCheckResult } from '../../../packages/evaluation/contracts/completeness.js';

export const SELECTION_GOAL = demoFixtures.find(fixture => fixture.id === 'selection_journey')!.goal;
export const RANKING_GOAL = demoFixtures.find(fixture => fixture.id === 'ranking')!.goal;
export const CLOUD_GOAL = demoFixtures.find(fixture => fixture.id === 'cloud_deployment')!.goal;
export const WITH_POLICY_GOAL = demoFixtures.find(fixture => fixture.id === 'selection_with_policy')!.goal;

export const FIT_CANARY = 'SYNTHETIC_CONTRACT_FIT_SOURCE_CANARY_A17';

export interface ApprovedFixture {
  readonly provider: DemoPlannerProvider;
  readonly planning: PrivatePlanningInput;
  readonly intent: InternalIntent;
  readonly intentHash: string;
  readonly partitionInput: PrivatePartitionInput;
}

export function planningInput(goal: string): PrivatePlanningInput {
  const snapshotId = randomUUID();
  const snapshotHash = 'a'.repeat(64);
  return {
    assurance: 'bounded',
    request: { requestId: randomUUID(), snapshotId, goal, currentBehaviour: '', desiredBehaviour: '', constraints: [], exclusions: [] },
    snapshotHash,
    sources: [{ reference: { evidenceId: snapshotId, snapshotHash, location: 'src/selection/api.ts' }, sha256: 'b'.repeat(64), text: `${FIT_CANARY} synthetic source observation only.`, truncated: false }],
    attachments: [],
    imageUnderstanding: false,
    textByteLimit: 65536
  };
}

export async function approvedFixture(goal: string): Promise<ApprovedFixture> {
  const provider = new DemoPlannerProvider();
  const planning = planningInput(goal);
  const intentResult = await provider.proposeIntent(planning);
  if (intentResult.status !== 'proposal') throw new Error('demo intent proposal failed');
  const decisions = intentResult.proposal.decisions.map(decision => ({ ...decision, answer: 'Confirmed synthetic outcome.' }));
  const intent = InternalIntentSchema.parse({
    schemaVersion: 1,
    intentId: randomUUID(),
    version: 1,
    state: 'approved',
    goal: planning.request.goal,
    snapshotHash: planning.snapshotHash,
    facts: intentResult.proposal.facts,
    evidence: intentResult.proposal.evidence,
    decisions,
    assumptions: intentResult.proposal.assumptions,
    unknowns: intentResult.proposal.unknowns,
    acceptanceExamples: intentResult.proposal.acceptanceExamples,
    scope: {
      included: [`Private provenance: planning request ${planning.request.requestId} supplied the captured snapshot and evidence for this intent.`, ...intentResult.proposal.scope.included],
      excluded: [...intentResult.proposal.scope.excluded]
    }
  });
  const intentHash = contentHash(intent);
  return {
    provider,
    planning,
    intent,
    intentHash,
    partitionInput: {
      approvedIntent: intent as never,
      approvedIntentHash: intentHash,
      planningEvidence: planning,
      approval: { intentId: intent.intentId, version: 1, contentHash: intentHash, state: 'approved' }
    }
  };
}

export const SELECTION_DESTINATIONS = {
  privateRevision: 'f'.repeat(64),
  templateVersion: 1,
  workUnitDestinations: {
    selection_ui: { privateDestinationPath: 'src/selection/SelectionPanel.tsx', retainedAdapterPath: 'src/private/selection-provider.ts' },
    selection_api: { privateDestinationPath: 'src/selection/api.ts', retainedAdapterPath: 'src/private/selection-adapter.ts' }
  },
  interfaceAdapters: { selection_http: { privateAdapterPath: 'src/private/selection-adapter.ts' } }
} as const;

export const WITH_POLICY_DESTINATIONS = {
  privateRevision: 'f'.repeat(64),
  templateVersion: 1,
  workUnitDestinations: {
    selection_ui: { privateDestinationPath: 'src/selection/SelectionPanel.tsx', retainedAdapterPath: 'src/private/selection-provider.ts' },
    selection_api: { privateDestinationPath: 'src/selection/api.ts', retainedAdapterPath: 'src/private/selection-adapter.ts' },
    response_policy: { privateDestinationPath: 'config/response-security.json', retainedAdapterPath: 'src/private/response-policy-wrapper.ts' }
  },
  interfaceAdapters: {
    selection_http: { privateAdapterPath: 'src/private/selection-adapter.ts' },
    response_policy: { privateAdapterPath: 'src/private/response-policy-wrapper.ts' }
  }
} as const;

export const RANKING_DESTINATIONS = {
  privateRevision: 'f'.repeat(64),
  templateVersion: 1,
  workUnitDestinations: { ranking: { privateDestinationPath: 'src/ranking/rankPrivateItems.ts', retainedAdapterPath: 'src/private/scoring-adapter.ts' } },
  interfaceAdapters: {}
} as const;

export async function proposedPartition(fixture: ApprovedFixture, declared: unknown): Promise<Extract<ComposedPartition, { status: 'proposed' }>> {
  const result = await fixture.provider.proposePartition(fixture.partitionInput);
  if (result.status !== 'proposal') throw new Error(`demo partition proposal failed: ${result.reason}`);
  const composed = composePartition({ partitionInput: fixture.partitionInput, providerProposal: result.proposal, declared });
  if (composed.status !== 'proposed') throw new Error(`expected a proposed composed partition, received not_supported: ${composed.reason}`);
  return composed;
}

export async function composedSelection(): Promise<Extract<ComposedPartition, { status: 'proposed' }>> {
  return proposedPartition(await approvedFixture(SELECTION_GOAL), SELECTION_DESTINATIONS);
}

export async function composedWithPolicy(): Promise<Extract<ComposedPartition, { status: 'proposed' }>> {
  return proposedPartition(await approvedFixture(WITH_POLICY_GOAL), WITH_POLICY_DESTINATIONS);
}

export async function composedRanking(): Promise<Extract<ComposedPartition, { status: 'proposed' }>> {
  return proposedPartition(await approvedFixture(RANKING_GOAL), RANKING_DESTINATIONS);
}

export async function unsupportedCloudPartition(): Promise<ComposedPartition> {
  const fixture = await approvedFixture(CLOUD_GOAL);
  const result = await fixture.provider.proposePartition(fixture.partitionInput);
  if (result.status !== 'proposal') throw new Error(`demo partition proposal failed: ${result.reason}`);
  return composePartition({ partitionInput: fixture.partitionInput, providerProposal: result.proposal, declared: SELECTION_DESTINATIONS });
}

export function observed(checkId: string, jobKind: 'public' | 'private', outcome: 'passed' | 'failed' | 'unverified', requirementId: string | null = null, detail = ''): ObservedCheckResult {
  return { checkId, jobKind, outcome, requirementId, detail };
}

export const SELECTION_CHECK_IDS: readonly string[] = ['selection_ui_check', 'selection_api_check', 'selection_http_check', 'selection_journey_check'];
export const RANKING_CHECK_IDS: readonly string[] = ['ranking_check'];

export function completeSelectionEvidence(checkOutcomes: 'all_passed' | 'units_passed_only' | 'mismatch' = 'all_passed', detailSuffix = ''): ObservedCheckResult[] {
  const entries: ObservedCheckResult[] = [];
  for (const checkId of SELECTION_CHECK_IDS) {
    const isUnit = checkId.endsWith('_check') && (checkId === 'selection_ui_check' || checkId === 'selection_api_check');
    if (checkOutcomes === 'all_passed' || (checkOutcomes === 'units_passed_only' && isUnit) || (checkOutcomes === 'mismatch' && isUnit)) {
      entries.push(observed(checkId, isUnit ? 'public' : 'private', 'passed', null, `reference implementation observed${detailSuffix}`));
    } else if (checkOutcomes === 'mismatch' && checkId === 'selection_http_check') {
      entries.push(observed(checkId, 'private', 'failed', null, `client response {planId} disagrees with the published {selectedId} interface schema${detailSuffix}`));
    } else if (checkOutcomes === 'mismatch' && checkId === 'selection_journey_check') {
      entries.push(observed(checkId, 'private', 'passed', null, `end-to-end journey observed${detailSuffix}`));
    }
  }
  return entries;
}

export function alternativeSelectionEvidence(label: string): ObservedCheckResult[] {
  return completeSelectionEvidence('all_passed', `; alternative implementation ${label} observed through the same published obligations`);
}

export function unpublishedPrivateRequirementEvidence(): ObservedCheckResult[] {
  return [
    ...completeSelectionEvidence(),
    observed('private_integration_context_guard', 'private', 'failed', 'browser_context_cannot_override', 'the private integration observed a requirement the published contract never published')
  ];
}

export function partitionWithoutUnitMapping(partition: Extract<ComposedPartition, { status: 'proposed' }>): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(partition)) as Record<string, unknown>;
  const plan = clone.integrationPlan as PrivateIntegrationPlan;
  clone.integrationPlan = { ...plan, workUnitMappings: plan.workUnitMappings.filter(mapping => mapping.unitId === 'selection_ui') };
  return clone;
}

export function compositionWithoutInterfaceCheck(composition: Composition): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(composition)) as Record<string, unknown>;
  clone.publicChecks = (clone.publicChecks as unknown[]).filter(check => (check as { id: string }).id !== 'selection_http_check');
  return clone;
}

export function compositionWithConflictingClientSchema(composition: Composition): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(composition)) as Record<string, unknown>;
  const units = clone.workUnits as { id: string; interfaceIds: string[] }[];
  const ui = units.find(unit => unit.id === 'selection_ui');
  if (ui === undefined) throw new Error('fixture shape');
  ui.interfaceIds.push('selection_http_client');
  (clone.interfaces as unknown[]).push({
    id: 'selection_http_client',
    producerUnitIds: ['selection_ui'],
    consumerUnitIds: ['selection_ui'],
    schema: { id: 'selection_schema_client', version: 1, path: 'interfaces/selection.json', sha256: 'd'.repeat(64) },
    semantics: 'request_response',
    requestSemantics: 'Client projection expects {planId} back.',
    responseSemantics: 'Client-side response projection disagrees with the published interface schema.',
    errorStates: ['unavailable'],
    ownerUnitId: 'selection_ui',
    compatibilityRequirementIds: ['selection_ui']
  });
  return clone;
}

export function compositionWithUnknownAdapterVersion(composition: Composition): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(composition)) as Record<string, unknown>;
  const units = clone.workUnits as { id: string; adapterVersion: number }[];
  const api = units.find(unit => unit.id === 'selection_api');
  if (api === undefined) throw new Error('fixture shape');
  api.adapterVersion = 2;
  return clone;
}
