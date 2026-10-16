import { showPath, NOTHING_RUN } from './notice.js';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { BountyRefused } from './errors.js';
import { GitFailed, dryMergeOnto, git, gitIndexWrite, gitOutcome, gitWriteBlob, mergeBase, ownerGitOutcome, unsafeOwnerCommands } from './git.js';
import type { DryMerge, IndexChange } from './git.js';
import { applicableAttempts, attemptRefName, attemptsOf, dropDurabilityRefs, isOpenStage, loadRecord, persistRecord, requireCurrentDelivery, refName, transitionTo } from './record.js';
import { waitForOwner } from './gate.js';
import { mergeWaitLines, waitingSummary } from './owner-text.js';
import type { Attempt, BountyRecord } from './record.js';
import { resolveAttempt } from './collect.js';
import { syncGitHubDecision } from './github.js';
import { dropMergeAnswer, readDecision, readMergeAnswer, recordFirstMerge } from './settings.js';
import { boundAmount } from './format.js';
import { payNotice } from './pay.js';
const TAIL = 2000;

const tail = (text: string): string => text.slice(-TAIL);

const endedRefusal = (record: BountyRecord): BountyRefused =>
  new BountyRefused('already-ended', `bounty ${record.id} already ended (${record.stage}) — an ended bounty takes no further transitions; the record is its history`);

