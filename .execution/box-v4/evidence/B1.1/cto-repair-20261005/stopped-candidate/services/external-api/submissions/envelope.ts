import { z } from 'zod';
import { HashSchema, OpaqueIdSchema, TimestampSchema, VersionSchema } from '../../../packages/contracts/common.js';

export const SubmissionEnvelopeSchema = z.strictObject({
  taskId: OpaqueIdSchema,
  taskVersion: VersionSchema,
  packageHash: HashSchema,
  idempotencyKey: OpaqueIdSchema,
  patchBase64: z.string().min(4).max(1_500_000),
});
export type SubmissionEnvelope = z.infer<typeof SubmissionEnvelopeSchema>;

/**
 * Flat signed permit packet. The foundation guards require the stored
 * `external_submissions.permit` / `external_attempt_outbox.payload` object to
 * carry these fields at top level (`packageDigest` spelling is pinned by
 * `external_submission_integrity`), with the Ed25519 signature alongside.
 */
export const AttemptPermitPayloadSchema = z.strictObject({
  schemaVersion: z.literal(1),
  audience: z.literal('private-submission-import/v1'),
  permitId: OpaqueIdSchema,
  eventId: OpaqueIdSchema,
  nonce: OpaqueIdSchema,
  reservationId: OpaqueIdSchema,
  submissionId: OpaqueIdSchema,
  contributorId: OpaqueIdSchema,
  taskId: OpaqueIdSchema,
  taskVersion: VersionSchema,
  lineageId: OpaqueIdSchema,
  packageDigest: HashSchema,
  submissionHash: HashSchema,
  attemptSequence: VersionSchema,
  issuedAt: TimestampSchema,
  expiresAt: TimestampSchema,
});
export type AttemptPermitPayload = z.infer<typeof AttemptPermitPayloadSchema>;

export const SubmissionViewSchema = z.strictObject({
  id: OpaqueIdSchema,
  reservationId: OpaqueIdSchema,
  taskId: OpaqueIdSchema,
  taskVersion: VersionSchema,
  packageHash: HashSchema,
  submissionHash: HashSchema,
  state: z.enum(['received', 'public_evaluating', 'private_evaluating', 'owner_review', 'accepted', 'changes_required', 'package_defect', 'infrastructure_failure']),
  version: VersionSchema,
});
export type SubmissionView = z.infer<typeof SubmissionViewSchema>;
