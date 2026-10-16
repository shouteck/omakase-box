import { type GitHubPlan, PREVIEW_PUBLIC_NAMES, planGitHub, shownOfPlan, parseNameStatus, neverShipViolations, commitStatuses, EMPTY_TREE } from './publish-plan.js';
import { remoteUrl, invalid, type GitHubChoice, digest, isObject, publicRepository, signedAccount, type GitHubPublication, publicationRef, remoteBranchSha, remoteGit, recoverIssue, ensureLabel, api, issueNumber, pages, number, redact, login, READABLE_LOGIN } from './gh.js';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { resolveProgram } from '../box-package/commands.js';
import { NOTHING_RUN, emitMergeNotice, quoteForeign, showPath } from './notice.js';
import { TOOL_VERSION } from './create.js';
import { BountyRefused } from './errors.js';
import { dryMergeOnto, git, gitBlob, gitBlobs, gitFilteredBlob, gitIndexWrite, gitOutcome, gitProgram, gitRefsWrite, mergeBase, ownerGitOutcome } from './git.js';
import type { DryMerge, IndexChange } from './git.js';
import { checkProjectClaims, publishListed, publishLists, shipRules } from './never-ship.js';
import type { NeverShipRule } from './never-ship.js';
import { allowedByFor, ownerGate, sameShown, waitForOwner } from './gate.js';
import { attemptRefName, attemptsOf, isOpenStage, loadRecord, persistRecord, requireCurrentDelivery, recordScanFinding, retiredRoute, settleScanFindings, transitionTo } from './record.js';
import { assertPromiseRoom, rewardForPost, withPromiseLock } from './money.js';
import type { Attempt, BountyRecord, WaitingFor } from './record.js';
import { repositoryAddress } from './repository.js';
import { binaryPatchPaths, looksBinary, scanPatch, scanText } from './scan.js';
import type { ScanHit } from './scan.js';
import { readDecision, readReward, requireRepository } from './settings.js';
import type { DecisionRead } from './settings.js';
import { boundAmount, formatFact, formatFor, publicText, readFormat, renderFormat } from './format.js';
import { parsePayTo, payToLine, type PayOutcome, type PayToFact } from './pay.js';

