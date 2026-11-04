// Everything that knows who is asking: sign-in, sessions, profiles, and the one
// answer that may carry an owner-only method. The feed, MCP and RSS never come here.
import { authenticationPage, openPayPage, payOffer, readPayPage } from './charge.js';
import type { Env } from './github.js';
import { finishOrder, openPayPalPage, paypalOffer } from './paypal-pay.js';
import { loginAddress, payerFrom, paypalOn, PayPalUnavailable } from './paypal.js';
import { errorWords, redact, stripe, stripeOn, StripeUnavailable } from './stripe.js';
import { checkMethod, isLink, MAX_METHODS, type Method, parseStored, publicOnly } from './methods.js';
import { waysSetUp } from './pay-ways.js';
import { type BountyPayment, emptyPayment, factsOf, landedOf, loadPayments, notCounted, notCountedOf, ownerRecord, paymentOf, solverRecord } from './payments.js';
import { FROM_LISTED, readBounty, stateOf } from './query.js';
import { LOGIN } from './refresh.js';
import { ownerOnlyAllowed, payeeOf, roleOf, same } from './visibility.js';

const SESSION_COOKIE = '__Host-board_session';
const STATE_COOKIE = '__Host-board_oauth_state';
const PAYPAL_STATE_COOKIE = '__Host-board_paypal_state';
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
  // Stripe accounts, cards and switches hang on the GitHub id, so a login changing hands reaches none of them.
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
  const inputs = await loadPayments(env.DB, `EXISTS (SELECT 1 FROM pull_requests p WHERE p.bounty_id = b.id AND p.state = 'merged' AND p.author = ? COLLATE NOCASE)`, login);
  const listed = merged.results.map(row => {
    const input = inputs.find(entry => entry.id === row.id);
    const mine = input === undefined ? undefined : landedOf(input).find(pull => same(pull.author, login));
    const counted = input !== undefined && mine !== undefined && notCounted(mine, input.poster) === null;
    const payment = input === undefined ? null : paymentOf(input);
    return { ...row, counted, payment_state: payment !== null && same(payment.owed?.to ?? null, login) ? payment.state : null };
  });
  const methods = await methodsOfLogin(env, login);
  const open = publicOnly(methods);
  // How many are held back, never what they are: the tool's owner message says where to see them.
  return json(200, { login, record: solverRecord(login, inputs), methods: open.map(shown), methods_more: methods.length - open.length, merged: listed, ways_set_up: waysSetUp({ stripe: stripeOn(env), paypal: paypalOn(env) }), takes: await takesOf(env, login) });
}

/** Whether someone who has answered a bounty has connected an account: two facts, no account detail. Null: the board knows no pull request of theirs, so it cannot say. */
async function takesOf(env: Env, login: string): Promise<{ stripe: boolean; paypal: boolean } | null> {
  const row = await env.DB.prepare(`SELECT (SELECT ready FROM stripe_accounts s WHERE s.github_id = p.author_id) AS stripe, (SELECT 1 FROM paypal_accounts a WHERE a.github_id = p.author_id) AS paypal
    FROM pull_requests p WHERE p.author = ? COLLATE NOCASE AND p.author_id IS NOT NULL LIMIT 1`).bind(login).first<{ stripe: number | null; paypal: number | null }>();
  return row === null ? null : { stripe: row.stripe === 1, paypal: row.paypal === 1 };
}

async function ownerProfile(env: Env, login: string, now: number): Promise<Response> {
  const bounties = await env.DB.prepare(`SELECT b.id, b.title, b.amount, b.repository, b.issue_state FROM bounties b WHERE b.poster = ? COLLATE NOCASE ORDER BY b.created_at DESC, b.id LIMIT ?`).bind(login, LIST_MAX).all<ProfileRow>();
  const inputs = await loadPayments(env.DB, 'b.poster = ? COLLATE NOCASE', login);
  const states = new Map(inputs.map(input => [input.id, paymentOf(input)]));
  const listed = bounties.results.map(row => ({ ...row, payment_state: states.get(row.id)?.state ?? null, not_counted: (states.get(row.id)?.excluded_from_counts ?? null) !== null }));
  return json(200, { login, record: ownerRecord(inputs, now), not_counted: notCountedOf(inputs), bounties: listed });
}

const OWING = new Set(['owed', 'owner-decides']);
const byProvider = (record: unknown): boolean => ['stripe', 'paypal'].includes((record as { source?: string } | null)?.source ?? '');

/** What the signed-in person owes and is owed, by the same facts as each bounty's page. Whom, how much, since when; never a method. Read at render, so a repository gone private leaves. */
async function debtRows(env: Env, login: string, now: number, where: string, mine: (input: BountyPayment, payment: ReturnType<typeof paymentOf>) => boolean) {
  const rows: { id: string; title: string; amount: number; since: string; to: string | null; from: string; to_one_of?: readonly string[] }[] = [];
  for (const input of await loadPayments(env.DB, where, login)) {
    const payment = paymentOf(input);
    if (!OWING.has(payment.state) || payment.owed === null || !mine(input, payment) || rows.length >= LIST_MAX) continue;
    if (await readBounty(env, input.id, now) === null) continue;
    const { to, amount, since } = payment.owed;
    rows.push({ id: input.id, title: input.title, amount, since, to, from: input.poster, ...('to_one_of' in payment.owed ? { to_one_of: payment.owed.to_one_of } : {}) });
  }
  return rows;
}

