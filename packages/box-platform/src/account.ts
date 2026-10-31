// Everything that knows who is asking: sign-in, sessions, profiles, and the one
// answer that may carry an owner-only method. The feed, MCP and RSS never come here.
import type { Env } from './github.js';
import { checkMethod, isLink, MAX_METHODS, type Method, parseStored, publicOnly } from './methods.js';
import { readBounty } from './query.js';
import { LOGIN } from './refresh.js';
import { currentReceipt, ownerOnlyAllowed, type PaidEvent, payeeOf, type PaymentFacts, type Receipt, roleOf, standingRecord } from './visibility.js';

const SESSION_COOKIE = '__Host-board_session';
const STATE_COOKIE = '__Host-board_oauth_state';
const SESSION_DAYS = 30;
const DAY_SECONDS = 86400;
const BODY_BYTES_MAX = 16_384;
const LIST_MAX = 50;

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers }
});
const redirect = (to: string, cookies: readonly string[] = []): Response => {
  const headers = new Headers({ location: to, 'cache-control': 'no-store' });
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(null, { status: 302, headers });
};
const cookie = (name: string, value: string, maxAge: number): string => `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
const cookieOf = (request: Request, name: string): string | null => {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return null;
};

const randomToken = (): string => [...crypto.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, '0')).join('');
async function hashOf(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

type Viewer = { github_id: number; login: string };

async function viewerOf(request: Request, env: Env, now: number): Promise<Viewer | null> {
  const token = cookieOf(request, SESSION_COOKIE);
  if (token === null) return null;
  return env.DB.prepare('SELECT github_id, login FROM sessions WHERE token_hash = ? AND expires_at > ?').bind(await hashOf(token), now).first<Viewer>();
}

/** Every write: from this site's own page, as JSON, small. A missing Origin is refused too. */
function writeRefusal(request: Request, url: URL, needsBody: boolean): Response | null {
  if (request.headers.get('origin') !== url.origin) return json(403, { error: 'This request did not come from the board\'s own page. Next: use the page.' });
  if (needsBody && !/^application\/json\b/i.test(request.headers.get('content-type') ?? '')) return json(415, { error: 'Send JSON. Next: use the page.' });
  return null;
}
const SIGN_IN_FIRST = { error: 'You are not signed in. Next: sign in at /sign-in/.' };

async function readBody(request: Request): Promise<{ value: unknown } | { refused: Response }> {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > BODY_BYTES_MAX) return { refused: json(413, { error: `At most ${BODY_BYTES_MAX} bytes. Next: send less.` }) };
  try { return { value: JSON.parse(text) }; } catch { return { refused: json(400, { error: 'That is not JSON. Next: use the page.' }) }; }
}

function startSignIn(env: Env, url: URL): Response {
  if (env.GITHUB_OAUTH_CLIENT_ID === undefined || env.GITHUB_OAUTH_CLIENT_SECRET === undefined) return redirect('/sign-in/?error=not-set-up');
  const state = randomToken();
  // No scope parameter: GitHub grants public information only.
  const to = new URL('/login/oauth/authorize', env.GITHUB_WEB ?? 'https://github.com');
  to.searchParams.set('client_id', env.GITHUB_OAUTH_CLIENT_ID);
  to.searchParams.set('redirect_uri', `${url.origin}/auth/github/callback`);
  to.searchParams.set('state', state);
  return redirect(to.href, [cookie(STATE_COOKIE, state, 600)]);
}

/** The token is held only in this function's locals: exchanged, used once, dropped. */
async function identityFrom(env: Env, code: string, redirectUri: string): Promise<Viewer | null> {
  const signal = AbortSignal.timeout(15000);
  const web = env.GITHUB_WEB ?? 'https://github.com';
  const exchanged = await fetch(`${web}/login/oauth/access_token`, {
    method: 'POST', signal,
    headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'open-bounty-board' },
    body: JSON.stringify({ client_id: env.GITHUB_OAUTH_CLIENT_ID, client_secret: env.GITHUB_OAUTH_CLIENT_SECRET, code, redirect_uri: redirectUri })
  });
  if (!exchanged.ok) return null;
  const token = (await exchanged.json() as { access_token?: unknown }).access_token;
  if (typeof token !== 'string') return null;
  const user = await fetch(`${env.GITHUB_API ?? 'https://api.github.com'}/user`, { signal, headers: { accept: 'application/vnd.github+json', 'user-agent': 'open-bounty-board', authorization: `Bearer ${token}` } });
  if (!user.ok) return null;
  const { id, login } = await user.json() as { id?: unknown; login?: unknown };
  return Number.isSafeInteger(id) && typeof login === 'string' && LOGIN.test(login) ? { github_id: id as number, login } : null;
}

async function finishSignIn(request: Request, env: Env, url: URL, now: number): Promise<Response> {
  const clearState = cookie(STATE_COOKIE, '', 0);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (state === null || code === null || state !== cookieOf(request, STATE_COOKIE)) return redirect('/sign-in/?error=try-again', [clearState]);
  let identity: Viewer | null = null;
  try { identity = await identityFrom(env, code, `${url.origin}/auth/github/callback`); } catch { identity = null; }
  if (identity === null) return redirect('/sign-in/?error=github', [clearState]);
  const { github_id, login } = identity;
  const db = env.DB;
  // A login that changed hands: what the earlier holder published is not this person's.
  await db.prepare('DELETE FROM methods WHERE login = ? COLLATE NOCASE AND github_id != ?').bind(login, github_id).run();
  await db.prepare('UPDATE methods SET login = ? WHERE github_id = ?').bind(login, github_id).run();
  await db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now).run();
  const token = randomToken();
  await db.prepare('INSERT INTO sessions (token_hash, github_id, login, expires_at) VALUES (?, ?, ?, ?)').bind(await hashOf(token), github_id, login, now + SESSION_DAYS * DAY_SECONDS * 1000).run();
  return redirect('/me/', [clearState, cookie(SESSION_COOKIE, token, SESSION_DAYS * DAY_SECONDS)]);
}

async function signOut(request: Request, env: Env): Promise<Response> {
  const token = cookieOf(request, SESSION_COOKIE);
  if (token !== null) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hashOf(token)).run();
  return json(200, { signed_in: false }, { 'set-cookie': cookie(SESSION_COOKIE, '', 0) });
}

const METHOD_COLUMNS = 'kind, value, chain, visibility';
const methodsOfLogin = async (env: Env, login: string): Promise<Method[]> =>
  parseStored((await env.DB.prepare(`SELECT ${METHOD_COLUMNS} FROM methods WHERE login = ? COLLATE NOCASE ORDER BY position`).bind(login).all()).results);
const shown = (method: Method) => ({ ...method, link: isLink(method) });

async function saveMethods(request: Request, env: Env, viewer: Viewer): Promise<Response> {
  const body = await readBody(request);
  if ('refused' in body) return body.refused;
  const list = (body.value as { methods?: unknown } | null)?.methods;
  if (!Array.isArray(list)) return json(400, { error: 'Send the list of methods. Next: use the page.' });
  if (list.length > MAX_METHODS) return json(400, { error: `At most ${MAX_METHODS} methods. Next: remove one.` });
  const methods: Method[] = [];
  for (const [index, input] of list.entries()) {
    const checked = checkMethod(input);
    if ('error' in checked) return json(400, { error: checked.error, index });
    methods.push(checked);
  }
  await env.DB.prepare('DELETE FROM methods WHERE github_id = ?').bind(viewer.github_id).run();
  for (const [position, method] of methods.entries()) {
    await env.DB.prepare('INSERT INTO methods (github_id, login, position, kind, value, chain, visibility) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(viewer.github_id, viewer.login, position, method.kind, method.value, method.chain, method.visibility).run();
  }
  return json(200, { login: viewer.login, methods: methods.map(shown) });
}

type ProfileRow = { id: string; title: string; amount: number; repository: string; merged_at?: string; number?: number; issue_state?: string };

async function solverProfile(env: Env, login: string): Promise<Response> {
  const merged = await env.DB.prepare(`SELECT b.id, b.title, b.amount, b.repository, p.merged_at, p.number FROM pull_requests p JOIN bounties b ON b.id = p.bounty_id
    WHERE p.author = ? COLLATE NOCASE AND p.state = 'merged' ORDER BY p.merged_at DESC, b.id LIMIT ?`).bind(login, LIST_MAX).all<ProfileRow>();
  return json(200, { login, methods: publicOnly(await methodsOfLogin(env, login)).map(shown), merged: merged.results });
}

async function ownerProfile(env: Env, login: string): Promise<Response> {
  const bounties = await env.DB.prepare(`SELECT b.id, b.title, b.amount, b.repository, b.issue_state FROM bounties b WHERE b.poster = ? COLLATE NOCASE ORDER BY b.created_at DESC, b.id LIMIT ?`).bind(login, LIST_MAX).all<ProfileRow>();
  return json(200, { login, bounties: bounties.results });
}

async function paymentFacts(env: Env, id: string, now: number): Promise<PaymentFacts | null> {
  const read = await readBounty(env, id, now);
  if (read === null) return null;
  const paid = (await env.DB.prepare(`SELECT at, amount, withdrawn FROM events WHERE bounty_id = ? AND type = 'paid'`).bind(id).all<PaidEvent>()).results;
  const merged = read.pulls.filter(pull => pull.state === 'merged').map(pull => ({ number: pull.number, author: pull.author }));
  const record = standingRecord(paid);
  const stored = await env.DB.prepare('SELECT says, record_at, at FROM receipts WHERE bounty_id = ?').bind(id).first<Receipt>();
  return { amount: read.row.amount, poster: read.row.poster, merged, record, receipt: currentReceipt(record, stored) };
}

const ask = (author: string, number: number) => `Next: ask on pull request #${number} how ${author} wants to be paid.`;

