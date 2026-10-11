import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, resolve, sep } from 'node:path';
import { z } from 'zod';

const secretFile = z.string().regex(/^\/run\/secrets\/[a-z_]+$/);
export const PrivateEnvironmentSchema = z.strictObject({
  PRIVATE_DATABASE_HOST: z.literal('db-private'),
  PRIVATE_DATABASE_NAME: z.literal('private_task'),
  PRIVATE_DATABASE_USER: z.literal('private_service'),
  PRIVATE_DATABASE_PASSWORD_FILE: secretFile,
  PRIVATE_STORAGE_ROOT: z.literal('/data/private'),
  PRIVATE_SESSION_KEY_FILE: secretFile,
  PRIVATE_OWNER_BOOTSTRAP_FILE: secretFile,
  PRIVATE_RELEASE_KEY_FILE: secretFile,
  PRIVATE_BRIDGE_KEY_FILE: secretFile,
  PRIVATE_ASSIGNMENT_KEY_FILE: secretFile,
  PRIVATE_RECEIPT_PUBLIC_KEY_FILE: secretFile,
  PRIVATE_IMPORT_KEY_FILE: secretFile,
  PRIVATE_PERMIT_PUBLIC_KEY_FILE: secretFile
});
// Host test mode (SYNTHETIC_HOST_TEST === 'true') runs the real bootstrap on the host against
// the disposable Postgres the test harness provisions. The container schema above is unchanged;
// this mode only loosens where secrets/storage/database live, never what they may point at:
// database hosts stay loopback-only and every file path must sit under the OS temp directory
// where the harness mints per-run 0o600 files. The compose file never sets the gate, and the
// wide-listen flag is refused so the mode cannot be activated accidentally outside loopback.
const tempRoot = resolve(tmpdir()).toLowerCase() + sep;
const hostTestFile = z.string().refine(path => isAbsolute(path) && resolve(path).toLowerCase().startsWith(tempRoot), { message: 'host test files must live under the OS temp directory' });
const hostTestDatabaseHost = z.string().refine(host => /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) || host === 'localhost' || host === '::1' || host === '[::1]', { message: 'host test databases must be loopback' });
const PrivateHostTestEnvironmentSchema = z.strictObject(Object.fromEntries(Object.entries(PrivateEnvironmentSchema.shape).map(([key, field]) => [key, key.endsWith('_FILE') || key === 'PRIVATE_STORAGE_ROOT' ? hostTestFile : key === 'PRIVATE_DATABASE_HOST' ? hostTestDatabaseHost : field])));
export function parsePrivateEnvironment(input: Record<string, string | undefined>) {
  const schema = input.SYNTHETIC_HOST_TEST === 'true' ? PrivateHostTestEnvironmentSchema : PrivateEnvironmentSchema;
  if (schema === PrivateHostTestEnvironmentSchema && input.TRUSTED_CONTAINER_LISTEN === 'true') throw new Error('Host test mode cannot publish beyond loopback.');
  const selected = Object.fromEntries(Object.keys(schema.shape).map(key => [key, input[key]]));
  return schema.parse(selected);
}
export function validatePrivateSecretFiles(input: Record<string, string | undefined>) {
  const config = parsePrivateEnvironment(input);
  for (const [name, path] of Object.entries(config)) {
    if (name.endsWith('_FILE') && readFileSync(path).length < 32) throw new Error('Private runtime secret is missing or too short.');
  }
  return config;
}
