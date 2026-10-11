import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { SessionActor } from '../../../packages/contracts/auth/store.js';
import { InternalIntentSchema } from '../../../packages/contracts/private/index.js';
import type { InternalIntent } from '../../../packages/contracts/private/index.js';
import type { IntentProposal } from '../../../packages/contracts/private/planning.js';
import { proposalContext, validateIntentProposal } from '../../../packages/planner/providers/contracts.js';
import type { PlannerProvider, PrivatePlanningInput, ProviderResult } from '../../../packages/planner/providers/contracts.js';
import { DemoPlannerProvider } from '../../../packages/planner/providers/demo.js';
import { OllamaPlannerProvider } from '../../../packages/planner/providers/ollama.js';
import { PrivateIntentStore } from '../db/intent-store.js';
import type { Pool } from 'pg';
import type { PrivateIntakeStore } from '../requests/store.js';
import { IntentCreationInputSchema, DecisionInputSchema, ExactRevisionInputSchema, RevisionInputSchema, IntentInvalid, ProviderUnavailable, reviewProjection } from './types.js';
import type { IntentCreation, IntentMutation, PlanningMode, ProviderProvenanceView, ReviewProjection } from './types.js';
import { WorkflowError } from '../../../packages/contracts/workflow/index.js';

export interface IntentRead {
  id: string; version: number; state: string; contentHash: string; intent: InternalIntent;
  approval: { approvedBy: string; approvedHash: string; approvedAt: string } | null;
  supersededApproval: boolean;
}
export interface IntentPersistence {
  create(actor: SessionActor | string, input: unknown, binding?: { requestId: string }): Promise<{ version: number; contentHash: string }>;
  revise(actor: SessionActor | string, input: unknown, expectedVersion: number): Promise<{ version: number; contentHash: string }>;
  transition(actor: SessionActor | string, id: string, expectedVersion: number, to: 'needs_decision' | 'ready_for_approval' | 'approved', expectedHash?: string): Promise<{ version: number; contentHash: string; state: string }>;
  read(actor: SessionActor, intentId: string): Promise<IntentRead>;
  readForRequest(actor: SessionActor, requestId: string, provenance: string): Promise<IntentRead>;
}
export interface IntentPlanningSource { planningInput(actor: SessionActor, requestId: string): Promise<PrivatePlanningInput> }
export interface IntentOrchestration {
  createDraft(actor: SessionActor, requestId: string, body: unknown): Promise<IntentCreation>;
  currentForRequest(actor: SessionActor, requestId: string): Promise<ReviewProjection>;
  review(actor: SessionActor, intentId: string): Promise<ReviewProjection>;
  resolveDecision(actor: SessionActor, intentId: string, body: unknown): Promise<IntentMutation>;
  revise(actor: SessionActor, intentId: string, body: unknown): Promise<IntentMutation>;
  ready(actor: SessionActor, intentId: string, body: unknown): Promise<IntentMutation>;
  approve(actor: SessionActor, intentId: string, body: unknown): Promise<IntentMutation>;
}

const RequestIdSchema = z.uuid();
export const PROVENANCE_PREFIX = 'Private provenance: planning request ';
export const PROVENANCE_SUFFIX = ' supplied the captured snapshot and evidence for this intent.';
export function provenanceLine(requestId: string): string { return `${PROVENANCE_PREFIX}${requestId}${PROVENANCE_SUFFIX}`; }
export function provenanceRequest(intent: InternalIntent): string | null {
  for (const line of intent.scope.included) {
    if (!line.startsWith(PROVENANCE_PREFIX) || !line.endsWith(PROVENANCE_SUFFIX)) continue;
    const requestId = line.slice(PROVENANCE_PREFIX.length, line.length - PROVENANCE_SUFFIX.length);
    if (RequestIdSchema.safeParse(requestId).success) return requestId;
  }
  return null;
}

