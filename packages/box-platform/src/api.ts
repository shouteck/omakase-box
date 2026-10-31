// What a browser may have: only facts about bounties on public repositories,
// filtered here on the server. No unfiltered record ever leaves this file.
import { type Env, GitHub, GitHubUnavailable, BudgetSpent } from './github.js';
import { readRepository } from './refresh.js';
import { getMeta } from './store.js';

const PAGE_SIZE = 20;
const MAX_QUERY = 100;
const RENDER_RECHECK_MS = 5 * 60000;
const HISTORY_MAX = 50;
const SOLUTIONS_MAX = 50;
const DAY = 86400000;

const NOT_ON_BOARD = 'This bounty is not on the board. The address may be mistyped, on a private repository (those are never listed), or posted in the last few minutes. Next: search the board.';

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
});

/** How old the facts are, and why, in the words the page shows. */
async function freshness(env: Env): Promise<{ read_at: string | null; stale: string | null; sample?: true }> {
  const at = await getMeta(env.DB, 'read_at');
  const error = await getMeta(env.DB, 'last_error');
  return { read_at: at === null ? null : new Date(Number(at)).toISOString(), stale: error === null || error === '' ? null : error, ...(env.SAMPLE ? { sample: true as const } : {}) };
}

const ENUMS: Record<string, readonly string[]> = {
  solutions: ['none', 'some'],
  approved_by: ['owner-this-bounty', 'owner-standing-rule'],
  sort: ['newest', 'reward']
};
const WHOLE = /^\d{1,9}$/;

type CardRow = { id: string; title: string; amount: number; repository: string; language: string | null; created_at: string; poster: string; solutions_open: number };

