import { spawnSync } from 'node:child_process';

// Git entry point for the bounty tool. Two rules differ from a casual call:
//  - GIT_OPTIONAL_LOCKS=0 on every invocation, so reads (status, ls-files,
//    ls-tree) never opportunistically rewrite .git/index — creating a bounty
//    must leave the index byte-for-byte as found.
//  - The per-invocation safe.directory override (never a global config change)
//    lets it read a checkout owned by a different account, matching how every
//    kitchen git call is made.
// Extra environment (GIT_INDEX_FILE for the snapshot's temporary index) is
// passed through by callers; it never leaks into the real index.
//
// GIT_ATTR_SOURCE pins where attribute lookups read from (git ≥ 2.40). Every
// merge, revert or merge-tree this tool runs against a foreign answer sets it
// to the repository's own HEAD: a solver-carried `.gitattributes` can then
// name nothing — no filter, no merge driver, no text conversion the owner did
// not already commit. Without it, attributes would be read from the merged
// result and a returned `.gitattributes` could select commands out of the
// host's own git config.

// GIT_AUTHOR_DATE and GIT_COMMITTER_DATE pin the tool-built work-in-progress
// commit: the same tree, parent, message and dates always give the same sha,
// so the GitHub preview, the record and the push can never disagree about
// which commit it is.
export interface GitEnv { readonly GIT_INDEX_FILE?: string; readonly GIT_ATTR_SOURCE?: string; readonly GIT_AUTHOR_DATE?: string; readonly GIT_COMMITTER_DATE?: string }

export interface GitOutcome {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: Error;
}

export class GitFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitFailed';
  }
}

const BACKSLASH = String.fromCharCode(92);

export function gitOutcome(repo: string, args: readonly string[], env: GitEnv = {}): GitOutcome {
  const result = spawnSync('git', ['-c', `safe.directory=${repo.replaceAll(BACKSLASH, '/')}`, '-C', repo, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', ...env },
    windowsHide: true
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '', ...(result.error !== undefined ? { error: result.error } : {}) };
}

export function git(repo: string, args: readonly string[], env: GitEnv = {}): string {
  const result = gitOutcome(repo, args, env);
  if (result.status !== 0 || result.error !== undefined) {
    const detail = (result.stderr || result.stdout || result.error?.message || `exit ${result.status}`).trim();
    throw new GitFailed(`git ${args.join(' ')} failed in ${repo}: ${detail}`);
  }
  return result.stdout.trim();
}

// Write literal bytes as a blob into the object store, returning its sha. stdin
// hashing applies no filters, so the blob is exactly the bytes handed in — used
// by the answer commit, which is built on a temporary index and never the
// worktree.
export function gitWriteBlob(repo: string, bytes: Buffer): string {
  const result = spawnSync('git', ['-c', `safe.directory=${repo.replaceAll(BACKSLASH, '/')}`, '-C', repo, 'hash-object', '-t', 'blob', '-w', '--stdin'], {
    input: bytes,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    windowsHide: true
  });
  if (result.status !== 0 || result.error !== undefined) {
    const detail = (result.stderr?.toString() ?? result.error?.message ?? `exit ${result.status}`).trim();
    throw new GitFailed(`git hash-object failed in ${repo}: ${detail}`);
  }
  return result.stdout.toString().trim();
}

// A three-way merge computed in the object store alone: `merge-tree --write-tree`
// writes the merged tree object but never touches the worktree, the index or
// HEAD. With `-z --name-only` the stdout is the tree oid, the conflicted paths
// (ending at an empty field) and the message section — exit 1 means conflicts.
export type DryMerge =
  | { readonly kind: 'clean' }
  | { readonly kind: 'conflict'; readonly paths: readonly string[] }
  | { readonly kind: 'untestable'; readonly detail: string };

// `attrSource` pins which tree attribute lookups read from; it defaults to the
// merge-base — owner-side history — so a foreign .gitattributes inside
// `theirs` can pick no merge driver or filter out of the host's config. When
// the base itself is foreign (undoing a merge), callers pass the pre-merge
// parent instead.
export function mergeTree(repo: string, base: string, ours: string, theirs: string, attrSource?: string): DryMerge {
  const run = gitOutcome(repo, ['merge-tree', '--write-tree', '-z', '--name-only', `--merge-base=${base}`, ours, theirs], { GIT_ATTR_SOURCE: attrSource ?? base });
  const oid = (run.stdout.split('\0')[0] ?? '').trim();
  if (!/^[0-9a-f]{40}$/.test(oid)) {
    return { kind: 'untestable', detail: `git merge-tree could not merge (exit ${run.status}): ${(run.stderr || run.stdout || run.error?.message || '').trim()}` };
  }
  if (run.status === 0) return { kind: 'clean' };
  const paths: string[] = [];
  for (const token of run.stdout.split('\0').slice(1)) {
    if (token === '') break; // the conflicted-file section ends at the empty field
    paths.push(token);
  }
  return { kind: 'conflict', paths: paths.sort() };
}

// The merge-base of two commits; null when they share no history or either name
// cannot be resolved.
export function mergeBase(repo: string, a: string, b: string): string | null {
  const run = gitOutcome(repo, ['merge-base', a, b]);
  const first = (run.stdout.split('\n')[0] ?? '').trim();
  return run.status === 0 && /^[0-9a-f]{40}$/.test(first) ? first : null;
}

// Would `theirs` merge cleanly onto the current branch as it stands? The same
// merge-base `git merge` would compute — the dry read mirrors the real merge.
export function dryMergeOnto(repo: string, theirs: string): DryMerge {
  if (gitOutcome(repo, ['rev-parse', '--verify', '-q', 'HEAD']).status !== 0) {
    return { kind: 'untestable', detail: 'the branch has no commits yet' };
  }
  if (gitOutcome(repo, ['cat-file', '-e', theirs]).status !== 0) {
    return { kind: 'untestable', detail: `commit ${theirs} is not in the object store` };
  }
  const base = mergeBase(repo, 'HEAD', theirs);
  if (base === null) {
    return { kind: 'untestable', detail: 'the answer shares no history with the current branch — git merge would refuse unrelated histories' };
  }
  return mergeTree(repo, base, 'HEAD', theirs);
}

// Raw blob bytes for a path inside the snapshot commit. cat-file reads the object
// directly: no eol, attribute or filter transforms ever apply, so the bytes are
// exactly what the identifier records. Returns null when the path is not a blob
// in the tree (a link's target that was never itself tracked).
export function gitBlob(repo: string, commit: string, path: string, env: GitEnv = {}): Buffer | null {
  const result = spawnSync('git', ['-c', `safe.directory=${repo.replaceAll(BACKSLASH, '/')}`, '-C', repo, 'cat-file', 'blob', `${commit}:${path}`], {
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', ...env },
    maxBuffer: 512 * 1024 * 1024,
    windowsHide: true
  });
  if (result.status !== 0 || result.error !== undefined) return null;
  return result.stdout;
}
