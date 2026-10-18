// The JSON documents for `status --json`, `look --json` and `config --json`
// (BT19). Each is one object printed on standard output and nothing else:
// `"schema"` is the first key — a changed field meaning needs `@2` — times
// are ISO 8601, amounts whole dollars, commits full hashes, and an absent
// fact is null, never a missing key. Text written by someone else — a pull
// request description, an issue comment — appears only inside `fromOthers`,
// marked as theirs; it is never the tool's own words.
//
// Every document is built from the same typed facts the text views read —
// the record, the settings, the GitHub refresh — never by parsing the text.
// Building one starts no process the text read would not start: the GitHub
// refresh, the comments read, the merged-solution scan and the once-only
// notices all run for `box bounty status` in its text form too, and the
// repository's one `git config` read is shared through the command pins.
// What a text view prints as a line — an owner's notice, a merge
// recognised, an acting-on line — goes to the `notice` callback instead,
// so the document stays the only thing on standard output.

import { boundAmount } from './format.js';
import type { GitHubPublication } from './gh.js';
import { issueComments,refreshGitHubFormat,refreshGitHubStatus } from './collect.js';
import { dryMergeOnto } from './git.js';
import { discoverInstructions,instructionNotices } from './instructions.js';
import type { LookResult } from './look.js';
import { publishLists } from './never-ship.js';
import { BountyRefused } from './errors.js';
import { applicableAttempts,attemptsOf,baseCommitOf,isOpenStage,listRecords,loadRecord,persistRecord,trackedRecordFiles } from './record.js';
import { promisedTotal } from './money.js';
import { bountyAge,endedNextStep,nextStep,notNext,staleReminderLines } from './render.js';
import { sharedEnded,sharedOpen,sharedRead } from './store.js';
import { refreshSharedMemory } from './chain.js';
import type { Attempt,BountyRecord,ScanFinding,StageEvent,WaitingFor } from './record.js';
import { actingOn,askMergeNoticeLine,loadSettings,loadState,localFirstMergeLine,readDecision,readInstructions,repoReward,repositoryIdentity,rewardNoticeLine,saidOnce,settingsFile } from './settings.js';

type JsonObject = Record<string, unknown>;

// ---- shared field builders ----------------------------------------------

// A scan hit names file, line and rule — never the flagged text itself.
const scanHit = (hit: { readonly path: string; readonly line: number; readonly rule: string; readonly commit?: string }): JsonObject => ({
  path: hit.path,
  line: hit.line,
  rule: hit.rule,
  commit: hit.commit ?? null
});

const waitingEntry = (waiting: WaitingFor): JsonObject => ({
  for: waiting.for,
  reason: waiting.reason,
  since: waiting.at,
  to: waiting.to ?? null,
  hits: waiting.hits?.map(scanHit) ?? null
});

const scanFindingEntry = (finding: ScanFinding): JsonObject => ({
  at: finding.at,
  where: finding.where,
  hits: finding.hits.map(scanHit),
  settled: finding.settled
});

// Every event field rides one object shape, so a reader can walk the
// history without knowing which transitions carry which facts.
const eventEntry = (event: StageEvent): JsonObject => ({
  stage: event.stage,
  at: event.at,
  command: event.command ?? null,
  attempt: event.attempt ?? null,
  destination: event.destination ?? null,
  reason: event.reason ?? null,
  merge: event.merge ?? null,
  unasked: event.unasked === true,
  partial: event.partial ?? null
});

const solutionEntry = (record: BountyRecord, attempt: Attempt): JsonObject => ({
  n: attempt.n,
  pullRequest: attempt.pullRequest ?? null,
  collected: attempt.at,
  seen: attempt.seenAt !== undefined,
  author: attempt.author ?? null,
  commit: attempt.commit,
  outcome: attempt.outcome,
  changed: attempt.changed ?? null,
  added: attempt.added ?? null,
  deleted: attempt.deleted ?? null,
  conflicts: attempt.conflicts ?? null,
  // Replayed inside status the recorded `next:` line is dropped — the
  // bounty's own `next` field is stated once from what is true now, the
  // same filter the text view applies (the pass's BT19 finding).
  report: attempt.report.filter(notNext),
  payTo: attempt.payTo?.state ?? null,
  merged: record.events.some(event => event.stage === 'applied' && event.attempt === attempt.n)
});