// A local decision finishes outside: the decision comments, the issue close
// and the bounty-branch removal — retried runs resume by stable comment
// markers so nothing lands twice. The owner decided on 15 October 2026 that
// this runs whatever the standing answer is; when the answer is not
// 'allowed' and this run actually changed GitHub, one line says so through
// the merge-notice listener.
export function syncGitHubDecision(root: string, record: BountyRecord, opts?: { answered?: boolean; decision?: DecisionRead }): void {
  const publication = record.github;
  if (publication === undefined) return;
  // 'reject', 'withdraw' and 'undo' stay in the list for records written
  // while those commands existed; 'close' carries the same work now.
  const decisions = record.events.filter(entry => ['apply', 'reject', 'withdraw', 'undo', 'merged', 'close'].includes(entry.command ?? ''));
  const event = decisions.at(-1);
  if (event === undefined) return;
  // Whether this run touched GitHub at all — a posted comment, a closed
  // issue or a removed branch. The unasked line below fires only on change.
  let changed = false;
  try {
    if (signedAccount(root) !== publication.account) return invalid('github-account-changed', 'sign in to the account that started this post to finish outside work');
    if (publication.issue === null) {
      publication.issue = recoverIssue(root, publication);
      persistRecord(root, record);
    }
    if (publication.issue !== null) {
      const endpoint = `repos/${publication.repository}/issues/${publication.issue.number}`;
      const snapshot = closingIssue(root, publication);
      const comments = snapshot.comments;
      for (const decision of decisions) {
        const marker = `<!-- box-bounty:${record.id}:${decision.command} -->`;
        const fact = decision.command === 'merged' ? `Solution${decision.attempt !== undefined ? ` #${decision.attempt}` : ''} is merged on the bounty's branch as commit ${decision.merge} (${decision.reason ?? decision.merge}).`
          : decision.stage === 'applied' ? `Applied as commit ${decision.merge}.`
          : decision.stage === 'rejected' ? `Rejected. Recorded reason: ${decision.reason}`
          : decision.stage === 'undone' ? `Undo recorded as commit ${decision.merge}.`
          : 'Withdrawn.';
        const body = `${fact}\n\n${marker}`;
        if (!comments.some(entry => isObject(entry) && entry['body'] === body && isObject(entry['user']) && entry['user']['login'] === publication.account)) {
          const response = api(root, `${endpoint}/comments`, { body });
          if (!isObject(response) || response['body'] !== body || !isObject(response['user']) || response['user']['login'] !== publication.account) return invalid('github-response-invalid', 'GitHub did not confirm the decision comment');
          comments.push(response);
          changed = true;
        }
      }
      // Before the branch goes, name what removing it loses: a history post's
      // branch can carry commits that exist nowhere else — the poster's
      // unpushed commits and the tool's work-in-progress commit. Their shas
      // stay reachable through the record, but a reader of the issue is owed
      // the names. The marker keeps a retry from naming them twice.
      const pushed = publication.pushed ?? [];
      if (publication.kind === 'history' && pushed.length > 0) {
        const marker = `<!-- box-bounty:${record.id}:branch-removed -->`;
        const body = `The bounty branch \`${publication.branch}\` is removed. It carried ${pushed.length} commit(s) that existed only there — their identifiers stay valid in any clone that fetched them: ${pushed.map(commit => `\`${commit.sha}\` ${commit.subject}`).join(', ')}.\n\n${marker}`;
        if (!comments.some(entry => isObject(entry) && entry['body'] === body && isObject(entry['user']) && entry['user']['login'] === publication.account)) {
          const response = api(root, `${endpoint}/comments`, { body });
          if (!isObject(response) || response['body'] !== body || !isObject(response['user']) || response['user']['login'] !== publication.account) return invalid('github-response-invalid', 'GitHub did not confirm the branch-removal comment');
          changed = true;
        }
      }
      const read = readFormat(snapshot.body);
      publication.formatRead = read.kind === 'present' ? 'differs-from-record' : read.kind;
      publication.formatReadAt = new Date().toISOString();
      publication.formatUnavailableAt = null;
      if (read.kind === 'invalid') publication.formatRepair = 'preserved-invalid';
      let closed: unknown;
      if (read.kind === 'present') {
        try {
          // The block already on the issue is the bound public artifact: at
          // close only `state` may change — every other field, the reward
          // among them, keeps the bytes it went public with. Nothing re-read
          // from the record can reach the block here, so it can never be made
          // to disagree with the listing text above it by an edited record
          // (BT11a fix round).
          const body = snapshot.body.slice(0, read.start) + renderFormat({ ...read.value, state: formatFor(record).state });
          closed = api(root, endpoint, { state: 'closed', body }, 'PATCH');
          if (!isObject(closed) || closed['body'] !== body) throw new Error('format update was not confirmed');
          publication.formatRead = formatFact(body, formatFor(record));
          publication.formatRepair = 'updated';
        } catch { publication.formatRepair = 'update-failed'; closed = api(root, endpoint, { state: 'closed' }, 'PATCH'); }
      } else closed = api(root, endpoint, { state: 'closed' }, 'PATCH');
      if (!isObject(closed) || closed['state'] !== 'closed') return invalid('github-response-invalid', 'GitHub did not confirm issue closure');
      // The record not yet showing 'closed' means this run closed it; a
      // body the PATCH rewrote (the format block) is a real change too.
      if (publication.state !== 'closed' || closed['body'] !== snapshot.body) changed = true;
    }
    const tip = remoteBranchSha(root, publication.repository, publication.branch);
    if (tip !== null && tip !== publication.commit) {
      throw new BountyRefused('github-branch-changed', `${publication.branch} on the remote is ${tip}, not the ${publication.commit} this tool posted — it was changed outside the tool; removing it is not this tool's call`);
    }
    if (tip !== null) { remoteGit(root, publication.repository, ['push', `:refs/heads/${publication.branch}`]); changed = true; }
    git(root, ['update-ref', '-d', publicationRef(record.id)]);
    publication.state = 'closed';
    if (publication.kind === 'history' && (publication.pushed?.length ?? 0) > 0) {
      publication.closedNote = `${publication.branch} carried ${publication.pushed!.length} commit(s) published only there — ${publication.pushed!.map(commit => `${commit.sha.slice(0, 12)} ${commit.subject}`).join(', ')} — and is now removed`;
    }
    // A bounty that stated a reward and ends on a merged solution records
    // whom to pay: the pull request description is re-read now — with the
    // account that last edited it — so the pay message the agent relays says
    // what the solver actually left there (BT11b). $0 and non-merged closes
    // record nothing.
    if (event.merge !== undefined && (boundAmount(record) ?? 0) > 0) {
      publication.pay = readPay(root, publication, record, event);
    }
    publication.pending = null;
    delete record.waiting; // the held outside close is done
    // The owner decided the tool may still close up a bounty it opened
    // (15 October 2026) — and says so when the standing answer is not
    // 'allowed'. Only a run that changed GitHub gets the line; a retry that
    // finds it all done, and every run under 'allowed', stays quiet.
    if (changed) {
      let answer = 'not given';
      try {
        const read = opts?.decision ?? readDecision(root);
        if (read.decision === 'allowed') answer = '';
        else if (read.decision === 'ask') answer = 'ask me each time';
        else if (read.denied === true || read.decision === 'off') answer = 'deny';
      } catch { /* a repository whose identity cannot be read counts as not allowed — 'not given' stands */ }
      if (answer !== '') emitMergeNotice(`${record.id} — closed up on GitHub without asking: the issue is closed and the bounty branch removed; your standing answer here is ${answer}`);
    }
  } catch (error) {
    const detail = error instanceof BountyRefused ? ` (${error.reason}: ${error.message})` : '';
    // The retry is `close` whatever the local decision was — on an ended
    // record it retries exactly this outside work. The local word names the
    // recorded decision with today's vocabulary.
    const local = ({ undo: 'revert', reject: 'close', withdraw: 'close' } as Record<string, string>)[event.command ?? ''] ?? event.command;
    publication.pending = `github-decision-pending${detail}: local ${local} stands; retry box bounty close ${record.id} to comment, close the issue and remove ${publication.branch}`;
  }
  persistRecord(root, record);
}

