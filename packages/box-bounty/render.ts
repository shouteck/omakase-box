// The agent-facing text surfaces: the status view (compact and --full),
// the help screen, the overview line, the OPEN file and the instruction-block
// sync every record write refreshes, and the small next-step clauses. All of
// it reads records — none of it is read BY the record store. Moved out of
// record.ts unchanged (BT25).

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { quoteForeign,showPath } from './notice.js';
import { boundAmount } from './format.js';
import { dryMergeOnto,GIT_LEAST } from './git.js';
import { GH_LEAST } from './gh.js';
import { issueComments,refreshGitHubFormat,refreshGitHubStatus } from './collect.js';
import { instructionNotices,syncInstructions } from './instructions.js';
import { promisedTotal } from './money.js';
import { ownerStatusLine,waitingSummary } from './owner-text.js';
import { payToLine } from './pay.js';
import { applicableAttempts,attemptsOf,isOpenStage,listRecords,loadRecord,persistRecord,recordDir,retiredRoute,setOpenSurfacesSync } from './record.js';
import { askMergeNoticeLine,loadState,localFirstMergeLine,repoReward,rewardNoticeLine,saidOnce } from './settings.js';
import type { AttemptOutcome,BountyRecord,ListedBounty,StageEvent } from './record.js';

// The saved job context, under the bounty it belongs to: `indent` places it
// inside that bounty's lines. The commit hash is the full form's detail —
// the compact form names the branch and the work in flight (BT17).
export function renderResume(record: BountyRecord, indent = '', full = false): string {
  const context = record.resume;
  if (context?.kind !== 'recorded') return [`${indent}Return to your job`, `${indent}  The branch, commit and changed files were not recorded for this older bounty.`].join('\n');
  return [`${indent}Saved job context (${record.id}) — where the work stood when the bounty was created`, `${indent}  branch: ${showPath(context.branch)}${full ? `; commit: ${context.commit}` : ''}`, `${indent}  changed files: ${context.changed.length === 0 ? 'none' : context.changed.map(showPath).join(', ')}`, ...(context.note === null ? [] : [`${indent}  note: ${JSON.stringify(context.note)}`])].join('\n');
}

const ATTEMPT_WORD: Record<AttemptOutcome, string> = {
  answered: 'arrived — nothing in it was run',
  // Attempts the check era recorded and never passed, set aside at load —
  // history, not a current promise, and never the default pick.
  'set-aside': 'recorded while checks ran and never green (checks were removed on 11 October 2026)'
};

// A report was written when its answer arrived and ends with the step that
// followed then. Replayed inside status, that line is left out: the bounty's
// own next step is stated once, from what is true now.
export const notNext = (line: string): boolean => !line.trimStart().startsWith('next:');

// The one `next:` command a bounty prints, shared by the text status and
// the status --json document (BT19).
export const nextStep = (record: BountyRecord): string => {
  if (retiredRoute(record) !== null) {
    return `this delivery route was retired; end it with box bounty close ${record.id}`;
  }
  switch (record.stage) {
    case 'drafted':
    case 'confirmed': return `deliver it — box bounty post ${record.id} (preview first with --preview)`;
    case 'waiting': return `waiting for the owner — ${waitingSummary(record)}`;
    case 'posted': return `box bounty look ${record.id} <number> collects a pull request and shows its change; box bounty apply ${record.id} <number> collects and merges`;
    case 'taken': return 'a solution is being read against the snapshot it was made for — run box bounty status again in a moment';
    case 'answered': {
      const conflicts = record.conflicts?.paths;
      if (conflicts !== undefined && conflicts.length > 0) return `the last merge try conflicted in ${conflicts.map(showPath).join(', ')} — read the solution with box bounty look ${record.id} <n>; once its commit is merged on the bounty's branch the next bounty command closes it, or end it with box bounty close ${record.id} --reason "<why>"`;
      return `box bounty apply ${record.id} <n> chooses a solution (box bounty look ${record.id} <n> reads it first); box bounty close ${record.id} ends it`;
    }
    default: return 'ended — nothing to do';
  }
};

