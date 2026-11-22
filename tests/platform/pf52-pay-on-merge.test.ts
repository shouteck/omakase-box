import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handle } from '../../packages/box-platform/src/api.js';
import worker from '../../packages/box-platform/src/worker.js';
import { GitHub } from '../../packages/box-platform/src/github.js';
import { readPaymentComments } from '../../packages/box-platform/src/payment-comment.js';
import { decidePay, payeeFacts, paySaved, settleCharges } from '../../packages/box-platform/src/charge.js';
import { listIssue } from '../../packages/box-platform/src/listing.js';
import { applyPayPalEvent, settlePayPal } from '../../packages/box-platform/src/paypal-pay.js';
import { refreshUntilDone, rig, MINUTE, NOW, type Rig } from './support.js';
import { StripeStandin } from './stripe-standin.js';
import { PayPalStandin } from './paypal-standin.js';
import type { StandinIssue } from '../../packages/box-platform/standin/standin.js';
import { chooseRail } from '../../packages/box-platform/src/payment-rail.js';

const ORIGIN = 'https://board.test';
const REPO = 'owner/project';
const OWNER = { github_id: 8001, login: 'owner' };
const SOLVER = 'solver';
const at = (minutes: number) => new Date(NOW + minutes * MINUTE).toISOString();
let r: Rig;
let stripe: StripeStandin;
let paypal: PayPalStandin;
let id: string;
let issue: StandinIssue;
const get = async (path: string, token?: string) => handle(new Request(`${ORIGIN}${path}`, { headers: token ? { cookie: `__Host-board_session=${token}` } : {} }), r.env);
const post = async (path: string, body: unknown, token?: string) => handle(new Request(`${ORIGIN}${path}`, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json', ...(token ? { cookie: `__Host-board_session=${token}` } : {}) }, body: JSON.stringify(body) }), r.env);
async function session(githubId = OWNER.github_id, login = OWNER.login) {
  const token = `session-${githubId}`;
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map(b => b.toString(16).padStart(2, '0')).join('');
  await r.env.DB.prepare('INSERT OR REPLACE INTO sessions (token_hash, github_id, login, expires_at) VALUES (?, ?, ?, ?)').bind(digest, githubId, login, NOW + 86400000).run();
  return token;
}
async function card(limit = 50) {
  await r.env.DB.prepare(`INSERT INTO pay_settings (github_id, customer_id, payment_method, limit_per_bounty) VALUES (?, 'cus_owner', 'pm_owner', ?)`).bind(OWNER.github_id, limit).run();
}
async function connectedStripe(ready = true) {
  stripe.accounts.set('acct_solver', { charges_enabled: ready });
  await r.env.DB.prepare(`INSERT INTO stripe_accounts (github_id, account_id, ready) VALUES (7001, 'acct_solver', ?)`).bind(ready ? 1 : 0).run();
}
async function vault(limit = 50) {
  await r.env.DB.prepare(`INSERT INTO paypal_vault (github_id, payment_token, label, limit_per_bounty) VALUES (?, 'VAULT1', 'Saved PayPal', ?)`).bind(OWNER.github_id, limit).run();
  await r.env.DB.prepare(`INSERT INTO paypal_accounts (github_id, payer_id, at) VALUES (7001, 'SOLVERPAYPAL1', ?)`).bind(NOW).run();
}
async function preference(rail: 'stripe' | 'paypal', fallback = false) {
  expect((await post('/api/me/payment-rail', { rail, fallback }, await session())).status).toBe(200);
}
async function switched(minutes = 0) {
  await r.env.DB.prepare('INSERT INTO pay_repositories (github_id, repository, on_at, limit_per_bounty) VALUES (?, ?, ?, 50)').bind(OWNER.github_id, REPO, at(minutes)).run();
}
async function approve(suffix = ' on merge', minutes = 1) {
  issue.comments = [{ login: OWNER.login, body: `OMAKASE APPROVE ${id.toUpperCase()} $45${suffix.toUpperCase()}`, association: 'OWNER', created_at: at(minutes) }];
  r.clock.at = NOW + 20 * MINUTE;
  await refreshUntilDone(r);
}
async function state() { return (await r.env.DB.prepare('SELECT state, provider FROM charges WHERE bounty_id = ?').bind(id).first<{ state: string; provider: string | null }>()) ?? null; }
async function fact() { return (await (await get(`/api/b/${id}`)).json() as any).bounty; }
async function settleTwice() { await settleCharges(r.env); r.clock.at += 10 * MINUTE; await settleCharges(r.env); }

beforeEach(async () => {
  r = await rig('standin-read'); stripe = new StripeStandin(); paypal = new PayPalStandin();
  Object.assign(r.env, { STRIPE_SECRET_KEY: 'standin', STRIPE_API: await stripe.start(), PAYPAL_CLIENT_ID: 'standin', PAYPAL_SECRET: 'standin', PAYPAL_API: await paypal.start(), GITHUB_WEB: r.env.GITHUB_API, GITHUB_OAUTH_CLIENT_ID: r.standin.oauthClientId, GITHUB_OAUTH_CLIENT_SECRET: r.standin.oauthClientSecret });
  r.standin.repositories.set(REPO, { visibility: 'public', language: 'TypeScript' });
  r.standin.accountIds.set(OWNER.login, OWNER.github_id); r.standin.accountIds.set(SOLVER, 7001);
  issue = { id: 'plain-12', plain: true, repository: REPO, number: 12, title: 'Fix it', task: 'Fix it', poster: OWNER.login, amount: 0, createdAt: at(-10), state: 'open',
    pulls: [{ number: 41, author: SOLVER, state: 'closed', merged_at: at(5), created_at: at(2) }] };
  r.standin.issues.push(issue);
  const listed = await listIssue(r.env, OWNER, `https://github.com/${REPO}/issues/12`, 45, NOW, undefined, true);
  expect(listed).toHaveProperty('id'); id = (listed as { id: string }).id;
});
afterEach(async () => { vi.restoreAllMocks(); await stripe.stop(); await paypal.stop(); await r.close(); });

describe('PF52: explicit saved payment rail choice', () => {
  async function both() { await card(); await connectedStripe(); await vault(); }
  async function commands(body: string) {
    r.clock.at += MINUTE;
    issue.comments!.push({ login: OWNER.login, association: 'OWNER', body, created_at: new Date(r.clock.at).toISOString() });
    const github = new GitHub(r.env, false);
    try { await readPaymentComments(r.env, github, id, REPO, 12); } finally { await github.settle(); }
  }
  async function unavailable(rail: 'stripe' | 'paypal') {
    if (rail === 'stripe') { await r.env.DB.prepare('UPDATE stripe_accounts SET ready = 0').run(); stripe.accounts.set('acct_solver', { charges_enabled: false }); }
    else await r.env.DB.prepare('DELETE FROM paypal_accounts').run();
  }
  const expectRail = (rail: 'stripe' | 'paypal' | null) => {
    expect(stripe.charged()).toHaveLength(rail === 'stripe' ? 1 : 0);
    expect(paypal.captures).toHaveLength(rail === 'paypal' ? 1 : 0);
  };
  it('uses only the saved rail, including empty settings, and never silently picks between two', () => {
    const base = { stripe: false, paypal: false, rail: null, fallback: false };
    expect(chooseRail(base)).toMatchObject({ saved_rails: [], chosen_rail: null, selected_rail: null, needs_choice: false });
    expect(chooseRail({ ...base, stripe: true, rail: 'paypal' })).toMatchObject({ chosen_rail: 'stripe' });
    expect(chooseRail({ ...base, paypal: true, rail: 'stripe' })).toMatchObject({ chosen_rail: 'paypal' });
    expect(chooseRail({ ...base, stripe: true, paypal: true })).toMatchObject({ needs_choice: true, chosen_rail: null });
  });
  it.each(['stripe', 'paypal'] as const)('both saved wait for a %s choice, with matching public API/MCP/setup facts and a safe choice link', async rail => {
    await both(); await approve(); await settleTwice();
    expect(await state()).toMatchObject({ state: 'choose-rail' }); expectRail(null);
    const view = await fact();
    expect(view).toMatchObject({ pays_on_merge: false, pay_on_merge: { will_pay: false, rail_choice: { saved_rails: ['stripe', 'paypal'], chosen_rail: null, fallback: false, choice_url: `${ORIGIN}/setup/payment-rail/?bounty=${id}` } } });
    expect(view.pay_on_merge.reasons.join(' ')).toContain('Choose the default payment rail');
    const setup = await (await get(`/api/payment-setup/poster?bounty=${id}`)).json() as any;
    expect(setup).toMatchObject({ rail_choice: { saved_rails: ['stripe', 'paypal'], chosen_rail: null, fallback: false }, choice_url: view.pay_on_merge.rail_choice.choice_url });
    const mcp = await post('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_poster_payment_setup', arguments: { bounty: id } } });
    expect(await mcp.json()).toMatchObject({ result: { structuredContent: { rail_choice: setup.rail_choice } } });
    expect((await get('/setup/payment-rail/')).headers.get('location')).toBe('/auth/github');
    expect((await get('/setup/payment-rail/', await session())).headers.get('location')).toBe('/me/#pay');
    await preference(rail); r.clock.at += 10 * MINUTE; await settleTwice(); expectRail(rail);
  });
  it('requires the signed-in owner, an available rail, JSON and explicit fallback, without provider calls', async () => {
    expect((await post('/api/me/payment-rail', { rail: 'stripe', fallback: false })).status).toBe(401);
    const owner = await session();
    expect((await post('/api/me/payment-rail', { rail: 'stripe', fallback: false }, owner)).status).toBe(409);
    await both();
    for (const body of [{}, { rail: 'stripe' }, { rail: 'cash', fallback: false }, { rail: 'paypal', fallback: 1 }]) expect((await post('/api/me/payment-rail', body, owner)).status).toBe(400);
    const csrf = await handle(new Request(`${ORIGIN}/api/me/payment-rail`, { method: 'POST', headers: { origin: 'https://evil.test', 'content-type': 'application/json', cookie: `__Host-board_session=${owner}` }, body: '{"rail":"stripe","fallback":true}' }), r.env);
    expect(csrf.status).toBe(403);
    expect((await post('/api/me/payment-rail', { rail: 'stripe', fallback: false }, await session(8002, 'other'))).status).toBe(409);
    await preference('paypal', true);
    expect(await r.env.DB.prepare('SELECT * FROM payment_preferences').first()).toEqual({ github_id: OWNER.github_id, rail: 'paypal', fallback: 1 });
    expect(stripe.calls).toEqual([]); expect(paypal.calls).toEqual([]);
  });
  it.each(['stripe', 'paypal'] as const)('honors on-merge via %s over the opposite account choice', async rail => {
    await both(); await preference(rail === 'stripe' ? 'paypal' : 'stripe', true); await approve(` on merge via ${rail}`); await settleTwice();
    expectRail(rail);
    expect(await r.env.DB.prepare('SELECT merge_rail FROM bounties WHERE id = ?').bind(id).first()).toEqual({ merge_rail: rail });
    expect((await fact()).pay_on_merge.rail_choice).toMatchObject({ chosen_rail: rail, override: rail, fallback: false });
  });
  it.each(['stripe', 'paypal'] as const)('a via %s approval is sufficient with both saved and no account choice', async rail => {
    await both(); await approve(` on merge via ${rail}`); await settleTwice(); expectRail(rail);
    expect(await r.env.DB.prepare('SELECT * FROM payment_preferences').first()).toBeNull();
  });
  it.each([
    ['stripe', false], ['stripe', true], ['paypal', false], ['paypal', true]
  ] as const)('uses fallback from %s only with permission=%s and only for missing payout readiness', async (rail, fallback) => {
    await both(); await unavailable(rail); await preference(rail, fallback); await approve(); await settleTwice();
    expectRail(fallback ? rail === 'stripe' ? 'paypal' : 'stripe' : null);
    if (!fallback) {
      expect(await state()).toMatchObject({ state: 'solver-not-ready' });
      await preference(rail === 'stripe' ? 'paypal' : 'stripe', true); r.clock.at += 10 * MINUTE; await settleTwice(); expectRail(null);
    }
  });
  it.each(['stripe', 'paypal'] as const)('via %s never falls back, even with account fallback enabled', async rail => {
    await both(); await unavailable(rail); await preference(rail, true); await approve(` on merge via ${rail}`); await settleTwice();
    expectRail(null); expect(await state()).toMatchObject({ state: 'solver-not-ready' });
    expect((await fact()).pay_on_merge.rail_choice).toMatchObject({ chosen_rail: rail, selected_rail: rail, fallback: false });
  });
  it.each([
    ['stripe', 'limit'], ['paypal', 'limit'], ['stripe', 'declined'], ['paypal', 'declined']
  ] as const)('does not use fallback after a ready %s rail fails its %s check', async (rail, failure) => {
    await both(); await preference(rail, true); await approve();
    if (failure === 'limit') await r.env.DB.prepare(`UPDATE ${rail === 'stripe' ? 'pay_settings' : 'paypal_vault'} SET limit_per_bounty = 40`).run();
    else if (rail === 'stripe') stripe.card = 'declined'; else paypal.vaultDeclined = true;
    await settleTwice(); expectRail(null);
    expect(await state()).toMatchObject({ state: failure === 'limit' ? 'refused-over-limit' : 'declined' });
    expect(rail === 'stripe' ? paypal.orders : stripe.intents).toHaveLength(0);
  });
  it.each(['stripe', 'paypal'] as const)('keeps a %s-unready merge terminal even when a fresh command changes its refusal state', async rail => {
    const other = rail === 'stripe' ? 'paypal' : 'stripe';
    await both(); await unavailable(rail); await preference(rail); await approve(); await settleTwice();
    expect(await state()).toMatchObject({ state: 'solver-not-ready' });
    await r.env.DB.prepare(`UPDATE ${other === 'stripe' ? 'pay_settings' : 'paypal_vault'} SET limit_per_bounty = 40`).run();
    await commands(`omakase pay ${id} $45 to @solver via ${other}`);
    expect(await state()).toMatchObject({ state: 'refused-over-limit' });
    await r.env.DB.prepare(`UPDATE ${other === 'stripe' ? 'pay_settings' : 'paypal_vault'} SET limit_per_bounty = 50`).run();
    await preference(other); r.clock.at += 10 * MINUTE; await settleTwice(); expectRail(null);
    expect((await fact()).pay_on_merge.reasons.join(' ')).toContain('Automatic charge on merge is off for this bounty');
    await commands(`omakase pay ${id} $45 to @solver via ${other}`); await settleTwice(); expectRail(other);
  });
  it.each(['stripe', 'paypal'] as const)('an exact agent pay via %s overrides the default without a merge; an old choose-rail command is not queued', async rail => {
    await both(); Object.assign(issue.pulls![0]!, { state: 'open', landed: false }); delete issue.pulls![0]!.merged_at;
    await approve(''); await commands(`omakase pay ${id} $45 to @solver`);
    expect(await state()).toMatchObject({ state: 'choose-rail' }); expectRail(null);
    await preference(rail === 'stripe' ? 'paypal' : 'stripe', true); await settleTwice(); expectRail(null);
    await commands(`OMAKASE PAY ${id.toUpperCase()} $45 TO @SOLVER VIA ${rail.toUpperCase()}`); await settleTwice(); expectRail(rail);
    expect(await state()).toMatchObject({ state: 'paid', provider: rail === 'paypal' ? 'paypal' : null });
  });
  it.each(['stripe', 'paypal'] as const)('an agent pay via %s cannot fall back when the chosen solver payout is missing', async rail => {
    await both(); await unavailable(rail); await preference(rail, true);
    Object.assign(issue.pulls![0]!, { state: 'open', landed: false }); delete issue.pulls![0]!.merged_at;
    await approve(''); await commands(`omakase pay ${id} $45 to @solver via ${rail}`); await settleTwice();
    expectRail(null); expect(await state()).toMatchObject({ state: 'solver-not-ready' });
  });
  it.each([' on merge via cash', ' on merge via stripe please', ' via paypal', ' on merge via paypal via stripe'])('keeps malformed approval pending: %s', async suffix => {
    await both(); await approve(suffix); await settleTwice(); expectRail(null); expect((await fact()).approval.state).toBe('pending');
  });
  it('rejects a via suffix on paid and any extra prose or unknown rail on pay', async () => {
    await both(); await preference('stripe'); await approve('');
    for (const body of [`omakase paid ${id} $45 to @solver via stripe`, `omakase pay ${id} $45 to @solver via cash`, `omakase pay ${id} $45 to @solver via stripe please`]) await commands(body);
    expectRail(null); expect(await state()).toBeNull(); expect(await r.env.DB.prepare('SELECT * FROM paid_clicks').first()).toBeNull();
  });
  it.each(['stripe-first', 'paypal-first'] as const)('saving a second method prompts for a default and sets only the answer: %s, including setup deep-link return', async order => {
    const owner = await session();
    const saveStripe = async () => {
      const started = await post('/api/me/card', {}, owner); expect(started.status).toBe(200);
      const customer = await r.env.DB.prepare('SELECT customer_id FROM pay_settings WHERE github_id = ?').bind(OWNER.github_id).first<{ customer_id: string }>();
      stripe.sessionCustomer = customer!.customer_id;
      expect((await post('/api/me/card/saved', { session: 'cs_setup' }, owner)).status).toBe(200);
    };
    const savePayPal = async () => {
      expect((await post('/api/me/paypal/vault', {}, owner)).status).toBe(200);
      expect((await post('/api/me/paypal/vault/saved', { setup_token: 'SETUP1', limit: 50 }, owner)).status).toBe(200);
    };
    if (order === 'stripe-first') { await saveStripe(); await preference('stripe', true); await savePayPal(); }
    else { await savePayPal(); await preference('paypal', true); await saveStripe(); }
    const me = await (await get('/api/me', owner)).json() as any;
    expect(me.pay.rail_choice).toMatchObject({ saved_rails: ['stripe', 'paypal'], chosen_rail: null, account_rail: null, fallback: false, needs_choice: true });
    const returned = await handle(new Request(`${ORIGIN}/setup/finish/`, { headers: { cookie: `__Host-board_session=${owner}; __Host-board_setup_return=/b/${id}/` } }), r.env);
    expect(returned.headers.get('location')).toBe('/me/?choose-rail=1#pay');
    expect(returned.headers.get('set-cookie')).toBeNull();
    const choice = order === 'stripe-first' ? 'paypal' : 'stripe';
    await preference(choice);
    expect(await r.env.DB.prepare('SELECT rail, fallback FROM payment_preferences').first()).toEqual({ rail: choice, fallback: 0 });
    const finished = await handle(new Request(`${ORIGIN}/setup/finish/`, { headers: { cookie: `__Host-board_session=${owner}; __Host-board_setup_return=/b/${id}/` } }), r.env);
    expect(finished.headers.get('location')).toBe(`/b/${id}/`);
  });
});

