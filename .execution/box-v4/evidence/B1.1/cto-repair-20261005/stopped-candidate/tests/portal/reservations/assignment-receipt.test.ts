import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { signAssignmentReceipt, verifyAssignmentReceipt } from '../../../services/external-api/reservations/assignment-receipt.js';

const keys = generateKeyPairSync('ed25519'), other = generateKeyPairSync('ed25519'), now = Date.now();
const command = () => ({ schemaVersion: 1 as const, audience: 'external-assignment/v1' as const, eventId: randomUUID(), nonce: randomUUID(), assignmentId: randomUUID(), taskId: randomUUID(), taskVersion: 1, packageDigest: 'c'.repeat(64), executor: { kind: 'team' as const, label: 'Synthetic selected team' }, issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 300000).toISOString() });
const result = (value: ReturnType<typeof command>) => ({ assignmentId: value.assignmentId, taskId: value.taskId, taskVersion: value.taskVersion, status: 'recorded' as const, duplicate: false });

it('accepts only a signed receipt bound to the complete exact delivery command', () => {
  const value = command(), packet = signAssignmentReceipt(value, result(value), keys.privateKey, now);
  expect(verifyAssignmentReceipt(packet, keys.publicKey, value, now)).toMatchObject({ status: 'recorded', assignmentId: value.assignmentId, eventId: value.eventId });
  expect(JSON.stringify(packet)).not.toMatch(/owner_id|sessionHash|csrfHash|privateRevision/);
});

it.each(['eventId', 'nonce', 'assignmentId', 'taskId', 'packageDigest'])('cannot acknowledge a different %s', field => {
  const value = command(), packet = signAssignmentReceipt(value, result(value), keys.privateKey, now);
  const changed = { ...value, [field]: field === 'packageDigest' ? 'd'.repeat(64) : randomUUID() };
  expect(() => verifyAssignmentReceipt(packet, keys.publicKey, changed, now)).toThrow('invalid_receipt');
});

it('rejects unsigned/forged receipts, the wrong key, private verification keys and expired authority', () => {
  const value = command(), packet = signAssignmentReceipt(value, result(value), keys.privateKey, now);
  expect(() => verifyAssignmentReceipt(packet.payload, keys.publicKey, value, now)).toThrow('invalid_receipt');
  expect(() => verifyAssignmentReceipt(packet, other.publicKey, value, now)).toThrow('invalid_receipt');
  expect(() => verifyAssignmentReceipt(packet, keys.privateKey, value, now)).toThrow('invalid_receipt');
  expect(() => verifyAssignmentReceipt(packet, keys.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(), value, now)).toThrow('invalid_receipt');
  expect(() => verifyAssignmentReceipt(packet, keys.publicKey, value, now + 300000)).toThrow('expired');
});

it('does not sign a receipt for an exception, accepted verdict, wrong assignment or expired command', () => {
  const value = command();
  for (const changed of [{ ...result(value), status: 'accepted' }, { ...result(value), assignmentId: randomUUID() }, { ...result(value), taskVersion: 2 }]) {
    expect(() => signAssignmentReceipt(value, changed as never, keys.privateKey, now)).toThrow('invalid_receipt');
  }
  expect(() => signAssignmentReceipt(value, result(value), keys.privateKey, now + 300000)).toThrow('expired');
});

it('returns only a safe error code for rejected diagnostics or privileged fields', () => {
  const value = command(), packet = signAssignmentReceipt(value, result(value), keys.privateKey, now);
  let error: unknown;
  try { verifyAssignmentReceipt({ ...packet, payload: { ...packet.payload, privateLog: 'SYNTHETIC_PRIVATE_CANARY' } }, keys.publicKey, value, now); } catch (caught) { error = caught; }
  expect(JSON.stringify(error)).toBe('{"code":"invalid_receipt"}');
});
