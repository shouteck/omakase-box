import { z } from 'zod';
import { HashSchema, RequirementSchema, TextSchema } from '../common.js';
import { EvidenceReferenceSchema, InternalIntentSchema } from './index.js';
import { CompositionShape, validateComposition } from '../public/composition.js';

const intent = InternalIntentSchema.shape;
export const IntentProposalSchema = z.strictObject({
  goal: intent.goal,
  facts: z.array(z.strictObject({ statement: TextSchema, evidence: z.array(EvidenceReferenceSchema).max(64), assurance: z.literal('unverified') })).max(256),
  evidence: intent.evidence,
  decisions: intent.decisions,
  assumptions: intent.assumptions,
  unknowns: intent.unknowns,
  acceptanceExamples: z.array(RequirementSchema).max(256),
  scope: intent.scope
}).superRefine((proposal, context) => {
  if (new Set(proposal.decisions.map(decision => decision.id)).size !== proposal.decisions.length) context.addIssue({ code: 'custom', message: 'Duplicate decision IDs.' });
});
const ProposedCompositionSchema = z.strictObject(CompositionShape).superRefine(validateComposition);
export const PartitionProposalSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('proposed'), composition: ProposedCompositionSchema, retainedPrivateWork: z.array(TextSchema).max(256) }),
  z.strictObject({ status: z.literal('not_supported'), reason: TextSchema, missingCapabilities: z.array(TextSchema).min(1).max(64), retainedPrivateWork: z.array(TextSchema).max(256) })
]);
export type IntentProposal = z.infer<typeof IntentProposalSchema>;
export type PartitionProposal = z.infer<typeof PartitionProposalSchema>;
export type EvidenceReference = z.infer<typeof EvidenceReferenceSchema>;

const PlanningRequestSchema = z.strictObject({ requestId: z.uuid(), snapshotId: z.uuid(), goal: TextSchema, currentBehaviour: z.string().max(4096), desiredBehaviour: z.string().max(4096), constraints: z.array(z.string().max(4096)).max(16), exclusions: z.array(z.string().max(4096)).max(16) });
const SourceSchema = z.strictObject({ reference: EvidenceReferenceSchema, sha256: HashSchema, text: z.string().max(65536), truncated: z.boolean() });
const AttachmentSchema = z.strictObject({ reference: EvidenceReferenceSchema, mediaType: z.enum(['text/plain','image/png','image/jpeg']), text: z.string().max(65536).nullable(), truncated: z.boolean() });
export const PrivatePlanningInputSchema = z.strictObject({ assurance: z.literal('bounded'), request: PlanningRequestSchema, snapshotHash: HashSchema, sources: z.array(SourceSchema).max(256), attachments: z.array(AttachmentSchema).max(16), imageUnderstanding: z.literal(false), textByteLimit: z.literal(65536) }).superRefine((input, context) => {
  const references = [...input.sources.map(source => source.reference), ...input.attachments.map(item => item.reference)];
  if (references.some(reference => reference.snapshotHash !== input.snapshotHash) || input.sources.some(source => source.reference.evidenceId !== input.request.snapshotId)) context.addIssue({ code: 'custom', message: 'Evidence binding mismatch.' });
  if (input.attachments.some(item => item.mediaType === 'text/plain' ? item.text === null : item.text !== null)) context.addIssue({ code: 'custom', message: 'Image content is not model text.' });
  if ([...input.sources.map(source => source.text), ...input.attachments.map(item => item.text ?? '')].reduce((sum, text) => sum + Buffer.byteLength(text), 0) > 65536) context.addIssue({ code: 'custom', message: 'Evidence text exceeds bounds.' });
});
export const PrivatePartitionInputSchema = z.strictObject({ approvedIntent: InternalIntentSchema, approvedIntentHash: HashSchema, planningEvidence: PrivatePlanningInputSchema, approval: z.strictObject({ intentId: z.uuid(), version: z.number().int().positive(), contentHash: HashSchema, state: z.literal('approved') }).optional() });
export const OllamaEnvelopeSchema = z.strictObject({ model: z.string().min(1).max(128), created_at: z.string().max(64), message: z.strictObject({ role: z.literal('assistant'), content: z.string().max(262144), thinking: z.string().max(262144).optional(), tool_calls: z.array(z.unknown()).max(16).optional() }), done: z.literal(true), done_reason: z.string().max(64).optional(), total_duration: z.number().int().nonnegative().optional(), load_duration: z.number().int().nonnegative().optional(), prompt_eval_count: z.number().int().nonnegative().optional(), prompt_eval_duration: z.number().int().nonnegative().optional(), eval_count: z.number().int().nonnegative().optional(), eval_duration: z.number().int().nonnegative().optional() });
export const OllamaConfigSchema = z.strictObject({ endpoint: z.string().max(256), model: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/), timeoutMs: z.number().int().min(20).max(30000).default(10000) });
export function planningOutputFormat(kind: 'intent' | 'partition') {
  return JSON.parse(JSON.stringify(z.toJSONSchema(kind === 'intent' ? IntentProposalSchema : PartitionProposalSchema))) as Record<string, unknown>;
}
