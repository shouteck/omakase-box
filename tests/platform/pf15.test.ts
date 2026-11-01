// Every reader learns the three ways to pay (PF15): the one source, then the feed, MCP and
// profile with no key, a Stripe key and PayPal's. A way with no key must not read as open.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handle } from '../../packages/box-platform/src/api.js';
import { isSetUp, WAYS, waysOfBounty, waysSetUp } from '../../packages/box-platform/src/pay-ways.js';
import { idOf, type StandinIssue } from '../../packages/box-platform/standin/standin.js';
import { MINUTE, NOW, refreshUntilDone, rig, type Rig } from './support.js';

const ORIGIN = 'https://board.test';
const REPOSITORY = 'example-org/ledger';
const ID = idOf(0xf15);
const SOLVER_ID = 7001;
const KEYS = {
  none: {},
  stripe: { STRIPE_SECRET_KEY: 'not-a-real-key' },
  paypal: { PAYPAL_CLIENT_ID: 'not-real', PAYPAL_SECRET: 'not-real' },
  both: { STRIPE_SECRET_KEY: 'not-a-real-key', PAYPAL_CLIENT_ID: 'not-real', PAYPAL_SECRET: 'not-real' }
};
const after = new Date(NOW + 5 * MINUTE).toISOString();
const issue = (over: Partial<StandinIssue> = {}): StandinIssue => ({ id: ID, repository: REPOSITORY, number: 1, title: 'Fix it', task: 'Fix it.', poster: 'example-mara', amount: 45, createdAt: new Date(NOW - MINUTE).toISOString(), pulls: [], ...over });

describe('the one source', () => {
  it('holds the three ways with the brief\'s facts, and no other word for them', () => {
    expect(WAYS.map(way => way.name)).toEqual(['By hand', 'One click', 'On merge']);
    expect(WAYS.map(way => way.whoSays)).toEqual(['The owner', 'The provider', 'The provider']);
    expect(WAYS[2]!.through).toBe('Stripe');
    expect(JSON.stringify(WAYS)).not.toMatch(/level|monid|balance/i);
  });
  it.each([
    ['no key', { stripe: false, paypal: false }, [], false],
    ['Stripe', { stripe: true, paypal: false }, ['Stripe'], true],
    ['PayPal', { stripe: false, paypal: true }, ['PayPal'], false],
    ['both', { stripe: true, paypal: true }, ['Stripe', 'PayPal'], true]
  ])('with %s, says what is set up', (_name, keys, oneClick, onMerge) => {
    const here = waysSetUp(keys);
    expect(here).toEqual({ by_hand: true, one_click: oneClick, on_merge: onMerge });
    expect(isSetUp('by-hand', here)).toBe(true);
    expect(isSetUp('one-click', here)).toBe(oneClick.length > 0);
    expect(isSetUp('on-merge', here)).toBe(onMerge);
  });
  it('on merge applies to a bounty only with the poster\'s switch, and nothing at $0', () => {
    const here = waysSetUp({ stripe: true, paypal: false });
    expect(waysOfBounty(0, here, true)).toEqual([]);
    expect(waysOfBounty(45, here, false)).toEqual(['by-hand', 'one-click']);
    expect(waysOfBounty(45, here, true)).toEqual(['by-hand', 'one-click', 'on-merge']);
    expect(waysOfBounty(45, waysSetUp({ stripe: false, paypal: false }), true)).toEqual(['by-hand']);
  });
});

