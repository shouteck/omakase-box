// Paying through PayPal (PF13), on the real routes, against the stand-ins. Every guard here is ours alone:
// PayPal would pay any payee it is handed, as the sandbox showed.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handle } from '../../packages/box-platform/src/api.js';
import { claimPage } from '../../packages/box-platform/src/charge.js';
import { settlePayPal } from '../../packages/box-platform/src/paypal-pay.js';
import { type StandinIssue } from '../../packages/box-platform/standin/standin.js';
import { PayPalStandin } from './paypal-standin.js';
import { StripeStandin } from './stripe-standin.js';
import { MINUTE, NOW, rig, type Rig, refreshUntilDone } from './support.js';

const ORIGIN = 'https://board.test';
const OWNER = 'example-mara';
const OWNER_ID = 8001;
const SOLVER = 'example-quill';
const SOLVER_ID = 7001;
const REPOSITORY = 'example-org/ledger';
const ID = 'bt-00000000000a';
const PAYER = 'SOLVERPAYPAL1';
const after = new Date(NOW + 5 * MINUTE).toISOString();

let r: Rig;
let p: PayPalStandin;
let s: StripeStandin;
let env: Rig['env'];

const issue = (over: Partial<StandinIssue> = {}): StandinIssue => ({
  id: ID, repository: REPOSITORY, number: 1, title: 'Fix it', task: 'Fix it.', poster: OWNER, amount: 45, createdAt: new Date(NOW - MINUTE).toISOString(), state: 'closed', closedAt: after,
  pulls: [{ number: 7, author: SOLVER, state: 'closed', merged_at: after, created_at: new Date(NOW).toISOString() }], ...over
});

async function signIn(github_id: number, login: string): Promise<string> {
  const token = `session-${github_id}`;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  await env.DB.prepare('INSERT OR REPLACE INTO sessions (token_hash, github_id, login, expires_at) VALUES (?, ?, ?, ?)').bind([...digest].map(byte => byte.toString(16).padStart(2, '0')).join(''), github_id, login, NOW + 86400000 * 10).run();
  return token;
}
const headers = (token: string | null) => (token === null ? {} : { cookie: `__Host-board_session=${token}` });
const post = async (path: string, token: string | null, body: unknown = {}) => {
  const response = await handle(new Request(`${ORIGIN}${path}`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers(token) }, body: JSON.stringify(body) }), env);
  return { status: response.status, body: await response.json() as any };
};
const pay = (token: string | null, body: unknown = {}) => post(`/api/b/${ID}/pay-paypal`, token, body);
const view = async (token: string | null) => (await handle(new Request(`${ORIGIN}/api/b/${ID}/payment`, { headers: headers(token) }), env)).json() as Promise<any>;
const stateOf = async () => (await env.DB.prepare('SELECT state FROM charges WHERE bounty_id = ?').bind(ID).first<{ state: string }>())?.state ?? null;
const orderOf = (url: string) => new URL(url).searchParams.get('token')!;

/** Through the routes: PayPal's page, the callback, the board's row. */
async function connect(id = SOLVER_ID, login = SOLVER, payer = PAYER): Promise<string> {
  const token = await signIn(id, login);
  const start = await handle(new Request(`${ORIGIN}/auth/paypal`, { headers: headers(token) }), env);
  expect(start.status).toBe(302);
  const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
  const code = `code-${id}`;
  p.logins.set(code, { user_id: 'https://www.paypal.com/webapps/auth/identity/user/abc', sub: 'abc', payer_id: payer, emails: [{ value: 'someone@example.com' }], name: 'Some One' });
  const back = await handle(new Request(`${ORIGIN}/auth/paypal/callback?code=${code}&state=${state}`, { headers: { cookie: `__Host-board_session=${token}; __Host-board_paypal_state=${state}` } }), env);
  expect(back.headers.get('location')).toBe('/me/#paypal');
  return token;
}
async function merged(...issues: StandinIssue[]): Promise<void> {
  r.standin.repositories.set(REPOSITORY, { language: 'TypeScript', visibility: 'public' });
  r.standin.issues = issues.length === 0 ? [issue()] : issues;
  r.clock.at = NOW + 10 * MINUTE;
  await refreshUntilDone(r);
}
const ready = async () => { const owner = await signIn(OWNER_ID, OWNER); await connect(); await merged(); return owner; };
const webhook = (event: object, over: Record<string, string> = {}) => handle(new Request(`${ORIGIN}/api/paypal/webhook`, { method: 'POST', headers: {
  'paypal-transmission-id': 't1', 'paypal-transmission-time': new Date(r.clock.at).toISOString(), 'paypal-cert-url': 'https://api.paypal.test/cert', 'paypal-auth-algo': 'SHA256withRSA', 'paypal-transmission-sig': 'sig', ...over
}, body: JSON.stringify(event) }), env);
async function paid(): Promise<{ owner: string; capture: string }> {
  const owner = await ready();
  const order = orderOf((await pay(owner)).body.url);
  p.approve(order);
  await view(owner);
  return { owner, capture: p.orders[0]!.capture!.id };
}

