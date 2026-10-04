import type { InternalIntent } from '../../../packages/contracts/private/index.js';
import type { SessionActor } from '../../../packages/contracts/auth/store.js';
import { WorkflowError } from '../../../packages/contracts/workflow/index.js';
import { validatePartitionInput } from '../../../packages/planner/providers/contracts.js';
import type { PrivatePlanningInput, PlannerProvider, ProviderResult } from '../../../packages/planner/providers/contracts.js';
import { DemoPlannerProvider } from '../../../packages/planner/providers/demo.js';
import { OllamaPlannerProvider } from '../../../packages/planner/providers/ollama.js';
import { composePartition } from '../../../packages/planner/partition/compose.js';
import type { ComposedPartition } from '../../../packages/planner/partition/compose.js';
import { provenanceRequest } from '../intents/orchestrator.js';
import { ProviderUnavailable } from '../intents/types.js';
import { PartitionRequestSchema } from './types.js';
import type { PreparationPlanningMode, PreparationProjection, ProviderProvenanceView } from './types.js';

export interface PreparationIntentRead {
  id: string;
  version: number;
  state: string;
  contentHash: string;
  intent: InternalIntent;
  approval: { approvedBy: string; approvedHash: string; approvedAt: string } | null;
  supersededApproval: boolean;
}

export interface PreparationIntentSource {
  read(actor: SessionActor, intentId: string): Promise<PreparationIntentRead>;
}

export interface PreparationEvidenceSource {
  planningInput(actor: SessionActor, requestId: string): Promise<PrivatePlanningInput>;
}

export interface PreparationIntegrationSource {
  declaredTargets(actor: SessionActor, intent: InternalIntent): Promise<unknown>;
}

export interface PreparationOrchestration {
  propose(actor: SessionActor, intentId: string, body: unknown): Promise<PreparationProjection>;
}

export class PreparationOrchestrator implements PreparationOrchestration {
  private readonly providers: { demo: PlannerProvider; ollama: PlannerProvider };
  constructor(
    private readonly evidence: PreparationEvidenceSource,
    private readonly intents: PreparationIntentSource,
    private readonly declaredTargets: PreparationIntegrationSource,
    modelConfiguration?: unknown,
    providerOverrides?: { demo?: PlannerProvider; ollama?: PlannerProvider }
  ) {
    this.providers = { demo: providerOverrides?.demo ?? new DemoPlannerProvider(), ollama: providerOverrides?.ollama ?? new OllamaPlannerProvider(modelConfiguration) };
  }
  private provider(mode: PreparationPlanningMode): PlannerProvider {
    return mode === 'demo' ? this.providers.demo : this.providers.ollama;
  }

  async propose(actor: SessionActor, intentId: string, body: unknown): Promise<PreparationProjection> {
    const input = PartitionRequestSchema.parse(body);
    const read = await this.intents.read(actor, intentId);
    if (read.version !== input.expectedVersion) throw new WorkflowError('stale_version');
    if (read.contentHash !== input.expectedHash) throw new WorkflowError('missing_evidence');
    if (read.state !== 'approved' || read.intent.state !== 'approved' || read.intent.intentId !== read.id) throw new WorkflowError('missing_evidence');
    const requestId = provenanceRequest(read.intent);
    if (requestId === null) throw new WorkflowError('missing_evidence');
    const planning = await this.evidence.planningInput(actor, requestId);
    const declared = await this.declaredTargets.declaredTargets(actor, read.intent);
    const partitionInput = {
      approvedIntent: read.intent,
      approvedIntentHash: input.expectedHash,
      planningEvidence: planning,
      approval: { intentId: read.id, version: read.version, contentHash: input.expectedHash, state: 'approved' as const }
    };
    try { validatePartitionInput(partitionInput); } catch {
      throw new WorkflowError('missing_evidence');
    }
    const result = await this.provider(input.mode).proposePartition(partitionInput);
    if (result.status !== 'proposal') throw new ProviderUnavailable(result.reason, result.mode);
    const providerView: ProviderProvenanceView = {
      mode: result.mode,
      inputHash: result.provenance.inputHash,
      proposalHash: result.provenance.proposalHash,
      repairAttempts: result.provenance.repairAttempts,
      modelVerification: result.provenance.modelVerification
    };
    const partition: ComposedPartition = composePartition({ partitionInput, providerProposal: result.proposal, declared });
    return {
      intentId: read.id,
      intentVersion: read.version,
      intentContentHash: read.contentHash,
      goal: read.intent.goal,
      provider: providerView,
      partition,
      assurance: 'bounded'
    };
  }
}
