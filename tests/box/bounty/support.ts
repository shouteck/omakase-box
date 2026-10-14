import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeEach } from 'vitest';
import { readDecision, writeDecision } from '../../../packages/box-bounty/index.js';
import type { OwnerDecision } from '../../../packages/box-bounty/index.js';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const CLI_DIST = join(ROOT, 'packages', 'box-cli', 'dist', 'cli.js');
const BS = String.fromCharCode(92);

const runDirectories: string[] = [];
export function runRoot(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `box-bt1-${label}-`));
  runDirectories.push(dir);
  return dir;
}
function cleanupOwned(): void {
  for (const dir of runDirectories.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
}
afterAll(cleanupOwned);
process.once('exit', cleanupOwned);

// BT8: the owner's decision lives in the owner's settings folder, outside
// every repository. Tests never read or write the real one: every file that
// imports this module gets the tool pointed at a temp folder, and each test
// starts with nothing written — nothing written is never read as allowed.
// Fixture worlds that travel with their own scratch carry their own
// settings dir instead (github-fixture.ts rebinds the variable).
export const ownerSettingsRoot = runRoot('bt8-owner-settings');
process.env['BOX_BOUNTY_SETTINGS_DIR'] = ownerSettingsRoot;
// Create's optional publication preview must never turn a standalone scratch
// fixture into a real GitHub call. Owned stand-in executables live under the
// test root; replay shims substitute node before this guard sees the call.
const networkGuard = join(runRoot('BT15-no-network'), 'guard.cjs');
writeFileSync(networkGuard, String.raw`
const cp = require('node:child_process');
const original = cp.spawnSync;
cp.spawnSync = function(program, args, options) {
  const path = String(program).split(String.fromCharCode(92)).join('/');
  const values = Array.isArray(args) ? args.map(String) : [];
  const realGh = /(?:^|\/)gh(?:\.exe|\.cmd)?$/i.test(path) && !path.includes('/box-bt1-');
  const shellGh = /(?:^|\/)cmd(?:\.exe)?$/i.test(path) && values.join(' ').includes('gh') && !values.join(' ').includes('box-bt1-');
  const realGitHub = /(?:^|\/)git(?:\.exe)?$/i.test(path) && values.some(value => ['clone', 'fetch', 'push', 'ls-remote'].includes(value)) && values.some(value => /(?:https:\/\/|git@)github\.com[\/:]/i.test(value));
  if (realGh || shellGh || realGitHub) {
    return { pid: 0, output: [null, '', 'real GitHub disabled in bounty tests'], stdout: '', stderr: 'real GitHub disabled in bounty tests', status: 1, signal: null };
  }
  return original.apply(this, arguments);
};
require('node:module').syncBuiltinESMExports();
`);
createRequire(import.meta.url)(networkGuard);
const previousNodeOptions = process.env['NODE_OPTIONS'];
process.env['NODE_OPTIONS'] = `${previousNodeOptions ?? ''} --require ${networkGuard.replaceAll('\\', '/')}`.trim();
afterAll(() => {
  if (previousNodeOptions === undefined) delete process.env['NODE_OPTIONS'];
  else process.env['NODE_OPTIONS'] = previousNodeOptions;
});
beforeEach(() => {
  rmSync(join(ownerSettingsRoot, 'settings.json'), { force: true });
  if (process.env['BOX_BOUNTY_SETTINGS_DIR'] !== ownerSettingsRoot) process.env['BOX_BOUNTY_SETTINGS_DIR'] = ownerSettingsRoot;
});
// Write one level of the owner's decision inside the temp folder — the same
// bytes `box bounty owner allow/ask/off` writes.
export function ownerSays(repoRoot: string, decision: OwnerDecision, level: 'project' | 'default' = 'project'): void {
  if (level === 'project' && git(repoRoot, ['remote']).trim() === '') git(repoRoot, ['remote', 'add', 'origin', `https://github.com/tests/${repoRoot.split(/[\\/]/).slice(-2, -1)[0]}.git`]);
  writeDecision(repoRoot, level, decision);
}
export const ownerRead = (repoRoot: string) => readDecision(repoRoot);

// A deterministic fixture identity on every call: the suite must not depend on
// the host's global config — CI runners carry none, so merge/commit/revert
// calls without their own -c died with "Committer identity unknown" there.
// `-c` applies in order, so a call site's own `-c user.name=` still wins.
export function git(repo: string, args: string[]): string {
  const result = spawnSync('git', ['-c', `safe.directory=${repo.replaceAll('\\', '/')}`, '-c', 'user.name=bt-test', '-c', 'user.email=bt-test@test.invalid', '-C', repo, ...args], { encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}

export function write(repo: string, rel: string, content: string): void {
  const target = join(repo, ...rel.split('/'));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

// A small Git repository built at run time in the OS temp folder — a fixture cannot
// carry a .git. `files` maps repo-relative posix paths to contents; everything is
// committed, then `mutate` runs against the live tree before the test drives on.
export function makeRepo(files: Record<string, string>, mutate?: (repo: string) => void): string {
  const repo = join(runRoot('repo'), 'repo');
  mkdirSync(repo, { recursive: true });
  git(repo, ['init', '-b', 'main', '-q']);
  // Deterministic eol: scratch repos behave like a raw-bytes checkout whatever
  // the host's global autocrlf says. Tests that want autocrlf set it on the
  // repo themselves (the product code runs under the repo's own config).
  git(repo, ['config', 'core.autocrlf', 'false']);
  for (const [rel, content] of Object.entries(files)) write(repo, rel, content);
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'user.name=bt1-test', '-c', 'user.email=bt1@test.invalid', 'commit', '-qm', 'base']);
  mutate?.(repo);
  return repo;
}

export interface RepoFingerprint {
  readonly head: string;
  readonly indexSha256: string;
  readonly status: string;
  readonly files: Record<string, string>;
}

// Byte-for-byte proof that creating a bounty changed nothing: HEAD, the real index
// bytes, `git status` and every working-tree file's content. `.box/` is excluded:
// BT2 makes create write the bounty record at `.box/bounties/<id>.json` inside the
// repository on purpose — everything else must still be untouched.
export function fingerprint(repo: string): RepoFingerprint {
  const files: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const target = join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== '.git' && entry.name !== '.box') walk(target);
      else if (entry.isFile()) files[target.slice(repo.length + 1).split(BS).join('/')] = createHash('sha256').update(readFileSync(target)).digest('hex');
    }
  };
  walk(repo);
  return {
    head: git(repo, ['rev-parse', 'HEAD']),
    indexSha256: createHash('sha256').update(readFileSync(join(repo, '.git', 'index'))).digest('hex'),
    status: git(repo, ['status', '--porcelain']).split('\n').filter(line => !line.slice(3).startsWith('.box/')).join('\n'),
    files
  };
}

export function listTree(dir: string): string[] {
  const files: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const target = join(current, entry.name);
      if (entry.isDirectory()) walk(target);
      else files.push(target.slice(dir.length + 1).split(BS).join('/'));
    }
  };
  walk(dir);
  return files.sort();
}

// Recreates the snapshot exactly as a later wave would, using only the repository
// and the recorded identifier: a temporary index (never the real one) + checkout-index.
export function recreateSnapshot(repo: string, commit: string): { dir: string; files: string[] } {
  const dir = join(runRoot('recreate'), 'snapshot');
  mkdirSync(dir, { recursive: true });
  const indexFile = join(runRoot('recreate-index'), 'index');
  const env = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_INDEX_FILE: indexFile };
  const run = (args: string[]) => {
    // Pin autocrlf off so recreation produces blob bytes, not this host's filter choice.
    const result = spawnSync('git', ['-c', 'core.autocrlf=false', '-C', repo, ...args], { encoding: 'utf8', env });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
    return result.stdout.trim();
  };
  run(['read-tree', commit]);
  run(['checkout-index', '-a', '--prefix=' + dir.split(BS).join('/') + '/']);
  return { dir, files: listTree(dir) };
}
