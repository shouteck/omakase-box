import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { canonicalize } from '../../../packages/contracts/hash.js';
import { AssignmentDeliveryStore } from '../../../services/private-api/assignments/delivery.js';

it('cancellation while acquiring a delivery lease never invokes the transport', async () => {
  const keys = generateKeyPairSync('ed25519'), controller = new AbortController(), now = Date.now();
  const payload = { schemaVersion: 1 as const, audience: 'external-assignment/v1' as const, eventId: randomUUID(), nonce: randomUUID(), assignmentId: randomUUID(), taskId: randomUUID(), taskVersion: 1, packageDigest: 'c'.repeat(64), executor: { kind: 'team' as const, label: 'Synthetic selected team' }, issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 300000).toISOString() };
  const claim = { outboxEventId: randomUUID(), token: 'a'.repeat(64), packet: { payload, signature: sign(null, Buffer.from(canonicalize(payload)), keys.privateKey).toString('base64') } };
  const store = new AssignmentDeliveryStore({} as never, keys.privateKey, keys.publicKey);
  vi.spyOn(store, 'claim').mockImplementation(async () => { controller.abort(); return claim; });
  const release = vi.spyOn(store, 'release').mockResolvedValue(true), send = vi.fn(async () => ({}));
  expect(await store.dispatchOne({ send }, controller.signal)).toMatchObject({ status: 'retryable', reason: 'delivery_unverified' });
  expect(send).not.toHaveBeenCalled();
  expect(release).toHaveBeenCalledExactlyOnceWith(claim);
});
