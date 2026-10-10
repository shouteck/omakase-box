import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll } from 'vitest';

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

export function git(repo: string, args: string[]): string {
  const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
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
