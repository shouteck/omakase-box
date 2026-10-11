import { expect, it } from 'vitest';
import { hashPassword, verifyPassword, signSession, verifySessionSignature } from '../../packages/contracts/auth/crypto.js';

it('uses salted bounded scrypt hashes and constant-format verification', async () => {
  const password = 'synthetic-password-only';
  const first = await hashPassword(password); const second = await hashPassword(password);
  expect(first).not.toBe(second); expect(first).not.toContain(password);
  expect(await verifyPassword(password, first)).toBe(true);
  expect(await verifyPassword('wrong-synthetic-password', first)).toBe(false);
  expect(await verifyPassword(password, '$scrypt$999999999$8$1$bad$bad')).toBe(false);
  expect(await verifyPassword(password, 'synthetic-invalid-hash')).toBe(false);
});
it('binds signed sessions to service scope and never accepts tampering or a wrong key', () => {
  const token = 'a'.repeat(64); const key = Buffer.alloc(32, 1); const otherKey = Buffer.alloc(32, 2);
  const cookie = signSession(token, key, 'private');
  expect(verifySessionSignature(cookie, key, 'private')).toBe(token);
  expect(verifySessionSignature(cookie, key, 'external')).toBeNull();
  expect(verifySessionSignature(cookie, otherKey, 'private')).toBeNull();
  expect(verifySessionSignature(cookie + 'x', key, 'private')).toBeNull();
  expect(() => signSession(token, Buffer.alloc(4), 'private')).toThrow();
});
