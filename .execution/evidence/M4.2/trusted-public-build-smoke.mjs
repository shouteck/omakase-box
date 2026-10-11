import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, lstat, realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { docker } from '../../../scripts/docker.mjs';

export const PINNED_IMAGE = 'sha256:eb4a84ec3e2948cd47e414fa66054730f10d0c20e5001b895fd58070c81c53f8';
export const PINNED_CONTEXT = '1db95bb47287ffce16eba7fcad21a2e9b1219c82331a0db6941a735d6aad396d';
export const TRUSTED_FIXTURE = Object.freeze({
  'package.json': JSON.stringify({ name: 'independent-trusted-build-smoke', private: true, type: 'module' }),
  'workspace.json': JSON.stringify({ workUnits: [
    { id: 'smoke-ui', adapterKind: 'frontend_component', editablePaths: ['src/Selection.tsx'] },
    { id: 'smoke-api', adapterKind: 'backend_api', editablePaths: ['src/selection.ts'] },
    { id: 'smoke-rank', adapterKind: 'backend_pure_module', editablePaths: ['src/rank.ts'] }
  ], interfaces: [{ id: 'selection', producerUnitId: 'smoke-api', consumerUnitIds: ['smoke-ui'] }], endToEndRequirementIds: ['selection-roundtrip'] }),
  'index.html': '<!doctype html><html><head><title>Independent trusted selection smoke</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n',
  'src/main.tsx': `import React from 'react';
import { createRoot } from 'react-dom/client';
import Selection from './Selection';
import './selection.css';
throw new Error('trusted_smoke_source_must_not_execute');
createRoot(document.getElementById('root')!).render(<Selection />);
`,
  'src/Selection.tsx': `import React, { useState } from 'react';
import type { SelectionResponse } from './types';
export default function Selection() {
  const [selected, setSelected] = useState('');
  async function select() {
    const response = await fetch('/selection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selectedId: 'smoke-choice' }) });
    const result: SelectionResponse = await response.json();
    setSelected(result.selectedId ?? result.code ?? 'error');
  }
  return <section className="trusted-smoke-selection"><button onClick={select}>Select smoke choice</button><output>{selected}</output></section>;
}
`,
  'src/types.ts': `export interface SelectionRequest { selectedId: string }
export interface SelectionResponse { selectedId?: string; code?: string }
export interface SelectionContext { options: readonly { id: string; available: boolean }[] }
export interface SelectionResult { status: number; body: SelectionResponse }
`,
  'src/selection.ts': `import type { SelectionRequest, SelectionContext, SelectionResult } from './types';
throw new Error('trusted_smoke_source_must_not_execute');
export default function selection(body: SelectionRequest, context: SelectionContext): SelectionResult {
  const option = context.options.find(item => item.id === body.selectedId);
  if (!option) return { status: 404, body: { code: 'smoke-missing' } };
  if (!option.available) return { status: 422, body: { code: 'smoke-unavailable' } };
  return { status: 200, body: { selectedId: option.id } };
}
`,
  'src/rank.ts': `interface Item { id: string; score: number }
throw new Error('trusted_smoke_source_must_not_execute');
export default function rank(items: readonly Item[]): Item[] {
  return [...items].sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
`,
  'src/selection.css': '.trusted-smoke-selection { display: grid; gap: 7px; }\n'
});

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function makeSmokeInput(buildSource) {
  assert.equal(typeof buildSource, 'string');
  const files = { ...TRUSTED_FIXTURE, 'tooling/build.mjs': buildSource };
  const input = JSON.stringify(files);
  assert.ok(Buffer.byteLength(input) <= 65536);
  return { input, hashes: Object.fromEntries(Object.entries(files).map(([name, source]) => [name, sha256(source)])) };
}

