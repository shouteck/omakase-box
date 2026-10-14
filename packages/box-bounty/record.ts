// The bounty record: a small JSON file per bounty at `.box/bounties/<id>.json`
// inside the repository, so any later agent — in a later session, on any host —
// can see where each bounty is in its journey and what to do next. The tool
// writes the file; committing it is the agent's normal flow.
//
// The record is a state machine over the journey's stages, not scattered
// booleans: `stage` is the current state and `events` appends one entry per
// transition, so history is never rewritten. This wave's commands only ever
// reach `posted`/`withdrawn`, but the stage set is the whole journey's so BT3
// extends the same record rather than redesigning it.
//
// Durability: `bounty create` also pins `refs/box-bounty/<id>` at the snapshot
// commit, so `git gc --prune=now` cannot take the bytes the identifier names.
// `close` removes the ref.

import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { BountyRefused } from './errors.js';
import { dryMergeOnto, git, gitOutcome, gitRefsWrite, GIT_LEAST } from './git.js';
import { instructionNotices, syncInstructions } from './instructions.js';
import { planGitHub, postGitHub, refreshGitHubStatus, refreshGitHubFormat, shownOfPlan, syncGitHubDecision, issueComments, GH_LEAST } from './github.js';
import { checkProjectClaims, publishListed, publishLists, shipRules } from './never-ship.js';
import { requireRepository } from './repository.js';
import { renderListing } from './create.js';
import type { BountyManifest } from './manifest.js';
import { loadSettings, localFirstMergeLine, readDecision, repoReward, rewardNoticeLine } from './settings.js';
import { DECISION_WORDS } from './owner.js';
import type { DecisionRead } from './settings.js';
import { noticeMergedSolutions } from './merged.js';
import { payNotice, payOutcomeShape, payToFactShape, payToLine } from './pay.js';
import type { PayToFact } from './pay.js';
import { quoteForeign, showPath } from './answer.js';
import { boundAmount } from './format.js';

const sha256 = (buffer: Buffer | string): string => createHash('sha256').update(buffer).digest('hex');

export type OpenStage = 'drafted' | 'confirmed' | 'waiting' | 'posted' | 'taken' | 'answered' | 'verified';
export type EndedStage = 'applied' | 'rejected' | 'withdrawn' | 'expired' | 'undone';
export type BountyStage = OpenStage | EndedStage;

const OPEN_STAGES: ReadonlySet<BountyStage> = new Set(['drafted', 'confirmed', 'waiting', 'posted', 'taken', 'answered', 'verified']);
const ENDED_STAGES: ReadonlySet<BountyStage> = new Set(['applied', 'rejected', 'withdrawn', 'expired', 'undone']);
export const isOpenStage = (stage: BountyStage): stage is OpenStage => OPEN_STAGES.has(stage);

export interface StageEvent {
  readonly stage: BountyStage;
  readonly at: string;
  readonly destination?: string; // recorded on the `posted` event
  readonly reason?: string; // recorded on `rejected` and, on older records, on a `posted` return: the named failure class
  readonly attempt?: number; // which attempt this transition was about
  readonly command?: string; // the command that drove it — apply, look, close, merged — so history says what ended the bounty. Records written before BT7c can still name removed commands; status prints them remapped to what replaced them.
  readonly merge?: string; // the commit the command made (the apply or merged land; on older records the reversal)
}

// Attempt outcomes written since checks were removed (11 October 2026) are
// only ever 'answered'. The other words belong to records written before that
// day — they stay in the union so those records still load and their attempts
// still read back honestly.
export type AttemptOutcome = 'answered' | 'verified' | 'check-failed' | 'check-unrunnable' | 'check-not-run';

export interface Attempt {
  readonly pullRequest?: number;
  readonly seenAt?: string;
  /** 1-based, stable within the record — `box bounty apply <id> <n>` names it.
      A solution collected from a pull request is numbered by the pull
      request's number, so `look`/`apply <id> <n>` name the same thing as the
      outside listing. The answer commit is pinned at
      refs/box-bounty/<id>-answer-<n>. */
  readonly n: number;
  readonly at: string;
  /** The GitHub-valid login that sent this answer, when the GitHub adapter
      collected it. A returned folder names no account and this stays absent. */
  readonly author?: string;
  readonly commit: string;
  readonly changed: readonly string[];
  readonly added: readonly string[];
  readonly deleted: readonly string[];
  readonly outcome: AttemptOutcome;
  /** Paths the dry merge flagged as conflicting when the answer arrived;
      null when it would have merged cleanly or could not be tested. */
  readonly conflicts: readonly string[] | null;
  /** The fact report, rendered once when the answer came in — `look`/`apply`
      print it on collection and `status` replays it. Facts only, never a verdict. */
  readonly report: readonly string[];
  /** What the pull request description's `pay-to:` line parsed to at
      collection — a fact, never the text itself (BT11b). */
  readonly payTo?: PayToFact;
}

// A held action (BT8): while the owner's decision is "ask"/"off" or nothing
// is written, a post — and, for the outside close, any decision — becomes a
// named waiting state instead of running. `for` says what waits; `to` and
// `choice` keep the intended post so the owner's one answer can complete it;
// `hits` are the secret-scan findings a publish is held on (file and line,
// never the value). `shown` (BT8c) records what the owner was shown would be
// published: an owner's `allow <bounty>` releases the wait only while what
// would be published still matches it — a drift refuses by name.
export interface WaitingFor {
  readonly for: 'post' | 'close';
  readonly reason: 'owner-allow' | 'owner-ask' | 'owner-off' | 'secrets' | 'untracked-file';
  readonly at: string;
  readonly to?: string;
  readonly choice?: { readonly withChanges: boolean; readonly include: readonly string[] };
  readonly hits?: readonly { readonly path: string; readonly line: number; readonly rule: string; readonly commit?: string }[];
  readonly shown?: {
    readonly base: string;
    readonly head: string;
    readonly tip: string;
    readonly pushed: readonly string[];
    readonly include: readonly string[];
    readonly leftHome: number;
    readonly untracked: number;
  };
  /** The owner's one answer on this wait (BT8c), bound to the `shown` it was
      made under. `allow <bounty>` writes it before rerunning the held post;
      a wait the rerun uncovers — the scan's hold — carries it forward for
      the same action and destination, so a later `post` on the same
      published state reuses it. What would be published drifting drops it:
      the answer was for something else. */
  readonly answered?: { readonly at: string; readonly shown?: WaitingFor['shown'] };
}

// One pre-publish scan finding kept on the record (BT8c): what was flagged,
// where the scan ran, and what happened — the bounty went out (the content
// changed, the flagged path is on safe to publish, or a folder post carried
// it out unchecked) or it ended without posting.
// `settled` starts null while the finding is live; settling rewrites only
// that marker — the hits themselves are never edited.
export interface ScanFinding {
  readonly at: string;
  readonly where: 'create' | 'post';
  readonly hits: readonly { readonly path: string; readonly line: number; readonly rule: string; readonly commit?: string }[];
  settled: string | null;
}

// Record a scan finding, once per distinct hit set — a rerun of the same
// held post does not pile up copies.
export function recordScanFinding(record: BountyRecord, hits: readonly { readonly path: string; readonly line: number; readonly rule: string; readonly commit?: string }[], where: 'create' | 'post'): void {
  const key = JSON.stringify(hits.map(hit => [hit.path, hit.line, hit.rule]));
  const live = (record.scanFindings ?? []).find(finding => finding.settled === null);
  if (live !== undefined && JSON.stringify(live.hits.map(hit => [hit.path, hit.line, hit.rule])) === key) return;
  record.scanFindings = [...(record.scanFindings ?? []), { at: new Date().toISOString(), where, hits: [...hits], settled: null }];
}

// Settle every live finding with what happened — the bounty went out, or it
// ended without posting. The wording claims only what was verified: a GitHub
// post ran the scan again, so it can say the flagged content changed; a
// folder post runs no scan, so it can only say the content went out
// unchecked. When every flagged path is on safe to publish the record says
// the list's state — a local file write, so who wrote it is not claimed.
export function settleScanFindings(repoRoot: string, record: BountyRecord, settled: 'went-out' | 'went-out-unchecked' | 'ended'): void {
  const live = (record.scanFindings ?? []).filter(finding => finding.settled === null);
  if (live.length === 0) return;
  let text: string;
  if (settled === 'ended') text = 'the bounty ended — nothing was published';
  else {
    const safe = publishLists(repoRoot).safe;
    if (live.every(finding => finding.hits.every(hit => publishListed(safe, hit.path)))) {
      text = 'the flagged path is on safe to publish — the bounty went out';
    } else if (settled === 'went-out') {
      text = 'the flagged content changed — the bounty went out';
    } else {
      text = 'the bounty went out to a folder — the scan does not run on a folder post, so the flagged content was not re-checked';
    }
  }
  for (const finding of live) finding.settled = text;
}

// Which answer of the owner's allowed a post (BT8): the standing decision
// ("allowed", at a level) or the owner's one-bounty answer ("once"). The
// decision's own write time rides along, so the record says which written
// answer allowed it and when that answer was made.
export interface AllowedBy {
  readonly decision: 'allowed' | 'once';
  readonly level: 'project' | 'default' | 'this-bounty';
  readonly decisionAt: string | null;
  readonly usedAt: string;
}