const pullRequestEntry = (pr: NonNullable<GitHubPublication['availablePullRequests']>[number], publication: GitHubPublication, attempts: readonly Attempt[]): JsonObject => ({
  n: pr.n,
  commit: pr.commit,
  author: pr.author ?? null,
  seenAt: publication.seenPullRequests?.find(seen => seen.n === pr.n && seen.commit === pr.commit)?.at ?? null,
  payTo: pr.payTo?.state ?? null,
  collectedAs: attempts.find(attempt => attempt.pullRequest === pr.n && attempt.commit === pr.commit)?.n ?? null
});

const githubEntry = (publication: GitHubPublication, attempts: readonly Attempt[]): JsonObject => ({
  repository: publication.repository,
  account: publication.account,
  branch: publication.branch,
  commit: publication.commit,
  kind: publication.kind ?? null,
  // `state` is the issue's recorded state, open or closed, as the shape
  // names it; `lifecycle` is the publication's own stage.
  state: publication.issue === null ? null : publication.outside?.issueState ?? null,
  lifecycle: publication.state,
  issue: publication.issue === null ? null : { number: publication.issue.number, url: publication.issue.url },
  // The issue-format comparison cache — what `status --full` prints as the
  // "GitHub format block" lines; the document carries the recorded facts.
  formatRead: publication.formatRead ?? null,
  formatReadAt: publication.formatReadAt ?? null,
  formatUnavailableAt: publication.formatUnavailableAt ?? null,
  formatRepair: publication.formatRepair ?? null,
  pending: publication.pending,
  pullRequests: publication.availablePullRequests?.map(pr => pullRequestEntry(pr, publication, attempts)) ?? null,
  comments: publication.questions === undefined ? null : {
    count: publication.questions.count,
    latestAt: publication.questions.latestAt,
    unnamed: publication.questions.unnamed ?? 0
  },
  unavailable: publication.unavailableAt === undefined || publication.unavailableAt === null ? null : {
    at: publication.unavailableAt,
    reason: publication.unavailableReason ?? null
  },
  closedNote: publication.closedNote ?? null,
  pay: publication.pay === undefined ? null : {
    pr: publication.pay.pr,
    solver: publication.pay.solver,
    link: publication.pay.link,
    testMode: publication.pay.testMode,
    editedBy: publication.pay.editedBy,
    readFailed: publication.pay.readFailed === true
  }
});

// The saved job context `renderResume` prints: the branch, the commit the
// work stood on, the files still in flight and any note the agent saved.
// A record from before contexts existed carries `not-recorded` — null here.
const resumeEntry = (record: BountyRecord): JsonObject | null =>
  record.resume?.kind === 'recorded'
    ? { branch: record.resume.branch, commit: record.resume.commit, changed: [...record.resume.changed], note: record.resume.note }
    : null;

// The fresh "current code now" read the text status runs under --full (or
// for a record with no publication): whether the leading applicable attempt
// would merge onto the current branch right now. `solutions[].conflicts` is
// the collection-time fact; this is the live one. Open records only — the
// text view never merges for an ended bounty.
const mergeNowEntry = (repoRoot: string, record: BountyRecord, attempts: readonly Attempt[]): JsonObject | null => {
  if (!isOpenStage(record.stage)) return null;
  const applicable = applicableAttempts(attempts);
  if (applicable.length === 0) return null;
  const fresh = dryMergeOnto(repoRoot, applicable[0]!.commit);
  return {
    attempt: applicable[0]!.n,
    result: fresh.kind,
    conflicts: fresh.kind === 'conflict' ? [...fresh.paths] : null,
    detail: fresh.kind === 'untestable' ? fresh.detail : null
  };
};

