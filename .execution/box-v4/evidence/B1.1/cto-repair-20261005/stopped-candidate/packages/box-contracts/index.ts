import { z } from 'zod';
import { AssuranceSchema, HashSchema, IdSchema, OpaqueIdSchema, RequirementSchema, TextSchema, TimestampSchema, VersionSchema } from '../contracts/common.js';
import { PortablePathSchema } from '../contracts/paths.js';
import { PublicInterfaceSchema, WorkUnitSchema } from '../contracts/public/composition.js';
import { WorkflowError } from '../contracts/workflow/index.js';

export const OPEN_TRUSTED_PROFILE = 'open_trusted' as const;
export const TrustProfileSchema = z.literal(OPEN_TRUSTED_PROFILE);
export const GitCommitSchema = z.string().regex(/^[a-f0-9]{40}$/);
export const ImageDigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const ExecutorKindSchema = z.enum(['human', 'agent', 'hybrid']);
export const IntentProvenanceSchema = z.strictObject({ intentId: OpaqueIdSchema, intentVersion: VersionSchema, contentHash: HashSchema });
export const ScopedTokenRefSchema = z.strictObject({ tokenHash: HashSchema, boxId: OpaqueIdSchema, attemptId: OpaqueIdSchema.nullable(), capability: z.enum(['attempt.execute', 'attempt.evaluate']) });

const CONTAMINANT = /payment|reward|bounty|disclosure|kvm|payout|settlement/i;
export function assertNoRestrictedFields(value: unknown): void {
  const scan = (input: unknown): void => {
    if (Array.isArray(input)) { input.forEach(scan); return; }
    if (input && typeof input === 'object') {
      for (const [key, item] of Object.entries(input)) {
        if (CONTAMINANT.test(key)) throw new WorkflowError('missing_evidence');
        scan(item);
      }
    }
  };
  scan(value);
}

export const BehaviorArtifactSchema = z.strictObject({
  schemaVersion: z.literal(1),
  artifactId: OpaqueIdSchema,
  profile: TrustProfileSchema,
  intent: IntentProvenanceSchema,
  goal: TextSchema,
  acceptanceExamples: z.array(RequirementSchema).min(1).max(256),
  assumptions: z.array(TextSchema).max(256),
  unknowns: z.array(TextSchema).max(128),
  scope: z.strictObject({ included: z.array(TextSchema).max(128), excluded: z.array(TextSchema).max(128) })
});
export type BehaviorArtifact = z.infer<typeof BehaviorArtifactSchema>;

export const BoxVersionStateSchema = z.enum(['draft', 'open', 'closed', 'cancelled']);
export const BoxVersionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  boxId: OpaqueIdSchema,
  version: VersionSchema,
  profile: TrustProfileSchema,
  repoId: IdSchema,
  baseCommit: GitCommitSchema,
  intent: IntentProvenanceSchema,
  behaviorArtifact: z.strictObject({ artifactId: OpaqueIdSchema, contentHash: HashSchema }),
  contextManifest: z.strictObject({ reference: IdSchema, contentHash: HashSchema }),
  editableSurface: z.array(PortablePathSchema).min(1).max(512),
  environmentRef: z.strictObject({ reference: IdSchema, digest: ImageDigestSchema }),
  evaluatorRef: z.strictObject({ reference: IdSchema, version: VersionSchema, digest: HashSchema }),
  disciplines: z.array(IdSchema).min(1).max(32),
  workUnits: z.array(WorkUnitSchema).min(1).max(64),
  interfaces: z.array(PublicInterfaceSchema).max(128),
  requirements: z.array(RequirementSchema).min(1).max(256),
  endToEndObligations: z.array(RequirementSchema).max(256),
  attemptPolicy: z.strictObject({ maxAttempts: z.number().int().positive().max(64), allowedExecutorKinds: z.array(ExecutorKindSchema).min(1).max(3) }),
  executorPolicy: z.strictObject({ explicitChoiceRequired: z.literal(true), allowSimulatorLabelled: z.boolean() }),
  mergeTarget: z.strictObject({ reference: IdSchema, branch: IdSchema, expectedCommit: GitCommitSchema }),
  artifactHashes: z.record(IdSchema, HashSchema)
});
export type BoxVersion = z.infer<typeof BoxVersionSchema>;

export const AttemptStateSchema = z.enum(['open', 'submitted', 'cancelled', 'closed']);
export const AttemptSchema = z.strictObject({
  schemaVersion: z.literal(1),
  attemptId: OpaqueIdSchema,
  boxId: OpaqueIdSchema,
  boxVersion: VersionSchema,
  boxVersionHash: HashSchema,
  executor: z.strictObject({ kind: ExecutorKindSchema, actorId: z.string().min(1).max(128), token: ScopedTokenRefSchema.nullable() }),
  baseCommit: GitCommitSchema,
  worktreeRef: z.string().min(1).max(256).nullable(),
  patchHash: HashSchema.nullable(),
  environmentDigest: ImageDigestSchema,
  evaluatorDigest: HashSchema,
  state: AttemptStateSchema,
  createdAt: TimestampSchema
});
export type Attempt = z.infer<typeof AttemptSchema>;

