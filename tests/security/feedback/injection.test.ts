import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { renderPublicFeedback } from '../../../services/private-api/feedback/policy.js';
import { FeedbackDeliverer } from '../../../services/private-api/feedback/delivery.js';
import { FeedbackIngestReceiver } from '../../../services/external-api/status/receiver.js';
import { SqlExternalStatusStore } from '../../../services/external-api/status/store.js';
import { FeedbackAckSchema, FeedbackDeliverySchema } from '../../../packages/contracts/public/feedback-bridge.js';
import { signPayload } from '../../../services/external-api/submissions/protocol.js';
import { canonicalize, byteHash } from '../../../packages/contracts/hash.js';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const { privateKey: receiptPrivate, publicKey: receiptPublic } = generateKeyPairSync('ed25519');

const submissionId = randomUUID();
const publicId = randomUUID();
const payload = renderPublicFeedback({
  publicId, category: 'changes_required', releasePolicyVersion: 1,
  publicCheckOutcomes: [{ checkId: 'selection_api_check', outcome: 'failed' }],
});

const delivery = {
  schemaVersion: 1, audience: 'external-feedback-delivery/v1',
  eventId: randomUUID(), nonce: randomUUID(), submissionId,
  feedback: payload, issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(),
};

function signed(object: object, key = privateKey) {
  return signPayload(object, key);
}

describe('feedback bridge — signature and content adversaries', () => {
  const store = { ingest: vi.fn(async () => 'stored' as const) };
  const receiver = () => new FeedbackIngestReceiver(store as unknown as SqlExternalStatusStore, publicKey, receiptPrivate);

  it('forged, tampered, expired and cross-audience packets are all rejected', async () => {
    const now = Date.now();
    // Forged signature
    const { privateKey: foreign } = generateKeyPairSync('ed25519');
    await expect(receiver().receive(signed(delivery, foreign))).rejects.toMatchObject({ code: 'invalid_request' });
    // Tampered feedback: payload mutated after a valid signature was issued
    const tampered = { ...signed(delivery), payload: { ...delivery, feedback: { ...payload, category: 'accepted' } } };
    await expect(receiver().receive(tampered)).rejects.toMatchObject({ code: 'invalid_request' });
    // Expired delivery
    await expect(receiver().receive(signed({ ...delivery, issuedAt: new Date(now - 120000).toISOString(), expiresAt: new Date(now - 60000).toISOString() }))).rejects.toMatchObject({ code: 'request_expired' });
    // Cross-audience replay: a submission-export ack shape cannot be a feedback delivery
    const crossAudience = signed({ schemaVersion: 1, audience: 'external-submission-export-ack/v1', eventId: randomUUID(), nonce: randomUUID(), permitId: randomUUID(), payloadHash: 'a'.repeat(64), issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 60000).toISOString() });
    await expect(receiver().receive(crossAudience)).rejects.toMatchObject({ code: 'invalid_request' });
    expect(store.ingest).not.toHaveBeenCalled();
  });

  it('private-only fields can never ride inside the allowlisted payload', async () => {
    const poisoned = {
      ...delivery,
      feedback: {
        ...payload,
        canaryToken: 'PRIVATE-CANARY-7f3d',
        privateScore: 0.97,
        stackTrace: 'at secretInternal (/private/src/hidden.ts:1:1)',
        logDigest: 'f'.repeat(64),
      },
    };
    await expect(receiver().receive(signed(poisoned))).rejects.toMatchObject({ code: 'invalid_request' });
    expect(store.ingest).not.toHaveBeenCalled();
  });

  it('a valid delivery persists only the allowlisted payload and returns a hash-bound signed ack', async () => {
    const response = await receiver().receive(signed(delivery)) as { status: string; ack: { payload: unknown; signature: string } };
    expect(response.status).toBe('stored');
    expect(store.ingest).toHaveBeenCalledWith({ publicId, submissionId, payload });
    const ackPayload = response.ack.payload as Record<string, unknown>;
    const ack = FeedbackAckSchema.parse(ackPayload);
    expect(ack.payloadHash).toBe(byteHash(Buffer.from(canonicalize(payload), 'utf8')));
    expect(ack.eventId).toBe(delivery.eventId);
    expect(ack.audience).toBe('external-feedback-ack/v1');
  });
});

describe('delivery acknowledgements — only hash-bound signed acks mark delivery', () => {
  const event = { eventId: delivery.eventId, submissionId, payload };
  const makeDeliverer = (transport: { send(packet: unknown): Promise<unknown> }) => {
    const store = { pullNext: vi.fn(async () => event), acknowledge: vi.fn(async () => true) };
    return { store, deliverer: new FeedbackDeliverer(store, privateKey, receiptPublic, transport) };
  };
  const validAck = () => ({ status: 'stored', ack: signPayload(FeedbackAckSchema.parse({ schemaVersion: 1, audience: 'external-feedback-ack/v1', eventId: event.eventId, nonce: randomUUID(), publicId, payloadHash: byteHash(Buffer.from(canonicalize(payload), 'utf8')), issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString() }), receiptPrivate) });

  it('a signed, hash-bound ack marks the event delivered', async () => {
    const { store, deliverer } = makeDeliverer({ send: async () => validAck() });
    expect(await deliverer.deliverOnce()).toBe('delivered');
    expect(store.acknowledge).toHaveBeenCalledWith(event.eventId);
  });

  it('transport failure, unsigned acks, hash mismatches and foreign events leave the event undelivered', async () => {
    const { privateKey: foreignReceipt } = generateKeyPairSync('ed25519');
    const cases: unknown[] = [
      new Error('offline'),
      { status: 'stored' }, // no ack
      { status: 'stored', ack: signPayload({ wrong: 'shape' }, receiptPrivate) },
      { status: 'stored', ack: signPayload(FeedbackAckSchema.parse({ schemaVersion: 1, audience: 'external-feedback-ack/v1', eventId: event.eventId, nonce: randomUUID(), publicId, payloadHash: byteHash(Buffer.from(canonicalize(payload), 'utf8')), issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString() }), foreignReceipt) },
      { status: 'stored', ack: signPayload(FeedbackAckSchema.parse({ schemaVersion: 1, audience: 'external-feedback-ack/v1', eventId: event.eventId, nonce: randomUUID(), publicId, payloadHash: 'b'.repeat(64), issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString() }), receiptPrivate) },
      { status: 'stored', ack: signPayload(FeedbackAckSchema.parse({ schemaVersion: 1, audience: 'external-feedback-ack/v1', eventId: randomUUID(), nonce: randomUUID(), publicId, payloadHash: byteHash(Buffer.from(canonicalize(payload), 'utf8')), issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString() }), receiptPrivate) },
    ];
    for (const response of cases) {
      const { store, deliverer } = makeDeliverer({ send: async () => { if (response instanceof Error) throw response; return response; } });
      expect(await deliverer.deliverOnce()).toBe('retry');
      expect(store.acknowledge).not.toHaveBeenCalled();
    }
  });
});

describe('status read — corrupted rows degrade, never leak', () => {
  it('a malformed stored payload yields feedback null, not the raw bytes', async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ state: 'accepted', version: 3, reservation_id: randomUUID() }] })
        .mockResolvedValueOnce({ rows: [{ payload: { canaryToken: 'x', notASchema: true } }] }),
    };
    const store = new SqlExternalStatusStore(pool as never);
    const status = await store.status(submissionId, randomUUID());
    expect(status).toEqual({ state: 'accepted', version: 3, reservationId: expect.any(String), feedback: null });
  });
});