// The one `next:` an ended bounty prints — the job to go back to, the
// revert when its merge landed, and the ways to look again or start fresh.
// Shared by the text status and the status --json document (BT19).
export const endedNextStep = (record: BountyRecord): string =>
  `continue the saved job${record.stage === 'applied' ? `; to reverse the merge: git revert -m 1 ${record.events.find(event => event.stage === 'applied')?.merge ?? '<merge>'}` : ''}; inspect: box bounty status ${record.id} --full; or create another with box bounty create --task <file> --why "<one line>"`;

// History events record the command that drove them, and records written
// while older commands existed keep those names on disk — history is never
// rewritten. Status prints the vocabulary the agent can act on, so the view
// maps each removed name to what replaced it ('revert' reads as plain Git —
// undo has no replacement command).
const EVENT_COMMAND_VIEW: Record<string, string> = { answer: 'look', reject: 'close', withdraw: 'close', undo: 'revert', confirm: 'post', 'owner answer': 'allow', 'owner allow': 'allow', 'owner ask': 'allow --ask', 'owner off': 'deny', 'owner on': 'allow', 'owner setup': 'config', 'owner summary': 'status --since' };
const historyJson = (event: StageEvent): string =>
  JSON.stringify(event.command === undefined || EVENT_COMMAND_VIEW[event.command] === undefined ? event : { ...event, command: EVENT_COMMAND_VIEW[event.command] });