describe('PF52: payout connection after a refused payment', () => {
  async function unconnected(rail: 'stripe' | 'paypal', automatic = true) {
    if (rail === 'stripe') { await card(); await connectedStripe(false); }
    else { await vault(); await r.env.DB.prepare('DELETE FROM paypal_accounts').run(); }
    if (!automatic) { Object.assign(issue.pulls![0]!, { state: 'open', landed: false }); delete issue.pulls![0]!.merged_at; }
    await approve(automatic ? ' on merge' : '');
    if (automatic) { await settleCharges(r.env); expect(await state()).toMatchObject({ state: 'solver-not-ready' }); }
  }
  async function connect(rail: 'stripe' | 'paypal') {
    if (rail === 'stripe') { await r.env.DB.prepare('UPDATE stripe_accounts SET ready = 1').run(); stripe.accounts.set('acct_solver', { charges_enabled: true }); }
    else await r.env.DB.prepare(`INSERT INTO paypal_accounts (github_id, payer_id, at) VALUES (7001, 'SOLVERPAYPAL1', ?)`).bind(r.clock.at).run();
  }
  async function comments() {
    const github = new GitHub(r.env, false);
    try { await readPaymentComments(r.env, github, id, REPO, 12); } finally { await github.settle(); }
  }
  it.each(['stripe', 'paypal'] as const)('never auto-retries a %s-unready merge after connection, retains explicit fallback facts, and accepts an outside record', async rail => {
    await unconnected(rail);
    const before = await fact();
    expect(before.pay_on_merge.solvers[0].setup_urls).toMatchObject({ stripe: expect.stringContaining('/setup/stripe-payouts/'), paypal: expect.stringContaining('/setup/paypal-payouts/') });
    expect(before.owed_now).toMatchObject({ amount: 45, pay_now: { comment: `omakase pay ${id} $45 to @<solver-login>` } });
    expect(before.owed_now.payout_setup_urls).toEqual(before.pay_on_merge.solvers[0].setup_urls);
    await connect(rail); r.clock.at += 10 * MINUTE; await settleTwice();
    expect(stripe.charged()).toHaveLength(0); expect(paypal.captures).toHaveLength(0);
    const after = await fact();
    expect(after.pays_on_merge).toBe(false); expect(after.pay_on_merge.will_pay).toBe(false);
    expect(after.pay_on_merge.reasons.join(' ')).toContain('Automatic charge on merge is off for this bounty');
    expect(after.pay_on_merge.reasons.join(' ')).toContain('one-click (Checkout or a fresh omakase pay comment)');
    expect((await post(`/api/b/${id}/paid`, { to: SOLVER }, await session())).status).toBe(200);
    expect((await (await get(`/bounties/${id}.json`)).json() as any).bounty.payment.recorded_paid.source).toBe('board');
    await settleTwice(); expect(stripe.charged()).toHaveLength(0); expect(paypal.captures).toHaveLength(0);
  });
  it.each(['stripe', 'paypal'] as const)('lets an owner actually complete %s Checkout after a terminal solver-not-ready merge', async rail => {
    await unconnected(rail); await connect(rail); r.clock.at += 10 * MINUTE; await settleTwice();
    expect(stripe.charged()).toHaveLength(0); expect(paypal.captures).toHaveLength(0);
    const owner = await session();
    const clicked = await post(`/api/b/${id}/${rail === 'stripe' ? 'pay' : 'pay-paypal'}`, { to: SOLVER }, owner);
    expect(clicked.status).toBe(200); expect(await clicked.json()).toMatchObject({ url: expect.stringContaining(rail === 'stripe' ? 'checkout.stripe.test' : 'sandbox.paypal.test') });
    if (rail === 'stripe') stripe.payPage([...stripe.sessions.keys()][0]!); else paypal.approve(paypal.orders[0]!.id);
    const view = await (await get(`/api/b/${id}/payment`, owner)).json() as any;
    expect(view.payment).toMatchObject({ state: 'recorded', recorded_paid: { source: rail } });
    await settleTwice(); expect(await state()).toMatchObject({ state: 'paid' });
    expect(stripe.charged()).toHaveLength(rail === 'stripe' ? 1 : 0); expect(paypal.captures).toHaveLength(rail === 'paypal' ? 1 : 0);
  });
  it.each(['stripe', 'paypal'] as const)('requires a fresh %s pay comment after solver connection; the old command never queues spending', async rail => {
    await unconnected(rail, false);
    const command = () => issue.comments!.push({ login: OWNER.login, association: 'OWNER', body: `omakase pay ${id} $45 to @solver`, created_at: new Date(r.clock.at).toISOString() });
    r.clock.at += MINUTE; command(); await comments();
    expect(await state()).toMatchObject({ state: 'solver-not-ready' });
    await connect(rail); r.clock.at += 10 * MINUTE; await comments(); await settleTwice();
    expect(stripe.charged()).toHaveLength(0); expect(paypal.captures).toHaveLength(0); expect(await state()).toMatchObject({ state: 'solver-not-ready' });
    r.clock.at += MINUTE; command(); await comments(); await comments(); await settleTwice();
    expect(await state()).toMatchObject({ state: 'paid' });
    expect(stripe.charged()).toHaveLength(rail === 'stripe' ? 1 : 0); expect(paypal.captures).toHaveLength(rail === 'paypal' ? 1 : 0);
  });
});