/** PF31: payments recorded to this solver and not yet confirmed received: they stay on the solver's page until confirmed. */
async function toConfirm(env: Env, login: string, now: number) {
  const rows: { id: string; title: string; amount: number; from: string; at: string; by: string; number: number | null }[] = [];
  for (const input of await loadPayments(env.DB, `EXISTS (SELECT 1 FROM pull_requests p WHERE p.bounty_id = b.id AND p.state = 'merged' AND p.author = ? COLLATE NOCASE)`, login)) {
    const payment = paymentOf(input);
    if ((payment.state !== 'recorded' && payment.state !== 'says-not-received') || payment.recorded_paid === null || byProvider(payment.recorded_paid) || payment.owed === null || !same(payment.owed.to, login) || same(input.poster, login) || rows.length >= LIST_MAX) continue;
    if (await readBounty(env, input.id, now) === null) continue;
    rows.push({ id: input.id, title: input.title, amount: payment.owed.amount, from: input.poster, at: payment.recorded_paid.at, by: payment.recorded_paid.by, number: landedOf(input).find(pull => same(pull.author, login))?.number ?? null });
  }
  return rows;
}

const youOwe = (env: Env, login: string, now: number) => debtRows(env, login, now, 'b.poster = ? COLLATE NOCASE', (_input, payment) => !same(payment.owed!.to, login));

async function debtsOf(env: Env, login: string, now: number) {
  const lists = (where: string, mine: (input: BountyPayment, payment: ReturnType<typeof paymentOf>) => boolean) => debtRows(env, login, now, where, mine);
  return {
    you_owe: await youOwe(env, login, now),
    to_confirm: await toConfirm(env, login, now),
    owed_to_you: await lists(`EXISTS (SELECT 1 FROM pull_requests p WHERE p.bounty_id = b.id AND p.state = 'merged' AND p.author = ? COLLATE NOCASE)`, (input, payment) => !same(input.poster, login) && landedOf(input).some(pull => same(pull.author, login)) && (payment.owed!.to === null || same(payment.owed!.to, login)))
  };
}

const OWN_MAX = 200;
// A charge that failed on the card: the owner's card, so the owner's to fix. Said in red on their page.
const CARD_FAILED = new Set(['declined', 'stripe-refused', 'owner-must-authenticate']);
type OwnRow = { id: string; title: string; repository: string; issue_number: number; issue_state: string; amount: number; created_at: string; solutions: number };

/** How a recorded payment was made, in the words of whoever made it (PF21). A Stripe charge with a saved card is pay on merge. */
const paidBy = (source: string, savedCard: boolean): string =>
  source === 'stripe' ? (savedCard ? 'Pay on merge' : 'Stripe, one click') : source === 'paypal' ? 'PayPal, one click' : 'Recorded by you';

/**
 * Every bounty GitHub says this person opened (the issue's author id, never a typed name), newest first, each in the
 * stage its facts put it (PF21): waiting, solutions, due, paid or closed. Due holds only what waits on the owner: a bounty
 * pay on merge pays goes from merged to paid, and is due only when the charge did not go through. Listed repositories only.
 */