beforeEach(async () => {
  r = await rig();
  p = new PayPalStandin();
  s = new StripeStandin();
  r.standin.accountIds.set(OWNER, OWNER_ID);
  env = { ...r.env, PAYPAL_CLIENT_ID: 'standin-id', PAYPAL_SECRET: 'standin-word', PAYPAL_WEBHOOK_ID: 'standin-hook', PAYPAL_API: await p.start(), PAYPAL_WEB: 'https://www.sandbox.paypal.test', STRIPE_SECRET_KEY: 'standin-key', STRIPE_API: await s.start() };
});
afterEach(async () => { await p.stop(); await s.stop(); await r.close(); });

describe('connecting', () => {
  it('keeps only the account ID, asks for the fewest details, and disconnecting removes it', async () => {
    const token = await signIn(SOLVER_ID, SOLVER);
    const start = await handle(new Request(`${ORIGIN}/auth/paypal`, { headers: headers(token) }), env);
    const to = new URL(start.headers.get('location')!);
    expect(to.searchParams.get('scope')).toBe('openid https://uri.paypal.com/services/paypalattributes');
    await connect();
    const row = await env.DB.prepare('SELECT * FROM paypal_accounts WHERE github_id = ?').bind(SOLVER_ID).first<Record<string, unknown>>();
    expect(row).toMatchObject({ payer_id: PAYER });
    expect(JSON.stringify(row)).not.toContain('example.com');
    const me = await (await handle(new Request(`${ORIGIN}/api/me`, { headers: headers(token) }), env)).json() as any;
    expect(me.paypal).toEqual({ set_up: true, connected: true });
    expect(JSON.stringify(me)).not.toContain(PAYER);
    expect((await post('/api/me/paypal/disconnect', token)).body.paypal.connected).toBe(false);
    expect(await env.DB.prepare('SELECT 1 FROM paypal_accounts').first()).toBeNull();
  });
  it('a callback with a wrong state, or a code PayPal refuses, connects nothing', async () => {
    const token = await signIn(SOLVER_ID, SOLVER);
    p.logins.set('good', { payer_id: PAYER });
    const forged = await handle(new Request(`${ORIGIN}/auth/paypal/callback?code=good&state=theirs`, { headers: { cookie: `__Host-board_session=${token}; __Host-board_paypal_state=mine` } }), env);
    expect(forged.headers.get('location')).toContain('try-again');
    const refused = await handle(new Request(`${ORIGIN}/auth/paypal/callback?code=bad&state=mine`, { headers: { cookie: `__Host-board_session=${token}; __Host-board_paypal_state=mine` } }), env);
    expect(refused.headers.get('location')).toContain('refused');
    expect(await env.DB.prepare('SELECT 1 FROM paypal_accounts').first()).toBeNull();
  });
  it('an answer with no payer ID, as with openid alone, or a malformed one connects nothing', async () => {
    const token = await signIn(SOLVER_ID, SOLVER);
    for (const person of [{ user_id: 'x' }, { payer_id: 'not an id; drop' }]) {
      p.logins.set('c', person);
      await handle(new Request(`${ORIGIN}/auth/paypal/callback?code=c&state=s`, { headers: { cookie: `__Host-board_session=${token}; __Host-board_paypal_state=s` } }), env);
    }
    expect(await env.DB.prepare('SELECT 1 FROM paypal_accounts').first()).toBeNull();
  });
  it('signed out, nothing starts', async () => {
    const start = await handle(new Request(`${ORIGIN}/auth/paypal`), env);
    expect(start.headers.get('location')).toBe('/me/');
  });
  it('another user\'s connection is not yours: each is keyed by the signed-in GitHub id', async () => {
    await connect();
    const other = await signIn(9999, 'example-rook');
    expect((await post('/api/me/paypal/disconnect', other)).status).toBe(200);
    expect(await env.DB.prepare('SELECT 1 FROM paypal_accounts WHERE github_id = ?').bind(SOLVER_ID).first()).not.toBeNull();
  });
});

