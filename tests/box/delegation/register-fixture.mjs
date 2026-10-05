import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const TIMEOUT_MS = 30000;

function usage() {
  console.error('usage: node register-fixture.mjs --manifest <path> --out <baseline.json>');
  process.exit(2);
}

const args = process.argv.slice(2);
const options = {};
for (let index = 0; index < args.length; index += 2) {
  if (!['--manifest', '--out'].includes(args[index])) usage();
  options[args[index]] = args[index + 1];
}
if (typeof options['--manifest'] !== 'string' || typeof options['--out'] !== 'string') usage();

export function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

function assertRel(path) {
  if (typeof path !== 'string' || path.length === 0 || path.length > 240) throw new Error('fixture_path');
  if (path.includes('\\') || path.includes('\0') || path.startsWith('/') || /^[A-Za-z]:/.test(path) || path.split('/').includes('..')) throw new Error('fixture_path');
}

async function git(workdir, argv) {
  const result = await run('git', argv, { cwd: workdir, timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024 });
  return String(result.stdout).trim();
}

function gitEnv(manifest) {
  return { ...process.env, GIT_AUTHOR_NAME: manifest.git.authorName, GIT_AUTHOR_EMAIL: manifest.git.authorEmail, GIT_AUTHOR_DATE: manifest.git.authorDate, GIT_COMMITTER_NAME: manifest.git.authorName, GIT_COMMITTER_EMAIL: manifest.git.authorEmail, GIT_COMMITTER_DATE: manifest.git.committerDate };
}

async function gitWithEnv(workdir, argv, manifest) {
  const result = await run('git', argv, { cwd: workdir, timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024, env: gitEnv(manifest) });
  return String(result.stdout).trim();
}

async function assertRegularInside(realBase, rel) {
  const target = resolve(realBase, rel);
  if (target !== realBase && !target.startsWith(realBase + sep)) throw new Error('fixture_boundary');
  const real = await realpath(target);
  if (real !== realBase && !real.startsWith(realBase + sep)) throw new Error('fixture_boundary_real');
  const info = await lstat(real);
  if (!info.isFile()) throw new Error('fixture_not_regular:' + rel);
  return real;
}

async function verifyExisting(workdir, manifest) {
  const realWorkdir = await realpath(workdir);
  const head = await git(realWorkdir, ['rev-parse', 'HEAD']);
  if (!/^[a-f0-9]{40}$/.test(head)) throw new Error('fixture_commit_invalid');
  const tracked = (await git(realWorkdir, ['ls-files'])).split('\n').filter(Boolean).sort();
  const expected = [...manifest.baselinePaths].sort();
  if (JSON.stringify(tracked) !== JSON.stringify(expected)) throw new Error('fixture_inventory_mismatch');
  const files = [];
  for (const rel of expected) {
    const real = await assertRegularInside(realWorkdir, rel);
    const bytes = await readFile(real);
    files.push({ path: rel, bytes: bytes.length, sha256: sha256(bytes) });
  }
  return { realWorkdir, baseCommit: head, files };
}

const manifest = JSON.parse(await readFile(options['--manifest'], 'utf8'));
if (manifest?.schemaVersion !== 1 || manifest.kind !== 'w005_d12_delegation_fixture_manifest' || manifest.revision !== '2026-10-05-d1.2-r1') throw new Error('fixture_manifest_invalid');
const sourceRoot = manifest.sourceRoot;
const workdir = manifest.baselineWorkdir;
const outPath = manifest.baselineOut;
const paths = manifest.baselinePaths;
if (typeof sourceRoot !== 'string' || !sourceRoot.startsWith('/')) throw new Error('fixture_manifest_root');
if (workdir !== '/tmp/w005-d12-fixture-baseline') throw new Error('fixture_manifest_workdir');
if (outPath !== '/tmp/w005-d12-fixture-baseline-out/baseline.json') throw new Error('fixture_manifest_out');
if (resolve(options['--out']) !== resolve(outPath)) throw new Error('fixture_out_binding');
if (!Array.isArray(paths) || paths.length < 1 || paths.length > 256) throw new Error('fixture_manifest_paths');
if (!Array.isArray(manifest.snapshotPaths) || manifest.snapshotPaths.length < 1) throw new Error('fixture_manifest_paths');
for (const path of [...paths, ...manifest.snapshotPaths]) assertRel(path);
for (const snap of manifest.snapshotPaths) if (!paths.includes(snap)) throw new Error('fixture_snapshot_not_in_baseline:' + snap);

const realSource = await realpath(resolve(sourceRoot));

let realWorkdir;
let baseCommit;
let files;
const existing = await lstat(workdir).catch(() => null);
if (existing !== null) {
  if (existing.isSymbolicLink() || !existing.isDirectory()) throw new Error('fixture_workdir_boundary');
  const verified = await verifyExisting(workdir, manifest);
  realWorkdir = verified.realWorkdir;
  baseCommit = verified.baseCommit;
  files = verified.files;
} else {
  await mkdir(workdir, { recursive: false });
  realWorkdir = await realpath(workdir);
  const staged = [];
  for (const rel of [...paths].sort()) {
    const realFile = await assertRegularInside(realSource, rel);
    const bytes = await readFile(realFile);
    const destination = resolve(realWorkdir, rel);
    if (!destination.startsWith(realWorkdir + sep)) throw new Error('fixture_boundary');
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
    staged.push({ path: rel, bytes: bytes.length, sha256: sha256(bytes) });
  }
  await git(realWorkdir, ['init', '--quiet']);
  await git(realWorkdir, ['add', '-A']);
  await gitWithEnv(realWorkdir, ['commit', '--quiet', '-m', manifest.git.message], manifest);
  baseCommit = await git(realWorkdir, ['rev-parse', 'HEAD']);
  if (!/^[a-f0-9]{40}$/.test(baseCommit)) throw new Error('fixture_commit_invalid');
  const tracked = (await git(realWorkdir, ['ls-files'])).split('\n').filter(Boolean).sort();
  if (JSON.stringify(tracked) !== JSON.stringify(staged.map(file => file.path))) throw new Error('fixture_inventory_mismatch');
  files = staged;
}

const baseline = { schemaVersion: 1, kind: 'w005_d12_fixture_baseline', label: manifest.label, sourceId: manifest.sourceId, workdir: realWorkdir, baseCommit, fileCount: files.length, files, snapshotPaths: [...manifest.snapshotPaths] };
await mkdir(dirname(resolve(outPath)), { recursive: true });
await writeFile(resolve(outPath), JSON.stringify(baseline, null, 2) + '\n');
console.log(JSON.stringify({ baseCommit, fileCount: files.length, out: outPath }));
