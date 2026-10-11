import { createHash } from 'node:crypto';
import { contentHash } from '../../../packages/contracts/hash.js';
import { expect, it } from 'vitest';
import { PrivateIntegrationPlanSchema } from '../../../packages/contracts/private/index.js';
import { PartitionProposalSchema } from '../../../packages/contracts/private/planning.js';
import { composePartition } from '../../../packages/planner/partition/compose.js';
import type { ComposedPartition } from '../../../packages/planner/partition/compose.js';
import {
  CLOUD_GOAL,
  RANKING_GOAL,
  SELECTION_GOAL,
  SELECTION_WITH_POLICY_GOAL,
  SOURCE_CANARY,
  approvedFixture,
  providerPartition,
  syntheticDestinations,
  syntheticPolicyDestinations,
  syntheticRankingDestinations,
  syntheticWithPolicyDestinations
} from './fixtures.js';

function assertProposed(partition: ComposedPartition): Extract<ComposedPartition, { status: 'proposed' }> {
  if (partition.status !== 'proposed') throw new Error(`expected a proposed composed partition, received not_supported: ${partition.reason}`);
  return partition;
}

it('the coherent selection fixture composes connected UI/API units with one integration plan and frozen obligations', async () => {
  const fixture = await approvedFixture(SELECTION_GOAL);
  const composed = assertProposed(composePartition({ partitionInput: fixture.partitionInput, providerProposal: await providerPartition(fixture), declared: syntheticDestinations }));
  expect(compositionOf(composed).disciplines).toEqual(['frontend', 'backend']);
  expect(compositionOf(composed).workUnits.map(unit => unit.id)).toEqual(['selection_ui', 'selection_api']);
  expect(compositionOf(composed).workUnits.map(unit => unit.adapterKind)).toEqual(['frontend_component', 'backend_api']);
  expect(compositionOf(composed).interfaces.map(item => item.id)).toEqual(['selection_http']);
  expect(compositionOf(composed).editablePaths.sort()).toEqual(['src/PlanSelector.tsx', 'src/selectPlan.ts']);
  const http = compositionOf(composed).interfaces[0]!;
  expect(http.requestSemantics).toContain('POST only selectedId');
  expect(http.requestSemantics).toContain('trusted wrapper attaches generic availability context');
  expect(http.responseSemantics).toContain('frozen safe error');
  expect(http.errorStates).toEqual(['unavailable', 'not_found', 'invalid_input']);
  expect(compositionHash(composed)).toMatch(/^[a-f0-9]{64}$/);
  expect(composed.integrationPlan).not.toBeNull();
  const plan = composed.integrationPlan!;
  expect(PrivateIntegrationPlanSchema.safeParse(plan).success).toBe(true);
  expect(plan.workUnitMappings.map(mapping => mapping.unitId)).toEqual(['selection_ui', 'selection_api']);
  expect(plan.workUnitMappings[0]!.retainedAdapterPath).toBe('src/private/selection-provider.ts');
  expect(plan.workUnitMappings[1]!.retainedAdapterPath).toBe('src/private/selection-adapter.ts');
  expect(plan.workUnitMappings.every(mapping => mapping.retainedAdapterPath.split('/').includes('private'))).toBe(true);
  expect(plan.workUnitMappings.every(mapping => !compositionOf(composed).editablePaths.includes(mapping.retainedAdapterPath))).toBe(true);
  expect(plan.interfaceMappings).toEqual([{ interfaceId: 'selection_http', privateAdapterPath: 'src/private/selection-adapter.ts' }]);
  expect(plan.privateTraceability.map(entry => entry.publicRequirementId).sort()).toEqual(['selection_api', 'selection_journey', 'selection_ui']);
  expect(plan.privateTraceability.every(entry => entry.intentRequirementId.length > 0)).toBe(true);
  expect(plan.approvedIntentHash).toBe(fixture.intentHash);
  expect(composed.costRecord.schemaVersion).toBe(1);
  expect(composed.costRecord.units).toHaveLength(2);
  expect(composed.costRecord.retainedWork.join(' ')).toContain('private-managed');
  expect(composed.costRecord.excludedProductionCapabilities).toEqual(['production authentication systems', 'production billing/payment processing']);
  expect(composed.costRecord.unsupported).toEqual([]);
  expect(composed.costRecord.assurance).toBe('bounded');
  expect(JSON.stringify(composed).includes(SOURCE_CANARY)).toBe(false);
});