describe('PF52: owner and solver PayPal parity', () => {
  it('edits the saved PayPal limit without provider setup, with authentication, validation and private references', async () => {
    const owner = await session();
    expect((await post('/api/me/paypal/vault/limit', { limit: 75 })).status).toBe(401);
    expect((await post('/api/me/paypal/vault/limit', { limit: 75 }, owner)).status).toBe(409);
    await vault();
    const calls = paypal.calls.length;
    for (const limit of [undefined, 0, -1, 1.5, '50', 100001]) expect((await post('/api/me/paypal/vault/limit', { limit }, owner)).status).toBe(400);
    const csrf = await handle(new Request(`${ORIGIN}/api/me/paypal/vault/limit`, { method: 'POST', headers: { origin: 'https://elsewhere.test', 'content-type': 'application/json', cookie: `__Host-board_session=${owner}` }, body: JSON.stringify({ limit: 75 }) }), r.env);
    expect(csrf.status).toBe(403);
    expect((await post('/api/me/paypal/vault/limit', { limit: 100000 }, owner)).status).toBe(200);
    const shown = await (await get('/api/me/paypal/vault', owner)).json();
    expect(shown).toMatchObject({ saved: { label: 'Saved PayPal', limit_per_bounty: 100000 }, pay: { saved_paypal: true } });
    expect(JSON.stringify(shown)).not.toMatch(/VAULT1|payment_token|customer_id/);
    expect(paypal.calls).toHaveLength(calls);
  });
  it.each(['stripe', 'paypal', 'both-remove-stripe', 'both-remove-paypal'])('removes %s without disabling another saved rail', async mode => {
    const owner = await session();
    if (mode !== 'paypal') await card();
    if (mode !== 'stripe') await vault();
    await switched();
    const response = mode === 'stripe' || mode === 'both-remove-stripe'
      ? await post('/api/me/pay', { remove_card: true }, owner) : await post('/api/me/paypal/vault/remove', {}, owner);
    expect(response.status).toBe(200);
    const both = mode.startsWith('both');
    expect((await r.env.DB.prepare('SELECT COUNT(*) AS n FROM pay_repositories').first<{ n: number }>())?.n).toBe(both ? 1 : 0);
    const me = await (await get('/api/me', owner)).json() as any;
    expect(me.pay.repositories).toHaveLength(both ? 1 : 0);
    if (mode.endsWith('remove-stripe')) expect(me.pay).toMatchObject({ saved_paypal: true, card: null });
    if (mode.endsWith('remove-paypal')) expect(me.pay.card).not.toBeNull();
  });
  it('offers PayPal-only setup and repository switches, including a legacy repository default, and pays without Stripe', async () => {
    Object.assign(r.env, { STRIPE_SECRET_KEY: '' });
    const owner = await session();
    expect(await (await get('/api/me', owner)).json()).toMatchObject({ pay: { set_up: true, stripe_set_up: false, card: null } });
    await vault(); await approve(); await switched();
    await r.env.DB.prepare('UPDATE pay_repositories SET limit_per_bounty = NULL').run();
    expect(await (await get('/api/me', owner)).json()).toMatchObject({ pay: { saved_paypal: true, repositories: [{ limit: 50 }] } });
    expect((await post('/api/me/pay', { repositories: [{ repository: REPO, limit: 45 }] }, owner)).status).toBe(200);
    await r.env.DB.prepare(`UPDATE bounties SET source = 'posted', approval = NULL WHERE id = ?`).bind(id).run();
    await r.env.DB.prepare('UPDATE pull_requests SET merged_at = ? WHERE bounty_id = ?').bind(at(25), id).run();
    r.clock.at += 10 * MINUTE;
    await settleTwice(); expect(paypal.captures).toHaveLength(1); expect(stripe.charged()).toHaveLength(0);
  });
  it('names PayPal rather than a card or Stripe when a Vault payment is declined', async () => {
    await vault(); await approve(); paypal.vaultDeclined = true; await settleTwice();
    const payment = (await (await get(`/bounties/${id}.json`)).json() as any).bounty.payment;
    expect(payment.charge.words).toBe('PayPal declined the payment. Nothing was charged.');
    expect((await fact()).pay_on_merge.reasons).toContain(payment.charge.words);
    expect(JSON.stringify(payment.charge)).not.toMatch(/card was declined|from Stripe|provider prose/);
  });
  it.each(['refunded', 'disputed'])('keeps Vault captures in the %s history/watch path', async state => {
    await vault(); await approve(); await settleTwice();
    const charge = await r.env.DB.prepare('SELECT payment_intent FROM charges WHERE bounty_id = ?').bind(id).first<{ payment_intent: string }>();
    if (state === 'refunded') { paypal.captureStatus.set(charge!.payment_intent, 'REFUNDED'); await settlePayPal(r.env); }
    else await applyPayPalEvent(r.env, { event_type: 'CUSTOMER.DISPUTE.CREATED', resource: { disputed_transactions: [{ seller_transaction_id: charge!.payment_intent }] } }, r.clock.at);
    expect(await stateOf()).toBe(state);
    const payment = (await (await get(`/bounties/${id}.json`)).json() as any).bounty.payment;
    expect(payment.charge).toMatchObject({ state, words: expect.stringContaining('PayPal') });
    await settleTwice(); expect(paypal.captures).toHaveLength(1);
  });
  async function stateOf() { return (await state() as { state: string } | null)?.state; }
});