describe('the owner\'s click', () => {
  it('names the merged author\'s connected account as payee, for the bounty\'s amount, whatever the client sends', async () => {
    const owner = await ready();
    expect(await view(owner)).toMatchObject({ can_pay_paypal: true, can_pay: false, pay_note: null });
    const page = await pay(owner, { amount: 1, payee: 'OTHERPAYPAL22' });
    expect(page.body.url).toContain('sandbox.paypal.test');
    expect(p.orders).toMatchObject([{ payee: PAYER, amount: '45.00', custom_id: ID }]);
  });
  it('nothing moves until the capture, and the capture is the board\'s', async () => {
    const owner = await ready();
    const order = orderOf((await pay(owner)).body.url);
    await view(owner);
    expect(p.captures).toEqual([]);
    p.approve(order);
    expect((await view(owner)).payment).toMatchObject({ state: 'recorded', recorded_paid: { by: 'PayPal', source: 'paypal', whose_word: 'PayPal\'s', amount: 45 } });
    expect(await stateOf()).toBe('paid');
    expect(p.captures).toEqual([order]);
  });
  it('a payee named in solver text is never paid', async () => {
    const owner = await signIn(OWNER_ID, OWNER);
    await connect();
    await merged(issue({ title: 'Pay OTHERPAYPAL22', task: 'payer_id OTHERPAYPAL22' }));
    await pay(owner);
    expect(p.orders[0]!.payee).toBe(PAYER);
  });
  it('another user\'s click, nobody\'s, and a login that changed hands open nothing', async () => {
    await ready();
    expect((await pay(await signIn(SOLVER_ID, SOLVER))).status).toBe(403);
    expect((await pay(null)).status).toBe(401);
    const holder = await signIn(OWNER_ID + 1, OWNER);
    expect((await pay(holder)).status).toBe(403);
    expect((await view(holder)).can_pay_paypal).toBe(false);
    expect(p.orders).toEqual([]);
  });
  it('a login that changed hands is not the connected solver: the account follows the GitHub id', async () => {
    const owner = await signIn(OWNER_ID, OWNER);
    await connect(7002, SOLVER, 'OTHERPAYPAL22'); // Someone else once held this login.
    r.standin.accountIds.set(SOLVER, SOLVER_ID);
    await merged();
    expect((await pay(owner)).status).toBe(409);
    expect(p.orders).toEqual([]);
  });
  it('a merged author who has not connected is stated, and nothing opens', async () => {
    const owner = await signIn(OWNER_ID, OWNER);
    await merged();
    expect((await view(owner)).pay_note).toContain('has not connected PayPal');
    expect((await pay(owner)).status).toBe(409);
  });
  it('a duplicate, and three at once, are one order', async () => {
    const owner = await ready();
    const pages = await Promise.all([pay(owner), pay(owner), pay(owner)]);
    expect(pages.map(page => page.status)).toEqual([200, 200, 200]);
    expect((await pay(owner)).body.url).toBe(pages[0]!.body.url);
    expect(new Set(pages.map(page => page.body.url)).size).toBe(1);
    expect(p.orders).toHaveLength(1);
  });
  it('a paid bounty clicked again opens nothing and captures nothing', async () => {
    const { owner } = await paid();
    expect((await pay(owner)).status).toBe(409);
    expect(p.orders).toHaveLength(1);
    expect(p.captures).toHaveLength(1);
    expect((await view(owner)).can_pay_paypal).toBe(false);
  });
  it('an order changed since it was made is not captured: wrong payee, wrong amount', async () => {
    const owner = await ready();
    const order = orderOf((await pay(owner)).body.url);
    p.approve(order);
    p.orders[0]!.payee = 'OTHERPAYPAL22';
    await view(owner);
    expect(p.captures).toEqual([]);
    p.orders[0]!.payee = PAYER;
    await env.DB.prepare('UPDATE charges SET amount = 50 WHERE bounty_id = ?').bind(ID).run();
    await view(owner);
    expect(p.captures).toEqual([]);
  });
  it('a reward changed makes a new order, and the old one can no longer be captured', async () => {
    const owner = await ready();
    const first = orderOf((await pay(owner)).body.url);
    await env.DB.prepare('UPDATE bounties SET amount = 50 WHERE id = ?').bind(ID).run();
    const second = orderOf((await pay(owner)).body.url);
    expect(second).not.toBe(first);
    p.approve(first);
    await view(owner);
    expect(p.captures).toEqual([]);
  });
  it('a closed page: approved and gone, the next run finishes it, and an unapproved one stays unpaid', async () => {
    const owner = await ready();
    const order = orderOf((await pay(owner)).body.url);
    r.clock.at += 2 * MINUTE;
    await settlePayPal(env);
    expect(await stateOf()).toBe('owner-paying');
    expect(p.calls.filter(call => call.endsWith('/capture'))).toEqual([]);
    p.approve(order);
    await settlePayPal(env);
    expect(await stateOf()).toBe('paid');
    expect(p.captures).toEqual([order]);
  });
  it('recorded by hand with an order open: the order is never captured', async () => {
    const owner = await ready();
    const order = orderOf((await pay(owner)).body.url);
    await post(`/api/b/${ID}/paid`, owner, { to: SOLVER });
    p.approve(order);
    r.clock.at += 2 * MINUTE;
    await settlePayPal(env);
    await view(owner);
    expect(p.captures).toEqual([]);
  });
  it('an account PayPal refuses is named by the board, with none of PayPal\'s words', async () => {
    const owner = await signIn(OWNER_ID, OWNER);
    await connect(SOLVER_ID, SOLVER, 'UNKNOWNPAYPAL');
    await merged();
    const refused = await pay(owner);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toContain('does not accept this solver');
    expect(refused.body.error).not.toContain('words of PayPal');
  });
  it('no key: the pages say not set up, nothing is called, and manual still works', async () => {
    const owner = await signIn(OWNER_ID, OWNER);
    await merged();
    const { PAYPAL_CLIENT_ID: _id, PAYPAL_SECRET: _secret, ...without } = env;
    env = without;
    const calls = p.calls.length;
    expect((await view(owner)).can_pay_paypal).toBe(false);
    const refused = await pay(owner);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toContain('not set up');
    const me = await (await handle(new Request(`${ORIGIN}/api/me`, { headers: headers(owner) }), env)).json() as any;
    expect(me.paypal).toEqual({ set_up: false, connected: false });
    expect((await handle(new Request(`${ORIGIN}/auth/paypal`, { headers: headers(owner) }), env)).headers.get('location')).toContain('not-set-up');
    expect(p.calls.length).toBe(calls);
    expect((await post(`/api/b/${ID}/paid`, owner, { to: SOLVER })).status).toBe(200);
  });
  it('PayPal down is a named answer with no credential in it', async () => {
    const owner = await ready();
    await p.stop();
    const page = await pay(owner);
    expect(page.status).toBe(503);
    expect(page.body.error).toContain('Nothing was charged');
    expect(JSON.stringify(page.body)).not.toContain('standin-word');
    await p.start();
  });
});

