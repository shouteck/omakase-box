// Pay on merge (PF11), on the real routes and the real settle, against both stand-ins.
// Every guard here is ours alone: Stripe would charge any account it is handed (K46).
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handle } from '../../packages/box-platform/src/api.js';
import { decide, settleCharges, type ChargeFacts } from '../../packages/box-platform/src/charge.js';
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

/** The owner saves a card through the routes, approves the reward the bounty states ($45), and turns the repository on. */
async function ownerOn(limit = 45, repositories: string[] = [REPOSITORY]): Promise<string> {
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
  // PF19, the owner: a limit per repository. The bounty's own repository's limit decides, never another's.
  it.each([
    ['its repository\'s limit is under the reward', 44, 100, 'refused-over-limit', 0],
    ['its repository\'s limit covers the reward', 45, 10, 'paid', 1]
  ])('a limit per repository: when %s', async (_name, here, elsewhere, state, charged) => {
    const token = await ownerOn();
    expect((await post('/api/me/pay', token, { repositories: [{ repository: REPOSITORY, limit: here }, { repository: 'example-org/other', limit: elsewhere }] })).status).toBe(200);
    const pay = (await (await handle(new Request(`${ORIGIN}/api/me`, { headers: { cookie: `__Host-board_session=${token}` } }), env)).json() as { pay: { repositories: { repository: string; limit: number }[] } }).pay;
    expect(pay.repositories.map(entry => [entry.repository, entry.limit])).toEqual([['example-org/ledger', here], ['example-org/other', elsewhere]]);
    await solverReady();
    await merged();
    await settle();
    expect(await stateOf()).toBe(state);
    expect(s.charged()).toHaveLength(charged);
  });
  // PF20, the owner: one fixed amount, the reward. A bounty is charged only when its stated reward is the one approved here.
  it.each([
    ['equal', 45, 'paid', 1],
    ['the bounty states less', 50, 'refused-over-limit', 0],
    ['the bounty states more', 40, 'refused-over-limit', 0]
  ])('the approved reward and the bounty\'s: %s', async (_name, approved, state, charged) => {
    await ownerOn(approved);
    await solverReady();
    await merged();
    await settle();
    expect(await stateOf()).toBe(state);
    expect(s.charged()).toHaveLength(charged);
  });

  // PF20: the repositories offered are those where GitHub says this person opened bounty issues; another poster's are not theirs.
  it('your page offers only the repositories where you posted bounties, each with its open count and reward', async () => {
    const token = await ownerOn();
    // Another poster's bounty, really on the board: its repository is public and its poster has a GitHub id.
    r.standin.repositories.set('example-org/other', { language: 'TypeScript', visibility: 'public' });
    r.standin.accountIds.set('example-someone', 9100);
    await merged(issue(), issue({ id: 'bt-00000000000b', number: 2, repository: 'example-org/other', poster: 'example-someone', amount: 90 }));
    expect(await env.DB.prepare('SELECT poster_id FROM bounties WHERE id = ?').bind('bt-00000000000b').first()).toEqual({ poster_id: 9100 });
    const me = await (await handle(new Request(`${ORIGIN}/api/me`, { headers: { cookie: `__Host-board_session=${token}` } }), env)).json() as { pay: { yours: unknown[] } };
    expect(me.pay.yours).toEqual([{ repository: REPOSITORY, open: expect.any(Number), reward: 45 }]);
  });

  // PF20: the owner's tool reads this to name the one step only the signed-in page takes. Logins only.
  it('the public answer says whose bounties on a repository pay on merge, and nothing about the card or the amount', async () => {
    const read = async (repository: string, keys: object = {}) => {
      const response = await handle(new Request(`${ORIGIN}/api/pay-on-merge?repository=${encodeURIComponent(repository)}`), { ...env, ...keys });
      return { status: response.status, body: await response.json() as any };
    };
    expect((await read(REPOSITORY)).body).toEqual({ repository: REPOSITORY, set_up: true, on_for: [] });
    const token = await ownerOn(45);
    const on = await read(REPOSITORY);
    expect(on.body).toEqual({ repository: REPOSITORY, set_up: true, on_for: [OWNER] });
    expect(JSON.stringify(on.body)).not.toMatch(/pm_|cus_|visa|45|limit/i);
    expect((await read('example-org/other')).body.on_for).toEqual([]);
    // Removing the card turns it off for every repository.
    expect((await post('/api/me/pay', token, { remove_card: true })).status).toBe(200);
    expect((await read(REPOSITORY)).body.on_for).toEqual([]);
    expect((await read(REPOSITORY, { STRIPE_SECRET_KEY: '' })).body).toEqual({ repository: REPOSITORY, set_up: false, on_for: [] });
    for (const bad of ['', 'no-slash', '../../etc', 'a/b/c', `${'x'.repeat(40)}/y`]) expect((await read(bad)).status, bad).toBe(400);
  });
  it('a repository saved with no limit of its own is refused, and nothing changes', async () => {
    const token = await ownerOn();
    const answer = await post('/api/me/pay', token, { repositories: [{ repository: REPOSITORY }] });
    expect(answer.status).toBe(400);
    expect(answer.body.error).toContain('Nothing changed');
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
    expect(s.calls.filter(call => call.startsWith('POST /v1/payment_intents'))).toHaveLength(1); // The claim stops them before Stripe, not only Stripe's key.
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
  it('after a lost row and a new card, so a new key: the payment on the account still answers', async () => {
    await ownerOn();
    await solverReady();
    await merged();
    await settle();
    await env.DB.prepare('DELETE FROM charges').run();
    await env.DB.prepare(`UPDATE pay_settings SET payment_method = 'pm_new' WHERE github_id = ?`).bind(OWNER_ID).run();
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

describe('decide alone', () => {
  const facts = (row: ChargeFacts['row']): ChargeFacts => ({
    amount: 45, poster: OWNER, on_at: new Date(NOW).toISOString(), recorded: false, row,
    landed: [{ number: 7, author: SOLVER, author_id: SOLVER_ID, merged_at: after, association: 'NONE', on_default: 1 }],
    card: { payment_method: 'pm_saved', customer: 'cus_1', limit: 45 }, solver: { account_id: 'acct_1', ready: true }
  });
  const at = NOW + 10 * MINUTE;
  it('charges when nothing stands in the way', () => expect(decide(facts(null), at).act).toBe('charge'));
  for (const state of ['paid', 'refunded', 'disputed', 'owner-must-authenticate', 'owner-paying'] as const) {
    it(`never charges from ${state}`, () => expect(decide(facts({ state, payment_method: 'pm_saved', at: at - 60 * MINUTE }), at).act).toBe('nothing'));
  }
  it('leaves a fresh claim alone and picks up a stale one', () => {
    expect(decide(facts({ state: 'charging', payment_method: 'pm_saved', at: at - MINUTE }), at).act).toBe('nothing');
    expect(decide(facts({ state: 'charging', payment_method: 'pm_saved', at: at - 10 * MINUTE }), at).act).toBe('charge');
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
  it('a refusal that is not about the card does not read as a decline', async () => {
    await ownerOn();
    await solverReady();
    await merged();
    s.card = 'refused';
    await settle();
    expect(await stateOf()).toBe('stripe-refused');
    expect(s.charged()).toEqual([]);
  });
  for (const trouble of ['busy', 'limited'] as const) {
    it(`${trouble}: says nothing about the card, and the next look pays once`, async () => {
      await ownerOn();
      await solverReady();
      await merged();
      s.card = trouble;
      await settle();
      expect(await stateOf()).toBe('charging');
      s.card = 'ok';
      r.clock.at += 10 * MINUTE;
      await settle();
      expect(await stateOf()).toBe('paid');
      expect(s.charged()).toHaveLength(1);
    });
  }
  it('Stripe down while the owner authenticates is a named answer, not a crash', async () => {
    const token = await ownerOn();
    await solverReady();
    await merged();
    s.card = 'authenticate';
    await settle();
    await s.stop();
    const page = await post(`/api/b/${ID}/authenticate`, token);
    expect(page.status).toBe(503);
    expect(page.body.error).toContain('Nothing was charged');
    await s.start();
  });
  // PF18, Stripe's real answers: a bad key is 401 and a key short of a permission is 403 more_permissions_required; a gone account is 403 account_invalid.
  it.each([
    ['a wrong or revoked key', 401, { error: { type: 'invalid_request_error', message: 'Invalid API Key provided' } }],
    ['a key short of a permission', 403, { error: { type: 'invalid_request_error', code: 'more_permissions_required', message: 'Permission denied.' } }]
  ])('%s does not blame the solver, and is tried again once the key is right', async (_name, status, body) => {
    await ownerOn();
    await solverReady();
    await merged();
    const real = env.STRIPE_API;
    env = { ...env, STRIPE_API: 'https://refusing.test' } as typeof env;
    const fetched = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => String(input instanceof Request ? input.url : input).startsWith('https://refusing.test') ? new Response(JSON.stringify(body), { status }) : fetched(input, init)) as typeof fetch;
    try { await settle(); } finally { globalThis.fetch = fetched; }
    expect(await stateOf()).toBe('charging');
    expect(s.intents).toEqual([]);
    env = { ...env, STRIPE_API: real } as typeof env;
    await env.DB.prepare('UPDATE charges SET at = ? WHERE bounty_id = ?').bind(NOW - 10 * MINUTE, ID).run();
    await settle();
    expect(await stateOf()).toBe('paid');
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
    const { STRIPE_SECRET_KEY: _key, ...without } = env;
    env = without;
    await settle();
    expect(s.calls).toEqual([]);
    const refused = await post('/api/me/card', await signIn(OWNER_ID, OWNER));
    expect(refused.status).toBe(409);
    expect(refused.body.error).toContain('not set up');
  });
});

describe('the live database', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const read = (name: string) => readFileSync(join(here, '../../packages/box-platform', name), 'utf8');
  const columns = (db: DatabaseSync, table: string) => (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(row => row.name).sort();
  it('an existing board, migrated, has the same columns as a new one', () => {
    const schema = read('schema.sql');
    const old = schema.replace(/^\s*poster_id INTEGER,\r?\n/m, '').replace(/^\s*author_id INTEGER,\r?\n/m, '');
    expect(old).not.toBe(schema);
    const existing = new DatabaseSync(':memory:');
    existing.exec(old);
    expect(columns(existing, 'bounties')).not.toContain('poster_id');
    existing.exec(read('migrations/pf11.sql'));
    existing.exec(schema);
    const fresh = new DatabaseSync(':memory:');
    fresh.exec(schema);
    for (const table of ['bounties', 'pull_requests', 'stripe_accounts', 'pay_settings', 'pay_repositories', 'charges']) expect(columns(existing, table)).toEqual(columns(fresh, table));
    existing.close();
    fresh.close();
  });
  it('a board from before PF19, migrated: each repository already on takes its owner\'s one limit', () => {
    const schema = read('schema.sql');
    const old = schema.replace(/^\s*limit_per_bounty INTEGER,\r?\n/m, '');
    expect(old).not.toBe(schema);
    const existing = new DatabaseSync(':memory:');
    existing.exec(old);
    existing.exec(`INSERT INTO pay_settings (github_id, customer_id, payment_method, limit_per_bounty) VALUES (1, 'cus_1', 'pm_1', 80), (2, 'cus_2', 'pm_2', 20)`);
    existing.exec(`INSERT INTO pay_repositories (github_id, repository, on_at) VALUES (1, 'a/one', '2026-11-01'), (1, 'a/two', '2026-11-01'), (2, 'b/one', '2026-11-01')`);
    existing.exec(read('migrations/pf19.sql'));
    existing.exec(schema);
    expect(existing.prepare('SELECT repository, limit_per_bounty FROM pay_repositories ORDER BY repository').all().map(row => [row['repository'], row['limit_per_bounty']])).toEqual([['a/one', 80], ['a/two', 80], ['b/one', 20]]);
    const fresh = new DatabaseSync(':memory:');
    fresh.exec(schema);
    expect(columns(existing, 'pay_repositories')).toEqual(columns(fresh, 'pay_repositories'));
    existing.close();
    fresh.close();
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

describe('the owner\'s own click (PF13)', () => {
  const send = (event: object) => {
    const body = JSON.stringify(event);
    const at = Math.floor((r.clock.at) / 1000);
    return handle(new Request(`${ORIGIN}/api/stripe/webhook`, { method: 'POST', headers: { 'stripe-signature': `t=${at},v1=${createHmac('sha256', WEBHOOK_SECRET).update(`${at}.${body}`).digest('hex')}` }, body }), env);
  };
  const pay = (token: string | null, body: unknown = {}) => post(`/api/b/${ID}/pay`, token, body);
  const view = async (token: string | null) => (await handle(new Request(`${ORIGIN}/api/b/${ID}/payment`, { headers: token === null ? {} : { cookie: `__Host-board_session=${token}` } }), env)).json() as Promise<any>;
  const ready = async () => { const token = await signIn(OWNER_ID, OWNER); const account = await solverReady(); await merged(); return { token, account }; };
  const pageOf = (url: string) => url.split('/').pop()!;
  const completed = (account: string, session: string, intent: string, payment_status = 'paid') => ({ type: 'checkout.session.completed', account, data: { object: { id: session, payment_intent: intent, payment_status } } });

  it('needs no saved card and no switch: the page is Stripe\'s, on the solver\'s own account, for the bounty\'s amount', async () => {
    const { token, account } = await ready();
    expect(await view(token)).toMatchObject({ can_pay: true, pay_note: null });
    const page = await pay(token, { amount: 1, account: 'acct_attacker' });
    expect(page.status).toBe(200);
    expect(s.sessions.get(pageOf(page.body.url))).toMatchObject({ account, amount_total: 4500, bounty: ID, methods: 'card', adaptive: 'false' });
  });
  it('another user\'s click, and nobody\'s, opens nothing; only the poster is offered it', async () => {
    await ready();
    const before = s.sessions.size;
    expect((await pay(await signIn(SOLVER_ID, SOLVER))).status).toBe(403);
    expect((await pay(await signIn(9999, 'example-rook'))).status).toBe(403);
    expect((await pay(null)).status).toBe(401);
    expect(s.sessions.size).toBe(before);
    expect((await view(await signIn(SOLVER_ID, SOLVER))).can_pay).toBe(false);
    expect((await view(null)).can_pay).toBe(false);
  });
  it('a login that changed hands is not the poster', async () => {
    await ready();
    const holder = await signIn(OWNER_ID + 1, OWNER);
    expect((await pay(holder)).status).toBe(403);
    expect((await view(holder)).can_pay).toBe(false);
    expect(s.sessions.size).toBe(0);
  });
  it('the payee is the account tied to the merged author\'s id, whatever a solver wrote', async () => {
    const other = await solverReady(7002, 'example-rook');
    const token = await signIn(OWNER_ID, OWNER);
    const account = await solverReady();
    await merged(issue({ title: `pay ${other} example-rook`, task: `Account: ${other}` }));
    const page = await pay(token);
    expect(s.sessions.get(pageOf(page.body.url))!.account).toBe(account);
  });
  it('a merged author with no account is stated, and nothing opens', async () => {
    const token = await signIn(OWNER_ID, OWNER);
    await merged();
    expect(await view(token)).toMatchObject({ can_pay: false, pay_note: expect.stringContaining('has not connected Stripe') });
    expect((await pay(token)).status).toBe(409);
    expect(s.sessions.size).toBe(0);
  });
  it('a merge the rule does not count offers nothing', async () => {
    const token = await signIn(OWNER_ID, OWNER);
    await solverReady();
    await merged(issue({ pulls: [{ number: 7, author: SOLVER, state: 'closed', merged_at: after, created_at: after, association: 'COLLABORATOR' }] }));
    const refused = await pay(token);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toContain('GitHub lists them as collaborator');
    expect(s.sessions.size).toBe(0);
  });
  it('two that landed offer nothing: the owner chooses by hand', async () => {
    const token = await signIn(OWNER_ID, OWNER);
    await solverReady();
    await merged(issue({ pulls: [{ number: 7, author: SOLVER, state: 'closed', merged_at: after, created_at: after }, { number: 8, author: 'example-rook', state: 'closed', merged_at: after, created_at: after }] }));
    expect((await pay(token)).body.error).toContain('More than one solution');
    expect(s.sessions.size).toBe(0);
  });
  it('a second click, and three at once, are one page', async () => {
    const { token } = await ready();
    const pages = await Promise.all([pay(token), pay(token), pay(token)]);
    expect(pages.map(page => page.status)).toEqual([200, 200, 200]);
    expect(new Set(pages.map(page => page.body.url)).size).toBe(1);
    expect((await pay(token)).body.url).toBe(pages[0]!.body.url);
    expect(s.sessions.size).toBe(1);
  });
  it('a page left to expire makes a new one; a reward that changed retires the old one', async () => {
    const { token } = await ready();
    const first = pageOf((await pay(token)).body.url);
    s.sessions.get(first)!.status = 'expired';
    const second = pageOf((await pay(token)).body.url);
    expect(second).not.toBe(first);
    await env.DB.prepare('UPDATE bounties SET amount = 50 WHERE id = ?').bind(ID).run();
    const third = pageOf((await pay(token)).body.url);
    expect(s.sessions.get(second)!.status).toBe('expired');
    expect(s.sessions.get(third)!.amount_total).toBe(5000);
  });
  it('a paid bounty clicked again opens nothing, by the webhook or by reading Stripe', async () => {
    const { token, account } = await ready();
    const session = pageOf((await pay(token)).body.url);
    const intent = s.payPage(session);
    expect((await send(completed(account, session, intent.id))).status).toBe(200);
    expect(await stateOf()).toBe('paid');
    const again = await pay(token);
    expect(again.status).toBe(409);
    expect(s.sessions.size).toBe(1);
    expect(s.charged()).toHaveLength(1);
    expect((await view(token)).can_pay).toBe(false);
  });
  it('back from Stripe before the webhook: the owner\'s page reads it, and only the poster\'s look asks', async () => {
    const { token } = await ready();
    const session = pageOf((await pay(token)).body.url);
    s.payPage(session);
    const calls = s.calls.length;
    await view(await signIn(SOLVER_ID, SOLVER));
    expect(s.calls.length).toBe(calls);
    expect(await stateOf()).toBe('owner-paying');
    expect((await view(token)).payment).toMatchObject({ state: 'recorded', recorded_paid: { source: 'stripe' } });
    expect(await stateOf()).toBe('paid');
  });
  it('a payment made but lost to the board is found before a new page opens', async () => {
    const { token } = await ready();
    const session = pageOf((await pay(token)).body.url);
    s.payPage(session);
    await env.DB.prepare('DELETE FROM charges WHERE bounty_id = ?').bind(ID).run();
    expect((await pay(token)).body).toEqual({ paid: true });
    expect(s.sessions.size).toBe(1);
  });
  it('a forged event changes nothing, and a session that completed unpaid is not paid', async () => {
    const { token, account } = await ready();
    const session = pageOf((await pay(token)).body.url);
    const event = JSON.stringify(completed(account, session, 'pi_x'));
    expect((await handle(new Request(`${ORIGIN}/api/stripe/webhook`, { method: 'POST', headers: { 'stripe-signature': 't=1,v1=00' }, body: event }), env)).status).toBe(400);
    expect(await stateOf()).toBe('owner-paying');
    await send(completed(account, session, 'pi_x', 'unpaid'));
    expect(await stateOf()).toBe('owner-paying');
    await send(completed('acct_other', session, 'pi_x'));
    expect(await stateOf()).toBe('owner-paying');
  });
  it('a refund after Stripe\'s page changes the record, and a repeated success does not undo it', async () => {
    const { token, account } = await ready();
    const session = pageOf((await pay(token)).body.url);
    const intent = s.payPage(session);
    await send(completed(account, session, intent.id));
    await send({ type: 'charge.refunded', account, data: { object: { payment_intent: intent.id, refunded: true } } });
    expect(await stateOf()).toBe('refunded');
    await send({ type: 'payment_intent.succeeded', account, data: { object: { id: intent.id } } });
    expect(await stateOf()).toBe('refunded');
  });
  it('the machine stays away once the owner has clicked, and the click waits for a charge in flight', async () => {
    const token = await ownerOn();
    await solverReady();
    await merged();
    await pay(token);
    const atOf = async () => (await env.DB.prepare('SELECT at FROM charges WHERE bounty_id = ?').bind(ID).first<{ at: number }>())!.at;
    const claimed = await atOf();
    r.clock.at += 60 * MINUTE;
    await settle();
    expect(s.calls.filter(call => call.startsWith('POST /v1/payment_intents'))).toEqual([]);
    expect(await stateOf()).toBe('owner-paying');
    expect(await atOf()).toBe(claimed); // Not even looked at: a later click's claim rests on this time.
    await env.DB.prepare(`UPDATE charges SET state = 'charging' WHERE bounty_id = ?`).bind(ID).run();
    const refused = await pay(token);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toContain('has not finished');
  });
  it('a declined pay on merge falls back to the button, over the limit does too, and a card to authenticate keeps its own page', async () => {
    const token = await ownerOn();
    await solverReady();
    await merged();
    s.card = 'declined';
    await settle();
    expect(await stateOf()).toBe('declined');
    expect((await view(token)).can_pay).toBe(true);
    expect((await pay(token)).status).toBe(200);
    await env.DB.prepare(`UPDATE charges SET state = 'refused-over-limit' WHERE bounty_id = ?`).bind(ID).run();
    expect((await view(token)).can_pay).toBe(true);
    await env.DB.prepare(`UPDATE charges SET state = 'owner-must-authenticate' WHERE bounty_id = ?`).bind(ID).run();
    expect(await view(token)).toMatchObject({ can_pay: false, can_authenticate: true });
    expect((await pay(token)).status).toBe(409);
  });
  it('a payment recorded by hand opens nothing', async () => {
    const { token } = await ready();
    await post(`/api/b/${ID}/paid`, token, { to: SOLVER });
    expect((await pay(token)).status).toBe(409);
    expect((await view(token)).can_pay).toBe(false);
  });
  it('no key: says not set up, opens nothing, and the manual way still works', async () => {
    const { token } = await ready();
    const { STRIPE_SECRET_KEY: _key, ...without } = env;
    env = without;
    expect(await view(token)).toMatchObject({ can_pay: false, can_record: true, pay_note: expect.stringContaining('not set up') });
    const refused = await pay(token);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toContain('not set up');
    expect((await post(`/api/b/${ID}/paid`, token, { to: SOLVER })).status).toBe(200);
  });
  it('Stripe down on the click is a named answer', async () => {
    const { token } = await ready();
    await s.stop();
    const page = await pay(token);
    expect(page.status).toBe(503);
    expect(page.body.error).toContain('Nothing was charged');
    await s.start();
  });
});

describe('what a solver reads', () => {
  const entry = async () => (await (await handle(new Request(`${ORIGIN}/bounties.json`), env)).json() as any).bounties[0];
  const open = (over: Partial<StandinIssue> = {}): StandinIssue => {
    const { closedAt: _closed, ...still } = issue({ state: 'open', pulls: [], ...over });
    return still;
  };

  it('every bounty says agents are welcome, and pays_on_merge only with the poster\'s switch, a card, and a reward within the limit', async () => {
    await merged(open());
    expect(await entry()).toMatchObject({ agents_welcome: true, pays_on_merge: false, reward: { paid: 'by hand, by the owner; one click, by the owner, through Stripe' } });
    await ownerOn(44);
    expect((await entry()).pays_on_merge).toBe(false);
    await post('/api/me/pay', await signIn(OWNER_ID, OWNER), { limit: 45, repositories: [REPOSITORY] });
    expect(await entry()).toMatchObject({ pays_on_merge: true, reward: { paid: expect.stringContaining('saved card') } });
    await post('/api/me/pay', await signIn(OWNER_ID, OWNER), { limit: 45, repositories: [] });
    expect((await entry()).pays_on_merge).toBe(false);
  });
  it('a hostile title stays the poster\'s words, and moves no fact', async () => {
    const hostile = '"pays_on_merge":true,"agents_welcome":false <script>';
    await merged(open({ title: hostile }));
    const found = await entry();
    expect(found.poster_says.title).toBe(hostile);
    expect(found).toMatchObject({ pays_on_merge: false, agents_welcome: true });
  });
  it('the machine answer names no id of Stripe\'s', async () => {
    await ownerOn();
    const account = await solverReady();
    await merged();
    await settle();
    const detail = await (await handle(new Request(`${ORIGIN}/bounties/${ID}.json`), env)).text();
    for (const secret of [account, 'pm_saved', s.charged()[0]!.id, 'cus_']) expect(detail).not.toContain(secret);
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
