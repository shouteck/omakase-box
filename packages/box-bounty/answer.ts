import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { runDeclaredCheck } from '../box-package/commands.js';
import type { CheckRecord } from '../box-package/commands.js';
import { BountyRefused } from './errors.js';
import { GitFailed, dryMergeOnto, git, gitBlob, gitOutcome, gitWriteBlob, mergeBase, mergeTree } from './git.js';
import type { DryMerge } from './git.js';
import type { BountyManifest } from './manifest.js';
import { BUILTIN_RULES, loadOwnerList } from './never-ship.js';
import type { NeverShipRule } from './never-ship.js';
import { applicableAttempts, attemptRefName, attemptsOf, dropDurabilityRefs, isOpenStage, loadRecord, persistRecord, refName, transitionTo } from './record.js';
import type { Attempt, AttemptOutcome, BountyRecord } from './record.js';

// `bounty answer` — the return journey. A solver hands back the whole bounty
// folder (`bounty.json` + `repo/`); this module binds it, extracts the change,
// checks it, and writes a report of FACTS — never a verdict. The decision to
// accept or reject is the agent's or the owner's, and it is recorded:
//
//   bind     — bounty.json must name this id and this snapshot.commit, and its
//              bytes must hash to the manifestSha256 the record pinned at
//              create. Anything else is a named refusal, never a crash.
//   extract  — compare repo/ against the manifest's per-file sha256: changed,
//              added, deleted. No diff text, no git inside the answer folder.
//   check    — mechanical bounties recreate the shipped set in a clean
//              directory, apply the change, and run the declared setup+check
//              (and --guard, when one was declared) exactly as `create` did.
//              The check is also re-run on the untouched shipped set: a pass
//              there means the pass on the answer says nothing, and the report
//              flags it. Reviewed bounties run nothing but a declared guard.
//   report   — the check before and after, the guard, the change with counts
//              and lines, a dry merge-tree read of the current code (worktree,
//              index and HEAD untouched), eager flags, what was not checked,
//              and the next command. Every answer is kept as its own attempt.
//
// A passing mechanical answer lands at `verified` and STOPS — apply is a
// separate command. A failing answer is recorded and the bounty returns to
// `posted`, still open. `apply` merges the named attempt with git's own
// three-way machinery — foreign bytes never touch the worktree except through
// `git merge`; a conflict aborts byte-identical and a dirty worktree the merge
// would overwrite is a named refusal made before the merge can run. `undo`
// reverses an applied merge as a new commit.
//
// Failure detail models verify.ts's failure classes: a check or setup that
// cannot run (environment-failure) is not the same state as a check that ran
// and failed (implementation-failure); the class, exit and output tail are
// recorded on the attempt and the event that returns the bounty to `posted`.

const COMMAND_TIMEOUT_MS = 300_000;
const TAIL = 2000;

const sha256 = (buffer: Buffer | string): string => createHash('sha256').update(buffer).digest('hex');
const tail = (text: string): string => text.slice(-TAIL);
const describeCommand = (argv: readonly string[]): string => argv.map(token => (token.includes(' ') ? JSON.stringify(token) : token)).join(' ');

const endedRefusal = (record: BountyRecord): BountyRefused =>
  new BountyRefused('already-ended', `bounty ${record.id} already ended (${record.stage}) — an ended bounty takes no further transitions; the record is its history`);

export interface AnswerChange {
  readonly changed: readonly string[];
  readonly added: readonly string[];
  readonly deleted: readonly string[];
}

interface AnswerFolder {
  readonly manifest: BountyManifest;
  readonly manifestBytes: Buffer;
  readonly repoDir: string;
}

export interface AnswerResult {
  readonly record: BountyRecord;
  /** `verified`: the check exits 0 — waits on a decision. `answered`: no check
      to run. `check-failed`/`check-unrunnable`: recorded, bounty back to open. */
  readonly outcome: AttemptOutcome;
  readonly attempt: number;
  readonly report: readonly string[];
  /** Paths the dry merge flagged, when the answer would not merge cleanly onto
      the current branch right now. */
  readonly conflicts?: readonly string[] | undefined;
}

export interface ApplyResult {
  readonly record: BountyRecord;
  readonly outcome: 'applied' | 'conflict';
  readonly attempt: number;
  readonly mergeCommit?: string | undefined;
  readonly conflicts?: readonly string[] | undefined;
}

export interface UndoResult {
  readonly record: BountyRecord;
  readonly outcome: 'undone';
  /** The new commit that reverses the merge — on the current branch. */
  readonly undoCommit: string;
  /** The merge commit it reverses. */
  readonly reverted: string;
}

