// A listed bounty (PF32) paid through PayPal (PF13): the cross-listing path end to end on the real routes, against the
// GitHub and PayPal stand-ins. The owner lists an existing issue, the solver connects PayPal, the owner chooses whom to pay
// and pays on PayPal's page. The order's payee is the chosen person's own account, so the board never holds the reward.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handle } from '../../packages/box-platform/src/api.js';
import type { StandinIssue } from '../../packages/box-platform/standin/standin.js';
import { PayPalStandin } from './paypal-standin.js';
import { MINUTE, NOW, rig, type Rig, refreshUntilDone } from './support.js';

const ORIGIN = 'https://board.test';
const REPO = 'example-mara/notes';
const MARA = { id: 7100, login: 'example-mara' };
const QUILL = { id: 7001, login: 'example-quill' };
const PIKE = { id: 7200, login: 'example-pike' };
const ROOK = { id: 7300, login: 'example-rook' };
const QUILL_PAYER = 'SOLVERPAYPAL1';
const ROOK_PAYER = 'OTHERPAYPAL22';

type Jar = Map<string, string>;
let r: Rig;
let p: PayPalStandin;
let paypalApi: string;
const env = () => ({
  ...r.env, GITHUB_WEB: r.env.GITHUB_API, GITHUB_OAUTH_CLIENT_ID: r.standin.oauthClientId, GITHUB_OAUTH_CLIENT_SECRET: r.standin.oauthClientSecret,
  PAYPAL_CLIENT_ID: 'standin-id', PAYPAL_SECRET: 'standin-word', PAYPAL_WEBHOOK_ID: 'standin-hook', PAYPAL_API: paypalApi, PAYPAL_WEB: 'https://www.sandbox.paypal.test'
});
async function send(jar: Jar | null, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (jar !== null && jar.size > 0) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
  const response = await handle(new Request(`${ORIGIN}${path}`, { ...init, headers }), env());
  if (jar !== null) for (const line of response.headers.getSetCookie()) {
    const [pair] = line.split(';');
    const at = pair!.indexOf('=');
    if (/Max-Age=0/.test(line)) jar.delete(pair!.slice(0, at)); else jar.set(pair!.slice(0, at), pair!.slice(at + 1));
  }
  return response;
}
const post = (jar: Jar | null, path: string, body: unknown) => send(jar, path, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify(body) });
async function signIn(who: { id: number; login: string }): Promise<Jar> {
  r.standin.signInAs = who;
  const jar: Jar = new Map();
  const start = await send(jar, '/auth/github');
  const atGitHub = await fetch(start.headers.get('location')!, { redirect: 'manual' });
  const back = new URL(atGitHub.headers.get('location')!);
  await send(jar, `${back.pathname}${back.search}`);
  return jar;
}
/** Log in with PayPal through the board's own routes; PayPal's page is the stand-in's code. */
async function connectPayPal(jar: Jar, who: { id: number }, payer: string): Promise<void> {
  const start = await send(jar, '/auth/paypal');
  expect(start.status).toBe(302);
  const to = new URL(start.headers.get('location')!);
  expect(to.origin).toBe('https://www.sandbox.paypal.test');
  expect(to.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/auth/paypal/callback`);
  const code = `code-${who.id}`;
  p.logins.set(code, { payer_id: payer, emails: [{ value: 'someone@example.com' }] });
  const back = await send(jar, `/auth/paypal/callback?code=${code}&state=${to.searchParams.get('state')}`);
  expect(back.headers.get('location')).toBe('/me/#paypal');
}
const plain = (number: number, author: string): StandinIssue =>
  ({ id: `plain-${number}`, repository: REPO, number, title: `Plain issue ${number}`, task: 'Make the export keep its order.', poster: author, amount: 0, createdAt: new Date(NOW).toISOString(), plain: true, pulls: [] });
const orderOf = (url: string) => new URL(url).searchParams.get('token')!;

/** Mara lists Pike's issue at $50; Quill has an open pull request linked to it and Rook a merged one. */
async function listed(): Promise<{ mara: Jar; id: string }> {
  const mara = await signIn(MARA);
  const answer = await post(mara, '/api/list', { issue: `https://github.com/${REPO}/issues/12`, reward: 50 });
  expect(answer.status).toBe(200);
  const id = (await answer.json() as any).listed as string;
  const issue = r.standin.issues.find(entry => entry.number === 12)!;
  issue.pulls = [{ number: 41, author: QUILL.login, state: 'open', created_at: new Date(NOW).toISOString() }, { number: 42, author: ROOK.login, state: 'closed', merged_at: new Date(NOW).toISOString(), created_at: new Date(NOW).toISOString() }];
  r.clock.at += 20 * MINUTE; await refreshUntilDone(r);
  return { mara, id };
}

beforeEach(async () => {
  r = await rig('standin-read');
  p = new PayPalStandin();
  paypalApi = await p.start();
  r.standin.repositories.set(REPO, { language: 'TypeScript', visibility: 'public' });
  for (const [login, id] of [[MARA.login, MARA.id], [PIKE.login, PIKE.id], [ROOK.login, ROOK.id]] as const) r.standin.accountIds.set(login, id);
  r.standin.issues.push(plain(12, PIKE.login));
}, 120000);
afterEach(async () => { await p.stop(); await r.close(); });

describe('a listed bounty paid through PayPal', () => {
  it('pays the merged person the owner chose, straight to their own PayPal account, and the board records it paid', async () => {
    await connectPayPal(await signIn(ROOK), ROOK, ROOK_PAYER);
    const { mara, id } = await listed();
    const offered = await (await send(mara, `/api/b/${id}/payment?to=${ROOK.login}`)).json() as any;
    expect(offered.payment.state).toBe('owner-chooses');
    const opened = await post(mara, `/api/b/${id}/pay-paypal`, { to: ROOK.login, amount: 1, payee: QUILL_PAYER });
    expect(opened.status).toBe(200);
    const url = (await opened.json() as any).url as string;
    // The order: the listed reward, the chosen person's account as payee, and nothing for the board.
    expect(p.orders).toHaveLength(1);
    expect(p.orders[0]).toMatchObject({ payee: ROOK_PAYER, amount: '50.00', custom_id: id, status: 'PAYER_ACTION_REQUIRED' });
    expect(p.captures).toEqual([]);
    p.approve(orderOf(url));
    const view = await (await send(mara, `/api/b/${id}/payment`)).json() as any;
    expect(p.captures).toEqual([orderOf(url)]);
    expect(view.payment.state).toBe('recorded');
    const charge = await r.env.DB.prepare('SELECT state, provider, account_id, amount, solver FROM charges WHERE bounty_id = ?').bind(id).first();
    expect(charge).toMatchObject({ state: 'paid', provider: 'paypal', account_id: ROOK_PAYER, amount: 50, solver: ROOK.login });
    // Paid once: a second click opens nothing and captures nothing.
    expect((await post(mara, `/api/b/${id}/pay-paypal`, { to: QUILL.login })).status).not.toBe(200);
    expect(p.orders).toHaveLength(1);
  });

  it('pays a chosen person whose pull request is linked but not merged, as the owner may choose', async () => {
    await connectPayPal(await signIn(QUILL), QUILL, QUILL_PAYER);
    const { mara, id } = await listed();
    const opened = await post(mara, `/api/b/${id}/pay-paypal`, { to: QUILL.login });
    expect(opened.status).toBe(200);
    expect(p.orders[0]).toMatchObject({ payee: QUILL_PAYER, amount: '50.00' });
  });

  it('opens nothing without a choice, for someone not linked, for someone not connected, or for anyone but the owner', async () => {
    await connectPayPal(await signIn(QUILL), QUILL, QUILL_PAYER);
    const { mara, id } = await listed();
    expect((await post(mara, `/api/b/${id}/pay-paypal`, {})).status).toBe(409);
    expect((await post(mara, `/api/b/${id}/pay-paypal`, { to: PIKE.login })).status).toBe(409);
    const notConnected = await post(mara, `/api/b/${id}/pay-paypal`, { to: ROOK.login });
    expect(notConnected.status).toBe(409);
    expect((await notConnected.json() as any).error).toBe(`${ROOK.login} has not connected PayPal. Nothing was charged. Next: pay by a method they listed.`);
    expect((await post(await signIn(QUILL), `/api/b/${id}/pay-paypal`, { to: QUILL.login })).status).toBe(403);
    expect(p.orders).toEqual([]);
  });
});
