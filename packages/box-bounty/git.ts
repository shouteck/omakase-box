import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, resolve } from 'node:path';
import { resolveProgram } from '../box-package/commands.js';
import { BountyRefused } from './errors.js';

// The least Git the tool runs on: merges and dry merges pin GIT_ATTR_SOURCE
// (git 2.40) so a solver-carried .gitattributes can name nothing, and the dry
// merge itself is `merge-tree --write-tree` (git 2.38). The pin is the
// binding requirement. Probed once per process — `git version` is the only
// way to ask, and it is one spawn a command pays only when it uses Git.
export const GIT_LEAST = '2.40';

let pinnedGit: string | undefined;
export function gitProgram(): string {
  if (pinnedGit !== undefined) return pinnedGit;
  let program: string;
  try { program = resolve(resolveProgram('git').path); }
  catch { throw new BountyRefused('git-missing', `Git ${GIT_LEAST} or later is required — none was found on PATH. Get it at https://git-scm.com`); }
  const probe = spawnSync(program, ['version'], { encoding: 'utf8', windowsHide: true });
  const found = /git version (\d+)\.(\d+)/.exec(probe.stdout ?? '');
  if (probe.error !== undefined || probe.status !== 0 || found === null) {
    throw new BountyRefused('git-missing', `Git ${GIT_LEAST} or later is required — the program at ${program} did not answer 'git version'. Get it at https://git-scm.com`);
  }
  const major = Number(found[1]); const minor = Number(found[2]);
  if (major < 2 || major === 2 && minor < 40) {
    throw new BountyRefused('git-too-old', `Git ${GIT_LEAST} or later is required — found git ${found[1]}.${found[2]}. Get it at https://git-scm.com`);
  }
  pinnedGit = program;
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
// merge-driver names — and every configured command a merge could run — are
// read once per repository path instead of before every call. The CLI is one
// command per process and says so for the whole process; a library caller gets
// the same for the length of each command it calls (asOneCommand), and nothing
// is remembered from one command to the next. A bare call outside any command
// — a test that edits configuration between two calls — still reads before
// each call.
interface ConfigEntry { readonly origin: string; readonly key: string; readonly value: string }

let pinsByRepo: Map<string, readonly ConfigEntry[]> | null = null;
export function readGitPinsOncePerProcess(): void { pinsByRepo ??= new Map(); }
let commandPins: Map<string, readonly ConfigEntry[]> | null = null;
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

// The one configuration read a command makes: every key the foreign pins
// empty, plus the keys the unsafe-command check below evaluates — config
// includes, the attributes file, and git aliases (a configured command that
// runs `git` can reach one). `git config` reads files only; nothing it reads
// runs. --show-origin makes each entry carry the file it was set in, so a
// relative include or attributes path can be resolved against the including
// file's directory exactly as Git resolves it — and the include chain is
// already followed, to any depth, by git itself.
const CONFIG_KEYS = '^(filter\\..*\\.(clean|smudge|process|required)|merge\\..*\\.driver|include\\.path|includeif\\..*\\.path|core\\.attributesfile|alias\\..*|remote\\..*\\.(url|pushurl)|url\\..*\\.(insteadof|pushinsteadof))$';
const PIN_KEYS = /^(filter\..*\.(clean|smudge|process|required)|merge\..*\.driver)$/;

export function commandConfig(repo: string): readonly ConfigEntry[] {
  const remembered = pinsByRepo ?? commandPins;
  const known = remembered?.get(repo);
  if (known !== undefined) return known;
  const config = spawnSync(gitProgram(), ['-c', `safe.directory=${repo.replaceAll(BACKSLASH, '/')}`, ...ALWAYS, '-C', repo, 'config', '-z', '--show-origin', '--get-regexp', CONFIG_KEYS], { encoding: 'utf8', env: gitEnvironment(), windowsHide: true });
  if (config.error !== undefined || config.status !== 0 && config.status !== 1) throw new GitFailed('Git configuration could not be read safely; nothing was run');
  // With -z each record is `origin\0 key\nvalue\0` — alternating fields.
  const entries: ConfigEntry[] = [];
  let origin = '';
  for (const field of (config.stdout ?? '').split('\0')) {
    if (field === '') continue;
    if (!field.includes('\n')) { origin = field; continue; }
    const nl = field.indexOf('\n');
    entries.push({ origin, key: field.slice(0, nl), value: field.slice(nl + 1) });
  }
  remembered?.set(repo, entries);
  return entries;
}

// These read or write objects and refs only — never working-tree content, never
// the index — so no filter or merge driver can run in them and the foreign pins
// need no configuration read. A saving only: anything not listed is pinned.
const OBJECT_AND_REF_ONLY = new Set(['rev-parse', 'cat-file', 'ls-tree', 'merge-base', 'rev-list', 'for-each-ref', 'show-ref', 'symbolic-ref', 'update-ref', 'ls-remote', 'remote', 'commit-tree', 'hash-object', 'branch', 'log']);

function safeArgs(repo: string, args: readonly string[], content: GitContent): string[] {
  const prefix = ['-c', `safe.directory=${repo.replaceAll(BACKSLASH, '/')}`, ...ALWAYS, '-C', repo];
  if (content === 'owner') return prefix;
  const operation = args[operationIndex(args)];
  if (operation !== undefined && OBJECT_AND_REF_ONLY.has(operation)) return prefix;
  // Filters and merge drivers are configured by name, so silencing them means
  // reading the names; each is overridden for this invocation, never in shared
  // configuration. The read is the same one the unsafe-command check uses, so
  // that check costs no extra process start.
  const pins = ['-c', 'merge.default=text'];
  for (const { key } of commandConfig(repo)) {
    if (PIN_KEYS.test(key)) pins.push('-c', `${key}=${key.endsWith('.required') ? 'false' : ''}`);
  }
  return [...prefix, ...pins];
}

function run(repo: string, args: readonly string[], env: GitEnv, content: GitContent): GitOutcome {
  let program: string;
  try { program = gitProgram(); }
  catch (error) {
    // A named refusal (git missing or too old) stays a refusal — the command
    // exits 3 with its name, not a generic failure.
    if (error instanceof BountyRefused) throw error;
    return { status: null, stdout: '', stderr: '', error: error instanceof Error ? error : new GitFailed(String(error)) };
  }
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
// That includes the operands a program runs, not only the program word —
// a command can be reached through another program's operand (find -exec,
// xargs, env, ssh, wsl, stdbuf, …) or carried inside an option's value
// (--use-compress-program=, tar -I, git -c), and the set of such programs
// is unbounded, so the check sits on the operand, not on a program table.
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
  'busybox', 'sudo', 'doas', 'start', 'runas',
  // Remote and cross-environment shells: the next operand is a host, not a
  // file, so the file-operand rule refuses them outright — the safe side.
  'ssh', 'wsl', 'plink'
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
  // The same configuration read the pin layer makes — one `git config` a
  // command shares, so the check adds no process start of its own. `git
  // config` reads files only; nothing it reads runs.
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
  // A bare operand word that exists inside the tree can be the program a
  // launcher execs — the working directory is in Windows' own search order
  // and `.exe`/`.cmd` spellings resolve too — so existence places it inside.
  const existsInTree = (token: string): boolean =>
    exists(token) || ['.exe', '.com', '.bat', '.cmd'].some(ext => exists(token + ext));
  const programOnDisk = (name: string): string | null => {
    try { return realpathSync(resolveProgram(name).path); }
    catch { return null; }
  };
  // A configured path inside a `git -c name=value` operand has no origin
  // file — a relative one cannot be placed.
  const pathDetail = (value: string): string | null => unsafeDetail(value, '', inside, repo);
  const place = { pathy, inside, exists, existsInTree, programOnDisk, pathDetail };
  // Aliases come from the same configuration read — a configured command
  // that invokes `git` can reach one.
  const aliases = new Map<string, string>();
  for (const { key, value } of commandConfig(repo)) {
    const alias = /^alias\.(.+)$/i.exec(key);
    if (alias !== null) aliases.set(alias[1]!.toLowerCase(), value);
  }
  const found: UnsafeConfigCommand[] = [];
  const checkKeys = new RegExp(COMMAND_KEYS, 'i');
  for (const { origin, key, value } of commandConfig(repo)) {
    if (!checkKeys.test(key)) continue;
    if (PATH_KEYS.test(key)) {
      const detail = unsafeDetail(value.trim(), origin, inside, repo);
      if (detail !== null) found.push({ key, command: value.trim(), detail });
      continue;
    }
    const detail = unsafeCommandDetail(value, place, aliases, 0);
    if (detail !== null) found.push({ key, command: value, detail });
  }
  return found;
}

// The directory a relative include or attributes path resolves against: the
// directory of the file the entry was set in, exactly as Git resolves it.
// A file origin can be repo-relative (`file:.git/config`) or absolute; a
// non-file origin (command line, stdin, blob) has no directory.
function originDir(origin: string, repo: string): string | null {
  const file = /^file:(.*)$/.exec(origin)?.[1];
  if (file === undefined || file === '') return null;
  return dirname(isAbsolute(file) ? file : resolve(repo, file));
}

// The value of an include.* / core.attributesFile key is a path, not a
// command line: refuse when it lands inside the repository (a merge rewrites
// what the tool's Git will read next) or when it cannot be placed at all.
// `~` expands the way Git expands it — `~/...` into a repository under the
// owner's home lands inside, it is not waved out. Git itself follows the
// include chain to any depth and reports each entry's own origin file, so a
// nested include resolves against its file's directory the same way.
function unsafeDetail(value: string, origin: string, inside: (token: string) => boolean, repo: string): string | null {
  if (value === '') return null;
  if (WINDOWS_ENV.test(value) || ENV_REFERENCE.test(value)) return `${value} cannot be placed inside or outside the repository`;
  let expanded = value;
  if (expanded === '~' || /^~[\\/]/.test(expanded)) expanded = resolve(homedir(), expanded.replace(/^~[\\/]?/, ''));
  else if (expanded.startsWith('~')) return `${value} cannot be placed inside or outside the repository`;
  if (isAbsolute(expanded)) return inside(expanded) ? `${value} resolves inside the repository` : null;
  const base = originDir(origin, repo);
  if (base === null) return `${value} cannot be placed inside or outside the repository`;
  return inside(resolve(base, expanded)) ? `${value} resolves inside the repository` : null;
}

// Programs that read what to run from a manifest file rather than from an
// argument — package.json scripts, Makefile, justfile, Taskfile, Rakefile.
// The manifest is the operand; when it resolves inside the repository (its
// default always does — the working directory is the merge's tree) or
// cannot be placed, the line refuses. Only an explicit file operand placed
// outside the tree lets it land.
const LAUNCHERS = new Map([
  ['npm', 'package.json'], ['npx', 'package.json'], ['pnpm', 'package.json'], ['yarn', 'package.json'],
  ['make', 'Makefile'], ['just', 'justfile'], ['task', 'Taskfile.yml'], ['rake', 'Rakefile']
]);
// The option spellings that give a launcher an explicit manifest operand —
// the file (or the directory holding it) it reads its program from instead
// of the working directory's. The table is per launcher: one generic set
// already drifted once (`-f` is make's makefile flag but npm's --force),
// and a flag wrongly treated as manifest-locating lands a launcher that
// still reads the in-tree manifest. A missing real flag refuses instead —
// the safe direction.
const LAUNCHER_MANIFEST_FLAGS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['npm', new Set(['--prefix', '--cwd'])],
  ['npx', new Set(['--prefix', '--cwd'])],
  ['pnpm', new Set(['-C', '--dir'])],
  ['yarn', new Set(['--cwd'])],
  ['make', new Set(['-f', '--file', '--makefile', '-C', '--directory'])],
  ['just', new Set(['--justfile', '--working-directory'])],
  ['task', new Set(['-t', '--taskfile', '-d', '--dir'])],
  ['rake', new Set(['-f', '--rakefile'])]
]);
// `git` flags whose next word is an operand, not an option: -c/--config/
// --config-env inject a `name=value` config entry (an alias can be armed
// inline); -C changes the directory a subcommand runs against.
const GIT_OPERAND_FLAGS = new Set(['-c', '-C', '--config', '--config-env']);