export function containerScript(hashes) {
  return `import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, lstat, readFile, readdir, readlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const hashes = ${JSON.stringify(hashes)};
assert.notEqual(process.getuid(), 0);
let input = ''; let size = 0;
for await (const chunk of process.stdin) { size += chunk.length; assert.ok(size <= 65536); input += chunk.toString('utf8'); }
const files = JSON.parse(input);
assert.deepEqual(Object.keys(files).sort(), Object.keys(hashes).sort());
const root = '/tmp/trusted-public-build-smoke';
await mkdir(root);
process.chdir(root);
for (const [name, source] of Object.entries(files)) {
  assert.equal(typeof source, 'string');
  assert.equal(createHash('sha256').update(source).digest('hex'), hashes[name]);
  assert.match(name, /^(?:[A-Za-z0-9_-]+\\/)*[A-Za-z0-9_.-]+$/);
  assert.ok(!name.split('/').includes('..'));
  const parent = name.lastIndexOf('/');
  if (parent > 0) await mkdir(name.slice(0, parent), { recursive: true });
  await writeFile(name, source, { flag: 'wx' });
}
await assert.rejects(lstat('node_modules'), { code: 'ENOENT' });
await assert.rejects(lstat('.build'), { code: 'ENOENT' });
const built = spawnSync(process.execPath, ['tooling/build.mjs'], {
  cwd: root, encoding: 'utf8', timeout: 90000, maxBuffer: 262144,
  env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/tmp', TMPDIR: '/tmp' }
});
assert.equal(built.error, undefined);
assert.equal(built.status, 0, 'Clean offline build failed: ' + built.stdout + built.stderr);
assert.equal(await readlink('node_modules'), '/opt/toolchain/node_modules');
const artifacts = []; let bytes = 0;
async function inventory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = directory + '/' + entry.name;
    const stat = await lstat(name);
    assert.ok(!stat.isSymbolicLink());
    if (stat.isDirectory()) { assert.ok(name.length < 200); await inventory(name); }
    else {
      assert.ok(stat.isFile());
      assert.ok(artifacts.length < 64 && stat.size > 0 && stat.size <= 2097152);
      bytes += stat.size; assert.ok(bytes <= 4194304);
      assert.ok(!name.endsWith('.map'));
      const content = await readFile(name);
      artifacts.push({ path: name, bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') });
    }
  }
}
await inventory('.build');
const html = await readFile('.build/ui/index.html', 'utf8');
assert.ok(html.includes('Independent trusted selection smoke'));
assert.ok(!html.includes('/src/'));
const references = [...html.matchAll(/(?:src|href)="([^\"]+)"/g)].map(match => match[1]);
assert.ok(references.some(name => name.endsWith('.js')));
assert.ok(references.some(name => name.endsWith('.css')));
for (const reference of references) {
  assert.match(reference, /^\\.\\/assets\\/[A-Za-z0-9_.-]+\\.(?:js|css)$/);
  assert.ok(artifacts.some(item => item.path === '.build/ui/' + reference.slice(2)));
}
const uiFiles = artifacts.filter(item => item.path.startsWith('.build/ui/assets/') && item.path.endsWith('.js'));
const ui = (await Promise.all(uiFiles.map(item => readFile(item.path, 'utf8')))).join('');
assert.ok(ui.includes('/selection') && ui.includes('smoke-choice') && ui.includes('trusted_smoke_source_must_not_execute'));
const api = await readFile('.build/smoke-api.mjs', 'utf8');
const rank = await readFile('.build/smoke-rank.mjs', 'utf8');
assert.ok(api.includes('smoke-unavailable') && api.includes('selectedId'));
for (const source of [api, rank]) {
  assert.match(source, /export\\s*\\{/);
  assert.ok(source.includes('default') && source.includes('trusted_smoke_source_must_not_execute'));
}
assert.ok(rank.includes('.sort('));
console.log(JSON.stringify({ assurance: 'tested', cleanOfflineBuild: true, frontendBuilt: true, backendBuilt: true, pureModuleBuilt: true, artifacts, artifactBytes: bytes, candidateExecuted: false, candidateRendered: false, authoritativeAcceptance: false, actualVmValidation: 'unverified' }));
`;
}

export function smokeCommand(script) {
  return ['run', '--rm', '--pull', 'never', '--platform', 'linux/amd64', '--network', 'none', '--user', '1000:1000', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--cpus', '2', '--memory', '512m', '--memory-swap', '512m', '--pids-limit', '128', '--ulimit', 'nofile=1024:1024', '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=128m,mode=1777', '--workdir', '/tmp', '--entrypoint', 'node', '-i', PINNED_IMAGE, '--input-type=module', '--eval', script];
}

async function verifyContext(root) {
  const context = resolve(root, 'templates/workspaces/image');
  assert.equal(await realpath(context), context);
  const allowed = ['.dockerignore', 'Dockerfile', 'bootstrap/package.json', 'bootstrap/package-lock.json', 'toolchain/package.json', 'toolchain/pnpm-lock.yaml', 'toolchain/pnpm-workspace.yaml', 'self-check.mjs'].sort();
  const files = [];
  async function inventory(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = prefix + entry.name, path = join(directory, entry.name);
      const stat = await lstat(path);
      assert.ok(!stat.isSymbolicLink());
      if (stat.isDirectory()) { assert.ok(['bootstrap', 'toolchain'].includes(name)); await inventory(path, name + '/'); }
      else { assert.ok(stat.isFile() && allowed.includes(name) && stat.size < 1048576); const bytes = await readFile(path); files.push({ path: name, bytes: bytes.length, sha256: sha256(bytes) }); }
    }
  }
  await inventory(context);
  files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  assert.deepEqual(files.map(file => file.path).sort(), allowed);
  assert.equal(sha256(JSON.stringify(files)), PINNED_CONTEXT);
}

export async function runSmoke() {
  const root = resolve(import.meta.dirname, '../../..');
  await verifyContext(root);
  const { PUBLIC_FILES } = await import(pathToFileURL(join(root, 'templates/workspaces/catalogue.ts')).href);
  const { input, hashes } = makeSmokeInput(PUBLIC_FILES['tooling/build.mjs']);
  const inspected = await docker(['image', 'inspect', PINNED_IMAGE], { timeout: 10000 });
  assert.equal(inspected.code, 0);
  const [image] = JSON.parse(inspected.stdout);
  assert.equal(image.Id, PINNED_IMAGE);
  assert.equal(image.Config.User, 'pwuser');
  assert.equal(image.Architecture, 'amd64');
  assert.equal(image.Os, 'linux');
  const script = containerScript(hashes);
  const args = smokeCommand(script);
  const result = await docker(args, { input, timeout: 110000 });
  assert.equal(result.code, 0, 'Pinned trusted build smoke failed: ' + result.stdout + result.stderr);
  const report = JSON.parse(result.stdout.trim());
  assert.equal(report.cleanOfflineBuild, true);
  assert.equal(report.candidateExecuted, false);
  assert.equal(report.candidateRendered, false);
  console.log(JSON.stringify({ ...report, imageDigest: PINNED_IMAGE, sourceContextHash: PINNED_CONTEXT, inputBytes: Buffer.byteLength(input), inputSha256: sha256(input), trustedFileHashes: hashes, scriptSha256: sha256(script), dockerArgs: args }));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  assert.deepEqual(process.argv.slice(2), ['--run']);
  await runSmoke();
}
