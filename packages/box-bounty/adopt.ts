// A later agent on another machine can finish a bounty (BT52). A shared row is
// what the chain says; anyone with push access can write the chain, so nothing
// here acts on its word alone. `adoptShared` rebuilds an ordinary local record
// from the `posted` event only after GitHub's own issue agrees with it — marker,
// author, format block — and every command then runs its one code path.
//
// What the chain is never trusted for: solutions (a pull request is collected
// through `answerGitHub`, with every check), permission (this machine's owner
// settings decide), an ending (it counts only while the issue is closed), and
// the reward (read from the issue's format block).

import { BountyRefused } from './errors.js';
import { api,invalid,isObject,namesGitHubCause,type GitHubPublication } from './gh.js';
import { gitOutcome } from './git.js';
import { readFormat } from './format.js';
import { emitMergeNotice } from './notice.js';
import { dropDurabilityRefs,isOpenStage,persistRecord,setSharedAdopter,transitionTo } from './record.js';
import type { BountyRecord,BountyStage } from './record.js';
import { readDecision,requireRepository } from './settings.js';
import { readStored,sharedFor,sharedOpen,sharedRead } from './store.js';
import { syncChains } from './chain.js';
import { RESUME_STAYED } from './wording.js';

// A shared record grants nothing: an adopted bounty on a machine whose owner
// wrote no permission for this repository, or denied it, does not touch GitHub.
export const adoptedWithoutPermission = (root: string, record: BountyRecord): boolean => {
  if (record.adopted === undefined) return false;
  const read = readDecision(root);
  return read.decision === null || read.decision === 'off';
};