export interface AnswerSpec {
  /** A commit parented on snapshot.baseCommit whose tree is the base plus the
      solver's extracted change — built on a temporary index, merged by `apply`.
      Pinned at refs/box-bounty/<id>-answer while the bounty is open. */
  readonly commit: string;
  readonly changed: readonly string[];
  readonly added: readonly string[];
  readonly deleted: readonly string[];
}

export interface BountyRecord {
  noteSource?: 'authored' | 'generated' | 'legacy';
  resume?: ResumeContext;
  replies?: { readonly at: string; readonly issue: number }[];
  readonly schemaVersion: 1;
  readonly kind: 'box-bounty-record';
  readonly id: string; // bt-<12 hex>, the same id bounty.json carries
  readonly title: string;
  /** One line of why the work was handed off, from `create --why` — required
      since BT3b and kept only here (never shipped), so the reasons for
      handing off can be learned from use. Absent on older records. */
  readonly why?: string;
  /** Records written before checks were removed carry the declared level.
      New records do not — a level described a check's role and there is none. */
  readonly level?: 'mechanical' | 'reviewed';
  /** Owner context from `create --job`: lives only in this record — never in
      bounty.json, the listing or the shipped folder. */
  readonly job?: { readonly file: string; readonly text: string } | null;
  /** sha256 of the exact bounty.json bytes `create` wrote: the answer's manifest
      must come back byte-identical, which is what binds it to this bounty. */
  readonly manifestSha256?: string;
  /** The reward bound at posting (BT11a): the whole-dollar amount in force
      the moment the bounty went out. A bounty keeps it for life — later
      changes to the owner's setting are for later bounties. Absent on
      records posted before BT11a, which read as $0. */
  reward?: { readonly amount: number };
  stage: BountyStage; // the latest event's stage, denormalized for a one-glance read
  /** Absolute path of the bounty folder `create` wrote. The record lives on the
      machine that made the bounty, so an absolute path is honest. */
  readonly folder: string;
  readonly snapshot: { readonly commit: string; readonly tree: string; readonly baseCommit: string | null };
  readonly createdAt: string;
  /** Every answer handed back, oldest first — each with its extracted change,
      its outcome and its fact report. `apply` names one by `n`. */
  attempts?: Attempt[];
  /** The extracted answer on records written before attempts existed — kept so
      older records still load; attemptsOf reads it as attempt 1. New writes
      only fill `attempts`. */
  answer?: AnswerSpec | null;
  /** Set when a merge onto current code conflicted and was aborted clean; the
      record stays `verified`/`answered` and these paths are the next step.
      Cleared when a later apply lands. */
  conflicts?: { readonly paths: readonly string[]; readonly at: string } | null;
  events: StageEvent[];
  /** Set while an action is held for the owner — the named waiting state
      status and the open-bounties line show. Cleared when the action runs. */
  waiting?: WaitingFor;
  /** Every pre-publish scan finding — what was flagged and what happened.
      Written at create (informational) and at a held post; status shows it. */
  scanFindings?: ScanFinding[];
  /** Recorded on the posted event: which answer of the owner's allowed it. */
  allowedBy?: AllowedBy;
  github?: import('./github.js').GitHubPublication;
  /** The GitHub preview the owner confirmed. Approvals written since BT6a also
      carry the approved plan — the base/tip commits, the commits published
      for the first time, the work-in-progress lists and the choices — so
      `post` publishes exactly what was approved or refuses by name. */
  githubApproval?: {
    readonly repository: string;
    readonly preview: string;
    readonly base?: string;
    readonly head?: string;
    readonly tip?: string;
    readonly tipTree?: string;
    readonly title?: string;
    readonly body?: string;
    readonly pushed?: readonly { readonly sha: string; readonly subject: string }[];
    readonly wipCommit?: string;
    readonly wip?: { readonly changed: readonly string[]; readonly added: readonly string[]; readonly deleted: readonly string[] } | null;
    readonly include?: readonly string[];
    readonly withChanges?: boolean;
    /** What the preview said stays home — a drift here means the working state
        moved since approval and the preview no longer tells the truth. */
    readonly leftHome?: number;
    readonly untracked?: number;
  };
}

export interface ListedBounty {
  /** Null when the file exists but cannot be read as a record — status still
      names it rather than silently dropping it. */
  readonly record: BountyRecord | null;
  readonly file: string;
}

export interface RecordSeed {
  readonly noteSource?: 'authored' | 'generated';
  readonly resume?: ResumeContext;
  readonly id: string;
  readonly title: string;
  readonly why?: string;
  readonly snapshot: { readonly commit: string; readonly tree: string; readonly baseCommit: string | null };
  readonly folder: string;
  readonly createdAt: string;
  readonly job?: { readonly file: string; readonly text: string } | null;
  readonly manifestSha256?: string;
  readonly scanFindings?: ScanFinding[];
}

export type ResumeContext = { readonly kind: 'not-recorded' } | {
  readonly kind: 'recorded'; readonly branch: string; readonly commit: string;
  readonly changed: readonly string[]; readonly note: string | null;
};
export const refName = (id: string): string => `refs/box-bounty/${id}`;
export const attemptRefName = (id: string, n: number): string => `refs/box-bounty/${id}-answer-${n}`;

// Normalizes the two shapes on disk: records from before this wave carry one
// `answer` block pinned at refs/box-bounty/<id>-answer and no report; newer
// records carry `attempts`. An older answered/verified/applied record reads as
// a single attempt — verified when the bounty is mechanical, answered when
// reviewed — with an empty report, which status says plainly.
export function attemptsOf(record: BountyRecord): Attempt[] {
  if (record.attempts !== undefined) return record.attempts;
  if (record.answer !== null && record.answer !== undefined) {
    return [{
      n: 1,
      at: record.events.at(-1)?.at ?? record.createdAt,
      commit: record.answer.commit,
      changed: record.answer.changed,
      added: record.answer.added,
      deleted: record.answer.deleted,
      outcome: record.level === 'mechanical' ? 'verified' : 'answered',
      conflicts: record.conflicts?.paths ?? null,
      report: []
    }];
  }
  return [];
}

// The attempts `apply` will take without a number: every attempt recorded
// since checks were removed is 'answered', so today this is all of them —
// and any may also be applied by naming it (`apply <id> <n>`). The filter
// stays so attempts on older records keep the meaning they were recorded
// with: a check outcome that was never green does not become the default
// pick just because checks are gone now.
export const applicableAttempts = (attempts: readonly Attempt[]): Attempt[] =>
  attempts.filter(attempt => attempt.outcome === 'verified' || attempt.outcome === 'answered');

// An open bounty can pin several commits: the snapshot at <id>, each attempt's
// answer commit at <id>-answer-<n>, and the single <id>-answer of records from
// before this wave (an attempt commit's parent is the base commit, so it does
// not keep the snapshot alive on its own). Every end stage deletes them all.
// Best-effort: a missing ref is exactly the state left behind.
export function dropDurabilityRefs(repoRoot: string, record: BountyRecord): void {
  // One update-ref --stdin drops the snapshot ref, the legacy answer ref and
  // every attempt ref — a delete of a missing ref is a no-op, so this is as
  // best-effort as the per-ref calls were.
  try {
    gitRefsWrite(repoRoot, [
      { delete: refName(record.id) },
      { delete: `${refName(record.id)}-answer` },
      ...attemptsOf(record).map(attempt => ({ delete: attemptRefName(record.id, attempt.n) }))
    ]);
  } catch {
    // Best-effort: refs that stay are exactly the state left behind.
  }
}
export const recordDir = (repoRoot: string): string => join(repoRoot, '.box', 'bounties');
export const recordPath = (repoRoot: string, id: string): string => join(recordDir(repoRoot), `${id}.json`);

export const persistRecord = (repoRoot: string, record: BountyRecord): void => {
  writeFileSync(recordPath(repoRoot, record.id), JSON.stringify(record, null, 2) + '\n');
  syncOpenSurfaces(repoRoot);
};

