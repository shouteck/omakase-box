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
// `withdraw` removes the ref.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { BountyRefused } from './errors.js';
import { dryMergeOnto, git, gitOutcome } from './git.js';
import { loadLimits } from './limits.js';
import { RULES_MARKERS, rulesBlockInterior } from './wording.js';
import { postGitHub, approveGitHub, refreshGitHubStatus, syncGitHubDecision } from './github.js';

export type OpenStage = 'drafted' | 'confirmed' | 'posted' | 'taken' | 'answered' | 'verified';
export type EndedStage = 'applied' | 'rejected' | 'withdrawn' | 'expired' | 'undone';
export type BountyStage = OpenStage | EndedStage;

const OPEN_STAGES: ReadonlySet<BountyStage> = new Set(['drafted', 'confirmed', 'posted', 'taken', 'answered', 'verified']);
export const isOpenStage = (stage: BountyStage): stage is OpenStage => OPEN_STAGES.has(stage);

export interface StageEvent {
  readonly stage: BountyStage;
  readonly at: string;
  readonly destination?: string; // recorded on the `posted` event
  readonly reason?: string; // recorded on `rejected` and, on older records, on a `posted` return: the named failure class
  readonly attempt?: number; // which attempt this transition was about
  readonly command?: string; // the command that drove it — apply, reject, undo — so history says what ended the bounty
  readonly merge?: string; // the commit the command made (the apply merge, or the undo reversal)
}

// Attempt outcomes written since checks were removed (11 October 2026) are
// only ever 'answered'. The other words belong to records written before that
// day — they stay in the union so those records still load and their attempts
// still read back honestly.
export type AttemptOutcome = 'answered' | 'verified' | 'check-failed' | 'check-unrunnable' | 'check-not-run';

export interface Attempt {
  /** 1-based, stable within the record — `box bounty apply <id> <n>` names it.
      The answer commit is pinned at refs/box-bounty/<id>-answer-<n>. */
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
  /** The fact report, rendered once when the answer came in — `answer` prints
      it and `status` replays it. Facts only, never a verdict. */
  readonly report: readonly string[];
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
  readonly id: string;
  readonly title: string;
  readonly why?: string;
  readonly snapshot: { readonly commit: string; readonly tree: string; readonly baseCommit: string | null };
  readonly folder: string;
  readonly createdAt: string;
  readonly job?: { readonly file: string; readonly text: string } | null;
  readonly manifestSha256?: string;
}

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
  gitOutcome(repoRoot, ['update-ref', '-d', refName(record.id)]);
  gitOutcome(repoRoot, ['update-ref', '-d', `${refName(record.id)}-answer`]);
  for (const attempt of attemptsOf(record)) {
    gitOutcome(repoRoot, ['update-ref', '-d', attemptRefName(record.id, attempt.n)]);
  }
}
export const recordDir = (repoRoot: string): string => join(repoRoot, '.box', 'bounties');
export const recordPath = (repoRoot: string, id: string): string => join(recordDir(repoRoot), `${id}.json`);

export const persistRecord = (repoRoot: string, record: BountyRecord): void => {
  // The owner's limits are a boundary read: a malformed file refuses before
  // the record moves, so no mutation lands half-written.
  const limits = resolveLimits(repoRoot);
  writeFileSync(recordPath(repoRoot, record.id), JSON.stringify(record, null, 2) + '\n');
  syncOpenSurfaces(repoRoot, limits);
};

const asRecord = (parsed: unknown): BountyRecord | null => {
  const record = parsed as BountyRecord;
  if (record === null || typeof record !== 'object') return null;
  if (record.kind !== 'box-bounty-record' || typeof record.id !== 'string') return null;
  if (typeof record.stage !== 'string' || !Array.isArray(record.events) || typeof record.folder !== 'string') return null;
  return record;
};

