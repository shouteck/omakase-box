import { randomUUID, verify, type KeyObject } from 'node:crypto';
import { z } from 'zod';
import { byteHash, canonicalize } from '../../../packages/contracts/hash.js';
import { signPayload, submissionPublicKey } from '../../external-api/submissions/protocol.js';
import { FeedbackAckSchema, FeedbackDeliverySchema } from '../../../packages/contracts/public/feedback-bridge.js';
import type { PrivateFeedbackStore } from './store.js';

/**
 * Feedback delivery loop (M7.2). The private side pushes the oldest
 * undelivered outbox event to the external ingest endpoint as a signed
 * delivery packet. `delivered_at` is written only after a signed ack whose
 * payloadHash equals the exported payload hash — a transport failure,
 * malformed response or hash mismatch leaves the event undelivered so a
 * later poll retries. Duplicate delivery on the external side is
 * idempotent at the publicId key.
 */

export class DeliveryFailed extends Error {
  constructor(readonly code: 'transport_unavailable' | 'invalid_response') {
    super(code);
    this.name = 'DeliveryFailed';
  }
}

export interface DeliveryTransport {
  send(packet: unknown): Promise<unknown>;
}

const AckResponseSchema = z.strictObject({
  status: z.enum(['stored', 'duplicate']),
  ack: z.looseObject({ payload: z.unknown(), signature: z.string().min(1).max(4096) }),
});

export class FeedbackDeliverer {
  constructor(
    private readonly store: Pick<PrivateFeedbackStore, 'pullNext' | 'acknowledge'>,
    private readonly signingKey: KeyObject | string | Buffer,
    private readonly receiptVerificationKey: KeyObject | string | Buffer,
    private readonly transport: DeliveryTransport,
    private readonly lifetimeMs = 60000,
  ) {}

  /** Deliver at most one event per call; returns 'delivered', 'duplicate', 'retry' or 'empty'. */
  async deliverOnce(nowMs = Date.now()): Promise<'delivered' | 'duplicate' | 'retry' | 'empty'> {
    const event = await this.store.pullNext();
    if (!event) return 'empty';
    const issued = new Date(nowMs);
    const delivery = FeedbackDeliverySchema.parse({
      schemaVersion: 1,
      audience: 'external-feedback-delivery/v1',
      eventId: event.eventId,
      nonce: randomUUID(),
      submissionId: event.submissionId,
      feedback: event.payload,
      issuedAt: issued.toISOString(),
      expiresAt: new Date(nowMs + this.lifetimeMs).toISOString(),
    });
    const packet = signPayload(delivery, this.signingKey);
    let response: unknown;
    try { response = await this.transport.send(packet); }
    catch { return 'retry'; }
    const parsed = AckResponseSchema.safeParse(response);
    if (!parsed.success) return 'retry';
    const ackPayload = parsed.data.ack.payload;
    const key = submissionPublicKey(this.receiptVerificationKey);
    const signed = typeof ackPayload === 'object' && ackPayload !== null && typeof parsed.data.ack.signature === 'string'
      && verify(null, Buffer.from(canonicalize(ackPayload)), key, Buffer.from(parsed.data.ack.signature, 'base64'));
    if (!signed) return 'retry';
    const ack = FeedbackAckSchema.safeParse(ackPayload);
    if (!ack.success) return 'retry';
    if (ack.data.eventId !== event.eventId || ack.data.publicId !== event.payload.publicId) return 'retry';
    if (Date.parse(ack.data.expiresAt) < nowMs || Date.parse(ack.data.issuedAt) - 5000 > nowMs) return 'retry';
    const expectedHash = byteHash(Buffer.from(canonicalize(event.payload), 'utf8'));
    if (ack.data.payloadHash !== expectedHash) return 'retry';
    const marked = await this.store.acknowledge(event.eventId);
    return marked ? 'delivered' : 'duplicate';
  }
}