// Acquire the current issue body and every decision comment in one paginated
// GitHub request per page. This replaces the comments-only REST read, so
// preserving an edited visible body costs no extra process on the close path.
function closingIssue(root: string, publication: GitHubPublication): { body: string; comments: unknown[] } {
  const [owner, name] = publication.repository.split('/');
  const comments: unknown[] = [];
  let after: string | null = null;
  let body: string | undefined;
  const seenAfter = new Set<string>();
  for (;;) {
    const data = api(root, 'graphql', {
      query: 'query($owner:String!,$name:String!,$number:Int!,$after:String){repository(owner:$owner,name:$name){issue(number:$number){body author{login} comments(first:100,after:$after){edges{cursor node{body author{login}}} pageInfo{hasNextPage}}}}}',
      variables: { owner, name, number: publication.issue?.number, after }
    });
    if (!isObject(data) || !isObject(data['data']) || !isObject(data['data']['repository']) || !isObject(data['data']['repository']['issue'])) return invalid('github-response-invalid', 'GitHub returned an unreadable closing issue');
    const issue = data['data']['repository']['issue'];
    if (typeof issue['body'] !== 'string' || !isObject(issue['author']) || issue['author']['login'] !== publication.account || !isObject(issue['comments'])) return invalid('github-issue-mismatch', 'the closing issue body or author did not match this bounty');
    body ??= issue['body'];
    if (body !== issue['body']) return invalid('github-issue-changed', 'the issue body changed while its comments were read; retry closing');
    const connection = issue['comments'];
    if (!Array.isArray(connection['edges']) || !isObject(connection['pageInfo'])) return invalid('github-response-invalid', 'GitHub returned unreadable closing comments');
    let last: string | null = null;
    for (const edge of connection['edges']) {
      if (!isObject(edge) || typeof edge['cursor'] !== 'string' || edge['cursor'] === '' || !isObject(edge['node']) || typeof edge['node']['body'] !== 'string') return invalid('github-response-invalid', 'GitHub returned an unreadable closing comment');
      const node = edge['node'];
      comments.push({ body: node['body'], user: node['author'] });
      last = edge['cursor'];
    }
    const page = connection['pageInfo'];
    if (page['hasNextPage'] === false) return { body, comments };
    if (page['hasNextPage'] !== true || last === null || seenAfter.has(last)) return invalid('github-response-invalid', 'GitHub returned an unreadable comment cursor');
    after = last; seenAfter.add(after);
  }
}