async function bountiesOf(env: Env, viewer: Viewer, now: number) {
  const read = (await env.DB.prepare(`SELECT b.id, b.title, b.repository, b.issue_number, b.issue_state, b.amount, b.created_at,
      (SELECT COUNT(*) FROM pull_requests p WHERE p.bounty_id = b.id) AS solutions
    ${FROM_LISTED} WHERE b.poster_id = ? ORDER BY b.created_at DESC, b.id LIMIT ?`).bind(viewer.github_id, OWN_MAX + 1).all<OwnRow>()).results;
  // The private rule at render, once per repository: one gone private leaves with all its bounties, as the debts do.
  const gone = new Set<string>();
  for (const repository of new Set(read.map(row => row.repository.toLowerCase()))) {
    if (await readBounty(env, read.find(row => row.repository.toLowerCase() === repository)!.id, now) === null) gone.add(repository);
  }
  const rows = read.filter(row => !gone.has(row.repository.toLowerCase()));
  const pulls = (await env.DB.prepare('SELECT p.bounty_id, p.state FROM pull_requests p JOIN bounties b ON b.id = p.bounty_id WHERE b.poster_id = ?').bind(viewer.github_id).all<{ bounty_id: string; state: string }>()).results;
  const inputs = new Map((await loadPayments(env.DB, 'b.poster_id = ?', viewer.github_id)).map(input => [input.id, input]));
  const savedCard = new Set((await env.DB.prepare('SELECT c.bounty_id FROM charges c JOIN bounties b ON b.id = c.bounty_id WHERE b.poster_id = ? AND c.payment_method IS NOT NULL').bind(viewer.github_id).all<{ bounty_id: string }>()).results.map(row => row.bounty_id));
  const payOn = new Set((await env.DB.prepare('SELECT repository FROM pay_repositories WHERE github_id = ?').bind(viewer.github_id).all<{ repository: string }>()).results.map(row => row.repository.toLowerCase()));
  const list = rows.slice(0, OWN_MAX).map(row => {
    const base = { id: row.id, title: row.title, repository: row.repository, issue_number: row.issue_number, created_at: row.created_at, reward: row.amount, solutions: row.solutions };
    const input = inputs.get(row.id);
    if (input === undefined) {
      const state = stateOf(row.issue_state, pulls.filter(pull => pull.bounty_id === row.id));
      return { ...base, stage: state === 'closed-none' ? 'closed' : state === 'solutions-waiting' ? 'solutions' : 'waiting' };
    }
    const payment = paymentOf(input);
    const charge = payment.charge !== null && payment.charge.state !== 'looked' ? payment.charge : null;
    if (payment.state === 'owed' || payment.state === 'owner-decides') {
      const note = charge?.words ?? (payment.state === 'owner-decides' ? 'More than one solution was merged. You choose whom to pay.' : !stripeOn(env) || payOn.has(row.repository.toLowerCase()) ? null : 'Pay on merge is off for this repository.');
      return { ...base, stage: 'due', merged: payment.owed!.to, merged_one_of: payment.owed!.to === null ? (payment.owed as { to_one_of?: readonly string[] }).to_one_of ?? [] : undefined, note, card_failed: charge !== null && CARD_FAILED.has(charge.state) };
    }
    if (payment.state === 'recorded' || payment.state === 'confirmed' || payment.state === 'says-not-received') {
      return { ...base, stage: 'paid', merged: payment.owed!.to, paid_by: paidBy(payment.recorded_paid!.source, savedCard.has(row.id)), note: payment.state === 'says-not-received' ? 'The solver says it has not arrived.' : null };
    }
    if (payment.state === 'no-reward') return { ...base, stage: 'paid', merged: landedOf(input)[0]?.author ?? null, paid_by: null, note: 'No reward was stated.' };
    return { ...base, stage: 'solutions', note: payment.state === 'merged-not-on-default' ? 'Merged. The board has not yet confirmed it on the default branch.' : null };
  });
  return { list, more: read.length > OWN_MAX };
}

async function paymentInput(env: Env, id: string, now: number): Promise<BountyPayment | null> {
  const read = await readBounty(env, id, now);
  if (read === null) return null;
  return (await loadPayments(env.DB, 'b.id = ?', id))[0] ?? emptyPayment(read.row);
}

const ask = (author: string, number: number) => `Next: ask on pull request #${number} how ${author} wants to be paid.`;
const NOT_ON_BOARD = { error: 'This bounty is not on the board. Next: search the board.' };

/** The GitHub id, not the login: a login can change hands, and this spends money. */
const isPoster = async (env: Env, id: string, viewer: Viewer): Promise<boolean> =>
  (await env.DB.prepare('SELECT poster_id FROM bounties WHERE id = ?').bind(id).first<{ poster_id: number | null }>())?.poster_id === viewer.github_id;

/** What the poster may click, across the providers. A note only when no click is offered. */
async function offers(env: Env, id: string, viewer: Viewer) {
  const stripeOffer = await payOffer(env, id, viewer.github_id);
  const { can_pay_paypal, note } = await paypalOffer(env, id, viewer.github_id);
  return { can_pay: stripeOffer.can_pay, can_pay_paypal, pay_note: stripeOffer.can_pay || can_pay_paypal ? null : [stripeOffer.pay_note, note].filter(Boolean).join(' ') || null };
}

