import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { resolveProgram } from '../box-package/commands.js';

let pinnedGit: string | undefined;
export function gitProgram(): string {
  if (pinnedGit !== undefined) return pinnedGit;
  try { pinnedGit = resolve(resolveProgram('git').path); }
  catch { throw new GitFailed('Git is not available on PATH; nothing was run'); }
  return pinnedGit;
}

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

function gitEnvironment(env: GitEnv = {}): NodeJS.ProcessEnv {
  const inherited = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_COMMON_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) delete inherited[key];
  return { ...inherited, GIT_OPTIONAL_LOCKS: '0', ...env };
}

function operationIndex(args: readonly string[]): number {
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '-c') { i += 1; continue; }
    return i;
  }
  return -1;
}

// Whose content a call works on decides which configured programs may run —
// not which Git operation it is.
//
//   'foreign' (the default)  A solver's content is, or may be, in play: a look
//             copy, or any call that does not say otherwise.
//             Nothing the configuration names is run — no filter, no merge
//             driver — whatever the attributes select. A call added later
//             lands here.
//   'owner'   Only the owner's own content is in play, in the owner's own
//             repository: the snapshot create ships, reads of the owner's
//             working tree, and the merge that lands on it. The owner's
//             configured filters and merge drivers behave as in plain Git, so
//             create ships filtered bytes and a landed merge leaves the
//             working tree as the owner's own checkout would. Which names can
//             be selected there is still decided by the owner's committed
//             attributes (GIT_ATTR_SOURCE at the call).
//
// Said with ownerGit / ownerGitOutcome. An unmarked call that should have been
// 'owner' gives wrong bytes, which a test can see; the opposite mistake could
// run something, so 'foreign' is what an unmarked call gets.
export type GitContent = 'owner' | 'foreign';

// The tool never writes Git configuration, so within one command the filter and
// merge-driver names are read once per repository path instead of before every
// foreign call. The CLI is one command per process and says so for the whole
// process; a library caller gets the same for the length of each command it
// calls (asOneCommand), and nothing is remembered from one command to the
// next. A bare call outside any command — a test that edits configuration
// between two calls — still reads before each call.
let pinsByRepo: Map<string, readonly string[]> | null = null;
export function readGitPinsOncePerProcess(): void { pinsByRepo ??= new Map(); }
let commandPins: Map<string, readonly string[]> | null = null;
let commandDepth = 0;
export function asOneCommand<T>(run: () => T): T {
  commandDepth += 1;
  commandPins ??= new Map();
  try { return run(); }
  finally {
    commandDepth -= 1;
    if (commandDepth === 0) commandPins = null;
  }
}

// Never content, so never a question of whose: hooks, signing programs, the
// file-system monitor, background maintenance, submodule recursion and an
// external diff program are off for every call the tool makes. None of them
// changes a byte the tool reads or writes.
const ALWAYS = ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false', '-c', 'tag.gpgSign=false', '-c', 'log.showSignature=false', '-c', 'merge.verifySignatures=false', '-c', 'core.fsmonitor=false', '-c', 'submodule.recurse=false', '-c', 'gc.auto=0', '-c', 'maintenance.auto=false', '-c', 'diff.external='];

// These read or write objects and refs only — never working-tree content, never
// the index — so no filter or merge driver can run in them and the foreign pins
// need no configuration read. A saving only: anything not listed is pinned.
const OBJECT_AND_REF_ONLY = new Set(['rev-parse', 'cat-file', 'ls-tree', 'merge-base', 'rev-list', 'for-each-ref', 'show-ref', 'symbolic-ref', 'update-ref', 'ls-remote', 'remote', 'commit-tree', 'hash-object', 'branch', 'log']);

