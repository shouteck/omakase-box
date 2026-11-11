// One refresh: search, then repositories (the private rule comes first), then
// the stalest bounties' details, until the budget ends. Whatever is left waits
// for the next refresh, which starts from the same stalest-first order.
import { readFormat } from '../../box-bounty/format.js';
import { BudgetSpent, type Env, GitHub, GitHubUnavailable, isPublicRepository, TICK_MINUTES } from './github.js';
import { type Db, getMetas, log, logStatements, metaStatement, purgeRepository, removeBounty, runAll, setMeta, type Statement } from './store.js';

const SEARCH = '/search/issues?q=is%3Aissue%20is%3Apublic%20label%3Abox-bounty&per_page=100&sort=updated&order=desc';
const SEARCH_PAGES = 10; // GitHub search answers at most 1,000 results.
const REPOSITORY_STALE_MS = TICK_MINUTES * 60000;
const DETAILS_STALE_MS = TICK_MINUTES * 60000;
const SEARCH_EVERY_MS = TICK_MINUTES * 60000;
/** PF29: a head with no checks yet is read again only while its attempt was active this recently: CI often starts after a push. */
const RECENT_ACTIVITY_MS = 60 * 60000;
const TITLE_MAX = 300;
const TASK_MAX = 65536;

export const LOGIN = /^[A-Za-z\d](?:[A-Za-z\d-]*[A-Za-z\d])?(?:\[bot\])?$/;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** publicText escapes `<` when posting; the board shows the poster's own characters, as text. */
const unescaped = (text: string): string => text.replaceAll('&lt;', '<');

/** The issue's "What is wanted" section, or the body before the block when the shape differs. */
export function taskOf(body: string, blockStart: number): string {
  const text = body.slice(0, blockStart);
  // PF33: the tool writes "What was already tried" only when the poster wrote a note, so the task ends at whichever of
  // the tool's next headings comes first; a task with headings of its own keeps them.
  const match = /^## What is wanted\r?\n([\s\S]*?)(?=^## (?:What was already tried|How to answer)\r?$)/m.exec(text);
  return unescaped((match?.[1] ?? text).trim()).slice(0, TASK_MAX);
}
export const titleOf = (title: string, id: string): string =>
  unescaped(title.startsWith(`[box bounty ${id}] `) ? title.slice(`[box bounty ${id}] `.length) : title).slice(0, TITLE_MAX);

type Listed = { readonly id: string; readonly repository: string; readonly issue: Record<string, unknown> };

/** One issue as the board may hold it, or the reason it may not. */
function readIssue(issue: unknown): Listed | { readonly refused: string; readonly url: string | null } {
  if (!record(issue)) return { refused: 'issue-unreadable', url: null };
  const url = typeof issue['html_url'] === 'string' ? issue['html_url'] : null;
  const refused = (reason: string) => ({ refused: reason, url });
  if ('pull_request' in issue) return refused('is-a-pull-request');
  const from = typeof issue['repository_url'] === 'string' ? /\/repos\/([^/]+\/[^/]+)$/.exec(issue['repository_url'])?.[1] : undefined;
  if (from === undefined || typeof issue['body'] !== 'string' || typeof issue['title'] !== 'string' || typeof issue['number'] !== 'number') return refused('issue-unreadable');
  const format = readFormat(issue['body']);
  if (format.kind !== 'present') return refused(`format-${format.kind}`);
  if (!issue['body'].includes(`<!-- box-bounty:${format.value.id} -->`)) return refused('marker-missing');
  // A block naming another repository is not this repository's bounty.
  if (format.value.repository.toLowerCase() !== from.toLowerCase()) return refused('format-names-another-repository');
  const user = issue['user'];
  if (!record(user) || typeof user['login'] !== 'string' || !LOGIN.test(user['login'])) return refused('poster-unreadable');
  return { id: format.value.id, repository: from, issue };
}

type Held = { id: string; repository: string; issue_number: number };

/** The first issue to claim an id keeps it: a copy elsewhere cannot overwrite it. */
const claimedElsewhere = (held: Held | undefined, listed: Listed): boolean =>
  held !== undefined && (held.repository.toLowerCase() !== listed.repository.toLowerCase() || held.issue_number !== listed.issue['number']);