const currentBranch = (root: string): string => {
  const name = gitOutcome(root, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
  return name === '' || name === 'HEAD' ? '(detached HEAD)' : name;
};

// The issue the event names, read from this repository. Only GitHub's own
// failures keep their name; anything else about it is a mismatch.
function readIssue(root: string, repository: string, number: number, mismatch: (what: string) => never): Record<string, unknown> {
  let issue: unknown;
  try { issue = api(root, `repos/${repository}/issues/${number}`); }
  catch (error) { if (namesGitHubCause(error)) throw error; return mismatch(`issue ${number} cannot be read in ${repository}`); }
  return isObject(issue) ? issue : mismatch(`issue ${number} is unreadable`);
}

function adoptShared(root: string, id: string, shared: BountyRecord): BountyRecord {
  const claimed = shared.github;
  const mismatch = (what: string): never => invalid('shared-record-mismatch', `the shared record of ${id} does not match GitHub: ${what}; nothing was read or collected; next: read the issue on GitHub and ask the owner — the shared record may have been changed`);
  if (claimed === undefined || claimed.issue === null) return mismatch('it names no issue');
  const repository = requireRepository(root);
  const url = `https://github.com/${repository}/issues/${claimed.issue.number}`;
  if (claimed.issue.url !== url || !Number.isSafeInteger(claimed.issue.number) || claimed.issue.number < 1) return mismatch(`it names an issue outside ${repository}`);
  const issue = readIssue(root, repository, claimed.issue.number, mismatch);
  if (issue['number'] !== claimed.issue.number || issue['html_url'] !== url || issue['pull_request'] !== undefined) return mismatch(`issue ${claimed.issue.number} is another thing`);
  if (typeof issue['body'] !== 'string' || !issue['body'].includes(`<!-- box-bounty:${id} -->`)) return mismatch(`issue ${claimed.issue.number} is not this bounty's`);
  if (!isObject(issue['user']) || issue['user']['login'] !== claimed.account) return mismatch(`issue ${claimed.issue.number} was not opened by the account the record names`);
  if (!isOpenStage(shared.stage)) {
    if (issue['state'] === 'open') return invalid('shared-record-disputed', `the shared record says ${id} ended, but its issue ${url} is still open; nothing was collected; next: finish it on the machine that ended it with box bounty close ${id}, or ask the owner`);
    return invalid('shared-only', `${id} ended on another machine; its issue is ${url}; nothing is left to do here; next: box bounty status ${id}`);
  }
  if (issue['state'] !== 'open') return invalid('shared-issue-closed', `the issue of ${id} is closed on GitHub, but its shared record does not say it ended; nothing was collected; next: read ${url}, and ask the owner whether to continue`);
  const format = readFormat(issue['body']);
  if (format.kind !== 'present') return mismatch(`issue ${claimed.issue.number} carries no readable format block`);
  const branch = `box-bounty/${id}`;
  if (format.value.id !== id || format.value.repository !== repository || format.value.branch !== branch || claimed.branch !== branch) return mismatch('the issue names another bounty, repository or branch');
  if (format.value.workCommit !== claimed.commit) return mismatch(`it names commit ${claimed.commit}, the issue names ${format.value.workCommit}`);
  const publication: GitHubPublication = {
    repository,
    account: claimed.account,
    kind: 'history',
    branch,
    commit: claimed.commit,
    ...(claimed.base !== undefined ? { base: claimed.base } : {}),
    pushed: claimed.pushed ?? [],
    title: typeof issue['title'] === 'string' ? issue['title'] : shared.title,
    body: issue['body'],
    state: 'posted',
    issue: { number: claimed.issue.number, url },
    pending: null
  };
  const postedAt = shared.events.find(event => event.stage === 'posted')?.at ?? format.value.createdAt;
  const record: BountyRecord = {
    schemaVersion: 1,
    kind: 'box-bounty-record',
    id,
    title: shared.title,
    ...(shared.why !== undefined ? { why: shared.why } : {}),
    ...(shared.partOf !== undefined && shared.partOf.trim() !== '' && !/[\r\n]/.test(shared.partOf) ? { partOf: shared.partOf } : {}),
    noteSource: 'legacy',
    stage: 'posted',
    ...(shared.content !== undefined ? { content: shared.content } : {}),
    createdAt: format.value.createdAt,
    resume: { kind: 'recorded', branch: currentBranch(root), commit: claimed.base ?? claimed.commit, changed: [], note: null },
    reward: { amount: format.value.reward.amount },
    events: [{ stage: 'posted', at: postedAt, destination: url }],
    attempts: [],
    github: publication,
    adopted: { at: new Date().toISOString() }
  };
  persistRecord(root, record);
  emitMergeNotice(`${id} — posted from another machine; picked up here from its issue. ${RESUME_STAYED}`);
  return record;
}

// Every open shared row becomes a local record so `status` sees its waiting
// pull requests. One that will not bind stays a read-only shared row, and the
// line says why.
export function adoptOpenShared(root: string): string[] {
  const lines: string[] = [];
  for (const shared of sharedOpen(root)) {
    try { adoptShared(root, shared.id, shared); }
    catch (error) {
      if (!(error instanceof BountyRefused)) throw error;
      lines.push(`${shared.id} — not picked up here (${error.reason}): ${error.message}`);
    }
  }
  return lines;
}

// A local open bounty whose chain says it ended, while GitHub's issue says the
// same, ended on another machine: the record takes that ending with no comment,
// no chain event and nothing merged here. A forged ending on an open issue
// changes nothing. `known` spares a second read for a caller that just read it.
export function settleFromChain(root: string, record: BountyRecord, known?: unknown): void {
  if (!isOpenStage(record.stage) || record.github?.state !== 'posted' || record.github.issue === null) return;
  const row = sharedFor(root, record.id);
  if (row === null || isOpenStage(row.stage)) return;
  const issue = known ?? api(root, `repos/${record.github.repository}/issues/${record.github.issue.number}`);
  if (!isObject(issue) || issue['state'] !== 'closed') return;
  const ending = [...row.events].reverse().find(event => event.stage === 'applied' || event.stage === 'rejected' || event.stage === 'withdrawn');
  if (ending === undefined) return;
  const stage: BountyStage = ending.stage as BountyStage;
  const merge = ending.merge !== undefined && /^[a-f\d]{40}$/.test(ending.merge) ? ending.merge : undefined;
  const number = ending.attempt;
  record.github.state = 'closed';
  record.github.pending = null;
  transitionTo(root, record, stage, {
    command: 'shared',
    ...(number !== undefined ? { attempt: number } : {}),
    ...(merge !== undefined ? { merge } : {}),
    ...(stage === 'applied' ? (number !== undefined ? { reason: `pull request #${number}` } : {}) : ending.reason !== undefined ? { reason: ending.reason } : {})
  });
  dropDurabilityRefs(root, record);
  emitMergeNotice(`${record.id} — ended on another machine (${stage === 'applied' ? `merged${merge !== undefined ? ` as ${merge.slice(0, 12)}` : ''}` : stage}); nothing was done here`);
}

// What `look`, `apply`, `close` and `allow` read first. A machine that holds no
// record of its own, or only an adopted one, asks the remote now; a posting
// machine pays only the once-a-minute fetch.
export function syncBeforeAction(root: string, id: string): void {
  const stored = readStored(root, id);
  const force = stored.state === 'missing' || stored.record?.adopted !== undefined;
  try { syncChains(root, force); } catch { /* the cache answers; an unreachable remote is no reason to refuse */ }
  if (stored.state !== 'missing' && stored.record !== null) {
    try { settleFromChain(root, stored.record); }
    catch (error) { if (!(error instanceof BountyRefused)) throw error; /* GitHub unread: the command's own reads name it */ }
  }
}

setSharedAdopter((root, id) => {
  const shared = sharedRead(root, id);
  return shared === null ? null : adoptShared(root, id, shared);
});