export const OpenEvaluationOutcomeSchema = z.enum(['passed', 'failed', 'unavailable', 'cancelled', 'timed_out', 'infrastructure_failure']);
export const EvaluationReceiptSchema = z.strictObject({
  schemaVersion: z.literal(1),
  receiptId: OpaqueIdSchema,
  attemptId: OpaqueIdSchema,
  boxVersionHash: HashSchema,
  environmentDigest: ImageDigestSchema,
  evaluatorDigest: HashSchema,
  outcome: OpenEvaluationOutcomeSchema,
  summary: TextSchema,
  outputHash: HashSchema,
  durationMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  assurance: AssuranceSchema,
  recordedBy: z.string().min(1).max(128),
  createdAt: TimestampSchema
});
export type EvaluationReceipt = z.infer<typeof EvaluationReceiptSchema>;

export const AssignmentSchema = z.strictObject({
  schemaVersion: z.literal(1),
  assignmentId: OpaqueIdSchema,
  boxId: OpaqueIdSchema,
  boxVersion: VersionSchema,
  boxVersionHash: HashSchema,
  executor: z.strictObject({ kind: ExecutorKindSchema, actorId: z.string().min(1).max(128) }),
  capability: z.enum(['attempt.execute', 'attempt.evaluate']),
  assignedBy: OpaqueIdSchema,
  createdAt: TimestampSchema
});
export type Assignment = z.infer<typeof AssignmentSchema>;

export const ReviewVerdictSchema = z.enum(['approved', 'changes_required', 'box_defect', 'infrastructure_failure']);
export const ReviewDecisionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  reviewId: OpaqueIdSchema,
  boxId: OpaqueIdSchema,
  attemptId: OpaqueIdSchema,
  boxVersionHash: HashSchema,
  candidateHash: HashSchema,
  verdict: ReviewVerdictSchema,
  reviewerId: OpaqueIdSchema,
  rationale: TextSchema,
  decidedAt: TimestampSchema
});
export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;

export const BehaviorApprovalSchema = z.strictObject({
  schemaVersion: z.literal(1),
  approvalId: OpaqueIdSchema,
  boxId: OpaqueIdSchema,
  version: VersionSchema,
  artifactHash: HashSchema,
  approvedBy: OpaqueIdSchema,
  approvedAt: TimestampSchema
});
export type BehaviorApproval = z.infer<typeof BehaviorApprovalSchema>;

export const MergeApprovalSchema = z.strictObject({
  schemaVersion: z.literal(1),
  approvalId: OpaqueIdSchema,
  boxId: OpaqueIdSchema,
  attemptId: OpaqueIdSchema,
  reviewId: OpaqueIdSchema,
  targetRef: IdSchema,
  baseCommit: GitCommitSchema,
  candidateHash: HashSchema,
  approvedBy: OpaqueIdSchema,
  approvedAt: TimestampSchema
});
export type MergeApproval = z.infer<typeof MergeApprovalSchema>;

export const MergeRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  mergeId: OpaqueIdSchema,
  approvalId: OpaqueIdSchema,
  boxId: OpaqueIdSchema,
  attemptId: OpaqueIdSchema,
  sourceCandidateHash: HashSchema,
  targetRef: IdSchema,
  resultCommit: GitCommitSchema.nullable(),
  state: z.enum(['applied', 'rejected']),
  mergeOwnerId: OpaqueIdSchema,
  createdAt: TimestampSchema
});
export type MergeRecord = z.infer<typeof MergeRecordSchema>;

export const BoxOperationSchema = z.enum(['create', 'revise', 'approve-behavior', 'assign', 'open-attempt', 'submit-attempt', 'record-evaluation', 'review', 'approve-merge', 'apply-merge']);
export type BoxOperation = z.infer<typeof BoxOperationSchema>;

const versionTransitions: Record<string, readonly string[]> = { draft: ['open', 'cancelled'], open: ['closed', 'cancelled'] };
const attemptTransitions: Record<string, readonly string[]> = { open: ['submitted', 'cancelled'], submitted: ['closed', 'cancelled'] };
export function assertBoxTransition(kind: 'version' | 'attempt', from: string, to: string): void {
  const table = kind === 'version' ? versionTransitions : attemptTransitions;
  if (!table[from]?.includes(to)) throw new WorkflowError('invalid_transition');
}
export { WorkflowError };