function issueStatement(db: Db, listed: Listed, now: number): Statement | null {
  const { issue } = listed;
  const body = issue['body'] as string;
  const format = readFormat(body);
  if (format.kind !== 'present') return null;
  const value = format.value;
  const posterId = (issue['user'] as Record<string, unknown>)['id'];
  // listed_seq: one more than any yet, taken once when the board first lists the bounty (PF22's "new since").
  return db.prepare(`INSERT INTO bounties (id, repository, issue_number, title, task, poster, poster_id, issue_state, closed_at, amount, created_at, work_commit, seen_at, listed_seq)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(listed_seq), 0) + 1 FROM bounties))
    ON CONFLICT (id) DO UPDATE SET listed_seq = COALESCE(bounties.listed_seq, excluded.listed_seq), title = excluded.title, task = excluded.task, poster = excluded.poster, poster_id = excluded.poster_id, issue_state = excluded.issue_state, closed_at = excluded.closed_at, amount = excluded.amount, work_commit = excluded.work_commit, seen_at = excluded.seen_at`)
    .bind(value.id, listed.repository, issue['number'] as number, titleOf(issue['title'] as string, value.id), taskOf(body, format.start),
      (issue['user'] as Record<string, string>)['login']!, Number.isSafeInteger(posterId) ? posterId as number : null, issue['state'] === 'closed' ? 'closed' : 'open',
      typeof issue['closed_at'] === 'string' ? issue['closed_at'] : null, value.reward.amount, value.createdAt, value.workCommit, now);
}

/** False when the issue may not hold this id. */
async function storeIssue(db: Db, listed: Listed, now: number): Promise<boolean> {
  const held = await db.prepare('SELECT id, repository, issue_number FROM bounties WHERE id = ?').bind(listed.id).first<Held>();
  if (claimedElsewhere(held ?? undefined, listed)) {
    await log(db, now, 'id-claimed-by-another-issue', listed.issue['html_url'] as string);
    return false;
  }
  const statement = issueStatement(db, listed, now);
  if (statement === null) return false;
  await statement.run();
  return true;
}

/** Reads one repository and applies the private rule. True while it stays public. */
/** PF9b: a repository the board's own setting names is never listed, whatever GitHub says of it. */
const unlistedNames = (env: Env): string[] => (env.UNLISTED_REPOSITORIES ?? '').split(',').map(entry => entry.trim()).filter(Boolean);
export const unlisted = (env: Env, name: string): boolean => unlistedNames(env).some(entry => entry.toLowerCase() === name.toLowerCase());

export async function readRepository(env: Env, github: GitHub, name: string, now: number): Promise<boolean> {
  // The one gate every listing passes, from the search or a notice: an unlisted repository is treated as a private one,
  // its bounties removed and nothing of it read, so the feed, pages, numbers, MCP and owner records leave it out too.
  if (unlisted(env, name)) {
    await purgeRepository(env.DB, name);
    await log(env.DB, now, 'repository-unlisted', null);
    return false;
  }
  const answer = await github.get(`/repos/${name}`);
  if (!isPublicRepository(answer)) {
    await purgeRepository(env.DB, name);
    await log(env.DB, now, 'repository-not-public', null);
    return false;
  }
  const repository = answer.json as Record<string, unknown>;
  await env.DB.prepare(`INSERT INTO repositories (name, language, default_branch, read_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (name) DO UPDATE SET language = excluded.language, default_branch = excluded.default_branch, read_at = excluded.read_at`)
    .bind(name, typeof repository['language'] === 'string' ? repository['language'] : null, typeof repository['default_branch'] === 'string' ? repository['default_branch'] : 'main', now)
    .run();
  return true;
}

