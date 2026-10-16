// Recognising a merged solution. A solution the tool handed out can reach the
// bounty's branch without a clean `apply` — the agent merges with its own Git
// under the owner's own settings, or merges the pull request directly. The
// tool keeps no merge state of its own: the next time any bounty command
// reads a record, every open bounty is checked — is one of its recorded
// solution commits (a collected attempt, or a pull-request head the tool has
// already seen) part of the branch the bounty was created on? Git answers
// that question — ancestry, never commit text, tree similarity or PR
// metadata alone.
//
// When one is, the bounty ends exactly as a clean apply ends it: the record
// goes `applied` with the landed commit named, the closing comment and issue
// close go out, and the durability refs drop. While nothing has merged the
// scan costs one `git rev-list` per open bounty — it is invoked from
// loadRecord/listRecords, so every command that reads a record runs it
// first, and it runs at most once per repository per process.
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { gitOutcome, gitProgram } from './git.js';
import { shipRules } from './never-ship.js';
import { attemptsOf, dropDurabilityRefs, isOpenStage, listRecords, setRecordReadScan, transitionTo } from './record.js';
import type { Attempt, BountyRecord } from './record.js';
import { syncGitHubDecision } from './github.js';
import { emitMergeNotice as emit, showPath } from './answer.js';
import { readDecision, recordFirstMerge } from './settings.js';
import { boundAmount } from './format.js';
import { payNotice } from './pay.js';

// One line per recognised merge or un-checkable record, printed by whichever
// command noticed. The CLI registers a printer; library callers see the same
// truth in the record's events. The listener lives with the emit path in
// answer.ts so the GitHub close-up can share it (BT21).
export { setMergeNoticeListener } from './answer.js';

// Every record read runs this scan first — registered into record.ts at
// load rather than imported by it, so the edge stays one-directional and no
// import cycle runs through the store (BT25).
setRecordReadScan(noticeMergedSolutions);

let noticing = false;
const noticed = new Set<string>();

// The check every record-reading command runs first. Guarded against
// re-entry: closing a bounty persists its record, and persisting reads the
// records back for the OPEN line — without the flag the scan would recurse.
// Memoised once per repository per process: a command is one process, and
// nothing outside the tool changes the repository during a single read.
// A caller needing the check again inside one process calls
// checkMergedSolutions directly.
export function noticeMergedSolutions(repoRoot: string): void {
  if (noticing) return;
  let key: string;
  try { key = resolve(realpathSync(repoRoot)); } catch { key = resolve(repoRoot); }
  if (noticed.has(key)) return;
  noticed.add(key);
  noticing = true;
  try { scan(repoRoot); } finally { noticing = false; }
}

interface MergeCandidate {
  readonly commit: string;
  readonly attempt?: Attempt;
  readonly pr?: number;
}

// The scan itself, exported for a caller that needs the check on demand
// inside one process (a test that just pushed a merge, a long-lived caller).
// The memoised notice above is what commands get. Guarded the same way:
// persisting a close reads the records back.
export function checkMergedSolutions(repoRoot: string): void {
  if (noticing) return;
  noticing = true;
  try { scan(repoRoot); } finally { noticing = false; }
}

function scan(repoRoot: string): void {
  const open = listRecords(repoRoot)
    .map(entry => entry.record)
    .filter((record): record is BountyRecord => record !== null && isOpenStage(record.stage))
    .map(record => ({ record, candidates: candidatesOf(record) }))
    .filter(entry => entry.candidates.length > 0);
  if (open.length === 0) return;
  // The check itself needs Git — a missing or too-old binary is the
  // command's named refusal here, not a silently skipped scan.
  gitProgram();
  for (const { record, candidates } of open) checkOne(repoRoot, record, candidates);
}

// The commits a merged solution could be: every collected attempt's answer
// commit, plus the head of every pull request the tool has already seen —
// an uncollected PR the agent merged itself is still its solution landing.
// A pull request the tool never listed leaves no commit to check; the next
// `answer` listing records it and the command after that closes the bounty.
function candidatesOf(record: BountyRecord): MergeCandidate[] {
  const candidates: MergeCandidate[] = [];
  const seen = new Set<string>();
  for (const attempt of attemptsOf(record)) {
    if (seen.has(attempt.commit)) continue;
    seen.add(attempt.commit);
    candidates.push({ commit: attempt.commit, attempt });
  }
  for (const pr of record.github?.seenPullRequests ?? []) {
    if (seen.has(pr.commit)) continue;
    seen.add(pr.commit);
    candidates.push({ commit: pr.commit, pr: pr.n });
  }
  return candidates;
}