// The reward side of `status`/`config`: what each new bounty on this
// repository will state, what its open bounties already promise, this
// repository's own limit and what is left of it (BT11c — one repository's
// money never leans on another's). A record written before BT11a counts $0 —
// the amount it was posted with.
// The reward line says what money is in force and what is already promised —
// money owed is a fact every call. The standing explanation of what a reward
// is (a promise in the owner's name, paid by hand, set in box bounty config)
// is said once per repository, recorded in the owner's settings, and lives in
// help and describe (BT17). With no amount, nothing promised and no limit
// there is nothing to say and the compact form stays silent.
function rewardStatusLine(repoRoot: string, open: readonly ListedBounty[], full: boolean): string | null {
  const { amount, limit } = repoReward(repoRoot);
  const promised = promisedTotal(open);
  if (!full && amount === 0 && promised === 0 && limit === null) return null;
  const stated = amount === 0 ? 'each new bounty states $0' : `each new bounty states $${amount}`;
  const counted = limit === null ? `open bounties here promise $${promised}` : `open bounties here promise $${promised} of a $${limit} limit — ${promised <= limit ? `$${limit - promised} left` : `$${promised - limit} over`}`;
  const once = !full && amount > 0 && saidOnce(repoRoot, 'reward-is-a-promise')
    ? " — a promise in the owner's name, paid by hand; the owner sets it in box bounty config"
    : '';
  return `reward: ${stated}${once}; ${counted}`;
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


// Cold-read surface for a fresh agent: every open bounty with id, stage, its
// attempts (passing first), the top attempt's fact report, a fresh merge read
// of the current code, and the next step; ended bounties one compact line; an
// empty project says so and says what to do. `--comments` prints the issue's
// comments marked as written by others. Never prints nothing.
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
    // Format reads and repairs are cache details — the long form's only
    // (BT14); the compact form carries one pointer on a closed record.
    if (options.full) {
      if (publication.formatUnavailableAt !== undefined && publication.formatUnavailableAt !== null) lines.push(`${record.id} current GitHub format read unavailable at ${publication.formatUnavailableAt}; cached last comparison ${publication.formatRead ?? 'not read'} at ${publication.formatReadAt ?? 'time not recorded'}; local record governs`);
      else if (publication.formatRead !== undefined) lines.push(`${record.id} GitHub format block: ${publication.formatRead} (last issue-body observation ${publication.formatReadAt ?? 'time not recorded'}; local record governs)`);
      if (publication.formatRepair !== undefined) lines.push(`${record.id} GitHub format update: ${publication.formatRepair}`);
    }
    if (!isOpenStage(record.stage) && !options.full) lines.push(`${record.id} compact status uses the cached last observation; current comparison: box bounty status ${record.id} --full`);
  }
  // The standing state lines: each prints only when it has something that
  // needs attention — a flat "allowed" and a $0 reward are silent in the
  // compact view and both print in the full one (BT17).
  const owner = ownerStatusLine(repoRoot, options.full === true);
  if (owner !== null) lines.push(owner);
  const reward = rewardStatusLine(repoRoot, open, options.full === true);
  if (reward !== null) lines.push(reward);
  const rewardNotice = rewardNoticeLine();
  if (rewardNotice !== null) lines.push(rewardNotice);
  const askNotice = askMergeNoticeLine();
  if (askNotice !== null) lines.push(askNotice);
  const localMerge = localFirstMergeLine(repoRoot);
  if (localMerge !== null) lines.push(localMerge);
  for (const [address, notice] of Object.entries(loadState().firstMerges)) {
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
      const pays = (boundAmount(record) ?? 0) > 0;
      // What waits for the agent leads (BT14): a pending outside action,
      // then each waiting solution with its pay fact and the collect
      // command beside it. `0 collected` beside waiting pull requests read
      // as "nothing waiting" — the count now only prints when there is one.
      if (!options.full && record.github?.pending !== null && record.github?.pending !== undefined) lines.push(`      github: ${record.github.pending}`);
      if (record.github?.outside !== undefined) {
        if (options.full) lines.push(`      outside state recorded ${record.github.outside.at}: issue ${record.github.outside.issueState}`);
        // The recorded listing embeds a collect/look command per pull
        // request — in the compact view that is this bounty's one `next:`
        // line below, so the commands are dropped from the listed lines and
        // kept in the record (BT17).
        const noCommands = (line: string): string => line.replace(/; (?:collect|look): box bounty [^;]+/g, '');
        for (const line of record.github.outside.answers.split('\n')) {
          if (!options.full && (line.startsWith('GitHub answers for ') || line.includes('collected as solution'))) continue;
          lines.push(`      ${options.full ? line : noCommands(line)}`);
        }
      }
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
      // This is the bounty's one `next:`; the collected count only says
      // something when there is one.
      if (attempts.length > 0) lines.push(`      ${attempts.length} collected solution(s) (${unseen} new, ${attempts.length - unseen} shown before); next: ${nextStep(record)}`);
      else lines.push(`      next: ${nextStep(record)}`);
      // Collected attempts and still-waiting pull requests each print once
      // (BT17): the outside listing above already names every pull request,
      // so the pull-request loop prints only when no listing was recorded.
      // The solution line is the compact per-attempt line: a posted record's
      // attempts are all listed here — new or seen — while the fuller
      // `attempts (n)` table below is the full form's (and a record with no
      // GitHub publication still keeps the old seen-only view here).
      for (const attempt of attempts) {
        if (attempt.seenAt === undefined && (record.github === undefined || options.full === true)) continue;
        lines.push(`      solution #${attempt.n}: ${attempt.seenAt === undefined ? 'new, not decided' : `seen and not decided, age ${seenAge(attempt.seenAt)}`}${pays && attempt.payTo !== undefined ? `; ${payToLine(attempt.payTo)}` : ''}${attempt.conflicts !== null && attempt.conflicts !== undefined && attempt.conflicts.length > 0 ? `; merging onto the current code conflicts in ${attempt.conflicts.map(showPath).join(', ')}` : ''}`);
      }
      if (record.github?.outside === undefined) for (const pr of record.github?.seenPullRequests ?? []) if (!attempts.some(attempt => attempt.commit === pr.commit) && record.github?.availablePullRequests?.some(available => available.n === pr.n && available.commit === pr.commit)) lines.push(`      pull request #${pr.n}: seen and not decided, age ${seenAge(pr.at)}${pays && pr.payTo !== undefined ? `; ${payToLine(pr.payTo)}` : ''}`);
      // A failed refresh names its reason (BT14); a retry is offered only
      // where a rerun could read a different answer.
      if (record.github?.unavailableAt !== null && record.github?.unavailableAt !== undefined) {
        const reason = record.github.unavailableReason ?? 'github-status-unavailable';
        lines.push(`      the outside state could not be refreshed — ${reason} at ${record.github.unavailableAt}; last recorded outside state ${record.github.outside?.at ?? 'not yet read'}`);
        lines.push(reason === 'github-issue-mismatch'
          ? `      rerunning box bounty status reads the same answer — if the recorded issue is not this bounty's, end it with box bounty close ${record.id}`
          : '      retry box bounty status');
      }
      // A zero count is nothing to say; comments that exist need attention.
      if (record.github?.questions !== undefined && (record.github.questions.count > 0 || options.full === true)) lines.push(`      comments from other accounts: ${record.github.questions.count}${record.github.questions.unnamed === undefined ? '' : ` (${record.github.questions.unnamed} from an account whose name could not be read)`}; latest: ${record.github.questions.latestAt ?? 'none'}; read: box bounty status ${record.id} --comments`);
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
      // Saved context follows the work it explains (BT14).
      lines.push(renderResume(record, '      ', options.full === true));
      // The github: facts are the long form's — reviews found agents never
      // used them in the short one.
      if (options.full && record.github !== undefined) lines.push(`      github: ${record.github.repository} ${record.github.branch} ${record.github.issue?.url ?? 'issue pending'} (${record.github.state}${record.github.kind !== 'history' ? ', snapshot-posted — from before the bounty became an issue on the code that is already there' : ''})${record.github.pending !== null ? `; ${record.github.pending}` : ''}`);
      if (options.full && record.allowedBy !== undefined) lines.push(`      allowed by: the owner's ${record.allowedBy.decision === 'allowed' ? `${record.allowedBy.level === 'default' ? 'all-projects setting' : 'repository entry'} "allowed" written ${record.allowedBy.decisionAt}` : 'one-bounty answer'}`);
      if (record.github?.outside !== undefined) {
        record.github.seenPullRequests = [...record.github.seenPullRequests ?? [], ...record.github.availablePullRequests?.filter(pr => !record.github?.seenPullRequests?.some(seen => seen.n === pr.n && seen.commit === pr.commit)) ?? []];
        persistRecord(repoRoot, record);
      }
      if (attempts.length > 0) {
        const applicable = applicableAttempts(attempts);
        const ordered = [...attempts].sort((a, b) => {
          const aOk = a.outcome === 'answered' ? 0 : 1;
          const bOk = b.outcome === 'answered' ? 0 : 1;
          return aOk - bOk || a.n - b.n;
        });
        // The per-attempt outcome list, the reports and the fresh merge read
        // are the full form's detail (BT17): in the compact view a posted
        // bounty's pull requests came from the outside listing above and its
        // collected solutions print on the `solution #n` lines. A record with
        // no GitHub publication has no listing, so it keeps the list here.
        if (record.github === undefined || options.full === true) {
          lines.push(`      attempts (${attempts.length}):`);
          for (const attempt of ordered) {
            lines.push(`        #${attempt.n} ${attempt.outcome} — ${ATTEMPT_WORD[attempt.outcome]}; ${attempt.seenAt === undefined ? 'new' : `seen since ${attempt.seenAt}`}${attempt.author !== undefined ? `; from GitHub account ${attempt.author}` : ''}${pays && attempt.payTo !== undefined ? `; ${payToLine(attempt.payTo)}` : ''}${attempt.conflicts !== null && attempt.conflicts.length > 0 ? `; merges with conflicts in ${attempt.conflicts.map(showPath).join(', ')}` : ''}`);
          }
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
    // A hand merge the owner's decision would have held (ask/off) is marked
    // where it is read back: the owner was not asked before that merge (BT13).
    const unasked = record.events.some(event => event.stage === 'applied' && event.unasked === true) ? ' — the owner was not asked before the merge' : '';
    // applied/rejected/undone name the job the bounty came from, so the record
    // alone says which piece of work is unblocked — falling back to the title.
    if (record.stage === 'applied' || record.stage === 'rejected' || record.stage === 'undone') return `${record.id} ${record.stage}${unasked}${finding}${paid} (job: ${record.job?.file ?? record.title})`;
    return `${record.id} ${record.stage}${unasked}${finding}${paid}`;
  }).join(', ')}`);
  // The job to go back to stays on show after a bounty ends: for the bounty that
  // was asked for by id, or else for the one that ended last.
  const lastEnded = [...ended].sort((a, b) => (a.record!.events.at(-1)?.at ?? '').localeCompare(b.record!.events.at(-1)?.at ?? '')).at(-1)?.record ?? null;
  for (const entry of ended) {
    if (entry.record === null) continue;
    const detailed = options.id !== undefined || entry.record === lastEnded;
    if (detailed) {
      lines.push(renderResume(entry.record, '  ', options.full === true));
      const pay = entry.record.github?.pay;
      if (pay !== undefined) {
        lines.push(`  pay: ${pay.pr !== null ? `pull request ${pay.pr}` : 'the returned folder'}${pay.solver !== null ? ` by ${pay.solver}` : ''} was merged — pay $${boundAmount(entry.record) ?? '?'} to ${pay.solver ?? 'the solver'}${pay.link !== null ? ' at the link they supplied' : ' — no recognised payment link was given'} — a record, not a reminder`);
      }
      // The finding stays visible after the bounty ends — the owner learns a
      // flagged file sat in their working tree even when the agent stopped it.
      lines.push(...scanFindingLines(entry.record, '  '));
      // With a bounty still open, that bounty's line above is the next step.
      if (open.length === 0) lines.push(`  next: ${endedNextStep(entry.record)}`);
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
    'GitHub posting is free and public, only to this project\'s already-public repository. Nobody is known to be watching these issues.',
    'the owner allows the tool once — a decision kept in the owner\'s own settings outside the repository. Those settings stop accidents and record changes; they are not a lock against an agent that deliberately changes them. Until then the first post waits and prints the few lines to put to them. post <id> --preview shows exactly what becomes public — the commit already there, unpushed commits, and only the uncommitted work you ask for (--with-changes, --include <file>). status reads the pull requests waiting; look <id> <n> collects one and shows its change, read from fetched objects — nothing is checked out, nothing is left behind. Every bounty states the reward the owner set for its repository — $0 until the owner sets one in box bounty config.',
    '',
    'the journey (what each command does → the stage it leaves):',
    '  create    save the task and private context and snapshot the working state → drafted',
    '  post      publishes the GitHub issue and branch → posted — or waits on the owner',
    '  status    every open bounty, the pull requests waiting, the attempts and the next step; --comments prints comments written by others, marked as theirs',
    '  look [id] <n>  collect pull request n (or show solution n already collected) — its change, written by the solver and marked as theirs; --full prints a large change',
    '  apply [id] [<n>]  merge a solution onto the current code — collects like look when n names a pull request — the recorded decision → applied',
    '  close [id]  end a bounty with nothing merged; --reason "<why>" stays on the record → rejected, without it → withdrawn',
    '  hook      owner-opt-in awareness at session moments: on --host <name> prints the full disclosure and changes nothing until run again with the flag it names; off removes it; start|pause|finish is the command a host entry runs',
    '  describe  what the tool does, when it is worth using and when not, plus the facts to choose — --rules prints the block for a project\'s rules file',
    '  help      this screen',
    '',
    '  create --task <file|-> --why "<one line>" [--title "<text>"] [--resume "<context>"] [--repo <path>]',
    '  The task is a file describing what needs doing, written for the solver; code is included automatically. "-" reads standard input.',
    '  Put what you tried in the task. --resume saves private context for unfinished work and the larger job. With one open bounty, commands accept no id.',
    '  status [id] shows the next action; --full adds history and the full reports.',
    '  status, look and config take --json: one complete document on standard output, nothing else.',
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
  // Every instruction-file message that reports a refusal or an edit is
  // emitted — the file is named and the edit is stated as not committed
  // (BT14, F3); 'block current' and 'kept there once' change nothing and
  // stay quiet.
  for (const line of syncInstructions(repoRoot)) if (line.includes('refused') || line.includes('not committed')) instructionNoticeListener?.(line);
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

// The write side of the surfaces: every record write re-renders them. The
// store calls this through a registered trigger — record.ts cannot import
// this module without a cycle (this module needs the store's functions), so
// it is registered at load (BT25; the setMergeNoticeListener seam's shape).
setOpenSurfacesSync(syncOpenSurfaces);
