import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { BountyRefused } from './errors.js';
import { git, gitOutcome } from './git.js';
import type { NeverShipRule } from './never-ship.js';

// The snapshot is the repository as it stands: tracked files with their uncommitted
// changes, plus untracked files that are not ignored; no .git, no history. It is
// pinned by a commit Git itself can resolve later: a temporary index (GIT_INDEX_FILE)
// is seeded from HEAD, `add -A` records the working state into the object store, and
// `commit-tree` wraps that tree in a commit parented on HEAD. The real index, the
// working tree and the current branch are never touched; the commit is unreachable
// and belongs to the repository alone.
//
// Enumeration walks that commit's tree, so the shipped set is exactly what the
// identifier records. Every candidate is then realpath-resolved before it is judged:
// exclusion runs on the canonical path, not the spelling — a case alias or a link
// or junction inside the repository lands on its real path, and a link whose target
// leaves the repository is refused by name, not followed.

export interface SnapshotFile { readonly path: string; readonly realPath: string }
export interface SnapshotRemoval { readonly path: string; readonly rule: string }

export interface Snapshot {
  readonly commit: string;
  readonly tree: string;
  readonly baseCommit: string | null;
  readonly files: readonly SnapshotFile[];
  readonly removed: readonly SnapshotRemoval[];
}

const BACKSLASH = String.fromCharCode(92);
const toPosix = (path: string): string => path.split(BACKSLASH).join('/');

export function createSnapshotCommit(repoRoot: string, workDir: string): { commit: string; tree: string; baseCommit: string | null } {
  const head = gitOutcome(repoRoot, ['rev-parse', '--verify', '-q', 'HEAD']);
  const baseCommit = head.status === 0 && /^[a-f0-9]{40}$/.test(head.stdout.trim()) ? head.stdout.trim() : null;
  const env = { GIT_INDEX_FILE: join(workDir, 'snapshot-index') };
  git(repoRoot, ['read-tree', ...(baseCommit !== null ? [baseCommit] : ['--empty'])], env);
  git(repoRoot, ['add', '-A'], env);
  const tree = git(repoRoot, ['write-tree'], env);
  const commit = git(repoRoot, [
    '-c', 'user.name=box-bounty', '-c', 'user.email=box-bounty@localhost',
    'commit-tree', tree, ...(baseCommit !== null ? ['-p', baseCommit] : []),
    '-m', 'box-bounty working-state snapshot (not referenced by any branch)'
  ], env);
  return { commit, tree, baseCommit };
}

export function classifySnapshot(repoRoot: string, commit: string, rules: readonly NeverShipRule[]): { files: SnapshotFile[]; removed: SnapshotRemoval[] } {
  const realRoot = realpathSync(repoRoot);
  const listing = git(repoRoot, ['ls-tree', '-r', '-z', '--format=%(objecttype) %(path)', commit]);
  const escapes: string[] = [];
  const unreadable: string[] = [];
  const shipped = new Map<string, SnapshotFile>();
  const removed: SnapshotRemoval[] = [];
  const removedPaths = new Set<string>();
  for (const record of listing.split('\0')) {
    if (record === '') continue;
    const tab = record.indexOf(' ');
    if (record.slice(0, tab) !== 'blob') continue; // gitlinks (submodules) and anything non-file
    const path = record.slice(tab + 1);
    const absolute = join(realRoot, ...path.split('/'));
    let real: string;
    try {
      real = realpathSync(absolute);
    } catch {
      unreadable.push(path);
      continue;
    }
    const offset = toPosix(relative(realRoot, real));
    if (offset === '' || offset.startsWith('../') || offset === '..' || isAbsolute(offset)) {
      escapes.push(path);
      continue;
    }
    if (!statSync(real).isFile()) { unreadable.push(path); continue; }
    const canonical = offset;
    const key = canonical.toLowerCase();
    if (shipped.has(key) || removedPaths.has(key)) continue; // a second spelling of the same real file
    const rule = rules.find(entry => entry.match(key));
    if (rule !== undefined) { removed.push({ path: canonical, rule: rule.name }); removedPaths.add(key); }
    else shipped.set(key, { path: canonical, realPath: real });
  }
  if (escapes.length > 0) {
    throw new BountyRefused(
      'link-escape',
      `${escapes.length} path(s) inside the repository resolve outside it — refused, not followed: ${escapes.sort().join(', ')}. Remove the link or junction, or list a safer repository.`
    );
  }
  if (unreadable.length > 0) {
    throw new BountyRefused(
      'unreadable-path',
      `${unreadable.length} path(s) in the snapshot cannot be read (a broken link, a link to a directory, or a file that vanished mid-scan): ${unreadable.sort().join(', ')}`
    );
  }
  const files = [...shipped.values()].sort((a, b) => a.path.localeCompare(b.path));
  return { files, removed: removed.sort((a, b) => a.path.localeCompare(b.path)) };
}

export function createSnapshot(repoRoot: string, workDir: string, rules: readonly NeverShipRule[]): Snapshot {
  const { commit, tree, baseCommit } = createSnapshotCommit(repoRoot, workDir);
  const { files, removed } = classifySnapshot(repoRoot, commit, rules);
  return { commit, tree, baseCommit, files, removed };
}