async function search(env: Env, github: GitHub, now: number): Promise<{ readonly complete: boolean }> {
  const db = env.DB;
  let complete = false;
  const known = new Map<string, boolean>();
  for (let page = 1; page <= SEARCH_PAGES; page++) {
    const answer = await github.get(`${SEARCH}&page=${page}`);
    if (answer.status !== 200 || !record(answer.json) || !Array.isArray(answer.json['items'])) throw new GitHubUnavailable(`GitHub's search answered ${answer.status}`);
    const items = answer.json['items'] as unknown[];
    const read = items.map(readIssue);
    const issues = read.filter((one): one is Listed => !('refused' in one));
    const held = new Map<string, Held>();
    if (issues.length > 0) {
      const { results } = await db.prepare(`SELECT id, repository, issue_number FROM bounties WHERE id IN (${issues.map(() => '?').join()})`).bind(...issues.map(one => one.id)).all<Held>();
      for (const row of results) held.set(row.id, row);
    }
    const unread = [...new Set(issues.map(one => one.repository))].filter(name => !known.has(name.toLowerCase()));
    if (unread.length > 0) {
      const { results } = await db.prepare(`SELECT name FROM repositories WHERE name IN (${unread.map(() => '?').join()})`).bind(...unread).all<{ name: string }>();
      for (const { name } of results) known.set(name.toLowerCase(), true);
    }
    const writes: Statement[] = [];
    for (const listed of read) {
      if ('refused' in listed) { writes.push(...logStatements(db, now, listed.refused, listed.url)); continue; }
      // A repository not yet read holds its bounties back until it has been.
      // An unlisted repository passes the gate every time, so a stored one is purged, never let through as known.
      const isPublic = unlisted(env, listed.repository) ? await readRepository(env, github, listed.repository, now) : known.get(listed.repository.toLowerCase()) ?? await readRepository(env, github, listed.repository, now);
      known.set(listed.repository.toLowerCase(), isPublic);
      if (!isPublic) continue;
      if (claimedElsewhere(held.get(listed.id), listed)) { writes.push(...logStatements(db, now, 'id-claimed-by-another-issue', listed.issue['html_url'] as string)); continue; }
      const statement = issueStatement(db, listed, now);
      if (statement === null) continue;
      writes.push(statement);
      // The same id later on this page meets this claim.
      held.set(listed.id, { id: listed.id, repository: listed.repository, issue_number: listed.issue['number'] as number });
    }
    await runAll(db, writes);
    if (items.length < 100) { complete = answer.json['incomplete_results'] !== true; break; }
  }
  return { complete };
}

/** So a bounty with many merged pull requests cannot spend a refresh and hold up the others. Never asked first: what was never read. */
const COMPARES_PER_READ = 5;
const ASSOCIATIONS = new Set(['COLLABORATOR', 'CONTRIBUTOR', 'FIRST_TIMER', 'FIRST_TIME_CONTRIBUTOR', 'MANNEQUIN', 'MEMBER', 'NONE', 'OWNER']);

async function readPullRequests(env: Env, github: GitHub, id: string, repository: string): Promise<void> {
  const answer = await github.get(`/repos/${repository}/pulls?state=all&base=box-bounty/${id}&per_page=100`);
  if (answer.status !== 200 || !Array.isArray(answer.json)) return;
  const writes: Statement[] = [];
  for (const pull of answer.json as unknown[]) {
    if (!record(pull) || !Number.isSafeInteger(pull['number']) || typeof pull['created_at'] !== 'string' || !record(pull['user'])) continue;
    const author = pull['user']['login'];
    if (typeof author !== 'string' || !LOGIN.test(author)) continue;
    const merged = typeof pull['merged_at'] === 'string' ? pull['merged_at'] : null;
    const association = typeof pull['author_association'] === 'string' && ASSOCIATIONS.has(pull['author_association']) ? pull['author_association'] : null;
    const head = record(pull['head']) && typeof pull['head']['sha'] === 'string' && /^[a-f\d]{40}$/.test(pull['head']['sha']) ? pull['head']['sha'] : null;
    // The association stays as first read after the merge: a later invitation does not rewrite history.
    const authorId = pull['user']['id'];
    // Draft and last activity (PF22): in the list already read, so an attempt in progress costs no request.
    const draft = typeof pull['draft'] === 'boolean' ? (pull['draft'] ? 1 : 0) : null;
    const updated = typeof pull['updated_at'] === 'string' && Number.isFinite(Date.parse(pull['updated_at'])) ? pull['updated_at'] : null;
    writes.push(env.DB.prepare(`INSERT INTO pull_requests (bounty_id, number, author, author_id, state, opened_at, merged_at, association, head_sha, draft, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (bounty_id, number) DO UPDATE SET author = excluded.author, author_id = excluded.author_id, state = excluded.state, merged_at = excluded.merged_at, head_sha = excluded.head_sha, draft = excluded.draft, updated_at = excluded.updated_at,
        association = CASE WHEN pull_requests.merged_at IS NOT NULL THEN pull_requests.association ELSE excluded.association END`)
      .bind(id, pull['number'] as number, author, Number.isSafeInteger(authorId) ? authorId as number : null, merged !== null ? 'merged' : pull['state'] === 'closed' ? 'closed' : 'open', pull['created_at'], merged, association, head, draft, updated));
  }
  await runAll(env.DB, writes);
}

