import { z } from 'zod';
import type { FastifyReply } from 'fastify';
import { AuthDenied } from '../../../packages/contracts/auth/store.js';
import { HashSchema, IdSchema, RequirementSchema, TextSchema, TimestampSchema, VersionSchema } from '../../../packages/contracts/common.js';
import { EvidenceReferenceSchema } from '../../../packages/contracts/private/index.js';
import type { InternalIntent } from '../../../packages/contracts/private/index.js';
import type { ProviderMode, ProviderResult } from '../../../packages/planner/providers/contracts.js';
import { WorkflowError } from '../../../packages/contracts/workflow/index.js';

export const PlanningModeSchema = z.enum(['demo', 'ollama']);
export type PlanningMode = z.infer<typeof PlanningModeSchema>;
export const IntentCreationInputSchema = z.strictObject({ mode: PlanningModeSchema });
export const DecisionInputSchema = z.strictObject({ expectedVersion: VersionSchema, decisionId: IdSchema, answer: z.string().trim().min(1).max(4096) });
export const RevisionInputSchema = z.strictObject({ expectedVersion: VersionSchema, mode: PlanningModeSchema, goal: z.string().trim().min(1).max(4096).optional(), currentBehaviour: z.string().max(4096).optional(), desiredBehaviour: z.string().max(4096).optional(), constraints: z.array(z.string().max(4096)).max(16).optional(), exclusions: z.array(z.string().max(4096)).max(16).optional() });
export const ExactRevisionInputSchema = z.strictObject({ expectedVersion: VersionSchema, expectedHash: HashSchema });

export class IntentInvalid extends Error { constructor() { super('invalid_input'); } }
export class ProviderUnavailable extends Error {
  constructor(readonly reason: Extract<ProviderResult<never>, { status: 'failed' }>['reason'], readonly mode: ProviderMode) { super('provider_unavailable'); }
}

export interface IntentRead {
  id: string; version: number; state: string; contentHash: string; intent: InternalIntent;
  approval: { approvedBy: string; approvedHash: string; approvedAt: string } | null;
  supersededApproval: boolean;
}
export interface ProviderProvenanceView { mode: ProviderMode; inputHash: string; proposalHash: string; repairAttempts: 0 | 1; modelVerification: string }
export interface IntentCreation { id: string; version: number; state: string; contentHash: string; provider: ProviderProvenanceView }
export interface IntentMutation { id: string; version: number; state: string; contentHash: string; provider?: ProviderProvenanceView; approvalInvalidated?: boolean; approvedHash?: string }

const EvidenceViewSchema = z.strictObject({ evidenceId: z.uuid(), snapshotHash: HashSchema, location: TextSchema });
export const ReviewProjectionSchema = z.strictObject({
  id: z.uuid(), version: VersionSchema,
  state: z.enum(['draft', 'needs_decision', 'ready_for_approval', 'approved']),
  reviewedPayloadState: z.enum(['draft', 'needs_decision', 'ready_for_approval', 'approved']),
  contentHash: HashSchema,
  approval: z.strictObject({ approvedBy: z.uuid(), approvedHash: HashSchema, approvedAt: TimestampSchema }).nullable(),
  supersededApproval: z.boolean(),
  blockage: z.strictObject({ requiredUnresolved: z.number().int().nonnegative() }),
  goal: TextSchema,
  facts: z.array(z.strictObject({ statement: TextSchema, evidence: z.array(EvidenceViewSchema).max(64), assurance: z.enum(['tested', 'unverified']) })).max(256),
  evidence: z.array(EvidenceViewSchema).max(256),
  decisions: z.array(z.strictObject({ id: IdSchema, question: TextSchema, required: z.boolean(), answer: z.string().max(4096).nullable() })).max(128),
  assumptions: z.array(z.strictObject({ statement: TextSchema, assurance: z.literal('unverified') })).max(256),
  unknowns: z.array(TextSchema).max(128),
  acceptanceExamples: z.array(RequirementSchema).max(256),
  scope: z.strictObject({ included: z.array(TextSchema).max(128), excluded: z.array(TextSchema).max(128) }),
  provenance: z.strictObject({ requestId: z.uuid().nullable(), snapshotHash: HashSchema })
});
export type ReviewProjection = z.infer<typeof ReviewProjectionSchema>;

export function reviewProjection(read: IntentRead, requestId: string | null): ReviewProjection {
  return ReviewProjectionSchema.parse({
    id: read.id, version: read.version, state: read.state, reviewedPayloadState: read.intent.state,
    contentHash: read.contentHash, approval: read.approval, supersededApproval: read.supersededApproval,
    blockage: { requiredUnresolved: read.intent.decisions.filter(decision => decision.required && decision.answer === null).length },
    goal: read.intent.goal,
    facts: read.intent.facts.map(fact => ({ statement: fact.statement, evidence: fact.evidence, assurance: fact.assurance })),
    evidence: read.intent.evidence,
    decisions: read.intent.decisions,
    assumptions: read.intent.assumptions,
    unknowns: read.intent.unknowns,
    acceptanceExamples: read.intent.acceptanceExamples,
    scope: read.intent.scope,
    provenance: { requestId, snapshotHash: read.intent.snapshotHash }
  });
}

export function safeIntentError(reply: FastifyReply, error: unknown) {
  if (error instanceof z.ZodError || error instanceof IntentInvalid) return reply.code(400).send({ error: 'invalid_input' });
  if (error instanceof AuthDenied) return reply.code(404).send({ error: 'not_found' });
  if (error instanceof WorkflowError) {
    if (error.code === 'forbidden_role') return reply.code(403).send({ error: 'forbidden_role' });
    if (error.code === 'missing_evidence') return reply.code(422).send({ error: 'missing_evidence' });
    return reply.code(409).send({ error: error.code });
  }
  if (error instanceof ProviderUnavailable) return reply.code(503).send({ error: 'provider_unavailable', reason: error.reason, mode: error.mode });
  return reply.code(503).send({ error: 'resource_unavailable' });
}