// One bounty entry — the full fact set either view knows, so `status --json`
// is `status --full`'s facts without the prose. `next` is decided by the
// caller: open bounties take `nextStep`, the asked-for or last-ended record
// takes the saved-job line when nothing is open — the text view's own rule.
const bountyEntry = (repoRoot: string, record: BountyRecord, next: string | null): JsonObject => {
  const attempts = attemptsOf(record);
  // The two age facts (BT35) belong to open bounties — an ended record's
  // wait is over, so both stay null there; on an open record a source time
  // that does not parse also reads null, never a non-ISO echo.
  const age = isOpenStage(record.stage) ? bountyAge(record) : { openedAt: null, lastActivityAt: null };
  return {
    id: record.id,
    title: record.title,
    why: record.why ?? null,
    stage: record.stage,
    createdAt: record.createdAt,
    openedAt: age.openedAt,
    lastActivityAt: age.lastActivityAt,
    // Old records carry the snapshot's base commit; records made now keep no
    // snapshot, so the resume context's recorded commit stands in — it is the
    // same HEAD `create` captured. baseCommitOf is the one read: the
    // '(no commits yet)' display sentinel is not a commit.
    baseCommit: baseCommitOf(record),
    reward: boundAmount(record) ?? null,
    job: record.partOf ?? record.job?.file ?? null,
    resume: resumeEntry(record),
    waiting: record.waiting === undefined ? null : waitingEntry(record.waiting),
    github: record.github === undefined ? null : githubEntry(record.github, attempts),
    allowedBy: record.allowedBy === undefined ? null : {
      decision: record.allowedBy.decision,
      level: record.allowedBy.level,
      decisionAt: record.allowedBy.decisionAt,
      usedAt: record.allowedBy.usedAt
    },
    scanFindings: (record.scanFindings ?? []).map(scanFindingEntry),
    solutions: attempts.map(attempt => solutionEntry(record, attempt)),
    mergeNow: mergeNowEntry(repoRoot, record, attempts),
    events: record.events.map(eventEntry),
    next,
    corrupt: false
  };
};

// A file whose JSON no longer reads as a record: status names it rather than
// dropping it — the full key set stays, every fact null, `corrupt` says why.
const corruptEntry = (file: string): JsonObject => ({
  id: file.replace(/\.json$/, ''),
  title: null,
  why: null,
  stage: null,
  createdAt: null,
  openedAt: null,
  lastActivityAt: null,
  baseCommit: null,
  reward: null,
  job: null,
  resume: null,
  waiting: null,
  github: null,
  allowedBy: null,
  scanFindings: [],
  solutions: [],
  mergeNow: null,
  events: [],
  next: null,
  corrupt: true
});

// ---- status --------------------------------------------------------------

export interface StatusDocumentOptions {
  readonly id?: string;
  readonly comments?: boolean;
}

