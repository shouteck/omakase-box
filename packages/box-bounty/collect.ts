import { parseNameStatus,neverShipViolations,commitStatuses,EMPTY_TREE } from './publish-plan.js';
import { invalid,isObject,type GitHubPublication,remoteBranchSha,remoteGit,api,pages,number,redact,login,READABLE_LOGIN } from './gh.js';
import { NOTHING_RUN,quoteForeign,showPath } from './notice.js';
import { BountyRefused } from './errors.js';
import { dryMergeOnto,git,gitOutcome } from './git.js';
import type { DryMerge } from './git.js';
import { shipRules } from './never-ship.js';
import { attemptRefName,attemptsOf,isOpenStage,loadRecord,persistRecord,requireCurrentDelivery,retiredRoute,transitionTo } from './record.js';
import type { Attempt,BountyRecord } from './record.js';
import { boundAmount,formatFact,formatFor } from './format.js';
import { parsePayTo,payToLine,type PayToFact } from './pay.js';
import { shareSolution } from './chain.js';

export function listGitHubAnswers(root: string, id: string, record = loadRecord(root, id), shown = true): string {
  if (record.github === undefined) return invalid('not-github-posted', `this bounty has no GitHub post; next: post it with box bounty post ${id}, or end it with box bounty close ${id}`);
  if (retiredRoute(record) !== null) return `This bounty used a retired delivery route; end it with box bounty close ${id}`;
  const { repository, branch } = record.github;
  const data = pages(root, `repos/${repository}/pulls?state=open&base=${branch}`);
  // Every fact a listing line prints except the changed-file names — one
  // pull-request listing read, no per-request file calls yet. When this fact
  // set (plus the bounty branch tip below) is unchanged the recorded answers
  // text is still exactly what GitHub would list: it is reused and the
  // per-request `pulls/<n>/files` reads do not run. Any new, re-pushed or
  // collected request — or a moved base — changes the key and pays the
  // full read.
  const facts: { entry: unknown; n: number; commit: string; author: string; payTo: PayToFact }[] = [];
  for (const entry of data) {
    if (!isObject(entry) || !isObject(entry['user'])) return invalid('github-response-invalid', 'GitHub returned an unreadable pull request; next: check gh and rerun the same command');
    const n = number(entry['number']);
    if (!isObject(entry['head']) || typeof entry['head']['sha'] !== 'string' || !/^[a-f\d]{40}$/.test(entry['head']['sha'])) return invalid('github-response-invalid', 'GitHub returned an unreadable solution commit; next: check gh and rerun the same command');
    facts.push({ entry, n, commit: entry['head']['sha'], author: login(entry['user']['login']), payTo: parsePayTo(typeof entry['body'] === 'string' ? entry['body'] : '') });
  }
  const pays = boundAmount(record) !== undefined && boundAmount(record)! > 0;
  // The listing's file names are GitHub's diff of each request against the
  // bounty branch's CURRENT tip — a head sha pins the request but not the
  // base it is diffed on. The remote tip goes into the key: a moved bounty
  // branch makes the recorded listing stale even with identical request
  // JSON, and pays the full read once like any other fact change.
  const baseTip = remoteBranchSha(root, repository, branch);
  const key = JSON.stringify([pays, baseTip, facts.map(fact => [fact.n, fact.commit, fact.author, fact.payTo,
    record.github!.seenPullRequests?.find(seen => seen.n === fact.n && seen.commit === fact.commit)?.at ?? 'new',
    record.attempts?.find(attempt => attempt.commit === fact.commit)?.n ?? null])]);
  const stamp = (fact: (typeof facts)[number]) =>
    record.github!.seenPullRequests?.find(seen => seen.n === fact.n && seen.commit === fact.commit)?.at
      ?? record.github!.availablePullRequests?.find(pr => pr.n === fact.n && pr.commit === fact.commit)?.at
      ?? new Date().toISOString();
  if (record.github.outside !== undefined && record.github.answersKey === key) {
    record.github.availablePullRequests = facts.map(fact => ({ n: fact.n, commit: fact.commit, at: stamp(fact), author: fact.author, payTo: fact.payTo }));
    for (const fact of facts) {
      if (shown && record.github.seenPullRequests?.find(seen => seen.n === fact.n && seen.commit === fact.commit) === undefined) {
        record.github.seenPullRequests = [...record.github.seenPullRequests ?? [], { n: fact.n, commit: fact.commit, at: stamp(fact), author: fact.author, payTo: fact.payTo }];
      }
    }
    persistRecord(root, record);
    return record.github.outside.answers;
  }
  const answersKey = key;
  const lines = [`GitHub answers for ${id} against ${branch}:`];
  const available: NonNullable<GitHubPublication['availablePullRequests']> = [];
  for (const { entry } of facts) {
    if (!isObject(entry) || !isObject(entry['user'])) return invalid('github-response-invalid', 'GitHub returned an unreadable pull request; next: check gh and rerun the same command');
    const n = number(entry['number']);
    if (!isObject(entry['head']) || typeof entry['head']['sha'] !== 'string' || !/^[a-f\d]{40}$/.test(entry['head']['sha'])) return invalid('github-response-invalid', 'GitHub returned an unreadable solution commit; next: check gh and rerun the same command');
    const commit = entry['head']['sha'];
    const seen = record.github.seenPullRequests?.find(entry => entry.n === n && entry.commit === commit);
    const files = pages(root, `repos/${repository}/pulls/${n}/files`);
    const names = files.map(file => isObject(file) && typeof file['filename'] === 'string' ? redact(quoteForeign(file['filename'])) : invalid('github-response-invalid', 'GitHub returned unreadable changed files; next: check gh and rerun the same command'));
    const collected = record.attempts?.find(attempt => attempt.commit === commit);
    const next = collected === undefined ? `collect: box bounty look ${id} ${n} or box bounty apply ${id} ${n}` : `collected as solution ${collected.n}; look: box bounty look ${id} ${collected.n}`;
    // The `pay-to:` line is read only from the pull request description — a
    // comment or a changed file never carries it — and only the fact is kept.
    const payTo = parsePayTo(typeof entry['body'] === 'string' ? entry['body'] : '');
    const paid = boundAmount(record) !== undefined && boundAmount(record)! > 0 ? `; ${payToLine(payTo)}` : '';
    lines.push(`  #${n} by ${login(entry['user']['login'])}: ${names.join(', ')}; ${seen === undefined ? 'new' : `seen since ${seen.at}`}; ${next}${paid}`);
    const fact = { n, commit, at: seen?.at ?? record.github.availablePullRequests?.find(pr => pr.n === n && pr.commit === commit)?.at ?? new Date().toISOString(), author: login(entry['user']['login']), payTo };
    available.push(fact);
    if (shown && seen === undefined) record.github.seenPullRequests = [...record.github.seenPullRequests ?? [], fact];
  }
  if (data.length === 0) lines.push('  none open; wait for one or close the bounty');
  record.github.availablePullRequests = available;
  record.github.answersKey = answersKey;
  persistRecord(root, record);
  return lines.join('\n');
}