function readAnswerFolder(fromDir: string): AnswerFolder {
  const folder = resolve(fromDir);
  if (!existsSync(folder) || !statSync(folder).isDirectory()) {
    throw new BountyRefused('answer-malformed', `--from ${fromDir} is not a directory — the answer is the whole bounty folder handed back`);
  }
  const manifestPath = join(folder, 'bounty.json');
  const repoDir = join(folder, 'repo');
  if (!existsSync(manifestPath)) {
    throw new BountyRefused('answer-malformed', `${manifestPath} does not exist — the answer is the whole bounty folder with its original bounty.json`);
  }
  if (!existsSync(repoDir) || !statSync(repoDir).isDirectory()) {
    throw new BountyRefused('answer-malformed', `${repoDir} does not exist — the answer folder must contain the bounty.json it shipped with and a repo/ tree`);
  }
  const manifestBytes = readFileSync(manifestPath);
  let manifest: BountyManifest | null = null;
  try {
    const parsed = JSON.parse(manifestBytes.toString('utf8')) as BountyManifest;
    if (parsed !== null && typeof parsed === 'object' && parsed.kind === 'box-bounty'
      && typeof parsed.id === 'string' && typeof parsed.snapshot?.commit === 'string'
      && Array.isArray(parsed.files) && parsed.files.every(file => typeof file?.path === 'string' && typeof file?.sha256 === 'string')) {
      manifest = parsed;
    }
  } catch {
    manifest = null;
  }
  if (manifest === null) {
    throw new BountyRefused('answer-malformed', `${manifestPath} is not a readable bounty manifest — hand the folder back with the bounty.json it shipped with`);
  }
  return { manifest, manifestBytes, repoDir };
}

// The change, extracted by comparing repo/ against the manifest's per-file
// sha256 — never a diff text, never git inside the answer. Entries the
// never-ship rules would strip (.git, .box, secrets, keys, and anything the
// owner's .boxignore names — the same table create enforced outbound) and
// links of any kind are refused by name: foreign bytes enter the repository
// only as plain file content through the merge.
export function extractAnswerChange(manifest: BountyManifest, repoDir: string, rules: readonly NeverShipRule[]): AnswerChange {
  const expected = new Map<string, { readonly path: string; readonly sha256: string }>();
  for (const file of manifest.files) expected.set(file.path.toLowerCase(), file);
  const seen = new Set<string>();
  const changed: string[] = [];
  const added: string[] = [];
  const walk = (dir: string, rel: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relPath = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        throw new BountyRefused('answer-unsafe-path', `the returned repo/ holds a link at ${relPath} — an answer carries plain files only; replace it with real content`);
      }
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), relPath);
        continue;
      }
      if (!entry.isFile()) {
        throw new BountyRefused('answer-unsafe-path', `the returned repo/ holds a non-file entry at ${relPath} — an answer carries plain files only`);
      }
      const lower = relPath.toLowerCase();
      const rule = rules.find(candidate => candidate.match(lower));
      if (rule !== undefined) {
        throw new BountyRefused('answer-never-ship', `the returned repo/ contains ${relPath}, which the never-ship rule '${rule.name}' removes — an answer cannot reintroduce what the boundary strips`);
      }
      const bytes = readFileSync(join(dir, entry.name));
      const hit = expected.get(lower);
      seen.add(lower);
      if (hit === undefined) added.push(relPath);
      else if (sha256(bytes) !== hit.sha256) changed.push(hit.path); // land under the manifest's spelling
    }
  };
  walk(repoDir, '');
  const deleted = [...expected.keys()].filter(lower => !seen.has(lower)).map(lower => expected.get(lower)!.path);
  const change = { changed: changed.sort(), added: added.sort(), deleted: deleted.sort() };
  if (change.changed.length === 0 && change.added.length === 0 && change.deleted.length === 0) {
    throw new BountyRefused('answer-empty', `the returned repo/ is byte-identical to what the bounty shipped — a return that changes nothing is no answer. Edit repo/ and hand it back`);
  }
  return change;
}

