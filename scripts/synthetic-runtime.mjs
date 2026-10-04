import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { docker } from './docker.mjs';
import { root } from './process.mjs';

export const runtimeRoot = join(root, '.runtime', 'synthetic-runtime');
export const environmentFile = join(runtimeRoot, 'runtime.env');
export const composeArguments = ['compose', '--parallel', '1', '--project-name', 'private-task-mvp-synthetic', '--env-file', environmentFile, '-f', join(root, 'infra', 'compose.yaml')];
export async function initializeSyntheticRuntime() {
  await mkdir(runtimeRoot, { recursive: true });
  const marker = join(runtimeRoot, 'identity.json');
  const entries = await readdir(runtimeRoot);
  if (entries.length) {
    const identity = JSON.parse(await readFile(marker, 'utf8'));
    if (identity.kind !== 'private-task-synthetic-runtime' || identity.schemaVersion !== 1) throw new Error('Unrecognized runtime directory; refusing to overwrite.');
  } else {
    await writeFile(marker, JSON.stringify({ kind: 'private-task-synthetic-runtime', schemaVersion: 1 }) + '\n', { flag: 'wx', mode: 0o600 });
  }
  const release = generateKeyPairSync('ed25519'), assignment = generateKeyPairSync('ed25519'), receipt = generateKeyPairSync('ed25519'), permit = generateKeyPairSync('ed25519'), importer = generateKeyPairSync('ed25519');
  const files = {
    PRIVATE_DB_PASSWORD_FILE: ['private', 'db-password', randomBytes(32).toString('hex')],
    EXTERNAL_DB_PASSWORD_FILE: ['external', 'db-password', randomBytes(32).toString('hex')],
    PRIVATE_SESSION_KEY_FILE: ['private', 'session-key', randomBytes(32).toString('hex')],
    EXTERNAL_SESSION_KEY_FILE: ['external', 'session-key', randomBytes(32).toString('hex')],
    PRIVATE_OWNER_BOOTSTRAP_FILE: ['private', 'owner-bootstrap', randomBytes(32).toString('hex')],
    PRIVATE_RELEASE_KEY_FILE: ['private', 'release-key', release.privateKey.export({ format: 'pem', type: 'pkcs8' })],
    EXTERNAL_RELEASE_PUBLIC_KEY_FILE: ['external', 'release-public-key', release.publicKey.export({ format: 'pem', type: 'spki' })],
    PRIVATE_BRIDGE_KEY_FILE: ['private', 'bridge-key', randomBytes(32).toString('hex')],
    EXTERNAL_BRIDGE_KEY_FILE: ['external', 'bridge-key', randomBytes(32).toString('hex')],
    PRIVATE_ASSIGNMENT_KEY_FILE: ['private', 'assignment-key', assignment.privateKey.export({ format: 'pem', type: 'pkcs8' })],
    PRIVATE_RECEIPT_PUBLIC_KEY_FILE: ['private', 'receipt-public-key', receipt.publicKey.export({ format: 'pem', type: 'spki' })],
    EXTERNAL_ASSIGNMENT_PUBLIC_KEY_FILE: ['external', 'assignment-public-key', assignment.publicKey.export({ format: 'pem', type: 'spki' })],
    EXTERNAL_RECEIPT_KEY_FILE: ['external', 'receipt-key', receipt.privateKey.export({ format: 'pem', type: 'pkcs8' })],
    EXTERNAL_PERMIT_KEY_FILE: ['external', 'permit-key', permit.privateKey.export({ format: 'pem', type: 'pkcs8' })],
    PRIVATE_PERMIT_PUBLIC_KEY_FILE: ['private', 'permit-public-key', permit.publicKey.export({ format: 'pem', type: 'spki' })],
    PRIVATE_IMPORT_KEY_FILE: ['private', 'import-key', importer.privateKey.export({ format: 'pem', type: 'pkcs8' })],
    EXTERNAL_IMPORT_PUBLIC_KEY_FILE: ['external', 'import-public-key', importer.publicKey.export({ format: 'pem', type: 'spki' })]
  };
  const lines = [];
  for (const [name, [scope, filename, contents]] of Object.entries(files)) {
    const directory = join(runtimeRoot, scope);
    await mkdir(directory, { recursive: true });
    const path = join(directory, filename);
    try { await writeFile(path, contents, { flag: 'wx', mode: 0o600 }); }
    catch (error) { if ((error && typeof error === 'object' && 'code' in error ? error.code : '') !== 'EEXIST') throw error; }
    lines.push(`${name}=${path.replaceAll('\\', '/')}`);
  }
  await writeFile(environmentFile, lines.join('\n') + '\n', { mode: 0o600 });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const action = process.argv[2];
  if (!['init', 'config', 'build', 'up', 'stop'].includes(action)) process.exit(2);
  await initializeSyntheticRuntime();
  if (action === 'init') console.log(JSON.stringify({ assurance: 'tested', kind: 'synthetic_runtime', action: 'initialized', secretsPrinted: false }));
  else {
    const endpoint = await docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']);
    if (endpoint.code !== 0 || !/^(unix:|npipe:)/.test(endpoint.stdout.trim())) throw new Error('Only a local Docker endpoint is allowed for this synthetic runtime.');
    const args = action === 'config' ? ['config', '--quiet'] : action === 'up' ? ['up', '-d', '--wait', '--wait-timeout', '60'] : [action];
    const result = await docker([...composeArguments, ...args], { timeout: action === 'build' ? 600000 : 120000 });
    console.log(JSON.stringify({ assurance: result.code === 0 ? 'tested' : 'unverified', kind: 'synthetic_runtime', action, exitCode: result.code }));
    if (result.code !== 0) console.error(result.stderr.slice(-8192));
    process.exitCode = result.code;
  }
}