describe('PF52: prepared agent branch payments', () => {
  async function prepared(rail: 'stripe' | 'paypal' = 'stripe', limit = 50) {
    await r.env.DB.prepare('DELETE FROM bounties WHERE id = ?').bind(id).run();
    const commit = 'b'.repeat(40), tree = 'c'.repeat(40);
    const response = await post('/api/agents/prepare', { repository: REPO, commit, title: 'Fix it', task: 'Fix it', reward: 45, paths: ['src/fix.ts'] });
    expect(response.status).toBe(200);
    const published = await response.json() as any;
    id = published.id;
    Object.assign(issue, { id, plain: false, rawBody: published.issue.body, title: published.issue.title, amount: 45, createdAt: at(0), comments: [] });
    Object.assign(issue.pulls![0]!, { state: 'open', landed: false }); delete issue.pulls![0]!.merged_at;
    const nativeFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      if (url.origin === r.env.GITHUB_API && url.pathname.startsWith(`/repos/${REPO}/commits/box-bounty`)) return Promise.resolve(Response.json({ sha: commit, commit: { tree: { sha: tree } } }));
      if (url.origin === r.env.GITHUB_API && url.pathname === `/repos/${REPO}/git/trees/${tree}`) return Promise.resolve(Response.json({ truncated: false, tree: [{ path: 'src/fix.ts', type: 'blob', mode: '100644', sha: commit }] }));
      return nativeFetch(input, init);
    });
    const imported = await post('/api/agents/import', { issue: `https://github.com/${REPO}/issues/12`, reward: 45 });
    expect(imported.status).toBe(200);
    expect(await imported.json()).toMatchObject({ listed: id, pending: true, approve_with: `omakase approve ${id} $45` });
    if (rail === 'stripe') { await card(limit); await connectedStripe(); } else await vault(limit);
    await refreshUntilDone(r); await settleCharges(r.env);
    expect(stripe.charged()).toHaveLength(0); expect(paypal.captures).toHaveLength(0);
    expect(await r.env.DB.prepare('SELECT source, approval, listed_by_id FROM bounties WHERE id = ?').bind(id).first()).toEqual({ source: 'posted', approval: 'pending', listed_by_id: null });
  }
  async function merge(minutes = 21) {
    Object.assign(issue.pulls![0]!, { state: 'closed', merged_at: at(minutes), landed: true });
    r.clock.at += 20 * MINUTE; await refreshUntilDone(r);
  }
  it.each(['stripe', 'paypal'] as const)('pays a prepared branch once through %s with comment consent and no switch, with setup/payment/owed facts', async rail => {
    await prepared(rail); await approve(); await merge();
    const facts = await fact();
    expect(facts).toMatchObject({ source: 'posted', pays_on_merge: true, pay_on_merge: { will_pay: true, provider: rail === 'stripe' ? 'Stripe' : 'PayPal' }, owed_now: { amount: 45, payees: [{ login: SOLVER, methods: [] }] } });
    expect(facts.pay_on_merge.setup_urls).toMatchObject({ stripe: expect.stringContaining(`/setup/stripe-card/?bounty=${id}`), paypal: expect.stringContaining('/setup/paypal-vault/') });
    expect(facts.owed_now.record_payment.comment).toBe(`omakase paid ${id} $45 to @<solver-login>`);
    expect(facts.pay_on_merge.pay_now.comment).toBe(`omakase pay ${id} $45 to @<solver-login>`);
    expect(await r.env.DB.prepare('SELECT 1 FROM pay_repositories').first()).toBeNull();
    await settleTwice();
    expect(await state()).toMatchObject({ state: 'paid' });
    expect(stripe.charged()).toHaveLength(rail === 'stripe' ? 1 : 0); expect(paypal.captures).toHaveLength(rail === 'paypal' ? 1 : 0);
  });
  it.each(['plain', 'over-limit', 'old-merge', 'manual-prior'])('preserves the %s guard for prepared branch posts', async mode => {
    await prepared('stripe', mode === 'over-limit' ? 40 : 50);
    await approve(mode === 'plain' ? '' : ' on merge');
    if (mode === 'plain') await switched();
    if (mode === 'manual-prior') issue.comments!.push({ login: OWNER.login, association: 'OWNER', body: `omakase paid ${id} $45 to @solver`, created_at: at(22) });
    await merge(mode === 'old-merge' ? 0.5 : 21); await settleTwice();
    expect(stripe.charged()).toHaveLength(0); expect(paypal.captures).toHaveLength(0); expect((await fact()).pay_on_merge.will_pay).toBe(false);
  });
  it.each(['stripe', 'paypal'] as const)('a prepared branch via %s overrides the other default with both saved', async rail => {
    await prepared('stripe'); await vault(); await preference(rail === 'stripe' ? 'paypal' : 'stripe', true);
    await approve(` on merge via ${rail}`); await merge(); await settleTwice();
    expect(stripe.charged()).toHaveLength(rail === 'stripe' ? 1 : 0); expect(paypal.captures).toHaveLength(rail === 'paypal' ? 1 : 0);
    expect((await fact()).pay_on_merge.rail_choice).toMatchObject({ override: rail, fallback: false });
  });
  it.each(['pay', 'paid'])('processes the prepared poster’s %s comment without a session or repository switch', async command => {
    await prepared(); await approve('');
    if (command === 'paid') await merge();
    issue.comments!.push({ login: OWNER.login, association: 'OWNER', body: `OMAKASE ${command.toUpperCase()} ${id.toUpperCase()} $45 TO @SOLVER`, created_at: new Date(r.clock.at + MINUTE).toISOString() });
    for (let tick = 0; tick < 120 && (command === 'pay' ? (await state())?.state !== 'paid' : await r.env.DB.prepare('SELECT 1 FROM paid_clicks WHERE bounty_id = ?').bind(id).first() === null); tick += 1) {
      r.clock.at += MINUTE; await worker.scheduled(undefined, r.env);
    }
    const payment = (await (await get(`/bounties/${id}.json`)).json() as any).bounty.payment;
    expect(payment).toMatchObject({ state: 'recorded', recorded_paid: { source: command === 'pay' ? 'stripe' : 'board' } });
    await settleTwice(); expect(stripe.charged()).toHaveLength(command === 'pay' ? 1 : 0);
  });
});

