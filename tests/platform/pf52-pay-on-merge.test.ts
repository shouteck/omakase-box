import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handle } from '../../packages/box-platform/src/api.js';
import worker from '../../packages/box-platform/src/worker.js';
import { GitHub } from '../../packages/box-platform/src/github.js';
import { readPaymentComments } from '../../packages/box-platform/src/payment-comment.js';
import { settleCharges } from '../../packages/box-platform/src/charge.js';
import { listIssue } from '../../packages/box-platform/src/listing.js';
import { refreshUntilDone, rig, MINUTE, NOW, type Rig } from './support.js';
import { StripeStandin } from './stripe-standin.js';
import { PayPalStandin } from './paypal-standin.js';
import type { StandinIssue } from '../../packages/box-platform/standin/standin.js';

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
async function switched(minutes = 0) {
  await r.env.DB.prepare('INSERT INTO pay_repositories (github_id, repository, on_at, limit_per_bounty) VALUES (?, ?, ?, 50)').bind(OWNER.github_id, REPO, at(minutes)).run();
}
async function approve(suffix = ' on merge', minutes = 1) {
  issue.comments = [{ login: OWNER.login, body: `OMAKASE APPROVE ${id.toUpperCase()} $45${suffix.toUpperCase()}`, association: 'OWNER', created_at: at(minutes) }];
  r.clock.at = NOW + 20 * MINUTE;
  await refreshUntilDone(r);
}
async function state() { return (await r.env.DB.prepare('SELECT state, provider FROM charges WHERE bounty_id = ?').bind(id).first()) ?? null; }
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
afterEach(async () => { await stripe.stop(); await paypal.stop(); await r.close(); });

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
  it('a plain approval charges only when the repository was switched on before the merge', async () => {
    await card(); await connectedStripe(); await switched(); await approve(''); await settleTwice();
    expect(stripe.charged()).toHaveLength(1);
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
    if (mode === 'pending') expect(await state()).toMatchObject({ state: 'owner-must-authenticate', provider: 'paypal' });
  });
  it('prefers Stripe when both work, and uses PayPal when Stripe payouts are not ready', async () => {
    await card(); await connectedStripe(); await vault(); await approve(); await settleTwice();
    expect(stripe.charged()).toHaveLength(1); expect(paypal.orders).toHaveLength(0);
  });
  it('uses PayPal when the solver cannot receive Stripe', async () => {
    await card(); await connectedStripe(false); await vault(); await approve(); await settleTwice();
    expect(stripe.charged()).toHaveLength(0); expect(paypal.captures).toHaveLength(1);
  });
  it('applies the selected rail’s default limit, not the other saved method’s limit', async () => {
    await card(100); await vault(40); await approve(); await settleTwice();
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
  async function open(rail: 'stripe' | 'paypal' | 'both' = 'stripe') {
    Object.assign(issue.pulls![0]!, { state: 'open', landed: false }); delete issue.pulls![0]!.merged_at;
    await approve('');
    if (rail !== 'paypal') { await card(); await connectedStripe(); }
    if (rail !== 'stripe') await vault();
  }
  async function read() { await readPaymentComments(r.env, new GitHub(r.env), id, REPO, 12); }
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
    expect((await fact()).payment.recorded_paid).toMatchObject({ source: rail === 'paypal' ? 'paypal' : 'stripe' });
    expect(await r.env.DB.prepare('SELECT * FROM sessions').first()).toBeNull();
    expect(await r.env.DB.prepare('SELECT * FROM pay_repositories').first()).toBeNull();
    expect(await r.env.DB.prepare('SELECT state FROM pull_requests WHERE bounty_id = ?').bind(id).first()).toEqual({ state: 'open' });
  });
  it.each(['stripe', 'paypal'] as const)('records payment for an unmerged posted bounty too: %s', async rail => {
    await open(rail);
    await r.env.DB.prepare(`UPDATE bounties SET source = 'posted', approval = NULL WHERE id = ?`).bind(id).run();
    await command();
    expect((await fact()).payment).toMatchObject({ state: 'recorded', recorded_paid: { source: rail === 'paypal' ? 'paypal' : 'stripe' } });
  });
  it.each(['wrong-author', 'unlinked', 'self', 'access', 'over-limit', 'not-ready', 'recorded', 'in-flight', 'wrong-amount', 'extra-prose'])(
    'does not charge: %s', async mode => {
      await open();
      if (mode === 'self') await r.env.DB.prepare('UPDATE pull_requests SET author = ?, author_id = ? WHERE bounty_id = ?').bind(OWNER.login, OWNER.github_id, id).run();
      if (mode === 'access') await r.env.DB.prepare(`UPDATE pull_requests SET association = 'COLLABORATOR' WHERE bounty_id = ?`).bind(id).run();
      if (mode === 'over-limit') await r.env.DB.prepare('UPDATE pay_settings SET limit_per_bounty = 40').run();
      if (mode === 'not-ready') await r.env.DB.prepare('UPDATE stripe_accounts SET ready = 0').run();
      if (mode === 'recorded') await r.env.DB.prepare(`INSERT INTO paid_clicks (bounty_id, by_login, to_login, amount, withdrawn, at) VALUES (?, 'owner', 'solver', 45, 0, ?)`).bind(id, at(20)).run();
      if (mode === 'in-flight') await r.env.DB.prepare(`INSERT INTO charges (bounty_id, state, at) VALUES (?, 'charging', ?)`).bind(id, NOW).run();
      await command(`omakase pay ${id} $${mode === 'wrong-amount' ? 46 : 45} to @${mode === 'self' ? OWNER.login : mode === 'unlinked' ? 'stranger' : SOLVER}${mode === 'extra-prose' ? ' please' : ''}`, mode === 'wrong-author' ? 'stranger' : OWNER.login);
      expect(stripe.charged()).toHaveLength(0); expect(paypal.captures).toHaveLength(0);
      if (mode === 'self' || mode === 'access') expect(await state()).toMatchObject({ state: 'not-counted' });
      if (mode === 'over-limit') expect(await state()).toMatchObject({ state: 'refused-over-limit' });
      if (mode === 'not-ready') expect(await state()).toMatchObject({ state: 'solver-not-ready' });
    }
  );
  it('ignores a pending import command, including after a later approval', async () => {
    await card(); await connectedStripe();
    await command(); expect((await fact()).approval.state).toBe('pending'); expect(stripe.charged()).toHaveLength(0);
    issue.comments!.push({ login: OWNER.login, association: 'OWNER', body: `omakase approve ${id} $45`, created_at: at(2) });
    r.clock.at += 20 * MINUTE; await refreshUntilDone(r); await read();
    expect((await fact()).approval.state).toBe('comment'); expect(stripe.charged()).toHaveLength(0);
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
  it('keeps a non-completed Vault response out of paid', async () => {
    await open('paypal'); paypal.vaultStatus = 'PAYER_ACTION_REQUIRED';
    await command(); await read();
    expect(await state()).toMatchObject({ state: 'owner-must-authenticate' }); expect(paypal.captures).toHaveLength(0);
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
    await Promise.all([read(), read()]);
    expect(stripe.charged()).toHaveLength(1);
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