describe('what a machine reads', () => {
  let r: Rig;
  beforeAll(async () => {
    r = await rig('not-a-real-token');
    r.standin.repositories.set(REPOSITORY, { language: 'TypeScript', visibility: 'public' });
    r.standin.issues = [issue()];
    await refreshUntilDone(r);
  }, 120000);
  afterAll(() => r.close());

  const read = async (path: string, keys: object): Promise<any> => (await handle(new Request(`${ORIGIN}${path}`), { ...r.env, ...keys })).json();

  it.each([
    ['no key', KEYS.none, [], false, ['by-hand'], 'by hand, by the owner'],
    ['Stripe', KEYS.stripe, ['Stripe'], true, ['by-hand', 'one-click'], 'by hand, by the owner; one click, by the owner, through Stripe'],
    ['PayPal', KEYS.paypal, ['PayPal'], false, ['by-hand', 'one-click'], 'by hand, by the owner; one click, by the owner, through PayPal']
  ])('the feed, with %s', async (_name, keys, oneClick, onMerge, ways, paid) => {
    const page = await read('/bounties.json', keys);
    expect(page.ways_set_up).toEqual({ by_hand: true, one_click: oneClick, on_merge: onMerge });
    expect(page.bounties[0].how_it_pays).toEqual({ ways });
    expect(page.bounties[0].reward.paid).toBe(paid);
    expect(page.legend.money).toContain('three ways');
  });

  it('a detail tells a solver what connecting gives, only for ways set up here', async () => {
    const none = (await read(`/bounties/${ID}.json`, KEYS.none)).bounty.how_to_get_paid.join(' ');
    expect(none).not.toMatch(/Connecting/);
    const paypal = (await read(`/bounties/${ID}.json`, KEYS.paypal)).bounty.how_to_get_paid.join(' ');
    expect(paypal).toContain('Connecting PayPal');
    expect(paypal).not.toContain('pay on merge');
    const both = (await read(`/bounties/${ID}.json`, KEYS.both)).bounty.how_to_get_paid.join(' ');
    expect(both).toContain('Connecting Stripe or PayPal');
    expect(both).toContain('pay on merge pays you with no click');
  });

  it('the profile says nothing it cannot know about a stranger, and holds no account detail', async () => {
    const stranger = await read('/api/solver/example-nobody', KEYS.both);
    expect(stranger.takes).toBeNull();
    expect(stranger.ways_set_up.one_click).toEqual(['Stripe', 'PayPal']);
  });

  it('MCP states the three ways', async () => {
    const response = await handle(new Request(`${ORIGIN}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'pf15', version: '1' } } }) }), r.env);
    const text = await response.text();
    expect(text).toContain('by hand, with one click');
    expect(text).toContain('how_it_pays');
  });
});

describe('the author\'s two facts', () => {
  let r: Rig;
  beforeAll(async () => {
    r = await rig('not-a-real-token');
    r.standin.repositories.set(REPOSITORY, { language: 'TypeScript', visibility: 'public' });
    r.standin.issues = [issue({ state: 'closed', closedAt: after, pulls: [{ number: 7, author: 'example-quill', state: 'closed', merged_at: after, created_at: new Date(NOW).toISOString() }] })];
    r.clock.at = NOW + 10 * MINUTE;
    await refreshUntilDone(r);
  }, 120000);
  afterAll(() => r.close());
  const detail = async (keys: object): Promise<any> => (await (await handle(new Request(`${ORIGIN}/bounties/${ID}.json`), { ...r.env, ...keys })).json() as any).bounty;
  const profile = async (keys: object): Promise<any> => (await handle(new Request(`${ORIGIN}/api/solver/example-quill`), { ...r.env, ...keys })).json();

  it('false before they connect; true only for a ready account, with no account id anywhere', async () => {
    const authorId = (await r.env.DB.prepare('SELECT author_id FROM pull_requests WHERE number = 7').first<{ author_id: number }>())!.author_id ?? SOLVER_ID;
    expect(await detail(KEYS.both)).toMatchObject({ author_takes_stripe: false, author_takes_paypal: false });
    expect((await profile(KEYS.both)).takes).toEqual({ stripe: false, paypal: false });
    await r.env.DB.prepare('INSERT INTO stripe_accounts (github_id, account_id, ready) VALUES (?, ?, 0)').bind(authorId, 'acct_notreal').run();
    expect((await detail(KEYS.both)).author_takes_stripe).toBe(false);
    await r.env.DB.prepare('UPDATE stripe_accounts SET ready = 1 WHERE github_id = ?').bind(authorId).run();
    const ready = await detail(KEYS.both);
    expect(ready.author_takes_stripe).toBe(true);
    // No key: the fact is false, whatever the row says.
    expect((await detail(KEYS.paypal)).author_takes_stripe).toBe(false);
    const raw = JSON.stringify(await profile(KEYS.both)) + JSON.stringify(ready);
    expect(raw).not.toContain('acct_notreal');
    expect((await profile(KEYS.both)).takes).toEqual({ stripe: true, paypal: false });
  });
});