describe('PF52: approved listed pay on merge', () => {
  it('pays a sessionless agent import once after on-merge approval and merge, never while pending', async () => {
    await r.env.DB.prepare('DELETE FROM bounties WHERE id = ?').bind(id).run();
    Object.assign(issue.pulls![0]!, { state: 'open', landed: false }); delete issue.pulls![0]!.merged_at;
    const imported = await handle(new Request(`${ORIGIN}/api/agents/import`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ issue: `https://github.com/${REPO}/issues/12`, reward: 45 })
    }), r.env);
    expect(imported.status).toBe(200);
    const pending = await imported.json() as { listed: string; pending: boolean; approve_with: string };
    id = pending.listed;
    expect(pending.pending).toBe(true);
    expect(await r.env.DB.prepare('SELECT approval, listed_by_id, listed_by FROM bounties WHERE id = ?').bind(id).first())
      .toEqual({ approval: 'pending', listed_by_id: null, listed_by: null });
    await card(); await connectedStripe();
    r.clock.at += 20 * MINUTE; await refreshUntilDone(r); await settleCharges(r.env);
    expect((await fact()).approval.state).toBe('pending'); expect(stripe.charged()).toHaveLength(0);
    issue.comments = [{ login: OWNER.login, association: 'NONE', body: `${pending.approve_with} on merge`, created_at: at(21) }];
    r.clock.at += 20 * MINUTE; await refreshUntilDone(r); await settleCharges(r.env);
    expect((await fact()).approval.state).toBe('pending'); expect(stripe.charged()).toHaveLength(0);
    issue.comments!.push({ login: OWNER.login, association: 'OWNER', body: `${pending.approve_with} on merge`, created_at: at(41) });
    r.clock.at += 20 * MINUTE; await refreshUntilDone(r); await settleCharges(r.env);
    expect(await r.env.DB.prepare('SELECT approval, poster_id, approval_at, approved_amount, merge_consent FROM bounties WHERE id = ?').bind(id).first())
      .toEqual({ approval: 'comment', poster_id: OWNER.github_id, approval_at: at(41), approved_amount: 45, merge_consent: 1 });
    expect(stripe.charged()).toHaveLength(0);
    Object.assign(issue.pulls![0]!, { state: 'closed', merged_at: at(61), landed: true });
    r.clock.at += 20 * MINUTE; await refreshUntilDone(r); await settleTwice();
    expect(stripe.charged()).toHaveLength(1); expect(await state()).toMatchObject({ state: 'paid' });
    expect(await r.env.DB.prepare('SELECT * FROM pay_repositories').first()).toBeNull();
    expect(await r.env.DB.prepare('SELECT * FROM sessions').first()).toBeNull();
  });
  it.each(['head', 'squash'])('makes progress under the deployed worker’s two-GitHub-read cron budget: %s', async landing => {
    await card(); await connectedStripe();
    if (landing === 'squash') Object.assign(issue.pulls![0]!, { landed: false, merge_commit_sha: 'b'.repeat(40), landingLanded: true });
    issue.comments = [{ login: OWNER.login, association: 'OWNER', body: `omakase approve ${id} $45 on merge`, created_at: at(1) }];
    for (let tick = 0; tick < 120 && stripe.charged().length === 0; tick += 1) {
      r.clock.at += MINUTE;
      await worker.scheduled(undefined, r.env);
    }
    expect(stripe.charged()).toHaveLength(1); expect(await state()).toMatchObject({ state: 'paid' });
  });
  it('waits for post-landing payment comments under the deployed cron budget before any charge', async () => {
    Object.assign(issue.pulls![0]!, { state: 'open', landed: false }); delete issue.pulls![0]!.merged_at;
    await card(); await connectedStripe(); await approve();
    Object.assign(issue.pulls![0]!, { state: 'closed', merged_at: at(25), landed: true });
    issue.comments!.push({ login: OWNER.login, association: 'OWNER', body: `omakase paid ${id} $45 to @solver`, created_at: at(26) });
    await r.env.DB.prepare(`UPDATE pull_requests SET state = 'merged', merged_at = ?, head_on_default_at_sight = 0 WHERE bounty_id = ?`).bind(at(25), id).run();
    r.clock.at += 20 * MINUTE;
    await r.env.DB.prepare('UPDATE repositories SET read_at = ?').bind(r.clock.at).run();
    await r.env.DB.prepare(`INSERT INTO meta (key, value) VALUES ('search_tried_at', ?), ('search_complete_at', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`).bind(String(r.clock.at), String(r.clock.at)).run();
    await r.env.DB.prepare('UPDATE bounties SET details_read_at = ?, events_read_at = 0 WHERE id = ?').bind(r.clock.at, id).run();
    await r.env.DB.prepare(`INSERT INTO meta (key, value) VALUES (?, '1') ON CONFLICT (key) DO UPDATE SET value = '1'`).bind(`listed_turn_${id}`).run();
    let verifiedBeforeRecord = false;
    let recorded = false;
    for (let tick = 0; tick < 120 && !recorded; tick += 1) {
      r.clock.at += MINUTE;
      await worker.scheduled(undefined, r.env);
      const pull = await r.env.DB.prepare('SELECT on_default FROM pull_requests WHERE bounty_id = ?').bind(id).first<{ on_default: number }>();
      recorded = await r.env.DB.prepare('SELECT 1 FROM paid_clicks WHERE bounty_id = ?').bind(id).first() !== null;
      if (pull?.on_default === 1 && !recorded) verifiedBeforeRecord = true;
      expect(stripe.charged()).toHaveLength(0); expect(paypal.captures).toHaveLength(0);
    }
    expect(verifiedBeforeRecord).toBe(true); expect(recorded).toBe(true);
    expect((await (await get(`/bounties/${id}.json`)).json() as any).bounty.payment.recorded_paid).toMatchObject({ source: 'board' });
  });
  it('rehearses an imported open PR through approval, merge, verified landing and stand-in payment', async () => {
    Object.assign(issue.pulls![0]!, { state: 'open', landed: false }); delete issue.pulls![0]!.merged_at;
    await card(); await connectedStripe(); await approve(); await settleCharges(r.env);
    expect(stripe.charged()).toHaveLength(0);
    Object.assign(issue.pulls![0]!, { state: 'closed', merged_at: at(25), landed: true });
    r.clock.at += 20 * MINUTE; await refreshUntilDone(r); await settleTwice();
    expect(stripe.charged()).toHaveLength(1); expect(await state()).toMatchObject({ state: 'paid' });
    console.log('Listed stand-in loop: imported -> approval on merge -> PR merged -> default verified -> paid once ($45); no real money moved.');
  });
  it('charges once without a switch or board session after an on merge comment, including a sessionless import', async () => {
    await card(); await connectedStripe();
    await r.env.DB.prepare('UPDATE bounties SET listed_by_id = NULL, listed_by = NULL WHERE id = ?').bind(id).run();
    await approve(); await settleTwice();
    expect(stripe.charged()).toHaveLength(1);
    expect(stripe.charged()[0]).toMatchObject({ account: 'acct_solver', amount: 4500 });
    expect(await state()).toMatchObject({ state: 'paid' });
    expect((await fact()).pays_on_merge).toBe(true);
  });
  it('a plain approval never inherits an old repository switch authorization', async () => {
    await card(); await connectedStripe(); await switched(); await approve(''); await settleTwice();
    expect(stripe.charged()).toHaveLength(0);
    expect(paypal.captures).toHaveLength(0);
    const bounty = await fact();
    expect(bounty.pays_on_merge).toBe(false);
    expect(bounty.pay_on_merge).toMatchObject({ configured: false, will_pay: false });
    expect(bounty.pay_on_merge.reasons.join(' ')).toContain('repository switch does not authorize imported bounties');
  });
  it.each(['pending', 'before-approval', 'plain-off', 'switch-after', 'two', 'not-landed', 'self', 'access', 'not-ready', 'recorded', 'over-limit', 'changed-reward'])( 'does not charge: %s', async mode => {
    await card(mode === 'over-limit' ? 40 : 50); await connectedStripe(mode !== 'not-ready');
    if (mode === 'before-approval') issue.pulls![0]!.merged_at = at(0);
    if (mode === 'two') { r.standin.accountIds.set('second', 7002); issue.pulls!.push({ ...issue.pulls![0]!, number: 42, author: 'second' }); }
    if (mode === 'not-landed') issue.pulls![0]!.landed = false;
    if (mode === 'self') issue.pulls![0]!.author = OWNER.login;
    if (mode === 'access') issue.pulls![0]!.association = 'COLLABORATOR';
    if (mode === 'switch-after') await switched(6);
    if (mode === 'recorded') await r.env.DB.prepare(`INSERT INTO paid_clicks (bounty_id, by_login, to_login, amount, withdrawn, at) VALUES (?, 'owner', 'solver', 45, 0, ?)`).bind(id, at(6)).run();
    if (mode === 'pending') { r.clock.at += 20 * MINUTE; await refreshUntilDone(r); }
    else await approve(mode === 'plain-off' || mode === 'switch-after' ? '' : ' on merge');
    if (mode === 'changed-reward') await r.env.DB.prepare('UPDATE bounties SET amount = 46 WHERE id = ?').bind(id).run();
    await settleTwice(); expect(stripe.charged()).toHaveLength(0); expect(paypal.captures).toHaveLength(0);
    if (mode === 'not-ready') expect(await state()).toMatchObject({ state: 'solver-not-ready' });
    if (mode === 'two') expect(await state()).toMatchObject({ state: 'owner-decides' });
    if (mode === 'plain-off') expect((await fact()).pay_on_merge.reasons.join(' ')).toContain('No pay-on-merge consent');
    if (mode === 'over-limit') expect((await fact()).pay_on_merge.reasons.join(' ')).toContain('outside the authorized limit');
  });
  it('keeps PF53 pending posted imports out of settlement even with cached merged facts and a repository switch', async () => {
    await card(); await connectedStripe(); await approve(); await switched();
    await r.env.DB.prepare(`UPDATE bounties SET source = 'posted', approval = 'pending' WHERE id = ?`).bind(id).run();
    await r.env.DB.prepare('UPDATE pay_repositories SET limit_per_bounty = 45').run();
    await settleTwice();
    expect(stripe.charged()).toHaveLength(0); expect(paypal.captures).toHaveLength(0); expect(await state()).toBeNull();
    expect((await fact()).pays_on_merge).toBe(false);
    expect((await fact()).pay_on_merge.reasons).toContain('The import is pending approval.');
  });
  it.each(['listed', 'posted'])('refuses the renamed poster by numeric id across %s payment paths', async source => {
    await card(45); await connectedStripe(); await approve();
    await r.env.DB.prepare('UPDATE bounties SET source = ? WHERE id = ?').bind(source, id).run();
    if (source === 'posted') await r.env.DB.prepare('UPDATE bounties SET approval = NULL WHERE id = ?').bind(id).run();
    await r.env.DB.prepare('UPDATE pull_requests SET author_id = ? WHERE bounty_id = ?').bind(OWNER.github_id, id).run();
    await r.env.DB.prepare('UPDATE stripe_accounts SET github_id = ?').bind(OWNER.github_id).run();
    if (source === 'posted') {
      await switched();
      await r.env.DB.prepare('UPDATE pay_repositories SET limit_per_bounty = 45').run();
    }
    await settleTwice();
    expect(stripe.charged()).toHaveLength(0); expect(paypal.captures).toHaveLength(0);
    expect((await fact()).pay_on_merge.will_pay).toBe(false);
    const chosen = await payeeFacts(r.env, id, SOLVER);
    expect(decidePay({ amount: 45, poster: OWNER.login, ...chosen, state: null })).toMatchObject({ act: 'refuse', words: expect.stringContaining('the solver is the poster') });
    await paySaved(r.env, id, OWNER.github_id, 45, SOLVER);
    expect(await state()).toMatchObject({ state: 'not-counted' }); expect(stripe.charged()).toHaveLength(0);
  });
  it.each([
    ['stripe', 40, 100, false], ['paypal', 40, 100, false],
    ['stripe', 50, 40, false], ['paypal', 50, 40, false],
    ['stripe', 50, 45, true], ['paypal', 50, 45, true],
    ['stripe', 45, null, true], ['paypal', 45, null, true]
  ] as const)('caps posted %s limits: method %s, repository %s', async (rail, savedLimit, repositoryLimit, pays) => {
    if (rail === 'stripe') { await card(savedLimit); await connectedStripe(); } else await vault(savedLimit);
    await approve();
    await r.env.DB.prepare(`UPDATE bounties SET source = 'posted', approval = NULL WHERE id = ?`).bind(id).run();
    await switched();
    await r.env.DB.prepare('UPDATE pay_repositories SET limit_per_bounty = ?').bind(repositoryLimit).run();
    expect((await fact()).pays_on_merge).toBe(pays);
    await settleTwice();
    expect(stripe.charged()).toHaveLength(pays && rail === 'stripe' ? 1 : 0);
    expect(paypal.captures).toHaveLength(pays && rail === 'paypal' ? 1 : 0);
    expect(await state()).toMatchObject({ state: pays ? 'paid' : 'refused-over-limit' });
  });
  it('verifies a listed squash landing on default before charging', async () => {
    await card(); await connectedStripe();
    Object.assign(issue.pulls![0]!, { landed: false, merge_commit_sha: 'b'.repeat(40), landingLanded: true });
    await approve(); await settleTwice(); expect(stripe.charged()).toHaveLength(1);
    expect(await r.env.DB.prepare('SELECT landing_sha FROM pull_requests WHERE bounty_id = ?').bind(id).first()).toMatchObject({ landing_sha: 'b'.repeat(40) });
  });
  it('no saved method reports both human setup URLs and solver payout setup for an open or merged PR', async () => {
    issue.pulls![0]!.state = 'open'; delete issue.pulls![0]!.merged_at;
    await approve(); await settleTwice();
    const view = await fact();
    expect(view.pay_on_merge).toMatchObject({ configured: false, will_pay: false, setup_urls: { stripe: `${ORIGIN}/setup/stripe-card/?bounty=${id}`, paypal: `${ORIGIN}/setup/paypal-vault/?bounty=${id}` } });
    expect(view.pay_on_merge.reasons.join(' ')).toContain('no saved payment method');
    expect(view.pay_on_merge.solvers[0]).toMatchObject({ login: SOLVER, can_receive: false, reason: 'No ready Stripe payout account or connected PayPal account.', setup_urls: { stripe: `${ORIGIN}/setup/stripe-payouts/?bounty=${id}`, paypal: `${ORIGIN}/setup/paypal-payouts/?bounty=${id}` } });
    expect(stripe.charged()).toHaveLength(0);
  });
  it('requires an exact approval line, not extra prose or another reward', async () => {
    await card(); await connectedStripe(); await approve(' on merge please'); await settleTwice();
    expect((await fact()).approval.state).toBe('pending'); expect(stripe.charged()).toHaveLength(0);
  });
});