const asRecord = (parsed: unknown): BountyRecord | null => {
  const record = parsed as BountyRecord;
  if (record === null || typeof record !== 'object') return null;
  if (record.kind !== 'box-bounty-record' || typeof record.id !== 'string') return null;
  if (typeof record.stage !== 'string' || !Array.isArray(record.events) || typeof record.folder !== 'string') return null;
  if (record.noteSource !== undefined && record.noteSource !== 'authored' && record.noteSource !== 'generated' && record.noteSource !== 'legacy') return null;
  if (record.scanFindings !== undefined && !Array.isArray(record.scanFindings)) return null;
  const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object';
  const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(entry => typeof entry === 'string');
  if (record.resume !== undefined && (!object(record.resume) || record.resume.kind !== 'not-recorded' && (record.resume.kind !== 'recorded' || typeof record.resume.branch !== 'string' || typeof record.resume.commit !== 'string' || !strings(record.resume.changed) || record.resume.note !== null && typeof record.resume.note !== 'string'))) return null;
  record.resume ??= { kind: 'not-recorded' };
  record.noteSource ??= 'legacy';
  // Every field the tool prints back out of a record — the open-bounties
  // line, status headers, the hook's context envelope, merge-recognition
  // notices — is a fixed-shape fact the tool itself wrote. A record file can
  // arrive through a merged solution or a tampered checkout, so these shapes
  // are checked on read: a file that fails them is not a record this tool
  // wrote, it reads as corrupt, and its fields are never trusted text (BT9).
  const stamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
  const sha = /^[0-9a-f]{40}$/;
  const printable = /^[\x21-\x7e]{1,120}$/; // printable ASCII, no space — the shape Git refnames share
  const safeBranch = (branch: string) => branch === '(detached HEAD)' || printable.test(branch) && !branch.includes('..');
  if (!/^bt-[a-f\d]{12}$/.test(record.id)) return null;
  if (typeof record.createdAt !== 'string' || !stamp.test(record.createdAt)) return null;
  for (const event of record.events) {
    if (event === null || typeof event !== 'object') return null;
    if (event.merge !== undefined && (typeof event.merge !== 'string' || !sha.test(event.merge))) return null;
    if (event.attempt !== undefined && (!Number.isSafeInteger(event.attempt) || event.attempt < 1)) return null;
    if (event.reason !== undefined && typeof event.reason !== 'string') return null;
  }
  if (!OPEN_STAGES.has(record.stage) && !ENDED_STAGES.has(record.stage)) return null;
  if (record.resume.kind === 'recorded' && !safeBranch(record.resume.branch)) return null;
  if (record.attempts !== undefined && !Array.isArray(record.attempts)) return null;
  for (const attempt of record.attempts ?? []) {
    if (attempt === null || typeof attempt !== 'object' || !Number.isInteger(attempt.n) || attempt.n < 1 || typeof attempt.commit !== 'string' || !sha.test(attempt.commit)) return null;
    if (attempt.pullRequest !== undefined && (!Number.isSafeInteger(attempt.pullRequest) || attempt.pullRequest < 1)) return null;
    if (attempt.payTo !== undefined && !payToFactShape(attempt.payTo)) return null;
  }
  if (record.reward !== undefined && (!object(record.reward) || typeof record.reward.amount !== 'number' || !Number.isSafeInteger(record.reward.amount) || record.reward.amount < 0 || Object.keys(record.reward).some(key => key !== 'amount'))) return null;
  // `reward` is bound only at posting — in the same write as the GitHub
  // publication, or with a folder post's `posted` transition. On a record
  // still short of posting it can only have been edited in, and a pre-wave
  // approval predates rewards entirely: it states $0 whatever this field
  // says. A record carrying either shape is not one the tool wrote — it
  // reads corrupt rather than lend a forged amount to a public render or to
  // the promised count (BT11a fix round).
  if (record.reward !== undefined && (record.githubApproval !== undefined || record.github === undefined && (record.stage === 'drafted' || record.stage === 'confirmed' || record.stage === 'waiting'))) return null;
  if (record.answer !== undefined && record.answer !== null && (typeof record.answer !== 'object' || typeof record.answer.commit !== 'string' || !sha.test(record.answer.commit))) return null;
  if (record.conflicts !== undefined && record.conflicts !== null && (typeof record.conflicts !== 'object' || !strings(record.conflicts.paths) || typeof record.conflicts.at !== 'string' || !stamp.test(record.conflicts.at))) return null;
  const github = record.github;
  if (github !== undefined) {
    if (github === null || typeof github !== 'object') return null;
    if (typeof github.repository !== 'string' || !/^[A-Za-z\d_.-]+\/[A-Za-z\d_.-]+$/.test(github.repository) || typeof github.commit !== 'string' || !sha.test(github.commit)) return null;
    // The bound reward lives inside the posted body's format block — a body
    // that is not a string was never written by this tool, so nothing parses
    // a number out of it (BT11a fix round).
    if (typeof github.body !== 'string') return null;
    if (github.formatRead !== undefined && !['absent', 'invalid', 'matches-record', 'differs-from-record'].includes(github.formatRead)) return null;
    if (github.formatRepair !== undefined && !['updated', 'preserved-invalid', 'update-failed'].includes(github.formatRepair)) return null;
    if (github.formatReadAt !== undefined && (typeof github.formatReadAt !== 'string' || !stamp.test(github.formatReadAt))) return null;
    if (github.formatUnavailableAt !== undefined && github.formatUnavailableAt !== null && (typeof github.formatUnavailableAt !== 'string' || !stamp.test(github.formatUnavailableAt))) return null;
    if (github.branch !== undefined && (typeof github.branch !== 'string' || !safeBranch(github.branch))) return null;
    for (const list of [github.seenPullRequests, github.availablePullRequests]) {
      if (list === undefined) continue;
      if (!Array.isArray(list)) return null;
      for (const pr of list) {
        if (pr === null || typeof pr !== 'object' || !Number.isInteger(pr.n) || pr.n < 1 || typeof pr.commit !== 'string' || !sha.test(pr.commit) || typeof pr.at !== 'string' || !stamp.test(pr.at)) return null;
        if (pr.payTo !== undefined && !payToFactShape(pr.payTo)) return null;
      }
    }
    if (github.outside !== undefined && (github.outside === null || typeof github.outside !== 'object'
      || github.outside.issueState !== 'open' && github.outside.issueState !== 'closed'
      || typeof github.outside.at !== 'string' || !stamp.test(github.outside.at)
      || typeof github.outside.answers !== 'string')) return null;
    if (github.unavailableAt !== undefined && github.unavailableAt !== null && (typeof github.unavailableAt !== 'string' || !stamp.test(github.unavailableAt))) return null;
    if (github.pay !== undefined && !payOutcomeShape(github.pay)) return null;
  }
  // BT7c: pending text is tool-written and status prints it. A record written
  // while undo/reject/withdraw existed can carry their names — migrate the
  // wording to the command that retries the same outside work now.
  if (record.github?.pending !== null && record.github?.pending !== undefined) {
    record.github.pending = record.github.pending
      .replace(/box bounty owner answer \S+/g, `box bounty close ${record.id}`)
      .replace(/box bounty owner (?:setup|allow|ask|off|on|summary)\b[^\n;]*/g, 'box bounty config')
      .replace(/retry box bounty (?:undo|reject|withdraw|answer|questions|reply|remind)\b[^\n;]*/, `retry box bounty close ${record.id}`)
      .replace(/local (?:undo|reject|withdraw) stands/g, 'local close stands')
      .replace(/box bounty (?:undo|reject|withdraw|answer|questions|reply|remind)\b[^\n;]*/, `box bounty close ${record.id}`);
  }
  // `outside.answers` is the same kind of stored tool text — the listing
  // listGitHubAnswers printed — replayed verbatim by status and by the
  // open-bounties line while GitHub cannot refresh. Its old collect line
  // named `answer <id> --pr <n>`: point it at the pair that collects that
  // pull request now; any other removed name points back at status.
  if (record.github?.outside !== undefined && typeof record.github.outside.answers === 'string') {
    const answers = record.github.outside.answers
      .replace(/box bounty owner answer (\S+)/g, 'box bounty allow $1')
      .replace(/box bounty owner (?:setup|allow|ask|off|on|summary)\b[^\n;]*/g, 'box bounty config')
      .replace(/box bounty answer (\S+) --pr (\d+)/g, 'box bounty look $1 $2 or box bounty apply $1 $2')
      .replace(/box bounty (?:answer|questions|reply|undo|reject|withdraw|remind)\b[^\n;]*/g, `box bounty status ${record.id}`);
    if (answers !== record.github.outside.answers) {
      record.github = { ...record.github, outside: { ...record.github.outside, answers } };
    }
  }
  return record;
};

export function loadRecord(repoRoot: string, id: string): BountyRecord {
  // Reading a record is the moment a solution merged outside the tool can be
  // recognised: every open bounty is checked first, once per command.
  noticeMergedSolutions(repoRoot);
  const path = recordPath(repoRoot, id);
  if (!existsSync(path)) {
    throw new BountyRefused('unknown-bounty', `no bounty ${id} — .box/bounties/${id}.json does not exist. Run box bounty status to list the bounties this project knows`);
  }
  let record: BountyRecord | null = null;
  try {
    record = asRecord(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    record = null;
  }
  if (record === null) {
    throw new BountyRefused('record-corrupt', `${path} is not a readable bounty record — open it by hand, or remove it and run box bounty status again`);
  }
  return record;
}

// `bounty create` calls this after the folder is in place: pin the snapshot
// commit under refs/box-bounty/<id> so gc cannot prune it, then write the
// record at stage `drafted`. A Git failure here is operational (exit 1) — the
// folder already exists and the error says so.
export function writeNewRecord(repoRoot: string, seed: RecordSeed): { record: BountyRecord; path: string } {
  const record: BountyRecord = {
    schemaVersion: 1,
    kind: 'box-bounty-record',
    id: seed.id,
    title: seed.title,
    resume: seed.resume ?? { kind: 'not-recorded' },
    noteSource: seed.noteSource ?? 'legacy',
    ...(seed.why !== undefined ? { why: seed.why } : {}),
    ...(seed.job !== undefined ? { job: seed.job } : {}),
    ...(seed.manifestSha256 !== undefined ? { manifestSha256: seed.manifestSha256 } : {}),
    stage: 'drafted',
    folder: seed.folder,
    snapshot: { ...seed.snapshot },
    createdAt: seed.createdAt,
    ...(seed.scanFindings !== undefined && seed.scanFindings.length > 0 ? { scanFindings: seed.scanFindings } : {}),
    events: [{ stage: 'drafted', at: seed.createdAt }]
  };
  git(repoRoot, ['update-ref', refName(seed.id), seed.snapshot.commit]);
  const path = recordPath(repoRoot, seed.id);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(record, null, 2) + '\n');
  syncOpenSurfaces(repoRoot);
  return { record, path };
}