function checkOne(repoRoot: string, record: BountyRecord, candidates: readonly MergeCandidate[]): void {
  // "The branch the bounty was created on" is a fact the record carries —
  // HEAD today is not the answer. A record that names no branch (older
  // records, or a bounty drafted on a detached HEAD) cannot be checked:
  // stated, and nothing closes.
  const branch = record.resume?.kind === 'recorded' ? record.resume.branch : null;
  if (branch === null || branch === '(detached HEAD)') {
    emit(`${record.id} — a merged solution cannot be recognised: the record names no branch the bounty was created on`);
    return;
  }
  // One rev-list answers both questions the check needs: the branch exists,
  // and which candidate commits it reaches — a merge on any other branch is
  // simply absent from the set and is never mentioned. `refs/heads/<name>`
  // keeps a strange recorded name from reading as a flag.
  const listed = gitOutcome(repoRoot, ['rev-list', `refs/heads/${branch}`]);
  if (listed.status !== 0 || listed.error !== undefined) {
    emit(`${record.id} — a merged solution cannot be recognised: ${branch}, the branch it was created on, is gone or unreadable`);
    return;
  }
  const onBranch = new Set(listed.stdout.split('\n').map(line => line.trim()).filter(line => line !== ''));
  const merged = candidates.filter(candidate => onBranch.has(candidate.commit));
  if (merged.length === 0) return;

  // A solution landed — finding which commit carried it spends more git,
  // spent only here. The branch's first-parent chain is the story of what
  // was merged into it and when.
  const chain = gitOutcome(repoRoot, ['rev-list', '--first-parent', `refs/heads/${branch}`]).stdout
    .split('\n').map(line => line.trim()).filter(line => line !== '');
  const chainIndex = new Map<string, number>(chain.map((sha, index) => [sha, index]));
  const entries = merged.map(candidate => ({ candidate, merge: entryCommit(repoRoot, chain, candidate.commit, chainIndex) }));
  // Several landed solutions: the one merged first in the branch's
  // first-parent history wins — the deepest entry, furthest from the tip.
  entries.sort((a, b) => (chainIndex.get(b.merge) ?? chain.length) - (chainIndex.get(a.merge) ?? chain.length));
  closeOne(repoRoot, record, branch, entries[0]!.candidate, entries[0]!.merge);
}

// The commit that carried a solution onto the branch: the commit itself when
// it sits on the first-parent chain (a fast-forward land), else the deepest
// first-parent commit that has it as an ancestor — the merge that brought it
// in, however it got there. A solution merged into a side branch first still
// lands where that branch was merged in: `rev-list --first-parent
// --ancestry-path` cannot see that (the candidate is no first-parent
// descendant), so the landing point is found by asking the ancestry question
// directly — `merge-base --is-ancestor` on a binary search of the chain.
// Containment is monotone along the chain (everything tip-ward of the
// landing contains the candidate, nothing root-ward does), so the search
// needs log2(chain length) probes, and only ever runs when a candidate has
// actually landed — the steady-state scan stays at one git start per open
// bounty.
function entryCommit(repoRoot: string, chain: readonly string[], commit: string, chainIndex: ReadonlyMap<string, number>): string {
  if (chainIndex.has(commit)) return commit;
  const contains = (index: number): boolean =>
    gitOutcome(repoRoot, ['merge-base', '--is-ancestor', commit, chain[index]!]).status === 0;
  let lo = 0; // contains(chain[lo]) — the tip always contains a landed candidate
  let hi = chain.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (contains(mid)) lo = mid; else hi = mid;
  }
  return contains(hi) ? chain[hi]! : chain[lo]!;
}