describe('PF52: PayPal Vault', () => {
  it('saves only a setup started by the same signed-in GitHub account, then exchanges and removes it', async () => {
    expect((await post('/api/me/paypal/vault', {})).status).toBe(401);
    const token = await session();
    expect((await post('/api/me/paypal/vault/saved', { setup_token: 'stranger', limit: 50 }, token)).status).toBe(409);
    expect((await post('/api/me/paypal/vault', {}, token)).status).toBe(200);
    expect(paypal.vaultRequests[0]).toMatchObject({ payment_source: { paypal: { usage_type: 'MERCHANT', customer_type: 'CONSUMER', experience_context: { return_url: `${ORIGIN}/me/?vault=return#pay` } } } });
    paypal.setupApproved = false;
    const refused = await post('/api/me/paypal/vault/saved', { setup_token: 'SETUP1', limit: 50 }, token);
    expect(refused.status).toBe(409); expect(await refused.text()).not.toContain('provider prose');
    paypal.setupApproved = true;
    expect((await post('/api/me/paypal/vault/saved', { setup_token: 'SETUP1', limit: 50 }, token)).status).toBe(200);
    expect(paypal.vaultRequests.at(-1)).toEqual({ payment_source: { token: { id: 'SETUP1', type: 'SETUP_TOKEN' } } });
    expect(await r.env.DB.prepare('SELECT * FROM paypal_vault').first()).toEqual({ github_id: OWNER.github_id, payment_token: 'VAULT1', label: 'Saved PayPal', limit_per_bounty: 50 });
    expect((await post('/api/me/paypal/vault/remove', {}, token)).status).toBe(200);
    expect(await r.env.DB.prepare('SELECT * FROM paypal_vault').first()).toBeNull();
  });
  it('captures a vaulted order once on merge, without a repository switch', async () => {
    await vault(); await approve(); await settleTwice();
    expect(paypal.captures).toHaveLength(1); expect(stripe.charged()).toHaveLength(0);
    expect(paypal.orders[0]).toMatchObject({ payee: 'SOLVERPAYPAL1', amount: '45.00', custom_id: id, status: 'COMPLETED' });
    expect(paypal.vaultRequests[0]).toMatchObject({ payment_source: { paypal: { vault_id: 'VAULT1' } } });
    expect(await state()).toMatchObject({ state: 'paid', provider: 'paypal' });
  });
  it('concurrent cron runs share one Vault order claim', async () => {
    await vault(); await approve();
    await Promise.all([settleCharges(r.env), settleCharges(r.env)]);
    expect(paypal.captures).toHaveLength(1); expect(paypal.orders).toHaveLength(1);
  });
  it.each(['declined', 'pending', 'removed', 'over-limit'])('never reports a vaulted payment as paid: %s', async mode => {
    await vault(mode === 'over-limit' ? 40 : 50); await approve();
    if (mode === 'declined') paypal.vaultDeclined = true;
    if (mode === 'pending') paypal.vaultStatus = 'PAYER_ACTION_REQUIRED';
    if (mode === 'removed') await post('/api/me/paypal/vault/remove', {}, await session());
    await settleTwice(); expect(paypal.captures).toHaveLength(0);
    expect((await state() as any)?.state).not.toBe('paid');
    if (mode === 'pending') expect(await state()).toMatchObject({ state: 'owner-paying', provider: 'paypal' });
  });
  it('uses an explicit Stripe default when both work', async () => {
    await card(); await connectedStripe(); await vault(); await preference('stripe'); await approve(); await settleTwice();
    expect(stripe.charged()).toHaveLength(1); expect(paypal.orders).toHaveLength(0);
  });
  it('uses PayPal when the solver cannot receive Stripe', async () => {
    await card(); await connectedStripe(false); await vault(); await preference('stripe', true); await approve(); await settleTwice();
    expect(stripe.charged()).toHaveLength(0); expect(paypal.captures).toHaveLength(1);
  });
  it('applies the selected rail’s default limit, not the other saved method’s limit', async () => {
    await card(100); await vault(40); await preference('paypal'); await approve(); await settleTwice();
    expect(paypal.captures).toHaveLength(0);
    expect((await fact()).pay_on_merge).toMatchObject({ provider: 'PayPal', will_pay: false, reasons: expect.arrayContaining(['The reward is outside the authorized limit.']) });
  });
  it('uses the same vaulted rail for CLI-posted GitHub bounties with a repository authorization', async () => {
    await vault(45); await switched();
    await r.env.DB.prepare(`UPDATE bounties SET source = 'posted', approval = NULL WHERE id = ?`).bind(id).run();
    await r.env.DB.prepare('UPDATE pay_repositories SET limit_per_bounty = 45').run();
    await r.env.DB.prepare(`INSERT INTO pull_requests (bounty_id, number, author, author_id, state, opened_at, merged_at, association, on_default) VALUES (?, 41, 'solver', 7001, 'merged', ?, ?, 'NONE', 1)`).bind(id, at(2), at(5)).run();
    await settleTwice(); expect(paypal.captures).toHaveLength(1);
  });
});