export function listRecords(repoRoot: string): ListedBounty[] {
  // Same check as loadRecord: whichever a command touches first runs the
  // merged-solution scan before the records are read.
  noticeMergedSolutions(repoRoot);
  const dir = recordDir(repoRoot);
  if (!existsSync(dir)) return [];
  const listed: ListedBounty[] = [];
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.json')) continue;
    let record: BountyRecord | null = null;
    try {
      record = asRecord(JSON.parse(readFileSync(join(dir, entry), 'utf8')));
    } catch {
      record = null;
    }
    listed.push({ record, file: entry });
  }
  listed.sort((a, b) => (a.record?.createdAt ?? a.file).localeCompare(b.record?.createdAt ?? b.file));
  return listed;
}

// The saved job context, under the bounty it belongs to: `indent` places it
// inside that bounty's lines.
export function renderResume(record: BountyRecord, indent = ''): string {
  const context = record.resume;
  if (context?.kind !== 'recorded') return [`${indent}Return to your job`, `${indent}  The branch, commit and changed files were not recorded for this older bounty.`].join('\n');
  return [`${indent}Saved job context (${record.id}) — where the work stood when the bounty was created`, `${indent}  branch: ${showPath(context.branch)}; commit: ${context.commit}`, `${indent}  changed files: ${context.changed.length === 0 ? 'none' : context.changed.map(showPath).join(', ')}`, ...(context.note === null ? [] : [`${indent}  note: ${JSON.stringify(context.note)}`])].join('\n');
}

const ATTEMPT_WORD: Record<AttemptOutcome, string> = {
  answered: 'arrived — nothing in it was run',
  // Words for attempts recorded while checks existed: the record still says
  // what the check did back then — history, not a current promise.
  verified: 'the declared check exited 0 on it (checks were removed on 11 October 2026)',
  'check-failed': 'the declared check exited nonzero on it (checks were removed on 11 October 2026)',
  'check-unrunnable': 'the declared check could not run (checks were removed on 11 October 2026)',
  'check-not-run': 'the declared check was not run on it (checks were removed on 11 October 2026)'
};

// A report was written when its answer arrived and ends with the step that
// followed then. Replayed inside status, that line is left out: the bounty's
// own next step is stated once, from what is true now.
const notNext = (line: string): boolean => !line.trimStart().startsWith('next:');

const nextStep = (record: BountyRecord): string => {
  switch (record.stage) {
    case 'drafted': return `deliver it — run box bounty post ${record.id} --to <dir|github> (preview first with --preview); if the owner has not allowed the tool, the post waits and prints what they run`;
    case 'confirmed': return `deliver it — run box bounty post ${record.id} --to <dir>`;
    case 'waiting': return `waiting for the owner — ${waitingSummary(record)}`;
    case 'posted': {
      if (record.github !== undefined) return `box bounty look ${record.id} <number> collects a pull request and shows its change; box bounty apply ${record.id} <number> collects and merges; box bounty status ${record.id} --comments reads other accounts' comments`;
      const count = attemptsOf(record).length;
      if (count === 0) return `wait for the solver — when the bounty folder comes back, collect it with box bounty look ${record.id} --from <dir> to read it, or box bounty apply ${record.id} --from <dir> to merge it`;
      return `the bounty is still open with ${count} recorded ${count === 1 ? 'attempt' : 'attempts'} — collect another return with box bounty apply ${record.id} --from <dir>, or end it with box bounty close ${record.id}`;
    }
    case 'taken': return 'a solution is being read against the snapshot it was made for — run box bounty status again in a moment';
    case 'answered':
    case 'verified': {
      const conflicts = record.conflicts?.paths;
      if (record.github !== undefined) {
        if (conflicts !== undefined && conflicts.length > 0) return `the last merge try conflicted in ${conflicts.map(showPath).join(', ')} — read the solution with box bounty look ${record.id} <n>; once its commit is merged on the bounty's branch the next bounty command closes it, or end it with box bounty close ${record.id} --reason "<why>"`;
        return `box bounty look ${record.id} <n> to read a solution; box bounty apply ${record.id} <n> to choose one; box bounty status ${record.id} --full for reports and history`;
      }
      if (conflicts !== undefined && conflicts.length > 0) {
        return `the last merge try conflicted in ${conflicts.map(showPath).join(', ')} — read the solution with box bounty look ${record.id} <n>; once its commit is merged on the bounty's branch the next command closes it, or end it with box bounty close ${record.id} --reason "<why>"`;
      }
      const applicable = applicableAttempts(attemptsOf(record));
      if (applicable.length === 0) {
        return `no attempt has a usable result — name one anyway with box bounty apply ${record.id} <n>, or end the bounty with box bounty close ${record.id} --reason "<why>"`;
      }
      if (applicable.length === 1) {
        const n = applicable[0]!.n;
        return `attempt ${n} waits on a decision — run box bounty apply ${record.id} ${n} to merge it onto the current code, or box bounty close ${record.id} --reason "<why>"`;
      }
      return `attempts ${applicable.map(attempt => `#${attempt.n}`).join(' and ')} could be applied — pick one with box bounty apply ${record.id} <n>, or end it with box bounty close ${record.id} --reason "<why>"`;
    }
    default: return 'ended — nothing to do';
  }
};

// What a waiting bounty waits on, in one clause — used by status and by the
// lines a held command prints.
export function waitingSummary(record: BountyRecord): string {
  const waiting = record.waiting;
  if (waiting === undefined) return 'the owner decides';
  const target = waiting.to === 'github' ? ' to GitHub' : waiting.to !== undefined ? ` to ${waiting.to}` : '';
  switch (waiting.reason) {
    case 'owner-allow': return `the owner has not allowed the tool — posting${target} waits for them (since ${waiting.at})`;
    case 'owner-ask': return `the owner asked to be asked each time — this post${target} waits for them (since ${waiting.at})`;
    case 'owner-off': return `the owner turned the permission off — this post${target} waits for them (since ${waiting.at})`;
    case 'secrets': return `the pre-publish scan found ${waiting.hits?.length ?? 0} secret-shaped hit(s) — this post${target} waits for the owner (since ${waiting.at})`;
    case 'untracked-file': return `an untracked file was named for publishing — this post${target} waits for the owner (since ${waiting.at})`;
  }
}

// The lines a held post prints, addressed to the agent: what to put to the
// owner and the one command they run. Owner commands exist under `box bounty
// owner`, the plainly named group the description never offers an agent.
export function ownerWaitLines(repoRoot: string, record: BountyRecord, read: DecisionRead): string[] {
  const id = record.id;
  if (read.decision === 'ask' || read.decision === 'off') {
    return [
      `the owner ${read.decision === 'ask' ? 'asked to be asked each time' : 'turned the permission off — it is on file marked off'}.`,
      `the owner answers this one with: box bounty allow ${id}`
    ];
  }
  const { amount } = repoReward(repoRoot);
  return [
    'Ask the owner in your own words. Bounties are public under the owner\'s GitHub account. A solution the agent chooses is merged into the owner\'s code. This decision covers this repository only.',
    `Each bounty states the reward the owner set for this repository — ${amount === 0 ? '$0 unless the owner names one, so no payment is promised now' : `$${amount}, a promise in the owner's name paid by hand`}. The yes at $0: box bounty allow. With a promise: box bounty allow --reward <whole dollars> --reward-limit <whole dollars>`,
    'These are the same choices shown by bare box bounty config:',
    `  ${DECISION_WORDS.allow}: box bounty allow`,
    `  ${DECISION_WORDS.ask}: box bounty allow --ask`,
    `  ${DECISION_WORDS.once}: box bounty allow ${id}`,
    'Ask mode covers publishing only; merging is not gated.',
    'box bounty config shows every setting and the command that changes it.'
  ];
}

// History events record the command that drove them, and records written
// while older commands existed keep those names on disk — history is never
// rewritten. Status prints the vocabulary the agent can act on, so the view
// maps each removed name to what replaced it ('revert' reads as plain Git —
// undo has no replacement command).
const EVENT_COMMAND_VIEW: Record<string, string> = { answer: 'look', reject: 'close', withdraw: 'close', undo: 'revert', confirm: 'post', 'owner answer': 'allow', 'owner allow': 'allow', 'owner ask': 'allow --ask', 'owner off': 'deny', 'owner on': 'allow', 'owner setup': 'config', 'owner summary': 'status --since' };
const historyJson = (event: StageEvent): string =>
  JSON.stringify(event.command === undefined || EVENT_COMMAND_VIEW[event.command] === undefined ? event : { ...event, command: EVENT_COMMAND_VIEW[event.command] });

// What open bounties here promise: the sum of the reward bound into each
// open record at posting (BT11a). Records from before then carry none and
// count as $0 — closing a bounty, merged or not, ends its count because the
// record is no longer open. This repository is what the tool can see; the
// owner keeps the limit with that horizon in mind.
export function promisedTotal(open: readonly ListedBounty[]): number {
  // The bound amount, not the editable `reward` summary: for a GitHub-posted
  // bounty that is the amount inside the body the tool posted, so an edited
  // record cannot shrink what open bounties promise (BT11a fix round).
  return open.reduce((sum, entry) => sum + (entry.record === null ? 0 : boundAmount(entry.record) ?? 0), 0);
}

