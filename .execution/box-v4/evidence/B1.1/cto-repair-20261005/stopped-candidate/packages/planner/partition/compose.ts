import { contentHash } from '../../contracts/hash.js';
import { PrivateIntegrationPlanSchema } from '../../contracts/private/index.js';
import type { InternalIntent, PrivateIntegrationPlan } from '../../contracts/private/index.js';
import { PartitionProposalSchema } from '../../contracts/private/planning.js';
import type { Composition } from '../../contracts/public/composition.js';
import type { PartitionProposal } from '../../contracts/private/planning.js';
import { ADAPTER_REGISTRY } from '../../contracts/public/composition.js';
import { validatePartitionInput } from '../providers/contracts.js';
import type { PrivatePartitionInput } from '../providers/contracts.js';
import { PortablePathSchema } from '../../contracts/paths.js';

const RESERVED_BINDING_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const EXCLUDED_PRODUCTION_CAPABILITIES: readonly string[] = [
  'production authentication systems',
  'production billing/payment processing'
];

const COMPOSER_RETAINED_WORK: readonly string[] = [
  'Protected eligibility/pricing/scoring computations and trusted wrappers remain private-managed retained adapters.',
  'The composed task records retained work and unsupported results explicitly; no connected responsibility is omitted or split by layer.',
  'No production authentication or billing capability is claimed by this proposal.'
];

export interface DeclaredUnitTarget {
  readonly privateDestinationPath: string;
  readonly retainedAdapterPath: string;
}

export interface DeclaredIntegrationTargets {
  readonly privateRevision: string;
  readonly templateVersion: number;
  readonly workUnitDestinations: Readonly<Record<string, DeclaredUnitTarget>>;
  readonly interfaceAdapters: Readonly<Record<string, { readonly privateAdapterPath: string }>>;
}

export type PartitionUnsupportedKind =
  | 'untraceable_requirement'
  | 'missing_declared_target'
  | 'unmapped_interface'
  | 'non_private_retained_adapter'
  | 'retained_path_candidate_editable'
  | 'unsupported_adapter_kind'
  | 'conflicting_private_destinations'
  | 'provider_unsupported'
  | 'broken_composition';

export interface PartitionUnsupportedRecord {
  readonly kind: PartitionUnsupportedKind;
  readonly detail: string;
}

export interface PartitionCostUnit {
  readonly unitId: string;
  readonly adapterKind: string;
  readonly adapterVersion: number;
  readonly effortBand: 'small' | 'medium' | 'large';
  readonly editablePathCount: number;
  readonly retainedAdapterPath: string;
  readonly interfacesSupplied: number;
}

export interface PartitionCostRecord {
  readonly schemaVersion: 1;
  readonly compositionHash: string;
  readonly units: readonly PartitionCostUnit[];
  readonly retainedWork: readonly string[];
  readonly excludedProductionCapabilities: readonly string[];
  readonly unsupported: readonly PartitionUnsupportedRecord[];
  readonly assurance: 'bounded';
}

export interface ComposedPartitionBase {
  readonly assurance: 'bounded';
  readonly taskId: string;
  readonly costRecord: PartitionCostRecord;
}

export interface ProposedPartition extends ComposedPartitionBase {
  readonly status: 'proposed';
  readonly reason: '';
  readonly missingCapabilities: readonly [];
  readonly composition: Composition;
  readonly integrationPlan: PrivateIntegrationPlan;
  readonly unsupported: readonly [];
}

export interface UnsupportedPartition extends ComposedPartitionBase {
  readonly status: 'not_supported';
  readonly reason: string;
  readonly missingCapabilities: readonly string[];
  readonly composition: null;
  readonly integrationPlan: null;
  readonly unsupported: readonly PartitionUnsupportedRecord[];
}

export type ComposedPartition = ProposedPartition | UnsupportedPartition;

export interface ComposePartitionInput {
  readonly partitionInput: unknown;
  readonly providerProposal: unknown;
  readonly declared: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Array.isArray(value) === false;
}

function safeId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value) && !RESERVED_BINDING_KEYS.has(value);
}