// Split a configured line into the individual commands Git hands to
// `sh -c`. An unquoted ;, |, &&, &, (, ), backtick, newline, $(), <() or
// >() starts a new command — a `git` (or any program) reached after one of
// these is a first token again and gets the full check. Redirection
// targets (>, <) are split the same way so their paths are placed; the
// fd-duplication forms >& and <& are not separators. Quotes are honoured:
// inside '…' everything is literal; inside "…" a separator is data too —
// only $() and ` still substitute, so only they can open a new command.
function shellCommands(command: string): string[] {
  const commands: string[] = [];
  let current = '';
  let quote = '';
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i]!;
    const next = command[i + 1];
    const prev = command[i - 1];
    if (quote === "'") { current += ch; if (ch === "'") quote = ''; continue; }
    if (quote === '"') {
      current += ch;
      if (ch === '"') quote = '';
      else if (ch === '\\' && next !== undefined && '"\\'.includes(next)) { current += next; i += 1; }
      else if (ch === '`' || (ch === '$' && next === '(')) {
        // The substitution still runs inside double quotes — surface its
        // command as a segment of its own.
        commands.push(current);
        current = '';
        quote = '';
        if (ch === '$') i += 1; // swallow the opening (
      }
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; current += ch; continue; }
    const substitution = ch === '`' || ((ch === '$' || ch === '<' || ch === '>') && next === '(');
    const separator = substitution || ch === ';' || ch === '\n' || ch === '|' || ch === '(' || ch === ')'
      || (ch === '&' && next !== '>' && prev !== '>' && prev !== '<')
      || ((ch === '>' || ch === '<') && next !== '&');
    if (!separator) { current += ch; continue; }
    if (ch === '`') { commands.push(current); current = ''; continue; }
    commands.push(current);
    current = '';
    if (ch === '$' || (ch === '<' || ch === '>') && next === '(') i += 1; // swallow the opening (
  }
  commands.push(current);
  return commands;
}