export function refreshGitHubStatus(root: string, record: BountyRecord): void {
  const publication = record.github;
  if (publication?.state !== 'posted' || publication.issue === null) return;
  try {
    const issue = api(root, `repos/${publication.repository}/issues/${publication.issue.number}`);
    if (!isObject(issue) || issue['state'] !== 'open' && issue['state'] !== 'closed') return invalid('github-response-invalid', 'GitHub returned an unreadable issue state; next: check gh and rerun the same command');
    observeIssueFormat(record, publication, issue);
    const answers = listGitHubAnswers(root, record.id, record, false);
    const comments = issueComments(root, record, issue); // the issue read above — status asks GitHub for it once
    const unnamed = comments.filter(comment => comment.author === null).length;
    publication.questions = { count: comments.length, latestAt: comments.map(comment => comment.at).sort().at(-1) ?? null, ...(unnamed > 0 ? { unnamed } : {}) };
    publication.outside = { at: new Date().toISOString(), issueState: issue['state'], answers };
    publication.unavailableAt = null;
    publication.unavailableReason = null;
  } catch (error) {
    publication.unavailableAt = new Date().toISOString();
    // The failure's own name, kept so status can say what went wrong rather
    // than one generic label — and so a reason a rerun cannot fix is told
    // apart from one it can (BT14, F6).
    publication.unavailableReason = error instanceof BountyRefused ? error.reason : 'github-status-unavailable';
  }
  persistRecord(root, record);
}