// Reads exactly what `renderStatus` reads: the owner decision first (its
// refusal must land before any refresh, as in the text path), the records —
// which runs the merged-solution scan — the GitHub refresh per open record,
// then the seen-marking writes the text view performs while rendering.
export function statusDocument(repoRoot: string, options: StatusDocumentOptions, notice: (line: string) => void): JsonObject {
  // BT32: `status --json` is one of the five commands that refresh shared memory.
  refreshSharedMemory(repoRoot);
  const ownerRead = readDecision(repoRoot);
  const { amount, limit } = repoReward(repoRoot);
  // BT32: a shared-only id is answered from the imported chain row exactly
  // as the text view does — the record the fold built, marked shared.
  let single: BountyRecord | undefined;
  if (options.id !== undefined) {
    try { single = loadRecord(repoRoot, options.id); }
    catch (error) {
      if (!(error instanceof BountyRefused) || error.reason !== 'shared-only') throw error;
      single = sharedRead(repoRoot, options.id) ?? undefined;
      if (single === undefined) throw error;
    }
  }
  // Shared rows join the read the same way the text view merges them: local
  // records govern an id they know; chain-only bounties show read-only.
  const sharedEntries = single === undefined
    ? [...sharedOpen(repoRoot), ...sharedEnded(repoRoot)].map(record => ({ record, file: `${record.id}.json` }))
    : [];
  const listed = [...(single !== undefined ? [{ record: single, file: `${single.id}.json` }] : listRecords(repoRoot)), ...sharedEntries];
  for (const entry of listed) {
    // A shared record's facts are the chain's — never GitHub-refreshed and
    // never persisted back: the shared table is the only writable copy.
    if (entry.record !== null && entry.record.shared === true) continue;
    if (entry.record !== null && isOpenStage(entry.record.stage)) refreshGitHubStatus(repoRoot, entry.record);
    // The document always carries the --full fact set, so an ended record's
    // issue-format comparison is refreshed here exactly as --full does.
    else if (entry.record !== null) refreshGitHubFormat(repoRoot, entry.record);
  }
  const open = listed.filter(entry => entry.record !== null && isOpenStage(entry.record.stage));
  const ended = listed.filter(entry => entry.record !== null && !isOpenStage(entry.record.stage));
  const corrupt = listed.filter(entry => entry.record === null);
  // The job to go back to stays on show after a bounty ends — for the
  // bounty asked for by id, or else the one that ended last, and only when
  // nothing is open: the text view's own rule, same words.
  const lastEnded = [...ended].sort((a, b) => (a.record!.events.at(-1)?.at ?? '').localeCompare(b.record!.events.at(-1)?.at ?? '')).at(-1)?.record ?? null;

  const bounties: JsonObject[] = [];
  for (const entry of open) {
    const record = entry.record!;
    // The document is captured before the seen-marking writes, so `seen`
    // reads what the text view printed this run.
    const data = bountyEntry(repoRoot, record, nextStep(record));
    if (options.comments === true) {
      // --comments reads what other accounts wrote, bound to this bounty's
      // own issue first — the same read the text view makes, kept under
      // `fromOthers` so their words are never the tool's.
      data['fromOthers'] = record.github !== undefined && record.github.issue !== null
        ? issueComments(repoRoot, record).map(comment => ({ from: comment.author, at: comment.at, text: comment.body }))
        : [];
    } else {
      data['fromOthers'] = null;
    }
    bounties.push(data);
    if (record.shared === true) continue; // a shared row carries no seen state — the chain is the fact
    if (record.github?.outside !== undefined) {
      record.github.seenPullRequests = [...record.github.seenPullRequests ?? [], ...record.github.availablePullRequests?.filter(pr => !record.github?.seenPullRequests?.some(seen => seen.n === pr.n && seen.commit === pr.commit)) ?? []];
      persistRecord(repoRoot, record);
    }
    const attempts = attemptsOf(record);
    if (attempts.length > 0) {
      record.attempts = attempts.map(attempt => attempt.seenAt === undefined ? { ...attempt, seenAt: new Date().toISOString() } : attempt);
      persistRecord(repoRoot, record);
    }
  }
  for (const entry of ended) {
    const record = entry.record!;
    const detailed = options.id !== undefined || record === lastEnded;
    bounties.push(bountyEntry(repoRoot, record, detailed && open.length === 0 ? endedNextStep(record) : null));
  }
  for (const entry of corrupt) bounties.push(corruptEntry(entry.file));

  // The notices the text view interleaves, emitted here to stderr: the
  // reward read's said-once line, each recognised-merge fact and the
  // instruction-file notices — same wording, same once-only semantics.
  if (amount > 0 && saidOnce(repoRoot, 'reward-is-a-promise')) {
    notice("a promise in the owner's name, paid by hand; the owner sets it in box bounty config");
  }
  for (const [address, firstMerge] of Object.entries(loadState().firstMerges)) {
    if (listed.some(entry => entry.record?.events.some(event => event.stage === 'applied' && event.merge === firstMerge.commit))) {
      notice(`first outside solution merged in ${address}: commit ${firstMerge.commit} at ${firstMerge.at}`);
    }
  }
  const localMerge = localFirstMergeLine(repoRoot);
  if (localMerge !== null) notice(localMerge);
  const rewardNotice = rewardNoticeLine();
  if (rewardNotice !== null) notice(rewardNotice);
  const askNotice = askMergeNoticeLine();
  if (askNotice !== null) notice(askNotice);
  for (const line of instructionNotices(repoRoot)) notice(line);
  // The once-said long-wait lines ride stderr exactly as the text view
  // prints them — said once per bounty whichever form sees it first (BT35).
  for (const line of staleReminderLines(repoRoot, open.map(entry => entry.record!))) notice(line);

  let repository: string | null = null;
  try { repository = repositoryIdentity(repoRoot); } catch { /* an unreadable remote set is null, not a refusal — the decision above already read what it could */ }
  const trackedFiles = trackedRecordFiles(repoRoot).length;
  return {
    schema: 'box-bounty/status@1',
    repository,
    acting: actingOn(repoRoot),
    owner: {
      decision: ownerRead.decision,
      denied: ownerRead.denied === true,
      decisionAt: ownerRead.at,
      decisionLevel: ownerRead.level,
      reward: amount,
      rewardLimit: limit,
      // The "open bounties here promise $N" half of the reward line —
      // this checkout's open-bounty total, the same count the text prints.
      promised: promisedTotal(open.map(entry => entry.record!))
    },
    // The `records:` line as a fact (BT28): whether `.box/bounties/` is
    // tracked in Git, and how many files — the warning's trigger.
    records: { tracked: trackedFiles > 0, trackedFiles },
    bounties
  };
}