/** The public payment facts, and every merged author's methods as this viewer may see them. */
async function paymentView(env: Env, id: string, viewer: Viewer | null, now: number): Promise<Response> {
  if (viewer !== null) {
    // Stripe not answering leaves the page as it stands; the webhook still comes.
    try { await readPayPage(env, id, viewer.github_id, now); } catch (error) { if (!(error instanceof StripeUnavailable)) throw error; }
    try { if (paypalOn(env) && await isPoster(env, id, viewer)) await finishOrder(env, id, now); } catch (error) { if (!(error instanceof PayPalUnavailable)) throw error; }
  }
  const input = await paymentInput(env, id, now);
  if (input === null) return json(404, NOT_ON_BOARD);
  const facts = factsOf(input);
  const login = viewer?.login ?? null;
  const role = roleOf(facts, login);
  const payee = payeeOf(facts);
  const payees = facts.amount > 0 ? await Promise.all(facts.merged.map(async ({ author, number }) => {
    const all = await methodsOfLogin(env, author);
    const methods = (author === payee && ownerOnlyAllowed(facts, login) ? all : publicOnly(all)).map(shown);
    // Once a payment is recorded, asking how to be paid is no longer the next step (PF19).
    return { login: author, number, methods, next: methods.length === 0 && facts.record === null ? ask(author, number) : null };
  })) : [];
  // PF31: a Stripe payment from the owner's saved card is pay on merge; from Stripe's page, one click. Said apart on the page.
  const onMerge = (await env.DB.prepare('SELECT 1 AS yes FROM charges WHERE bounty_id = ? AND payment_method IS NOT NULL').bind(id).first()) !== null;
  return json(200, {
    viewer: login, role, payee, payees, on_merge: onMerge,
    payment: paymentOf(input),
    recorded: facts.record === null ? null : { at: facts.record.at, amount: facts.record.amount },
    owner_only_hidden: role === 'owner' && payee !== null && !ownerOnlyAllowed(facts, login),
    receipt: facts.receipt,
    // PF31b: only a payment the owner recorded by hand asks the solver; Stripe's or PayPal's word is the record itself.
    can_answer: role === 'payee' && facts.record !== null && !byProvider(facts.record),
    can_record: role === 'owner' && facts.amount > 0 && facts.merged.length > 0 && facts.record === null,
    can_withdraw: role === 'owner' && facts.record !== null && !byProvider(facts.record),
    can_authenticate: role === 'owner' && input.charge?.state === 'owner-must-authenticate',
    ...(role === 'owner' ? await offers(env, id, viewer!) : { can_pay: false, can_pay_paypal: false, pay_note: null })
  });
}

/** The owner's click, or its withdrawal. Only the issue's author; the amount is the bounty's; the same click twice changes nothing. */
async function recordPaid(request: Request, env: Env, id: string, viewer: Viewer, now: number): Promise<Response> {
  const body = await readBody(request);
  if ('refused' in body) return body.refused;
  const sent = (body.value ?? {}) as { to?: unknown; withdraw?: unknown };
  const input = await paymentInput(env, id, now);
  if (input === null) return json(404, NOT_ON_BOARD);
  const facts = factsOf(input);
  if (roleOf(facts, viewer.login) !== 'owner') return json(403, { error: 'Only the poster of this bounty can record its payment. Nothing changed.' });
  const at = new Date(now).toISOString();
  const save = (to: string | null, amount: number | null, withdrawn: number) => env.DB.prepare(`INSERT INTO paid_clicks (bounty_id, by_login, to_login, amount, withdrawn, at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (bounty_id) DO UPDATE SET by_login = excluded.by_login, to_login = excluded.to_login, amount = excluded.amount, withdrawn = excluded.withdrawn, at = excluded.at`)
    .bind(id, viewer.login, to, amount, withdrawn, at).run();
  if (byProvider(facts.record)) return json(409, { error: `${(facts.record as unknown as { by: string }).by} made this payment, so there is no record of yours to change. Nothing changed.` });
  if (sent.withdraw === true) {
    if (facts.record !== null) {
      await save(null, null, 1);
      await env.DB.prepare('DELETE FROM receipts WHERE bounty_id = ?').bind(id).run();
    }
    return paymentView(env, id, viewer, now);
  }
  if (facts.amount === 0 || facts.merged.length === 0) return json(409, { error: 'Nothing is owed on this bounty, so there is nothing to record. Nothing changed.' });
  const named = typeof sent.to === 'string' ? facts.merged.find(pull => same(pull.author, sent.to as string))?.author : facts.merged.length === 1 ? facts.merged[0]!.author : undefined;
  if (named === undefined) return json(400, { error: `Name one merged author: ${facts.merged.map(pull => pull.author).join(' or ')}. Nothing changed.` });
  if (facts.record !== null) {
    if (same(payeeOf(facts), named)) return paymentView(env, id, viewer, now);
    return json(409, { error: 'A payment to someone else is already recorded. Nothing changed. Next: withdraw that record first.' });
  }
  await save(named, facts.amount, 0);
  return paymentView(env, id, viewer, now);
}

const ANSWERS: readonly unknown[] = ['received', 'not-received', null];

async function answerReceipt(request: Request, env: Env, id: string, viewer: Viewer, now: number): Promise<Response> {
  const body = await readBody(request);
  if ('refused' in body) return body.refused;
  const says = (body.value as { says?: unknown } | null)?.says;
  if (!ANSWERS.includes(says)) return json(400, { error: 'Say received, not-received or null to withdraw. Next: use the page.' });
  const input = await paymentInput(env, id, now);
  if (input === null) return json(404, NOT_ON_BOARD);
  const facts = factsOf(input);
  if (roleOf(facts, viewer.login) !== 'payee') return json(403, { error: 'Only the author of the merged solution can answer this. Nothing changed.' });
  if (facts.record === null) return json(409, { error: 'No payment is recorded on this bounty. Nothing to answer. Next: nothing to do until the owner records one.' });
  await env.DB.prepare('DELETE FROM receipts WHERE bounty_id = ?').bind(id).run();
  if (says !== null) await env.DB.prepare('INSERT INTO receipts (bounty_id, payee, says, record_at, at) VALUES (?, ?, ?, ?, ?)').bind(id, viewer.login, says as string, facts.record.at, new Date(now).toISOString()).run();
  return paymentView(env, id, viewer, now);
}