// `author` is null when GitHub returned an account name the tool will not
// print: the comment still counts and is still shown, marked as such.
function observeIssueFormat(record: BountyRecord, publication: GitHubPublication, issue: unknown): void {
  if (!isObject(issue) || issue['number'] !== publication.issue?.number || typeof issue['body'] !== 'string' || !isObject(issue['user']) || issue['user']['login'] !== publication.account) return invalid('github-issue-mismatch', 'the issue body or author could not be bound to this bounty; next: check the issue on GitHub, then rerun the same command');
  publication.formatRead = formatFact(issue['body'], formatFor(record));
  publication.formatReadAt = new Date().toISOString();
  publication.formatUnavailableAt = null;
}

export function refreshGitHubFormat(root: string, record: BountyRecord): void {
  const publication = record.github;
  if (publication === undefined || publication.issue === null) return;
  try { observeIssueFormat(record, publication, api(root, `repos/${publication.repository}/issues/${publication.issue.number}`)); }
  catch { publication.formatUnavailableAt = new Date().toISOString(); }
  persistRecord(root, record);
}

export type IssueComment = { readonly author: string | null; readonly body: string; readonly at: string };

function boundIssue(root: string, record: BountyRecord, fetched?: unknown): { repository: string; number: number; account: string } {
  const publication = record.github;
  if (publication === undefined || publication.issue === null) return invalid('not-github-posted', `this bounty has no GitHub issue; next: box bounty status`);
  const issue = fetched ?? api(root, `repos/${publication.repository}/issues/${publication.issue.number}`);
  if (!isObject(issue) || issue['number'] !== publication.issue.number || typeof issue['body'] !== 'string' || !issue['body'].includes(`<!-- box-bounty:${record.id} -->`) || !isObject(issue['user']) || issue['user']['login'] !== publication.account) return invalid('github-issue-mismatch', `the issue is not this bounty's; nothing was read from it; next: box bounty status`);
  return { repository: publication.repository, number: publication.issue.number, account: publication.account };
}

export function issueComments(root: string, record: BountyRecord, fetched?: unknown): IssueComment[] {
  const issue = boundIssue(root, record, fetched);
  return pages(root, `repos/${issue.repository}/issues/${issue.number}/comments`).flatMap(entry => {
    if (!isObject(entry) || !isObject(entry['user']) || entry['user']['login'] === issue.account) return [];
    if (typeof entry['body'] !== 'string' || typeof entry['created_at'] !== 'string' || !Number.isFinite(Date.parse(entry['created_at']))) return invalid('github-response-invalid', 'GitHub returned an unreadable comment; next: box bounty status');
    const author = entry['user']['login'];
    return [{ author: typeof author === 'string' && READABLE_LOGIN.test(author) ? author : null, body: redact(entry['body']), at: entry['created_at'] }];
  });
}

// Reading what other accounts wrote is folded into `status --comments` —
// issueComments above is what it renders, bound to this bounty's own issue
// first, so a record pointed at the wrong issue refuses by name.