// The reward side of `status`/`config`: what each new bounty on this
// repository will state, what its open bounties already promise, this
// repository's own limit and what is left of it (BT11c — one repository's
// money never leans on another's). A record written before BT11a counts $0 —
// the amount it was posted with.
function rewardStatusLine(repoRoot: string, open: readonly ListedBounty[]): string {
  const { amount, limit } = repoReward(repoRoot);
  const promised = promisedTotal(open);
  const stated = amount === 0 ? 'each new bounty states $0 — no payment is promised' : `each new bounty states $${amount} — a promise in the owner's name, paid by hand`;
  const counted = limit === null ? `open bounties here promise $${promised}; no limit is set` : `open bounties here promise $${promised} of a $${limit} limit — ${promised <= limit ? `$${limit - promised} left` : `$${promised - limit} over`}`;
  return `reward: ${stated}; ${counted}; the owner sets both for this repository in box bounty config`;
}

// The money gate every fresh post passes (BT11a, scoped per repository in
// BT11c): this repository's own reward in force now, checked against this
// repository's own limit on what its open bounties promise. Runs before
// anything is written — a refused post changes nothing. The needs-limit
// refusal also covers a hand-edited settings file: the shape is checked on
// load, but reward>limit is a rule about the pair on one entry, enforced
// where it is written and again where it is spent.
export function rewardForPost(repoRoot: string): { readonly amount: number } {
  const { amount } = repoReward(repoRoot);
  assertPromiseRoom(repoRoot, amount);
  return { amount };
}

// The limit gate itself, run for a stated amount: once early so a refused
// post touches nothing, and again inside the promise lock at the moment the
// record binds — the lock makes the check and the write one span, so two
// posts running at once cannot both pass (BT11a fix round). The limit is the
// posting repository's own — another repository's cap never applies here.
export function assertPromiseRoom(repoRoot: string, amount: number): void {
  const { limit } = repoReward(repoRoot);
  if (amount <= 0) return;
  if (limit === null || limit < amount) throw new BountyRefused('reward-needs-limit', `each bounty states $${amount}, but ${limit === null ? 'no limit is set' : `the limit is $${limit}, below it`} — the owner sets the most that may be promised with box bounty config set reward-limit <whole dollars>; nothing was posted`);
  const promised = promisedTotal(listRecords(repoRoot).filter(entry => entry.record !== null && isOpenStage(entry.record.stage)));
  if (promised + amount > limit) throw new BountyRefused('promise-limit-exceeded', `posting would bring promised rewards to $${promised + amount} across this repository's open bounties — the owner's limit is $${limit}; nothing was posted`);
}

