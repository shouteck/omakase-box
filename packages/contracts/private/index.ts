import { z } from 'zod';
import { EvaluationOutcomeSchema, HashSchema, IdSchema, OpaqueIdSchema, RequirementSchema, TextSchema, TimestampSchema, VersionSchema } from '../common.js';
import { assertDistinctPaths, PortablePathSchema } from '../paths.js';

export const EvidenceReferenceSchema = z.strictObject({ evidenceId: OpaqueIdSchema, snapshotHash: HashSchema, location: TextSchema });
export const InternalIntentSchema = z.strictObject({
  schemaVersion: z.literal(1), intentId: OpaqueIdSchema, version: VersionSchema,
  goal: TextSchema, snapshotHash: HashSchema,
  state: z.enum(['draft', 'needs_decision', 'ready_for_approval', 'approved']),
  facts: z.array(z.strictObject({ statement: TextSchema, evidence: z.array(EvidenceReferenceSchema).max(64), assurance: z.enum(['tested', 'unverified']) })).max(256),
  evidence: z.array(EvidenceReferenceSchema).max(256),
  decisions: z.array(z.strictObject({ id: IdSchema, question: TextSchema, required: z.boolean(), answer: TextSchema.nullable() })).max(128),
  assumptions: z.array(z.strictObject({ statement: TextSchema, assurance: z.literal('unverified') })).max(256),
  unknowns: z.array(TextSchema).max(128),
  acceptanceExamples: z.array(RequirementSchema).max(256),
  scope: z.strictObject({ included: z.array(TextSchema).max(128), excluded: z.array(TextSchema).max(128) })
}).superRefine((intent, context) => {
  if (intent.facts.some(fact => fact.assurance !== 'unverified' && fact.evidence.length === 0)) context.addIssue({ code: 'custom', message: 'Factual claims require evidence or an unverified label.' });
  if (new Set(intent.decisions.map(decision => decision.id)).size !== intent.decisions.length) context.addIssue({ code: 'custom', message: 'Duplicate decision IDs.' });
  if (['ready_for_approval', 'approved'].includes(intent.state) && intent.decisions.some(decision => decision.required && decision.answer === null)) context.addIssue({ code: 'custom', message: 'Unresolved required decision blocks approval.' });
});
export const PrivateIntegrationPlanSchema = z.strictObject({
  schemaVersion: z.literal(1), planId: OpaqueIdSchema, taskId: OpaqueIdSchema, taskVersion: VersionSchema,
  privateRevision: HashSchema, approvedIntentHash: HashSchema, templateVersion: VersionSchema,
  workUnitMappings: z.array(z.strictObject({ unitId: IdSchema, publicPath: PortablePathSchema, privateDestinationPath: PortablePathSchema, retainedAdapterPath: PortablePathSchema })).min(1).max(512),
  interfaceMappings: z.array(z.strictObject({ interfaceId: IdSchema, privateAdapterPath: PortablePathSchema })).max(128),
  retainedWork: z.array(TextSchema).max(256),
  preservationRequirementIds: z.array(IdSchema).max(256),
  privateTraceability: z.array(z.strictObject({ publicRequirementId: IdSchema, intentRequirementId: IdSchema })).max(512)
}).superRefine((plan, context) => {
  try { assertDistinctPaths(plan.workUnitMappings.map(mapping => mapping.publicPath)); assertDistinctPaths(plan.workUnitMappings.map(mapping => mapping.privateDestinationPath)); } catch { context.addIssue({ code: 'custom', message: 'Integration paths conflict.' }); }
});
export const EvaluationAttemptSchema = z.strictObject({
  schemaVersion: z.literal(1), attemptId: OpaqueIdSchema, permitId: OpaqueIdSchema,
  taskId: OpaqueIdSchema, taskVersion: VersionSchema, submissionId: OpaqueIdSchema,
  submissionHash: HashSchema, packageHash: HashSchema, privateBaseRevision: HashSchema,
  runnerProfile: z.literal('dedicated-linux-kvm-fresh-vm'), imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/), harnessDigest: HashSchema,
  state: z.enum(['received', 'public_evaluating', 'private_evaluating', 'owner_review', 'accepted', 'changes_required', 'package_defect', 'infrastructure_failure']),
  createdAt: TimestampSchema
});
export const InternalEvaluationResultSchema = z.strictObject({
  schemaVersion: z.literal(1), evaluationId: OpaqueIdSchema, attemptId: OpaqueIdSchema,
  submissionHash: HashSchema, packageHash: HashSchema, privateBaseRevision: HashSchema,
  outcome: EvaluationOutcomeSchema,
  evidence: z.array(z.strictObject({ checkId: IdSchema, jobId: OpaqueIdSchema, jobKind: z.enum(['public', 'private']), artifactHash: HashSchema, harnessDigest: HashSchema, outcome: z.enum(['passed', 'failed', 'unverified']) })).min(1).max(1024),
  privateLogs: z.string().max(1048576),
  limitations: z.array(TextSchema).max(128)
}).superRefine((result, context) => {
  if (result.outcome === 'passed' && (result.evidence.some(item => item.outcome !== 'passed') || !['public', 'private'].every(kind => result.evidence.some(item => item.jobKind === kind)))) context.addIssue({ code: 'custom', message: 'Passed requires completed public and private evidence, without unknown or failed required checks.' });
});
export type InternalIntent = z.infer<typeof InternalIntentSchema>;
export type PrivateIntegrationPlan = z.infer<typeof PrivateIntegrationPlanSchema>;
export type EvaluationAttempt = z.infer<typeof EvaluationAttemptSchema>;
export type InternalEvaluationResult = z.infer<typeof InternalEvaluationResultSchema>;