// A pull request's change on the real history: the diff against the bounty
// branch tip it descends from, classified changed/added/deleted.
function pullRequestChange(root: string, base: string, head: string): { changed: readonly string[]; added: readonly string[]; deleted: readonly string[] } {
  const diff = gitOutcome(root, ['diff', '--name-status', '-z', '--no-renames', base, head]);
  if (diff.status !== 0) return invalid('github-pr-unreadable', 'Git could not read the pull request change; nothing was collected; next: check signed-in Git and rerun the same command');
  const changed: string[] = [];
  const added: string[] = [];
  const deleted: string[] = [];
  for (const { status, path } of parseNameStatus(diff.stdout)) {
    if (status === 'A') added.push(path);
    else if (status === 'D') deleted.push(path);
    else changed.push(path);
  }
  return { changed: changed.sort(), added: added.sort(), deleted: deleted.sort() };
}

// Added/removed line counts across the pull request's commits — git's read of
// the delta against the bounty branch tip, numstat only (never patch text, so
// no foreign .gitattributes can select a diff driver).
function pullRequestCounts(root: string, base: string, head: string): { added: number; removed: number; binary: number } {
  const run = gitOutcome(root, ['diff', '--numstat', '-z', base, head]);
  let added = 0; let removed = 0; let binary = 0;
  for (const entry of run.stdout.split('\0')) {
    if (entry === '') continue;
    const [a, d] = entry.split('\t');
    if (a === '-') binary += 1;
    else { added += Number.parseInt(a ?? '0', 10) || 0; removed += Number.parseInt(d ?? '0', 10) || 0; }
  }
  return { added, removed, binary };
}

// The stated test-file rule, for the flag: a path counts as a test when a
// segment is `test`, `tests` or `__tests__`, or the basename matches
// `test_*`, `*_test.*`, `*.test.*` or `*.spec.*` — the same rule the folder
// path states.
const isTestPath = (path: string): boolean => {
  const segments = path.toLowerCase().split('/');
  if (segments.slice(0, -1).some(segment => segment === 'test' || segment === 'tests' || segment === '__tests__')) return true;
  const base = segments[segments.length - 1]!;
  return base.startsWith('test_') || /_test\.[^.]+$/.test(base) || /\.(?:test|spec)\.[^.]+$/.test(base);
};

// Flags are plain observations, deliberately eager — the same stated rules as
// the folder path's report. No flag blocks anything.
const LARGE_FILES = 20;
const LARGE_LINES = 400;
function pullRequestFlags(change: { changed: readonly string[]; added: readonly string[]; deleted: readonly string[] }, counts: { added: number; removed: number }): string[] {
  const flags: string[] = [];
  const touched = [...change.changed, ...change.added, ...change.deleted];
  const testLike = touched.filter(isTestPath);
  if (testLike.length > 0) flags.push(`the solution touches ${testLike.map(showPath).join(', ')}, marked as a test by the stated rule (a test/, tests/ or __tests__/ segment, or a test_*, *_test.*, *.test.* or *.spec.* basename)`);
  if (change.added.length > 0) flags.push(`the solution adds ${change.added.length} file(s)`);
  if (change.deleted.length > 0) flags.push(`the solution deletes ${change.deleted.length} file(s)`);
  if (touched.length > LARGE_FILES || counts.added + counts.removed > LARGE_LINES) {
    flags.push(`the change is above the stated size (${LARGE_FILES} files or ${LARGE_LINES} lines): ${touched.length} files, ${counts.added + counts.removed} lines`);
  }
  return flags;
}

