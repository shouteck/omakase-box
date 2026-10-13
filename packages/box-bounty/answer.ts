import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { BountyRefused } from './errors.js';
import { GitFailed, dryMergeOnto, git, gitIndexWrite, gitOutcome, gitWriteBlob, mergeBase, ownerGitOutcome, unsafeOwnerCommands } from './git.js';
import type { DryMerge, IndexChange } from './git.js';
import type { BountyManifest } from './manifest.js';
import { BUILTIN_RULES, loadOwnerList } from './never-ship.js';
import type { NeverShipRule } from './never-ship.js';
import { applicableAttempts, attemptRefName, attemptsOf, dropDurabilityRefs, isOpenStage, loadRecord, persistRecord, refName, transitionTo } from './record.js';
import type { Attempt, BountyRecord } from './record.js';
import { resolveAttempt, syncGitHubDecision } from './github.js';
import { recordFirstMerge } from './settings.js';
// Collecting a solution — the return journey. A solver hands back the whole
// bounty folder (`bounty.json` + `repo/`); this module binds it, extracts the
// change and writes a report of FACTS — never a verdict. Nothing the solution
// carries is ever run: checks were removed on 11 October 2026, and the
// decision to apply, close or wait is the agent's or the owner's, recorded
// either way. `look <id> --from <dir>` collects and shows the change; `apply
// <id> --from <dir>` collects and merges — the same gate either way.
//
//   bind     — bounty.json must name this id and this snapshot.commit, and its
//              bytes must hash to the manifestSha256 the record pinned at
//              create. Anything else is a named refusal, never a crash.
//   extract  — compare repo/ against the manifest's per-file sha256: changed,
//              added, deleted. No diff text, no git inside the answer folder.
//   report   — who sent it and when, the change with counts and lines, a dry
//              merge-tree read of the current code (worktree, index and HEAD
//              untouched), eager flags, the nothing-was-run sentence, and the
//              next command. Every answer is kept as its own numbered attempt.
//
// Every recorded attempt may be applied, whichever account it came from —
// nothing is run, so the outside-author barrier is gone. `apply` merges the
// named attempt with git's own three-way machinery — foreign bytes never
// touch the worktree except through `git merge`; a conflict aborts
// byte-identical and a dirty worktree the merge would overwrite is a named
// refusal made before the merge can run. The merge is one ordinary commit —
// ordinary Git reverses it, no tool command needed.
//
// The merge and the dry merge are the only places foreign trees meet git
// machinery, and they are pinned so nothing a solver wrote runs:
// GIT_ATTR_SOURCE reads attributes from the repository's own HEAD (a returned
// .gitattributes names no filter or merge driver), hooks come from an empty
// directory outside the checkout, the answer commit is built by plumbing with
// no worktree and no filters, and fetch adds --no-recurse-submodules.

const TAIL = 2000;

const sha256 = (buffer: Buffer | string): string => createHash('sha256').update(buffer).digest('hex');
const tail = (text: string): string => text.slice(-TAIL);

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
  /** Always `answered` — checks were removed, so an answer is a recorded
      attempt and nothing more. */
  readonly outcome: 'answered';
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
  readonly firstMergeNotice?: string;
  readonly conflicts?: readonly string[] | undefined;
  /** On a conflict: the solution's files that would have merged cleanly. */
  readonly clean?: readonly string[] | undefined;
  /** On a conflict: commits on this branch since the shared commit that
      touched the clashing files — `sha subject`, oldest last. */
  readonly commits?: readonly string[] | undefined;
  /** On a conflict: the shared commit the facts are measured from. */
  readonly base?: string | undefined;
}