describe('both providers on one bounty', () => {
  const stripeReady = async () => {
    const token = await signIn(SOLVER_ID, SOLVER);
    await post('/api/me/stripe/connect', token, { country: 'US' });
    const { account_id } = (await env.DB.prepare('SELECT account_id FROM stripe_accounts WHERE github_id = ?').bind(SOLVER_ID).first<{ account_id: string }>())!;
    s.accounts.get(account_id)!.charges_enabled = true;
    await post('/api/me/stripe/read', token);
  };
  it('the owner sees both', async () => {
    await stripeReady();
    expect(await view(await ready())).toMatchObject({ can_pay: true, can_pay_paypal: true, pay_note: null });
  });
  it('PayPal\'s page retires an open Stripe page, so both cannot be paid', async () => {
    await stripeReady();
    const owner = await ready();
    const session = (await post(`/api/b/${ID}/pay`, owner)).body.url.split('/').pop();
    expect(s.sessions.get(session)!.status).toBe('open');
    await pay(owner);
    expect(s.sessions.get(session)!.status).toBe('expired');
    expect(p.orders).toHaveLength(1);
  });
  it('a Stripe page that cannot be closed stops PayPal\'s from opening', async () => {
    await stripeReady();
    const owner = await ready();
    await post(`/api/b/${ID}/pay`, owner);
    s.expireRefused = true;
    const refused = await pay(owner);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toContain('could not be closed');
    expect(p.orders).toEqual([]);
  });
  it('a claim lost to the other provider\'s page is no claim', async () => {
    const owner = await ready();
    await pay(owner);
    const pull = { number: 7, author: SOLVER, author_id: SOLVER_ID, merged_at: after, association: 'NONE', on_default: 1 };
    expect(await claimPage(env, ID, { at: -5, state: 'looked' }, pull, 'acct_x', 45, null, null, NOW)).toBeNull();
    expect(await claimPage(env, ID, { at: -5, state: 'looked' }, pull, PAYER, 45, 'paypal', null, NOW)).not.toBeNull();
  });
  it('a Stripe page already paid stops PayPal\'s from opening', async () => {
    await stripeReady();
    const owner = await ready();
    const session = (await post(`/api/b/${ID}/pay`, owner)).body.url.split('/').pop();
    s.payPage(session);
    expect((await pay(owner)).body).toEqual({ paid: true });
    expect(p.orders).toEqual([]);
  });
  it('Stripe\'s page drops an open order, which can then never be captured; one already approved is finished instead', async () => {
    await stripeReady();
    const owner = await ready();
    const dropped = orderOf((await pay(owner)).body.url);
    expect((await post(`/api/b/${ID}/pay`, owner)).body.url).toContain('checkout.stripe.test');
    p.approve(dropped);
    r.clock.at += 2 * MINUTE;
    await settlePayPal(env);
    await view(owner);
    expect(p.captures).toEqual([]);
  });
  it('an approved order wins over a later Stripe click', async () => {
    await stripeReady();
    const owner = await ready();
    p.approve(orderOf((await pay(owner)).body.url));
    expect((await post(`/api/b/${ID}/pay`, owner)).body).toEqual({ paid: true });
    expect(s.sessions.size).toBe(0);
  });
});