function renderPullRequestReport(record: BountyRecord, n: number, at: string, author: string, commits: number, change: { changed: readonly string[]; added: readonly string[]; deleted: readonly string[] }, merge: DryMerge, counts: { added: number; removed: number; binary: number }, payTo: PayToFact = { state: 'none' }): string[] {
  const lines: string[] = [];
  lines.push(`report — attempt ${n} for ${record.id}`);
  lines.push(`  from: GitHub account ${author} — arrived ${at}`);
  if ((boundAmount(record) ?? 0) > 0) lines.push(`  ${payToLine(payTo)}`);
  lines.push(`  change: ${commits} commit(s) on the bounty branch — ${change.changed.length} changed, ${change.added.length} added, ${change.deleted.length} deleted — ${counts.added} lines added, ${counts.removed} removed${counts.binary > 0 ? ` (${counts.binary} binary file(s))` : ''}`);
  if (merge.kind === 'clean') {
    lines.push('  current code: the solution would merge cleanly onto the current branch');
  } else if (merge.kind === 'conflict') {
    lines.push(`  current code: merging onto the current branch would conflict in ${merge.paths.map(showPath).join(', ')}`);
  } else {
    lines.push(`  current code: cannot tell — ${merge.detail}`);
  }
  const flags = pullRequestFlags(change, counts);
  if (flags.length === 0) lines.push('  flags: none');
  else for (const flag of flags) lines.push(`  flag: ${flag}`);
  lines.push(`  ${NOTHING_RUN}`);
  lines.push(`  next: box bounty look ${record.id} ${n} to read the change; box bounty apply ${record.id} ${n} to merge it; or box bounty close ${record.id} --reason "<why>"`);
  return lines;
}

// Collecting a pull request: the checks the old `answer` command enforced,
// run before anything is written — the same gate `look <id> <n>` and `apply
// <id> <n>` pass through for a number no recorded attempt carries. `via` is
// the driving command's name for the recorded event.
export function answerGitHub(root: string, id: string, pr: number, via?: 'look' | 'apply') {
  const record = loadRecord(root, id);
  requireCurrentDelivery(record);
  if (record.github === undefined || record.github.state !== 'posted') return invalid('not-github-posted', 'this bounty is not posted to GitHub; next: box bounty status');
  if (!isOpenStage(record.stage)) return invalid('not-posted', `bounty ${id} is ${record.stage} — a solution can only come back to a bounty that is still open; next: box bounty status ${id}`);
  if (!Number.isSafeInteger(pr) || pr < 1) return invalid('github-pr-missing', 'next: name an existing pull request number');
  const publication = record.github;
  const { repository, branch } = publication;
  let data: unknown;
  try { data = api(root, `repos/${repository}/pulls/${pr}`); }
  catch { return invalid('github-pr-missing', 'that pull request cannot be read in the project repository; nothing was collected; next: rerun the command with a pull request number that exists in the project repository'); }
  if (!isObject(data) || !isObject(data['base']) || !isObject(data['base']['repo']) || data['base']['ref'] !== branch || data['base']['repo']['full_name'] !== repository) return invalid('github-pr-wrong-branch', 'the pull request targets another branch or repository; nothing was collected; next: name a pull request that targets the project repository');
  if (!isObject(data['head']) || typeof data['head']['sha'] !== 'string' || !/^[a-f\d]{40}$/.test(data['head']['sha']) || !isObject(data['user'])) return invalid('github-response-invalid', 'GitHub returned unreadable pull request facts; next: check gh and rerun the same command');
  const author = login(data['user']['login']);
  // The pull request's head lands on FETCH_HEAD alone — no scratch ref to
  // create and delete around the read.
  remoteGit(root, repository, ['fetch', '--no-tags', '--no-recurse-submodules', `refs/pull/${pr}/head`]);
  const commit = git(root, ['rev-parse', 'FETCH_HEAD']);
  if (commit !== data['head']['sha']) return invalid('github-pr-changed', 'the pull request changed during collection; next: rerun the same command to collect its current version');
  const body = typeof data['body'] === 'string' ? data['body'] : '';
  const payTo = parsePayTo(body);
  requireCurrentDelivery(record);
  const result = collectHistoryPullRequest(root, record, publication, commit, author, pr, via, payTo, redact(body));
  if (publication.seenPullRequests?.some(entry => entry.n === pr && entry.commit === commit) !== true) {
    publication.seenPullRequests = [...publication.seenPullRequests ?? [], { n: pr, commit, at: result.record.attempts?.find(attempt => attempt.commit === commit)?.seenAt ?? new Date().toISOString() }];
    persistRecord(root, result.record);
  }
  return result;
}

