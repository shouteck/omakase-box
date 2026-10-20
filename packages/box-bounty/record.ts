// The bounty record: one row per bounty in the checkout's SQLite store at
// `.box/local/box.db` (BT31), so any later agent — in a later session, on
// any host — can see where each bounty is in its journey and what to do
// next. Records written before BT31 sat one JSON file per bounty at
// `.box/bounties/<id>.json`; the store still imports those bytes on every
// read, so old checkouts and planted fixtures keep working unchanged.
//
// The record is a state machine over the journey's stages, not scattered
// booleans: `stage` is the current state and `events` appends one entry per
// transition, so history is never rewritten. This wave's commands only ever
// reach `posted`/`withdrawn`, but the stage set is the whole journey's so BT3
// extends the same record rather than redesigning it.
//
// Durability: each collected answer's commit is pinned under
// `refs/box-bounty/<id>-answer-<n>` while the bounty is open; every end stage
// drops the refs. Records written before BT24 also pinned the create-time
// snapshot commit at `refs/box-bounty/<id>` — drafts made now keep neither
// the ref nor the `snapshot` field, and removing that name is a no-op delete.

import { existsSync,readFileSync,realpathSync,statSync } from 'node:fs';
import { basename,dirname,join,resolve } from 'node:path';
import { BountyRefused } from './errors.js';
import { allRecords,listOpen,listEndedRecent,countEnded,readStored,sharedRead,writeStored,setStoreCodec } from './store.js';
import { gitOutcome,gitRefsWrite } from './git.js';
import { publishListed,publishLists } from './never-ship.js';
import { payOutcomeShape,payToFactShape } from './pay.js';
import type { PayToFact } from './pay.js';

// Every record read first runs the merged-solution scan, and every write
// resyncs the open surfaces (the OPEN line, the instruction blocks). Both
// implementations live in modules that need this one — importing them here
// would close a cycle through this file, so they register at their own
// module's load (BT25; the listener-seam shape setMergeNoticeListener uses).
// A bare import of this module alone throws rather than silently skipping a
// trigger: the package's surface is index.ts, which loads both.
let recordReadScan: ((repoRoot: string) => void) | undefined;
let openSurfacesSync: ((repoRoot: string) => void) | undefined;
export function setRecordReadScan(scan: (repoRoot: string) => void): void { recordReadScan = scan; }
export function setOpenSurfacesSync(sync: (repoRoot: string) => void): void { openSurfacesSync = sync; }
const noticeMergedSolutions = (repoRoot: string): void => {
  if (recordReadScan === undefined) throw new Error('box-bounty wiring: reading a record runs the merged-solution scan — merged.js registers it at load; import the package index');
  recordReadScan(repoRoot);
};
const syncOpenSurfaces = (repoRoot: string): void => {
  if (openSurfacesSync === undefined) throw new Error('box-bounty wiring: writing a record syncs the open surfaces — render.js registers it at load; import the package index');
  openSurfacesSync(repoRoot);
};

// The store validates record bytes through this module's own asRecord and
// classifies stages through isOpenStage — registered here at load because
// store.ts cannot import this module (this module imports it).
setStoreCodec({ validate: parsed => asRecord(parsed), isOpen: stage => isOpenStage(stage as BountyStage) });

// `undone` stays: nothing moves a record into it any more, but real records
// carry it and status shows them as the old ended records they are. Every
// other word retired designs wrote is converted or refused at load, inside
// asRecord (BT23).
export type OpenStage = 'drafted' | 'confirmed' | 'waiting' | 'posted' | 'taken' | 'answered';
export type EndedStage = 'applied' | 'rejected' | 'withdrawn' | 'undone';
export type BountyStage = OpenStage | EndedStage;

const OPEN_STAGES: ReadonlySet<BountyStage> = new Set(['drafted', 'confirmed', 'waiting', 'posted', 'taken', 'answered']);
const ENDED_STAGES: ReadonlySet<BountyStage> = new Set(['applied', 'rejected', 'withdrawn', 'undone']);
export const isOpenStage = (stage: BountyStage): stage is OpenStage => OPEN_STAGES.has(stage);

