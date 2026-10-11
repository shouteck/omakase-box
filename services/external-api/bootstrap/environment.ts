import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, resolve, sep } from 'node:path';
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
// Host test mode (SYNTHETIC_HOST_TEST === 'true'): see the private service's environment.ts.
// Database hosts stay loopback-only, every file path must live under the OS temp directory,
// database name/user stay pinned, and the wide-listen flag is refused.
const tempRoot = resolve(tmpdir()).toLowerCase() + sep;
const hostTestFile = z.string().refine(path => isAbsolute(path) && resolve(path).toLowerCase().startsWith(tempRoot), { message: 'host test files must live under the OS temp directory' });
const hostTestDatabaseHost = z.string().refine(host => /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) || host === 'localhost' || host === '::1' || host === '[::1]', { message: 'host test databases must be loopback' });
const ExternalHostTestEnvironmentSchema = z.strictObject(Object.fromEntries(Object.entries(ExternalEnvironmentSchema.shape).map(([key, field]) => [key, key.endsWith('_FILE') || key === 'EXTERNAL_STORAGE_ROOT' ? hostTestFile : key === 'EXTERNAL_DATABASE_HOST' ? hostTestDatabaseHost : field])));
export function parseExternalEnvironment(input: Record<string, string | undefined>) {
  if (Object.keys(input).some(key => /^(PRIVATE_|MODEL_|OLLAMA_)/.test(key) && input[key])) throw new Error('Private configuration is forbidden in the external service.');
  const schema = input.SYNTHETIC_HOST_TEST === 'true' ? ExternalHostTestEnvironmentSchema : ExternalEnvironmentSchema;
  if (schema === ExternalHostTestEnvironmentSchema && input.TRUSTED_CONTAINER_LISTEN === 'true') throw new Error('Host test mode cannot publish beyond loopback.');
  const selected = Object.fromEntries(Object.keys(schema.shape).map(key => [key, input[key]]));
  const config = schema.parse(selected);
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
