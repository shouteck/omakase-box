import { z } from 'zod';
import { HashSchema, IdSchema, OpaqueIdSchema, TimestampSchema, VersionSchema } from '../common.js';

export const SubmissionEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(1), taskId: OpaqueIdSchema, lineageId: OpaqueIdSchema,
  taskVersion: VersionSchema, packageDigest: HashSchema, reservationId: OpaqueIdSchema,
  patch: z.string().min(1).refine(value => new TextEncoder().encode(value).length <= 1048576, 'Patch byte limit exceeded.').refine(value => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value), 'Patch must be valid UTF-8 text.'),
  patchHash: HashSchema, idempotencyKey: OpaqueIdSchema
});
export const AttemptPermitSchema = z.strictObject({
  schemaVersion: z.literal(1), permitId: OpaqueIdSchema,
  taskId: OpaqueIdSchema, lineageId: OpaqueIdSchema, taskVersion: VersionSchema,
  reservationId: OpaqueIdSchema, submissionId: OpaqueIdSchema,
  packageDigest: HashSchema, submissionHash: HashSchema,
  sequence: VersionSchema, issuedAt: TimestampSchema,
  signature: z.string().regex(/^[A-Za-z0-9+/]{86}==$/)
});
export const PublicFeedbackSchema = z.strictObject({
  schemaVersion: z.literal(1), publicId: OpaqueIdSchema,
  category: z.enum(['received', 'processing', 'owner_review', 'accepted', 'changes_required', 'package_defect', 'infrastructure_issue', 'expired']),
  releasePolicyVersion: VersionSchema,
  publicCheckDetails: z.array(z.strictObject({ checkId: IdSchema, jobKind: z.literal('public'), outcome: z.enum(['passed', 'failed', 'unverified']), messageCode: z.enum(['requirement_not_met', 'invalid_input', 'check_unavailable', 'passed']) })).max(512)
});
export type SubmissionEnvelope = z.infer<typeof SubmissionEnvelopeSchema>;
export type AttemptPermit = z.infer<typeof AttemptPermitSchema>;
export type PublicFeedback = z.infer<typeof PublicFeedbackSchema>;