/** Every merged author's methods, as this viewer may see them. */
async function paymentView(env: Env, id: string, viewer: Viewer | null, now: number): Promise<Response> {
  const facts = await paymentFacts(env, id, now);
  if (facts === null) return json(404, { error: 'This bounty is not on the board. Next: search the board.' });
  const login = viewer?.login ?? null;
  const role = roleOf(facts, login);
  const payee = payeeOf(facts);
  const payees = facts.amount > 0 ? await Promise.all(facts.merged.map(async ({ author, number }) => {
    const all = await methodsOfLogin(env, author);
    const methods = (author === payee && ownerOnlyAllowed(facts, login) ? all : publicOnly(all)).map(shown);
    return { login: author, methods, next: methods.length === 0 ? ask(author, number) : null };
  })) : [];
  const concerned = role !== 'other';
  return json(200, {
    viewer: login, role, payee, payees,
    recorded: facts.record === null ? null : { at: facts.record.at, amount: facts.record.amount },
    owner_only_hidden: role === 'owner' && payee !== null && !ownerOnlyAllowed(facts, login),
    receipt: concerned ? facts.receipt : null,
    can_answer: role === 'payee' && facts.record !== null
  });
}

const ANSWERS: readonly unknown[] = ['received', 'not-received', null];

async function answerReceipt(request: Request, env: Env, id: string, viewer: Viewer, now: number): Promise<Response> {
  const body = await readBody(request);
  if ('refused' in body) return body.refused;
  const says = (body.value as { says?: unknown } | null)?.says;
  if (!ANSWERS.includes(says)) return json(400, { error: 'Say received, not-received or null to withdraw. Next: use the page.' });
  const facts = await paymentFacts(env, id, now);
  if (facts === null) return json(404, { error: 'This bounty is not on the board. Next: search the board.' });
  if (roleOf(facts, viewer.login) !== 'payee') return json(403, { error: 'Only the author of the merged solution can answer this. Nothing changed.' });
  if (facts.record === null) return json(409, { error: 'No payment is recorded on this bounty. Nothing to answer. Next: nothing to do until the owner records one.' });
  await env.DB.prepare('DELETE FROM receipts WHERE bounty_id = ?').bind(id).run();
  if (says !== null) await env.DB.prepare('INSERT INTO receipts (bounty_id, payee, says, record_at, at) VALUES (?, ?, ?, ?, ?)').bind(id, viewer.login, says as string, facts.record.at, new Date(now).toISOString()).run();
  return paymentView(env, id, viewer, now);
}

