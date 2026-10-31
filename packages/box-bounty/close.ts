import { invalid,isObject,signedAccount,type GitHubPublication,publicationRef,remoteBranchSha,remoteGit,recoverIssue,api,login } from './gh.js';
import { readPayAccepts } from './board.js';
import { emitMergeNotice, showPath } from './notice.js';
import { checkSolutionHistory } from './collect.js';
import { BountyRefused } from './errors.js';
import { git,gitOutcome } from './git.js';
import { attemptsOf,persistRecord } from './record.js';
import type { BountyRecord } from './record.js';
import { readDecision } from './settings.js';
import type { DecisionRead } from './settings.js';
import { boundAmount,formatFact,formatFor,readFormat,renderFormat } from './format.js';
import { parsePayTo,type PayOutcome } from './pay.js';

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
    if (signedAccount(root) !== publication.account) return invalid('github-account-changed', 'the account that started this post must finish outside work; next: sign in with gh auth login');
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
        const fact = decision.command === 'merged' ? `Solution${decision.attempt !== undefined ? ` #${decision.attempt}` : ''} is merged on the bounty's branch as commit ${decision.merge} (${decision.reason ?? decision.merge}) — merged in the owner's checkout; it reaches this repository when the owner pushes it.`
          : decision.stage === 'applied' ? `Applied as commit ${decision.merge}.`
          : decision.stage === 'rejected' ? `Rejected. Recorded reason: ${decision.reason}`
          : decision.stage === 'undone' ? `Undo recorded as commit ${decision.merge}.`
          : 'Withdrawn.';
        const body = `${fact}\n\n${marker}`;
        if (!comments.some(entry => isObject(entry) && entry['body'] === body && isObject(entry['user']) && entry['user']['login'] === publication.account)) {
          const response = api(root, `${endpoint}/comments`, { body });
          if (!isObject(response) || response['body'] !== body || !isObject(response['user']) || response['user']['login'] !== publication.account) return invalid('github-response-invalid', 'GitHub did not confirm the decision comment; next: run box bounty close again; box bounty status shows what is recorded');
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
        // Each subject quoted, as the note below: a solver's commit, merged
        // by apply and published by a later post, can be among them (BT43).
        const body = `The bounty branch \`${publication.branch}\` is removed. It carried ${pushed.length} commit(s) that existed only there — their identifiers stay valid in any clone that fetched them: ${pushed.map(commit => `\`${commit.sha}\` ${showPath(commit.subject)}`).join(', ')}.\n\n${marker}`;
        if (!comments.some(entry => isObject(entry) && entry['body'] === body && isObject(entry['user']) && entry['user']['login'] === publication.account)) {
          const response = api(root, `${endpoint}/comments`, { body });
          if (!isObject(response) || response['body'] !== body || !isObject(response['user']) || response['user']['login'] !== publication.account) return invalid('github-response-invalid', 'GitHub did not confirm the branch-removal comment; next: run box bounty close again; box bounty status shows what is recorded');
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
      if (!isObject(closed) || closed['state'] !== 'closed') return invalid('github-response-invalid', 'GitHub did not confirm issue closure; next: run box bounty close again; box bounty status shows what is recorded');
      // The record not yet showing 'closed' means this run closed it; a
      // body the PATCH rewrote (the format block) is a real change too.
      if (publication.state !== 'closed' || closed['body'] !== snapshot.body) changed = true;
    }
    // A bounty that stated a reward and ends on a merged solution records
    // whom to pay: the pull request description is re-read now — with the
    // account that last edited it — so the pay message the agent relays says
    // what the solver actually left there (BT11b). $0 and non-merged closes
    // record nothing. Before the branch step, so a branch that cannot advance
    // never holds the message back (BT51).
    if (event.merge !== undefined && (boundAmount(record) ?? 0) > 0) {
      const pay = readPay(root, publication, record, event);
      const accepts = readPayAccepts(pay.solver);
      publication.pay = accepts === undefined ? pay : { ...pay, accepts };
    }
    // A merge moves the bounty branch to the chosen head, so GitHub marks the
    // pull request merged (BT51). A record already closed is finished: an
    // ending from before this step stays as it ended.
    const solution = (event.command === 'apply' || event.command === 'merged') && publication.state !== 'closed' ? decidedSolution(record, event) : null;
    if (solution !== null) {
      const advanced = advanceBountyBranch(root, record, publication, solution, event.merge);
      if (advanced.pushed) changed = true;
      if (advanced.notAdvanced !== null) {
        publication.pending = `github-decision-pending (bounty-branch-not-advanced: ${advanced.notAdvanced}): local merged stands; ${publication.branch} stays as it is; next: box bounty close ${record.id} retries this`;
        persistRecord(root, record);
        return;
      }
      if (advanced.deleted) changed = true;
    } else {
      const tip = remoteBranchSha(root, publication.repository, publication.branch);
      if (tip !== null && tip !== publication.commit) throw branchChanged(publication, tip);
      if (tip !== null) { remoteGit(root, publication.repository, ['push', `:refs/heads/${publication.branch}`]); changed = true; }
    }
    git(root, ['update-ref', '-d', publicationRef(record.id)]);
    publication.state = 'closed';
    // The note prints on close's and apply's output, each subject quoted as
    // in the comment above (BT43 correction 4).
    if (publication.kind === 'history' && (publication.pushed?.length ?? 0) > 0) {
      publication.closedNote = `${publication.branch} carried ${publication.pushed!.length} commit(s) published only there — ${publication.pushed!.map(commit => `${commit.sha.slice(0, 12)} ${showPath(commit.subject)}`).join(', ')} — and is now removed`;
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

const branchChanged = (publication: GitHubPublication, tip: string): BountyRefused =>
  new BountyRefused('github-branch-changed', `${publication.branch} on the remote is ${tip}, not the ${publication.commit} this tool posted — it was changed outside the tool; removing it is not this tool's call; next: ask the owner — the remote branch was changed outside the tool and removing it is not this tool's call`);

// The solution a merge decision names: the collected attempt's commit and pull
// request, or the commit and number the hand-merge scan wrote on the event.
// Null when the record names no pull request (records from before pull
// requests were the only return), which keeps the plain tip check.
function decidedSolution(record: BountyRecord, event: { attempt?: number; reason?: string }): { commit: string; pr: number; collectedAt?: string } | null {
  const attempt = event.attempt !== undefined ? attemptsOf(record).find(entry => entry.n === event.attempt) : undefined;
  const pr = attempt?.pullRequest ?? decidedPullRequest(event);
  const commit = attempt?.commit ?? /^commit ([a-f\d]{40})/.exec(event.reason ?? '')?.[1];
  if (pr === null || commit === undefined) return null;
  return attempt?.at === undefined ? { commit, pr } : { commit, pr, collectedAt: attempt.at };
}
const decidedPullRequest = (event: { reason?: string }): number | null => {
  const match = /pull request #(\d+)/.exec(event.reason ?? '');
  return match !== null ? Number(match[1]) : null;
};

function readPull(root: string, publication: GitHubPublication, pr: number): { merged: boolean; createdAt: string } {
  const data = api(root, `repos/${publication.repository}/pulls/${pr}`);
  if (!isObject(data) || typeof data['created_at'] !== 'string') return invalid('github-response-invalid', 'GitHub returned unreadable pull request facts; next: check gh and rerun the same command');
  return { merged: data['merged'] === true, createdAt: data['created_at'] };
}

// A stranger can open a pull request whose head is the owner's own commit,
// already public. Moving the branch would have GitHub mark that stranger's pull
// request merged. Two facts name it: what landed the head on the owner's branch
// is older than the pull request, and the head was already on the default
// branch on GitHub. A stranger cannot forge the first: that commit's date is
// fixed by its id (BT51).
function landedBeforePull(root: string, publication: GitHubPublication, solution: { commit: string; pr: number; collectedAt?: string }, merge: string | undefined): boolean {
  const head = solution.commit;
  const landed = merge === undefined ? Number.NaN : Date.parse(gitOutcome(root, ['show', '-s', '--format=%cI', merge]).stdout.trim());
  // Landed after this machine collected the pull request: it existed by then,
  // so the answer is known without asking GitHub.
  if (solution.collectedAt !== undefined && landed >= Date.parse(solution.collectedAt)) return false;
  if (!(landed < Date.parse(readPull(root, publication, solution.pr).createdAt))) return false;
  const info = api(root, `repos/${publication.repository}`);
  if (!isObject(info) || typeof info['default_branch'] !== 'string') return invalid('github-response-invalid', 'GitHub returned an unreadable repository; next: check gh and rerun the same command');
  const compared = api(root, `repos/${publication.repository}/compare/${encodeURIComponent(info['default_branch'])}...${head}`);
  if (!isObject(compared)) return invalid('github-response-invalid', 'GitHub returned an unreadable comparison; next: check gh and rerun the same command');
  return compared['status'] === 'behind' || compared['status'] === 'identical';
}

// PLATFORM.md 3.3 step 3. Move the bounty branch to the chosen head without
// force, read the pull request back, and remove the branch only when GitHub
// reports it merged — `gh pr merge`'s order. Every way this stops leaves the
// branch and is a named reason; only a branch changed by someone else keeps
// today's refusal.
function advanceBountyBranch(root: string, record: BountyRecord, publication: GitHubPublication, solution: { commit: string; pr: number; collectedAt?: string }, merge: string | undefined): { notAdvanced: string | null; pushed: boolean; deleted: boolean } {
  let pushed = false;
  const stop = (notAdvanced: string) => ({ notAdvanced, pushed, deleted: false });
  try {
    if (gitOutcome(root, ['merge-base', '--is-ancestor', publication.commit, solution.commit]).status !== 0) return stop('head-not-descended');
    try { checkSolutionHistory(root, record, publication, solution.commit); }
    catch (error) {
      if (error instanceof BountyRefused) return stop(`head-refused, ${error.reason}`);
      throw error;
    }
    const tip = remoteBranchSha(root, publication.repository, publication.branch);
    if (tip === null) return readPull(root, publication, solution.pr).merged ? { notAdvanced: null, pushed, deleted: false } : stop('bounty-branch-missing');
    if (tip !== publication.commit && tip !== solution.commit) throw branchChanged(publication, tip);
    if (tip === publication.commit) {
      if (landedBeforePull(root, publication, solution, merge)) return stop('head-predates-pull-request');
      // Without force, so GitHub takes it only as a fast-forward; the proven
      // commit, never a name that resolves again (BT32).
      try { remoteGit(root, publication.repository, ['push', `${solution.commit}:refs/heads/${publication.branch}`]); }
      catch (error) {
        if (error instanceof BountyRefused) return stop('push-refused');
        throw error;
      }
      pushed = true;
    }
    if (!readPull(root, publication, solution.pr).merged) return stop('not-marked-merged');
    remoteGit(root, publication.repository, ['push', `:refs/heads/${publication.branch}`]);
    return { notAdvanced: null, pushed, deleted: true };
  } catch (error) {
    if (error instanceof BountyRefused && error.reason !== 'github-branch-changed') return stop(error.reason);
    throw error;
  }
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
    if (!isObject(data) || !isObject(data['data']) || !isObject(data['data']['repository']) || !isObject(data['data']['repository']['issue'])) return invalid('github-response-invalid', 'GitHub returned an unreadable closing issue; next: run box bounty close again; box bounty status shows what is recorded');
    const issue = data['data']['repository']['issue'];
    if (typeof issue['body'] !== 'string' || !isObject(issue['author']) || issue['author']['login'] !== publication.account || !isObject(issue['comments'])) return invalid('github-issue-mismatch', 'the closing issue body or author did not match this bounty; next: check the issue on GitHub, then run box bounty close again');
    body ??= issue['body'];
    if (body !== issue['body']) return invalid('github-issue-changed', 'the issue body changed while its comments were read; next: run box bounty close again');
    const connection = issue['comments'];
    if (!Array.isArray(connection['edges']) || !isObject(connection['pageInfo'])) return invalid('github-response-invalid', 'GitHub returned unreadable closing comments; next: run box bounty close again; box bounty status shows what is recorded');
    let last: string | null = null;
    for (const edge of connection['edges']) {
      if (!isObject(edge) || typeof edge['cursor'] !== 'string' || edge['cursor'] === '' || !isObject(edge['node']) || typeof edge['node']['body'] !== 'string') return invalid('github-response-invalid', 'GitHub returned an unreadable closing comment; next: run box bounty close again; box bounty status shows what is recorded');
      const node = edge['node'];
      comments.push({ body: node['body'], user: node['author'] });
      last = edge['cursor'];
    }
    const page = connection['pageInfo'];
    if (page['hasNextPage'] === false) return { body, comments };
    if (page['hasNextPage'] !== true || last === null || seenAfter.has(last)) return invalid('github-response-invalid', 'GitHub returned an unreadable comment cursor; next: run box bounty close again; box bounty status shows what is recorded');
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
  const pr = attempt?.pullRequest ?? decidedPullRequest(event);
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