/** Is a merged head on the default branch? Yes stays yes. A failed read stays unknown, and the page says nothing is confirmed. */
async function readOnDefault(env: Env, github: GitHub, id: string, repository: string): Promise<void> {
  const unknown = await env.DB.prepare(`SELECT p.number, p.head_sha, r.default_branch FROM pull_requests p JOIN repositories r ON r.name = ? WHERE p.bounty_id = ? AND p.state = 'merged' AND p.head_sha IS NOT NULL AND COALESCE(p.on_default, 0) != 1 ORDER BY p.on_default IS NOT NULL, p.number LIMIT ?`)
    .bind(repository, id, COMPARES_PER_READ).all<{ number: number; head_sha: string; default_branch: string }>();
  for (const { number, head_sha, default_branch } of unknown.results) {
    const answer = await github.get(`/repos/${repository}/compare/${head_sha}...${encodeURIComponent(default_branch)}`);
    const status = answer.status === 200 && record(answer.json) ? answer.json['status'] : null;
    if (typeof status !== 'string') continue;
    await env.DB.prepare('UPDATE pull_requests SET on_default = ? WHERE bounty_id = ? AND number = ?').bind(status === 'ahead' || status === 'identical' ? 1 : 0, id, number).run();
  }
}

// PF29: what GitHub's checks say on an open attempt's head, as one state. Check runs (GitHub Actions and apps) and
// commit statuses (other CI) are two reads; a failure in either is failing, anything unfinished is pending, and a head
// with neither is none. Only the state is kept: check names are a solver's text and never stored.
const FAILED = new Set(['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure', 'stale']);
export type ChecksState = 'passing' | 'failing' | 'pending' | 'none' | 'unread';
export function checksOf(runs: unknown, status: unknown): ChecksState {
  if (!record(runs) || !Array.isArray(runs['check_runs']) || !record(status) || !Number.isSafeInteger(status['total_count'])) return 'unread';
  const list = (runs['check_runs'] as unknown[]).filter(record);
  const states = (status['total_count'] as number) > 0 && Array.isArray(status['statuses']) ? (status['statuses'] as unknown[]).filter(record).map(entry => entry['state']) : [];
  if (list.some(run => run['status'] === 'completed' && typeof run['conclusion'] === 'string' && FAILED.has(run['conclusion'])) || states.some(state => state === 'failure' || state === 'error')) return 'failing';
  if (list.some(run => run['status'] !== 'completed') || states.some(state => state === 'pending')) return 'pending';
  return list.length > 0 || states.length > 0 ? 'passing' : 'none';
}

async function readChecks(env: Env, github: GitHub, id: string, repository: string, number: number, head: string, now: number): Promise<void> {
  const runs = await github.get(`/repos/${repository}/commits/${head}/check-runs?per_page=100`);
  const status = await github.get(`/repos/${repository}/commits/${head}/status`);
  const state = runs.status === 200 && status.status === 200 ? checksOf(runs.json, status.json) : 'unread';
  // Kept only if the head is still the one read: a push in between leaves it due for the new head.
  await env.DB.prepare('UPDATE pull_requests SET checks_state = ?, checks_sha = ?, checks_read_at = ? WHERE bounty_id = ? AND number = ? AND head_sha = ?').bind(state, head, now, id, number, head).run();
}

const EVENT_TYPES = new Set(['posted', 'solution', 'merged', 'closed', 'paid']);
const APPROVAL: Record<string, string> = { once: 'owner-this-bounty', allowed: 'owner-standing-rule' };
const integer = (value: unknown): number | null => Number.isSafeInteger(value) ? value as number : null;