const loginFrom = (text: string): string | null => {
  try { const login = decodeURIComponent(text); return LOGIN.test(login) && login.length <= 60 ? login : null; } catch { return null; }
};

/** The routes that know who is asking, or null for every other address. */
export async function accountResponse(request: Request, env: Env, url: URL, now: number): Promise<Response | null> {
  const { pathname: path } = url;
  const { method } = request;
  if (method === 'GET' && path === '/auth/github') return startSignIn(env, url);
  if (method === 'GET' && path === '/auth/github/callback') return finishSignIn(request, env, url, now);
  if (method === 'POST' && path === '/auth/sign-out') return writeRefusal(request, url, false) ?? signOut(request, env);
  if (method === 'GET' && path === '/api/me') {
    const viewer = await viewerOf(request, env, now);
    if (viewer === null) return json(200, { signed_in: false });
    return json(200, { signed_in: true, login: viewer.login, methods: (await methodsOfLogin(env, viewer.login)).map(shown) });
  }
  if (method === 'PUT' && path === '/api/me/methods') {
    const refusal = writeRefusal(request, url, true);
    if (refusal !== null) return refusal;
    const viewer = await viewerOf(request, env, now);
    return viewer === null ? json(401, SIGN_IN_FIRST) : saveMethods(request, env, viewer);
  }
  const person = /^\/api\/(solver|owner)\/([^/]+)$/.exec(path);
  if (method === 'GET' && person !== null) {
    const login = loginFrom(person[2]!);
    if (login === null) return json(404, { error: 'That is not a GitHub login. Next: check the address.' });
    return person[1] === 'solver' ? solverProfile(env, login) : ownerProfile(env, login);
  }
  const payment = /^\/api\/b\/(bt-[a-f\d]{12})\/(payment|receipt)$/.exec(path);
  if (payment !== null) {
    const id = payment[1]!;
    if (method === 'GET' && payment[2] === 'payment') return paymentView(env, id, await viewerOf(request, env, now), now);
    if (method === 'POST' && payment[2] === 'receipt') {
      const refusal = writeRefusal(request, url, true);
      if (refusal !== null) return refusal;
      const viewer = await viewerOf(request, env, now);
      return viewer === null ? json(401, SIGN_IN_FIRST) : answerReceipt(request, env, id, viewer, now);
    }
  }
  return null;
}