// ---- pay on merge: the solver's account, the owner's card, limit and switch (PF11) ----

const NOT_SET_UP = { error: 'Pay on merge is not set up on this board. Nothing changed. Next: use the other ways to pay on this page.' };
const COUNTRY = /^[A-Z]{2}$/;
const REPOSITORY = /^[A-Za-z\d-]{1,39}\/[A-Za-z\d._-]{1,100}$/;
const SWITCHES_MAX = 50;

/** What this person has set up, for their own page only. Never an id of Stripe's. */
async function payOf(env: Env, viewer: Viewer) {
  if (!stripeOn(env)) return { set_up: false };
  const solver = await env.DB.prepare('SELECT ready FROM stripe_accounts WHERE github_id = ?').bind(viewer.github_id).first<{ ready: number }>();
  const owner = await env.DB.prepare('SELECT payment_method, card_label, limit_per_bounty FROM pay_settings WHERE github_id = ?').bind(viewer.github_id).first<{ payment_method: string | null; card_label: string | null; limit_per_bounty: number | null }>();
  // Each repository's own limit (PF19); a row from before PF19's migration falls back to the owner's one limit.
  const on = (await env.DB.prepare('SELECT r.repository, r.on_at, COALESCE(r.limit_per_bounty, s.limit_per_bounty) AS "limit" FROM pay_repositories r LEFT JOIN pay_settings s ON s.github_id = r.github_id WHERE r.github_id = ? ORDER BY r.repository').bind(viewer.github_id).all<{ repository: string; on_at: string; limit: number | null }>()).results;
  // The repositories pay on merge can act on: where GitHub says this person opened bounty issues (PF20). Nothing typed,
  // so nothing to verify by hand. Each with its open bounties and the reward its latest bounty states.
  const mine = (await env.DB.prepare(`SELECT b.repository, SUM(CASE WHEN b.issue_state = 'open' THEN 1 ELSE 0 END) AS open,
      (SELECT x.amount FROM bounties x WHERE x.poster_id = b.poster_id AND x.repository = b.repository ORDER BY x.created_at DESC LIMIT 1) AS reward
    FROM bounties b WHERE b.poster_id = ? GROUP BY b.repository ORDER BY open DESC, b.repository LIMIT 50`).bind(viewer.github_id).all<{ repository: string; open: number; reward: number }>()).results;
  const openIn = new Map(mine.map(entry => [entry.repository.toLowerCase(), entry.open]));
  return {
    set_up: true, solver: { connected: solver !== null, ready: solver?.ready === 1 }, card: owner?.payment_method == null ? null : owner.card_label ?? 'a saved card', limit: owner?.limit_per_bounty ?? null,
    repositories: on.map(entry => ({ ...entry, open: openIn.get(entry.repository.toLowerCase()) ?? 0 })),
    yours: mine.map(entry => ({ repository: entry.repository, open: entry.open, reward: entry.reward }))
  };
}