export interface StageEvent {
  /** 'paid' is a fact on the record, never a stage: it sits on a merged
      bounty whose reward the owner says was paid (BT36). It ends nothing
      and changes no stage — `record.stage` stays `applied`. */
  readonly stage: BountyStage | 'paid';
  readonly at: string;
  readonly destination?: string; // recorded on the `posted` event
  readonly reason?: string; // recorded on `rejected` and, on older records, on a `posted` return: the named failure class
  readonly attempt?: number; // which attempt this transition was about
  readonly command?: string; // the command that drove it — apply, look, close, merged — so history says what ended the bounty. Records written before BT7c can still name removed commands; status prints them remapped to what replaced them.
  readonly merge?: string; // the commit the command made (the apply or merged land; on older records the reversal)
  /** Recorded on `paid` only: the amount the owner said was paid — copied
      from the bound reward at write, never typed (BT36). */
  readonly amount?: number;
  /** Recorded on `paid` only: whose word the event is — 'owner', the only
      writer `config set paid` accepts. */
  readonly by?: 'owner';
  /** Recorded on `paid` only: a second `paid` event marked true withdraws a
      mistaken record; history keeps both events and the bounty reads owed
      again (BT36). */
  readonly withdrawn?: boolean;
  /** Recorded on `applied` when the merge landed outside the tool and the
      owner's decision asked to be asked (BT13): the owner was not asked
      before that merge — stated in the closing output, status and the pay
      message. A tool-driven apply carries no mark: it either ran under
      `allowed` or was released by the owner's `allow`. */
  readonly unasked?: boolean;
  /** Recorded on `applied`: the solution's own changed/added/deleted paths
      the landed merge commit does not touch — only some of the solution was
      kept, and the pay message names which (BT13). */
  readonly partial?: readonly string[];
}

// Attempt outcomes written since checks were removed (11 October 2026) are
// only ever 'answered'. 'set-aside' is what the check era's never-green
// outcomes load as — recorded, readable, never a default pick (BT23).
export type AttemptOutcome = 'answered' | 'set-aside';

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
  /** The pull request's own description text at collection, stored
      credential-redacted (BT19). Stranger-written: it surfaces only under
      `fromOthers` in `look --json`, never as the tool's own words. */
  readonly description?: string;
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
  readonly for: 'post' | 'close' | 'merge';
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
  readonly answered?: {
    readonly at: string;
    readonly shown?: WaitingFor['shown'];
  };
  /** What a held merge is bound to (BT13): which attempt, at which commit,
      merged into which branch state. `allow` releases it only while all
      three still match what the owner was shown. */
  readonly merge?: { readonly n: number; readonly commit: string; readonly head: string };
}