describe('PayPal telling the board', () => {
  const refund = (capture: string) => ({ event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { id: 'R1', links: [{ rel: 'up', href: `https://api.paypal.test/v2/payments/captures/${capture}` }] } });
  it('a verified refund changes the record, read from PayPal itself', async () => {
    const { capture } = await paid();
    p.captureStatus.set(capture, 'REFUNDED');
    expect((await webhook(refund(capture))).status).toBe(200);
    expect(await stateOf()).toBe('refunded');
  });
  it('a refund made on the solver\'s own account sends the platform no event, as in the sandbox: the next run reads it', async () => {
    const { capture } = await paid();
    await settlePayPal(env);
    expect(await stateOf()).toBe('paid');
    p.captureStatus.set(capture, 'PARTIALLY_REFUNDED');
    await settlePayPal(env);
    expect(await stateOf()).toBe('paid');
    p.captureStatus.set(capture, 'REFUNDED');
    await settlePayPal(env);
    expect(await stateOf()).toBe('refunded');
    const reads = p.calls.length;
    await settlePayPal(env);
    expect(p.calls.length).toBe(reads);
  });
  it('a capture older than the watch is not read again', async () => {
    const { capture } = await paid();
    r.clock.at += 200 * 86400000;
    p.captureStatus.set(capture, 'REFUNDED');
    await settlePayPal(env);
    expect(await stateOf()).toBe('paid');
  });
  it('a partial refund does not read as refunded', async () => {
    const { capture } = await paid();
    p.captureStatus.set(capture, 'PARTIALLY_REFUNDED');
    await webhook(refund(capture));
    expect(await stateOf()).toBe('paid');
  });
  it('a reversal and a dispute change the record', async () => {
    const { capture } = await paid();
    await webhook({ event_type: 'CUSTOMER.DISPUTE.CREATED', resource: { disputed_transactions: [{ seller_transaction_id: capture }] } });
    expect(await stateOf()).toBe('disputed');
    p.captureStatus.set(capture, 'REVERSED');
    await webhook({ event_type: 'PAYMENT.CAPTURE.REVERSED', resource: { id: capture } });
    expect(await stateOf()).toBe('refunded');
  });
  it('a forged event, one PayPal does not verify, or a stale one changes nothing', async () => {
    const { capture } = await paid();
    p.captureStatus.set(capture, 'REFUNDED');
    p.verification = 'FAILURE';
    expect((await webhook(refund(capture))).status).toBe(400);
    expect(await stateOf()).toBe('paid');
    p.verification = 'SUCCESS';
    expect((await webhook(refund(capture), { 'paypal-transmission-sig': '' })).status).toBe(400);
    expect((await webhook(refund(capture), { 'paypal-transmission-time': new Date(r.clock.at - 4 * 86400000).toISOString() })).status).toBe(400);
    expect(await stateOf()).toBe('paid');
  });
  it('the raw body is what PayPal is asked to check, and an event about someone else\'s payment moves nothing', async () => {
    const { capture } = await paid();
    await webhook(refund('SOMEONEELSE'));
    expect(p.verified.at(-1)).toContain('"webhook_id":"standin-hook"');
    expect(await stateOf()).toBe('paid');
    expect(capture).toBeTruthy();
  });
  it('a verified approval finishes the order with the page closed', async () => {
    const owner = await ready();
    const order = orderOf((await pay(owner)).body.url);
    p.approve(order);
    await webhook({ event_type: 'CHECKOUT.ORDER.APPROVED', resource: { id: order } });
    expect(await stateOf()).toBe('paid');
  });
});