function providerView(result: Extract<ProviderResult<IntentProposal>, { status: 'proposal' }>): ProviderProvenanceView {
  return { mode: result.mode, inputHash: result.provenance.inputHash, proposalHash: result.provenance.proposalHash, repairAttempts: result.provenance.repairAttempts, modelVerification: result.provenance.modelVerification };
}
function validated(result: ProviderResult<IntentProposal>, planning: PrivatePlanningInput): { proposal: IntentProposal; view: ProviderProvenanceView } {
  if (result.status !== 'proposal') throw new ProviderUnavailable(result.reason, result.mode);
  let proposal: IntentProposal;
  try { proposal = validateIntentProposal(result.proposal, proposalContext(planning)); }
  catch { throw new ProviderUnavailable('invalid_response', result.mode); }
  return { proposal, view: providerView(result) };
}
function carriedAnswers(intent: InternalIntent): Map<string, string> {
  return new Map(intent.decisions.filter(decision => decision.answer !== null).map(decision => [decision.id, decision.answer as string]));
}
function assemble(proposal: IntentProposal, planning: PrivatePlanningInput, requestId: string, intentId: string, version: number, resolved: ReadonlyMap<string, string>): InternalIntent {
  return InternalIntentSchema.parse({
    schemaVersion: 1, intentId, version, state: 'draft',
    goal: proposal.goal, snapshotHash: planning.snapshotHash,
    facts: proposal.facts.map(fact => ({ statement: fact.statement, evidence: [...fact.evidence], assurance: fact.assurance })),
    evidence: [...proposal.evidence],
    decisions: proposal.decisions.map(decision => ({ ...decision, answer: resolved.get(decision.id) ?? null })),
    assumptions: proposal.assumptions.map(item => ({ statement: item.statement, assurance: item.assurance })),
    unknowns: [...proposal.unknowns],
    acceptanceExamples: proposal.acceptanceExamples.map(example => ({ ...example, inputs: [...example.inputs], outputs: [...example.outputs], states: [...example.states], invalidCases: [...example.invalidCases], exclusions: [...example.exclusions], examples: example.examples.map(item => ({ ...item })) })),
    scope: { included: [provenanceLine(requestId), ...proposal.scope.included], excluded: [...proposal.scope.excluded] }
  });
}

