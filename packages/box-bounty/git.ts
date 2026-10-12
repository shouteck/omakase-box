import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
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

// The blob `git add` would store for `path` from these working-tree bytes —
// the clean filter, eol and ident rules applied exactly as a real commit
// applies them. This is owner content hashed under the owner's configuration,
// so the owner's filters run as in plain Git (GitContent 'owner'): a
// work-in-progress commit then holds the same filtered bytes `create` ships
// out of the snapshot commit. A required filter that cannot run fails the
// hash — the raw working-tree form is never a fallback.
export function gitFilteredBlob(repo: string, path: string, bytes: Buffer): string {
  const result = spawnSync(gitProgram(), [...safeArgs(repo, ['hash-object'], 'owner'), 'hash-object', '-w', '--stdin', `--path=${path}`], {
    input: bytes,
    env: gitEnvironment(),
    windowsHide: true
  });
  if (result.status !== 0 || result.error !== undefined) {
    const detail = ((result.stderr?.toString() ?? result.error?.message ?? `exit ${result.status}`)).trim();
    throw new GitFailed(`git hash-object --path=${path} failed in ${repo}: ${detail}`);
  }
  return result.stdout.toString().trim();
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

// ---------------------------------------------------------------------------
// Could a merge or checkout on the owner's tree run a program a solution
// supplies or changes? The tool never writes Git configuration, but the
// owner's configuration is theirs to write — and a configured command whose
// program lives inside the repository is replaced by whatever the merge
// lands, then run on the files the merge writes after it. What a program
// reads cannot be bounded (a program the solution leaves alone can call a
// second file the solution does change), so the rule is positional, not
// clever: a configured command is unsafe when a token that decides what runs
// resolves inside the working tree, or when the tool cannot place it at all.
//
// The channels are the ones Git's documentation names for merge and checkout:
//   filter.<name>.clean / .smudge / .process   (gitattributes "filter")
//   merge.<name>.driver                        (gitattributes "merge")
//   include.path / includeIf.<cond>.path / core.attributesFile
//   — not commands, but files that decide which commands and selections
//     apply; a merge can rewrite them like any other file.
// Channels Git runs but the tool pins closed on every call are not checked:
// hooks (core.hooksPath), signing (commit/tag.gpgSign, gpg.program),
// fsmonitor, external diff and textconv (diff.external, --no-ext-diff,
// --no-textconv — and a merge's own diffstat runs no driver), maintenance and
// gc. Editors and pagers never start — every message is -m and output is a
// pipe, never a tty. ssh, askpass and credential helpers run only for
// transport, which a merge is not.
// ---------------------------------------------------------------------------
export interface UnsafeConfigCommand {
  /** The configuration key, e.g. filter.own.smudge. */
  readonly key: string;
  /** Its configured command line, or the path for include/attributes keys. */
  readonly command: string;
  /** The fact that makes it unsafe, e.g. "tools/filter.cjs resolves inside the repository". */
  readonly detail: string;
}

const COMMAND_KEYS = '^(filter\\..*\\.(clean|smudge|process)|merge\\..*\\.driver|include\\.path|includeif\\..*\\.path|core\\.attributesfile)$';
const PATH_KEYS = /^(include\.path|includeif\..*\.path|core\.attributesfile)$/i;
// git's own placeholders (%f, %O %A %B %L %P %S %X, %%), never program names.
const PLACEHOLDER = /^%[a-zA-Z%]/;
const WINDOWS_ENV = /^%[^%\s]+%$/;
const ENV_REFERENCE = /\$\{|\$\(|\$[A-Za-z_]/;
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=(.*)$/;
const DRIVE = /^[A-Za-z]:[\\/]/;
// Programs that load another file or command line — their non-option
// arguments decide what runs as surely as the program token itself.
const INTERPRETERS = new Set([
  'sh', 'bash', 'zsh', 'dash', 'ash', 'ksh', 'csh', 'tcsh', 'fish',
  'cmd', 'command', 'powershell', 'pwsh', 'cscript', 'wscript', 'mshta',
  'node', 'nodejs', 'deno', 'bun', 'python', 'python2', 'python3', 'pypy',
  'perl', 'ruby', 'php', 'lua', 'awk', 'gawk', 'mawk', 'sed', 'julia', 'tclsh',
  'rscript', 'expect', 'osascript', 'groovy',
  'env', 'exec', 'xargs', 'nice', 'nohup', 'timeout', 'time', 'ionice',
  'busybox', 'sudo', 'doas', 'start', 'runas'
]);

// Shell words with ' and " quoting honoured (the quote characters are
// dropped). What git hands to the shell is one line; this only needs to find
// the tokens that name files or programs.
function shellWords(command: string): string[] {
  const words: string[] = [];
  let current = ''; let quote = '';
  for (const char of command) {
    if (quote !== '') { if (char === quote) quote = ''; else current += char; continue; }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (/\s/.test(char)) { if (current !== '') { words.push(current); current = ''; } continue; }
    current += char;
  }
  if (current !== '') words.push(current);
  return words;
}

export function unsafeOwnerCommands(repo: string): UnsafeConfigCommand[] {
  // A raw config read, not an owner/foreign call: the pin layers would hide
  // exactly the values being asked about (ALWAYS empties diff.external, the
  // foreign pins empty every filter). `git config` reads files only — nothing
  // it reads runs.
  const config = spawnSync(gitProgram(), ['-c', `safe.directory=${repo.replaceAll(BACKSLASH, '/')}`, '-C', repo, 'config', '-z', '--get-regexp', COMMAND_KEYS], {
    encoding: 'utf8', env: gitEnvironment(), windowsHide: true
  });
  if (config.error !== undefined || config.status !== 0 && config.status !== 1) {
    throw new GitFailed('Git configuration could not be read safely; nothing was run');
  }
  let realRoot = resolve(repo);
  try { realRoot = realpathSync(repo); } catch { /* the checkout exists — a resolve miss keeps the lexical form */ }
  const rootKey = `${realRoot.split(BACKSLASH).join('/').toLowerCase().replace(/\/+$/, '')}/`;
  const inside = (token: string): boolean => {
    const resolved = isAbsolute(token) ? resolve(token) : resolve(repo, token);
    let real = resolved;
    try { real = realpathSync(resolved); } catch { /* not there now — a merge could create it */ }
    const key = `${real.split(BACKSLASH).join('/').toLowerCase()}/`;
    return key === rootKey || key.startsWith(rootKey);
  };
  const pathy = (token: string): boolean => token.includes('/') || token.includes(BACKSLASH) || DRIVE.test(token);
  const exists = (token: string): boolean => {
    try { realpathSync(isAbsolute(token) ? token : resolve(repo, token)); return true; }
    catch { return false; }
  };
  const programOnDisk = (name: string): string | null => {
    try { return realpathSync(resolveProgram(name).path); }
    catch { return null; }
  };
  const found: UnsafeConfigCommand[] = [];
  for (const entry of (config.stdout ?? '').split('\0')) {
    if (entry === '') continue;
    const nl = entry.indexOf('\n');
    const key = nl === -1 ? entry : entry.slice(0, nl);
    const value = nl === -1 ? '' : entry.slice(nl + 1);
    if (PATH_KEYS.test(key)) {
      const detail = unsafeDetail(value.trim(), inside);
      if (detail !== null) found.push({ key, command: value.trim(), detail });
      continue;
    }
    const detail = unsafeCommandDetail(value, { pathy, inside, exists, programOnDisk });
    if (detail !== null) found.push({ key, command: value, detail });
  }
  return found;
}

// The value of an include.* / core.attributesFile key is a path, not a
// command line: refuse when it lands inside the repository (a merge rewrites
// what the tool's Git will read next) or when it cannot be placed at all.
function unsafeDetail(value: string, inside: (token: string) => boolean): string | null {
  if (value === '') return null;
  if (/^~[\\/]?/.test(value)) return null; // the owner's home — outside the tree
  if (WINDOWS_ENV.test(value) || ENV_REFERENCE.test(value)) return `${value} cannot be placed inside or outside the repository`;
  if (inside(value)) return `${value} resolves inside the repository`;
  return null;
}

// Tokens of a configured command line. `first` is the program itself; after
// an interpreter or launcher, the next non-option token is the file it loads.
// Path-bearing arguments are checked everywhere — a program the solution
// leaves alone can call a file the solution changes.
function unsafeCommandDetail(command: string, place: { pathy: (t: string) => boolean; inside: (t: string) => boolean; exists: (t: string) => boolean; programOnDisk: (n: string) => string | null }): string | null {
  const tokens = shellWords(command);
  let first = true;
  let interp = false;
  let pendingEntry = false;
  for (const token of tokens) {
    if (token === '' || PLACEHOLDER.test(token)) continue;
    if (WINDOWS_ENV.test(token) || ENV_REFERENCE.test(token)) return `${token} cannot be placed inside or outside the repository`;
    const assign = ASSIGNMENT.exec(token);
    if (assign !== null) {
      const value = assign[1]!;
      if (place.pathy(value) && place.inside(value)) return `${value} resolves inside the repository`;
      continue;
    }
    if (/^-{1,2}\S/.test(token) || /^\/[a-zA-Z]+$/.test(token)) continue; // options and cmd-style /c switches
    const bare = token.split(/[\\/]/).pop()!.replace(/\.(exe|cmd|bat|com|ps1)$/i, '').toLowerCase();
    if (place.pathy(token)) {
      if (place.inside(token)) return `${token} resolves inside the repository`;
      if (first) { first = false; interp = INTERPRETERS.has(bare); pendingEntry = interp; }
      else pendingEntry = false;
      continue;
    }
    if (first) {
      first = false;
      interp = INTERPRETERS.has(bare);
      pendingEntry = interp;
      const resolved = place.programOnDisk(token);
      if (resolved === null) return `${token} cannot be placed inside or outside the repository`;
      if (place.inside(resolved)) return `${token} resolves inside the repository at ${resolved}`;
      continue;
    }
    if (INTERPRETERS.has(bare)) {
      const resolved = place.programOnDisk(token);
      if (resolved === null) return `${token} cannot be placed inside or outside the repository`;
      if (place.inside(resolved)) return `${token} resolves inside the repository at ${resolved}`;
      interp = true; pendingEntry = true;
      continue;
    }
    if (interp && pendingEntry) {
      pendingEntry = false;
      // A bare file name an interpreter loads resolves against the working
      // directory — inside the tree — when the file is there; when it is
      // not, the merge could land it or an interpreter could find it
      // elsewhere, so it cannot be placed either way.
      return place.exists(token)
        ? `${token} resolves inside the repository`
        : `${token} cannot be placed inside or outside the repository`;
    }
    pendingEntry = false;
  }
  return null;
}