describe('PF52: agent pay comments', () => {
  async function payment() { return (await (await get(`/bounties/${id}.json`)).json() as any).bounty.payment; }
  async function open(rail: 'stripe' | 'paypal' | 'both' = 'stripe') {
    Object.assign(issue.pulls![0]!, { state: 'open', landed: false }); delete issue.pulls![0]!.merged_at;
    await approve('');
    if (rail !== 'paypal') { await card(); await connectedStripe(); }
    if (rail !== 'stripe') await vault();
    if (rail === 'both') await preference('stripe');
  }
  async function read() {
    const github = new GitHub(r.env, false);
    try { await readPaymentComments(r.env, github, id, REPO, 12); }
    finally { await github.settle(); }
  }
  async function command(body = `omakase pay ${id} $45 to @solver`, login = OWNER.login) {
    r.clock.at += MINUTE;
    (issue.comments ??= []).push({ login, association: 'OWNER', body, created_at: new Date(r.clock.at).toISOString() });
    await read();
  }
  it.each(['stripe', 'paypal', 'both'] as const)('pays an open linked PR through %s without a session, switch or merge, once', async rail => {
    await open(rail);
    await command(`OMAKASE PAY ${id.toUpperCase()} $45 TO @SOLVER`);
    await read(); r.clock.at += 20 * MINUTE; await refreshUntilDone(r); await settleTwice();
    expect(await state()).toMatchObject({ state: 'paid', provider: rail === 'paypal' ? 'paypal' : null });
    expect(stripe.charged()).toHaveLength(rail === 'paypal' ? 0 : 1);
    expect(paypal.captures).toHaveLength(rail === 'paypal' ? 1 : 0);
    expect((await payment()).recorded_paid).toMatchObject({ source: rail === 'paypal' ? 'paypal' : 'stripe' });
    expect(await r.env.DB.prepare('SELECT * FROM sessions').first()).toBeNull();
    expect(await r.env.DB.prepare('SELECT * FROM pay_repositories').first()).toBeNull();
    expect(await r.env.DB.prepare('SELECT state FROM pull_requests WHERE bounty_id = ?').bind(id).first()).toEqual({ state: 'open' });
  });
  it.each(['stripe', 'paypal'] as const)('records payment for an unmerged posted bounty too: %s', async rail => {
    await open(rail);
    await r.env.DB.prepare(`UPDATE bounties SET source = 'posted', approval = NULL WHERE id = ?`).bind(id).run();
    await command();
    expect(await payment()).toMatchObject({ state: 'recorded', recorded_paid: { source: rail === 'paypal' ? 'paypal' : 'stripe' } });
  });
  it.each(['stripe', 'paypal'] as const)('credits the provider-paid %s solver, not another sole merged author', async rail => {
    await open(rail);
    await r.env.DB.prepare(`UPDATE bounties SET source = 'posted', approval = NULL WHERE id = ?`).bind(id).run();
    await r.env.DB.prepare(`INSERT INTO pull_requests (bounty_id, number, author, author_id, state, opened_at, merged_at, association, on_default)
      VALUES (?, 42, 'other', 7002, 'merged', ?, ?, 'NONE', 1)`).bind(id, at(2), at(5)).run();
    await command();
    expect(await payment()).toMatchObject({ state: 'recorded', owed: { to: SOLVER }, recorded_paid: { source: rail === 'paypal' ? 'paypal' : 'stripe' } });
    expect(await (await get(`/api/b/${id}/payment`, await session())).json()).toMatchObject({ payee: SOLVER, role: 'owner' });
    expect(await (await get(`/api/b/${id}/payment`, await session(7001, SOLVER))).json()).toMatchObject({ payee: SOLVER, role: 'payee' });
    expect(await (await get(`/api/b/${id}/payment`, await session(7002, 'other'))).json()).toMatchObject({ payee: SOLVER, role: 'other' });
  });
  it.each(['wrong-author', 'unlinked', 'self', 'renamed-self', 'access', 'over-limit', 'not-ready', 'recorded', 'in-flight', 'wrong-amount', 'extra-prose'])(
    'does not charge: %s', async mode => {
      await open();
      if (mode === 'self') await r.env.DB.prepare('UPDATE pull_requests SET author = ?, author_id = ? WHERE bounty_id = ?').bind(OWNER.login, OWNER.github_id, id).run();
      if (mode === 'renamed-self') {
        await r.env.DB.prepare('UPDATE pull_requests SET author_id = ? WHERE bounty_id = ?').bind(OWNER.github_id, id).run();
        await r.env.DB.prepare('UPDATE stripe_accounts SET github_id = ?').bind(OWNER.github_id).run();
      }
      if (mode === 'access') await r.env.DB.prepare(`UPDATE pull_requests SET association = 'COLLABORATOR' WHERE bounty_id = ?`).bind(id).run();
      if (mode === 'over-limit') await r.env.DB.prepare('UPDATE pay_settings SET limit_per_bounty = 40').run();
      if (mode === 'not-ready') await r.env.DB.prepare('UPDATE stripe_accounts SET ready = 0').run();
      if (mode === 'recorded') await r.env.DB.prepare(`INSERT INTO paid_clicks (bounty_id, by_login, to_login, amount, withdrawn, at) VALUES (?, 'owner', 'solver', 45, 0, ?)`).bind(id, at(20)).run();
      if (mode === 'in-flight') await r.env.DB.prepare(`INSERT INTO charges (bounty_id, state, at) VALUES (?, 'charging', ?)`).bind(id, NOW).run();
      await command(`omakase pay ${id} $${mode === 'wrong-amount' ? 46 : 45} to @${mode === 'self' ? OWNER.login : mode === 'unlinked' ? 'stranger' : SOLVER}${mode === 'extra-prose' ? ' please' : ''}`, mode === 'wrong-author' ? 'stranger' : OWNER.login);
      expect(stripe.charged()).toHaveLength(0); expect(paypal.captures).toHaveLength(0);
      if (mode === 'self' || mode === 'renamed-self' || mode === 'access') expect(await state()).toMatchObject({ state: 'not-counted' });
      if (mode === 'over-limit') expect(await state()).toMatchObject({ state: 'refused-over-limit' });
      if (mode === 'not-ready') expect(await state()).toMatchObject({ state: 'solver-not-ready' });
    }
  );
  it('ignores a pending import command, including after a later approval', async () => {
    await card(); await connectedStripe();
    await command(); expect((await fact()).approval.state).toBe('pending'); expect(stripe.charged()).toHaveLength(0);
    issue.comments!.push({ login: OWNER.login, association: 'OWNER', body: `omakase approve ${id} $45`, created_at: at(2) });
    r.clock.at += 20 * MINUTE; await refreshUntilDone(r); await read();
    expect((await fact()).approval.state).toBe('approved'); expect(stripe.charged()).toHaveLength(0);
    await command(); expect(stripe.charged()).toHaveLength(1);
  });
  it.each(['stripe', 'paypal'] as const)('keeps declined %s honest and does not replay the comment after setup changes', async rail => {
    await open(rail);
    if (rail === 'stripe') stripe.card = 'declined'; else paypal.vaultDeclined = true;
    await command(); expect(await state()).toMatchObject({ state: 'declined' });
    const calls = rail === 'stripe' ? stripe.calls.length : paypal.calls.length;
    if (rail === 'stripe') { stripe.card = 'ok'; await r.env.DB.prepare(`UPDATE pay_settings SET payment_method = 'pm_replaced'`).run(); }
    else { paypal.vaultDeclined = false; await r.env.DB.prepare(`UPDATE paypal_vault SET payment_token = 'VAULT2'`).run(); }
    await read(); expect(rail === 'stripe' ? stripe.calls.length : paypal.calls.length).toBe(calls);
    await command(); expect(await state()).toMatchObject({ state: 'paid' });
  });
  it.each([['stripe', 'before'], ['stripe', 'after'], ['paypal', 'before'], ['paypal', 'after']] as const)(
    'reconciles a %s command timeout %s provider processing without a merge or fresh consent', async (rail, when) => {
      await open(rail);
      const nativeFetch = globalThis.fetch;
      let dropped = false;
      const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const path = new URL(String(input)).pathname;
        const charging = init?.method === 'POST' && path === (rail === 'stripe' ? '/v1/payment_intents' : '/v2/checkout/orders');
        if (charging && !dropped && when === 'before') { dropped = true; throw new Error('Connection lost'); }
        const answer = await nativeFetch(input, init);
        if (charging && !dropped) { dropped = true; throw new Error('Response lost'); }
        return answer;
      });
      try { await command(); } finally { fetch.mockRestore(); }
      expect(dropped).toBe(true); expect(await state()).toMatchObject({ state: 'charging' });
      expect(await r.env.DB.prepare('SELECT state FROM pull_requests WHERE bounty_id = ?').bind(id).first()).toEqual({ state: 'open' });
      if (rail === 'paypal') { await card(); await connectedStripe(); }
      if (rail === 'stripe' && when === 'after') await r.env.DB.prepare('DELETE FROM pay_settings').run();
      r.clock.at += 3 * MINUTE;
      await settleCharges(r.env); await settleTwice(); await read();
      expect(await state()).toMatchObject({ state: 'paid', provider: rail === 'paypal' ? 'paypal' : null });
      expect(stripe.charged()).toHaveLength(rail === 'stripe' ? 1 : 0);
      expect(paypal.captures).toHaveLength(rail === 'paypal' ? 1 : 0);
      if (rail === 'paypal') expect(paypal.orders).toHaveLength(1);
    }
  );
  it('does not let a manually recorded in-flight command starve another authorized bounty', async () => {
    await open();
    await r.env.DB.prepare(`INSERT INTO charges (bounty_id, state, pull_number, solver, account_id, amount, payment_method, at)
      VALUES (?, 'charging', 41, 'solver', 'acct_solver', 45, 'pm_owner', ?)`).bind(id, NOW).run();
    await r.env.DB.prepare(`INSERT INTO paid_clicks (bounty_id, by_login, to_login, amount, withdrawn, at) VALUES (?, 'owner', 'solver', 45, 0, ?)`).bind(id, at(21)).run();
    const next = 'bt-00000000a003';
    await r.env.DB.prepare(`INSERT INTO bounties (id, repository, issue_number, title, task, poster, poster_id, issue_state, amount, created_at, work_commit, seen_at, source)
      SELECT ?, repository, 13, title, task, poster, poster_id, issue_state, amount, created_at, work_commit, seen_at, 'posted' FROM bounties WHERE id = ?`).bind(next, id).run();
    await r.env.DB.prepare(`INSERT INTO pull_requests (bounty_id, number, author, author_id, state, opened_at, merged_at, association, on_default)
      VALUES (?, 42, 'solver', 7001, 'merged', ?, ?, 'NONE', 1)`).bind(next, at(2), at(5)).run();
    await switched(); await r.env.DB.prepare('UPDATE pay_repositories SET limit_per_bounty = 45').run();
    r.clock.at += 3 * MINUTE; await settleCharges(r.env);
    expect(stripe.charged()).toHaveLength(1); expect(stripe.charged()[0]!.metadata.bounty).toBe(next);
    expect(await state()).toMatchObject({ state: 'charging' });
  });
  it('keeps a non-completed Vault response out of paid', async () => {
    await open('paypal'); paypal.vaultStatus = 'PAYER_ACTION_REQUIRED';
    await command(); await read();
    expect(await state()).toMatchObject({ state: 'owner-paying', provider: 'paypal' }); expect(paypal.captures).toHaveLength(0);
    const owner = await session();
    const view = await (await get(`/api/b/${id}/payment`, owner)).json() as any;
    const url = `https://www.sandbox.paypal.test/checkoutnow?token=${paypal.orders[0]!.id}`;
    expect(view).toMatchObject({ can_authenticate: false, paypal_action_url: url });
    expect((await (await get(`/api/b/${id}/payment`)).json() as any).paypal_action_url).toBeNull();
    expect(await (await post(`/api/b/${id}/pay-paypal`, { to: SOLVER }, owner)).json()).toEqual({ url });
    expect(paypal.orders).toHaveLength(1);
    paypal.approve(paypal.orders[0]!.id); r.clock.at += 2 * MINUTE;
    await settlePayPal(r.env); await settlePayPal(r.env);
    expect(await state()).toMatchObject({ state: 'paid' }); expect(paypal.captures).toHaveLength(1);
    expect((await (await get(`/api/b/${id}/payment`, owner)).json() as any).paypal_action_url).toBeNull();
  });
  it('refuses a non-completed Vault response with no valid order instead of offering Stripe authentication', async () => {
    await open('paypal');
    const nativeFetch = globalThis.fetch;
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => init?.method === 'POST' && new URL(String(input)).pathname === '/v2/checkout/orders'
      ? Response.json({ status: 'PAYER_ACTION_REQUIRED' }) : nativeFetch(input, init));
    try { await command(); } finally { fetch.mockRestore(); }
    expect(await state()).toMatchObject({ state: 'provider-refused' }); expect(paypal.captures).toHaveLength(0);
    expect(await (await get(`/api/b/${id}/payment`, await session())).json()).toMatchObject({ can_authenticate: false, paypal_action_url: null });
  });
  it('handles missing saved methods without spending and exposes setup/command facts', async () => {
    await approve(''); await command();
    expect(stripe.charged()).toHaveLength(0); expect(paypal.captures).toHaveLength(0);
    const view = await fact();
    expect(view.pay_on_merge.pay_now.comment).toBe(`omakase pay ${id} $45 to @<solver-login>`);
    expect(view.owed_now.pay_now.comment).toBe(`omakase pay ${id} $45 to @<solver-login>`);
    expect((await (await get('/api/payment-setup/poster')).json() as any).pay_now).toBe('omakase pay <id> $<amount> to @<solver-login>');
  });
  it('claims a repeated comment atomically even when two readers run together', async () => {
    await open();
    issue.comments!.push({ login: OWNER.login, association: 'OWNER', body: `omakase pay ${id} $45 to @solver`, created_at: at(21) });
    r.clock.at += MINUTE;
    const github = new GitHub(r.env, true);
    await github.get(`/repos/${REPO}/issues/12`);
    try { await Promise.all([readPaymentComments(r.env, github, id, REPO, 12), readPaymentComments(r.env, github, id, REPO, 12)]); }
    finally { await github.settle(); }
    expect(stripe.charged()).toHaveLength(1);
  });
  it('does not let a stale cron refusal overwrite an agent payment', async () => {
    await approve(); await card(); await connectedStripe();
    await r.env.DB.prepare(`INSERT INTO pull_requests (bounty_id, number, author, author_id, state, opened_at, merged_at, association, on_default, head_sha)
      VALUES (?, 42, 'other', 7002, 'merged', ?, ?, 'NONE', 1, ?)`).bind(id, at(2), at(6), 'a'.repeat(40)).run();
    await read();
    const prepare = r.env.DB.prepare;
    let intercepted = false;
    r.env.DB.prepare = sql => {
      const statement = prepare(sql);
      if (!sql.includes('payment_intent, at) VALUES')) return statement;
      return { ...statement, bind: (...values: (string | number | null)[]) => {
        const bound = statement.bind(...values);
        return { ...bound, run: async () => {
          if (!intercepted && values[1] === 'owner-decides') { intercepted = true; await paySaved(r.env, id, OWNER.github_id, 45, SOLVER); }
          return bound.run();
        } };
      } };
    };
    try { await settleCharges(r.env); }
    finally { r.env.DB.prepare = prepare; }
    expect(intercepted).toBe(true); expect(await state()).toMatchObject({ state: 'paid' }); expect(stripe.charged()).toHaveLength(1);
  });
});