// One directory, one mkdir — atomic on every filesystem the tool runs on. A
// post holds it only for the span that re-reads the promised total and writes
// the record, so the check and the write cannot interleave with another
// post's. A lock that outlives a minute is the corpse of a killed process:
// swept, not waited on — the critical span is local file work, far shorter.
const PROMISE_LOCK_STALE_MS = 60_000;
const PROMISE_LOCK_WAIT_MS = 3_000;
export function withPromiseLock<T>(repoRoot: string, run: () => T): T {
  const lock = join(repoRoot, '.box', 'promise.lock');
  mkdirSync(dirname(lock), { recursive: true });
  const giveUp = Date.now() + PROMISE_LOCK_WAIT_MS;
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch {
      // A held lock is waited out briefly; one that vanished mid-check is
      // retried at once; a stale one is removed and the loop retries.
      try {
        if (Date.now() - statSync(lock).mtimeMs > PROMISE_LOCK_STALE_MS) { rmSync(lock, { recursive: true, force: true }); continue; }
      } catch { continue; }
      if (Date.now() >= giveUp) throw new BountyRefused('promise-limit-busy', 'another command is binding a bounty reward right now — run this post again in a moment; nothing was posted');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  try {
    return run();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

// Cold-read surface for a fresh agent: every open bounty with id, stage, its
// attempts (passing first), the top attempt's fact report, a fresh merge read
// of the current code, and the next step; ended bounties one compact line; an
// empty project says so and says what to do. `--comments` prints the issue's
// comments marked as written by others. Never prints nothing.
// The owner-decision line status always carries: what is written for this
// repository and when it last changed. Nothing written says so — it is
// never read as allowed.
export function ownerStatusLine(repoRoot: string): string {
  const read = readDecision(repoRoot);
  if (read.denied) return `owner: this repository is no longer allowed; denied at ${read.at}; all-projects does not apply after deny`;
  const where = read.level === 'project' ? 'this project' : 'all projects';
  switch (read.decision) {
    case 'allowed': return `owner: allowed for ${where} (changed ${read.at})`;
    case 'ask': return `owner: ask me each time (${where}, changed ${read.at})`;
    case 'off': return `owner: off — the tool asks each time (${where}, changed ${read.at})`;
    case null: return 'owner: nothing written — the first post will wait for the owner';
  }
}

// Every scan finding on the record, one line per hit — what was flagged and
// what happened. Open bounties print these inside their block; ended ones
// print them on the asked-for or last-ended detail (every one under --full),
// so a settled hit stays visible for as long as the record does.
const scanFindingLines = (record: BountyRecord, indent: string): string[] => {
  const out: string[] = [];
  for (const finding of record.scanFindings ?? []) {
    for (const hit of finding.hits) {
      out.push(`${indent}scan finding${finding.where === 'create' ? ' (recorded at create)' : ''}: ${hit.path}:${hit.line} (${hit.rule}) — ${finding.settled ?? 'flagged — unsettled'}`);
    }
  }
  return out;
};

export function renderStatus(repoRoot: string, options: { readonly id?: string; readonly full?: boolean; readonly comments?: boolean } = {}): string {
  if (options.id !== undefined) loadRecord(repoRoot, options.id);
  const listed = listRecords(repoRoot).filter(entry => options.id === undefined || entry.record?.id === options.id);
  for (const entry of listed) {
    if (entry.record !== null && isOpenStage(entry.record.stage)) refreshGitHubStatus(repoRoot, entry.record);
    else if (entry.record !== null && options.full) refreshGitHubFormat(repoRoot, entry.record);
  }
  const open = listed.filter(entry => entry.record !== null && isOpenStage(entry.record.stage));
  const ended = listed.filter(entry => entry.record !== null && !isOpenStage(entry.record.stage));
  const corrupt = listed.filter(entry => entry.record === null);
  const lines: string[] = [];
  for (const entry of listed) {
    const record = entry.record;
    if (record?.github === undefined) continue;
    const publication = record.github;
    if (publication.formatUnavailableAt !== undefined && publication.formatUnavailableAt !== null) lines.push(`${record.id} current GitHub format read unavailable at ${publication.formatUnavailableAt}; cached last comparison ${publication.formatRead ?? 'not read'} at ${publication.formatReadAt ?? 'time not recorded'}; local record governs`);
    else if (publication.formatRead !== undefined) lines.push(`${record.id} GitHub format block: ${publication.formatRead} (last issue-body observation ${publication.formatReadAt ?? 'time not recorded'}; local record governs)`);
    if (!isOpenStage(record.stage) && !options.full) lines.push(`${record.id} compact status uses the cached last observation; current comparison: box bounty status ${record.id} --full`);
  }
  for (const entry of listed) if (entry.record?.github?.formatRepair !== undefined) lines.push(`${entry.record.id} GitHub format update: ${entry.record.github.formatRepair}`);
  lines.push(ownerStatusLine(repoRoot));
  lines.push(rewardStatusLine(repoRoot, open));
  const rewardNotice = rewardNoticeLine();
  if (rewardNotice !== null) lines.push(rewardNotice);
  const localMerge = localFirstMergeLine(repoRoot);
  if (localMerge !== null) lines.push(localMerge);
  for (const [address, notice] of Object.entries(loadSettings().firstMerges)) {
    if (listed.some(entry => entry.record?.events.some(event => event.stage === 'applied' && event.merge === notice.commit))) {
      lines.push(`first outside solution merged in ${address}: commit ${notice.commit} at ${notice.at}`);
    }
  }
  lines.push(...instructionNotices(repoRoot));
  if (open.length === 0) {
    lines.push(`box bounty status — no open bounties in ${repoRoot}`);
    if (options.id === undefined && ended.length === 0) lines.push('next: create one with box bounty create --task <file> --why "<one line>"');
  } else {
    lines.push(`box bounty status — ${open.length} open ${open.length === 1 ? 'bounty' : 'bounties'} in ${repoRoot}`);
    for (const entry of open) {
      const record = entry.record!;
      lines.push(`  ${record.id}  ${record.stage}  "${record.title}"`);
      const attempts = attemptsOf(record);
      const unseen = attempts.filter(attempt => attempt.seenAt === undefined).length;
      // What an agent needs to act comes first; this is the bounty's one `next:`.
      lines.push(`      ${attempts.length} collected solution(s)${attempts.length > 0 ? ` (${unseen} new, ${attempts.length - unseen} shown before)` : ''}; next: ${nextStep(record)}`);
      const pays = (boundAmount(record) ?? 0) > 0;
      for (const attempt of attempts) if (attempt.seenAt !== undefined) lines.push(`      solution #${attempt.n}: seen and not decided, age ${seenAge(attempt.seenAt)}${pays && attempt.payTo !== undefined ? `; ${payToLine(attempt.payTo)}` : ''}`);
      for (const pr of record.github?.seenPullRequests ?? []) if (!attempts.some(attempt => attempt.commit === pr.commit) && record.github?.availablePullRequests?.some(available => available.n === pr.n && available.commit === pr.commit)) lines.push(`      pull request #${pr.n}: seen and not decided, age ${seenAge(pr.at)}${pays && pr.payTo !== undefined ? `; ${payToLine(pr.payTo)}` : ''}`);
      if (record.waiting !== undefined) {
        const liveFinding = (record.scanFindings ?? []).some(finding => finding.settled === null);
        for (const hit of record.waiting.hits ?? []) {
          if (record.waiting.reason === 'secrets' && liveFinding) break; // the finding below names the same hits
          lines.push(`      scan hit: ${hit.path}:${hit.line} (${hit.rule})`);
        }
        lines.push(record.waiting.reason === 'secrets'
          ? '      the owner decides in box bounty config — the path goes on safe to publish or never publish there'
          : `      the owner answers this one with: box bounty allow ${record.id}`);
      }
      lines.push(...scanFindingLines(record, '      '));
      if (record.github?.questions !== undefined) lines.push(`      comments from other accounts: ${record.github.questions.count}${record.github.questions.unnamed === undefined ? '' : ` (${record.github.questions.unnamed} from an account whose name could not be read)`}; latest: ${record.github.questions.latestAt ?? 'none'}; read: box bounty status ${record.id} --comments`);
      // `--comments` prints the issue's comments, each line marked as written
      // by another account — the issue is bound to this bounty first, so a
      // record pointed at the wrong issue is a named refusal, not a leak.
      if (options.comments === true && record.github !== undefined && record.github.issue !== null) {
        const comments = issueComments(repoRoot, record);
        lines.push(`      ${comments.length} comment(s) written by others, not by the tool:`);
        for (const comment of comments) {
          lines.push(`        ${comment.author === null ? 'an account whose name could not be read' : JSON.stringify(comment.author)} at ${comment.at}:`);
          for (const line of comment.body.split('\n')) lines.push(`          other account | ${quoteForeign(line)}`);
        }
        lines.push(`      next: answer on issue ${record.github.issue.number} in your own words with your own gh — gh issue comment ${record.github.issue.number} --body "<your own words>"; or box bounty status ${record.id}`);
      }
      lines.push(renderResume(record, '      '));
      // The github: facts and the outside-state header are the long form's —
      // reviews found agents never used them in the short one. What stays
      // actionable in the short form: a pending outside action, the answers
      // still waiting (one already collected is under `attempts`), and the
      // command that collects them.
      if (options.full && record.github !== undefined) lines.push(`      github: ${record.github.repository} ${record.github.branch} ${record.github.issue?.url ?? 'issue pending'} (${record.github.state}${record.github.kind !== 'history' ? ', snapshot-posted — from before the bounty became an issue on the code that is already there' : ''})${record.github.pending !== null ? `; ${record.github.pending}` : ''}`);
      if (!options.full && record.github?.pending !== null && record.github?.pending !== undefined) lines.push(`      github: ${record.github.pending}`);
      if (record.github?.unavailableAt !== null && record.github?.unavailableAt !== undefined) lines.push(`      github-status-unavailable: could not refresh at ${record.github.unavailableAt}; last recorded outside state ${record.github.outside?.at ?? 'not yet read'}; retry box bounty status`);
      if (record.github?.outside !== undefined) {
        if (options.full) lines.push(`      outside state recorded ${record.github.outside.at}: issue ${record.github.outside.issueState}`);
        for (const line of record.github.outside.answers.split('\n')) {
          if (!options.full && (line.startsWith('GitHub answers for ') || line.includes('collected as solution'))) continue;
          lines.push(`      ${line}`);
        }
        if (attemptsOf(record).length === 0) lines.push(`      collect: box bounty look ${record.id} <number> or box bounty apply ${record.id} <number>`);
        record.github.seenPullRequests = [...record.github.seenPullRequests ?? [], ...record.github.availablePullRequests?.filter(pr => !record.github?.seenPullRequests?.some(seen => seen.n === pr.n && seen.commit === pr.commit)) ?? []];
        persistRecord(repoRoot, record);
      }
      if (attempts.length > 0) {
        const applicable = applicableAttempts(attempts);
        const ordered = [...attempts].sort((a, b) => {
          const aOk = a.outcome === 'verified' || a.outcome === 'answered' ? 0 : 1;
          const bOk = b.outcome === 'verified' || b.outcome === 'answered' ? 0 : 1;
          return aOk - bOk || a.n - b.n;
        });
        lines.push(`      attempts (${attempts.length}):`);
        for (const attempt of ordered) {
          lines.push(`        #${attempt.n} ${attempt.outcome} — ${ATTEMPT_WORD[attempt.outcome]}; ${attempt.seenAt === undefined ? 'new' : `seen since ${attempt.seenAt}`}${attempt.author !== undefined ? `; from GitHub account ${attempt.author}` : ''}${pays && attempt.payTo !== undefined ? `; ${payToLine(attempt.payTo)}` : ''}${attempt.conflicts !== null && attempt.conflicts.length > 0 ? `; merges with conflicts in ${attempt.conflicts.map(showPath).join(', ')}` : ''}`);
        }
        const top = ordered[0]!;
        if ((record.github === undefined || options.full) && top.report.length > 0) {
          lines.push(`      report — attempt #${top.n}, recorded ${top.at}:`);
          for (const line of top.report.filter(notNext)) lines.push(`        ${line}`);
        } else if (record.github === undefined || options.full) {
          lines.push(`      this attempt was recorded before fact reports existed — the commit ${top.commit} is pinned at refs/box-bounty/${record.id}-answer`);
        }
        if (applicable.length > 0 && (record.github === undefined || options.full)) {
          const fresh = dryMergeOnto(repoRoot, applicable[0]!.commit);
          lines.push(`      current code now: ${fresh.kind === 'clean' ? 'attempt #' + applicable[0]!.n + ' would merge cleanly onto the current branch' : fresh.kind === 'conflict' ? `attempt #${applicable[0]!.n} would conflict in ${fresh.paths.map(showPath).join(', ')}` : `the merge cannot be tested — ${fresh.detail}`}`);
        }
        record.attempts = attempts.map(attempt => attempt.seenAt === undefined ? { ...attempt, seenAt: new Date().toISOString() } : attempt);
        persistRecord(repoRoot, record);
        if (options.full) for (const attempt of ordered.slice(1)) {
          lines.push(`      report: solution #${attempt.n}, recorded ${attempt.at}`);
          for (const line of attempt.report.filter(notNext)) lines.push(`        ${line}`);
        }
      }
      if (options.full) for (const event of record.events) lines.push(`      history: ${historyJson(event)}`);
    }
  }
  if (ended.length === 0) lines.push('ended: none');
  else lines.push(`ended: ${ended.map(entry => {
    const record = entry.record!;
    // A bounty that once flagged secret-shaped content keeps the fact on this
    // line, so the compact list still tells the owner to look — the finding
    // itself prints on the detail below (or under status <id> / --full).
    const finding = (record.scanFindings ?? []).length > 0 ? ' — scan finding recorded' : '';
    // A bounty with a reward that ended on a merge keeps whom to pay on the
    // line — a record the owner can read whenever they wish, not a reminder.
    const pay = record.github?.pay;
    const paid = pay !== undefined ? `; pay $${boundAmount(record) ?? '?'} to ${pay.solver ?? 'the solver'}` : '';
    // applied/rejected/undone name the job the bounty came from, so the record
    // alone says which piece of work is unblocked — falling back to the title.
    if (record.stage === 'applied' || record.stage === 'rejected' || record.stage === 'undone') return `${record.id} ${record.stage}${finding}${paid} (job: ${record.job?.file ?? record.title})`;
    return `${record.id} ${record.stage}${finding}${paid}`;
  }).join(', ')}`);
  // The job to go back to stays on show after a bounty ends: for the bounty that
  // was asked for by id, or else for the one that ended last.
  const lastEnded = [...ended].sort((a, b) => (a.record!.events.at(-1)?.at ?? '').localeCompare(b.record!.events.at(-1)?.at ?? '')).at(-1)?.record ?? null;
  for (const entry of ended) {
    if (entry.record === null) continue;
    const detailed = options.id !== undefined || entry.record === lastEnded;
    if (detailed) {
      lines.push(renderResume(entry.record, '  '));
      const pay = entry.record.github?.pay;
      if (pay !== undefined) {
        lines.push(`  pay: ${pay.pr !== null ? `pull request ${pay.pr}` : 'the returned folder'}${pay.solver !== null ? ` by ${pay.solver}` : ''} was merged — pay $${boundAmount(entry.record) ?? '?'} to ${pay.solver ?? 'the solver'}${pay.link !== null ? ' at the link they supplied' : ' — no recognised payment link was given'} — a record, not a reminder`);
      }
      // The finding stays visible after the bounty ends — the owner learns a
      // flagged file sat in their working tree even when the agent stopped it.
      lines.push(...scanFindingLines(entry.record, '  '));
      // With a bounty still open, that bounty's line above is the next step.
      if (open.length === 0) lines.push(`  next: continue the saved job${entry.record.stage === 'applied' ? `; to reverse the merge: git revert -m 1 ${entry.record.events.find(event => event.stage === 'applied')?.merge ?? '<merge>'}` : ''}; inspect: box bounty status ${entry.record.id} --full; or create another with box bounty create --task <file> --why "<one line>"`);
    } else if (options.full) {
      lines.push(...scanFindingLines(entry.record, '  '));
    }
    if (options.full && entry.record !== null) {
      for (const event of entry.record.events) lines.push(`  history: ${historyJson(event)}`);
      for (const attempt of attemptsOf(entry.record)) for (const line of attempt.report.filter(notNext)) lines.push(`  ${line}`);
    }
    if (entry.record?.github?.pending !== null && entry.record?.github?.pending !== undefined) lines.push(`  ${entry.record.id}: ${entry.record.github.pending}`);
  }
  for (const entry of corrupt) lines.push(`  ! ${entry.file} — not a readable record`);
  return lines.join('\n');
}

// `box bounty help` — the whole journey on one screen, for an agent that has
// never seen the tool: what each command does and the stage it leaves, what
// ends a bounty, and the minimum create needs. It reads no repository, so it
// works outside a checkout too. Keep it in step with BOUNTY.md.
export function renderHelp(): string {
  return [
    'box bounty — hand off work you cannot or should not do: packaged safely, remembered in the project, returned as facts.',
    'GitHub posting is free and public, only to this project\'s already-public repository. Nobody is known to be watching these issues. Local folders remain available.',
    'the owner allows the tool once — a decision kept in the owner\'s own settings outside the repository. Until then the first post waits and prints the few lines to put to them. post <id> --to github --preview shows exactly what becomes public — the commit already there, unpushed commits, and only the uncommitted work you ask for (--with-changes, --include <file>). status reads the pull requests waiting; look <id> <n> collects one and shows its change. Every bounty states the reward the owner set for its repository — $0 until the owner sets one in box bounty config.',
    '',
    'the journey (what each command does → the stage it leaves):',
    '  create    snapshot the repository minus never-ship files, with the task and a note; prints the preview → drafted',
    '  post      first delivery: copies the folder to --to <dir>/<id>, or publishes the GitHub issue and branch → posted — or waits on the owner',
    '  status    every open bounty, the pull requests waiting, the attempts and the next step; --comments prints comments written by others, marked as theirs',
    '  look [id] <n>  collect pull request n (or show solution n already collected) — its change, written by the solver and marked as theirs; a returned folder goes to --from <dir>; --full prints a large change',
    '  apply [id] [<n>]  merge a solution onto the current code — collects like look when n names a pull request; --from <dir> collects a returned folder — the recorded decision → applied',
    '  close [id]  end a bounty with nothing merged; --reason "<why>" stays on the record → rejected, without it → withdrawn',
    '  hook      owner-opt-in awareness at session moments: on --host <name> prints the full disclosure and changes nothing until run again with the flag it names; off removes it; start|pause|finish is the command a host entry runs',
    '  describe  what the tool does, when it is worth using and when not, plus the facts to choose — --rules prints the block for a project\'s rules file',
    '  help      this screen',
    '',
    '  create needs only judgement: --task <file> and --why "<one line>" — title, place to write and the hand-off note have defaults.',
    '  create --resume "<short note>" saves private job context. With one open bounty, commands accept no id.',
    '  status [id] shows the next action; --full adds history and the full reports.',
    '',
    'nothing a solver wrote is ever run — checks were removed on 11 October 2026: a solution arrives as a',
    'numbered attempt, the report states facts about the change, and apply/close is always your call.',
    '',
    'what ends a bounty: apply, or close — or a solution merged onto the bounty\'s branch with your own',
    'Git, which the next bounty command recognises. A merge is one ordinary commit: git revert -m 1',
    'reverses it whenever you like, no tool command needed. A solution that does not land never ends',
    'the bounty — it is kept as a numbered attempt and the bounty stays open.',
    '',
    `needs: git ${GIT_LEAST} or later; GitHub bounties also need GitHub CLI gh ${GH_LEAST} or later, signed in.`,
    'run inside a git checkout or pass --repo <path>; every refusal names itself and exits 3, usage errors exit 2.',
    'the record lives at .box/bounties/<id>.json inside the repository — it outlives the session that made it.'
  ].join('\n');
}

// Appends one stage event and persists — history is appended, never rewritten.
// `reason` records why a `rejected` transition happened (and, on older records,
// why a `posted` one went back); `destination` records where `posted` went;
// `attempt`, `command` and `merge` say which attempt a transition was about,
// which command drove it and which commit it made — so the history alone says
// what ended the bounty and on which attempt.
export const transitionTo = (repoRoot: string, record: BountyRecord, stage: BountyStage, extra?: { destination?: string; reason?: string; attempt?: number; command?: string; merge?: string }): void => {
  record.events.push({
    stage,
    at: new Date().toISOString(),
    ...(extra?.destination !== undefined ? { destination: extra.destination } : {}),
    ...(extra?.reason !== undefined ? { reason: extra.reason } : {}),
    ...(extra?.attempt !== undefined ? { attempt: extra.attempt } : {}),
    ...(extra?.command !== undefined ? { command: extra.command } : {}),
    ...(extra?.merge !== undefined ? { merge: extra.merge } : {})
  });
  record.stage = stage;
  if (stage !== 'waiting') delete record.waiting; // a landed action is no longer held
  persistRecord(repoRoot, record);
};

// An action held for the owner: mark the record so status and the
// open-bounties line show the named waiting state. A bounty already waiting
// keeps its first wait time — the state does not move just because the same
// held command ran again. A recorded owner answer carries forward only
// while the wait is still the same action to the same destination — a hold
// the answered rerun uncovered keeps it; a different held action never
// inherits it.
export function waitForOwner(repoRoot: string, record: BountyRecord, waiting: WaitingFor): void {
  const carried = record.waiting !== undefined && record.waiting.for === waiting.for && record.waiting.to === waiting.to ? record.waiting.answered : undefined;
  record.waiting = { ...waiting, at: record.waiting?.at ?? waiting.at, ...(carried !== undefined ? { answered: carried } : {}) };
  if (record.stage === 'waiting') persistRecord(repoRoot, record);
  else transitionTo(repoRoot, record, 'waiting');
}

// What the owner was shown would be published, compared field by field —
// the shape WaitingFor.shown and WaitingFor.answered.shown both carry.
export function sameShown(a: WaitingFor['shown'], b: WaitingFor['shown']): boolean {
  return a !== undefined && b !== undefined
    && a.base === b.base && a.head === b.head && a.tip === b.tip
    && a.pushed.join('\n') === b.pushed.join('\n')
    && a.include.join('\n') === b.include.join('\n')
    && a.leftHome === b.leftHome && a.untracked === b.untracked;
}

// `confirm` is removed (BT8): the owner allows the tool once, in the owner's
// own settings — not once per bounty. Records already `confirmed` still
// post: the owner's written yes on the record stands, and `post` verifies
// the approved plan against live state as before (github-preview-stale).


const toPosix = (path: string): string => path.split('\\').join('/');

// The canonical path a not-yet-existing target will land at: walk up to the
// nearest EXISTING ancestor, realpath it, then re-append the missing tail. A
// junction at any existing level resolves to its real location, so a --to or
// --out spelling under a junction pointing into the repository can no longer
// slip an inside-the-repo destination past the containment checks.
export function canonicalForNew(target: string): string {
  const tail: string[] = [];
  let cursor = target;
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) return target; // no existing ancestor — keep the spelling
    tail.unshift(basename(cursor));
    cursor = parent;
  }
  return join(realpathSync(cursor), ...tail);
}

export function renderOpenLine(repoRoot: string): string {
  const open = listRecords(repoRoot).filter(entry => entry.record !== null && isOpenStage(entry.record.stage));
  if (open.length === 0) return 'open bounties: none';
  return `open bounties: ${open.map(entry => {
    const record = entry.record!;
    const github = record.github;
    return `${record.id} "${record.title}" (${record.stage})${github !== undefined ? ` ${github.issue?.url ?? 'github issue pending'} ${github.branch}${github.outside !== undefined ? `; ${github.outside.answers.replaceAll('\n', ' ')}` : ''}` : ''}`;
  }).join(', ')}`;
}

// Keep the detailed local listing separate from the fixed instruction block.
function syncOpenSurfaces(repoRoot: string): void {
  writeFileSync(join(recordDir(repoRoot), 'OPEN'), `${renderOpenLine(repoRoot)}\n`);
  for (const line of syncInstructions(repoRoot)) if (line.includes('refused')) instructionNoticeListener?.(line);
}
let instructionNoticeListener: ((line: string) => void) | undefined;
export function setInstructionNoticeListener(listener: (line: string) => void): void { instructionNoticeListener = listener; }
function seenAge(at: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(at)) / 60000));
  if (!Number.isFinite(minutes)) return 'unknown';
  return minutes < 60 ? `${minutes} minute(s)` : minutes < 1440 ? `${Math.floor(minutes / 60)} hour(s)` : `${Math.floor(minutes / 1440)} day(s)`;
}
export function renderOverview(repoRoot: string): string {
  return ['box bounty can hand work to an outside solver; box bounty describe says when it is worth using.', renderStatus(repoRoot)].join('\n');
}