it('a full-stack outcome stays one task and is never split into separate layer bounties', async () => {
  const fixture = await approvedFixture(SELECTION_GOAL);
  const proposal = PartitionProposalSchema.parse(await providerPartition(fixture));
  expect(proposal.status).toBe('proposed');
  if (proposal.status !== 'proposed') throw new Error('shape');
  expect(proposal.composition.workUnits.length).toBe(2);
  const composed = assertProposed(composePartition({ partitionInput: fixture.partitionInput, providerProposal: proposal, declared: syntheticDestinations }));
  expect(composed.status).toBe('proposed');
  expect(composed.composition).not.toBeNull();
  expect(Object.keys(composed).filter(key => key.startsWith('layer'))).toEqual([]);
  expect(composed.integrationPlan!.workUnitMappings.some(mapping => mapping.unitId === 'selection_ui')).toBe(true);
  expect(composed.integrationPlan!.workUnitMappings.some(mapping => mapping.unitId === 'selection_api')).toBe(true);
  expect(composed.composition!.workUnits.every(unit => ['frontend_component', 'backend_api'].includes(unit.adapterKind))).toBe(true);
});

it('composes a frontend+backend+policy task without splitting disciplines or losing obligations', async () => {
  const fixture = await approvedFixture(SELECTION_WITH_POLICY_GOAL);
  const composed = assertProposed(composePartition({ partitionInput: fixture.partitionInput, providerProposal: await providerPartition(fixture), declared: syntheticWithPolicyDestinations }));
  expect(compositionOf(composed).workUnits.map(unit => unit.adapterKind)).toEqual(['frontend_component', 'backend_api', 'application_policy']);
  expect(compositionOf(composed).endToEndRequirements.length).toBeGreaterThan(0);
  expect(composed.integrationPlan!.privateTraceability.length).toBe(4);
  expect(composed.integrationPlan!.workUnitMappings).toHaveLength(3);
  expect(composed.integrationPlan!.interfaceMappings.map(entry => entry.interfaceId).sort()).toEqual(['response_policy', 'selection_http']);
});

it('retained scoring stays in a private adapter for the pure-module task with no auth or billing capability claims', async () => {
  const fixture = await approvedFixture(RANKING_GOAL);
  const composed = assertProposed(composePartition({ partitionInput: fixture.partitionInput, providerProposal: await providerPartition(fixture), declared: syntheticRankingDestinations }));
  expect(compositionOf(composed).workUnits).toHaveLength(1);
  expect(composed.integrationPlan!.workUnitMappings[0]!.retainedAdapterPath).toBe('src/private/scoring-adapter.ts');
  expect(composed.costRecord.units[0]!.interfacesSupplied).toBe(0);
  expect(composed.costRecord.excludedProductionCapabilities.join(' ')).toContain('billing');
  expect(compositionOf(composed).workUnits.every(unit => unit.trustedCheckIds.every(checkId => checkId.startsWith(unit.id)))).toBe(true);
});

it('an approved data-only application-policy unit is allowed to map its declared data file privately', async () => {
  const fixture = await approvedFixture(demoPolicyGoal());
  const composed = assertProposed(composePartition({ partitionInput: fixture.partitionInput, providerProposal: await providerPartition(fixture), declared: syntheticPolicyDestinations }));
  expect(compositionOf(composed).workUnits[0]!.adapterKind).toBe('application_policy');
  expect(composed.integrationPlan!.workUnitMappings[0]!.privateDestinationPath).toBe('config/response-security.json');
  expect(composed.integrationPlan!.workUnitMappings[0]!.retainedAdapterPath).toBe('src/private/response-policy-wrapper.ts');
  expect(composed.costRecord.units[0]!.effortBand).toBe('small');
});

it('composes deterministically: identical inputs produce identical output including identifiers and hashes', async () => {
  const fixture = await approvedFixture(SELECTION_GOAL);
  const providerProposal = await providerPartition(fixture);
  const first = composePartition({ partitionInput: fixture.partitionInput, providerProposal, declared: syntheticDestinations });
  const second = composePartition({ partitionInput: fixture.partitionInput, providerProposal, declared: syntheticDestinations });
  expect(first).toEqual(second);
  expect(first.costRecord.compositionHash).toBe(second.costRecord.compositionHash);
});

it('external requirements that cannot trace to the approved intent are recorded, not silently composed', async () => {
  const fixture = await approvedFixture(SELECTION_GOAL);
  const providerProposal = await providerPartition(fixture);
  const strippedIntent = { ...fixture.intent, acceptanceExamples: [] as [] };
  const strippedHash = contentHash(strippedIntent);
  const partitionInput = { ...fixture.partitionInput, approvedIntent: strippedIntent, approvedIntentHash: strippedHash, approval: { intentId: fixture.intent.intentId, version: 1, contentHash: strippedHash, state: 'approved' as const } };
  const composed = composePartition({ partitionInput, providerProposal, declared: syntheticDestinations });
  expect(composed.status).toBe('not_supported');
  expect(composed.reason).toContain('cannot be traced privately to an approved intent requirement');
  expect(composed.unsupported.some(record => record.kind === 'untraceable_requirement')).toBe(true);
  expect(composed.missingCapabilities.length).toBeGreaterThan(0);
  expect(composed.integrationPlan).toBeNull();
});

