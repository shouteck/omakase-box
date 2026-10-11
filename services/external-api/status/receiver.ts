import { randomUUID } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { byteHash, canonicalize } from '../../../packages/contracts/hash.js';
import { FeedbackAckSchema, FeedbackDeliverySchema } from '../../../packages/contracts/public/feedback-bridge.js';
import { SignedRequestSchema, SubmissionProtocolRejected, signPayload, submissionPublicKey } from '../submissions/protocol.js';
import { verify } from 'node:crypto';
import { StatusRejected, SqlExternalStatusStore } from './store.js';

/**
 * Feedback ingest receiver (M7.2). Verifies the signed delivery packet from
 * the private bridge (delivery is private→external; the ack travels back
 * signed by the external receipt key). Only the strict public feedback
 * payload is stored — nothing else can be projected to a contributor.
 */

export class FeedbackIngestReceiver {
  constructor(
    private readonly store: SqlExternalStatusStore,
    private readonly importVerificationKey: KeyObject | string | Buffer,
    private readonly receiptSigningKey: KeyObject | string | Buffer,
  ) {}

  /** Verify + persist one signed delivery; respond with the signed hash-bound ack. */
  async receive(input: unknown, nowMs = Date.now()): Promise<unknown> {
    const packet = SignedRequestSchema.safeParse(input);
    if (!packet.success) throw new SubmissionProtocolRejected('invalid_request');
    const payload = packet.data.payload as Record<string, unknown>;
    const key = submissionPublicKey(this.importVerificationKey);
    if (!verify(null, Buffer.from(canonicalize(payload)), key, Buffer.from(packet.data.signature, 'base64'))) {
      throw new SubmissionProtocolRejected('invalid_request');
    }
    const delivery = FeedbackDeliverySchema.safeParse(payload);
    if (!delivery.success) throw new SubmissionProtocolRejected('invalid_request');
    if (nowMs < Date.parse(delivery.data.issuedAt) - 5000 || nowMs > Date.parse(delivery.data.expiresAt)) {
      throw new SubmissionProtocolRejected('request_expired');
    }
    const status = await this.store.ingest({
      publicId: delivery.data.feedback.publicId,
      submissionId: delivery.data.submissionId,
      payload: delivery.data.feedback,
    });
    const ack = FeedbackAckSchema.parse({
      schemaVersion: 1,
      audience: 'external-feedback-ack/v1',
      eventId: delivery.data.eventId,
      nonce: randomUUID(),
      publicId: delivery.data.feedback.publicId,
      payloadHash: byteHash(Buffer.from(canonicalize(delivery.data.feedback), 'utf8')),
      issuedAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + 60000).toISOString(),
    });
    return { status, ack: signPayload(ack, this.receiptSigningKey) };
  }
}

export { StatusRejected };