/** The solver's "Connect Stripe": their own account, in the setup that costs the platform nothing, and Stripe's own page. */
async function connectStripe(request: Request, env: Env, url: URL, viewer: Viewer): Promise<Response> {
  const body = await readBody(request);
  if ('refused' in body) return body.refused;
  let held = await env.DB.prepare('SELECT account_id FROM stripe_accounts WHERE github_id = ?').bind(viewer.github_id).first<{ account_id: string }>();
  if (held === null) {
    const country = (body.value as { country?: unknown } | null)?.country;
    if (typeof country !== 'string' || !COUNTRY.test(country)) return json(400, { error: 'Say which country your bank account is in. Next: choose it on the page.' });
    // Accounts v2 (PF18): a new platform's v1 call is refused. Every other call stays v1, which Stripe keeps working on these accounts.
    const made = await stripe(env, 'POST', '/v2/core/accounts', undefined, {
      idempotency: `pf18/connect/${viewer.github_id}/${country}`,
      json: {
        dashboard: 'full', identity: { country: country.toLowerCase() }, metadata: { github_id: String(viewer.github_id) },
        configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
        defaults: { responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' } }
      }
    });
    if (made.status !== 200 || typeof made.json['id'] !== 'string') return json(409, { error: `${errorWords(made)} Nothing changed. Next: list another way to be paid below.` });
    held = { account_id: made.json['id'] };
    await env.DB.prepare('INSERT INTO stripe_accounts (github_id, account_id) VALUES (?, ?)').bind(viewer.github_id, held.account_id).run();
  }
  const link = await stripe(env, 'POST', '/v1/account_links', { account: held.account_id, type: 'account_onboarding', refresh_url: `${url.origin}/me/`, return_url: `${url.origin}/me/` });
  if (link.status !== 200 || typeof link.json['url'] !== 'string') return json(409, { error: `${errorWords(link)} Next: try again.` });
  return json(200, { url: link.json['url'] });
}

/** Back from Stripe's page: read whether Stripe now says the account can take charges. */
async function readReady(env: Env, viewer: Viewer): Promise<void> {
  const held = await env.DB.prepare('SELECT account_id FROM stripe_accounts WHERE github_id = ?').bind(viewer.github_id).first<{ account_id: string }>();
  if (held === null) return;
  const about = await stripe(env, 'GET', `/v1/accounts/${held.account_id}`);
  if (about.status === 200) await env.DB.prepare('UPDATE stripe_accounts SET ready = ? WHERE github_id = ?').bind(about.json['charges_enabled'] === true ? 1 : 0, viewer.github_id).run();
}

/** Saving a card happens on Stripe's page; the board only ever holds Stripe's id for it. */
async function startCard(env: Env, url: URL, viewer: Viewer): Promise<Response> {
  let held = await env.DB.prepare('SELECT customer_id FROM pay_settings WHERE github_id = ?').bind(viewer.github_id).first<{ customer_id: string }>();
  if (held === null) {
    const made = await stripe(env, 'POST', '/v1/customers', { 'metadata[github_id]': String(viewer.github_id) }, { idempotency: `pf11/customer/${viewer.github_id}` });
    if (made.status !== 200 || typeof made.json['id'] !== 'string') return json(409, { error: `${errorWords(made)} Nothing changed. Next: try again.` });
    held = { customer_id: made.json['id'] };
    await env.DB.prepare('INSERT INTO pay_settings (github_id, customer_id) VALUES (?, ?)').bind(viewer.github_id, held.customer_id).run();
  }
  const session = await stripe(env, 'POST', '/v1/checkout/sessions', { mode: 'setup', customer: held.customer_id, 'payment_method_types[0]': 'card', success_url: `${url.origin}/me/?card={CHECKOUT_SESSION_ID}`, cancel_url: `${url.origin}/me/` });
  if (session.status !== 200 || typeof session.json['url'] !== 'string') return json(409, { error: `${errorWords(session)} Nothing changed. Next: try again.` });
  return json(200, { url: session.json['url'] });
}

/** Back from Stripe's page. The session must be this person's own customer's: an address can carry anyone's session id. */
async function finishCard(request: Request, env: Env, viewer: Viewer): Promise<Response> {
  const body = await readBody(request);
  if ('refused' in body) return body.refused;
  const session = (body.value as { session?: unknown } | null)?.session;
  if (typeof session !== 'string' || !/^cs_[A-Za-z\d_]{1,200}$/.test(session)) return json(400, { error: 'That is not a Stripe session. Nothing changed. Next: save the card again.' });
  const held = await env.DB.prepare('SELECT customer_id FROM pay_settings WHERE github_id = ?').bind(viewer.github_id).first<{ customer_id: string }>();
  const read = await stripe(env, 'GET', `/v1/checkout/sessions/${session}?expand[]=setup_intent.payment_method`);
  const intent = read.json['setup_intent'] as { payment_method?: { id?: unknown; card?: { brand?: unknown; last4?: unknown } } } | null | undefined;
  const method = intent?.payment_method;
  if (held === null || read.status !== 200 || read.json['customer'] !== held.customer_id || read.json['status'] !== 'complete' || typeof method?.id !== 'string') return json(409, { error: 'Stripe does not show a card saved by you in that session. Nothing changed. Next: save the card again.' });
  const { brand, last4 } = method.card ?? {};
  const label = typeof brand === 'string' && typeof last4 === 'string' && /^[a-z_ ]{1,20}$/.test(brand) && /^\d{4}$/.test(last4) ? `${brand} ending ${last4}` : null;
  await env.DB.prepare('UPDATE pay_settings SET payment_method = ?, card_label = ? WHERE github_id = ?').bind(method.id, label, viewer.github_id).run();
  return json(200, { pay: await payOf(env, viewer) });
}

/** The limit and the switch. Only this signed-in page can turn charging on (D-2026-11-01-pay-switch-on-board); removing the card turns everything off. */
async function savePay(request: Request, env: Env, viewer: Viewer, now: number): Promise<Response> {
  const body = await readBody(request);
  if ('refused' in body) return body.refused;
  const { limit, repositories, remove_card: removeCard } = (body.value ?? {}) as { limit?: unknown; repositories?: unknown; remove_card?: unknown };
  const owner = await env.DB.prepare('SELECT payment_method FROM pay_settings WHERE github_id = ?').bind(viewer.github_id).first<{ payment_method: string | null }>();
  if (removeCard === true) {
    if (owner?.payment_method != null) await stripe(env, 'POST', `/v1/payment_methods/${owner.payment_method}/detach`, {});
    await env.DB.batch([
      env.DB.prepare('UPDATE pay_settings SET payment_method = NULL, card_label = NULL WHERE github_id = ?').bind(viewer.github_id),
      env.DB.prepare('DELETE FROM pay_repositories WHERE github_id = ?').bind(viewer.github_id)
    ]);
    return json(200, { pay: await payOf(env, viewer) });
  }
  if (owner?.payment_method == null) return json(409, { error: 'Save a card first. Nothing changed. Next: save a card on this page.' });
  // Each repository with its own limit (PF19). The older form, one limit for a list of names, still works: it gives each the same limit.
  if (!Array.isArray(repositories) || repositories.length > SWITCHES_MAX) return json(400, { error: `Name up to ${SWITCHES_MAX} repositories as owner/name. Nothing changed.` });
  const entries = (repositories as unknown[]).map(entry => typeof entry === 'string' ? { repository: entry, limit } : (entry ?? {}) as { repository?: unknown; limit?: unknown });
  const isLimit = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= 100000;
  if (limit !== undefined && !isLimit(limit)) return json(400, { error: 'The limit is whole dollars for one bounty. Nothing changed. Next: type a number.' });
  if (!entries.every(entry => typeof entry.repository === 'string' && REPOSITORY.test(entry.repository))) return json(400, { error: `Name up to ${SWITCHES_MAX} repositories as owner/name. Nothing changed.` });
  if (!entries.every(entry => isLimit(entry.limit))) return json(400, { error: 'Each repository needs its limit, in whole dollars for one bounty. Nothing changed. Next: type a number.' });
  const on_at = new Date(now).toISOString();
  const names = [...new Set(entries.map(entry => (entry.repository as string).toLowerCase()))];
  // A repository already on keeps its date, so changing its limit never reaches back further.
  await env.DB.batch([
    ...(isLimit(limit) ? [env.DB.prepare('UPDATE pay_settings SET limit_per_bounty = ? WHERE github_id = ?').bind(limit, viewer.github_id)] : []),
    env.DB.prepare('DELETE FROM pay_repositories WHERE github_id = ? AND LOWER(repository) NOT IN (SELECT value FROM json_each(?))').bind(viewer.github_id, JSON.stringify(names)),
    ...entries.map(entry => env.DB.prepare('INSERT INTO pay_repositories (github_id, repository, on_at, limit_per_bounty) VALUES (?, ?, ?, ?) ON CONFLICT (github_id, repository) DO UPDATE SET limit_per_bounty = excluded.limit_per_bounty').bind(viewer.github_id, entry.repository as string, on_at, entry.limit as number))
  ]);
  return json(200, { pay: await payOf(env, viewer) });
}

async function payRoute(request: Request, env: Env, url: URL, viewer: Viewer, now: number): Promise<Response> {
  if (!stripeOn(env)) return json(409, NOT_SET_UP);
  try {
    switch (url.pathname) {
      case '/api/me/stripe/connect': return await connectStripe(request, env, url, viewer);
      case '/api/me/stripe/read': await readReady(env, viewer); return json(200, { pay: await payOf(env, viewer) });
      case '/api/me/card': return await startCard(env, url, viewer);
      case '/api/me/card/saved': return await finishCard(request, env, viewer);
      default: return await savePay(request, env, viewer, now);
    }
  } catch (error) {
    if (error instanceof StripeUnavailable) return json(503, { error: `${redact(error.message)}. Nothing was charged. Next: try again.` });
    throw error;
  }
}
/** Connecting PayPal: their own page, the fewest details, and only the account ID kept. */
function startPayPal(env: Env, url: URL): Response {
  const state = randomToken();
  return redirect(loginAddress(env, `${url.origin}/auth/paypal/callback`, state), [cookie(PAYPAL_STATE_COOKIE, state, 600)]);
}

async function finishPayPal(request: Request, env: Env, url: URL, viewer: Viewer, now: number): Promise<Response> {
  const clear = cookie(PAYPAL_STATE_COOKIE, '', 0);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (state === null || code === null || state !== cookieOf(request, PAYPAL_STATE_COOKIE)) return redirect('/me/?paypal=try-again#paypal', [clear]);
  let payer: string | null = null;
  try { payer = await payerFrom(env, code); } catch (error) { if (!(error instanceof PayPalUnavailable)) throw error; }
  if (payer === null) return redirect('/me/?paypal=refused#paypal', [clear]);
  await env.DB.prepare('INSERT INTO paypal_accounts (github_id, payer_id, at) VALUES (?, ?, ?) ON CONFLICT (github_id) DO UPDATE SET payer_id = excluded.payer_id, at = excluded.at').bind(viewer.github_id, payer, now).run();
  return redirect('/me/#paypal', [clear]);
}

const paypalOf = async (env: Env, viewer: Viewer) => paypalOn(env)
  ? { set_up: true, connected: await env.DB.prepare('SELECT 1 FROM paypal_accounts WHERE github_id = ?').bind(viewer.github_id).first() !== null }
  : { set_up: false, connected: false };

const PAY_ROUTES = ['/api/me/stripe/connect', '/api/me/stripe/read', '/api/me/card', '/api/me/card/saved', '/api/me/pay'];

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
  if (method === 'GET' && (path === '/auth/paypal' || path === '/auth/paypal/callback')) {
    if (!paypalOn(env)) return redirect('/me/?paypal=not-set-up#paypal');
    const viewer = await viewerOf(request, env, now);
    if (viewer === null) return redirect('/me/');
    return path === '/auth/paypal' ? startPayPal(env, url) : finishPayPal(request, env, url, viewer, now);
  }
  if (method === 'POST' && path === '/api/me/paypal/disconnect') {
    const refusal = writeRefusal(request, url, true);
    if (refusal !== null) return refusal;
    const viewer = await viewerOf(request, env, now);
    if (viewer === null) return json(401, SIGN_IN_FIRST);
    await env.DB.prepare('DELETE FROM paypal_accounts WHERE github_id = ?').bind(viewer.github_id).run();
    return json(200, { paypal: await paypalOf(env, viewer) });
  }
  if (method === 'GET' && path === '/api/me/due') {
    const viewer = await viewerOf(request, env, now);
    return json(200, { due: viewer === null ? 0 : (await youOwe(env, viewer.login, now)).length });
  }
  if (method === 'GET' && path === '/api/me') {
    const viewer = await viewerOf(request, env, now);
    if (viewer === null) return json(200, { signed_in: false });
    return json(200, { signed_in: true, login: viewer.login, sponsors_page: `https://github.com/sponsors/${viewer.login}`, methods: (await methodsOfLogin(env, viewer.login)).map(shown), pay: await payOf(env, viewer), paypal: await paypalOf(env, viewer), ...await debtsOf(env, viewer.login, now), bounties: await bountiesOf(env, viewer, now) });
  }
  if (method === 'POST' && PAY_ROUTES.includes(path)) {
    const refusal = writeRefusal(request, url, true);
    if (refusal !== null) return refusal;
    const viewer = await viewerOf(request, env, now);
    return viewer === null ? json(401, SIGN_IN_FIRST) : payRoute(request, env, url, viewer, now);
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
    return person[1] === 'solver' ? solverProfile(env, login) : ownerProfile(env, login, now);
  }
  const payment = /^\/api\/b\/(bt-[a-f\d]{12})\/(payment|receipt|paid|authenticate|pay|pay-paypal)$/.exec(path);
  if (payment !== null) {
    const id = payment[1]!;
    if (method === 'POST' && (payment[2] === 'authenticate' || payment[2] === 'pay' || payment[2] === 'pay-paypal')) {
      const refusal = writeRefusal(request, url, true);
      if (refusal !== null) return refusal;
      const viewer = await viewerOf(request, env, now);
      if (viewer === null) return json(401, SIGN_IN_FIRST);
      const input = await paymentInput(env, id, now);
      if (input === null) return json(404, NOT_ON_BOARD);
      if (roleOf(factsOf(input), viewer.login) !== 'owner' || !await isPoster(env, id, viewer)) return json(403, { error: 'Only the poster of this bounty can pay from this page. Nothing changed.' });
      const via = payment[2] === 'pay-paypal' ? { on: paypalOn(env), name: 'PayPal' } : { on: stripeOn(env), name: 'Stripe' };
      if (!via.on) return json(409, { error: `Paying through ${via.name} is not set up on this board. Nothing changed. Next: use the other ways to pay on this page.` });
      try {
        // An order the owner already approved is finished first: it must not be left for a second payment beside it.
        if (payment[2] === 'pay' && paypalOn(env) && await finishOrder(env, id, now) === 'paid') return json(200, { paid: true });
        const page = payment[2] === 'pay-paypal' ? await openPayPalPage(env, id, url.origin, now) : payment[2] === 'pay' ? await openPayPage(env, id, url.origin, now) : await authenticationPage(env, id, url.origin, now);
        return 'error' in page ? json(409, page) : json(200, page);
      } catch (error) {
        if (error instanceof StripeUnavailable || error instanceof PayPalUnavailable) return json(503, { error: `${redact(error.message)}. Nothing was charged. Next: try again.` });
        throw error;
      }
    }
    if (method === 'GET' && payment[2] === 'payment') return paymentView(env, id, await viewerOf(request, env, now), now);
    if (method === 'POST' && payment[2] !== 'payment') {
      const refusal = writeRefusal(request, url, true);
      if (refusal !== null) return refusal;
      const viewer = await viewerOf(request, env, now);
      if (viewer === null) return json(401, SIGN_IN_FIRST);
      return payment[2] === 'receipt' ? answerReceipt(request, env, id, viewer, now) : recordPaid(request, env, id, viewer, now);
    }
  }
  return null;
}
