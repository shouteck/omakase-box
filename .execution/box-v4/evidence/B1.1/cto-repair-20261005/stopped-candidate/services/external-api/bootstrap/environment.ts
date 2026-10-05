import { readFileSync } from 'node:fs';
import { z } from 'zod';

const secretFile = z.string().regex(/^\/run\/secrets\/[a-z_]+$/);
export const ExternalEnvironmentSchema = z.strictObject({
  EXTERNAL_DATABASE_HOST: z.literal('db-external'),
  EXTERNAL_DATABASE_NAME: z.literal('external_task'),
  EXTERNAL_DATABASE_USER: z.literal('external_service'),
  EXTERNAL_DATABASE_PASSWORD_FILE: secretFile,
  EXTERNAL_STORAGE_ROOT: z.literal('/data/external'),
  EXTERNAL_SESSION_KEY_FILE: secretFile,
  EXTERNAL_RELEASE_PUBLIC_KEY_FILE: secretFile,
  EXTERNAL_BRIDGE_KEY_FILE: secretFile,
  EXTERNAL_ASSIGNMENT_PUBLIC_KEY_FILE: secretFile,
  EXTERNAL_RECEIPT_KEY_FILE: secretFile,
  EXTERNAL_PERMIT_KEY_FILE: secretFile,
  EXTERNAL_IMPORT_PUBLIC_KEY_FILE: secretFile
});
export function parseExternalEnvironment(input: Record<string, string | undefined>) {
  if (Object.keys(input).some(key => /^(PRIVATE_|MODEL_|OLLAMA_)/.test(key) && input[key])) throw new Error('Private configuration is forbidden in the external service.');
  const selected = Object.fromEntries(Object.keys(ExternalEnvironmentSchema.shape).map(key => [key, input[key]]));
  const config = ExternalEnvironmentSchema.parse(selected);
  if (Object.entries(config).some(([name, path]) => name.endsWith('_FILE') && /private|model|owner/.test(path))) throw new Error('Private secret paths are forbidden.');
  return config;
}
export function validateExternalSecretFiles(input: Record<string, string | undefined>) {
  const config = parseExternalEnvironment(input);
  for (const [name, path] of Object.entries(config)) {
    if (name.endsWith('_FILE') && readFileSync(path).length < 32) throw new Error('External runtime secret is missing or too short.');
  }
  return config;
}
