// What a browser may have: only facts about bounties on public repositories,
// filtered here on the server. No unfiltered record ever leaves this file.
import { accountResponse } from './account.js';
import { applyEvent, payingIds } from './charge.js';
import { applyPayPalEvent, authorTakes } from './paypal-pay.js';
import { PayPalUnavailable, webhookHolds } from './paypal.js';
import { waysOfBounty } from './pay-ways.js';
import { signatureHolds } from './stripe.js';
import { feedResponse, detailResponse, rssResponse, schemaResponse, waysOn } from './feed.js';
import type { Env } from './github.js';
import { hintResponse } from './hint.js';
import { mcpResponse } from './mcp.js';
import { ownerRecords } from './payments.js';
import { addOwnerRecord, DAY, filterOf, freshness, FROM_LISTED, OPEN_COUNT, OPEN_WHERE, readBounty, stateOf } from './query.js';

const PAGE_SIZE = 20;
const SOLUTIONS_MAX = 50;

const NOT_ON_BOARD = 'This bounty is not on the board. The address may be mistyped, on a private repository (those are never listed), or posted in the last few minutes. Next: search the board.';

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
});

type CardRow = { id: string; title: string; amount: number; repository: string; language: string | null; created_at: string; poster: string; solutions_open: number };

async function board(env: Env, url: URL, now: number): Promise<Response> {
  const q = url.searchParams;
  const filter = filterOf(q, now, ['min_reward', 'max_age_days', 'page']);
  if ('error' in filter) return json(400, { error: filter.error });
  await addOwnerRecord(env.DB, q, filter, now);
  const { where, values } = filter;
  const from = `${FROM_LISTED} WHERE ${where.join(' AND ')}`;
  const total = (await env.DB.prepare(`SELECT COUNT(*) AS n ${from}`).bind(...values).first<{ n: number }>())?.n ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(q.get('page') ?? 1)), pages);
  const order = q.get('sort') === 'reward' ? 'b.amount DESC, b.created_at DESC, b.id' : 'b.created_at DESC, b.id';
  const rows = await env.DB.prepare(`SELECT b.id, b.title, b.amount, b.repository, r.language, b.created_at, b.poster, ${OPEN_COUNT} AS solutions_open ${from} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .bind(...values, PAGE_SIZE, (page - 1) * PAGE_SIZE).all<CardRow>();
  const allOpen = `${FROM_LISTED} WHERE ${OPEN_WHERE.join(' AND ')}`;
  const openTotal = (await env.DB.prepare(`SELECT COUNT(*) AS n ${allOpen}`).first<{ n: number }>())?.n ?? 0;
  const languages = await env.DB.prepare(`SELECT DISTINCT r.language AS v ${allOpen} AND r.language IS NOT NULL ORDER BY v`).all<{ v: string }>();
  const repositories = await env.DB.prepare(`SELECT DISTINCT b.repository AS v ${allOpen} ORDER BY v`).all<{ v: string }>();
  const records = await ownerRecords(env.DB, rows.results.map(row => row.poster), now);
  return json(200, {
    ...await freshness(env),
    open_total: openTotal, count: total, page, pages, page_size: PAGE_SIZE,
    languages: languages.results.map(row => row.v),
    repositories: repositories.results.map(row => row.v),
    bounties: rows.results.map(row => ({
      id: row.id, title: row.title, amount: row.amount, repository: row.repository, language: row.language,
      poster: row.poster, record: records.get(row.poster.toLowerCase()), solutions_open: row.solutions_open,
      age_days: Math.max(0, Math.floor((now - Date.parse(row.created_at)) / DAY))
    }))
  });
}

async function bounty(env: Env, id: string, now: number): Promise<Response> {
  const facts = await readBounty(env, id, now);
  if (facts === null) return json(404, { error: NOT_ON_BOARD });
  const { row, pulls, history } = facts;
  const base = `https://github.com/${row.repository}`;
  const paying = (await payingIds(env, [row.id])).has(row.id);
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
      history,
      pays_on_merge: paying,
      how_it_pays: { ways: waysOfBounty(row.amount, waysOn(env), paying) },
      ...await authorTakes(env, row.id),
      agents_welcome: true
    }
  });
}