function safeArgs(repo: string, args: readonly string[], content: GitContent): string[] {
  const prefix = ['-c', `safe.directory=${repo.replaceAll(BACKSLASH, '/')}`, ...ALWAYS, '-C', repo];
  if (content === 'owner') return prefix;
  const operation = args[operationIndex(args)];
  if (operation !== undefined && OBJECT_AND_REF_ONLY.has(operation)) return prefix;
  const remembered = pinsByRepo ?? commandPins;
  const known = remembered?.get(repo);
  if (known !== undefined) return [...prefix, ...known];
  // Filters and merge drivers are configured by name, so silencing them means
  // reading the names; each is overridden for this invocation, never in shared
  // configuration.
  const config = spawnSync(gitProgram(), [...prefix, 'config', '--name-only', '--get-regexp', '^(filter\\..*\\.(clean|smudge|process|required)|merge\\..*\\.driver)$'], { encoding: 'utf8', env: gitEnvironment(), windowsHide: true });
  if (config.error !== undefined || config.status !== 0 && config.status !== 1) throw new GitFailed('Git configuration could not be read safely; nothing was run');
  const pins = ['-c', 'merge.default=text'];
  for (const key of (config.stdout ?? '').split('\n').filter(Boolean)) {
    pins.push('-c', `${key}=${key.endsWith('.required') ? 'false' : ''}`);
  }
  remembered?.set(repo, pins);
  return [...prefix, ...pins];
}