function parseDeclared(value: unknown): { readonly targets: DeclaredIntegrationTargets } | { readonly failure: string } {
  if (!isPlainObject(value)) return { failure: 'declared private integration targets must be a strict object' };
  if (typeof value.privateRevision !== 'string' || !/^[a-f0-9]{64}$/.test(value.privateRevision)) return { failure: 'declared privateRevision must be a 64-hex digest' };
  if (typeof value.templateVersion !== 'number' || !Number.isSafeInteger(value.templateVersion) || value.templateVersion < 1 || value.templateVersion > 2147483647) return { failure: 'declared templateVersion must be a bounded positive integer' };
  if (!isPlainObject(value.workUnitDestinations) || !isPlainObject(value.interfaceAdapters)) return { failure: 'declared workUnitDestinations and interfaceAdapters must be strict objects' };
  const workUnitDestinations: Record<string, DeclaredUnitTarget> = {};
  for (const [unitId, raw] of Object.entries(value.workUnitDestinations)) {
    if (!safeId(unitId) || !isPlainObject(raw)) return { failure: `declared destination for ${unitId.slice(0, 32)} must use a valid unit id and object shape` };
    const destination = PortablePathSchema.safeParse(raw.privateDestinationPath);
    const adapter = PortablePathSchema.safeParse(raw.retainedAdapterPath);
    if (!destination.success || !adapter.success) return { failure: `declared paths for unit ${unitId.slice(0, 32)} must be safe portable relative paths` };
    workUnitDestinations[unitId] = { privateDestinationPath: destination.data, retainedAdapterPath: adapter.data };
  }
  const interfaceAdapters: Record<string, { readonly privateAdapterPath: string }> = {};
  for (const [interfaceId, raw] of Object.entries(value.interfaceAdapters)) {
    if (!safeId(interfaceId) || !isPlainObject(raw) || !PortablePathSchema.safeParse(raw.privateAdapterPath).success) return { failure: `declared adapter for interface ${interfaceId.slice(0, 32)} must be a valid id with a safe portable path` };
    interfaceAdapters[interfaceId] = { privateAdapterPath: String(raw.privateAdapterPath) };
  }
  return { targets: Object.freeze({ privateRevision: value.privateRevision, templateVersion: value.templateVersion, workUnitDestinations: Object.freeze(workUnitDestinations), interfaceAdapters: Object.freeze(interfaceAdapters) }) };
}

