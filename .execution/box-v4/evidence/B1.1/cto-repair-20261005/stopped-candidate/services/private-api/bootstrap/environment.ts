import { readFileSync } from 'node:fs';
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
export function parsePrivateEnvironment(input: Record<string, string | undefined>) {
  const selected = Object.fromEntries(Object.keys(PrivateEnvironmentSchema.shape).map(key => [key, input[key]]));
  return PrivateEnvironmentSchema.parse(selected);
}
export function validatePrivateSecretFiles(input: Record<string, string | undefined>) {
  const config = parsePrivateEnvironment(input);
  for (const [name, path] of Object.entries(config)) {
    if (name.endsWith('_FILE') && readFileSync(path).length < 32) throw new Error('Private runtime secret is missing or too short.');
  }
  return config;
}