// The decision gate every post and every tool-driven outside close passes.
// `answered` is true only inside `box bounty allow` — the owner's own
// one command, which completes the held action without writing a standing
// decision. Allowed or answered returns the read; anything else marks the
// record waiting and refuses by name with the lines for the owner.
export function ownerGate(repoRoot: string, record: BountyRecord, action: { for: 'post'; to: string; choice?: WaitingFor['choice'] }): { read: DecisionRead; reused?: true } {
  const read = readDecision(repoRoot);
  if (read.decision === 'allowed') return { read };
  const reason = read.decision === 'ask' ? 'owner-ask' : read.decision === 'off' ? 'owner-off' : 'owner-allow';
  let shown: WaitingFor['shown'];
  if (action.to === 'github') {
    // The wait records what would be published, when it can be read — the
    // owner's answer is bound to what they were shown (BT8c). This runs only
    // when a wait is actually being recorded, and a remote that cannot be
    // read yet leaves the wait unbound: the post's own refusal names the
    // cause when the owner answers. It is a git read, never a gh call — the
    // permission state still gates every GitHub call below.
    try {
      const plan = planGitHub(repoRoot, requireRepository(repoRoot), record, shipRules(repoRoot), action.choice ?? { withChanges: false, include: [] });
      shown = shownOfPlan(plan);
    } catch {
      shown = undefined;
    }
  }
  // A one-bounty answer recorded on this wait still stands while what would
  // be published is what the owner was shown — a scan hold the answered
  // rerun uncovered carries it, and once the owner settles that in config
  // the same `post` goes out under the recorded answer. Any drift drops it
  // and the wait below is recorded fresh.
  const answered = record.waiting?.answered;
  if (action.for === 'post' && record.waiting?.for === 'post' && record.waiting.to === action.to && answered !== undefined && sameShown(answered.shown, shown)) {
    return { read: { decision: 'allowed', level: null, at: null }, reused: true };
  }
  waitForOwner(repoRoot, record, { for: action.for, reason, at: new Date().toISOString(), to: action.to, ...(action.choice !== undefined ? { choice: action.choice } : {}), ...(shown !== undefined ? { shown } : {}) });
  throw new BountyRefused(
    read.decision === null ? 'owner-allow-needed' : 'owner-answer-needed',
    [`waiting for the owner: ${record.id} — ${waitingSummary(record)}`, ...ownerWaitLines(repoRoot, record, read), ...(listRecords(repoRoot).some(entry => entry.record?.allowedBy?.decision === 'once') ? ['The owner previously chose this one bounty only.'] : [])].join('\n')
  );
}