// Tokens of a configured command line, one rule per token class. The first
// word is the program and must place outside the tree; the converse then
// holds for every later word — once the program places outside, every
// operand that decides what executes must itself place or recurse, because
// the program can exec it (find -exec, xargs, env, wsl, stdbuf,
// ssh <host> <cmd> and every program like them — the set is unbounded, so
// the rule is on the operand, not the program):
// - an option's value is a word the program reads itself
//   (--use-compress-program=, tar -I…, git -c): an `=` value or an
//   attached tail is analyzed like an operand word;
// - a quoted word holding a whole line is analyzed as one — a program
//   that re-parses its operand reaches every command inside it;
// - a path-bearing word inside the tree refuses anywhere it stands;
// - a bare word that resolves to a program is a program reached through
//   an operand and arms the checks its own operands need: a `git`'s
//   words name aliases (expanded recursively, `!` expansions as command
//   lines, `-c` operands injected), an interpreter's next word is the
//   file it loads, a launcher's program lives in a manifest;
// - a bare word that exists inside the tree refuses — a Windows exec
//   finds it in the working directory;
// - anything else is data to the command that names it.
//
// Three armed modes carry the rest:
// - an interpreter left with no file operand reads its program from the
//   filtered stream itself (pendingEntry still open at the end) — a
//   `node` or `sh` filter runs the solver's bytes as code;
// - a `git` program's arguments must each name an alias the same
//   configuration read defines — anything else is a builtin or external
//   that can reach programs we cannot place;
// - a launcher (npm, make, just, task, rake…) reads its program from a
//   manifest in the working directory — inside the tree the solution
//   writes — unless a manifest-locating flag for that launcher places
//   the file outside.
function unsafeCommandDetail(command: string, place: { pathy: (t: string) => boolean; inside: (t: string) => boolean; exists: (t: string) => boolean; existsInTree: (t: string) => boolean; programOnDisk: (n: string) => string | null; pathDetail: (value: string) => string | null }, aliases: ReadonlyMap<string, string>, depth: number): string | null {
  if (depth > 8) return 'the command cannot be placed inside or outside the repository';
  const injected = new Map<string, string>();
  let expansions = 0;
  // An option value glued on by `=` or an attached tail is a word the
  // program parses itself. When it could be a command — more than one
  // word, a path, or a name that resolves to a program — it is checked as
  // a command line; a plain word that names nothing executable is data.
  const operandValue = (value: string): string | null => {
    if (value === '') return null;
    // A value holding a whole line is checked as one — but a quoted path
    // with spaces (C:\Program Files\…) is still a single program path:
    // when it exists it places, it is not split on its spaces.
    if (place.pathy(value) && place.exists(value)) {
      if (place.inside(value)) return `${value} resolves inside the repository`;
      const bare = value.split(/[\\/]/).pop()!.replace(/\.(exe|cmd|bat|com|ps1)$/i, '').toLowerCase();
      if (INTERPRETERS.has(bare)) return `${value} is given no file operand — the filtered stream is its program`;
      if (LAUNCHERS.has(bare)) return `${bare} reads its program from ${LAUNCHERS.get(bare)}, which resolves inside the repository`;
      return unsafeCommandDetail(value, place, aliases, depth + 1);
    }
    if (/\s/.test(value) || /[;|&<>`()]/.test(value)) return unsafeCommandDetail(value, place, aliases, depth + 1);
    if (place.pathy(value)) return unsafeCommandDetail(value, place, aliases, depth + 1);
    if (place.programOnDisk(value) !== null || place.existsInTree(value)) return unsafeCommandDetail(value, place, aliases, depth + 1);
    return null;
  };
  for (const segment of shellCommands(command)) {
    const tokens = shellWords(segment);
    let sawProgram = false;
    let pendingEntry = false;
    let interpName = '';
    let gitArgs = false;
    let pendingGitOperand: string | null = null;
    let launcher: string | null = null;
    let pendingManifest = false;
    let launcherPlaced = false;
    // A word that is itself a program — the command's first token or one
    // reached through an operand — arms the checks its own operands need.
    const arm = (bare: string, shown: string): void => {
      gitArgs = bare === 'git';
      launcher = LAUNCHERS.has(bare) ? bare : null;
      pendingEntry = INTERPRETERS.has(bare);
      if (pendingEntry) interpName = shown;
    };
    // A launcher's manifest-locating flag operand, attached or separate.
    const placeManifest = (value: string): string | null => {
      if (place.pathy(value)) {
        if (place.inside(value)) return `${value} resolves inside the repository`;
        launcherPlaced = true;
        return null;
      }
      return place.exists(value)
        ? `${value} resolves inside the repository`
        : `${value} cannot be placed inside or outside the repository`;
    };
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i]!;
      if (token === '' || PLACEHOLDER.test(token)) continue;
      if (WINDOWS_ENV.test(token) || ENV_REFERENCE.test(token)) return `${token} cannot be placed inside or outside the repository`;
      if (pendingGitOperand !== null) {
        const flag = pendingGitOperand;
        pendingGitOperand = null;
        if (flag === '-C') {
          // A directory operand: a relative one resolves in the working
          // directory — inside the tree when the directory exists, and
          // unplaceable when it does not.
          if (place.pathy(token)) {
            if (place.inside(token)) return `${token} resolves inside the repository`;
            continue;
          }
          return place.exists(token)
            ? `${token} resolves inside the repository`
            : `${token} cannot be placed inside or outside the repository`;
        }
        // A `name=value` configuration operand: an alias arms itself
        // inline, a path key resolves like any configured path, a command
        // key is checked as a command line, anything else pathy-inside
        // refuses.
        const eq = token.indexOf('=');
        if (eq === -1) return `${token} cannot be placed inside or outside the repository`;
        const name = token.slice(0, eq).toLowerCase();
        const value = token.slice(eq + 1);
        if (name.startsWith('alias.')) { injected.set(name.slice('alias.'.length), value); continue; }
        if (PATH_KEYS.test(name)) {
          const detail = place.pathDetail(value);
          if (detail !== null) return `${name} = ${detail}`;
          continue;
        }
        if (PIN_KEYS.test(name)) {
          const detail = unsafeCommandDetail(value, place, aliases, depth + 1);
          if (detail !== null) return `${name} = ${detail}`;
          continue;
        }
        if (place.pathy(value) && place.inside(value)) return `${value} resolves inside the repository`;
        continue;
      }
      if (pendingManifest) {
        pendingManifest = false;
        const detail = placeManifest(token);
        if (detail !== null) return detail;
        continue;
      }
      if (gitArgs && GIT_OPERAND_FLAGS.has(token)) { pendingGitOperand = token; continue; }
      const assign = ASSIGNMENT.exec(token);
      if (assign !== null) {
        const value = assign[1]!;
        if (place.pathy(value) && place.inside(value)) return `${value} resolves inside the repository`;
        continue;
      }
      if (/^-{1,2}\S/.test(token) || /^\/[a-zA-Z]+$/.test(token)) {
        // An option token: a launcher's manifest flag, or a value glued to
        // the option by `=` or an attached tail — the program reads it, so
        // it is analyzed like an operand word.
        if (launcher !== null) {
          const flags = LAUNCHER_MANIFEST_FLAGS.get(launcher)!;
          const eq = token.indexOf('=');
          const name = eq === -1 ? token : token.slice(0, eq);
          if (flags.has(name)) {
            if (eq === -1) { pendingManifest = true; continue; }
            const detail = placeManifest(token.slice(eq + 1));
            if (detail !== null) return detail;
            continue;
          }
          if (token.length > 2 && !token.startsWith('--') && token[0] === '-' && flags.has(token.slice(0, 2))) {
            const detail = placeManifest(token.slice(2));
            if (detail !== null) return detail;
            continue;
          }
        }
        const eq = token.indexOf('=');
        if (token.startsWith('--') && eq > 2) {
          const detail = operandValue(token.slice(eq + 1));
          if (detail !== null) return detail;
          continue;
        }
        if (token[0] === '-' && token[1] !== '-' && token.length > 2) {
          const detail = operandValue(token.slice(2));
          if (detail !== null) return detail;
        }
        continue;
      }
      const bare = token.split(/[\\/]/).pop()!.replace(/\.(exe|cmd|bat|com|ps1)$/i, '').toLowerCase();
      // Quoting makes one word of a whole line — a program that re-parses
      // the operand reaches every command inside it, so it is checked as
      // one. But a quoted path with spaces (C:\Program Files\…) is a single
      // program path when it exists: it is placed, never split.
      if (/\s/.test(token)) {
        if (place.pathy(token) && place.exists(token)) {
          if (place.inside(token)) return `${token} resolves inside the repository`;
          sawProgram = true;
          if (INTERPRETERS.has(bare) || bare === 'git' || LAUNCHERS.has(bare)) arm(bare, token);
          else pendingEntry = false;
          continue;
        }
        const detail = unsafeCommandDetail(token, place, aliases, depth + 1);
        if (detail !== null) return detail;
        continue;
      }
      if (place.pathy(token)) {
        if (place.inside(token)) return `${token} resolves inside the repository`;
        // An outside path operand can still be the program the current one
        // execs — arm what its name says it is.
        sawProgram = true;
        if (INTERPRETERS.has(bare) || bare === 'git' || LAUNCHERS.has(bare)) arm(bare, token);
        else pendingEntry = false;
        continue;
      }
      if (!sawProgram) {
        sawProgram = true;
        arm(bare, token);
        const resolved = place.programOnDisk(token);
        if (resolved === null) return `${token} cannot be placed inside or outside the repository`;
        if (place.inside(resolved)) return `${token} resolves inside the repository at ${resolved}`;
        continue;
      }
      if (gitArgs) {
        // Every argument to a configured `git` invocation has to name an
        // alias the configuration defines — from the same read, or
        // injected by a -c operand — anything else is a builtin or
        // external that can reach programs we cannot place.
        expansions += 1;
        if (expansions > 8) return `${token} cannot be placed inside or outside the repository`;
        const expansion = injected.get(token.toLowerCase()) ?? aliases.get(token.toLowerCase());
        if (expansion === undefined) return `${token} cannot be placed inside or outside the repository`;
        if (expansion.startsWith('!')) {
          const nested = unsafeCommandDetail(expansion.slice(1), place, aliases, depth + 1);
          if (nested !== null) return `${token} → ${nested}`;
          continue;
        }
        tokens.splice(i, 1, ...shellWords(expansion));
        i -= 1;
        continue;
      }
      if (pendingEntry) {
        pendingEntry = false;
        // A bare file name an interpreter loads resolves against the
        // working directory — inside the tree — when the file is there;
        // when it is not, the merge could land it or an interpreter could
        // find it elsewhere, so it cannot be placed either way.
        return place.exists(token)
          ? `${token} resolves inside the repository`
          : `${token} cannot be placed inside or outside the repository`;
      }
      // A bare word that resolves to a program is a program the current
      // one can exec through its operand — arm what it is.
      const resolved = place.programOnDisk(token);
      if (resolved !== null) {
        if (place.inside(resolved)) return `${token} resolves inside the repository at ${resolved}`;
        if (INTERPRETERS.has(bare) || bare === 'git' || LAUNCHERS.has(bare)) arm(bare, token);
        continue;
      }
      // A bare word that exists inside the tree can be the program a
      // launcher finds in the working directory.
      if (place.existsInTree(token)) return `${token} resolves inside the repository`;
      // Otherwise the word is data to the command that names it.
    }
    // A launcher never given an outside operand reads its program from the
    // manifest in the working directory — inside the tree the merge writes.
    if (launcher !== null && !launcherPlaced) return `${launcher} reads its program from ${LAUNCHERS.get(launcher)}, which resolves inside the repository`;
    // An interpreter never given a file operand runs what the filter feeds
    // it: the filtered stream is the program.
    if (pendingEntry) return `${interpName} is given no file operand — the filtered stream is its program`;
  }
  return null;
}
