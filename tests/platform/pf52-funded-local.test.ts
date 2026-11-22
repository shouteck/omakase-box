import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startLocal } from '../../packages/box-platform/src/local.js';
import worker from '../../packages/box-platform/src/worker.js';
import type { StandinIssue } from '../../packages/box-platform/standin/standin.js';
import { StripeStandin } from './stripe-standin.js';
import { PayPalStandin } from './paypal-standin.js';
import { MINUTE, NOW, SCHEMA } from './support.js';

const PACKAGE = fileURLToPath(new URL('../../packages/box-platform/', import.meta.url));
const OUT = join(PACKAGE, 'out');
const SHOTS = process.env.PF52_EVIDENCE_DIR ?? join(OUT, 'screenshots');
const REPO = 'owner/funded-local';
const OWNER = { id: 8001, login: 'owner' };
const SOLVER = { id: 7001, login: 'solver' };
const COMMIT = 'b'.repeat(40), TREE = 'c'.repeat(40);
type Jar = Map<string, string>;
type Rail = 'stripe' | 'paypal';
let browser: Browser;

beforeAll(async () => {
  const built = spawnSync(process.execPath, [join(PACKAGE, 'node_modules/next/dist/bin/next'), 'build'], { cwd: PACKAGE, encoding: 'utf8', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
  if (built.status !== 0) throw new Error(`next build failed:\n${built.stdout}\n${built.stderr}`);
  browser = await chromium.launch();
  mkdirSync(SHOTS, { recursive: true });
}, 300000);
afterAll(async () => { await browser?.close(); });

describe.each(['stripe', 'paypal'] as const)('PF52 funded local worker: %s', rail => {
  it.each(['prepared-merge', 'listed-merge', 'agent-pay', 'manual-paid', 'not-ready'] as const)('%s', async mode => {
    let clock = NOW;
    const board = await startLocal({ schema: SCHEMA, out: OUT, now: () => clock, seed: standin => {
      standin.repositories.set(REPO, { visibility: 'public', language: 'TypeScript' });
      standin.accountIds.set(OWNER.login, OWNER.id); standin.accountIds.set(SOLVER.login, SOLVER.id);
    } });
    const stripe = new StripeStandin(), paypal = new PayPalStandin();
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      Object.assign(board.env, { GITHUB_TOKEN: 'standin-read', STRIPE_SECRET_KEY: 'standin', STRIPE_API: await stripe.start(), PAYPAL_CLIENT_ID: 'standin', PAYPAL_SECRET: 'standin', PAYPAL_API: await paypal.start() });
      const nativeFetch = globalThis.fetch;
      vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
        const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
        if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error(`The local matrix refused a non-local host: ${url.hostname}`);
        if (url.origin === board.env.GITHUB_API && url.pathname.startsWith(`/repos/${REPO}/commits/box-bounty`)) return Promise.resolve(Response.json({ sha: COMMIT, commit: { tree: { sha: TREE } } }));
        if (url.origin === board.env.GITHUB_API && url.pathname === `/repos/${REPO}/git/trees/${TREE}`) return Promise.resolve(Response.json({ truncated: false, tree: [{ path: 'src/fix.ts', type: 'blob', mode: '100644', sha: COMMIT }] }));
        return nativeFetch(input, init);
      });
      await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
      const send = async (jar: Jar, path: string, body?: unknown) => {
        const response = await fetch(`${board.url}${path}`, { redirect: 'manual', method: body === undefined ? 'GET' : 'POST', headers: { origin: board.url, cookie: [...jar].map(([key, value]) => `${key}=${value}`).join('; '), ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        for (const line of response.headers.getSetCookie()) {
          const pair = line.split(';')[0]!, at = pair.indexOf('=');
          if (/Max-Age=0/.test(line)) jar.delete(pair.slice(0, at)); else jar.set(pair.slice(0, at), pair.slice(at + 1));
        }
        return response;
      };
      const json = async (jar: Jar, path: string, body?: unknown): Promise<any> => {
        const response = await send(jar, path, body), value = await response.json();
        expect(response.status, `${path}: ${JSON.stringify(value)}`).toBe(200);
        return value;
      };
      const signIn = async (who: typeof OWNER): Promise<Jar> => {
        board.standin.signInAs = who;
        const jar: Jar = new Map();
        const start = await send(jar, '/auth/github');
        const github = await fetch(start.headers.get('location')!, { redirect: 'manual' });
        const callback = new URL(github.headers.get('location')!);
        expect((await send(jar, `${callback.pathname}${callback.search}`)).status).toBe(302);
        return jar;
      };
      const owner = await signIn(OWNER);
      const save = async (which: Rail) => {
        if (which === 'stripe') {
          const started = await json(owner, '/api/me/card', {});
          stripe.sessionCustomer = (await board.env.DB.prepare('SELECT customer_id FROM pay_settings WHERE github_id = ?').bind(OWNER.id).first<{ customer_id: string }>())!.customer_id;
          await json(owner, '/api/me/card/saved', { session: new URL(started.url).pathname.slice(1) });
          const saved = await json(owner, '/api/me/pay', { limit: 50, repositories: [] });
          expect(saved.pay.card).toContain('4242');
        } else {
          const started = await json(owner, '/api/me/paypal/vault', {});
          expect(started.url).toContain('https://www.sandbox.paypal.test/vault/');
          await json(owner, '/api/me/paypal/vault/saved', { setup_token: 'SETUP1', limit: 50 });
          expect((await json(owner, '/api/me/paypal/vault')).saved).toEqual({ label: 'Saved PayPal', limit_per_bounty: 50 });
        }
      };
      await save(rail);
      if (mode === 'prepared-merge') {
        await save(rail === 'stripe' ? 'paypal' : 'stripe');
        expect((await json(owner, '/api/me')).pay.rail_choice.needs_choice).toBe(true);
        board.standin.signInAs = OWNER;
        await page.goto(`${board.url}/auth/github`); await page.waitForURL(`${board.url}/me/`);
        await page.goto(`${board.url}/setup/finish/`);
        await expect.poll(() => page.locator('#payment-rail').innerText()).toContain('Which one is the default for pay on merge?');
        await page.screenshot({ path: join(SHOTS, `pf52-funded-default-${rail}-first.png`), fullPage: true });
        await page.locator(`#payment-rail input[value="${rail}"]`).check();
        await page.getByRole('button', { name: 'Save default payment rail' }).click();
        await expect.poll(async () => (await json(owner, '/api/me')).pay.rail_choice.account_rail).toBe(rail);
        expect((await json(owner, '/api/me')).pay.rail_choice.fallback).toBe(false);
      }
      const anonymous: Jar = new Map();
      const listed = mode === 'listed-merge';
      let prepared: any;
      if (!listed) prepared = await json(anonymous, '/api/agents/prepare', { repository: REPO, commit: COMMIT, title: 'Funded local repair', task: 'Repair the parser', reward: 45, paths: ['src/fix.ts'] });
      const issue: StandinIssue = { id: prepared?.id ?? 'plain-local', plain: listed, repository: REPO, number: 12, title: prepared?.issue.title ?? 'Funded listed repair', task: 'Repair the parser', poster: OWNER.login, amount: listed ? 0 : 45, createdAt: new Date(clock).toISOString(), state: 'open', ...(prepared ? { rawBody: prepared.issue.body } : {}), comments: [], pulls: [{ number: 41, author: SOLVER.login, state: 'open', created_at: new Date(clock + MINUTE).toISOString(), landed: false }] };
      board.standin.issues.push(issue);
      const imported = await json(anonymous, '/api/agents/import', { issue: `https://github.com/${REPO}/issues/12`, reward: 45 });
      const id = imported.listed as string;
      expect(imported.pending).toBe(true);
      const charge = () => board.env.DB.prepare('SELECT state, provider, origin FROM charges WHERE bounty_id = ?').bind(id).first<{ state: string; provider: string | null; origin: string | null }>();
      const ticks = async (count: number) => { for (let n = 0; n < count; n++) { clock += MINUTE; await worker.scheduled({}, board.env); } };
      const until = async (read: () => Promise<boolean>, what: string) => {
        for (let n = 0; n < 220; n++) { if (await read()) return; await ticks(1); }
        throw new Error(`${rail}/${mode}: timed out waiting for ${what}; charge=${JSON.stringify(await charge())}`);
      };
      await ticks(12);
      expect(await charge()).toBeNull();
      expect(stripe.charged()).toHaveLength(0); expect(paypal.captures).toHaveLength(0);
      issue.comments!.push({ login: OWNER.login, association: 'OWNER', created_at: new Date(clock).toISOString(), body: `omakase approve ${id} $45 on merge` });
      await until(async () => (await board.env.DB.prepare('SELECT merge_consent FROM bounties WHERE id = ?').bind(id).first<{ merge_consent: number }>())?.merge_consent === 1, 'approval');
      const connect = async () => {
        const solver = await signIn(SOLVER);
        if (rail === 'stripe') {
          expect((await json(solver, '/api/me/stripe/connect', { country: 'US' })).url).toContain('https://connect.stripe.test/');
          const row = (await board.env.DB.prepare('SELECT account_id FROM stripe_accounts WHERE github_id = ?').bind(SOLVER.id).first<{ account_id: string }>())!;
          stripe.accounts.get(row.account_id)!.charges_enabled = true;
          expect((await json(solver, '/api/me/stripe/read', {})).pay.solver.ready).toBe(true);
        } else {
          const start = await send(solver, '/auth/paypal');
          const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
          paypal.logins.set('local-solver', { payer_id: 'SOLVERPAYPAL1' });
          expect((await send(solver, `/auth/paypal/callback?state=${encodeURIComponent(state)}&code=local-solver`)).status).toBe(302);
          expect((await json(solver, '/api/me')).paypal.connected).toBe(true);
        }
      };
      const merge = async () => { Object.assign(issue.pulls![0]!, { state: 'closed', merged_at: new Date(clock + MINUTE).toISOString(), landed: true }); await ticks(1); };
      const command = async (verb: 'pay' | 'paid') => {
        clock += MINUTE;
        issue.comments!.push({ login: OWNER.login, association: 'OWNER', created_at: new Date(clock).toISOString(), body: `omakase ${verb} ${id} $45 to @solver` });
      };
      if (mode === 'not-ready') {
        await merge(); await until(async () => (await charge())?.state === 'solver-not-ready', 'terminal refusal');
        expect((await json(anonymous, `/api/b/${id}`)).bounty.pay_on_merge.automatic_charge_off).toBe(true);
        await connect(); await ticks(70);
        expect((await charge())?.state).toBe('solver-not-ready');
        expect(stripe.charged()).toHaveLength(0); expect(paypal.captures).toHaveLength(0);
        const owed = (await json(anonymous, `/api/b/${id}`)).bounty.owed_now;
        expect(owed.pay_now.comment).toContain(`omakase pay ${id}`);
        expect(owed.record_payment.comment).toContain(`omakase paid ${id}`);
        await page.goto(`${board.url}/b/${id}/`);
        await expect.poll(() => page.locator('[data-automatic-charge-off]').innerText()).toContain('Once connected, the poster can pay by one-click');
        await page.screenshot({ path: join(SHOTS, `pf52-funded-${rail}-${mode}.png`), fullPage: true });
      } else {
        await connect();
        if (mode === 'agent-pay' || mode === 'manual-paid') await command(mode === 'agent-pay' ? 'pay' : 'paid'); else await merge();
        const isPaid = async () => (await json(anonymous, `/api/b/${id}/payment`)).payment.recorded_paid !== null;
        await until(isPaid, 'payment');
        await ticks(20);
        const manual = mode === 'manual-paid';
        expect(stripe.charged()).toHaveLength(!manual && rail === 'stripe' ? 1 : 0);
        expect(paypal.captures).toHaveLength(!manual && rail === 'paypal' ? 1 : 0);
        if (!manual) {
          expect(await charge()).toMatchObject({ state: 'paid', origin: mode === 'agent-pay' ? 'agent' : 'merge' });
          if (rail === 'paypal') expect(paypal.orders[0]).toMatchObject({ status: 'COMPLETED', payee: 'SOLVERPAYPAL1', custom_id: id, amount: '45.00' });
          else expect(stripe.charged()[0]).toMatchObject({ amount: 4500, metadata: { bounty: id } });
        }
        const detail = (await json(anonymous, `/api/b/${id}`)).bounty;
        expect(detail.open_to_answers).toBe(false); expect(detail.owed_now).toBeNull();
        expect(JSON.stringify(await json(anonymous, '/bounties.json'))).not.toContain(id);
        expect(JSON.stringify(await json(anonymous, '/api/board'))).not.toContain(id);
        const machine = await json(anonymous, `/bounties/${id}.json`);
        expect(machine.bounty.owed_now).toBeNull();
        const mcp = await json(anonymous, '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_bounty', arguments: { id } } });
        expect(mcp.result.structuredContent.bounty.owed_now).toBeNull();
        expect(await (await send(anonymous, '/llms.txt')).text()).toContain('omakase pay');
        const wording = manual ? 'Recorded paid by' : `Paid${mode === 'agent-pay' ? ' by agent command' : ' on merge'} through ${rail === 'stripe' ? 'Stripe' : 'PayPal'}`;
        await page.goto(`${board.url}/b/${id}/`);
        await expect.poll(() => page.locator('[data-standing]').innerText()).toContain(wording);
        expect(await page.locator('aside').innerText()).toContain(listed ? 'main' : `box-bounty/${id}`);
        expect(await page.locator('#answer').count()).toBe(0);
        await page.screenshot({ path: join(SHOTS, `pf52-funded-${rail}-${mode}.png`), fullPage: true });
      }
      console.log(`PASS PF52 funded local ${rail}/${mode}: HTTP setup/import/approval; two-read worker; provider counts; facts/feed/detail`);
    } finally { vi.restoreAllMocks(); await context.close(); await stripe.stop(); await paypal.stop(); await board.stop(); }
  }, 180000);
});
