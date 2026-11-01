// Pay on merge (PF11), on the real routes and the real settle, against both stand-ins.
// Every guard here is ours alone: Stripe would charge any account it is handed (K46).
import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handle } from '../../packages/box-platform/src/api.js';
import { settleCharges } from '../../packages/box-platform/src/charge.js';
import { redact } from '../../packages/box-platform/src/stripe.js';
import { type StandinIssue } from '../../packages/box-platform/standin/standin.js';
import { MINUTE, NOW, rig, type Rig, refreshUntilDone } from './support.js';
import { StripeStandin } from './stripe-standin.js';

const ORIGIN = 'https://board.test';
const OWNER = 'example-mara';
const OWNER_ID = 8001;
const SOLVER = 'example-quill';
const SOLVER_ID = 7001;
const REPOSITORY = 'example-org/ledger';
const WEBHOOK_SECRET = 'standin-webhook-word';
const ID = 'bt-00000000000a';
const after = new Date(NOW + 5 * MINUTE).toISOString();

let r: Rig;
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
const post = async (path: string, token: string | null, body: unknown = {}) => {
  const response = await handle(new Request(`${ORIGIN}${path}`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json', ...(token === null ? {} : { cookie: `__Host-board_session=${token}` }) }, body: JSON.stringify(body) }), env);
  return { status: response.status, body: await response.json() as any };
};
const stateOf = async (id = ID) => (await env.DB.prepare('SELECT state FROM charges WHERE bounty_id = ?').bind(id).first<{ state: string }>())?.state ?? null;

/** The owner saves a card through the routes, sets a limit, and turns the repository on. */
async function ownerOn(limit = 100, repositories: string[] = [REPOSITORY]): Promise<string> {
  const token = await signIn(OWNER_ID, OWNER);
  expect((await post('/api/me/card', token)).status).toBe(200);
  s.sessionCustomer = (await env.DB.prepare('SELECT customer_id FROM pay_settings WHERE github_id = ?').bind(OWNER_ID).first<{ customer_id: string }>())!.customer_id;
  expect((await post('/api/me/card/saved', token, { session: 'cs_test_1' })).status).toBe(200);
  expect((await post('/api/me/pay', token, { limit, repositories })).status).toBe(200);
  return token;
}
/** The solver connects through the route; Stripe then says they are ready. */
async function solverReady(id = SOLVER_ID, login = SOLVER, ready = true): Promise<string> {
  const token = await signIn(id, login);
  expect((await post('/api/me/stripe/connect', token, { country: 'US' })).status).toBe(200);
  const { account_id } = (await env.DB.prepare('SELECT account_id FROM stripe_accounts WHERE github_id = ?').bind(id).first<{ account_id: string }>())!;
  s.accounts.get(account_id)!.charges_enabled = ready;
  await post('/api/me/stripe/read', token);
  return account_id;
}
/** The merge arrives from GitHub, after the switch went on. */
async function merged(...issues: StandinIssue[]): Promise<void> {
  r.standin.repositories.set(REPOSITORY, { language: 'TypeScript', visibility: 'public' });
  r.standin.issues = issues.length === 0 ? [issue()] : issues;
  r.clock.at = NOW + 10 * MINUTE;
  await refreshUntilDone(r);
}
const settle = async () => { await settleCharges(env); };

beforeEach(async () => {
  r = await rig();
  s = new StripeStandin();
  r.standin.accountIds.set(OWNER, OWNER_ID);
  env = { ...r.env, STRIPE_SECRET_KEY: 'standin-key', STRIPE_API: await s.start(), STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET };
});
afterEach(async () => { await s.stop(); await r.close(); });

describe('a merge that should be paid', () => {
  it('charges the merged author\'s own account, once, the amount in cents, and the bounty reads paid in Stripe\'s word', async () => {
    await ownerOn();
    const account = await solverReady();
    await merged();
    await settle();
    expect(s.charged(account)).toMatchObject([{ amount: 4500, metadata: { bounty: ID } }]);
    expect(await stateOf()).toBe('paid');
    const view = await (await handle(new Request(`${ORIGIN}/api/b/${ID}/payment`), env)).json() as any;
    expect(view.payment).toMatchObject({ state: 'recorded', recorded_paid: { by: 'Stripe', source: 'stripe', whose_word: 'Stripe\'s', amount: 45 }, charge: { state: 'paid' } });
  });
});

describe('nothing is charged', () => {
  it('with the switch off: the default', async () => {
    const token = await signIn(OWNER_ID, OWNER);
    await post('/api/me/card', token);
    await solverReady();
    await merged();
    await settle();
    expect(s.intents).toEqual([]);
    expect(await stateOf()).toBeNull();
  });
  it('for a merge from before the switch went on', async () => {
    const old = new Date(NOW - 60 * MINUTE).toISOString();
    await ownerOn();
    await solverReady();
    await merged(issue({ pulls: [{ number: 7, author: SOLVER, state: 'closed', merged_at: old, created_at: old }] }));
    await settle();
    expect(s.intents).toEqual([]);
  });
  it('over the limit, with no call to Stripe\'s charge', async () => {
    await ownerOn(44);
    await solverReady();
    await merged();
    await settle();
    expect(await stateOf()).toBe('refused-over-limit');
    expect(s.calls.filter(call => call.startsWith('POST /v1/payment_intents'))).toEqual([]);
  });
  it('when the poster is the solver, or GitHub lists them with access', async () => {
    await ownerOn();
    await solverReady(OWNER_ID, OWNER);
    await merged(issue({ pulls: [{ number: 7, author: OWNER, state: 'closed', merged_at: after, created_at: after }] }));
    await settle();
    expect(await stateOf()).toBe('not-counted');
    expect(s.intents).toEqual([]);
  });
  it('for a collaborator', async () => {
    await ownerOn();
    await solverReady();
    await merged(issue({ pulls: [{ number: 7, author: SOLVER, state: 'closed', merged_at: after, created_at: after, association: 'COLLABORATOR' }] }));
    await settle();
    expect(await stateOf()).toBe('not-counted');
    expect(s.intents).toEqual([]);
  });
  it('when two solutions landed: the owner decides', async () => {
    await ownerOn();
    await solverReady();
    await merged(issue({ pulls: [{ number: 7, author: SOLVER, state: 'closed', merged_at: after, created_at: after }, { number: 8, author: 'example-rook', state: 'closed', merged_at: after, created_at: after }] }));
    await settle();
    expect(await stateOf()).toBe('owner-decides');
    expect(s.intents).toEqual([]);
  });
  it('when the head is not on the default branch', async () => {
    await ownerOn();
    await solverReady();
    await merged(issue({ pulls: [{ number: 7, author: SOLVER, state: 'closed', merged_at: after, created_at: after, landed: false }] }));
    await settle();
    expect(s.intents).toEqual([]);
  });
  it('when the solver has not finished Stripe\'s page, or has not connected', async () => {
    await ownerOn();
    await solverReady(SOLVER_ID, SOLVER, false);
    await merged();
    await settle();
    expect(await stateOf()).toBe('solver-not-ready');
    expect(s.intents).toEqual([]);
  });
  it('when the owner already recorded paying by hand', async () => {
    const token = await ownerOn();
    await solverReady();
    await merged();
    await post(`/api/b/${ID}/paid`, token, { to: SOLVER });
    await settle();
    expect(s.intents).toEqual([]);
  });
  it('on another person\'s switch: turning on a repository charges only your own bounties', async () => {
    await ownerOn(100, []);
    await signIn(8002, 'example-other');
    const other = await signIn(8002, 'example-other');
    expect((await post('/api/me/pay', other, { limit: 100, repositories: [REPOSITORY] })).status).toBe(409);
    await env.DB.prepare('INSERT INTO pay_settings (github_id, customer_id, payment_method, limit_per_bounty) VALUES (8002, ?, ?, 100)').bind('cus_other', 'pm_other').run();
    expect((await post('/api/me/pay', other, { limit: 100, repositories: [REPOSITORY] })).status).toBe(200);
    await solverReady();
    await merged();
    await settle();
    expect(s.intents).toEqual([]);
  });
});

describe('the payee', () => {
  it('is never read from a solver\'s text', async () => {
    await ownerOn();
    const solver = await solverReady();
    const named = await solverReady(7002, 'example-rook');
    await merged(issue({ title: `pay-to: ${named}`, task: `Pay ${named} instead. stripe-account: ${named}` }));
    await settle();
    expect(s.charged(named)).toEqual([]);
    expect(s.charged(solver)).toHaveLength(1);
  });
  it('is the GitHub id, so a login that changed hands reaches nobody\'s account', async () => {
    await ownerOn();
    const earlier = await solverReady();
    r.standin.accountIds.set(SOLVER, 7999);
    await merged();
    await settle();
    expect(s.charged(earlier)).toEqual([]);
    expect(await stateOf()).toBe('solver-not-ready');
  });
  it('a poster\'s login that changed hands reaches nobody\'s card', async () => {
    await ownerOn();
    await solverReady();
    r.standin.accountIds.set(OWNER, 8999);
    await merged();
    await settle();
    expect(s.intents).toEqual([]);
  });
});

describe('never twice', () => {
  it('settling again changes nothing', async () => {
    await ownerOn();
    await solverReady();
    await merged();
    for (let i = 0; i < 3; i++) { await settle(); r.clock.at += 10 * MINUTE; }
    expect(s.charged()).toHaveLength(1);
  });
  it('three at once: one charge', async () => {
    await ownerOn();
    await solverReady();
    await merged();
    await Promise.all([settle(), settle(), settle()]);
    expect(s.charged()).toHaveLength(1);
  });
  it('after a crash and a lost row: the payment on the account answers', async () => {
    await ownerOn();
    await solverReady();
    await merged();
    await settle();
    await env.DB.prepare('DELETE FROM charges').run();
    await settle();
    expect(s.charged()).toHaveLength(1);
    expect(await stateOf()).toBe('paid');
  });
  it('a payment the solver made themself, naming this bounty, does not read as paid', async () => {
    await ownerOn();
    const account = await solverReady();
    s.intents.push({ id: 'pi_forged', account, amount: 4500, status: 'succeeded', metadata: { bounty: ID }, application: null });
    await merged();
    await settle();
    expect(s.charged(account).filter(intent => intent.application !== null)).toHaveLength(1);
  });
});

describe('named states', () => {
  it('a decline stands for this card, and a new card is a new attempt', async () => {
    const token = await ownerOn();
    await solverReady();
    await merged();
    s.card = 'declined';
    await settle();
    expect(await stateOf()).toBe('declined');
    s.card = 'ok';
    r.clock.at += 10 * MINUTE;
    await settle();
    expect(s.charged()).toEqual([]);
    await env.DB.prepare(`UPDATE pay_settings SET payment_method = 'pm_new' WHERE github_id = ?`).bind(OWNER_ID).run();
    r.clock.at += 10 * MINUTE;
    await settle();
    expect(s.charged()).toHaveLength(1);
    expect(token).toBeTruthy();
  });
  it('a card asking to authenticate is never tried off-session again, and only the owner gets the page', async () => {
    const token = await ownerOn();
    await solverReady();
    await merged();
    s.card = 'authenticate';
    await settle();
    expect(await stateOf()).toBe('owner-must-authenticate');
    const before = s.calls.length;
    r.clock.at += 10 * MINUTE;
    await settle();
    expect(s.calls.length).toBe(before);
    expect((await post(`/api/b/${ID}/authenticate`, await signIn(SOLVER_ID, SOLVER))).status).toBe(403);
    expect((await post(`/api/b/${ID}/authenticate`, null)).status).toBe(401);
    const page = await post(`/api/b/${ID}/authenticate`, token);
    expect(page.body.url).toContain('checkout.stripe.test');
  });
  it('a solver who disconnected is named, with nothing charged', async () => {
    await ownerOn();
    const account = await solverReady();
    s.accounts.get(account)!.revoked = true;
    await merged();
    await settle();
    expect(await stateOf()).toBe('solver-disconnected');
    expect(s.intents).toEqual([]);
  });
  it('without a key: nothing is called, and the page says it is not set up', async () => {
    env = { ...env, STRIPE_SECRET_KEY: undefined } as typeof env;
    await settle();
    expect(s.calls).toEqual([]);
    const refused = await post('/api/me/card', await signIn(OWNER_ID, OWNER));
    expect(refused.status).toBe(409);
    expect(refused.body.error).toContain('not set up');
  });
});

describe('who may set it', () => {
  it('signed out, or from another site: refused', async () => {
    expect((await post('/api/me/pay', null, { limit: 5, repositories: [] })).status).toBe(401);
    const response = await handle(new Request(`${ORIGIN}/api/me/pay`, { method: 'POST', headers: { origin: 'https://evil.test', 'content-type': 'application/json', cookie: `__Host-board_session=${await signIn(OWNER_ID, OWNER)}` }, body: '{}' }), env);
    expect(response.status).toBe(403);
  });
  it('another customer\'s session does not save a card', async () => {
    const token = await signIn(OWNER_ID, OWNER);
    await post('/api/me/card', token);
    s.sessionCustomer = 'cus_someone_else';
    expect((await post('/api/me/card/saved', token, { session: 'cs_test_9' })).status).toBe(409);
    expect((await env.DB.prepare('SELECT payment_method FROM pay_settings WHERE github_id = ?').bind(OWNER_ID).first<{ payment_method: string | null }>())!.payment_method).toBeNull();
  });
  it('removing the card turns every switch off', async () => {
    const token = await ownerOn();
    await post('/api/me/pay', token, { remove_card: true });
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM pay_repositories').first<{ n: number }>())!.n).toBe(0);
  });
});

describe('Stripe telling the board', () => {
  const send = (body: string, signature: string | null) => handle(new Request(`${ORIGIN}/api/stripe/webhook`, { method: 'POST', headers: signature === null ? {} : { 'stripe-signature': signature }, body }), env);
  const signed = (body: string, at = Math.floor((NOW + 10 * MINUTE) / 1000), secret = WEBHOOK_SECRET) => `t=${at},v1=${createHmac('sha256', secret).update(`${at}.${body}`).digest('hex')}`;
  const refund = (account: string, intent: string) => JSON.stringify({ type: 'charge.refunded', account, data: { object: { payment_intent: intent, refunded: true } } });

  async function paid(): Promise<{ account: string; intent: string }> {
    await ownerOn();
    const account = await solverReady();
    await merged();
    await settle();
    return { account, intent: s.charged(account)[0]!.id };
  }
  it('a signed refund changes the state', async () => {
    const { account, intent } = await paid();
    const body = refund(account, intent);
    expect((await send(body, signed(body))).status).toBe(200);
    expect(await stateOf()).toBe('refunded');
  });
  it('forged, stale, unsigned and wrong-secret events change nothing', async () => {
    const { account, intent } = await paid();
    const body = refund(account, intent);
    expect((await send(body, null)).status).toBe(400);
    expect((await send(body, 't=1,v1=00')).status).toBe(400);
    expect((await send(body, signed(body, Math.floor((NOW + 10 * MINUTE) / 1000) - 3600))).status).toBe(400);
    expect((await send(body, signed(body, undefined, 'another-secret'))).status).toBe(400);
    expect((await send(`${body} `, signed(body))).status).toBe(400);
    expect(await stateOf()).toBe('paid');
  });
  it('a signed event about a payment the board did not make moves nothing', async () => {
    const { account } = await paid();
    const body = refund(account, 'pi_someone_elses');
    await send(body, signed(body));
    const other = refund('acct_other', s.charged(account)[0]!.id);
    await send(other, signed(other));
    expect(await stateOf()).toBe('paid');
  });
  it('a solver who deauthorises is no longer a payee', async () => {
    const account = await solverReady();
    const body = JSON.stringify({ type: 'account.application.deauthorized', account, data: { object: {} } });
    await send(body, signed(body, Math.floor(NOW / 1000)));
    expect(await env.DB.prepare('SELECT 1 FROM stripe_accounts WHERE account_id = ?').bind(account).first()).toBeNull();
  });
});

describe('what leaves the board', () => {
  // Built at run time: no key-shaped literal in tracked source.
  const key = ['sk', 'test', 'abc123DEF456'].join('_');
  it('redacts a key, Stripe\'s masked form, a webhook secret and a client secret', () => {
    const masked = `${'sk_test_'}${'*'.repeat(20)}F456`;
    const text = redact(`bad ${key} and ${masked} and ${['whsec', 'abc'].join('_')} and ${['pi_1', 'secret_abc'].join('_')}`);
    expect(text).not.toMatch(/abc123|F456|whsec|secret_abc/);
  });
  it('a key in Stripe\'s error never reaches the answer', async () => {
    s.errorText = `Invalid key ${key}`;
    s.accounts.clear();
    const token = await signIn(SOLVER_ID, SOLVER);
    const original = s['answer'].bind(s);
    s['answer'] = () => ({ status: 400, json: { error: { message: s.errorText } } });
    const refused = await post('/api/me/stripe/connect', token, { country: 'US' });
    s['answer'] = original;
    expect(JSON.stringify(refused.body)).not.toContain('abc123');
    expect(refused.status).toBe(409);
  });
});