export class IntentOrchestrator implements IntentOrchestration {
  private readonly providers: { demo: PlannerProvider; ollama: PlannerProvider };
  constructor(private readonly intents: IntentPersistence, private readonly intake: IntentPlanningSource, modelConfiguration?: unknown, providerOverrides?: { demo?: PlannerProvider; ollama?: PlannerProvider }) {
    this.providers = { demo: providerOverrides?.demo ?? new DemoPlannerProvider(), ollama: providerOverrides?.ollama ?? new OllamaPlannerProvider(modelConfiguration) };
  }
  private provider(mode: PlanningMode): PlannerProvider {
    return mode === 'demo' ? this.providers.demo : this.providers.ollama;
  }
  async createDraft(actor: SessionActor, requestId: string, body: unknown): Promise<IntentCreation> {
    const parsed = RequestIdSchema.safeParse(requestId);
    if (!parsed.success) throw new IntentInvalid();
    const { mode } = IntentCreationInputSchema.parse(body);
    const planning = await this.intake.planningInput(actor, parsed.data);
    const result = await this.provider(mode).proposeIntent(planning);
    const { proposal, view } = validated(result, planning);
    const intent = assemble(proposal, planning, parsed.data, randomUUID(), 1, new Map());
    const created = await this.intents.create(actor, intent, { requestId: parsed.data });
    return { id: intent.intentId, version: created.version, state: intent.state, contentHash: created.contentHash, provider: view };
  }
  async review(actor: SessionActor, intentId: string): Promise<ReviewProjection> {
    const parsed = RequestIdSchema.safeParse(intentId);
    if (!parsed.success) throw new IntentInvalid();
    const read = await this.intents.read(actor, parsed.data);
    return reviewProjection(read, provenanceRequest(read.intent));
  }
  async currentForRequest(actor: SessionActor, requestId: string): Promise<ReviewProjection> {
    const parsed = RequestIdSchema.safeParse(requestId);
    if (!parsed.success) throw new IntentInvalid();
    const read = await this.intents.readForRequest(actor, parsed.data, provenanceLine(parsed.data));
    return reviewProjection(read, parsed.data);
  }
  async resolveDecision(actor: SessionActor, intentId: string, body: unknown): Promise<IntentMutation> {
    const parsed = RequestIdSchema.safeParse(intentId);
    if (!parsed.success) throw new IntentInvalid();
    const input = DecisionInputSchema.parse(body);
    const current = await this.intents.read(actor, parsed.data);
    if (current.version !== input.expectedVersion) throw new WorkflowError('stale_version');
    if (!current.intent.decisions.some(decision => decision.id === input.decisionId)) throw new WorkflowError('missing_evidence');
    const next: InternalIntent = { ...current.intent, version: current.version + 1, state: 'draft', decisions: current.intent.decisions.map(decision => decision.id === input.decisionId ? { ...decision, answer: input.answer } : decision) };
    const revised = await this.intents.revise(actor, next, current.version);
    return { id: next.intentId, version: revised.version, state: next.state, contentHash: revised.contentHash, ...(current.state === 'approved' ? { approvalInvalidated: true } : {}) };
  }
  async revise(actor: SessionActor, intentId: string, body: unknown): Promise<IntentMutation> {
    const parsed = RequestIdSchema.safeParse(intentId);
    if (!parsed.success) throw new IntentInvalid();
    const input = RevisionInputSchema.parse(body);
    const current = await this.intents.read(actor, parsed.data);
    if (current.version !== input.expectedVersion) throw new WorkflowError('stale_version');
    const requestId = provenanceRequest(current.intent);
    if (!requestId) throw new WorkflowError('missing_evidence');
    const planning = await this.intake.planningInput(actor, requestId);
    const edited = { ...planning, request: { ...planning.request,
      ...(input.goal !== undefined ? { goal: input.goal } : {}),
      ...(input.currentBehaviour !== undefined ? { currentBehaviour: input.currentBehaviour } : {}),
      ...(input.desiredBehaviour !== undefined ? { desiredBehaviour: input.desiredBehaviour } : {}),
      ...(input.constraints !== undefined ? { constraints: [...input.constraints] } : {}),
      ...(input.exclusions !== undefined ? { exclusions: [...input.exclusions] } : {}) } };
    const result = await this.provider(input.mode).proposeIntent(edited);
    const { proposal, view } = validated(result, edited);
    const next = assemble(proposal, edited, requestId, current.id, current.version + 1, carriedAnswers(current.intent));
    const revised = await this.intents.revise(actor, next, current.version);
    return { id: current.id, version: revised.version, state: next.state, contentHash: revised.contentHash, provider: view, ...(current.state === 'approved' ? { approvalInvalidated: true } : {}) };
  }
  async ready(actor: SessionActor, intentId: string, body: unknown): Promise<IntentMutation> {
    const parsed = RequestIdSchema.safeParse(intentId);
    if (!parsed.success) throw new IntentInvalid();
    const input = ExactRevisionInputSchema.parse(body);
    const current = await this.intents.read(actor, parsed.data);
    if (current.version !== input.expectedVersion) throw new WorkflowError('stale_version');
    if (current.contentHash !== input.expectedHash) throw new WorkflowError('missing_evidence');
    const outcome = await this.intents.transition(actor, parsed.data, input.expectedVersion, 'ready_for_approval');
    return { id: parsed.data, version: outcome.version, state: outcome.state, contentHash: outcome.contentHash };
  }
  async approve(actor: SessionActor, intentId: string, body: unknown): Promise<IntentMutation> {
    const parsed = RequestIdSchema.safeParse(intentId);
    if (!parsed.success) throw new IntentInvalid();
    const input = ExactRevisionInputSchema.parse(body);
    const outcome = await this.intents.transition(actor, parsed.data, input.expectedVersion, 'approved', input.expectedHash);
    return { id: parsed.data, version: outcome.version, state: outcome.state, contentHash: outcome.contentHash, approvedHash: outcome.contentHash };
  }
}

export function intentOrchestrationForIntake(intake: PrivateIntakeStore, modelConfiguration?: unknown): IntentOrchestration | null {
  const database = (intake as unknown as { database?: unknown }).database;
  if (!database || typeof (database as { connect?: unknown }).connect !== 'function') return null;
  return new IntentOrchestrator(new PrivateIntentStore(database as Pool), intake, modelConfiguration);
}
