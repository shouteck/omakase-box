import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, result) => error ? reject(error) : resolve(result)));
}
export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) throw new Error('Invalid password bounds.');
  const salt = randomBytes(16); const key = await derive(password, salt);
  return `$scrypt$32768$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (typeof password !== 'string' || password.length > 128 || typeof stored !== 'string') return false;
  const match = /^\$scrypt\$32768\$8\$1\$([A-Za-z0-9+/]{22}==)\$([A-Za-z0-9+/]{86}==)$/.exec(stored);
  if (!match) return false;
  const salt = Buffer.from(match[1]!, 'base64'); const expected = Buffer.from(match[2]!, 'base64');
  if (salt.length !== 16 || expected.length !== 64) return false;
  return timingSafeEqual(await derive(password, salt), expected);
}
export function tokenHash(token: string): string { return createHash('sha256').update(token, 'utf8').digest('hex'); }
export function newToken(): string { return randomBytes(32).toString('hex'); }
export function signSession(token: string, key: Buffer, scope: 'private' | 'external'): string {
  if (!/^[a-f0-9]{64}$/.test(token) || key.length < 32 || !['private', 'external'].includes(scope)) throw new Error('Invalid session configuration.');
  return token + '_' + createHmac('sha256', key).update(scope + ':' + token).digest('base64url');
}
export function verifySessionSignature(cookie: string, key: Buffer, scope: 'private' | 'external'): string | null {
  if (typeof cookie !== 'string' || key.length < 32 || !/^[a-f0-9]{64}_[A-Za-z0-9_-]{43}$/.test(cookie)) return null;
  const token = cookie.slice(0, 64); const expected = signSession(token, key, scope);
  return timingSafeEqual(Buffer.from(cookie), Buffer.from(expected)) ? token : null;
}