export function loadRecord(repoRoot: string, id: string): BountyRecord {
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
  const limits = resolveLimits(repoRoot); // a malformed limits file refuses before anything is pinned or written
  const record: BountyRecord = {
    schemaVersion: 1,
    kind: 'box-bounty-record',
    id: seed.id,
    title: seed.title,
    ...(seed.why !== undefined ? { why: seed.why } : {}),
    ...(seed.job !== undefined ? { job: seed.job } : {}),
    ...(seed.manifestSha256 !== undefined ? { manifestSha256: seed.manifestSha256 } : {}),
    stage: 'drafted',
    folder: seed.folder,
    snapshot: { ...seed.snapshot },
    createdAt: seed.createdAt,
    events: [{ stage: 'drafted', at: seed.createdAt }]
  };
  git(repoRoot, ['update-ref', refName(seed.id), seed.snapshot.commit]);
  const path = recordPath(repoRoot, seed.id);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(record, null, 2) + '\n');
  syncOpenSurfaces(repoRoot, limits);
  return { record, path };
}

export function listRecords(repoRoot: string): ListedBounty[] {
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

const ATTEMPT_WORD: Record<AttemptOutcome, string> = {
  answered: 'arrived — nothing in it was run',
  // Words for attempts recorded while checks existed: the record still says
  // what the check did back then — history, not a current promise.
  verified: 'the declared check exited 0 on it (checks were removed on 11 October 2026)',
  'check-failed': 'the declared check exited nonzero on it (checks were removed on 11 October 2026)',
  'check-unrunnable': 'the declared check could not run (checks were removed on 11 October 2026)',
  'check-not-run': 'the declared check was not run on it (checks were removed on 11 October 2026)'
};

const nextStep = (record: BountyRecord): string => {
  switch (record.stage) {
    case 'drafted': return `the owner's yes comes first — run box bounty confirm ${record.id} once they approve the preview`;
    case 'confirmed': return `deliver it — run box bounty post ${record.id} --to <dir>`;
    case 'posted': {
      const count = attemptsOf(record).length;
      if (count === 0) return `wait for the solver — when the bounty folder comes back, run box bounty answer ${record.id} --from <dir>`;
      return `the bounty is still open with ${count} recorded ${count === 1 ? 'attempt' : 'attempts'} — when another answer comes back run box bounty answer ${record.id} --from <dir>, or end it with box bounty reject ${record.id} --reason "<why>"`;
    }
    case 'taken': return 'an answer is being read against the snapshot it was made for — run box bounty status again in a moment';
    case 'answered':
    case 'verified': {
      const applicable = applicableAttempts(attemptsOf(record));
      const conflicts = record.conflicts?.paths;
      const conflictText = conflicts !== undefined && conflicts.length > 0
        ? ` the last merge try conflicted in ${conflicts.join(', ')} — resolve those paths and commit first, then`
        : '';
      if (applicable.length === 0) {
        return `no attempt has a usable result — name one anyway with box bounty apply ${record.id} <n>, or end the bounty with box bounty reject ${record.id} --reason "<why>"`;
      }
      if (applicable.length === 1) {
        const n = applicable[0]!.n;
        return `attempt ${n} waits on a decision —${conflictText} run box bounty apply ${record.id} ${n} to merge it onto the current code, or box bounty reject ${record.id} --reason "<why>"`;
      }
      return `attempts ${applicable.map(attempt => `#${attempt.n}`).join(' and ')} could be applied —${conflictText} pick one with box bounty apply ${record.id} <n>, or end it with box bounty reject ${record.id} --reason "<why>"`;
    }
    default: return 'ended — nothing to do';
  }
};

// Cold-read surface for a fresh agent: every open bounty with id, stage, its
// attempts (passing first), the top attempt's fact report, a fresh merge read
// of the current code, and the next step; ended bounties one compact line; an
// empty project says so and says what to do. Never prints nothing.
export function renderStatus(repoRoot: string): string {
  const listed = listRecords(repoRoot);
  for (const entry of listed) {
    if (entry.record !== null && isOpenStage(entry.record.stage)) refreshGitHubStatus(repoRoot, entry.record);
  }
  const open = listed.filter(entry => entry.record !== null && isOpenStage(entry.record.stage));
  const ended = listed.filter(entry => entry.record !== null && !isOpenStage(entry.record.stage));
  const corrupt = listed.filter(entry => entry.record === null);
  const lines: string[] = [];
  if (open.length === 0) {
    lines.push(`box bounty status — no open bounties in ${repoRoot}`);
    lines.push('next: create one with box bounty create --task <file> --why "<one line>"');
  } else {
    lines.push(`box bounty status — ${open.length} open ${open.length === 1 ? 'bounty' : 'bounties'} in ${repoRoot}`);
    for (const entry of open) {
      const record = entry.record!;
      lines.push(`  ${record.id}  ${record.stage}  "${record.title}"`);
      if (record.github !== undefined) lines.push(`      github: ${record.github.repository} ${record.github.branch} ${record.github.issue?.url ?? 'issue pending'} (${record.github.state}${record.github.kind !== 'history' ? ', snapshot-posted — from before the bounty became an issue on the code that is already there' : ''})${record.github.pending !== null ? `; ${record.github.pending}` : ''}`);
      if (record.github?.unavailableAt !== null && record.github?.unavailableAt !== undefined) lines.push(`      github-status-unavailable: could not refresh at ${record.github.unavailableAt}; last recorded outside state ${record.github.outside?.at ?? 'not yet read'}; retry box bounty status`);
      if (record.github?.outside !== undefined) {
        lines.push(`      outside state recorded ${record.github.outside.at}: issue ${record.github.outside.issueState}`);
        for (const line of record.github.outside.answers.split('\n')) lines.push(`      ${line}`);
        lines.push(`      collect: box bounty answer ${record.id} --pr <number>`);
      }
      const attempts = attemptsOf(record);
      if (attempts.length > 0) {
        const applicable = applicableAttempts(attempts);
        const ordered = [...attempts].sort((a, b) => {
          const aOk = a.outcome === 'verified' || a.outcome === 'answered' ? 0 : 1;
          const bOk = b.outcome === 'verified' || b.outcome === 'answered' ? 0 : 1;
          return aOk - bOk || a.n - b.n;
        });
        lines.push(`      attempts (${attempts.length}):`);
        for (const attempt of ordered) {
          lines.push(`        #${attempt.n} ${attempt.outcome} — ${ATTEMPT_WORD[attempt.outcome]}${attempt.author !== undefined ? `; from GitHub account ${attempt.author}` : ''}${attempt.conflicts !== null && attempt.conflicts.length > 0 ? `; merges with conflicts in ${attempt.conflicts.join(', ')}` : ''}`);
        }
        const top = ordered[0]!;
        if (top.report.length > 0) {
          lines.push(`      report — attempt #${top.n}, recorded ${top.at}:`);
          for (const line of top.report) lines.push(`        ${line}`);
        } else {
          lines.push(`      this attempt was recorded before fact reports existed — the commit ${top.commit} is pinned at refs/box-bounty/${record.id}-answer`);
        }
        if (applicable.length > 0) {
          const fresh = dryMergeOnto(repoRoot, applicable[0]!.commit);
          lines.push(`      current code now: ${fresh.kind === 'clean' ? 'attempt #' + applicable[0]!.n + ' would merge cleanly onto the current branch' : fresh.kind === 'conflict' ? `attempt #${applicable[0]!.n} would conflict in ${fresh.paths.join(', ')}` : `the merge cannot be tested — ${fresh.detail}`}`);
        }
      }
      lines.push(`      next: ${nextStep(record)}`);
    }
  }
  if (ended.length === 0) lines.push('ended: none');
  else lines.push(`ended: ${ended.map(entry => {
    const record = entry.record!;
    // applied/rejected/undone name the job the bounty came from, so the record
    // alone says which piece of work is unblocked — falling back to the title.
    if (record.stage === 'applied' || record.stage === 'rejected' || record.stage === 'undone') return `${record.id} ${record.stage} (job: ${record.job?.file ?? record.title})`;
    return `${record.id} ${record.stage}`;
  }).join(', ')}`);
  for (const entry of ended) {
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
    'confirm <id> --to github previews exactly what becomes public — the commit already there, unpushed commits, and only the uncommitted work you ask for (--with-changes, --include <file>); post <id> --to github publishes it. answer <id> lists PRs; answer <id> --pr <n> collects one. Every bounty states a reward of $0.',
    '',
    'the journey (what each command does → the stage it leaves):',
    '  create    snapshot the repository minus never-ship files, with the task and a note; prints the preview → drafted',
    '  confirm   the owner\'s yes, recorded — the boundary nothing crosses without → confirmed',
    '  post      first delivery: copies the folder to --to <dir>/<id>, or publishes the GitHub issue and branch → posted',
    '  answer    a solver\'s return: bound and reported as facts — never a verdict → answered',
    '  apply     merge an attempt onto the current code — the recorded decision → applied',
    '  undo      reverse an applied merge as a new commit → undone',
    '  reject    end it with --reason "<why>" kept on the record → rejected',
    '  withdraw  end any open stage → withdrawn',
    '  status    every open bounty, attempts and next step; GitHub outside state is refreshed and remembered',
    '  describe  what the tool does, when it is worth using and when not, plus the facts to choose — --rules prints the block for a project\'s rules file',
    '  remind    one line a harness can surface at a moment of difficulty — off unless .box/limits.json sets "reminders": "on"',
    '  help      this screen',
    '',
    '  create needs only judgement: --task <file> and --why "<one line>" — title, place to write and the hand-off note have defaults.',
    '',
    'nothing a solver wrote is ever run — checks were removed on 11 October 2026: an answer arrives as a',
    'numbered attempt, the report states facts about the change, and apply/reject is always your call.',
    '',
    'what ends a bounty: apply, reject, withdraw (undo reverses an applied merge).',
    'an answer that does not land never ends it — it is kept as a numbered attempt and the bounty stays open.',
    '',
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
  persistRecord(repoRoot, record);
};

export function confirmBounty(repoRoot: string, id: string, destination?: string, githubChoice?: import('./github.js').GitHubChoice): BountyRecord {
  const record = loadRecord(repoRoot, id);
  if (record.stage !== 'drafted' && !(destination === 'github' && record.stage === 'confirmed' && record.githubApproval === undefined)) {
    throw new BountyRefused('not-drafted', `bounty ${id} is ${record.stage}, not drafted — only a drafted bounty can be confirmed`);
  }
  if (destination === 'github') record.githubApproval = approveGitHub(repoRoot, record, githubChoice ?? { withChanges: false, include: [] });
  transitionTo(repoRoot, record, 'confirmed');
  return record;
}

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

// The owner's limits, resolved for use: `rulesFile` and each
// `allowedDestinations` entry are repo-relative paths canonicalized through
// canonicalForNew, so a junction spelling names where it really lands. A
// rules file that resolves outside the repository is refused by name — the
// tool only ever rewrites the marked block inside the checkout.
export interface ResolvedLimits {
  readonly reminders: 'off' | 'on';
  readonly cost: string | null;
  readonly expectedAnswer: string | null;
  /** Canonical absolute path inside the repository, or null when unset. */
  readonly rulesFile: string | null;
  /** Canonical absolute directories `post --to` must land inside; null = any. */
  readonly allowedDestinations: readonly string[] | null;
}

export function resolveLimits(repoRoot: string): ResolvedLimits {
  const limits = loadLimits(repoRoot);
  const rootKey = `${toPosix(realpathSync(repoRoot)).toLowerCase()}/`;
  let rulesFile: string | null = null;
  if (limits.rulesFile !== undefined) {
    const resolved = canonicalForNew(resolve(repoRoot, limits.rulesFile));
    if (!`${toPosix(resolved).toLowerCase()}/`.startsWith(rootKey)) {
      throw new BountyRefused('rules-file-outside-repo', `.box/limits.json names rulesFile ${limits.rulesFile}, which resolves to ${resolved} — outside the repository. The tool only rewrites a marked block inside the checkout; point rulesFile at a file inside it`);
    }
    rulesFile = resolved;
  }
  const allowedDestinations = limits.allowedDestinations === undefined
    ? null
    : limits.allowedDestinations.map(dir => dir === 'github' ? dir : canonicalForNew(resolve(repoRoot, dir)));
  return {
    reminders: limits.reminders,
    cost: limits.cost ?? null,
    expectedAnswer: limits.expectedAnswer ?? null,
    rulesFile,
    allowedDestinations
  };
}

// The line the tool keeps current everywhere open bounties surface:
// `.box/bounties/OPEN` and the marked block of the rules file the limits name.
export function renderOpenLine(repoRoot: string): string {
  const open = listRecords(repoRoot).filter(entry => entry.record !== null && isOpenStage(entry.record.stage));
  if (open.length === 0) return 'open bounties: none';
  return `open bounties: ${open.map(entry => `${entry.record!.id} "${entry.record!.title}" (${entry.record!.stage})${entry.record!.github !== undefined ? ` ${entry.record!.github!.issue?.url ?? 'github issue pending'} ${entry.record!.github!.branch}${entry.record!.github!.outside !== undefined ? `; ${entry.record!.github!.outside!.answers.replaceAll('\n', ' ')}` : ''}` : ''}`).join(', ')}`;
}

// The maintained-block writer, deliberately boring: find the markers, replace
// everything between them with the canonical block (the rules lines plus the
// current open-bounties line), write back through a temp file + rename so a
// failed write cannot leave the owner's file truncated. The tool owns the
// interior of the marked block; every byte outside the markers is untouched.
// Anything unexpected — missing file, no markers, unreadable — leaves the
// file exactly as it was.
function rewriteRulesFile(path: string, openLine: string): void {
  if (!existsSync(path) || !statSync(path).isFile()) return;
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  const openAt = text.indexOf(RULES_MARKERS.open);
  if (openAt === -1) return;
  const afterOpen = openAt + RULES_MARKERS.open.length;
  const closeAt = text.indexOf(RULES_MARKERS.close, afterOpen);
  if (closeAt === -1) return;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const next = text.slice(0, afterOpen) + eol + rulesBlockInterior(openLine).join(eol) + eol + text.slice(closeAt);
  if (next === text) return;
  const staging = `${path}.box-tmp`;
  writeFileSync(staging, next);
  renameSync(staging, path);
}

// `.box/bounties/OPEN` always mirrors the records — rewritten on every record
// mutation — and when the limits file names `rulesFile`, the marked block in
// that file is rewritten to carry the same line. Recordless repos never reach
// here: only mutations sync.
function syncOpenSurfaces(repoRoot: string, limits: ResolvedLimits): void {
  const line = renderOpenLine(repoRoot);
  writeFileSync(join(recordDir(repoRoot), 'OPEN'), `${line}\n`);
  if (limits.rulesFile !== null) rewriteRulesFile(limits.rulesFile, line);
}

export function postBounty(repoRoot: string, id: string, toDir: string): { record: BountyRecord; destination: string } {
  if (toDir === 'github') return postGitHub(repoRoot, id);
  const record = loadRecord(repoRoot, id);
  // The confirmed gate is the owner's-yes boundary: nothing is delivered before it.
  if (record.stage !== 'confirmed') {
    throw new BountyRefused('not-confirmed', `bounty ${id} is ${record.stage} — only a confirmed bounty may be posted. The owner's yes (box bounty confirm ${id}) is the boundary nothing crosses without`);
  }
  if (!existsSync(record.folder) || !statSync(record.folder).isDirectory()) {
    throw new BountyRefused('folder-missing', `the recorded bounty folder ${record.folder} is gone — recreate it with box bounty create, or run box bounty withdraw ${id} to end this bounty`);
  }
  let manifestId: string | null = null;
  try {
    const parsed = JSON.parse(readFileSync(join(record.folder, 'bounty.json'), 'utf8')) as { id?: unknown };
    manifestId = typeof parsed.id === 'string' ? parsed.id : null;
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
  // The owner's allowedDestinations, enforced on the canonical --to: when the
  // limits file lists directories, the destination must land inside one of
  // them — a junction spelling resolves to its real location before the check.
  const limits = resolveLimits(repoRoot);
  if (limits.allowedDestinations !== null) {
    const destDirKey = `${toPosix(destReal).toLowerCase()}/`;
    const allowed = limits.allowedDestinations.some(dir => {
      if (dir === 'github') return false;
      const key = `${toPosix(dir).toLowerCase()}/`;
      return destDirKey === key || destDirKey.startsWith(key);
    });
    if (!allowed) {
      // An empty list refuses every --to; say so instead of printing the empty
      // parens where the allowed directories would be named.
      throw new BountyRefused('destination-not-allowed', limits.allowedDestinations.length === 0
        ? `--to ${toDir} resolves to ${destReal} — the owner's allowedDestinations is an empty list, so no destination is allowed. The owner widens the list in .box/limits.json`
        : `--to ${toDir} resolves to ${destReal}, which is not inside the owner's allowedDestinations (${limits.allowedDestinations.join(', ')}) — deliver inside one of them, or the owner widens the list in .box/limits.json`);
    }
  }
  if (existsSync(destination)) {
    throw new BountyRefused('destination-exists', `${destination} already exists — a delivered copy is never overwritten. Remove it or pick another --to`);
  }
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(record.folder, destination, { recursive: true }); // copy, not move — the recorded folder stays
  transitionTo(repoRoot, record, 'posted', { destination });
  return { record, destination };
}

export interface WithdrawOutcome {
  readonly record: BountyRecord;
  readonly outcome: 'withdrawn' | 'already-withdrawn';
}

export function withdrawBounty(repoRoot: string, id: string): WithdrawOutcome {
  const record = loadRecord(repoRoot, id);
  if (record.stage === 'withdrawn') { syncGitHubDecision(repoRoot, record); return { record, outcome: 'already-withdrawn' }; }
  if (!isOpenStage(record.stage)) {
    throw new BountyRefused('already-ended', `bounty ${id} already ended (${record.stage}) — withdraw only ends an open bounty`);
  }
  transitionTo(repoRoot, record, 'withdrawn', { command: 'withdraw' });
  dropDurabilityRefs(repoRoot, record);
  syncGitHubDecision(repoRoot, record);
  return { record, outcome: 'withdrawn' };
}

// `reject` ends a bounty an answer can have reached — posted onward — with the
// reason kept on the event. Earlier stages end through `withdraw` instead.
const REJECTABLE: ReadonlySet<BountyStage> = new Set(['posted', 'taken', 'answered', 'verified']);

export function rejectBounty(repoRoot: string, id: string, reason: string): BountyRecord {
  const text = reason.trim();
  if (text === '') {
    throw new BountyRefused('missing-reason', `reject needs a reason — box bounty reject ${id} --reason "<why this answer did not land>"`);
  }
  const record = loadRecord(repoRoot, id);
  if (record.stage === 'rejected' && record.github !== undefined) { syncGitHubDecision(repoRoot, record); return record; }
  if (!isOpenStage(record.stage)) {
    throw new BountyRefused('already-ended', `bounty ${id} already ended (${record.stage}) — there is nothing left to reject`);
  }
  if (!REJECTABLE.has(record.stage)) {
    throw new BountyRefused('wrong-stage', `bounty ${id} is ${record.stage} — reject ends a bounty once it is posted; to end it before that run box bounty withdraw ${id}`);
  }
  transitionTo(repoRoot, record, 'rejected', { reason: text, command: 'reject' });
  dropDurabilityRefs(repoRoot, record);
  syncGitHubDecision(repoRoot, record);
  return record;
}