// The answer commit is seeded from the BASE commit's tree, not the snapshot's:
// the merge's incoming delta must be exactly the solver's change. Seeding from
// the snapshot would drag every uncommitted edit and untracked file that was
// live at create time into the merge, and git would refuse to land it over the
// still-uncommitted worktree — the common case, since snapshotting uncommitted
// work is what `create` is for. Deletions apply only where the base tree has
// the path (a file untracked at create is simply absent again).
//
// `hash-object --stdin` writes the solver's bytes as blobs with no filters;
// update-index places them. The real index, the worktree and the current
// branch are never touched. With an unborn HEAD at create (baseCommit null)
// the snapshot commit itself is the base.
function buildAnswerCommit(repoRoot: string, record: BountyRecord, change: AnswerChange, repoDir: string): string {
  const base = record.snapshot.baseCommit ?? record.snapshot.commit;
  const work = mkdtempSync(join(tmpdir(), 'box-bt3-index-'));
  try {
    const env = { GIT_INDEX_FILE: join(work, 'index') };
    git(repoRoot, ['read-tree', base], env);
    for (const path of change.deleted) {
      if (gitOutcome(repoRoot, ['cat-file', '-e', `${base}:${path}`]).status === 0) {
        git(repoRoot, ['update-index', '--force-remove', '--', path], env);
      }
    }
    for (const path of [...change.changed, ...change.added]) {
      const blob = gitWriteBlob(repoRoot, readFileSync(join(repoDir, ...path.split('/'))));
      git(repoRoot, ['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`], env);
    }
    const tree = git(repoRoot, ['write-tree'], env);
    return git(repoRoot, [
      '-c', 'user.name=box-bounty', '-c', 'user.email=box-bounty@localhost',
      'commit-tree', tree, '-p', base,
      '-m', `box-bounty answer ${record.id}\n\nmade against snapshot ${record.snapshot.commit}\n${change.changed.length} changed, ${change.added.length} added, ${change.deleted.length} deleted`
    ], env);
  } finally {
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
}

const runOne = (argv: readonly string[], name: string, root: string): CheckRecord => {
  const [program, ...args] = argv;
  return runDeclaredCheck({ name, program: program!, args, cwd: '.', context: 'recipient', timeoutMs: COMMAND_TIMEOUT_MS }, root);
};

// Every uncommitted path in the worktree, read under the repository's own
// config — the same view the merge uses. `status --porcelain -z` through
// gitOutcome: the trimming `git()` wrapper would eat the leading space of a
// first-line `' M path'` entry and silently mis-parse it, and -z removes
// quoting and rename arrows. Ignored files are invisible to porcelain by
// design; the ignored-file boundary below covers them.
function porcelainDirty(repoRoot: string): string[] {
  const outcome = gitOutcome(repoRoot, ['status', '--porcelain', '-z']);
  if (outcome.status !== 0) {
    throw new GitFailed(`git status failed in ${repoRoot}: ${(outcome.stderr || outcome.stdout).trim()}`);
  }
  const dirty: string[] = [];
  const entries = outcome.stdout.split('\0');
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]!;
    if (entry.length < 4) continue;
    const path = entry.slice(3);
    if (entry[0] === 'R' || entry[0] === 'C' || entry[1] === 'R' || entry[1] === 'C') i += 1; // -z renames carry the source as a second entry
    dirty.push(path);
  }
  return dirty.sort();
}

const covers = (dirty: string, touched: ReadonlySet<string>): boolean => {
  const lower = dirty.toLowerCase();
  for (const touchedPath of touched) {
    if (lower === touchedPath || (lower.endsWith('/') && touchedPath.startsWith(lower)) || (touchedPath.endsWith('/') && lower.startsWith(touchedPath))) return true;
  }
  return false;
};

// Raw bytes of every path the merge could write — captured before it runs and
// restored after a conflict abort or a refusal, so the worktree comes back
// byte-identical regardless of the host's eol filters. git's own `merge
// --abort` restores index and merge state; it does not promise the worktree
// bytes (a refused merge can smudge files through core.autocrlf mid-attempt),
// which is why the bytes are saved here.
//
// Only FILES are bytes: a `??` porcelain entry can be a directory (`.box/` in
// the default state where no record has ever been committed) — git's --abort
// does not remove untracked directories and the merge cannot smudge one, so
// it is skipped here, not saved as "absent" (restoring that would try to
// delete a live directory). null means the path was not a file before the
// merge — anything the merge left there is removed on restore.
function snapshotBytes(repoRoot: string, paths: ReadonlySet<string>): Map<string, Buffer | null> {
  const saved = new Map<string, Buffer | null>();
  for (const path of paths) {
    const target = join(repoRoot, ...path.split('/'));
    const stat = statSync(target, { throwIfNoEntry: false });
    if (stat?.isDirectory()) continue;
    saved.set(path, stat?.isFile() === true ? readFileSync(target) : null);
  }
  return saved;
}

function restoreBytes(repoRoot: string, saved: ReadonlyMap<string, Buffer | null>): void {
  for (const [path, bytes] of saved) {
    const target = join(repoRoot, ...path.split('/'));
    if (bytes === null) rmSync(target, { force: true, recursive: true }); // the merge may have created a directory tree here
    else { mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes); }
  }
}

// Worktree boundary, checked BEFORE a merge or a revert runs, under the
// repository's own config — the same view the operation itself uses, so a file
// that is clean under this repo's convention (CRLF bytes in an autocrlf
// checkout) never draws a false refusal and a real dirty path is named before
// git can touch it.
//
// Two kinds of blocking work, refused by name together:
//  - uncommitted content on a touched path — porcelain sees it (modified,
//    staged, untracked);
//  - a file that exists at a touched path but is not in the index — an ignored
//    file, invisible to porcelain, which git would overwrite silently. That is
//    clobber, not a merge: refuse first.
function worktreeBlocks(repoRoot: string, deltaPaths: readonly string[], extraTouched: readonly string[]): { blocked: string[]; dirty: string[] } {
  const touched = new Set([...deltaPaths, ...extraTouched].map(path => path.toLowerCase()));
  const dirty = porcelainDirty(repoRoot);
  const tracked = new Set(gitOutcome(repoRoot, ['ls-files', '-z']).stdout.split('\0').filter(name => name !== '').map(name => name.toLowerCase()));
  const blockedDirty = dirty.filter(path => covers(path, touched));
  const blockedDirtyKeys = new Set(blockedDirty.map(path => path.toLowerCase()));
  const blockedClobber = [...new Set(deltaPaths)].filter(path =>
    !blockedDirtyKeys.has(path.toLowerCase()) && !tracked.has(path.toLowerCase())
    && statSync(join(repoRoot, ...path.split('/')), { throwIfNoEntry: false }) !== undefined);
  return { blocked: [...blockedDirty, ...blockedClobber].sort(), dirty };
}