async function board(env: Env, url: URL, now: number): Promise<Response> {
  const q = url.searchParams;
  for (const [name, allowed] of Object.entries(ENUMS)) {
    const value = q.get(name);
    if (value && !allowed.includes(value)) return json(400, { error: `${name}: "${value.slice(0, 40)}" is not allowed. Next: one of ${allowed.join(', ')}.` });
  }
  for (const name of ['min_reward', 'max_age_days', 'page']) {
    const value = q.get(name);
    if (value && !WHOLE.test(value)) return json(400, { error: `${name}: must be a whole number. Next: remove it or give a number.` });
  }
  const query = q.get('query') ?? '';
  if (query.length > MAX_QUERY) return json(400, { error: `query: at most ${MAX_QUERY} characters. Next: shorten it.` });

  const where = [`b.issue_state = 'open'`, `NOT EXISTS (SELECT 1 FROM pull_requests m WHERE m.bounty_id = b.id AND m.state = 'merged')`];
  const values: (string | number)[] = [];
  const add = (sql: string, ...bound: (string | number)[]) => { where.push(sql); values.push(...bound); };
  if (q.get('language')) add('r.language = ? COLLATE NOCASE', q.get('language')!);
  if (q.get('repository')) add('b.repository = ?', q.get('repository')!);
  if (q.get('min_reward')) add('b.amount >= ?', Number(q.get('min_reward')));
  if (q.get('max_age_days')) add('b.created_at >= ?', new Date(now - Number(q.get('max_age_days')) * DAY).toISOString());
  if (q.get('approved_by')) add('b.approved_by = ?', q.get('approved_by')!);
  const open = `(SELECT COUNT(*) FROM pull_requests p WHERE p.bounty_id = b.id AND p.state = 'open')`;
  if (q.get('solutions') === 'none') where.push(`${open} = 0`);
  if (q.get('solutions') === 'some') where.push(`${open} > 0`);
  if (query) {
    const like = `%${query.replace(/[\\%_]/g, c => `\\${c}`)}%`;
    add(`(b.title LIKE ? ESCAPE '\\' OR b.repository LIKE ? ESCAPE '\\')`, like, like);
  }
  const from = `FROM bounties b JOIN repositories r ON r.name = b.repository WHERE ${where.join(' AND ')}`;
  const total = (await env.DB.prepare(`SELECT COUNT(*) AS n ${from}`).bind(...values).first<{ n: number }>())?.n ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(q.get('page') ?? 1)), pages);
  const order = q.get('sort') === 'reward' ? 'b.amount DESC, b.created_at DESC, b.id' : 'b.created_at DESC, b.id';
  const rows = await env.DB.prepare(`SELECT b.id, b.title, b.amount, b.repository, r.language, b.created_at, b.poster, ${open} AS solutions_open ${from} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .bind(...values, PAGE_SIZE, (page - 1) * PAGE_SIZE).all<CardRow>();
  const allOpen = `FROM bounties b JOIN repositories r ON r.name = b.repository WHERE b.issue_state = 'open' AND NOT EXISTS (SELECT 1 FROM pull_requests m WHERE m.bounty_id = b.id AND m.state = 'merged')`;
  const openTotal = (await env.DB.prepare(`SELECT COUNT(*) AS n ${allOpen}`).first<{ n: number }>())?.n ?? 0;
  const languages = await env.DB.prepare(`SELECT DISTINCT r.language AS v ${allOpen} AND r.language IS NOT NULL ORDER BY v`).all<{ v: string }>();
  const repositories = await env.DB.prepare(`SELECT DISTINCT b.repository AS v ${allOpen} ORDER BY v`).all<{ v: string }>();
  return json(200, {
    ...await freshness(env),
    open_total: openTotal, count: total, page, pages, page_size: PAGE_SIZE,
    languages: languages.results.map(row => row.v),
    repositories: repositories.results.map(row => row.v),
    bounties: rows.results.map(row => ({
      id: row.id, title: row.title, amount: row.amount, repository: row.repository, language: row.language,
      poster: row.poster, solutions_open: row.solutions_open,
      age_days: Math.max(0, Math.floor((now - Date.parse(row.created_at)) / DAY))
    }))
  });
}

type BountyRow = { id: string; repository: string; issue_number: number; title: string; task: string; poster: string; issue_state: string; closed_at: string | null; amount: number; created_at: string; work_commit: string; approved_by: string | null; language: string | null; default_branch: string; read_at: number };
type PullRow = { number: number; author: string; state: string; opened_at: string; merged_at: string | null };
type EventRow = { at: string; type: string; pull_request: number | null; amount: number | null; withdrawn: number | null; kind: string | null };
type Line = { at: string; event: string; source: 'github' | 'project-record' };

/** The shared memory's events, and GitHub's facts for whatever they do not cover. */
export function historyOf(b: Pick<BountyRow, 'created_at' | 'issue_state' | 'closed_at'>, pulls: readonly PullRow[], events: readonly EventRow[]): Line[] {
  const lines: Line[] = [];
  const has = (type: string) => events.some(event => event.type === type);
  for (const event of events) {
    const source = 'project-record' as const;
    if (event.type === 'posted') lines.push({ at: event.at, event: 'posted', source });
    else if (event.type === 'solution') lines.push({ at: event.at, event: event.pull_request === null ? 'solution collected' : `solution collected: pull request #${event.pull_request}`, source });
    else if (event.type === 'merged') lines.push({ at: event.at, event: 'merged', source });
    else if (event.type === 'closed') lines.push({ at: event.at, event: event.kind === null ? 'closed' : `closed: ${event.kind}`, source });
    else if (event.type === 'paid') lines.push({ at: event.at, event: event.withdrawn ? `paid record withdrawn (the owner's word)` : `recorded paid${event.amount === null ? '' : `: $${event.amount}`} (the owner's word)`, source });
  }
  if (!has('posted')) lines.push({ at: b.created_at, event: 'posted', source: 'github' });
  for (const pull of pulls) {
    if (!events.some(event => event.type === 'solution' && event.pull_request === pull.number)) lines.push({ at: pull.opened_at, event: `solution: pull request #${pull.number}`, source: 'github' });
    if (pull.merged_at !== null) lines.push({ at: pull.merged_at, event: `merged: pull request #${pull.number}`, source: 'github' });
  }
  if (b.issue_state === 'closed' && b.closed_at !== null && !has('closed') && !pulls.some(pull => pull.merged_at !== null)) lines.push({ at: b.closed_at, event: 'closed without a merge', source: 'github' });
  return lines.sort((x, y) => Date.parse(x.at) - Date.parse(y.at)).slice(-HISTORY_MAX);
}