// ---- look ----------------------------------------------------------------

// From the LookResult `lookBounty` returned — the same record, attempt and
// diff the text view prints; nothing is recomputed here.
export function lookDocument(result: LookResult): JsonObject {
  const attempt = result.attempt;
  const changeOf = (path: string): string =>
    attempt.changed?.includes(path) ? 'changed'
      : attempt.added?.includes(path) ? 'added'
        : attempt.deleted?.includes(path) ? 'deleted'
          : 'changed';
  return {
    schema: 'box-bounty/look@1',
    id: result.record.id,
    n: attempt.n,
    pullRequest: attempt.pullRequest ?? null,
    collected: result.collected,
    author: attempt.author ?? null,
    commit: attempt.commit,
    files: result.files.map(path => ({ path, change: changeOf(path) })),
    report: [...attempt.report],
    payTo: attempt.payTo?.state ?? null,
    large: result.large,
    diff: result.diff,
    // The pull request's own description, recorded credential-redacted at
    // collection: the solver's words, marked as theirs. Null on attempts
    // recorded before the description was kept.
    fromOthers: attempt.description === undefined ? null : { from: attempt.author ?? null, text: attempt.description }
  };
}

// ---- config ---------------------------------------------------------------

// The settings the text config prints, as facts: the file, the all-projects
// row, every repository entry with its history, this repository's read,
// the instruction settings and discovered files, the two publish lists,
// the promised total and what waits on the owner.
export function configDocument(repoRoot: string | null, notice: (line: string) => void): JsonObject {
  const settings = loadSettings();
  const repositories: JsonObject = {};
  for (const [key, entry] of Object.entries(settings.repositories)) {
    repositories[key] = {
      decision: entry.bounty === null ? 'denied' : entry.bounty,
      addedAt: entry.changes[0]?.at ?? entry.at,
      changedAt: entry.at,
      reward: entry.reward?.amount ?? 0,
      rewardLimit: entry.rewardLimit?.amount ?? null,
      history: entry.changes.map(change => ({ decision: change.bounty === null ? 'denied' : change.bounty, at: change.at }))
    };
  }

  let thisRepository: string | null = null;
  let decision: string | null = null;
  let denied = false;
  let decisionAt: string | null = null;
  let decisionLevel: string | null = null;
  let reward = 0;
  let rewardLimit: number | null = null;
  if (repoRoot !== null) {
    // A remote set the identity read cannot settle is a fact for the owner,
    // not a refusal — the text view prints it as the repository's line;
    // here it rides stderr and the field stays null.
    try { thisRepository = repositoryIdentity(repoRoot); }
    catch (error) { notice(`this repository could not be identified: ${error instanceof BountyRefused ? `${error.reason}: ${error.message}` : String(error)}`); }
    if (thisRepository !== null) {
      try {
        const read = readDecision(repoRoot);
        decision = read.decision;
        denied = read.denied === true;
        decisionAt = read.at;
        decisionLevel = read.level;
        const money = repoReward(repoRoot);
        reward = money.amount;
        rewardLimit = money.limit;
      } catch (error) { notice(`this repository's permission could not be read: ${error instanceof BountyRefused ? `${error.reason}: ${error.message}` : String(error)}`); }
    }
  }

  let instructions: JsonObject | null = null;
  let lists: JsonObject | null = null;
  let promised: number | null = null;
  let trackedFiles: number | null = null;
  const waiting: JsonObject[] = [];
  if (repoRoot !== null) {
    const choice = readInstructions(repoRoot);
    instructions = {
      enabled: choice.enabled,
      file: choice.file ?? null,
      found: discoverInstructions(repoRoot).map(file => ({ path: file.path, refused: file.refusal ?? null }))
    };
    const publish = publishLists(repoRoot);
    lists = { safeToPublish: [...publish.safe], neverPublish: [...publish.never] };
    trackedFiles = trackedRecordFiles(repoRoot).length;
    const listed = listRecords(repoRoot);
    promised = promisedTotal(listed.filter(entry => entry.record !== null && isOpenStage(entry.record.stage)).map(entry => entry.record!));
    for (const entry of listed) {
      if (entry.record?.stage === 'waiting' && entry.record.waiting !== undefined) {
        waiting.push({ id: entry.record.id, ...waitingEntry(entry.record.waiting) });
      }
    }
  }

  const rewardNotice = rewardNoticeLine();
  if (rewardNotice !== null) notice(rewardNotice);
  const askNotice = askMergeNoticeLine();
  if (askNotice !== null) notice(askNotice);
  const toolState = loadState();
  for (const migration of toolState.migrations) {
    notice(`migration ${migration.at}: ${JSON.stringify(migration.path)} ${migration.detail}; re-add: box bounty allow ${migration.repository ?? '<owner/name>'}`);
  }
  for (const [key, firstMerge] of Object.entries(toolState.firstMerges)) {
    notice(`first outside solution merged in ${key}: commit ${firstMerge.commit} at ${firstMerge.at}; see: box bounty status --full`);
  }
  if (repoRoot !== null) {
    const localMerge = localFirstMergeLine(repoRoot);
    if (localMerge !== null) notice(localMerge);
    for (const line of instructionNotices(repoRoot, false)) notice(line);
  }

  return {
    schema: 'box-bounty/config@1',
    settingsFile: settingsFile(),
    allProjects: settings.default?.bounty ?? null,
    allProjectsChangedAt: settings.default?.at ?? null,
    repositories,
    thisRepository,
    decision,
    denied,
    decisionAt,
    decisionLevel,
    reward,
    rewardLimit,
    promised,
    instructions,
    publishLists: lists,
    waiting,
    // The `records:` line as a fact (BT28) — null outside a checkout.
    records: trackedFiles === null ? null : { tracked: trackedFiles > 0, trackedFiles }
  };
}

