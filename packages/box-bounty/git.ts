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

export interface GitEnv { readonly GIT_INDEX_FILE?: string }

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