// `look <id> <n>` and `apply <id> <n>` accept a pull request's number
// directly: when no recorded attempt carries n and the bounty is posted on
// GitHub, the number collects the pull request first — every check above —
// and the attempt it lands is the one the command proceeds with. `via` is
// the command's own name for the recorded event.
export function resolveAttempt(root: string, record: BountyRecord, n: number, via: 'look' | 'apply'): { record: BountyRecord; attempt: Attempt; collected: boolean } {
  const found = attemptsOf(record).find(candidate => candidate.n === n);
  if (found !== undefined) return { record, attempt: found, collected: false };
  if (record.github?.state === 'posted' && isOpenStage(record.stage)) {
    const collected = answerGitHub(root, record.id, n, via);
    const attempt = attemptsOf(collected.record).find(candidate => candidate.n === collected.attempt);
    if (attempt !== undefined) return { record: collected.record, attempt, collected: true };
  }
  const known = attemptsOf(record).map(candidate => `#${candidate.n}`).join(', ') || 'none yet';
  const way = record.github === undefined
    ? `post to GitHub with box bounty post ${record.id}, or end it with box bounty close ${record.id}`
    : `name one of them or a pull request number — the pull request collects itself`;
  return invalid('unknown-attempt', `solution ${n} does not exist on ${record.id} — the bounty knows ${known}; ${way}; next: box bounty status ${record.id}`);
}

