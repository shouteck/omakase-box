// One refresh: search, then repositories (the private rule comes first), then
// the stalest bounties' details, until the budget ends. Whatever is left waits
// for the next refresh, which starts from the same stalest-first order.
import { readFormat } from '../../box-bounty/format.js';
import { BudgetSpent, type Env, GitHub, GitHubUnavailable, isPublicRepository, TICK_MINUTES } from './github.js';
import { type Db, getMeta, log, purgeRepository, removeBounty, setMeta } from './store.js';

const SEARCH = '/search/issues?q=is%3Aissue%20is%3Apublic%20label%3Abox-bounty&per_page=100&sort=updated&order=desc';
const SEARCH_PAGES = 10; // GitHub search answers at most 1,000 results.
const REPOSITORY_STALE_MS = TICK_MINUTES * 60000;
const DETAILS_STALE_MS = TICK_MINUTES * 60000;
const TITLE_MAX = 300;
const TASK_MAX = 65536;

export const LOGIN = /^[A-Za-z\d](?:[A-Za-z\d-]*[A-Za-z\d])?(?:\[bot\])?$/;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** publicText escapes `<` when posting; the board shows the poster's own characters, as text. */
const unescaped = (text: string): string => text.replaceAll('&lt;', '<');

/** The issue's "What is wanted" section, or the body before the block when the shape differs. */
export function taskOf(body: string, blockStart: number): string {
  const text = body.slice(0, blockStart);
  const match = /^## What is wanted\r?\n([\s\S]*?)(?=^## What was already tried\r?$)/m.exec(text);
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

async function storeIssue(db: Db, listed: Listed, now: number): Promise<void> {
  const { issue } = listed;
  const body = issue['body'] as string;
  const format = readFormat(body);
  if (format.kind !== 'present') return;
  const value = format.value;
  // The first issue to claim an id keeps it: a copy elsewhere cannot overwrite it.
  const held = await db.prepare('SELECT repository, issue_number FROM bounties WHERE id = ?').bind(value.id).first<{ repository: string; issue_number: number }>();
  if (held !== null && (held.repository.toLowerCase() !== listed.repository.toLowerCase() || held.issue_number !== issue['number'])) {
    await log(db, now, 'id-claimed-by-another-issue', issue['html_url'] as string);
    return;
  }
  await db.prepare(`INSERT INTO bounties (id, repository, issue_number, title, task, poster, issue_state, closed_at, amount, created_at, work_commit, seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET title = excluded.title, task = excluded.task, poster = excluded.poster, issue_state = excluded.issue_state, closed_at = excluded.closed_at, amount = excluded.amount, work_commit = excluded.work_commit, seen_at = excluded.seen_at`)
    .bind(value.id, listed.repository, issue['number'] as number, titleOf(issue['title'] as string, value.id), taskOf(body, format.start),
      (issue['user'] as Record<string, string>)['login']!, issue['state'] === 'closed' ? 'closed' : 'open',
      typeof issue['closed_at'] === 'string' ? issue['closed_at'] : null, value.reward.amount, value.createdAt, value.workCommit, now)
    .run();
}

/** Reads one repository and applies the private rule. True while it stays public. */
export async function readRepository(env: Env, github: GitHub, name: string, now: number): Promise<boolean> {
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
    for (const item of items) {
      const listed = readIssue(item);
      if ('refused' in listed) { await log(db, now, listed.refused, listed.url); continue; }
      const stored = known.get(listed.repository.toLowerCase())
        ?? (await db.prepare('SELECT read_at FROM repositories WHERE name = ?').bind(listed.repository).first<{ read_at: number }>()) !== null;
      // A repository not yet read holds its bounties back until it has been.
      const isPublic = stored || await readRepository(env, github, listed.repository, now);
      known.set(listed.repository.toLowerCase(), isPublic);
      if (isPublic) await storeIssue(db, listed, now);
    }
    if (items.length < 100) { complete = answer.json['incomplete_results'] !== true; break; }
  }
  return { complete };
}

