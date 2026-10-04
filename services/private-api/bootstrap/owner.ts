import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const BootstrapInputSchema = z.strictObject({ token: z.string().min(32).max(256), username: z.string().regex(/^[a-zA-Z0-9_.-]{3,64}$/), password: z.string().min(12).max(128) });
export interface OwnerBootstrapTransaction {
  consumeUnusedBootstrap(expectedTokenDigest: string): Promise<boolean>;
  insertOwner(account: { id: string; username: string; passwordHash: string; role: 'owner' }): Promise<void>;
}
export interface OwnerBootstrapStore {
  transaction<T>(operation: (transaction: OwnerBootstrapTransaction) => Promise<T>): Promise<T>;
}
export async function bootstrapOwner(input: unknown, configuredTokenDigest: string, store: OwnerBootstrapStore) {
  const parsed = BootstrapInputSchema.safeParse(input);
  if (!parsed.success || !/^[a-f0-9]{64}$/.test(configuredTokenDigest)) return { status: 'invalid', assurance: 'unverified' } as const;
  const { token, username, password } = parsed.data;
  const digest = createHash('sha256').update(token).digest('hex');
  if (!timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(configuredTokenDigest, 'hex'))) return { status: 'denied', assurance: 'tested' } as const;
  const salt = randomBytes(16);
  const key = await new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, result) => error ? reject(error) : resolve(result)));
  const passwordHash = `$scrypt$32768$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
  return store.transaction(async transaction => {
    if (!await transaction.consumeUnusedBootstrap(digest)) return { status: 'denied', assurance: 'tested' } as const;
    const id = randomUUID();
    await transaction.insertOwner({ id, username, passwordHash, role: 'owner' });
    return { status: 'created', accountId: id, assurance: 'tested' } as const;
  });
}