function run(repo: string, args: readonly string[], env: GitEnv, content: GitContent): GitOutcome {
  let program: string;
  try { program = gitProgram(); }
  catch (error) { return { status: null, stdout: '', stderr: '', error: error instanceof Error ? error : new GitFailed(String(error)) }; }
  const safe = args.map((arg, index) => arg === 'diff' && index === operationIndex(args) ? [arg, '--no-ext-diff', '--no-textconv'] : [arg]).flat();
  const result = spawnSync(program, [...safeArgs(repo, args, content), ...safe], {
    encoding: 'utf8',
    env: gitEnvironment(env),
    windowsHide: true
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '', ...(result.error !== undefined ? { error: result.error } : {}) };
}

function checked(repo: string, args: readonly string[], result: GitOutcome): string {
  if (result.status !== 0 || result.error !== undefined) {
    const detail = (result.stderr || result.stdout || result.error?.message || `exit ${result.status}`).trim();
    throw new GitFailed(`git ${args.join(' ')} failed in ${repo}: ${detail}`);
  }
  return result.stdout.trim();
}

export function gitOutcome(repo: string, args: readonly string[], env: GitEnv = {}): GitOutcome {
  return run(repo, args, env, 'foreign');
}

export function git(repo: string, args: readonly string[], env: GitEnv = {}): string {
  return checked(repo, args, run(repo, args, env, 'foreign'));
}

// The owner's repository and only the owner's own content: see GitContent.
export function ownerGitOutcome(repo: string, args: readonly string[], env: GitEnv = {}): GitOutcome {
  return run(repo, args, env, 'owner');
}

export function ownerGit(repo: string, args: readonly string[], env: GitEnv = {}): string {
  return checked(repo, args, run(repo, args, env, 'owner'));
}

// Write literal bytes as a blob into the object store, returning its sha. stdin
// hashing applies no filters, so the blob is exactly the bytes handed in — used
// by the answer commit, which is built on a temporary index and never the
// worktree.
export function gitWriteBlob(repo: string, bytes: Buffer): string {
  const result = spawnSync(gitProgram(), [...safeArgs(repo, ['hash-object'], 'foreign'), 'hash-object', '-t', 'blob', '-w', '--stdin'], {
    input: bytes,
    env: gitEnvironment(),
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
  // The owner's repository: the dry read answers what the landing merge there
  // would do, so it runs as that merge does.
  const run = ownerGitOutcome(repo, ['merge-tree', '--write-tree', '-z', '--name-only', `--merge-base=${base}`, ours, theirs], { GIT_ATTR_SOURCE: attrSource ?? base });
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
  const found = gitObjectCheck(repo, ['HEAD', theirs]);
  if (found.get('HEAD') === null) {
    return { kind: 'untestable', detail: 'the branch has no commits yet' };
  }
  if (found.get(theirs) === null) {
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
  const result = spawnSync(gitProgram(), [...safeArgs(repo, ['cat-file'], 'foreign'), 'cat-file', 'blob', `${commit}:${path}`], {
    env: gitEnvironment(env),
    maxBuffer: 512 * 1024 * 1024,
    windowsHide: true
  });
  if (result.status !== 0 || result.error !== undefined) return null;
  return result.stdout;
}

// One `cat-file --batch` reads every commit:path blob asked for; a path that is
// not a blob in the tree maps to null, exactly as one `cat-file blob` would.
export function gitBlobs(repo: string, commit: string, paths: readonly string[]): Map<string, Buffer | null> {
  const found = new Map<string, Buffer | null>();
  if (paths.length === 0) return found;
  const result = spawnSync(gitProgram(), [...safeArgs(repo, ['cat-file'], 'foreign'), 'cat-file', '--batch'], {
    input: paths.map(path => `${commit}:${path}`).join('\n') + '\n',
    env: gitEnvironment(),
    maxBuffer: 512 * 1024 * 1024,
    windowsHide: true
  });
  if (result.error !== undefined) throw result.error;
  const stdout = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? '');
  let at = 0;
  for (const path of paths) {
    const headerEnd = stdout.indexOf(10, at);
    const header = headerEnd === -1 ? '' : stdout.toString('utf8', at, headerEnd);
    if (headerEnd === -1 || header.endsWith(' missing')) {
      found.set(path, null);
      at = headerEnd + 1;
      continue;
    }
    const fields = header.trim().split(' ');
    const size = Number(fields[2]);
    const start = headerEnd + 1;
    found.set(path, fields[1] === 'blob' ? stdout.subarray(start, start + size) : null);
    at = start + size + 1; // the content block is followed by one line feed
  }
  return found;
}

// One `cat-file --batch-check` resolves every name — like one `cat-file -e` or
// `rev-parse --verify -q` per name, batched. Missing names map to null; present
// ones to the resolved sha.
export function gitObjectCheck(repo: string, names: readonly string[]): Map<string, string | null> {
  const found = new Map<string, string | null>();
  if (names.length === 0) return found;
  const result = spawnSync(gitProgram(), [...safeArgs(repo, ['cat-file'], 'foreign'), 'cat-file', '--batch-check'], {
    input: names.join('\n') + '\n',
    env: gitEnvironment(),
    encoding: 'utf8',
    windowsHide: true
  });
  const lines = (result.stdout ?? '').split('\n');
  names.forEach((name, index) => {
    const line = lines[index] ?? '';
    found.set(name, line === '' || line.endsWith(' missing') ? null : line.split(' ')[0] ?? null);
  });
  return found;
}

export interface IndexChange {
  /** The entry's mode, or 0 — a zero mode with a null sha removes the path. */
  readonly mode: string;
  readonly sha: string | null;
  readonly path: string;
}

const NO_SHA = '0000000000000000000000000000000000000000';

// One `update-index --index-info -z` applies every listed change to the given
// index file — adds, replaces and removals in the order listed. It is the
// batch form of the per-path `update-index --force-remove` / `--cacheinfo`
// calls; the real index is never in play because callers pin GIT_INDEX_FILE.
export function gitIndexWrite(repo: string, index: string, changes: readonly IndexChange[]): void {
  if (changes.length === 0) return;
  const input = changes.map(change => `${change.sha === null ? `0 ${NO_SHA}` : `${change.mode} ${change.sha}`}\t${change.path}\0`).join('');
  const result = spawnSync(gitProgram(), [...safeArgs(repo, ['update-index'], 'foreign'), 'update-index', '-z', '--index-info'], {
    input,
    env: gitEnvironment({ GIT_INDEX_FILE: index }),
    windowsHide: true
  });
  if (result.status !== 0 || result.error !== undefined) {
    const detail = (result.stderr?.toString() || result.error?.message || `exit ${result.status}`).trim();
    throw new GitFailed(`git update-index --index-info failed in ${repo}: ${detail}`);
  }
}

// One `update-ref --stdin` applies every listed ref update or delete — the
// batch form of per-ref `update-ref` / `update-ref -d` calls. A delete of a
// missing ref is a no-op, matching `update-ref -d` on an absent name.
export type RefWrite = { readonly delete: string } | { readonly update: string; readonly sha: string };

export function gitRefsWrite(repo: string, writes: readonly RefWrite[]): void {
  if (writes.length === 0) return;
  const input = writes.map(write => 'delete' in write ? `delete ${write.delete}` : `update ${write.update} ${write.sha}`).join('\n') + '\n';
  const result = spawnSync(gitProgram(), [...safeArgs(repo, ['update-ref'], 'foreign'), 'update-ref', '--stdin'], {
    input,
    env: gitEnvironment(),
    windowsHide: true
  });
  if (result.status !== 0 || result.error !== undefined) {
    const detail = (result.stderr?.toString() || result.error?.message || `exit ${result.status}`).trim();
    throw new GitFailed(`git update-ref --stdin failed in ${repo}: ${detail}`);
  }
}