/** Only the fields the page shows, each checked; no free text leaves this function. */
function projectEvent(text: string): { type: string; at: string; pull_request: number | null; amount: number | null; withdrawn: number | null; kind: string | null; approved: string | null } | null {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  if (!record(value) || value['v'] !== 1 || typeof value['type'] !== 'string' || !EVENT_TYPES.has(value['type'])) return null;
  const at = value['at'];
  if (typeof at !== 'string' || !Number.isFinite(Date.parse(at))) return null;
  const allowed = record(value['allowedBy']) ? value['allowedBy']['decision'] : undefined;
  const kind = value['kind'];
  return {
    type: value['type'], at,
    pull_request: integer(value['pullRequest']),
    amount: integer(value['amount']),
    withdrawn: value['withdrawn'] === true ? 1 : 0,
    kind: kind === 'rejected' || kind === 'withdrawn' ? kind : null,
    approved: value['type'] === 'posted' && typeof allowed === 'string' ? APPROVAL[allowed] ?? null : null
  };
}

const decode = (base64: string): string => new TextDecoder().decode(Uint8Array.from(atob(base64.replace(/\s/g, '')), c => c.charCodeAt(0)));

async function readEvents(env: Env, github: GitHub, id: string, repository: string): Promise<void> {
  const db = env.DB;
  // BT58: a bounty's record lives at refs/box-bounty-records/<id>; one posted before version 0.2.0 at refs/box-bounty/<id>.
  // The new name first; only a 404 asks for the old one. A bounty with an old-name record therefore costs two reads per
  // events step, every other bounty one (no column to say which: that would be a migration of the live board).
  let commits = await github.get(`/repos/${repository}/commits?sha=refs/box-bounty-records/${id}&per_page=50`);
  if (commits.status === 404) commits = await github.get(`/repos/${repository}/commits?sha=refs/box-bounty/${id}&per_page=50`);
  if (commits.status !== 200 || !Array.isArray(commits.json)) return; // no chain: GitHub's facts still show
  const seen = new Set((await db.prepare('SELECT sha FROM events WHERE bounty_id = ?').bind(id).all<{ sha: string }>()).results.map(row => row.sha));
  const writes: Statement[] = [];
  try {
    for (const commit of commits.json as unknown[]) {
      if (!record(commit) || typeof commit['sha'] !== 'string' || !/^[a-f\d]{40}$/.test(commit['sha'])) continue;
      const sha = commit['sha'];
      if (seen.has(sha)) continue;
      const blob = await github.get(`/repos/${repository}/contents/event.json?ref=${sha}`);
      const content = record(blob.json) && typeof blob.json['content'] === 'string' ? blob.json['content'] : null;
      // A commit that holds no valid event stays recorded with no type, so it costs one read only.
      let event: ReturnType<typeof projectEvent> = null;
      try { event = content === null ? null : projectEvent(decode(content)); } catch { event = null; }
      writes.push(db.prepare('INSERT INTO events (bounty_id, sha, at, type, pull_request, amount, withdrawn, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, sha, event?.at ?? null, event?.type ?? null, event?.pull_request ?? null, event?.amount ?? null, event?.withdrawn ?? null, event?.kind ?? null));
      if (event?.approved !== null && event?.approved !== undefined) writes.push(db.prepare('UPDATE bounties SET approved_by = ? WHERE id = ?').bind(event.approved, id));
    }
  } finally {
    await runAll(db, writes);
  }
}

/**
 * PF32: a listed bounty's issue, read again as it is: its title, its author's words, open or closed. It carries no block
 * and never will; a 404, a 410 or an address that became a pull request takes it off the board.
 */
async function readListedIssue(env: Env, github: GitHub, id: string, repository: string, number: number, now: number): Promise<boolean> {
  const answer = await github.get(`/repos/${repository}/issues/${number}`);
  if (answer.status === 404 || answer.status === 410) { await removeBounty(env.DB, id); await log(env.DB, now, 'listed-issue-gone', null); return false; }
  if (answer.status !== 200 || !record(answer.json)) return true;
  const issue = answer.json;
  if ('pull_request' in issue || typeof issue['title'] !== 'string' || !record(issue['user']) || typeof issue['user']['login'] !== 'string') { await removeBounty(env.DB, id); return false; }
  await env.DB.prepare('UPDATE bounties SET title = ?, task = ?, issue_author = ?, issue_state = ?, closed_at = ?, seen_at = ? WHERE id = ?')
    .bind(unescaped(issue['title']).slice(0, TITLE_MAX), unescaped(typeof issue['body'] === 'string' ? issue['body'] : '').trim().slice(0, TASK_MAX), issue['user']['login'],
      issue['state'] === 'closed' ? 'closed' : 'open', typeof issue['closed_at'] === 'string' ? issue['closed_at'] : null, now, id).run();
  return true;
}

/**
 * PF32: a listed bounty's pull requests are the ones GitHub's timeline says reference its issue, from the same repository
 * (a closing keyword such as "Fixes #12", or any link). One read, in the turn the branch list read would take.
 */
async function readLinkedPulls(env: Env, github: GitHub, id: string, repository: string, number: number): Promise<void> {
  const answer = await github.get(`/repos/${repository}/issues/${number}/timeline?per_page=100`);
  if (answer.status !== 200 || !Array.isArray(answer.json)) return;
  const writes: Statement[] = [];
  const seen = new Set<number>();
  for (const event of answer.json as unknown[]) {
    if (!record(event) || event['event'] !== 'cross-referenced' || !record(event['source']) || !record(event['source']['issue'])) continue;
    const pull = event['source']['issue'];
    if (!record(pull['pull_request']) || !Number.isSafeInteger(pull['number']) || !record(pull['user']) || typeof pull['created_at'] !== 'string') continue;
    const from = typeof pull['repository_url'] === 'string' ? /\/repos\/([^/]+\/[^/]+)$/.exec(pull['repository_url'])?.[1] : undefined;
    const author = pull['user']['login'];
    if (from?.toLowerCase() !== repository.toLowerCase() || typeof author !== 'string' || !LOGIN.test(author) || seen.has(pull['number'] as number)) continue;
    seen.add(pull['number'] as number);
    const merged = typeof pull['pull_request']['merged_at'] === 'string' ? pull['pull_request']['merged_at'] : null;
    const association = typeof pull['author_association'] === 'string' && ASSOCIATIONS.has(pull['author_association']) ? pull['author_association'] : null;
    const authorId = pull['user']['id'];
    const draft = typeof pull['draft'] === 'boolean' ? (pull['draft'] ? 1 : 0) : null;
    const updated = typeof pull['updated_at'] === 'string' ? pull['updated_at'] : null;
    writes.push(env.DB.prepare(`INSERT INTO pull_requests (bounty_id, number, author, author_id, state, opened_at, merged_at, association, head_sha, on_default, draft, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
      ON CONFLICT (bounty_id, number) DO UPDATE SET author = excluded.author, author_id = excluded.author_id, state = excluded.state, merged_at = excluded.merged_at, on_default = excluded.on_default, draft = excluded.draft, updated_at = excluded.updated_at,
        association = CASE WHEN pull_requests.merged_at IS NOT NULL THEN pull_requests.association ELSE excluded.association END`)
      .bind(id, pull['number'] as number, author, Number.isSafeInteger(authorId) ? authorId as number : null, merged !== null ? 'merged' : pull['state'] === 'closed' ? 'closed' : 'open', pull['created_at'], merged, association, merged !== null ? 1 : null, draft, updated));
  }
  await runAll(env.DB, writes);
}

/** An open bounty the finished search no longer returns: read its issue directly. */
async function readIssueAgain(env: Env, github: GitHub, id: string, repository: string, number: number, now: number): Promise<boolean> {
  const answer = await github.get(`/repos/${repository}/issues/${number}`);
  if (answer.status === 404 || answer.status === 410) { await removeBounty(env.DB, id); return false; }
  if (answer.status !== 200) return true;
  const listed = readIssue(answer.json);
  if ('refused' in listed || listed.id !== id) {
    await removeBounty(env.DB, id);
    await log(env.DB, now, 'refused' in listed ? listed.refused : 'id-changed', 'refused' in listed ? listed.url : null);
    return false;
  }
  await storeIssue(env.DB, listed, now);
  return true;
}

export type Look = 'read' | 'not-public' | 'not-this-bounty' | 'budget-spent' | 'github-unavailable';

/** One bounty read now because a hint asked. What the hint named is only where to look: GitHub must say the same. */
export async function lookNow(env: Env, repository: string, number: number, id: string, now: number): Promise<Look> {
  const github = new GitHub(env, true);
  try {
    if (!await readRepository(env, github, repository, now)) return 'not-public';
    // A bounty the board already holds at this address: its pull requests before the issue is checked again (PF28), so a
    // look at 2 reads stores a new one. The repository was just read as public, and the stored bounty is the hint's own.
    const held = await env.DB.prepare('SELECT 1 AS yes FROM bounties WHERE id = ? AND repository = ? AND issue_number = ?').bind(id, repository, number).first();
    if (held !== null) await readPullRequests(env, github, id, repository);
    const answer = await github.get(`/repos/${repository}/issues/${number}`);
    if (answer.status !== 200) return 'not-this-bounty';
    const listed = readIssue(answer.json);
    if ('refused' in listed || listed.id !== id || listed.repository.toLowerCase() !== repository.toLowerCase()) return 'not-this-bounty';
    // A copy of another repository's bounty must not read its pull requests into that bounty.
    if (!await storeIssue(env.DB, listed, now)) return 'not-this-bounty';
    if (held === null) await readPullRequests(env, github, id, listed.repository);
    await readEvents(env, github, id, listed.repository);
    await readOnDefault(env, github, id, listed.repository);
    await env.DB.prepare('UPDATE bounties SET details_read_at = ?, events_read_at = ? WHERE id = ?').bind(now, now, id).run();
    return 'read';
  } catch (error) {
    if (error instanceof BudgetSpent) {
      // What the look could not finish goes first in the next refresh, closed or not.
      await env.DB.prepare('UPDATE bounties SET details_read_at = 0, events_read_at = 0 WHERE id = ? AND repository = ?').bind(id, repository).run();
      return 'budget-spent';
    }
    if (error instanceof GitHubUnavailable) return 'github-unavailable';
    throw error;
  } finally {
    await github.settle();
  }
}

export type RefreshResult = { readonly requests: number; readonly state: 'done' | 'budget-spent' | 'github-unavailable'; readonly reason?: string };

export async function refresh(env: Env): Promise<RefreshResult> {
  const db = env.DB;
  const now = env.now?.() ?? Date.now();
  const github = new GitHub(env, true);
  let searched = false;
  try {
    const meta = await getMetas(db, ['search_tried_at', 'search_complete_at']);
    let completeAt = Number(meta.get('search_complete_at') ?? 0);
    if (now - Number(meta.get('search_tried_at') ?? 0) >= SEARCH_EVERY_MS) {
      await setMeta(db, 'search_tried_at', String(now));
      const { complete } = await search(env, github, now);
      searched = true;
      if (complete) { completeAt = now; await setMeta(db, 'search_complete_at', String(now)); }
    }
    // PF9b: a repository the setting names is removed at the next run, not at its next scheduled read: one batched delete
    // per name (a no-op once gone), and no database call at all when the setting is empty.
    for (const name of unlistedNames(env)) await purgeRepository(db, name);
    const repositories = await db.prepare('SELECT name FROM repositories WHERE read_at <= ? ORDER BY read_at').bind(now - REPOSITORY_STALE_MS).all<{ name: string }>();
    for (const { name } of repositories.results) await readRepository(env, github, name, now);
    // PF28: a bounty's pull requests and its event chain are two steps, each with its own read time, stalest first.
    // A step's turn is spent when it starts: one cut off by the budget keeps what it stored and stays due behind every
    // other due step, so a bounty that needs more reads than a run has can never hold up the rest. Each step's fixed
    // cost is one list read and each further read is stored, so at 2 reads a run every turn makes progress. The pull
    // request step is done once its list is stored; the compares after it are best effort.
    const stale = now - DETAILS_STALE_MS;
    const closedStale = now - (env.closedStaleMs ?? DETAILS_STALE_MS);
    // PF29: a third step, per open attempt: its head's checks. Due when the head was never read, after the stale bound
    // while pending or unread, and while "none" only if the attempt was active in the last hour (CI starting late).
    const recent = new Date(now - RECENT_ACTIVITY_MS).toISOString();
    const due = await db.prepare(`SELECT id, repository, issue_number, seen_at, issue_state, source, step, at, number, head FROM (
        SELECT id, repository, issue_number, seen_at, issue_state, source, 'pulls' AS step, details_read_at AS at, NULL AS number, NULL AS head FROM bounties WHERE details_read_at <= ? AND (issue_state = 'open' OR details_read_at <= ?)
        UNION ALL
        SELECT id, repository, issue_number, seen_at, issue_state, source, 'events' AS step, events_read_at AS at, NULL AS number, NULL AS head FROM bounties WHERE events_read_at <= ? AND (issue_state = 'open' OR events_read_at <= ?)
        UNION ALL
        SELECT b.id, b.repository, b.issue_number, b.seen_at, b.issue_state, b.source, 'checks' AS step, p.checks_read_at AS at, p.number, p.head_sha AS head FROM pull_requests p JOIN bounties b ON b.id = p.bounty_id
          WHERE p.state = 'open' AND b.issue_state = 'open' AND p.head_sha IS NOT NULL AND (p.checks_sha IS NULL OR p.checks_sha != p.head_sha
            OR (p.checks_read_at <= ? AND (p.checks_state IN ('pending', 'unread') OR (p.checks_state = 'none' AND p.updated_at >= ?)))))
      ORDER BY at, id, step, number`)
      .bind(stale, closedStale, stale, closedStale, stale, recent).all<{ id: string; repository: string; issue_number: number; seen_at: number; issue_state: string; source: string; step: 'pulls' | 'events' | 'checks'; at: number; number: number | null; head: string | null }>();
    const checked = new Map<string, boolean>();
    for (const row of due.results) {
      const spent = github.used;
      const mark = (at: number) => row.step === 'checks'
        ? db.prepare('UPDATE pull_requests SET checks_read_at = ? WHERE bounty_id = ? AND number = ?').bind(at, row.id, row.number).run()
        : db.prepare(`UPDATE bounties SET ${row.step === 'pulls' ? 'details_read_at' : 'events_read_at'} = ? WHERE id = ?`).bind(at, row.id).run();
      await mark(row.issue_state === 'open' ? stale : closedStale);
      try {
        // PF32: a listed bounty has no block and no chain. Its pull step reads its issue as it is, then the pull requests
        // linked to it; its events step has nothing to read.
        if (row.source === 'listed') {
          if (row.step === 'events') { await mark(now); continue; }
          if (row.step === 'pulls') {
            if (!await readListedIssue(env, github, row.id, row.repository, row.issue_number, now)) continue;
            await readLinkedPulls(env, github, row.id, row.repository, row.issue_number);
            await mark(now);
            continue;
          }
        }
        if (!checked.has(row.id)) checked.set(row.id, !(row.issue_state === 'open' && row.seen_at < completeAt) || await readIssueAgain(env, github, row.id, row.repository, row.issue_number, now));
        if (!checked.get(row.id)) continue;
        if (row.step === 'pulls') {
          await readPullRequests(env, github, row.id, row.repository);
          await mark(now);
          await readOnDefault(env, github, row.id, row.repository);
        } else if (row.step === 'events') {
          await readEvents(env, github, row.id, row.repository);
          await mark(now);
        } else {
          await readChecks(env, github, row.id, row.repository, row.number!, row.head!, now);
        }
      } catch (error) {
        // A step the budget stopped before its first read keeps its place.
        if (error instanceof BudgetSpent && github.used === spent) await mark(row.at);
        throw error;
      }
    }
    if (searched) await markRead(db, now);
    return { requests: github.used, state: 'done' };
  } catch (error) {
    if (error instanceof BudgetSpent) {
      if (searched) await markRead(db, now);
      return { requests: github.used, state: 'budget-spent' };
    }
    if (error instanceof GitHubUnavailable) {
      await setMeta(db, 'last_error', error.message);
      return { requests: github.used, state: 'github-unavailable', reason: error.message };
    }
    throw error;
  } finally {
    await github.settle();
  }
}

/** read_at says when the list was last read from GitHub; a run that only read details leaves it. */
async function markRead(db: Db, now: number): Promise<void> {
  await db.batch([metaStatement(db, 'read_at', String(now)), metaStatement(db, 'last_error', '')]);
}
