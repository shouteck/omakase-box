import { z } from 'zod';
import { HashSchema, OpaqueIdSchema, TimestampSchema } from '../common.js';
import { PublicFeedbackSchema } from './submission.js';

/**
 * Feedback bridge envelopes (M7.2), shared between the private exporter and
 * the external ingest receiver. The private side pushes each outbox payload
 * as a signed delivery packet; the external side answers with a signed ack
 * whose payloadHash must equal the exported payload hash — the only delivery
 * proof the private side accepts. Audiences are distinct from the
 * submission-export protocol, so packets cannot be replayed across bridges.
 */

export const FeedbackDeliverySchema = z.strictObject({
  schemaVersion: z.literal(1),
  audience: z.literal('external-feedback-delivery/v1'),
  eventId: OpaqueIdSchema,
  nonce: OpaqueIdSchema,
  submissionId: OpaqueIdSchema,
  feedback: PublicFeedbackSchema,
  issuedAt: TimestampSchema,
  expiresAt: TimestampSchema,
});
export type FeedbackDelivery = z.infer<typeof FeedbackDeliverySchema>;

export const FeedbackAckSchema = z.strictObject({
  schemaVersion: z.literal(1),
  audience: z.literal('external-feedback-ack/v1'),
  eventId: OpaqueIdSchema,
  nonce: OpaqueIdSchema,
  publicId: OpaqueIdSchema,
  payloadHash: HashSchema,
  issuedAt: TimestampSchema,
  expiresAt: TimestampSchema,
});
export type FeedbackAck = z.infer<typeof FeedbackAckSchema>;