export interface AnswerChange {
  readonly changed: readonly string[];
  readonly added: readonly string[];
  readonly deleted: readonly string[];
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
  /** A bounty with a reward that closed on this merge carries the message
      for the owner — whom to pay and where (BT11b). */
  readonly payMessage?: readonly string[];
  readonly conflicts?: readonly string[] | undefined;
  /** On a conflict: the solution's files that would have merged cleanly. */
  readonly clean?: readonly string[] | undefined;
  /** On a conflict: commits on this branch since the shared commit that
      touched the clashing files — `sha subject`, oldest last. */
  readonly commits?: readonly string[] | undefined;
  /** On a conflict: the shared commit the facts are measured from. */
  readonly base?: string | undefined;
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

export type ApplyTarget = number;

// `apply`: git's own three-way merge lands the chosen attempt's answer commit
// onto the repository as it stands — never raw writes into the worktree. A
// conflict aborts the merge (worktree and index come back byte-identical) and
// the record keeps its stage with the conflicting paths as the next step.
// Uncommitted changes the merge would overwrite are a named refusal, not
// damage. With several attempts that could be applied, `apply` without a
// number refuses and names them — the choice is the agent's.
export function applyBounty(repoRoot: string, id: string, target?: ApplyTarget, opts?: { readonly answered?: true }): ApplyResult {
  let record = loadRecord(repoRoot, id);
  requireCurrentDelivery(record);
  if (record.stage === 'applied' && record.github !== undefined) {
    syncGitHubDecision(repoRoot, record);
    const event = [...record.events].reverse().find(entry => entry.command === 'apply' || entry.command === 'merged');
    const retryPay = payNotice(record, boundAmount(record));
    return { record, outcome: 'applied', attempt: event?.attempt ?? 1, mergeCommit: event?.merge, ...(retryPay === null ? {} : { payMessage: retryPay }) };
  }
  if (!isOpenStage(record.stage)) throw endedRefusal(record);
  let attemptN: number | undefined;
  if (typeof target === 'number') {
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
  // "Ask me each time" covers merges (BT13): under ask — or off, the
  // strictly stronger "ask each time" — the tool's own merge becomes a named
  // waiting state the owner releases with `allow <id>`, bound to this
  // attempt at this commit on this branch tip so a changed solution or a
  // moved branch asks again. `allowed` and nothing-written merge as before:
  // a hand merge was always possible, so the gate is a promise kept to
  // owners who asked to be asked — not a barrier the agent could not cross.
  // The answer is read from the owner's settings — outside this repository:
  // written there only by `box bounty allow`, after the bound state is
  // re-checked; nothing an agent passes, and nothing on the record file
  // inside this checkout, marks a merge approved.
  const mergeRead = readDecision(repoRoot);
  if ((mergeRead.decision === 'ask' || mergeRead.decision === 'off') && opts?.answered !== true) {
    const head = gitOutcome(repoRoot, ['rev-parse', 'HEAD']).stdout.trim();
    const bound = { n: attempt.n, commit: attempt.commit, head };
    const answer = readMergeAnswer(repoRoot, id);
    const carried = answer !== null && answer.n === bound.n && answer.commit === bound.commit && answer.head === bound.head;
    if (!carried) {
      waitForOwner(repoRoot, record, { for: 'merge', reason: mergeRead.decision === 'ask' ? 'owner-ask' : 'owner-off', at: new Date().toISOString(), merge: bound });
      throw new BountyRefused('merge-held', [`waiting for the owner: ${record.id} — ${waitingSummary(record)}`, ...mergeWaitLines(record, attempt)].join('\n'));
    }
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
    // Old records only: the snapshot line names the capture the bounty was
    // made from — a record written now keeps no snapshot to name.
    ...(record.snapshot === undefined ? [] : [`snapshot: ${record.snapshot.commit}`])
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
    // Which of the solution's own paths the landed merge left as they were —
    // recorded when a reward is bound, since the pay message must name them
    // (BT13). The diff against the merge's first parent is what changed.
    const amount = boundAmount(record) ?? 0;
    let partial: string[] = [];
    if (amount > 0) {
      const touched = new Set(gitOutcome(repoRoot, ['diff', '--name-only', '-z', `${mergeCommit}^1`, mergeCommit], ownerAttrs).stdout
        .split('\0').filter(name => name !== '').map(name => name.toLowerCase()));
      partial = [...attempt.changed, ...attempt.added, ...attempt.deleted].filter(path => !touched.has(path.toLowerCase()));
    }
    record.conflicts = null;
    transitionTo(repoRoot, record, 'applied', { attempt: attempt.n, command: 'apply', merge: mergeCommit, ...(partial.length > 0 ? { partial } : {}) });
    // The merge landed: any recorded owner answer for this bounty is spent —
    // it named this commit and this branch tip, so it could never match
    // again; drop it quietly rather than leave a marker behind.
    try { dropMergeAnswer(repoRoot, id); } catch { /* a spent answer left behind matches nothing */ }
    // The bounty ended: every durability ref's work is done — the snapshot's
    // and all the other attempts'.
    dropDurabilityRefs(repoRoot, record);
    syncGitHubDecision(repoRoot, record, { decision: mergeRead });
    const notice = attempt.author !== undefined && attempt.author === record.github?.account ? null : recordFirstMerge(repoRoot, mergeCommit);
    // A recorded first merge fuses into the payment block (BT14) — one
    // block, one 'for the owner'. With no payment to make, or when the
    // notice's write failed, the standalone line still goes out.
    const fused = notice !== null && notice.recorded;
    const payMessage = payNotice(record, boundAmount(record), fused ? { firstMerge: true } : undefined);
    return { record, outcome: 'applied', attempt: attempt.n, mergeCommit, ...(notice === null || fused && payMessage !== null ? {} : { firstMergeNotice: notice.line }), ...(payMessage === null ? {} : { payMessage }) };
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
    // The abort and the byte restore both write the worktree and can leave
    // the index's stat cache stale on Windows (K15) — a file restored
    // byte-identical still reads stat-dirty, and the agent's own `git merge`
    // then refuses "needs update". Refresh it; exit 1 names real diffs,
    // which a genuinely different restore would want shown anyway.
    ownerGitOutcome(repoRoot, ['update-index', '-q', '--refresh'], ownerAttrs);
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







export { setMergeNoticeListener, emitMergeNotice, quoteForeign, showPath, NOTHING_RUN } from './notice.js';