// The bounty ends exactly as a clean apply ends it: `applied`, refs dropped,
// GitHub told. The landed delta is also read once for never-ship paths the
// collected solution did not carry — named as facts, never a reason to keep
// the bounty open or to rewrite the owner's history.
function closeOne(repoRoot: string, record: BountyRecord, branch: string, candidate: MergeCandidate, merge: string): void {
  // One read of the landed delta serves the never-ship scan and the partial
  // fact: which of the solution's own paths the merge left as they were —
  // the hand merge kept only part of the solution (BT13).
  const touched = mergeTouched(repoRoot, merge);
  const extras = neverShipExtras(repoRoot, touched, candidate.attempt);
  const partial = candidate.attempt === undefined
    ? []
    : [...candidate.attempt.changed, ...candidate.attempt.added, ...candidate.attempt.deleted]
        .filter(path => !touched.has(path.toLowerCase()));
  // A hand merge lands outside the tool's gate. When the decision asked to
  // be asked — or nothing was written, or a merge wait still stood — the
  // owner was not asked before it, and the closing output, status and the
  // pay message all say so. The merge still closes the bounty: closing
  // never waits (BT13).
  const decision = readDecision(repoRoot);
  const unasked = record.waiting?.for === 'merge' || decision.decision !== 'allowed';
  const label = candidate.attempt !== undefined ? `solution ${candidate.attempt.n}` : `a solution from pull request #${candidate.pr}`;
  record.conflicts = null;
  transitionTo(repoRoot, record, 'applied', {
    ...(candidate.attempt !== undefined ? { attempt: candidate.attempt.n } : {}),
    command: 'merged',
    merge,
    reason: `commit ${candidate.commit}${candidate.pr !== undefined ? `, pull request #${candidate.pr}` : ''}`,
    ...(unasked ? { unasked: true } : {}),
    ...(partial.length > 0 ? { partial } : {})
  });
  dropDurabilityRefs(repoRoot, record);
  syncGitHubDecision(repoRoot, record, { decision });
  emit(`${record.id} — ${label} is merged on ${branch} at ${merge.slice(0, 12)} — the bounty is closed (recorded applied)`);
  if (unasked) emit(`${record.id} — fact: the owner was not asked before this merge`);
  if (partial.length > 0) emit(`${record.id} — fact: of the files the solution changed, the merge left these as they were: ${partial.map(showPath).join(', ')}`);
  const author = candidate.attempt?.author ?? record.github?.seenPullRequests?.find(pr => pr.n === candidate.pr && pr.commit === candidate.commit)?.author;
  const firstMerge = (candidate.attempt !== undefined && author === undefined || author !== undefined && author !== record.github?.account) ? recordFirstMerge(repoRoot, merge) : null;
  // A bounty with a reward hands the owner message to whichever command
  // noticed the merge — whom to pay and where (BT11b); a recorded
  // first-merge fact rides inside that same block (BT14).
  const pay = payNotice(record, boundAmount(record), firstMerge?.recorded === true ? { firstMerge: true } : undefined);
  pay?.forEach(emit);
  if (firstMerge !== null && (firstMerge.recorded !== true || pay === null)) emit(firstMerge.line);
  for (const hit of extras) {
    emit(`${record.id} — fact: the merge also carries ${showPath(hit.path)}, which the never-ship rule '${hit.rule}' keeps out — the history stays as the owner made it`);
  }
}

// Every path the landed merge changed, lowercase — `merge^1..merge` under
// the repository's own view. An empty set means the diff could not be read:
// the partial fact then says nothing rather than guess.
function mergeTouched(repoRoot: string, merge: string): ReadonlySet<string> {
  const diff = gitOutcome(repoRoot, ['diff', '--name-only', '-z', '--no-renames', `${merge}^1`, merge]);
  if (diff.status !== 0 || diff.error !== undefined) return new Set();
  return new Set(diff.stdout.split('\0').filter(name => name !== '').map(name => name.toLowerCase()));
}

// Never-ship paths the landed merge carries beyond the solution's own
// touched paths — the solver's files were checked at collection; the agent's
// own resolution commits are the owner's history either way.
function neverShipExtras(repoRoot: string, touched: ReadonlySet<string>, attempt: Attempt | undefined): { path: string; rule: string }[] {
  const solution = new Set(attempt === undefined ? [] : [...attempt.changed, ...attempt.added, ...attempt.deleted].map(path => path.toLowerCase()));
  const rules = shipRules(repoRoot);
  const hits = new Map<string, { path: string; rule: string }>();
  for (const path of touched) {
    if (solution.has(path) || hits.has(path)) continue;
    const rule = rules.find(candidate => candidate.match(path));
    if (rule !== undefined) hits.set(path, { path, rule: rule.name });
  }
  return [...hits.values()];
}