// BT11b — whom a merged solution pays. The description of the merged pull
// request is read again at close, with the account that last edited it, so
// the pay message reflects what the solver actually left there. When the
// read fails, the fact recorded at collection stands and the message says
// the description could not be read again.
function readPay(root: string, publication: GitHubPublication, record: BountyRecord, event: { attempt?: number; reason?: string }): PayOutcome {
  const attempt = event.attempt !== undefined ? attemptsOf(record).find(entry => entry.n === event.attempt) : undefined;
  const pr = attempt?.pullRequest ?? (() => {
    const match = /pull request #(\d+)/.exec(event.reason ?? '');
    return match !== null ? Number(match[1]) : null;
  })();
  const solver = attempt?.author ?? (pr !== null ? publication.seenPullRequests?.find(entry => entry.n === pr)?.author ?? null : null);
  const recorded = attempt?.payTo ?? (pr !== null ? publication.seenPullRequests?.find(entry => entry.n === pr)?.payTo : undefined);
  if (pr === null) return { pr: null, solver, link: null, testMode: false, editedBy: null };
  try {
    const fresh = closingPullRequest(root, publication, pr);
    const fact = parsePayTo(fresh.body);
    const link = fact.state === 'recognised' || fact.state === 'test-mode' ? fact.link : null;
    return { pr, solver, link, testMode: fact.state === 'test-mode', editedBy: fresh.editor !== null && fresh.editor !== solver ? fresh.editor : null };
  } catch {
    const link = recorded?.state === 'recognised' || recorded?.state === 'test-mode' ? recorded.link : null;
    return { pr, solver, link, testMode: recorded?.state === 'test-mode', editedBy: null, readFailed: true };
  }
}

// The pull request's description plus the account that last edited it — one
// GraphQL read. `userContentEdits` is empty when the description was never
// edited after opening, so a null editor means the solver's own text.
function closingPullRequest(root: string, publication: GitHubPublication, pr: number): { body: string; editor: string | null } {
  const [owner, name] = publication.repository.split('/');
  const data = api(root, 'graphql', {
    query: 'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){body userContentEdits(last:1){nodes{editor{login}}}}}}',
    variables: { owner, name, number: pr }
  });
  if (!isObject(data) || !isObject(data['data']) || !isObject(data['data']['repository']) || !isObject(data['data']['repository']['pullRequest'])) throw new Error('github-response-invalid: GitHub returned an unreadable pull request');
  const pullRequest = data['data']['repository']['pullRequest'];
  if (typeof pullRequest['body'] !== 'string') throw new Error('github-response-invalid: GitHub returned an unreadable pull request description');
  const edits = pullRequest['userContentEdits'];
  let editor: string | null = null;
  if (isObject(edits) && Array.isArray(edits['nodes'])) {
    const last = edits['nodes'].at(-1);
    if (isObject(last) && isObject(last['editor']) && typeof last['editor']['login'] === 'string') editor = login(last['editor']['login']);
  }
  return { body: pullRequest['body'], editor };
}







export { GH_LEAST, limitGitHubCalls } from './gh.js';
export type { GitHubPublication, GitHubChoice } from './gh.js';
export { shownOfPlan, planGitHub } from './publish-plan.js';
export type { GitHubPlan } from './publish-plan.js';
export { approveGitHub, previewGitHub, postGitHub } from './post.js';
export { listGitHubAnswers, refreshGitHubStatus, refreshGitHubFormat, issueComments, answerGitHub, resolveAttempt } from './collect.js';
export type { IssueComment } from './collect.js';
