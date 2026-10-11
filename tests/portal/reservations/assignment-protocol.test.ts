import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { expect, it } from 'vitest';
import { canonicalize } from '../../../packages/contracts/hash.js';
import { verifyAssignmentCommand, verifyRevocationCommand } from '../../../services/external-api/reservations/assignment-protocol.js';
import { contentHash } from '../../../packages/contracts/hash.js';

const keys = generateKeyPairSync('ed25519'), other = generateKeyPairSync('ed25519'), now = Date.now();
const contributor = randomUUID(), token = 'a'.repeat(64);
function payload() {
  return { schemaVersion: 1, audience: 'external-assignment/v1', eventId: randomUUID(), nonce: randomUUID(), assignmentId: randomUUID(), taskId: randomUUID(), taskVersion: 1, packageDigest: 'c'.repeat(64), executor: { kind: 'human', label: 'Synthetic selected contributor', contributorId: contributor }, invitation: { contributorId: contributor, tokenHash: contentHash(token), expiresAt: new Date(now + 3600000).toISOString() }, issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 300000).toISOString() };
}
function revocationPayload(base: ReturnType<typeof payload>) {
  return { schemaVersion: 1, audience: 'external-assignment-invitation-revocation/v1', eventId: randomUUID(), nonce: randomUUID(), assignmentId: base.assignmentId, taskId: base.taskId, taskVersion: base.taskVersion, packageDigest: base.packageDigest, contributorId: contributor, tokenHash: contentHash(token), issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 300000).toISOString() };
}
const signed = (value: unknown) => ({ payload: value, signature: sign(null, Buffer.from(canonicalize(value)), keys.privateKey).toString('base64') });

it('accepts exact Ed25519 commands using only the intended public key', () => {
  const value = payload();
  expect(verifyAssignmentCommand(signed(value), keys.publicKey, now)).toEqual(value);
  expect(verifyAssignmentCommand(signed(value), keys.publicKey.export({ format: 'pem', type: 'spki' }).toString(), now)).toEqual(value);
});

it('rejects a private key object or private PEM instead of deriving and silently accepting its public half', () => {
  const packet = signed(payload());
  expect(() => verifyAssignmentCommand(packet, keys.privateKey, now)).toThrow('invalid_command');
  expect(() => verifyAssignmentCommand(packet, keys.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(), now)).toThrow('invalid_command');
});

it('rejects the wrong key and any unsigned choice mutation', () => {
  const packet = signed(payload());
  expect(() => verifyAssignmentCommand(packet, other.publicKey, now)).toThrow('invalid_command');
  expect(() => verifyAssignmentCommand({ ...packet, payload: { ...packet.payload as object, packageDigest: 'f'.repeat(64) } }, keys.publicKey, now)).toThrow('invalid_command');
});

it.each(['ownerId', 'chosenBy', 'role', 'prompt', 'privateRevision', 'publicationReady'])('rejects the unexpected signed field %s', field => {
  expect(() => verifyAssignmentCommand(signed({ ...payload(), [field]: 'forged' }), keys.publicKey, now)).toThrow('invalid_command');
});

it('enforces the command audience, nonce separation and bounded freshness without swallowing expiry', () => {
  const value = payload();
  for (const changed of [{ ...value, audience: 'release/v1' }, { ...value, nonce: value.eventId }, { ...value, issuedAt: new Date(now + 5001).toISOString() }, { ...value, expiresAt: new Date(now + 300001).toISOString() }, { ...value, issuedAt: 'not-a-date' }]) {
    expect(() => verifyAssignmentCommand(signed(changed), keys.publicKey, now)).toThrow('invalid_command');
  }
  expect(() => verifyAssignmentCommand(signed(value), keys.publicKey, now + 300000)).toThrow('expired');
});

it('rejects a human choice without its invitation binding and any non-human invitation', () => {
  const value = payload();
  const { invitation: _omitted, executor: _executor, ...missing } = value;
  expect(() => verifyAssignmentCommand(signed({ ...missing, executor: value.executor }), keys.publicKey, now)).toThrow('invalid_command');
  const wrongContributor = { ...value, invitation: { ...value.invitation, contributorId: randomUUID() } };
  expect(() => verifyAssignmentCommand(signed(wrongContributor), keys.publicKey, now)).toThrow('invalid_command');
  const staleInvitation = { ...value, invitation: { ...value.invitation, expiresAt: new Date(now - 1000).toISOString() } };
  expect(() => verifyAssignmentCommand(signed(staleInvitation), keys.publicKey, now)).toThrow('invalid_command');
  const ai = { ...value, executor: { kind: 'ai', label: 'Synthetic ai executor' } };
  expect(() => verifyAssignmentCommand(signed(ai), keys.publicKey, now)).toThrow('invalid_command');
  const { invitation: _aiInvitation, ...aiClean } = ai;
  expect(verifyAssignmentCommand(signed(aiClean), keys.publicKey, now).executor.kind).toBe('ai');
});

it('verifies revocation commands under the same envelope rules and never accepts a choice audience', () => {
  const base = payload(), revocation = revocationPayload(base);
  expect(verifyRevocationCommand(signed(revocation), keys.publicKey, now)).toEqual(revocation);
  expect(() => verifyRevocationCommand(signed(revocation), other.publicKey, now)).toThrow('invalid_command');
  expect(() => verifyRevocationCommand(signed(base), keys.publicKey, now)).toThrow('invalid_command');
  expect(() => verifyAssignmentCommand(signed(revocation), keys.publicKey, now)).toThrow('invalid_command');
  const packet = signed(revocation);
  expect(() => verifyRevocationCommand({ ...packet, payload: { ...revocation, tokenHash: 'f'.repeat(64) } }, keys.publicKey, now)).toThrow('invalid_command');
});

it('errors expose only the approved code, never the rejected payload or crypto details', () => {
  let error: unknown;
  try { verifyAssignmentCommand({ payload: { prompt: 'SYNTHETIC_PRIVATE_CANARY' } }, keys.publicKey, now); } catch (value) { error = value; }
  expect(JSON.stringify(error)).toBe('{"code":"invalid_command"}');
});