function deterministicUuid(seedHex: string): string {
  const normalized = seedHex.replace(/[^0-9a-fA-F]/g, '').slice(0, 32);
  if (normalized.length < 32) return '00000000-0000-5000-8000-000000000000';
  const variant = '89ab'.charAt(parseInt(normalized.slice(16, 17), 16) % 4);
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-5${normalized.slice(13, 16)}-${variant}${normalized.slice(17, 20)}-${normalized.slice(20, 32)}`;
}

function effortBandOf(totalEditablePaths: number): 'small' | 'medium' | 'large' {
  if (totalEditablePaths <= 2) return 'small';
  if (totalEditablePaths <= 6) return 'medium';
  return 'large';
}

function costRecord(compositionHash: string, units: readonly PartitionCostUnit[], unsupported: readonly PartitionUnsupportedRecord[]): PartitionCostRecord {
  return {
    schemaVersion: 1,
    compositionHash,
    units: Object.freeze([...units]),
    retainedWork: COMPOSER_RETAINED_WORK,
    excludedProductionCapabilities: EXCLUDED_PRODUCTION_CAPABILITIES,
    unsupported: Object.freeze([...unsupported]),
    assurance: 'bounded'
  };
}

function hasPrivateSegment(path: string): boolean {
  return path.split('/').some(segment => segment === 'private');
}

function assertDistinctTargets(paths: readonly string[]): void {
  const normalized = paths.map(path => path.toLowerCase());
  const seen = new Set<string>();
  for (const path of normalized) {
    if (seen.has(path)) throw new Error('collision');
    for (const prior of seen) if (prior.startsWith(`${path}/`) || path.startsWith(`${prior}/`)) throw new Error('prefix');
    seen.add(path);
  }
}

function unsupportedResult(reason: string, missingCapabilities: readonly string[], unsupported: readonly PartitionUnsupportedRecord[] = []): ComposedPartition {
  const compositionHash = contentHash({ reason, missingCapabilities });
  return {
    assurance: 'bounded',
    status: 'not_supported',
    reason,
    missingCapabilities,
    taskId: deterministicUuid(compositionHash),
    composition: null,
    integrationPlan: null,
    costRecord: costRecord(compositionHash, [], [{ kind: 'provider_unsupported', detail: reason }]),
    unsupported
  };
}

export function composePartition(input: ComposePartitionInput): ComposedPartition {
  const proposalValidation = isPlainObject(input.providerProposal)
    ? PartitionProposalSchema.safeParse(input.providerProposal)
    : { success: false as const };
  if (!proposalValidation.success) {
    return unsupportedResult('the provider partition proposal is missing or invalid', ['a validated provider partition proposal']);
  }
  const proposal = proposalValidation.data;
  if (proposal.status === 'not_supported') {
    const compositionHash = contentHash({ reason: proposal.reason, missingCapabilities: proposal.missingCapabilities });
    return {
      assurance: 'bounded',
      status: 'not_supported',
      reason: proposal.reason,
      missingCapabilities: proposal.missingCapabilities,
      taskId: deterministicUuid(compositionHash),
      composition: null,
      integrationPlan: null,
      costRecord: costRecord(compositionHash, [], [{ kind: 'provider_unsupported', detail: proposal.reason }]),
      unsupported: [{ kind: 'provider_unsupported', detail: proposal.reason }]
    };
  }
  let partition: PrivatePartitionInput;
  try {
    partition = validatePartitionInput(input.partitionInput);
  } catch {
    return unsupportedResult('the approved intent, its exact hash and the planning evidence do not bind tightly', ['exact approved intent, content-hash and planning-evidence bindings']);
  }
  const declaredResult = parseDeclared(input.declared);
  if ('failure' in declaredResult) {
    return unsupportedResult(declaredResult.failure, ['declared, validated private integration targets']);
  }
  return composeProposed(proposal, partition.approvedIntent, partition.approvedIntentHash, declaredResult.targets);
}

function composeProposed(proposal: Extract<PartitionProposal, { status: 'proposed' }>, approvedIntent: InternalIntent, approvedIntentHash: string, declared: DeclaredIntegrationTargets): ComposedPartition {
  const composition = proposal.composition;
  const compositionHash = contentHash(composition);
  const units: PartitionCostUnit[] = [];

  for (const unit of composition.workUnits) {
    const registration = ADAPTER_REGISTRY[unit.adapterKind];
    if (unit.adapterVersion !== registration.version) {
      return unsupportedResult(`work unit ${unit.id} uses adapter version ${unit.adapterVersion} which is not registered`, [`registered adapter kind and version 1`]);
    }
    const target = declared.workUnitDestinations[unit.id];
    if (target === undefined) {
      return unsupportedResult(`work unit ${unit.id} has no declared private integration destination; connected work is not silently dropped`, ['declared private destination and retained adapter'], [{ kind: 'missing_declared_target', detail: `work unit ${unit.id} has no declared private destination` }]);
    }
    if (!hasPrivateSegment(target.retainedAdapterPath)) {
      return unsupportedResult(`the retained adapter for work unit ${unit.id} must stay inside a private-managed path segment`, ['a private-managed retained adapter path'], [{ kind: 'non_private_retained_adapter', detail: `retained adapter for ${unit.id} is not inside a private-managed path` }]);
    }
    const editablePaths = composition.editablePaths.map(path => path.toLowerCase());
    const destinationCollision = editablePaths.includes(target.privateDestinationPath.toLowerCase()) && unit.adapterKind !== 'application_policy';
    if (destinationCollision || editablePaths.includes(target.retainedAdapterPath.toLowerCase())) {
      return unsupportedResult('candidate-editable work is limited to public template paths; private destinations (except approved application-policy data) and retained adapters are never candidate-editable', ['distinct candidate-editable and private-path ownership'], [{ kind: 'retained_path_candidate_editable', detail: `private or retained paths for ${unit.id} collide with candidate-editable paths` }]);
    }
    units.push({ unitId: unit.id, adapterKind: unit.adapterKind, adapterVersion: unit.adapterVersion, effortBand: effortBandOf(composition.editablePaths.length), editablePathCount: unit.editablePaths.length, retainedAdapterPath: target.retainedAdapterPath, interfacesSupplied: unit.interfaceIds.length });
  }

  const allDestinations = composition.workUnits.flatMap(unit => {
    const target = declared.workUnitDestinations[unit.id];
    return target === undefined ? [] : [target.privateDestinationPath];
  });
  try {
    assertDistinctTargets(allDestinations);
  } catch {
    return unsupportedResult('declared private destinations collide or case-fold into each other', ['distinct declared private destinations'], [{ kind: 'conflicting_private_destinations', detail: Object.freeze(JSON.stringify({ units: composition.workUnits.map(unit => unit.id) })) }]);
  }

  for (const item of composition.interfaces) {
    if (declared.interfaceAdapters[item.id] === undefined) {
      return unsupportedResult(`public interface ${item.id} has no declared private adapter; the composed task cannot transfer without it`, ['declared private interface adapters'], [{ kind: 'unmapped_interface', detail: `interface ${item.id} has no declared private adapter` }]);
    }
    if (composition.editablePaths.map(path => path.toLowerCase()).includes(declared.interfaceAdapters[item.id]!.privateAdapterPath.toLowerCase())) {
      return unsupportedResult('candidate-editable work is limited to public template paths; private interface adapters are never candidate-editable', ['distinct candidate-editable and private-path ownership'], [{ kind: 'retained_path_candidate_editable', detail: `the private adapter for interface ${item.id} collides with candidate-editable paths` }]);
    }
  }

  const intentExamples = new Map(approvedIntent.acceptanceExamples.map(example => [example.id, example.id]));
  const publicRequirementIds = [...new Set([...composition.requirements.map(entry => entry.id), ...composition.endToEndRequirements.map(entry => entry.id), ...composition.interfaces.flatMap(item => item.compatibilityRequirementIds)])];
  const traceability: { publicRequirementId: string; intentRequirementId: string }[] = [];
  for (const requirementId of publicRequirementIds) {
    const mapped = intentExamples.get(requirementId);
    if (mapped === undefined) {
      return unsupportedResult(`public requirement ${requirementId} cannot be traced privately to an approved intent requirement; nothing is approved or silently invented`, ['public requirements traced to exact approved intent requirements'], [{ kind: 'untraceable_requirement', detail: `requirement ${requirementId} does not trace to an approved intent acceptance example` }]);
    }
    traceability.push({ publicRequirementId: requirementId, intentRequirementId: mapped });
  }

  const workUnitMappings = composition.workUnits.flatMap(unit => unit.editablePaths.map(path => ({
    unitId: unit.id,
    publicPath: path,
    privateDestinationPath: declared.workUnitDestinations[unit.id]!.privateDestinationPath,
    retainedAdapterPath: declared.workUnitDestinations[unit.id]!.retainedAdapterPath
  })));
  const interfaceMappings = composition.interfaces.map(item => ({
    interfaceId: item.id,
    privateAdapterPath: declared.interfaceAdapters[item.id]!.privateAdapterPath
  }));
  const preservationRequirementIds = [...new Set(composition.interfaces.flatMap(item => item.compatibilityRequirementIds))];

  const taskId = deterministicUuid(contentHash(`task:${approvedIntentHash}:${compositionHash}`));
  const planDraft = {
    schemaVersion: 1 as const,
    planId: deterministicUuid(contentHash(`plan:${taskId}:${declared.privateRevision}:${declared.templateVersion}`)),
    taskId,
    taskVersion: 1,
    privateRevision: declared.privateRevision,
    approvedIntentHash,
    templateVersion: declared.templateVersion,
    workUnitMappings,
    interfaceMappings,
    retainedWork: [...proposal.retainedPrivateWork, ...COMPOSER_RETAINED_WORK],
    preservationRequirementIds,
    privateTraceability: traceability
  };
  const planValidation = PrivateIntegrationPlanSchema.safeParse(planDraft);
  if (!planValidation.success) {
    return unsupportedResult('declared work-unit or interface mappings conflict in the private integration plan (mapping paths must be distinct and owned)', ['distinct and owned private mapping paths'], [{ kind: 'broken_composition', detail: 'work-unit mapping paths conflict in the private integration plan' }]);
  }

  return {
    assurance: 'bounded',
    status: 'proposed',
    reason: '',
    missingCapabilities: [],
    taskId,
    composition: Object.freeze(JSON.parse(JSON.stringify(composition)) as Composition),
    integrationPlan: planValidation.data,
    costRecord: costRecord(compositionHash, Object.freeze(units), []),
    unsupported: []
  };
}