export function stateOf(issueState: string, pulls: readonly Pick<PullRow, 'state'>[]): 'open' | 'solutions-waiting' | 'merged' | 'merged-more-than-one' | 'closed-none' {
  const merged = pulls.filter(pull => pull.state === 'merged').length;
  if (merged > 1) return 'merged-more-than-one';
  if (merged === 1) return 'merged';
  if (issueState === 'closed') return 'closed-none';
  return pulls.some(pull => pull.state === 'open') ? 'solutions-waiting' : 'open';
}

async function bounty(env: Env, id: string, now: number): Promise<Response> {
  const notFound = () => json(404, { error: NOT_ON_BOARD });
  if (!/^bt-[a-f\d]{12}$/.test(id)) return notFound();
  const select = `SELECT b.*, r.language, r.default_branch, r.read_at FROM bounties b JOIN repositories r ON r.name = b.repository WHERE b.id = ?`;
  const row = await env.DB.prepare(select).bind(id).first<BountyRow>();
  if (row === null) return notFound();
  // The private rule at render: an old read is read again before anything is sent.
  if (now - row.read_at > RENDER_RECHECK_MS) {
    try {
      if (!await readRepository(env, new GitHub(env, false), row.repository, now)) return notFound();
    } catch (error) {
      // GitHub cannot say; the page shows what was read, and says when.
      if (!(error instanceof GitHubUnavailable || error instanceof BudgetSpent)) throw error;
    }
  }
  const pulls = (await env.DB.prepare('SELECT number, author, state, opened_at, merged_at FROM pull_requests WHERE bounty_id = ? ORDER BY number').bind(id).all<PullRow>()).results;
  const events = (await env.DB.prepare('SELECT at, type, pull_request, amount, withdrawn, kind FROM events WHERE bounty_id = ? AND type IS NOT NULL').bind(id).all<EventRow>()).results;
  const base = `https://github.com/${row.repository}`;
  return json(200, {
    ...await freshness(env),
    bounty: {
      id: row.id,
      title: row.title,
      task: row.task,
      poster: row.poster,
      amount: row.amount,
      state: stateOf(row.issue_state, pulls),
      closed_at: row.closed_at,
      repository: row.repository,
      language: row.language,
      default_branch: row.default_branch,
      posted_at: row.created_at,
      approved_by: row.approved_by,
      work_commit: row.work_commit,
      branch: `box-bounty/${row.id}`,
      links: { issue: `${base}/issues/${row.issue_number}`, branch: `${base}/tree/box-bounty/${row.id}` },
      solutions: pulls.slice(0, SOLUTIONS_MAX).map(pull => ({ number: pull.number, author: pull.author, state: pull.state, opened_at: pull.opened_at, merged_at: pull.merged_at, url: `${base}/pull/${pull.number}` })),
      history: historyOf(row, pulls, events)
    }
  });
}

/** Routes: the two data answers, the one shell for every bounty address, then the static export. */
export async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const now = env.now?.() ?? Date.now();
  if (request.method !== 'GET' && request.method !== 'HEAD') return json(405, { error: 'Read-only. Next: use GET.' });
  if (url.pathname === '/api/board') return board(env, url, now);
  const detail = /^\/api\/b\/([^/]+)$/.exec(url.pathname);
  if (detail !== null) return bounty(env, decodeURIComponent(detail[1]!), now);
  if (url.pathname.startsWith('/api/')) return json(404, { error: 'No such address. Next: /api/board.' });
  if (env.ASSETS === undefined) return json(503, { error: 'The pages are not built. Next: node packages/box-platform/local.mjs.' });
  // Any /b/<something>/ gets the same shell, so the shell says nothing about whether it exists.
  if (/^\/b\/[^/]+\/?$/.test(url.pathname)) return env.ASSETS.fetch(new Request(new URL('/b/', url), request));
  return env.ASSETS.fetch(request);
}