// `apply`: git's own three-way merge lands the chosen attempt's answer commit
// onto the repository as it stands — never raw writes into the worktree. A
// conflict aborts the merge (worktree and index come back byte-identical) and
// the record keeps its stage with the conflicting paths as the next step.
// Uncommitted changes the merge would overwrite are a named refusal, not
// damage. With several attempts that could be applied, `apply` without a
// number refuses and names them — the choice is the agent's.
export function applyBounty(repoRoot: string, id: string, attemptN?: number): ApplyResult {
  const record = loadRecord(repoRoot, id);
  if (!isOpenStage(record.stage)) throw endedRefusal(record);
  const attempts = attemptsOf(record);
  if (attempts.length === 0) {
    throw new BountyRefused('wrong-stage', `bounty ${id} is ${record.stage} — apply merges an answer that has come back; nothing has arrived for this bounty yet`);
  }
  let attempt: Attempt;
  if (attemptN !== undefined) {
    const found = attempts.find(candidate => candidate.n === attemptN);
    if (found === undefined) {
      throw new BountyRefused('unknown-attempt', `bounty ${id} has attempts ${attempts.map(candidate => `#${candidate.n}`).join(', ')} — apply names one of those: box bounty apply ${id} <n>`);
    }
    attempt = found;
  } else {
    const applicable = applicableAttempts(attempts);
    if (applicable.length === 0) {
      throw new BountyRefused('no-applicable-attempt', `every recorded attempt on ${id} failed or could not run its check — name one anyway with box bounty apply ${id} <n>, or end the bounty with box bounty reject ${id} --reason "<why>"`);
    }
    if (applicable.length > 1) {
      throw new BountyRefused('apply-ambiguous', `attempts ${applicable.map(candidate => `#${candidate.n}`).join(', ')} could be applied — pick one: box bounty apply ${id} <n>`);
    }
    attempt = applicable[0]!;
  }
  if (gitOutcome(repoRoot, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']).status === 0) {
    throw new BountyRefused('merge-in-progress', `a merge is already in progress in ${repoRoot} — finish it or run git merge --abort before applying a bounty`);
  }
  const base = mergeBase(repoRoot, 'HEAD', attempt.commit);
  const deltaPaths = base !== null
    ? gitOutcome(repoRoot, ['diff', '--name-only', '-z', base, attempt.commit]).stdout
        .split('\0').filter(name => name !== '')
    : [...attempt.changed, ...attempt.added, ...attempt.deleted];
  const { blocked, dirty } = worktreeBlocks(repoRoot, deltaPaths, [...attempt.changed, ...attempt.added, ...attempt.deleted]);
  if (blocked.length > 0) {
    throw new BountyRefused('apply-worktree-dirty', `uncommitted work in ${blocked.join(', ')} would be overwritten by the merge — commit it, stash it or move it aside, then run box bounty apply ${id} again`);
  }
  const message = [
    `box bounty ${record.id}: ${record.title}`,
    '',
    `attempt: ${attempt.n}`,
    `answer: ${attempt.commit}`,
    `snapshot: ${record.snapshot.commit}`
  ].join('\n');
  // The merge runs under the repository's own config — pinning eol filters off
  // would make every file clean under the repo's convention look modified to
  // the merge and break apply on an ordinary autocrlf checkout. Byte identity
  // on abort is guaranteed by the saved bytes, not by filters: the delta plus
  // every dirty path is captured raw before the merge runs.
  const saved = snapshotBytes(repoRoot, new Set([...deltaPaths, ...dirty]));
  const merged = gitOutcome(repoRoot, [
    '-c', 'user.name=box-bounty', '-c', 'user.email=box-bounty@localhost',
    'merge', '--no-ff', '-m', message, attempt.commit
  ]);
  if (merged.status === 0) {
    const mergeCommit = git(repoRoot, ['rev-parse', 'HEAD']);
    record.conflicts = null;
    transitionTo(repoRoot, record, 'applied', { attempt: attempt.n, command: 'apply', merge: mergeCommit });
    // The bounty ended: every durability ref's work is done — the snapshot's
    // and all the other attempts'.
    dropDurabilityRefs(repoRoot, record);
    return { record, outcome: 'applied', attempt: attempt.n, mergeCommit };
  }
  const mergeHead = gitOutcome(repoRoot, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']);
  if (mergeHead.status === 0) {
    const paths = gitOutcome(repoRoot, ['diff', '--name-only', '-z', '--diff-filter=U']).stdout
      .split('\0').filter(line => line !== '').sort();
    const aborted = gitOutcome(repoRoot, ['merge', '--abort']);
    if (aborted.status !== 0) {
      throw new GitFailed(`git merge --abort failed in ${repoRoot} after a conflict in ${paths.join(', ')}: ${aborted.stderr.trim()} — resolve the merge state by hand`);
    }
    restoreBytes(repoRoot, saved);
    record.conflicts = { paths, at: new Date().toISOString() };
    persistRecord(repoRoot, record);
    return { record, outcome: 'conflict', attempt: attempt.n, conflicts: paths };
  }
  restoreBytes(repoRoot, saved);
  const detail = tail(`${merged.stderr}\n${merged.stdout}`.trim());
  if (/local changes|untracked working tree files|would be overwritten/i.test(detail)) {
    throw new BountyRefused('apply-worktree-dirty', `git merge refused: ${detail}`);
  }
  throw new BountyRefused('merge-failed', `git merge could not land answer ${attempt.commit} on ${repoRoot}: ${detail}`);
}

// `undo`: reverses the merge `apply` made, as a NEW commit that names the
// bounty — history is appended, never rewritten. Two named refusals change
// nothing: the merge is no longer on the current branch's history, or the
// reversal would not apply cleanly (proven dry with merge-tree before anything
// is touched). The same worktree boundary as apply protects uncommitted work.
export function undoBounty(repoRoot: string, id: string): UndoResult {
  const record = loadRecord(repoRoot, id);
  if (record.stage === 'undone') {
    throw new BountyRefused('already-undone', `bounty ${id} was already undone — the reversal is a commit in history; the record keeps both events`);
  }
  if (record.stage !== 'applied') {
    if (!isOpenStage(record.stage)) throw endedRefusal(record);
    throw new BountyRefused('not-applied', `bounty ${id} is ${record.stage} — undo reverses the merge apply made; nothing has been applied to this bounty`);
  }
  const appliedEvent = [...record.events].reverse().find(event => event.stage === 'applied');
  let merge = appliedEvent?.merge;
  if (merge === undefined) {
    // Records applied before this wave name no merge commit — find the merge
    // the same way a person would: the merge commit whose subject names it.
    const found = gitOutcome(repoRoot, ['log', '--merges', '--format=%H', '-n', '20', `--grep=box bounty ${id}:`]);
    merge = found.status === 0 ? found.stdout.split('\n').map(line => line.trim()).find(line => /^[0-9a-f]{40}$/.test(line)) : undefined;
  }
  if (merge === undefined) {
    throw new BountyRefused('undo-unknown-merge', `bounty ${id} was applied but no merge commit can be found for it — find it with git log --grep "bounty ${id}" and revert it by hand`);
  }
  const parents = gitOutcome(repoRoot, ['rev-list', '--parents', '-n', '1', merge]).stdout.trim().split(' ');
  const first = parents.length === 3 ? parents[1] : undefined;
  if (first === undefined) {
    throw new BountyRefused('undo-not-merge', `${merge} is not a merge commit — it cannot be the merge apply made; inspect it by hand`);
  }
  if (gitOutcome(repoRoot, ['merge-base', '--is-ancestor', merge, 'HEAD']).status !== 0) {
    throw new BountyRefused('undo-not-on-branch', `the merge ${merge} is not on the current branch's history — undo only reverses an apply that is still part of HEAD; nothing was changed`);
  }
  const touched = gitOutcome(repoRoot, ['diff', '--name-only', '-z', first, merge]).stdout
    .split('\0').filter(name => name !== '');
  // The reversal commits from the real index, so staged-but-uncommitted work —
  // which the touched-path boundary cannot see as a threat — would be swept
  // into the undo commit. Refuse while the index differs from HEAD. The same
  // worktree boundary as apply protects uncommitted work at a touched path.
  if (gitOutcome(repoRoot, ['diff', '--cached', '--quiet', 'HEAD']).status !== 0) {
    throw new BountyRefused('undo-index-staged', `the index holds staged changes — undo builds its commit from it; commit or unstage that work first, then run box bounty undo ${id} again`);
  }
  const { blocked, dirty } = worktreeBlocks(repoRoot, touched, []);
  if (blocked.length > 0) {
    throw new BountyRefused('undo-worktree-dirty', `uncommitted work in ${blocked.join(', ')} would be overwritten by the reversal — commit it, stash it or move it aside, then run box bounty undo ${id} again`);
  }
  // The reversal applies cleanly? Dry-run the same three-way git would compute
  // for `revert -m 1`: ours = HEAD, theirs = the merge's first parent, base =
  // the merge commit. merge-tree writes only objects — nothing else moves.
  const dry = mergeTree(repoRoot, merge, 'HEAD', first);
  if (dry.kind === 'conflict') {
    throw new BountyRefused('undo-conflict', `reversing the merge would conflict in ${dry.paths.join(', ')} — the working tree, index and branch are untouched; resolve those paths and revert ${merge} by hand, or leave it applied`);
  }
  if (dry.kind === 'untestable') {
    throw new BountyRefused('undo-untestable', `the reversal cannot be tested — ${dry.detail}; nothing was changed`);
  }
  const saved = snapshotBytes(repoRoot, new Set([...touched, ...dirty]));
  const reverted = gitOutcome(repoRoot, ['revert', '--no-commit', '-m', '1', merge]);
  if (reverted.status !== 0) {
    gitOutcome(repoRoot, ['revert', '--quit']);
    gitOutcome(repoRoot, ['reset', '--hard', 'HEAD']);
    restoreBytes(repoRoot, saved);
    throw new GitFailed(`git revert of ${merge} failed in ${repoRoot}: ${(reverted.stderr || reverted.stdout).trim()} — the dry run said clean; inspect the repository by hand`);
  }
  git(repoRoot, [
    '-c', 'user.name=box-bounty', '-c', 'user.email=box-bounty@localhost',
    'commit', '-q', '-m', `box bounty ${id}: undo — ${record.title}\n\nreverses merge ${merge}${appliedEvent?.attempt !== undefined ? ` (attempt ${appliedEvent.attempt})` : ''}`
  ]);
  const undoCommit = git(repoRoot, ['rev-parse', 'HEAD']);
  transitionTo(repoRoot, record, 'undone', {
    ...(appliedEvent?.attempt !== undefined ? { attempt: appliedEvent.attempt } : {}),
    command: 'undo', merge: undoCommit,
    reason: `reverses merge ${merge}`
  });
  return { record, outcome: 'undone', undoCommit, reverted: merge };
}

interface CommandRunFact {
  readonly argv: readonly string[];
  readonly exit: number | null;
  readonly result: 'pass' | 'fail' | 'timeout' | 'error';
  readonly tail: string;
}

const runFact = (argv: readonly string[], name: string, root: string): CommandRunFact => {
  const record = runOne(argv, name, root);
  return { argv: [...argv], exit: record.exit, result: record.result, tail: tail(record.log) };
};

interface AnswerProbe {
  /** null: no setup declared. */
  readonly setup: CommandRunFact | null;
  /** null: no check declared, or it never ran because setup did not pass. */
  readonly check: CommandRunFact | null;
  /** 'not-run': a guard was declared but setup did not pass first. null: none. */
  readonly guard: CommandRunFact | 'not-run' | null;
  /** The check re-run on the untouched shipped set — run only when it passed
      on the answer. A pass there means the answer's pass says nothing. */
  readonly baseline: CommandRunFact | null;
}

// Emits the SHIPPED set — exactly the manifest's file list, raw recorded blob
// bytes, hash-checked — so a corrupt snapshot names itself instead of running
// a phantom tree, and never-ship files inside the snapshot commit never
// materialise for the check.
function emitShipped(repoRoot: string, record: BountyRecord, manifest: BountyManifest, dir: string): void {
  mkdirSync(dir, { recursive: true });
  for (const file of manifest.files) {
    const blob = gitBlob(repoRoot, record.snapshot.commit, file.path);
    if (blob === null || sha256(blob) !== file.sha256) {
      throw new BountyRefused('snapshot-corrupt', `snapshot ${record.snapshot.commit} cannot reproduce ${file.path} at the recorded sha256 — the version this answer was made for is damaged beyond use; end the bounty with box bounty reject ${record.id} --reason "snapshot corrupt"`);
    }
    const target = join(dir, ...file.path.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, blob);
  }
}

// Runs the declared commands on the shipped set plus the answer, exactly as a
// solver would see them: setup, then check, then the optional guard. When the
// check passes on the answer it is run once more on the untouched shipped set
// — a pass there is a flag, not a judgement.
function probeAnswer(record: BountyRecord, manifest: BountyManifest, repoRoot: string, change: AnswerChange, repoDir: string): AnswerProbe {
  const runRoot = mkdtempSync(join(tmpdir(), 'box-bt3a-verify-'));
  try {
    const dir = join(runRoot, 'work');
    emitShipped(repoRoot, record, manifest, dir);
    for (const path of change.deleted) rmSync(join(dir, ...path.split('/')), { force: true });
    for (const path of [...change.changed, ...change.added]) {
      const target = join(dir, ...path.split('/'));
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, readFileSync(join(repoDir, ...path.split('/'))));
    }
    const setupArgv = manifest.setup !== null && manifest.setup.argv.length > 0 ? manifest.setup.argv : null;
    const checkArgv = manifest.check !== null && manifest.check.argv.length > 0 ? manifest.check.argv : null;
    const guardArgv = manifest.guard !== null && manifest.guard !== undefined && manifest.guard.argv.length > 0 ? manifest.guard.argv : null;
    let setup: CommandRunFact | null = null;
    let setupOk = true;
    if (setupArgv !== null) {
      setup = runFact(setupArgv, 'setup', dir);
      setupOk = setup.result === 'pass';
    }
    const check = setupOk && checkArgv !== null ? runFact(checkArgv, 'check', dir) : null;
    const guard: CommandRunFact | 'not-run' | null = guardArgv === null ? null : setupOk ? runFact(guardArgv, 'guard', dir) : 'not-run';
    let baseline: CommandRunFact | null = null;
    if (check !== null && check.result === 'pass' && checkArgv !== null) {
      const clean = join(runRoot, 'baseline');
      emitShipped(repoRoot, record, manifest, clean);
      let baselineSetupOk = true;
      if (setupArgv !== null) baselineSetupOk = runFact(setupArgv, 'setup', clean).result === 'pass';
      if (baselineSetupOk) baseline = runFact(checkArgv, 'check', clean);
    }
    return { setup, check, guard, baseline };
  } finally {
    rmSync(runRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
}

// The stated test-file rule, for the flag: a path counts as a test when a
// segment is `test`, `tests` or `__tests__`, or the basename matches
// `test_*`, `*_test.*`, `*.test.*` or `*.spec.*`.
const isTestPath = (path: string): boolean => {
  const segments = path.toLowerCase().split('/');
  if (segments.slice(0, -1).some(segment => segment === 'test' || segment === 'tests' || segment === '__tests__')) return true;
  const base = segments[segments.length - 1]!;
  return base.startsWith('test_') || /_test\.[^.]+$/.test(base) || /\.(?:test|spec)\.[^.]+$/.test(base);
};

// The stated size rule, for the flag: a change counts as large above 20 files
// or 400 changed lines.
const LARGE_FILES = 20;
const LARGE_LINES = 400;

// Flags are plain observations, deliberately eager: a false alarm costs a
// minute, a missed one costs a wrong fix. No flag blocks anything.
function attemptFlags(manifest: BountyManifest, change: AnswerChange, linesAdded: number, linesRemoved: number, baseline: CommandRunFact | null): string[] {
  const flags: string[] = [];
  const touched = [...change.changed, ...change.added, ...change.deleted];
  const checkText = manifest.check !== null ? manifest.check.argv.join(' ') : '';
  const named = touched.filter(path => checkText !== '' && (checkText.includes(path) || checkText.includes(basename(path))));
  if (named.length > 0) flags.push(`the answer edits ${named.join(', ')}, which the check command's own text names`);
  const testLike = touched.filter(isTestPath);
  if (testLike.length > 0) flags.push(`the answer touches ${testLike.join(', ')}, marked as a test by the stated rule (a test/, tests/ or __tests__/ segment, or a test_*, *_test.*, *.test.* or *.spec.* basename)`);
  if (change.added.length > 0) flags.push(`the answer adds ${change.added.length} file(s)`);
  if (change.deleted.length > 0) flags.push(`the answer deletes ${change.deleted.length} file(s)`);
  if (touched.length > LARGE_FILES || linesAdded + linesRemoved > LARGE_LINES) {
    flags.push(`the change is above the stated size (${LARGE_FILES} files or ${LARGE_LINES} lines): ${touched.length} files, ${linesAdded + linesRemoved} lines`);
  }
  if (baseline !== null && baseline.result === 'pass') {
    flags.push('the check also exits 0 on the untouched snapshot — its pass on this answer says nothing');
  }
  return flags;
}

// Added/removed line counts for the report, from the answer commit's own diff —
// git's read of the solver's delta, not a text diff handed in. A root answer
// (a snapshot with no base commit) diffs against the empty tree.
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
function lineCounts(repoRoot: string, commit: string): { added: number; removed: number; binary: number } {
  const parents = gitOutcome(repoRoot, ['rev-list', '--parents', '-n', '1', commit]).stdout.trim().split(' ');
  const parent = parents.length >= 2 ? parents[1]! : EMPTY_TREE;
  const run = gitOutcome(repoRoot, ['diff', '--numstat', '-z', parent, commit]);
  let added = 0; let removed = 0; let binary = 0;
  for (const entry of run.stdout.split('\0')) {
    if (entry === '') continue;
    const [a, d] = entry.split('\t');
    if (a === '-') binary += 1;
    else { added += Number.parseInt(a ?? '0', 10) || 0; removed += Number.parseInt(d ?? '0', 10) || 0; }
  }
  return { added, removed, binary };
}

// The report of facts. Every line names a command or a comparison it came
// from; nothing here is a verdict, and the last-but-one line always says what
// was not checked.
function renderAttemptReport(record: BountyRecord, manifest: BountyManifest, n: number, change: AnswerChange, probe: AnswerProbe, merge: DryMerge, counts: { added: number; removed: number; binary: number }, stage: BountyRecord['stage'], applicable: readonly Attempt[]): string[] {
  const lines: string[] = [];
  lines.push(`report — attempt ${n} for ${record.id}`);
  const checkArgv = manifest.check !== null ? describeCommand(manifest.check.argv) : null;
  const before = manifest.verification?.check;
  if (checkArgv === null) {
    lines.push('  check: none declared — the listing says a person reads the answer');
  } else if (probe.check === null) {
    lines.push(`  check: ${checkArgv} — could not run, because setup did not pass (${probe.setup?.result ?? 'not run'}${probe.setup?.exit !== null && probe.setup?.exit !== undefined ? `, exit ${probe.setup.exit}` : ''})`);
  } else {
    const beforeText = before === null || before === undefined ? 'no run recorded at create' : `exited ${before.exit} at create`;
    lines.push(`  check: ${checkArgv} — ${beforeText}; on the answer it ${probe.check.result === 'pass' ? 'exits 0' : probe.check.result === 'fail' ? `exits ${probe.check.exit}` : `could not run (${probe.check.result})`}`);
    if (probe.check.result !== 'pass' && probe.check.tail !== '') {
      lines.push('  check output tail:');
      for (const line of probe.check.tail.split('\n').slice(-6)) lines.push(`    ${line}`);
    }
  }
  if (manifest.guard === null || manifest.guard === undefined) {
    lines.push('  guard: none declared for this bounty');
  } else if (probe.guard === 'not-run') {
    lines.push(`  guard: ${describeCommand(manifest.guard.argv)} — was not run; setup did not pass`);
  } else if (probe.guard !== null) {
    lines.push(`  guard: ${describeCommand(manifest.guard.argv)} — ${probe.guard.result === 'pass' ? 'exits 0' : probe.guard.result === 'fail' ? `exits ${probe.guard.exit}` : `could not run (${probe.guard.result})`} on the answer`);
  }
  lines.push(`  change: ${change.changed.length} changed, ${change.added.length} added, ${change.deleted.length} deleted — ${counts.added} lines added, ${counts.removed} removed${counts.binary > 0 ? ` (${counts.binary} binary file(s))` : ''}`);
  if (merge.kind === 'clean') {
    lines.push('  current code: the answer would merge cleanly onto the current branch');
  } else if (merge.kind === 'conflict') {
    lines.push(`  current code: merging onto the current branch would conflict in ${merge.paths.join(', ')}`);
  } else {
    lines.push(`  current code: cannot tell — ${merge.detail}`);
  }
  const flags = attemptFlags(manifest, change, counts.added, counts.removed, probe.baseline);
  if (flags.length === 0) lines.push('  flags: none');
  else for (const flag of flags) lines.push(`  flag: ${flag}`);
  lines.push("  not checked: this report states the declared commands' exits and a merge read only — it says nothing about behaviour those commands do not cover");
  if (stage === 'verified' || stage === 'answered') {
    const pick = applicable.length === 1 ? ` ${applicable[0]!.n}` : ' <n>';
    lines.push(`  next: box bounty apply ${record.id}${pick} — or box bounty reject ${record.id} --reason "<why>"`);
  } else {
    lines.push(`  next: the bounty is open again — box bounty answer ${record.id} --from <dir> when another answer arrives, or box bounty reject ${record.id} --reason "<why>" to end it`);
  }
  return lines;
}

// `answer <id> --from <dir>`: bind, extract, check, report. The bounty stays
// open — `posted` waiting, `answered`/`verified` waiting on a decision — and
// each answer is kept as its own attempt. taken → answered events record the
// arrival; the resulting stage is derived from the best attempt: verified when
// a check passed, answered when none was declared, posted again when nothing
// applies.
export function answerBounty(repoRoot: string, id: string, fromDir: string): AnswerResult {
  const record = loadRecord(repoRoot, id);
  if (!isOpenStage(record.stage)) throw endedRefusal(record);
  if (record.stage !== 'posted' && record.stage !== 'taken' && record.stage !== 'answered' && record.stage !== 'verified') {
    throw new BountyRefused('not-posted', `bounty ${id} is ${record.stage}, not posted — an answer can only come back to a bounty that was delivered (box bounty post ${id} --to <dir>)`);
  }
  const { manifest, manifestBytes, repoDir } = readAnswerFolder(fromDir);
  if (manifest.id !== id) {
    throw new BountyRefused('answer-mismatch', `the returned bounty.json names ${manifest.id}, not ${id} — this answer belongs to a different bounty`);
  }
  if (manifest.snapshot.commit !== record.snapshot.commit) {
    throw new BountyRefused('snapshot-mismatch', `the returned bounty.json pins snapshot ${manifest.snapshot.commit} but ${id} was made for ${record.snapshot.commit} — the answer does not match the version it must land on`);
  }
  if (record.manifestSha256 !== undefined && sha256(manifestBytes) !== record.manifestSha256) {
    throw new BountyRefused('manifest-tampered', `the returned bounty.json is not byte-identical to the one this bounty shipped — it binds the answer and must come back unmodified; edit repo/ only`);
  }
  // Never-ship applies to the return exactly as it did outbound: built-ins plus
  // the owner's .boxignore. An answer cannot smuggle a path create would have
  // stripped — it is refused by name before anything is extracted.
  const ownerList = loadOwnerList(repoRoot);
  const rules: readonly NeverShipRule[] = ownerList === null ? BUILTIN_RULES : [...BUILTIN_RULES, ownerList.rule];
  const change = extractAnswerChange(manifest, repoDir, rules);
  if (gitOutcome(repoRoot, ['rev-parse', '--verify', '-q', refName(id)]).status !== 0) {
    throw new BountyRefused('snapshot-lost', `refs/box-bounty/${id} is gone — the snapshot this answer was made for can no longer be recreated or merged from. Nothing can come back to this bounty; end it with box bounty reject ${id} --reason "snapshot lost"`);
  }
  const commit = buildAnswerCommit(repoRoot, record, change, repoDir);
  const n = attemptsOf(record).length + 1;
  // Pin the attempt commit before recording anything — a crash between loses
  // nothing the record names.
  git(repoRoot, ['update-ref', attemptRefName(id, n), commit]);
  transitionTo(repoRoot, record, 'taken', { attempt: n, command: 'answer' });
  transitionTo(repoRoot, record, 'answered', { attempt: n });
  record.conflicts = null;

  const probe = probeAnswer(record, manifest, repoRoot, change, repoDir);
  let outcome: AttemptOutcome;
  let detail: string | null = null;
  if (manifest.check === null || manifest.check.argv.length === 0) {
    outcome = 'answered'; // reviewed: there is no check to run — nothing claims one
  } else if (probe.check === null) {
    outcome = 'check-unrunnable';
    detail = `environment-failure: setup '${describeCommand(manifest.setup?.argv ?? [])}' ${probe.setup !== null && (probe.setup.result === 'error' || probe.setup.result === 'timeout') ? `could not run (${probe.setup.result})` : `exited ${probe.setup?.exit}`} — ${probe.setup?.tail ?? ''}`;
  } else if (probe.check.result === 'error' || probe.check.result === 'timeout') {
    outcome = 'check-unrunnable';
    detail = `environment-failure: check '${describeCommand(manifest.check.argv)}' could not run (${probe.check.result}) — ${probe.check.tail}`;
  } else if (probe.check.result !== 'pass') {
    outcome = 'check-failed';
    detail = `implementation-failure: check '${describeCommand(manifest.check.argv)}' exited ${probe.check.exit} on the snapshot it was made for — ${probe.check.tail}`;
  } else {
    outcome = 'verified';
  }

  const merge = dryMergeOnto(repoRoot, commit);
  const counts = lineCounts(repoRoot, commit);
  const attempt: Attempt = {
    n,
    at: new Date().toISOString(),
    commit,
    changed: change.changed,
    added: change.added,
    deleted: change.deleted,
    outcome,
    conflicts: merge.kind === 'conflict' ? merge.paths : null,
    report: []
  };
  const attempts = [...attemptsOf(record), attempt];
  const applicable = applicableAttempts(attempts);
  const stage = applicable.length > 0
    ? (attempts.some(candidate => candidate.outcome === 'verified') ? 'verified' : 'answered')
    : 'posted';
  const report = renderAttemptReport(record, manifest, n, change, probe, merge, counts, stage, applicable);
  record.attempts = [...attempts.slice(0, -1), { ...attempt, report }];
  // The arrival event already landed the bounty at `answered`; a reviewed
  // bounty derives `answered` again — the same stage is not a transition.
  if (stage !== 'answered') {
    transitionTo(repoRoot, record, stage, {
      attempt: n,
      command: 'answer',
      ...(detail !== null ? { reason: `attempt ${n}: ${detail}` } : {})
    });
  } else {
    persistRecord(repoRoot, record);
  }
  return { record, outcome, attempt: n, report, ...(merge.kind === 'conflict' ? { conflicts: merge.paths } : {}) };
}