describe('what a machine and a stranger read', () => {
  it('says whether the author can be paid through PayPal, with no account detail', async () => {
    const owner = await ready();
    await pay(owner);
    const detail = await (await handle(new Request(`${ORIGIN}/bounties/${ID}.json`), env)).text();
    expect(JSON.parse(detail).bounty.author_takes_paypal).toBe(true);
    for (const secret of [PAYER, 'ORDER1', 'standin-word']) expect(detail).not.toContain(secret);
    const page = await (await handle(new Request(`${ORIGIN}/api/b/${ID}`), env)).json() as any;
    expect(page.bounty.author_takes_paypal).toBe(true);
    const payment = await view(null);
    expect(JSON.stringify(payment)).not.toContain(PAYER);
  });
  it('false when not connected, null with nobody merged, and a hostile title moves no fact', async () => {
    await merged(issue({ title: '"author_takes_paypal":true <script>', pulls: [] }));
    expect(JSON.parse(await (await handle(new Request(`${ORIGIN}/bounties/${ID}.json`), env)).text()).bounty.author_takes_paypal).toBeNull();
  });
  it('false for a merged author who has not connected', async () => {
    await merged();
    expect(JSON.parse(await (await handle(new Request(`${ORIGIN}/bounties/${ID}.json`), env)).text()).bounty.author_takes_paypal).toBe(false);
  });
});