describe('PF52: credential-free agent facts', () => {
  it('public setup APIs and MCP tools read links without creating settings or provider calls', async () => {
    for (const role of ['poster', 'solver']) {
      expect((await get(`/api/payment-setup/${role}`)).status).toBe(200);
      const response = await get(`/api/payment-setup/${role}?bounty=${id}`);
      expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ role, links: { stripe: expect.stringContaining('/setup/'), paypal: expect.stringContaining('/setup/') } });
      const mcp = await post('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: `get_${role}_payment_setup`, arguments: { bounty: id } } });
      expect(mcp.status).toBe(200); expect(await mcp.json()).toMatchObject({ result: { structuredContent: { role } } });
    }
    expect(stripe.calls).toEqual([]); expect(paypal.calls).toEqual([]);
    expect(await r.env.DB.prepare('SELECT * FROM pay_settings').first()).toBeNull();
    expect(await r.env.DB.prepare('SELECT * FROM paypal_vault_setup').first()).toBeNull();
    expect((await get('/api/payment-setup/poster?bounty=wrong')).status).toBe(400);
  });
  it('deep links ask for GitHub sign-in when signed out and start setup only after sign-in', async () => {
    for (const kind of ['stripe-card', 'paypal-vault', 'stripe-payouts', 'paypal-payouts']) {
      expect((await get(`/setup/${kind}/`)).headers.get('location')).toBe('/auth/github');
    }
    expect(stripe.calls).toEqual([]); expect(paypal.calls).toEqual([]);
    const token = await session();
    expect((await get('/setup/stripe-card/', token)).headers.get('location')).toContain('https://checkout.stripe.test/');
    expect((await get('/setup/paypal-vault/', token)).headers.get('location')).toContain('https://www.sandbox.paypal.test/vault/');
    expect((await get('/setup/stripe-payouts/', token)).status).toBe(200);
    const connected = await handle(new Request(`${ORIGIN}/setup/stripe-payouts/`, { method: 'POST', headers: { origin: ORIGIN, cookie: `__Host-board_session=${token}`, 'content-type': 'application/x-www-form-urlencoded' }, body: 'country=GB' }), r.env);
    expect(connected.status).toBe(302); expect(connected.headers.get('location')).toContain('https://connect.stripe.test/');
    expect(stripe.calls.some(call => call.includes('/v2/core/accounts'))).toBe(true);
    expect((await get('/setup/paypal-payouts/', token)).headers.get('location')).toContain('paypal.com');
  });
  it('keeps an optional bounty return path local and requires sign-in before finishing', async () => {
    const linked = await get(`/setup/paypal-vault/?bounty=${id}`);
    expect(linked.headers.get('set-cookie')).toContain(`__Host-board_setup_return=/b/${id}/`);
    expect((await get('/setup/finish/')).headers.get('location')).toBe('/auth/github');
    const token = await session();
    const finished = await handle(new Request(`${ORIGIN}/setup/finish/`, { headers: { cookie: `__Host-board_session=${token}; __Host-board_setup_return=/b/${id}/` } }), r.env);
    expect(finished.headers.get('location')).toBe(`/b/${id}/`);
    const foreign = await handle(new Request(`${ORIGIN}/setup/finish/`, { headers: { cookie: `__Host-board_session=${token}; __Host-board_setup_return=https://evil.invalid/` } }), r.env);
    expect(foreign.headers.get('location')).toBe('/me/');
  });
  it('API and MCP expose owed amount, public by-hand methods, and a GitHub-only payment-record instruction', async () => {
    await approve();
    await r.env.DB.prepare(`INSERT INTO methods (github_id, login, position, kind, value, chain, visibility) VALUES (7001, 'solver', 0, 'paypal', 'https://paypal.me/solver', NULL, 'everyone')`).run();
    await r.env.DB.prepare(`INSERT INTO methods (github_id, login, position, kind, value, chain, visibility) VALUES (7001, 'solver', 1, 'wise-email', 'private@example.com', NULL, 'owner-only')`).run();
    const view = await fact();
    expect(view.owed_now).toMatchObject({ amount: 45, currency: 'USD', payees: [{ login: SOLVER, methods: [{ kind: 'paypal', value: 'https://paypal.me/solver' }], methods_more: 1 }], record_payment: { comment: `omakase paid ${id} $45 to @<solver-login>` } });
    expect(JSON.stringify(view)).not.toContain('private@example.com');
    const mcp = await post('/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_bounty', arguments: { id } } });
    expect(await mcp.json()).toMatchObject({ result: { structuredContent: { bounty: { owed_now: { amount: 45 } } } } });
    issue.comments!.push({ login: OWNER.login, association: 'OWNER', body: `omakase paid ${id} $45 to @solver`, created_at: at(25) });
    r.clock.at += 20 * MINUTE; await refreshUntilDone(r);
    expect((await fact()).owed_now).toBeNull();
    expect(await r.env.DB.prepare('SELECT to_login, amount FROM paid_clicks WHERE bounty_id = ?').bind(id).first()).toEqual({ to_login: SOLVER, amount: 45 });
  });
});