it('a missing declared private destination or interface adapter is an explicit not_supported result', async () => {
  const fixture = await approvedFixture(SELECTION_GOAL);
  const providerProposal = await providerPartition(fixture);
  const missingUnit = { ...syntheticDestinations, workUnitDestinations: { selection_ui: syntheticDestinations.workUnitDestinations.selection_ui } };
  const composedUnit = composePartition({ partitionInput: fixture.partitionInput, providerProposal, declared: missingUnit });
  expect(composedUnit.status).toBe('not_supported');
  expect(composedUnit.reason).toContain('selection_api has no declared private integration destination');

  const missingInterface = { ...syntheticDestinations, interfaceAdapters: {} };
  const composedInterface = composePartition({ partitionInput: fixture.partitionInput, providerProposal, declared: missingInterface });
  expect(composedInterface.status).toBe('not_supported');
  expect(composedInterface.reason).toContain('selection_http has no declared private adapter');
  expect(composedInterface.unsupported.some(record => record.kind === 'unmapped_interface')).toBe(true);
});

it('retained adapters must stay private-managed and outside candidate-editable paths', async () => {
  const fixture = await approvedFixture(SELECTION_GOAL);
  const providerProposal = await providerPartition(fixture);
  const publicAdapter = { ...syntheticDestinations, workUnitDestinations: { selection_ui: { privateDestinationPath: 'src/selection/SelectionPanel.tsx', retainedAdapterPath: 'src/wrapper.ts' }, selection_api: syntheticDestinations.workUnitDestinations.selection_api } };
  const composedPublic = composePartition({ partitionInput: fixture.partitionInput, providerProposal, declared: publicAdapter });
  expect(composedPublic.status).toBe('not_supported');
  expect(composedPublic.reason).toContain('private-managed path segment');

  const editableAdapter = { ...syntheticDestinations, interfaceAdapters: { selection_http: { privateAdapterPath: 'src/selectPlan.ts' } } };
  const composedEditable = composePartition({ partitionInput: fixture.partitionInput, providerProposal, declared: editableAdapter });
  expect(composedEditable.status).toBe('not_supported');
  expect(composedEditable.reason).toContain('candidate-editable');
});

it('provider-level unsupported outcomes flow through with retained work and explicit capability gaps', async () => {
  const fixture = await approvedFixture(CLOUD_GOAL);
  const partition = fixture.provider.proposePartition.bind(fixture.provider);
  const result = await partition(fixture.partitionInput);
  expect(result.status).toBe('proposal');
  if (result.status !== 'proposal') throw new Error('shape');
  expect(result.proposal.status).toBe('not_supported');
  const composed = composePartition({ partitionInput: fixture.partitionInput, providerProposal: result.proposal, declared: syntheticDestinations });
  expect(composed.status).toBe('not_supported');
  expect(composed.reason).toContain('cloud infrastructure adapter');
  expect(composed.missingCapabilities.length).toBeGreaterThan(0);
  expect(composed.costRecord.retainedWork.length).toBeGreaterThan(0);
  expect(composed.costRecord.units).toHaveLength(0);
  expect(composed.composition).toBeNull();
});

it('mismatched approved-intent bindings are refused as not_supported instead of composed', async () => {
  const fixture = await approvedFixture(SELECTION_GOAL);
  const wrongHashInput = { ...fixture.partitionInput, approvedIntentHash: 'c'.repeat(64), approval: { intentId: fixture.intent.intentId, version: 1, contentHash: 'c'.repeat(64), state: 'approved' as const } };
  const composed = composePartition({ partitionInput: wrongHashInput, providerProposal: await providerPartition(fixture), declared: syntheticDestinations });
  expect(composed.status).toBe('not_supported');
  expect(composed.reason).toContain('do not bind tightly');
});

function compositionOf(partition: ComposedPartition) {
  return assertProposed(partition).composition!;
}

function compositionHash(partition: ComposedPartition): string {
  return assertProposed(partition).costRecord.compositionHash;
}

const composedPlaceholder: ComposedPartition = {
  assurance: 'bounded',
  status: 'not_supported',
  reason: '',
  missingCapabilities: [],
  taskId: '00000000-0000-5000-8000-000000000000',
  composition: null,
  integrationPlan: null,
  costRecord: { schemaVersion: 1, compositionHash: 'a'.repeat(64), units: [], retainedWork: [], excludedProductionCapabilities: [], unsupported: [], assurance: 'bounded' },
  unsupported: []
};

function demoPolicyGoal(): string {
  return 'Emit the agreed HTTPS response security headers while preserving the excluded health route and localhost behaviour.';
}