export function readAnswerFolder(fromDir: string): AnswerFolder {
  const folder = resolve(fromDir);
  if (!existsSync(folder) || !statSync(folder).isDirectory()) {
    throw new BountyRefused('answer-malformed', `--from ${fromDir} is not a directory — the solution is the whole bounty folder handed back`);
  }
  const manifestPath = join(folder, 'bounty.json');
  const repoDir = join(folder, 'repo');
  if (!existsSync(manifestPath)) {
    throw new BountyRefused('answer-malformed', `${manifestPath} does not exist — the solution is the whole bounty folder with its original bounty.json`);
  }
  if (!existsSync(repoDir) || !statSync(repoDir).isDirectory()) {
    throw new BountyRefused('answer-malformed', `${repoDir} does not exist — the solution folder must contain the bounty.json it shipped with and a repo/ tree`);
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
        throw new BountyRefused('answer-unsafe-path', `the returned repo/ holds a link at ${relPath} — a solution carries plain files only; replace it with real content`);
      }
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), relPath);
        continue;
      }
      if (!entry.isFile()) {
        throw new BountyRefused('answer-unsafe-path', `the returned repo/ holds a non-file entry at ${relPath} — a solution carries plain files only`);
      }
      const lower = relPath.toLowerCase();
      const rule = rules.find(candidate => candidate.match(lower));
      if (rule !== undefined) {
        throw new BountyRefused('answer-never-ship', `the returned repo/ contains ${relPath}, which the never-ship rule '${rule.name}' removes — a solution cannot reintroduce what the boundary strips`);
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
    throw new BountyRefused('answer-empty', `the returned repo/ is byte-identical to what the bounty shipped — a return that changes nothing is no solution. Edit repo/ and hand it back`);
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
    const changes: IndexChange[] = [];
    // Deletions apply only where the base tree holds the path: one ls-tree
    // over the deleted names answers every `cat-file -e base:path` at once.
    if (change.deleted.length > 0) {
      const present = new Set(gitOutcome(repoRoot, ['ls-tree', '-z', base, '--', ...change.deleted]).stdout
        .split('\0').map(entry => entry.slice(entry.indexOf('\t') + 1)).filter(name => name !== ''));
      for (const path of change.deleted) {
        if (present.has(path)) changes.push({ mode: '0', sha: null, path });
      }
    }
    for (const path of [...change.changed, ...change.added]) {
      const blob = gitWriteBlob(repoRoot, readFileSync(join(repoDir, ...path.split('/'))));
      changes.push({ mode: '100644', sha: blob, path });
    }
    // One index write lands the removals and the new blobs in listed order.
    gitIndexWrite(repoRoot, env.GIT_INDEX_FILE, changes);
    const tree = git(repoRoot, ['write-tree'], env);
    return git(repoRoot, [
      '-c', 'user.name=box-bounty', '-c', 'user.email=box-bounty@localhost',
      'commit-tree', tree, '-p', base,
      '-m', `box-bounty solution ${record.id}\n\nmade against snapshot ${record.snapshot.commit}\n${change.changed.length} changed, ${change.added.length} added, ${change.deleted.length} deleted`
    ], env);
  } finally {
    rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
}