async function readPullRequests(env: Env, github: GitHub, id: string, repository: string): Promise<void> {
  const answer = await github.get(`/repos/${repository}/pulls?state=all&base=box-bounty/${id}&per_page=100`);
  if (answer.status !== 200 || !Array.isArray(answer.json)) return;
  for (const pull of answer.json as unknown[]) {
    if (!record(pull) || !Number.isSafeInteger(pull['number']) || typeof pull['created_at'] !== 'string' || !record(pull['user'])) continue;
    const author = pull['user']['login'];
    if (typeof author !== 'string' || !LOGIN.test(author)) continue;
    const merged = typeof pull['merged_at'] === 'string' ? pull['merged_at'] : null;
    await env.DB.prepare(`INSERT INTO pull_requests (bounty_id, number, author, state, opened_at, merged_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (bounty_id, number) DO UPDATE SET author = excluded.author, state = excluded.state, merged_at = excluded.merged_at`)
      .bind(id, pull['number'] as number, author, merged !== null ? 'merged' : pull['state'] === 'closed' ? 'closed' : 'open', pull['created_at'], merged)
      .run();
  }
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
  const commits = await github.get(`/repos/${repository}/commits?sha=refs/box-bounty/${id}&per_page=50`);
  if (commits.status !== 200 || !Array.isArray(commits.json)) return; // no chain: GitHub's facts still show
  for (const commit of commits.json as unknown[]) {
    if (!record(commit) || typeof commit['sha'] !== 'string' || !/^[a-f\d]{40}$/.test(commit['sha'])) continue;
    const sha = commit['sha'];
    if (await db.prepare('SELECT sha FROM events WHERE bounty_id = ? AND sha = ?').bind(id, sha).first() !== null) continue;
    const blob = await github.get(`/repos/${repository}/contents/event.json?ref=${sha}`);
    const content = record(blob.json) && typeof blob.json['content'] === 'string' ? blob.json['content'] : null;
    // A commit that holds no valid event stays recorded with no type, so it costs one read only.
    let event: ReturnType<typeof projectEvent> = null;
    try { event = content === null ? null : projectEvent(decode(content)); } catch { event = null; }
    await db.prepare('INSERT INTO events (bounty_id, sha, at, type, pull_request, amount, withdrawn, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, sha, event?.at ?? null, event?.type ?? null, event?.pull_request ?? null, event?.amount ?? null, event?.withdrawn ?? null, event?.kind ?? null).run();
    if (event?.approved !== null && event?.approved !== undefined) await db.prepare('UPDATE bounties SET approved_by = ? WHERE id = ?').bind(event.approved, id).run();
  }
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

export type RefreshResult = { readonly requests: number; readonly state: 'done' | 'budget-spent' | 'github-unavailable'; readonly reason?: string };

export async function refresh(env: Env): Promise<RefreshResult> {
  const db = env.DB;
  const now = env.now?.() ?? Date.now();
  const github = new GitHub(env, true);
  try {
    const { complete } = await search(env, github, now);
    const repositories = await db.prepare('SELECT name FROM repositories WHERE read_at <= ? ORDER BY read_at').bind(now - REPOSITORY_STALE_MS).all<{ name: string }>();
    for (const { name } of repositories.results) await readRepository(env, github, name, now);
    const due = await db.prepare('SELECT id, repository, issue_number, seen_at, issue_state FROM bounties WHERE details_read_at <= ? ORDER BY details_read_at, id')
      .bind(now - DETAILS_STALE_MS).all<{ id: string; repository: string; issue_number: number; seen_at: number; issue_state: string }>();
    for (const row of due.results) {
      if (complete && row.issue_state === 'open' && row.seen_at < now && !await readIssueAgain(env, github, row.id, row.repository, row.issue_number, now)) continue;
      await readPullRequests(env, github, row.id, row.repository);
      await readEvents(env, github, row.id, row.repository);
      await db.prepare('UPDATE bounties SET details_read_at = ? WHERE id = ?').bind(now, row.id).run();
    }
    await markRead(db, now);
    return { requests: github.used, state: 'done' };
  } catch (error) {
    if (error instanceof BudgetSpent) {
      await markRead(db, now);
      return { requests: github.used, state: 'budget-spent' };
    }
    if (error instanceof GitHubUnavailable) {
      await setMeta(db, 'last_error', error.message);
      return { requests: github.used, state: 'github-unavailable', reason: error.message };
    }
    throw error;
  }
}

async function markRead(db: Db, now: number): Promise<void> {
  await setMeta(db, 'read_at', String(now));
  if (await getMeta(db, 'last_error') !== null) await setMeta(db, 'last_error', '');
}
