import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, relative, isAbsolute, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const parent = realpathSync(tmpdir());
const root = mkdtempSync(join(parent, 'lab-a-attacks-'));
function put(folder, files) {
  for (const [name, content] of Object.entries(files)) {
    const path = join(folder, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
}
function run(folder) {
  const result = spawnSync(process.execPath, ['entry.mjs'], { cwd: folder, encoding: 'utf8', timeout: 5000 });
  if (result.error) throw result.error;
  assert.equal(result.signal, null);
  return { exit: result.status, stdout: result.stdout.trim(), missingModule: result.stderr.includes('ERR_MODULE_NOT_FOUND') };
}
try {
  const discovery = join(root, 'discovery');
  put(discovery, {
    'entry.mjs': "import { readdirSync, readFileSync } from 'node:fs';\nconst names = readdirSync('records');\nconst found = names.some(n => JSON.parse(readFileSync('records/' + n, 'utf8')).name === 'wanted');\nconsole.log(found ? 'ready' : 'missing');\n",
    'records/other.json': '{"name":"other"}',
  });
  const discoveryBase = run(discovery);
  put(discovery, { 'records/wanted.json': '{"name":"wanted"}' });
  const discoveryFixed = run(discovery);
  assert.deepEqual(discoveryBase, { exit: 0, stdout: 'missing', missingModule: false });
  assert.deepEqual(discoveryFixed, { exit: 0, stdout: 'ready', missingModule: false });
  const baseEntry = "export function wanted() { return 'unsupported'; }\nconsole.log(wanted());\n";
  const helper = "export function format() { return 'ready'; }\n";
  const fixedEntry = "import { format } from './helper.mjs';\nexport function wanted() { return format(); }\nconsole.log(wanted());\n";
  const full = join(root, 'helper-full');
  const box = join(root, 'helper-box');
  put(full, { 'entry.mjs': baseEntry, 'helper.mjs': helper });
  put(box, { 'entry.mjs': baseEntry });
  const helperBase = run(full);
  const boxBase = run(box);
  assert.deepEqual(helperBase, boxBase);
  put(full, { 'entry.mjs': fixedEntry });
  put(box, { 'entry.mjs': fixedEntry });
  const helperFixed = run(full);
  const boxReferenceFix = run(box);
  assert.equal(helperBase.stdout, 'unsupported');
  assert.deepEqual(helperFixed, { exit: 0, stdout: 'ready', missingModule: false });
  assert.equal(boxReferenceFix.exit, 1);
  assert.equal(boxReferenceFix.missingModule, true);
  console.log(JSON.stringify({ node: process.version, kind: 'synthetic-logical-witnesses', discovery: { base: discoveryBase, fixed: discoveryFixed, changedExistingSource: [], added: ['records/wanted.json'] }, helper: { region: ['entry.mjs'], base: helperBase, boxBase, fixed: helperFixed, boxReferenceFix, necessaryForEveryRepair: false } }, null, 2));
} finally {
  const target = resolve(root);
  const rel = relative(parent, target);
  assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel) && basename(target).startsWith('lab-a-attacks-'));
  rmSync(target, { recursive: true });
}