/** Stripe telling the board what happened. Nothing is believed unless Stripe's signature holds. */
async function webhook(request: Request, env: Env, now: number): Promise<Response> {
  const body = await request.text();
  if (env.STRIPE_WEBHOOK_SECRET === undefined || !await signatureHolds(env.STRIPE_WEBHOOK_SECRET, request.headers.get('stripe-signature'), body, now)) return json(400, { error: 'The signature does not hold. Nothing changed.' });
  try { await applyEvent(env, JSON.parse(body) as Parameters<typeof applyEvent>[1], now); } catch (error) {
    if (error instanceof SyntaxError) return json(400, { error: 'That is not JSON. Nothing changed.' });
    throw error;
  }
  return json(200, { received: true });
}

/** PayPal telling the board what happened. Nothing is believed unless PayPal itself says its signature holds. Unavailable: PayPal sends it again. */
async function paypalWebhook(request: Request, env: Env, now: number): Promise<Response> {
  const body = await request.text();
  try {
    const event: unknown = JSON.parse(body);
    if (!await webhookHolds(env, request.headers, body, now)) return json(400, { error: 'The signature does not hold. Nothing changed.' });
    await applyPayPalEvent(env, event as Parameters<typeof applyPayPalEvent>[1], now);
  } catch (error) {
    if (error instanceof SyntaxError) return json(400, { error: 'That is not JSON. Nothing changed.' });
    if (error instanceof PayPalUnavailable) return json(503, { error: 'PayPal could not be reached. Nothing changed.' });
    throw error;
  }
  return json(200, { received: true });
}

/** Routes: the machine interface, the two data answers, the one shell for every bounty address, then the static export. */
export async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const now = env.now?.() ?? Date.now();
  if (url.pathname === '/mcp') return mcpResponse(request, env, now);
  const account = await accountResponse(request, env, url, now);
  if (account !== null) return account;
  if (url.pathname === '/api/hint' && request.method === 'POST') return hintResponse(request, env, now);
  if (url.pathname === '/api/stripe/webhook' && request.method === 'POST') return webhook(request, env, now);
  if (url.pathname === '/api/paypal/webhook' && request.method === 'POST') return paypalWebhook(request, env, now);
  if (request.method !== 'GET' && request.method !== 'HEAD') return json(405, { error: 'Read-only. Next: use GET.' });
  if (url.pathname === '/bounties.json') return feedResponse(request, env, now);
  if (url.pathname === '/bounties.schema.json') return schemaResponse(request);
  if (url.pathname === '/rss.xml') return rssResponse(request, env, now);
  const file = /^\/bounties\/([^/]+)\.json$/.exec(url.pathname);
  if (file !== null) return detailResponse(request, env, decodeURIComponent(file[1]!), now);
  if (url.pathname === '/api/board') return board(env, url, now);
  const detail = /^\/api\/b\/([^/]+)$/.exec(url.pathname);
  if (detail !== null) return bounty(env, decodeURIComponent(detail[1]!), now);
  if (url.pathname.startsWith('/api/')) return json(404, { error: 'No such address. Next: /api/board.' });
  if (env.ASSETS === undefined) return json(503, { error: 'The pages are not built. Next: node packages/box-platform/local.mjs.' });
  // Any /b/<something>/ gets the same shell, so the shell says nothing about whether it exists.
  if (/^\/b\/[^/]+\/?$/.test(url.pathname)) return env.ASSETS.fetch(new Request(new URL('/b/', url), request));
  const profile = /^\/(solver|owner)\/[^/]+\/?$/.exec(url.pathname);
  if (profile !== null) return env.ASSETS.fetch(new Request(new URL(`/${profile[1]}/`, url), request));
  return env.ASSETS.fetch(request);
}