export function postBounty(repoRoot: string, id: string, toDir: string, opts?: { answered?: boolean; choice?: import('./github.js').GitHubChoice }): { record: BountyRecord; destination: string } {
  if (toDir === 'github') return postGitHub(repoRoot, id, opts);
  const record = loadRecord(repoRoot, id);
  // A `confirmed` record carries the owner's own written yes from before the
  // decision moved to the settings folder — it stands. `drafted` and
  // `waiting` go through the owner gate below.
  const confirmed = record.stage === 'confirmed';
  if (record.stage !== 'confirmed' && record.stage !== 'drafted' && record.stage !== 'waiting') {
    throw new BountyRefused('not-postable', `bounty ${id} is ${record.stage} — only a drafted or confirmed bounty can be posted`);
  }
  // A project file cannot name money or publish lists — claims are refused
  // by name before anything else, so a refused post writes nothing.
  checkProjectClaims(repoRoot);
  // The amount in force at posting is what the record binds and the listing
  // states (BT11a) — checked before anything else so a refused post writes
  // nothing: no wait, no record change, no folder copy.
  const reward = rewardForPost(repoRoot);
  if (!confirmed && opts?.answered !== true) ownerGate(repoRoot, record, { for: 'post', to: toDir });
  if (!existsSync(record.folder) || !statSync(record.folder).isDirectory()) {
    throw new BountyRefused('folder-missing', `the recorded bounty folder ${record.folder} is gone — recreate it with box bounty create, or run box bounty close ${id} to end this bounty`);
  }
  const manifestBytes = readFileSync(join(record.folder, 'bounty.json'));
  let manifestId: string | null = null;
  let manifest: BountyManifest | null = null;
  try {
    const parsed = JSON.parse(manifestBytes.toString('utf8')) as { id?: unknown };
    manifestId = typeof parsed.id === 'string' ? parsed.id : null;
    manifest = parsed as BountyManifest;
  } catch {
    manifestId = null;
  }
  if (manifestId !== id) {
    throw new BountyRefused('folder-mismatch', `${join(record.folder, 'bounty.json')} does not name bounty ${id} — the recorded folder is not the bounty it should deliver`);
  }
  const dest = resolve(toDir);
  const destReal = canonicalForNew(dest);
  if (existsSync(destReal) && !statSync(destReal).isDirectory()) {
    throw new BountyRefused('destination-exists', `--to ${toDir} resolves to ${destReal}, which exists and is not a directory — point --to at a directory the bounty can be copied into`);
  }
  const destination = join(destReal, id);
  // The delivered copy must never sit inside the repository: it would ship
  // inside the next bounty. realpath the --to dir so a junction spelling
  // pointing back into the checkout cannot slip past the containment check.
  const rootKey = `${toPosix(realpathSync(repoRoot)).toLowerCase()}/`;
  const destKey = `${toPosix(destination).toLowerCase()}/`;
  if (destKey.startsWith(rootKey)) {
    throw new BountyRefused('destination-inside-repo', `--to ${toDir} would put ${destination} inside the repository — a delivered copy there would ship inside the next bounty. Point --to outside the checkout`);
  }
  if (existsSync(destination)) {
    throw new BountyRefused('destination-exists', `${destination} already exists — a delivered copy is never overwritten. Remove it or pick another --to`);
  }
  // Every refusal is behind us — a refused post changed nothing, the draft's
  // README included. The limit is re-checked inside the promise lock at the
  // moment the record binds: the check and the write are one span, so two
  // posts running at once cannot both pass. A $0 post promises nothing, so it
  // never takes the lock (BT11a fix round).
  const bind = () => {
    assertPromiseRoom(repoRoot, reward.amount);
    record.reward = { amount: reward.amount };
    // The listing states the amount bound now — rewritten whenever the manifest
    // parses as this bounty, so an edited bounty.json or README can never ship
    // a money line the owner did not set. The manifest bytes themselves ship
    // as found: they carry no reward.
    if (manifest !== null) {
      writeFileSync(join(record.folder, 'README.md'), renderListing(manifest, manifest.note ?? null, reward.amount));
    }
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(record.folder, destination, { recursive: true }); // copy, not move — the recorded folder stays
    record.allowedBy = allowedByFor(repoRoot, record, opts?.answered === true, confirmed);
    // A folder post runs no scan — the record must not claim the flagged
    // content was re-checked; only a safe-listed path settles as known.
    settleScanFindings(repoRoot, record, 'went-out-unchecked');
    transitionTo(repoRoot, record, 'posted', { destination });
    return { record, destination };
  };
  return reward.amount === 0 ? bind() : withPromiseLock(repoRoot, bind);
}

// Which written answer of the owner's allowed this post: the standing
// decision (with its level and when it was written), the owner's one-bounty
// answer, or — for a pre-BT8 confirmed record — the owner's yes recorded on
// the bounty itself.
export function allowedByFor(repoRoot: string, record: BountyRecord, answered: boolean, legacyConfirmed: boolean): AllowedBy {
  const usedAt = new Date().toISOString();
  if (answered) return { decision: 'once', level: 'this-bounty', decisionAt: null, usedAt };
  if (legacyConfirmed) {
    const at = record.events.find(event => event.stage === 'confirmed')?.at ?? null;
    return { decision: 'once', level: 'this-bounty', decisionAt: at, usedAt };
  }
  const read = readDecision(repoRoot);
  return { decision: 'allowed', level: (read.level ?? 'project') as 'project' | 'default', decisionAt: read.at, usedAt };
}

export interface CloseOutcome {
  /** A bounty with a reward that closed on a merge carries the message for
      the owner — whom to pay and where (BT11b). */
  readonly payMessage?: readonly string[];
  readonly record: BountyRecord;
  readonly outcome: 'rejected' | 'withdrawn' | 'already-ended';
}

// `close` is the one command that ends a bounty with nothing merged. On any
// open stage it works: with `--reason` the record lands `rejected` and keeps
// the reason on the event (what `reject` alone could do); without one it
// lands `withdrawn` (what `withdraw` did, including on a draft). On an ended
// bounty it retries any outside work the ending still owes — the resync each
// old ending offered its own stage — and reports the ended state by name.
export function closeBounty(repoRoot: string, id: string, reason?: string): CloseOutcome {
  const text = reason?.trim() ?? '';
  if (reason !== undefined && text === '') {
    throw new BountyRefused('missing-reason', `close needs a nonempty reason or none — box bounty close ${id}, or box bounty close ${id} --reason "<why the bounty ended without a merge>"`);
  }
  const record = loadRecord(repoRoot, id);
  if (!isOpenStage(record.stage)) {
    if (record.github !== undefined) syncGitHubDecision(repoRoot, record);
    const retryPay = payNotice(record, boundAmount(record));
    return { record, outcome: 'already-ended', ...(retryPay === null ? {} : { payMessage: retryPay }) };
  }
  settleScanFindings(repoRoot, record, 'ended');
  if (text !== '') {
    transitionTo(repoRoot, record, 'rejected', { reason: text, command: 'close' });
  } else {
    transitionTo(repoRoot, record, 'withdrawn', { command: 'close' });
  }
  dropDurabilityRefs(repoRoot, record);
  syncGitHubDecision(repoRoot, record);
  const payMessage = payNotice(record, boundAmount(record));
  return { record, outcome: text !== '' ? 'rejected' : 'withdrawn', ...(payMessage === null ? {} : { payMessage }) };
}