// One pre-publish scan finding kept on the record (BT8c): what was flagged,
// where the scan ran, and what happened — the bounty went out (the content
// changed or the flagged path is on safe to publish) or it ended without
// posting. Old records retain their already-written settlement text.
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
// post ran the scan again, so it can say the flagged content changed.
// When every flagged path is on safe to publish the record says
// the list's state — a local file write, so who wrote it is not claimed.
export function settleScanFindings(repoRoot: string, record: BountyRecord, settled: 'went-out' | 'ended'): void {
  const live = (record.scanFindings ?? []).filter(finding => finding.settled === null);
  if (live.length === 0) return;
  let text: string;
  if (settled === 'ended') text = 'the bounty ended — nothing was published';
  else {
    const safe = publishLists(repoRoot).safe;
    if (live.every(finding => finding.hits.every(hit => publishListed(safe, hit.path)))) {
      text = 'the flagged path is on safe to publish — the bounty went out';
    } else {
      text = 'the flagged content changed — the bounty went out';
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

// The `answer` block a record written before `attempts` carries — read and
// converted to attempt 1 inside asRecord; nothing else names it (BT23).
export interface AnswerSpec {
  readonly commit: string;
  readonly changed: readonly string[];
  readonly added: readonly string[];
  readonly deleted: readonly string[];
}

export interface BountyRecord {
  noteSource?: 'authored' | 'generated' | 'legacy';
  resume?: ResumeContext;
  readonly schemaVersion: 1;
  readonly kind: 'box-bounty-record';
  readonly id: string; // bt-<12 hex>, the same id bounty.json carries
  readonly title: string;
  /** One line of why the work was handed off, from `create --why` — required
      since BT3b and kept only here (never shipped), so the reasons for
      handing off can be learned from use. Absent on older records. */
  readonly why?: string;
  /** The job file `create --job` recorded before BT15 retired the flag:
      nothing writes it, but an ended record that carries it still names it —
      the ended line falls back to the title when there is none. */
  readonly job?: { readonly file: string; readonly text: string } | null;
  /** The job or bounty this bounty belongs to (BT28): `create --part-of`
      writes it; it is one line of tool-printable text, never a verdict, and
      status and `find` read it where the retired `job` field was read. */
  readonly partOf?: string;
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
  readonly folder?: string;
  readonly content?: { readonly task: { readonly file: string; readonly text: string }; readonly note: { readonly file: string; readonly text: string } | null; readonly tool: string };
  /** The create-time capture: commit, tree and the HEAD it was parented on.
      Old records only — the snapshot was kept for the bounty's life while
      something still read it after `create`; drafts made now use the capture
      during `create` (the scan and the note) and store nothing. */
  readonly snapshot?: { readonly commit: string; readonly tree: string; readonly baseCommit: string | null };
  readonly createdAt: string;
  /** Every answer handed back, oldest first — each with its extracted change,
      its outcome and its fact report. `apply` names one by `n`. */
  attempts?: Attempt[];
  /** Set when a merge onto current code conflicted and was aborted clean; the
      record stays `answered` and these paths are the next step.
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
  github?: import('./gh.js').GitHubPublication;
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
  /** True only on the synthetic record chain.ts folds out of shared events
      (BT32) — a read-model marker: never stored in `records`, never
      writable, and readers skip its GitHub refresh. */
  readonly shared?: true;
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
  readonly partOf?: string;
  readonly content: { readonly task: { readonly file: string; readonly text: string }; readonly note: { readonly file: string; readonly text: string } | null; readonly tool: string };
  readonly createdAt: string;
  readonly scanFindings?: ScanFinding[];
}

export type ResumeContext = { readonly kind: 'not-recorded' } | {
  readonly kind: 'recorded'; readonly branch: string; readonly commit: string;
  readonly changed: readonly string[]; readonly note: string | null;
};
export const refName = (id: string): string => `refs/box-bounty/${id}`;
export const attemptRefName = (id: string, n: number): string => `refs/box-bounty/${id}-answer-${n}`;

// One shape on the way out of asRecord: a record written before `attempts`
// carried a single `answer` block, which the load converts to attempt 1 —
// so today's shape is the only shape any reader sees (BT23).
export function attemptsOf(record: BountyRecord): Attempt[] {
  return record.attempts ?? [];
}

// The attempts `apply` will take without a number: 'answered' only. An
// attempt the check era never passed loads as 'set-aside' — recorded and
// readable, but never the default pick; `apply <id> <n>` can still name it.
export const applicableAttempts = (attempts: readonly Attempt[]): Attempt[] =>
  attempts.filter(attempt => attempt.outcome === 'answered');

// The commit a diff or document measures the bounty's solutions against:
// the snapshot's base on records old enough to carry one, else the resume
// context's recorded commit — and only when it is a real hash, because the
// context's '(no commits yet)' sentinel is display text, never a commit
// (BT26: the one reader for this fact — the status document's guard moved
// here and `look`'s fallback shares it; the empty tree stands in for null).
export const baseCommitOf = (record: BountyRecord): string | null =>
  record.snapshot?.baseCommit ?? (record.resume?.kind === 'recorded' && /^[0-9a-f]{40}$/.test(record.resume.commit) ? record.resume.commit : null);

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
    // BT32: refs/box-bounty/<id> is the shared chain ref now — a record made
    // since chains shipped never pins a snapshot under it. Drop it only when
    // the commit it names is a legacy snapshot (no event.json in its tree).
    const tip = gitOutcome(repoRoot, ['rev-parse', '-q', '--verify', refName(record.id)]);
    const chain = tip.status === 0 && gitOutcome(repoRoot, ['cat-file', '-e', `${tip.stdout.trim()}:event.json`]).status === 0;
    gitRefsWrite(repoRoot, [
      ...(chain ? [] : [{ delete: refName(record.id) }]),
      { delete: `${refName(record.id)}-answer` },
      ...attemptsOf(record).map(attempt => ({ delete: attemptRefName(record.id, attempt.n) }))
    ]);
  } catch {
    // Best-effort: refs that stay are exactly the state left behind.
  }
}
export const recordDir = (repoRoot: string): string => join(repoRoot, '.box', 'bounties');
export const recordPath = (repoRoot: string, id: string): string => join(recordDir(repoRoot), `${id}.json`);

// Whether `.box/bounties/` holds tracked files — asked on every compact
// status and config render (BT28), so the untracked answer must cost no Git
// process: the Git index file's bytes are read in Node first (resolve
// `.git/index`, or — when `.git` is a file, a linked worktree — the `gitdir:`
// target's `index`). An absent index or one whose bytes never name
// `bounties/` means untracked with certainty; only then does the question go
// to Git itself.
export function trackedRecordFiles(repoRoot: string): string[] {
  try {
    const dotGit = join(repoRoot, '.git');
    let indexPath = join(dotGit, 'index');
    if (statSync(dotGit, { throwIfNoEntry: false })?.isFile()) {
      const pointer = readFileSync(dotGit, 'utf8');
      if (!pointer.startsWith('gitdir:')) return [];
      indexPath = join(resolve(repoRoot, pointer.slice('gitdir:'.length).trim()), 'index');
    }
    if (!readFileSync(indexPath).includes('bounties/')) return [];
  } catch {
    return [];
  }
  const listed = gitOutcome(repoRoot, ['ls-files', '-z', '--', '.box/bounties']);
  if (listed.status !== 0) return [];
  return listed.stdout.split('\0').filter(entry => entry !== '');
}

export const persistRecord = (repoRoot: string, record: BountyRecord): void => {
  writeStored(repoRoot, record);
  syncOpenSurfaces(repoRoot);
};

const asRecord = (parsed: unknown): BountyRecord | null => {
  // The extra names below belong to records retired designs wrote: they are
  // read, converted to today's shape or dropped right here — the one place a
  // file becomes a record — so no other code ever mentions them (BT23).
  const record = parsed as BountyRecord & {
    answer?: AnswerSpec | null;
    replies?: unknown;
    level?: unknown;
  };
  if (record === null || typeof record !== 'object') return null;
  if (record.kind !== 'box-bounty-record' || typeof record.id !== 'string') return null;
  if (typeof record.stage !== 'string' || !Array.isArray(record.events) || record.folder !== undefined && typeof record.folder !== 'string') return null;
  if (record.noteSource !== undefined && record.noteSource !== 'authored' && record.noteSource !== 'generated' && record.noteSource !== 'legacy') return null;
  if (record.scanFindings !== undefined && !Array.isArray(record.scanFindings)) return null;
  const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object';
  const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(entry => typeof entry === 'string');
  if (record.resume !== undefined && (!object(record.resume) || record.resume.kind !== 'not-recorded' && (record.resume.kind !== 'recorded' || typeof record.resume.branch !== 'string' || typeof record.resume.commit !== 'string' || !strings(record.resume.changed) || record.resume.note !== null && typeof record.resume.note !== 'string'))) return null;
  if (record.content !== undefined) {
    const text = (value: unknown): boolean => object(value) && typeof value['file'] === 'string' && typeof value['text'] === 'string';
    if (!object(record.content) || !text(record.content.task) || record.content.note !== null && !text(record.content.note) || typeof record.content.tool !== 'string') return null;
  }
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
  // partOf is one printable line of tool-written text (BT28) — anything else
  // is not a record this tool wrote.
  if (record.partOf !== undefined && (typeof record.partOf !== 'string' || record.partOf.trim() === '' || record.partOf.includes('\n') || record.partOf.includes('\r'))) return null;
  // 'verified' was the check era's green: with checks gone it reads as
  // 'answered', on the record and in its history. The stage checks below then
  // decide — a word no design ever wrote fails to load as it always did
  // ('expired' was never written anywhere and now reads corrupt like any
  // other unknown stage).
  if ((record.stage as string) === 'verified') record.stage = 'answered';
  record.events = record.events.map(event => event !== null && typeof event === 'object' && (event.stage as string) === 'verified' ? { ...event, stage: 'answered' } : event);
  for (const event of record.events) {
    if (event === null || typeof event !== 'object') return null;
    // A `paid` event is not a stage transition: the tool writes it on an
    // applied record, the amount is a whole dollar count above zero, `by`
    // is 'owner' (the only writer), and `withdrawn` is the true mark of a
    // withdrawal. Any other shape is not an event this tool wrote (BT36).
    if (event.stage === 'paid') {
      if (typeof event.amount !== 'number' || !Number.isSafeInteger(event.amount) || event.amount <= 0) return null;
      if (event.by !== 'owner') return null;
      if (event.withdrawn !== undefined && event.withdrawn !== true) return null;
      continue;
    }
    // A paid-only field on a transition event is foreign to this tool.
    if (event.amount !== undefined || event.by !== undefined || event.withdrawn !== undefined) return null;
    if (!OPEN_STAGES.has(event.stage) && !ENDED_STAGES.has(event.stage)) return null;
    if (event.merge !== undefined && (typeof event.merge !== 'string' || !sha.test(event.merge))) return null;
    if (event.attempt !== undefined && (!Number.isSafeInteger(event.attempt) || event.attempt < 1)) return null;
    if (event.reason !== undefined && typeof event.reason !== 'string') return null;
    if (event.unasked !== undefined && event.unasked !== true) return null;
    if (event.partial !== undefined && (!Array.isArray(event.partial) || !strings(event.partial))) return null;
  }
  if (!OPEN_STAGES.has(record.stage) && !ENDED_STAGES.has(record.stage)) return null;
  if (record.resume.kind === 'recorded' && !safeBranch(record.resume.branch)) return null;
  if (record.attempts !== undefined && !Array.isArray(record.attempts)) return null;
  for (const attempt of record.attempts ?? []) {
    if (attempt === null || typeof attempt !== 'object' || !Number.isInteger(attempt.n) || attempt.n < 1 || typeof attempt.commit !== 'string' || !sha.test(attempt.commit)) return null;
    if (attempt.pullRequest !== undefined && (!Number.isSafeInteger(attempt.pullRequest) || attempt.pullRequest < 1)) return null;
    if (attempt.payTo !== undefined && !payToFactShape(attempt.payTo)) return null;
    if (attempt.description !== undefined && typeof attempt.description !== 'string') return null;
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
  if (record.answer !== undefined && record.answer !== null && (typeof record.answer !== 'object' || typeof record.answer.commit !== 'string' || !sha.test(record.answer.commit) || !strings(record.answer.changed) || !strings(record.answer.added) || !strings(record.answer.deleted))) return null;
  if (record.conflicts !== undefined && record.conflicts !== null && (typeof record.conflicts !== 'object' || !strings(record.conflicts.paths) || typeof record.conflicts.at !== 'string' || !stamp.test(record.conflicts.at))) return null;
  // A record written before `attempts` carries one `answer` block — it becomes
  // attempt 1, exactly the values attemptsOf used to build on every read: its
  // own at, commit and change lists, the conflicts the last merge try left,
  // an empty report status says plainly, and 'answered' — the check era's
  // 'verified' reads the same once nothing runs checks.
  if (record.attempts === undefined && record.answer !== undefined && record.answer !== null) {
    record.attempts = [{
      n: 1,
      at: record.events.at(-1)?.at ?? record.createdAt,
      commit: record.answer.commit,
      changed: record.answer.changed,
      added: record.answer.added,
      deleted: record.answer.deleted,
      outcome: 'answered',
      conflicts: record.conflicts?.paths ?? null,
      report: []
    }];
  }
  // Check-era outcome words convert the same way: the green one is 'answered',
  // the three never-green ones are 'set-aside' — recorded, never a default
  // pick. Any other word is not an outcome this tool wrote, so the record
  // fails to load.
  const outcomeToday: Record<string, AttemptOutcome> = { answered: 'answered', 'set-aside': 'set-aside', verified: 'answered', 'check-failed': 'set-aside', 'check-unrunnable': 'set-aside', 'check-not-run': 'set-aside' };
  if (record.attempts !== undefined) {
    if (record.attempts.some(attempt => outcomeToday[attempt.outcome] === undefined)) return null;
    record.attempts = record.attempts.map(attempt => ({ ...attempt, outcome: outcomeToday[attempt.outcome]! }));
  }
  // And the fields nothing writes or reads any more — the singular answer
  // (converted above), the replies list nothing ever read, the check level —
  // are dropped: the record a reader holds names only today's shape, and a
  // record written back carries no old words.
  delete record.answer;
  delete record.replies;
  delete record.level;
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
    if (github.unavailableReason !== undefined && github.unavailableReason !== null && typeof github.unavailableReason !== 'string') return null;
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
      .replace(/box bounty (?:look|apply) [^\n;]*--from[^\n;]*/g, `box bounty close ${record.id}`)
      .replace(/ --to github\b/g, '')
      .replace(/box bounty post [^\n;]*--to (?!github\b)[^\n;]*/g, `box bounty close ${record.id}`)
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
      .replace(/box bounty (?:look|apply) [^\n;]*--from[^\n;]*/g, `box bounty close ${record.id}`)
      .replace(/ --to github\b/g, '')
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
  const stored = readStored(repoRoot, id);
  if (stored.state === 'missing') {
    // BT32: a chain another machine posted lands in the shared table — the
    // id is known here but not a local record; acting on it is refused by name.
    const shared = sharedRead(repoRoot, id);
    if (shared !== null) {
      const url = shared.github?.issue?.url;
      throw new BountyRefused('shared-only', `this bounty was posted from another machine${url !== undefined && url !== '' ? `; its issue is ${url}` : ''}; next: act on it from that machine, or on GitHub`);
    }
    throw new BountyRefused('unknown-bounty', `no bounty ${id} — .box/bounties/${id}.json does not exist; next: box bounty status lists the bounties this project knows`);
  }
  if (stored.record === null) {
    throw new BountyRefused('record-corrupt', `${recordPath(repoRoot, id)} is not a readable bounty record; next: open it by hand, or remove it and run box bounty status again`);
  }
  return stored.record;
}

// `bounty create` calls this to write the record at stage `drafted`. Nothing
// is pinned: the create-time capture serves the scan and the note while
// `create` runs and nothing reads it after — only records from before BT24
// carry `snapshot` and its `refs/box-bounty/<id>` pin, and they keep both.
export function writeNewRecord(repoRoot: string, seed: RecordSeed): { record: BountyRecord; path: string } {
  const record: BountyRecord = {
    schemaVersion: 1,
    kind: 'box-bounty-record',
    id: seed.id,
    title: seed.title,
    resume: seed.resume ?? { kind: 'not-recorded' },
    noteSource: seed.noteSource ?? 'legacy',
    ...(seed.why !== undefined ? { why: seed.why } : {}),
    ...(seed.partOf !== undefined ? { partOf: seed.partOf } : {}),
    stage: 'drafted',
    content: seed.content,
    createdAt: seed.createdAt,
    ...(seed.scanFindings !== undefined && seed.scanFindings.length > 0 ? { scanFindings: seed.scanFindings } : {}),
    events: [{ stage: 'drafted', at: seed.createdAt }]
  };
  // The record lands in the checkout's store; the returned path keeps the
  // record's logical spelling (`.box/bounties/<id>.json`) for `--full`'s
  // record line and for callers that name it — the bytes live in box.db.
  const path = recordPath(repoRoot, seed.id);
  writeStored(repoRoot, record);
  syncOpenSurfaces(repoRoot);
  return { record, path };
}

export function listRecords(repoRoot: string): ListedBounty[] {
  // Same check as loadRecord: whichever a command touches first runs the
  // merged-solution scan before the records are read.
  noticeMergedSolutions(repoRoot);
  return allRecords(repoRoot);
}

// `find` reads through the store's index, not this listing — but a record
// read is still the moment an outside merge gets recognised. This is the
// scan alone, for readers that never touch listRecords.
export function noticeMergedOnce(repoRoot: string): void {
  noticeMergedSolutions(repoRoot);
}

// The narrow reads BT31 added: callers that only ever wanted the open
// bounties — the open-bounties line, the hook's summary, the promised
// totals, the merged-solution scan — no longer read every ended record to
// get them. Each still runs the merged-solution scan first, as listRecords
// always did.
export function openRecords(repoRoot: string): BountyRecord[] {
  noticeMergedSolutions(repoRoot);
  return listOpen(repoRoot);
}

export function endedRecords(repoRoot: string, limit?: number): BountyRecord[] {
  noticeMergedSolutions(repoRoot);
  return listEndedRecent(repoRoot, limit);
}

export function endedCount(repoRoot: string): number {
  noticeMergedSolutions(repoRoot);
  return countEnded(repoRoot);
}



// Appends one stage event and persists — history is appended, never rewritten.
// `reason` records why a `rejected` transition happened (and, on older records,
// why a `posted` one went back); `destination` records where `posted` went;
// `attempt`, `command` and `merge` say which attempt a transition was about,
// which command drove it and which commit it made — so the history alone says
// what ended the bounty and on which attempt.
export const transitionTo = (repoRoot: string, record: BountyRecord, stage: BountyStage, extra?: { destination?: string; reason?: string; attempt?: number; command?: string; merge?: string; unasked?: boolean; partial?: readonly string[] }): void => {
  record.events.push({
    stage,
    at: new Date().toISOString(),
    ...(extra?.destination !== undefined ? { destination: extra.destination } : {}),
    ...(extra?.reason !== undefined ? { reason: extra.reason } : {}),
    ...(extra?.attempt !== undefined ? { attempt: extra.attempt } : {}),
    ...(extra?.command !== undefined ? { command: extra.command } : {}),
    ...(extra?.merge !== undefined ? { merge: extra.merge } : {}),
    ...(extra?.unasked === true ? { unasked: true } : {}),
    ...(extra?.partial !== undefined && extra.partial.length > 0 ? { partial: [...extra.partial] } : {})
  });
  record.stage = stage;
  if (stage !== 'waiting') delete record.waiting; // a landed action is no longer held
  persistRecord(repoRoot, record);
};

const toPosix = (path: string): string => path.split('\\').join('/');

// The canonical path a not-yet-existing target will land at: walk up to the
// nearest EXISTING ancestor, realpath it, then re-append the missing tail. A
// junction at any existing level resolves to its real location, so task-file
// classification uses the actual location even when the final file is missing.
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

// One check names every retired delivery route (BT23): a GitHub publication
// made before the post became part of the code's own history, a posted or
// collected-on record that left no publication (a folder post), or a wait
// still bound to folder delivery. Returns the refusal reason callers report,
// or null — what "old" means is decided here and nowhere else.
export function retiredRoute(record: BountyRecord): string | null {
  return record.github !== undefined && record.github.kind !== 'history'
    || record.github === undefined && (record.stage === 'posted' || record.stage === 'taken' || record.stage === 'answered')
    || record.waiting?.to !== undefined && record.waiting.to !== 'github'
    ? 'legacy-delivery-retired' : null;
}

export function requireCurrentDelivery(record: BountyRecord): void {
  const retired = retiredRoute(record);
  if (retired !== null) {
    throw new BountyRefused(retired, `this bounty used a retired delivery route; its history is still readable; next: end it with box bounty close ${record.id}`);
  }
}