// The history path: the pull request's commits are the answer. Refusals, each
// changing nothing: its history does not descend from the bounty branch; its
// tree holds a link, a submodule or an unsafe name; a path it carries matches
// never-ship anywhere in its new history; it changes nothing at all.
// `description` is the pull request's own description text, credential-redacted
// by the caller. It is recorded for `look --json`'s `fromOthers` (BT19) — the
// tool never renders it as its own words.
function collectHistoryPullRequest(root: string, record: BountyRecord, publication: GitHubPublication, commit: string, author: string, pr: number, via?: string, payTo: PayToFact = { state: 'none' }, description?: string) {
  if (gitOutcome(root, ['merge-base', '--is-ancestor', publication.commit, commit]).status !== 0) {
    return invalid('github-pr-not-descended', `the pull request's history does not descend from ${publication.branch}, the bounty branch — there is nothing sound to compare it with; nothing was collected; next: ask the solver to rebase the pull request on ${publication.branch}, or do not collect it`);
  }
  const remoteTip = remoteBranchSha(root, publication.repository, publication.branch);
  if (remoteTip !== publication.commit) {
    return invalid('github-branch-changed', `${publication.branch} on the remote is ${remoteTip ?? 'gone'}, not the ${publication.commit} this tool posted — it was changed outside the tool; nothing was collected; next: ask the owner — the remote branch was changed outside the tool`);
  }
  const tree = gitOutcome(root, ['ls-tree', '-rz', commit]);
  if (tree.status !== 0) return invalid('github-pr-unreadable', 'Git could not read the pull request tree; next: check signed-in Git and rerun the same command');
  for (const entry of tree.stdout.split('\0')) {
    if (entry === '') continue;
    const match = /^(100644|100755) blob ([a-f\d]{40})\t(.+)$/s.exec(entry);
    if (match === null || match[3] === undefined || match[3].split('/').some(segment => segment === '' || segment === '.' || segment === '..') || /[\\:\x00-\x1f]/.test(match[3])) return invalid('answer-unsafe-path', `the pull request tree holds a link, a submodule or an unsafe path; nothing was collected; next: do not collect it, or end the bounty with box bounty close ${record.id} --reason "<why>"`);
    if (redact(match[3]) !== match[3]) return invalid('github-response-invalid', `a pull request path contains credential-shaped text; nothing was collected; next: do not collect it, or end the bounty with box bounty close ${record.id} --reason "<why>"`);
  }
  // Never-ship on everything the pull request introduces: a path it touches
  // anywhere in its new history — added, changed or deleted — is refused,
  // so a file planted deep in the history and removed in the last commit
  // still cannot land.
  const rules = shipRules(root);
  // --parents rides the same walk: each new commit's first parent comes back
  // in the same line, so no per-commit `rev-list --parents` is needed.
  const firstParents = new Map<string, string>();
  const newCommits = gitOutcome(root, ['rev-list', '--topo-order', '--parents', `${publication.commit}..${commit}`]).stdout
    .split('\n').map(line => line.trim().split(/\s+/)).filter(fields => /^[a-f\d]{40}$/.test(fields[0] ?? ''))
    .map(fields => {
      if (fields[1] !== undefined) firstParents.set(fields[0]!, fields[1]!);
      return fields[0]!;
    });
  const violations: { path: string; rule: string }[] = [];
  for (const sha of newCommits) {
    violations.push(...neverShipViolations(commitStatuses(root, sha, 'nothing was collected', firstParents.get(sha) ?? EMPTY_TREE), rules));
  }
  if (violations.length > 0) {
    const named = [...new Map(violations.map(v => [v.path, v])).values()];
    return invalid('answer-never-ship', `the pull request touches never-ship paths in its history — refused, nothing was collected: ${named.map(v => `${showPath(v.path)} (rule '${v.rule}')`).join(', ')}; next: end the bounty with box bounty close ${record.id} --reason "<why>" — never-ship paths cannot be collected`);
  }
  const change = pullRequestChange(root, publication.commit, commit);
  if (change.changed.length === 0 && change.added.length === 0 && change.deleted.length === 0) {
    return invalid('answer-empty', `the pull request changes nothing against the bounty branch — a return that changes nothing is no solution; next: ask for a pull request that changes something, or end the bounty with box bounty close ${record.id} --reason "<why>"`);
  }
  // A pull request keeps its own number as its solution number — the outside
  // listing and `look`/`apply <id> <n>` name the same thing. A number already
  // carried by an attempt (this pull request collected before, or a returned
  // folder that took it) falls back to the next free number.
  const n = attemptsOf(record).some(attempt => attempt.n === pr)
    ? attemptsOf(record).reduce((max, attempt) => Math.max(max, attempt.n), 0) + 1
    : pr;
  // Pin the attempt commit before recording anything — a crash between loses
  // nothing the record names.
  git(root, ['update-ref', attemptRefName(record.id, n), commit]);
  transitionTo(root, record, 'taken', { attempt: n, ...(via !== undefined ? { command: via } : {}) });
  transitionTo(root, record, 'answered', { attempt: n });
  record.conflicts = null;

  const at = new Date().toISOString();
  const merge = dryMergeOnto(root, commit);
  const counts = pullRequestCounts(root, publication.commit, commit);
  const report = renderPullRequestReport(record, n, at, author, newCommits.length, change, merge, counts, payTo);
  const attempt: Attempt = {
    n,
    pullRequest: pr,
    at,
    seenAt: publication.seenPullRequests?.find(entry => entry.commit === commit)?.at ?? at,
    author,
    commit,
    changed: change.changed,
    added: change.added,
    deleted: change.deleted,
    outcome: 'answered',
    conflicts: merge.kind === 'conflict' ? merge.paths : null,
    report,
    payTo,
    ...(description !== undefined ? { description } : {})
  };
  record.attempts = [...attemptsOf(record), attempt];
  persistRecord(root, record);
  // BT32: collecting a pull request is a shared chain milestone.
  shareSolution(root, record, attempt);
  return { record, outcome: 'answered' as const, attempt: n, report, ...(merge.kind === 'conflict' ? { conflicts: merge.paths } : {}) };
}