// Every uncommitted path in the worktree, read under the repository's own
// config — the same view the merge uses. `status --porcelain -z` through
// gitOutcome: the trimming `git()` wrapper would eat the leading space of a
// first-line `' M path'` entry and silently mis-parse it, and -z removes
// quoting and rename arrows. Ignored files are invisible to porcelain by
// design; the ignored-file boundary below covers them. `env` pins the
// attribute source — status can run a configured clean filter when it hashes
// a stat-dirty file, and a foreign .gitattributes must never choose one.
function porcelainDirty(repoRoot: string, env?: { readonly GIT_ATTR_SOURCE: string }): string[] {
  const outcome = ownerGitOutcome(repoRoot, ['status', '--porcelain', '-z'], env ?? {});
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
export function snapshotBytes(repoRoot: string, paths: ReadonlySet<string>): Map<string, Buffer | null> {
  const saved = new Map<string, Buffer | null>();
  for (const path of paths) {
    const target = join(repoRoot, ...path.split('/'));
    const stat = statSync(target, { throwIfNoEntry: false });
    if (stat?.isDirectory()) continue;
    saved.set(path, stat?.isFile() === true ? readFileSync(target) : null);
  }
  return saved;
}

export function restoreBytes(repoRoot: string, saved: ReadonlyMap<string, Buffer | null>): void {
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
export function worktreeBlocks(repoRoot: string, deltaPaths: readonly string[], extraTouched: readonly string[], env?: { readonly GIT_ATTR_SOURCE: string }): { blocked: string[]; dirty: string[] } {
  const touched = new Set([...deltaPaths, ...extraTouched].map(path => path.toLowerCase()));
  const dirty = porcelainDirty(repoRoot, env);
  const tracked = new Set(ownerGitOutcome(repoRoot, ['ls-files', '-z'], env ?? {}).stdout.split('\0').filter(name => name !== '').map(name => name.toLowerCase()));
  const blockedDirty = dirty.filter(path => covers(path, touched));
  const blockedDirtyKeys = new Set(blockedDirty.map(path => path.toLowerCase()));
  const blockedClobber = [...new Set(deltaPaths)].filter(path =>
    !blockedDirtyKeys.has(path.toLowerCase()) && !tracked.has(path.toLowerCase())
    && statSync(join(repoRoot, ...path.split('/')), { throwIfNoEntry: false }) !== undefined);
  return { blocked: [...blockedDirty, ...blockedClobber].sort(), dirty };
}

// A number, or a returned folder: `apply <id> <n>` applies attempt n — or
// collects pull request n first when the bounty is posted on GitHub and no
// attempt carries that number — and `apply <id> --from <dir>` collects a
// returned folder and applies the attempt it lands.
export type ApplyTarget = number | { readonly from: string };

// `apply`: git's own three-way merge lands the chosen attempt's answer commit
// onto the repository as it stands — never raw writes into the worktree. A
// conflict aborts the merge (worktree and index come back byte-identical) and
// the record keeps its stage with the conflicting paths as the next step.
// Uncommitted changes the merge would overwrite are a named refusal, not
// damage. With several attempts that could be applied, `apply` without a
// number refuses and names them — the choice is the agent's.
export function applyBounty(repoRoot: string, id: string, target?: ApplyTarget): ApplyResult {
  let record = loadRecord(repoRoot, id);
  if (record.stage === 'applied' && record.github !== undefined) {
    syncGitHubDecision(repoRoot, record);
    const event = [...record.events].reverse().find(entry => entry.command === 'apply' || entry.command === 'merged');
    return { record, outcome: 'applied', attempt: event?.attempt ?? 1, mergeCommit: event?.merge };
  }
  if (!isOpenStage(record.stage)) throw endedRefusal(record);
  let attemptN: number | undefined;
  if (typeof target === 'object' && target !== undefined) {
    // A returned folder collects exactly like `look --from`, then the new
    // attempt is the one the merge proceeds with.
    const collected = answerBounty(repoRoot, id, target.from, undefined, { via: 'apply' });
    record = collected.record;
    attemptN = collected.attempt;
  } else if (typeof target === 'number') {
    attemptN = target;
  }
  let attempt: Attempt;
  if (attemptN !== undefined) {
    // An attempt first; on a GitHub-posted bounty a number it does not know
    // is a pull request — it collects itself under every refusal the old
    // `answer` enforced, before anything is written.
    const resolved = resolveAttempt(repoRoot, record, attemptN, 'apply');
    record = resolved.record;
    attempt = resolved.attempt;
  } else {
    const attempts = attemptsOf(record);
    if (attempts.length === 0) {
      throw new BountyRefused('wrong-stage', record.github?.state === 'posted'
        ? `bounty ${id} is ${record.stage} — nothing has been collected yet; name a pull request by its number: box bounty apply ${id} <n>`
        : `bounty ${id} is ${record.stage} — apply merges a solution that has come back; nothing has arrived for this bounty yet`);
    }
    const applicable = applicableAttempts(attempts);
    if (applicable.length === 0) {
      throw new BountyRefused('no-applicable-attempt', `no recorded attempt on ${id} can be applied — name one anyway with box bounty apply ${id} <n>, or end the bounty with box bounty close ${id} --reason "<why>"`);
    }
    if (applicable.length > 1) {
      throw new BountyRefused('apply-ambiguous', `attempts ${applicable.map(candidate => `#${candidate.n}`).join(', ')} could be applied — pick one: box bounty apply ${id} <n>`);
    }
    attempt = applicable[0]!;
  }
  if (gitOutcome(repoRoot, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']).status === 0) {
    throw new BountyRefused('merge-in-progress', `a merge is already in progress in ${repoRoot} — finish it or run git merge --abort before applying a bounty`);
  }
  // The owner's Git configuration can make this merge run a program a
  // solution supplies or changes: a filter, merge driver, config include or
  // attributes file that resolves inside the tree is replaced by whatever the
  // merge lands, then run on the files written after it — and a program left
  // alone can call a second file the merge does change. The tool never writes
  // the configuration, so it does not rewrite it either: it refuses here,
  // before the working tree, index or branch is touched.
  const unsafe = unsafeOwnerCommands(repoRoot);
  if (unsafe.length > 0) {
    throw new BountyRefused('apply-unsafe-config', `the owner's Git configuration could run a program a solution supplies or changes during this merge — apply refuses before anything is touched: ${unsafe.map(item => `${item.key} = ${showPath(item.command)} — ${item.detail}`).join('; ')}. Merge the answer with your own git if you accept those programs — the choice is yours — or point the configured command outside the repository`);
  }
  // HEAD is the attribute view for every read and the merge below: the
  // solver's files have not landed yet, so HEAD is the owner's committed
  // state — a returned .gitattributes names nothing until the owner applies it.
  const ownerAttrs = { GIT_ATTR_SOURCE: 'HEAD' };
  const base = mergeBase(repoRoot, 'HEAD', attempt.commit);
  const deltaPaths = base !== null
    ? gitOutcome(repoRoot, ['diff', '--name-only', '-z', base, attempt.commit], ownerAttrs).stdout
        .split('\0').filter(name => name !== '')
    : [...attempt.changed, ...attempt.added, ...attempt.deleted];
  const { blocked, dirty } = worktreeBlocks(repoRoot, deltaPaths, [...attempt.changed, ...attempt.added, ...attempt.deleted], ownerAttrs);
  if (blocked.length > 0) {
    throw new BountyRefused('apply-worktree-dirty', `uncommitted work in ${blocked.map(showPath).join(', ')} would be overwritten by the merge — commit it, stash it or move it aside, then run box bounty apply ${id} again`);
  }
  const message = [
    `box bounty ${record.id}: ${record.title}`,
    '',
    `attempt: ${attempt.n}`,
    `solution: ${attempt.commit}`,
    `snapshot: ${record.snapshot.commit}`
  ].join('\n');
  // The merge runs under the repository's own config — pinning eol filters off
  // would make every file clean under the repo's convention look modified to
  // the merge and break apply on an ordinary autocrlf checkout. Byte identity
  // on abort is guaranteed by the saved bytes, not by filters: the delta plus
  // every dirty path is captured raw before the merge runs.
  //
  // Two pins keep the merge itself from running anything the solver wrote:
  // GIT_ATTR_SOURCE=HEAD reads attributes only from the repository's own
  // committed view, so a returned .gitattributes names no filter or merge
  // driver out of the host's config; and hooks are read from an empty
  // directory outside the checkout, so no hook fires — a solver cannot plant
  // one, and a mechanical merge should not fire even an owner-installed one.
  const hooksOff = mkdtempSync(join(tmpdir(), 'box-bt6-hooks-'));
  const saved = snapshotBytes(repoRoot, new Set([...deltaPaths, ...dirty]));
  let merged;
  try {
    merged = ownerGitOutcome(repoRoot, [
      '-c', 'user.name=box-bounty', '-c', 'user.email=box-bounty@localhost',
      '-c', `core.hooksPath=${hooksOff.split('\\').join('/')}`,
      'merge', '--no-ff', '-m', message, attempt.commit
    ], ownerAttrs);
  } finally {
    rmSync(hooksOff, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  }
  if (merged.status === 0) {
    const mergeCommit = git(repoRoot, ['rev-parse', 'HEAD']);
    record.conflicts = null;
    transitionTo(repoRoot, record, 'applied', { attempt: attempt.n, command: 'apply', merge: mergeCommit });
    // The bounty ended: every durability ref's work is done — the snapshot's
    // and all the other attempts'.
    dropDurabilityRefs(repoRoot, record);
    syncGitHubDecision(repoRoot, record);
    const notice = attempt.author !== undefined && attempt.author === record.github?.account ? null : recordFirstMerge(repoRoot, mergeCommit, record.github?.repository);
    return { record, outcome: 'applied', attempt: attempt.n, mergeCommit, ...(notice === null ? {} : { firstMergeNotice: notice }) };
  }
  const mergeHead = gitOutcome(repoRoot, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']);
  if (mergeHead.status === 0) {
    const paths = ownerGitOutcome(repoRoot, ['diff', '--name-only', '-z', '--diff-filter=U'], ownerAttrs).stdout
      .split('\0').filter(line => line !== '').sort();
    const aborted = ownerGitOutcome(repoRoot, ['merge', '--abort'], ownerAttrs);
    if (aborted.status !== 0) {
      throw new GitFailed(`git merge --abort failed in ${repoRoot} after a conflict in ${paths.join(', ')}: ${aborted.stderr.trim()} — resolve the merge state by hand`);
    }
    restoreBytes(repoRoot, saved);
    record.conflicts = { paths, at: new Date().toISOString() };
    persistRecord(repoRoot, record);
    // The facts a clashing apply owes: which of the solution's files would
    // have merged cleanly, and which commits on this branch touched the
    // clashing files since the shared commit. Nothing was changed — the
    // resolution is the agent's own merge, under the owner's own Git.
    const conflicted = new Set(paths.map(path => path.toLowerCase()));
    const clean = deltaPaths.filter(path => !conflicted.has(path.toLowerCase())).sort();
    const commits = base !== null
      ? gitOutcome(repoRoot, ['log', '--format=%h%x09%s', `${base}..HEAD`, '--', ...paths]).stdout
          .split('\n').map(line => line.trim()).filter(line => line !== '')
      : [];
    return { record, outcome: 'conflict', attempt: attempt.n, conflicts: paths, clean, commits, base: base ?? undefined };
  }
  restoreBytes(repoRoot, saved);
  const detail = tail(`${merged.stderr}\n${merged.stdout}`.trim());
  if (/local changes|untracked working tree files|would be overwritten/i.test(detail)) {
    throw new BountyRefused('apply-worktree-dirty', `git merge refused: ${detail}`);
  }
  throw new BountyRefused('merge-failed', `git merge could not land solution ${attempt.commit} on ${repoRoot}: ${detail}`);
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

// A stranger's text — a solver's path, a line of a solver's change, a line of
// another account's comment — is shown quoted and on one line: it can carry
// words, separators or spaces that would read as the tool's own prose. JSON
// quoting escapes the quote, the backslash and the C0 controls (ESC, CR, LF);
// DEL, the C1 controls and the characters that hide or reorder text on a
// terminal (zero-width, bidirectional overrides and isolates, line and
// paragraph separators, the byte-order mark) are escaped the same way, so what
// is printed is what is there. Every surface uses this one helper.
const HIDDEN = /[\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/g;
export const quoteForeign = (text: string): string =>
  JSON.stringify(text).replace(HIDDEN, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
export const showPath = quoteForeign;

// Flags are plain observations, deliberately eager: a false alarm costs a
// minute, a missed one costs a wrong fix. No flag blocks anything.
function attemptFlags(change: AnswerChange, linesAdded: number, linesRemoved: number): string[] {
  const flags: string[] = [];
  const touched = [...change.changed, ...change.added, ...change.deleted];
  const testLike = touched.filter(isTestPath);
  if (testLike.length > 0) flags.push(`the solution touches ${testLike.map(showPath).join(', ')}, marked as a test by the stated rule (a test/, tests/ or __tests__/ segment, or a test_*, *_test.*, *.test.* or *.spec.* basename)`);
  if (change.added.length > 0) flags.push(`the solution adds ${change.added.length} file(s)`);
  if (change.deleted.length > 0) flags.push(`the solution deletes ${change.deleted.length} file(s)`);
  if (touched.length > LARGE_FILES || linesAdded + linesRemoved > LARGE_LINES) {
    flags.push(`the change is above the stated size (${LARGE_FILES} files or ${LARGE_LINES} lines): ${touched.length} files, ${linesAdded + linesRemoved} lines`);
  }
  return flags;
}

// Added/removed line counts for the report, from the answer commit's own diff —
// git's read of the solver's delta, not a text diff handed in. A root answer
// (a snapshot with no base commit) diffs against the empty tree.
// One `diff-tree -r --root --numstat -z <commit>` answers what rev-list
// --parents plus a diff asked separately: the output leads with the commit's
// own id, then one entry per touched path — a root commit diffs against the
// empty tree under --root, exactly the EMPTY_TREE fallback it replaces.
function lineCounts(repoRoot: string, commit: string): { added: number; removed: number; binary: number } {
  const run = gitOutcome(repoRoot, ['diff-tree', '-r', '--root', '--numstat', '-z', commit]);
  let added = 0; let removed = 0; let binary = 0;
  // The output leads with the commit's own id — it is not a numstat entry.
  for (const entry of run.stdout.split('\0').slice(1)) {
    if (entry === '') continue;
    const [a, d] = entry.split('\t');
    if (a === '-') binary += 1;
    else { added += Number.parseInt(a ?? '0', 10) || 0; removed += Number.parseInt(d ?? '0', 10) || 0; }
  }
  return { added, removed, binary };
}

// The report of facts: who sent the answer and when, the change with counts
// and lines, the dry merge read, and eager flags — never a verdict. The
// nothing-was-run sentence is always there, verbatim.
export const NOTHING_RUN = 'nothing in the solution was run and this report says nothing about whether it works';

function renderAttemptReport(record: BountyRecord, n: number, at: string, author: string | undefined, change: AnswerChange, merge: DryMerge, counts: { added: number; removed: number; binary: number }): string[] {
  const lines: string[] = [];
  lines.push(`report — attempt ${n} for ${record.id}`);
  lines.push(`  from: ${author !== undefined ? `GitHub account ${author}` : 'a returned folder — no account was named'} — arrived ${at}`);
  lines.push(`  change: ${change.changed.length} changed, ${change.added.length} added, ${change.deleted.length} deleted — ${counts.added} lines added, ${counts.removed} removed${counts.binary > 0 ? ` (${counts.binary} binary file(s))` : ''}`);
  if (merge.kind === 'clean') {
    lines.push('  current code: the solution would merge cleanly onto the current branch');
  } else if (merge.kind === 'conflict') {
    lines.push(`  current code: merging onto the current branch would conflict in ${merge.paths.map(showPath).join(', ')}`);
  } else {
    lines.push(`  current code: cannot tell — ${merge.detail}`);
  }
  const flags = attemptFlags(change, counts.added, counts.removed);
  if (flags.length === 0) lines.push('  flags: none');
  else for (const flag of flags) lines.push(`  flag: ${flag}`);
  lines.push(`  ${NOTHING_RUN}`);
  lines.push(`  next: box bounty look ${record.id} ${n} to read the change; box bounty apply ${record.id} ${n} to merge it; or box bounty close ${record.id} --reason "<why>"`);
  return lines;
}

// Collecting a returned folder — what `look <id> --from <dir>` and `apply
// <id> --from <dir>` pass through, and what the GitHub adapter's snapshot path
// calls after materialising a pull request's tree. Bind, extract, report. The
// bounty stays open — `posted` waiting, `answered` waiting on a decision —
// and each return is kept as its own numbered attempt, whichever account it
// came from (a GitHub-valid `author` is recorded when the adapter names one;
// a returned folder names none). taken → answered events record the arrival;
// the stage lands at `answered`, where the choice — apply, close or wait — is
// the agent's. `collect.attemptN` lets the adapter land a pull request under
// its own number; `collect.via` names the driving command on the event.
export function answerBounty(repoRoot: string, id: string, fromDir: string, author?: string, collect?: { readonly attemptN?: number; readonly via?: string }): AnswerResult {
  const record = loadRecord(repoRoot, id);
  if (!isOpenStage(record.stage)) throw endedRefusal(record);
  if (record.stage !== 'posted' && record.stage !== 'taken' && record.stage !== 'answered' && record.stage !== 'verified') {
    throw new BountyRefused('not-posted', `bounty ${id} is ${record.stage}, not posted — a solution can only come back to a bounty that was delivered (box bounty post ${id} --to <dir> or --github)`);
  }
  const { manifest, manifestBytes, repoDir } = readAnswerFolder(fromDir);
  if (manifest.id !== id) {
    throw new BountyRefused('answer-mismatch', `the returned bounty.json names ${manifest.id}, not ${id} — this solution belongs to a different bounty`);
  }
  if (manifest.snapshot.commit !== record.snapshot.commit) {
    throw new BountyRefused('snapshot-mismatch', `the returned bounty.json pins snapshot ${manifest.snapshot.commit} but ${id} was made for ${record.snapshot.commit} — the solution does not match the version it must land on`);
  }
  if (record.manifestSha256 !== undefined && sha256(manifestBytes) !== record.manifestSha256) {
    throw new BountyRefused('manifest-tampered', `the returned bounty.json is not byte-identical to the one this bounty shipped — it binds the solution and must come back unmodified; edit repo/ only`);
  }
  // Never-ship applies to the return exactly as it did outbound: built-ins plus
  // the owner's .boxignore. An answer cannot smuggle a path create would have
  // stripped — it is refused by name before anything is extracted.
  const ownerList = loadOwnerList(repoRoot);
  const rules: readonly NeverShipRule[] = ownerList === null ? BUILTIN_RULES : [...BUILTIN_RULES, ownerList.rule];
  const change = extractAnswerChange(manifest, repoDir, rules);
  if (gitOutcome(repoRoot, ['rev-parse', '--verify', '-q', refName(id)]).status !== 0) {
    throw new BountyRefused('snapshot-lost', `refs/box-bounty/${id} is gone — the snapshot this solution was made for can no longer be recreated or merged from. Nothing can come back to this bounty; end it with box bounty close ${id} --reason "snapshot lost"`);
  }
  const commit = buildAnswerCommit(repoRoot, record, change, repoDir);
  const n = collect?.attemptN ?? (attemptsOf(record).reduce((max, attempt) => Math.max(max, attempt.n), 0) + 1);
  // Pin the attempt commit before recording anything — a crash between loses
  // nothing the record names.
  git(repoRoot, ['update-ref', attemptRefName(id, n), commit]);
  transitionTo(repoRoot, record, 'taken', { attempt: n, ...(collect?.via !== undefined ? { command: collect.via } : {}) });
  transitionTo(repoRoot, record, 'answered', { attempt: n });
  record.conflicts = null;

  const at = new Date().toISOString();
  const merge = dryMergeOnto(repoRoot, commit);
  const counts = lineCounts(repoRoot, commit);
  const report = renderAttemptReport(record, n, at, author, change, merge, counts);
  const attempt: Attempt = {
    n,
    at,
    ...(author !== undefined ? { author } : {}),
    commit,
    changed: change.changed,
    added: change.added,
    deleted: change.deleted,
    outcome: 'answered',
    conflicts: merge.kind === 'conflict' ? merge.paths : null,
    report
  };
  record.attempts = [...attemptsOf(record), attempt];
  persistRecord(repoRoot, record);
  return { record, outcome: 'answered', attempt: n, report, ...(merge.kind === 'conflict' ? { conflicts: merge.paths } : {}) };
}
