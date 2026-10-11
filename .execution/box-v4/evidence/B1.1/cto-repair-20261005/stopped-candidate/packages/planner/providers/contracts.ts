import { canonicalize, contentHash } from '../../contracts/hash.js';
import { IntentProposalSchema, PartitionProposalSchema, PrivatePlanningInputSchema, PrivatePartitionInputSchema } from '../../contracts/private/planning.js';
import type { EvidenceReference, IntentProposal, PartitionProposal } from '../../contracts/private/planning.js';
import type { InternalIntent } from '../../contracts/private/index.js';
import type { collectPlanningEvidence } from '../retrieval/index.js';

export type PrivatePlanningInput = ReturnType<typeof collectPlanningEvidence>;
export interface PrivatePartitionInput { approvedIntent: InternalIntent; approvedIntentHash: string; planningEvidence: PrivatePlanningInput; approval?: { intentId: string; version: number; contentHash: string; state: 'approved' } }
export type ProviderMode = 'demo' | 'ollama_protocol_mock' | 'ollama_live';
export interface ProviderProvenance { inputHash: string; proposalHash: string; repairAttempts: 0 | 1; modelVerification: 'not_applicable' | 'protocol_mock' | 'live_response_not_validated' }
export type ProviderResult<T> = { status: 'proposal'; mode: ProviderMode; assurance: 'unverified'; proposal: T; provenance: ProviderProvenance } | { status: 'failed'; mode: ProviderMode; assurance: 'unverified'; reason: 'needs_configuration' | 'cancelled' | 'timeout' | 'invalid_input' | 'invalid_response' | 'provider_unavailable' };
export interface PlannerProvider {
  readonly mode: ProviderMode;
  proposeIntent(input: PrivatePlanningInput, signal?: AbortSignal): Promise<ProviderResult<IntentProposal>>;
  proposePartition(input: PrivatePartitionInput, signal?: AbortSignal): Promise<ProviderResult<PartitionProposal>>;
}
export interface ProposalContext { goal: string; snapshotHash: string; references: readonly EvidenceReference[] }
export function validateIntentProposal(input: unknown, context: ProposalContext): IntentProposal {
  try {
    if (Buffer.byteLength(canonicalize(input)) > 262144) throw new Error();
    const proposal = IntentProposalSchema.parse(input);
    if (proposal.goal !== context.goal || proposal.decisions.some(decision => decision.answer !== null)) throw new Error();
    const supplied = new Set(context.references.map(reference => canonicalize(reference)));
    const returned = [...proposal.evidence, ...proposal.facts.flatMap(fact => fact.evidence)];
    if (returned.some(reference => reference.snapshotHash !== context.snapshotHash || !supplied.has(canonicalize(reference)))) throw new Error();
    return proposal;
  } catch { throw new Error('invalid_intent_proposal'); }
}
export function validatePlanningInput(input: unknown): PrivatePlanningInput {
  const bytes = canonicalize(input);
  if (Buffer.byteLength(bytes) > 262144) throw new Error('invalid_input');
  return PrivatePlanningInputSchema.parse(JSON.parse(bytes));
}
export function validatePartitionInput(input: unknown): PrivatePartitionInput {
  const bytes = canonicalize(input);
  if (Buffer.byteLength(bytes) > 393216) throw new Error('invalid_input');
  const parsed = PrivatePartitionInputSchema.parse(JSON.parse(bytes));
  const planningEvidence = validatePlanningInput(parsed.planningEvidence);
  const approval = parsed.approval;
  const recordBound = approval?.state === 'approved' && approval.intentId === parsed.approvedIntent.intentId && approval.version === parsed.approvedIntent.version && approval.contentHash === parsed.approvedIntentHash;
  if ((parsed.approvedIntent.state !== 'approved' && !(parsed.approvedIntent.state === 'ready_for_approval' && recordBound)) || (approval && !recordBound) || contentHash(parsed.approvedIntent) !== parsed.approvedIntentHash || parsed.approvedIntent.snapshotHash !== planningEvidence.snapshotHash || parsed.approvedIntent.goal !== planningEvidence.request.goal) throw new Error('invalid_input');
  const references = new Set(proposalContext(planningEvidence).references.map(reference => canonicalize(reference)));
  if ([...parsed.approvedIntent.evidence, ...parsed.approvedIntent.facts.flatMap(fact => fact.evidence)].some(reference => !references.has(canonicalize(reference)))) throw new Error('invalid_input');
  return { approvedIntent: parsed.approvedIntent, approvedIntentHash: parsed.approvedIntentHash, planningEvidence, ...(parsed.approval ? { approval: parsed.approval } : {}) };
}
export function proposalContext(input: PrivatePlanningInput): ProposalContext {
  return { goal: input.request.goal, snapshotHash: input.snapshotHash, references: [...input.sources.map(source => source.reference), ...input.attachments.map(item => item.reference)] };
}
export function validatePartitionProposal(input: unknown): PartitionProposal {
  if (Buffer.byteLength(canonicalize(input)) > 262144) throw new Error('invalid_partition_proposal');
  return PartitionProposalSchema.parse(input);
}
export function proposalResult<T>(mode: ProviderMode, input: unknown, proposal: T, repairAttempts: 0 | 1): ProviderResult<T> {
  return { status: 'proposal', mode, assurance: 'unverified', proposal, provenance: { inputHash: contentHash(input), proposalHash: contentHash(proposal), repairAttempts, modelVerification: mode === 'demo' ? 'not_applicable' : mode === 'ollama_protocol_mock' ? 'protocol_mock' : 'live_response_not_validated' } };
}
