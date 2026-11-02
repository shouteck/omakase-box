// Sign-in, profiles and who may see an owner-only method, through handle() against
// the stand-in's OAuth. Every owner-only value is a sentinel looked for everywhere.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handle } from '../../packages/box-platform/src/api.js';
import { checkMethod, KINDS, parseStored } from '../../packages/box-platform/src/methods.js';
import { currentReceipt, ownerOnlyAllowed, payeeOf, type PaymentFacts, standingRecord } from '../../packages/box-platform/src/visibility.js';
import { seedStates, STATE_IDS } from '../../packages/box-platform/standin/standin.js';
import { MINUTE, NOW, rig, type Rig, refreshUntilDone } from './support.js';

const ORIGIN = 'https://board.test';
const SECRET_EMAIL = 'hidden-sentinel@example.com';
const PUBLIC_LINK = 'https://paypal.me/examplequill';
const OWNER = { id: 7100, login: 'example-mara' };
const PAYEE = { id: 7001, login: 'example-quill' };
const THIRD = { id: 7200, login: 'example-pike' };
const OTHER_MERGED = { id: 7300, login: 'example-rook' };

type Jar = Map<string, string>;
let r: Rig;

const envWithOauth = () => ({ ...r.env, GITHUB_WEB: r.env.GITHUB_API, GITHUB_OAUTH_CLIENT_ID: r.standin.oauthClientId, GITHUB_OAUTH_CLIENT_SECRET: r.standin.oauthClientSecret });

async function send(jar: Jar | null, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (jar !== null && jar.size > 0) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
  const response = await handle(new Request(`${ORIGIN}${path}`, { ...init, headers }), envWithOauth());
  if (jar !== null) for (const line of response.headers.getSetCookie()) {
    const [pair] = line.split(';');
    const at = pair!.indexOf('=');
    if (/Max-Age=0/.test(line)) jar.delete(pair!.slice(0, at)); else jar.set(pair!.slice(0, at), pair!.slice(at + 1));
  }
  return response;
}
const write = (jar: Jar | null, path: string, method: string, body: unknown, headers: Record<string, string> = { origin: ORIGIN }) =>
  send(jar, path, { method, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

async function signIn(who: { id: number; login: string }): Promise<Jar> {
  r.standin.signInAs = who;
  const jar: Jar = new Map();
  const start = await send(jar, '/auth/github');
  const atGitHub = await fetch(start.headers.get('location')!, { redirect: 'manual' });
  const back = new URL(atGitHub.headers.get('location')!);
  const done = await send(jar, `${back.pathname}${back.search}`);
  expect(done.headers.get('location')).toBe('/me/');
  return jar;
}
const saveQuill = async (jar: Jar) => {
  const saved = await write(jar, '/api/me/methods', 'PUT', { methods: [
    { kind: 'paypal', value: PUBLIC_LINK, visibility: 'everyone' },
    { kind: 'wise-email', value: SECRET_EMAIL, visibility: 'owner-only' }
  ] });
  expect(saved.status).toBe(200);
};
const paidEvent = (at: string, withdrawn = false) => ({ v: 1, type: 'paid', at, amount: 45, by: OWNER.login, withdrawn });
const payment = async (jar: Jar | null, id: string = STATE_IDS.owed) => (await send(jar, `/api/b/${id}/payment`)).json() as Promise<any>;
const seesSecret = async (jar: Jar | null, id?: string) => JSON.stringify(await payment(jar, id)).includes(SECRET_EMAIL);

/** Chain events arrive at the next refresh; the stand-in hands out new ones by index. */
async function record(events: Record<string, unknown>[]): Promise<void> {
  r.standin.issues.find(issue => issue.id === STATE_IDS.owed)!.events = events;
  r.clock.at += 15 * MINUTE;
  await refreshUntilDone(r);
}

beforeEach(async () => {
  // The token's budget: one tick reads every seeded bounty, so a new chain event lands at once.
  r = await rig('standin-read');
  seedStates(r.standin, NOW);
  await refreshUntilDone(r);
});
afterEach(async () => { await r.close(); });

describe('sign-in', () => {
  it('a round trip creates a session, asks GitHub for no scope, and stores no token anywhere', async () => {
    const jar = await signIn(PAYEE);
    const asked = new URL(r.standin.authorizeAsked[0]!);
    expect(asked.searchParams.has('scope')).toBe(false);
    expect(asked.searchParams.get('state')).toMatch(/^[a-f\d]{64}$/);

    const me = await (await send(jar, '/api/me')).json() as any;
    expect(me).toEqual({ signed_in: true, login: PAYEE.login, sponsors_page: `https://github.com/sponsors/${PAYEE.login}`, pay: { set_up: false }, paypal: { set_up: false, connected: false }, methods: [], you_owe: [], owed_to_you: [expect.objectContaining({ id: STATE_IDS.owed, amount: 45, to: PAYEE.login })], bounties: { list: [], more: false } });

    const token = r.standin.tokensIssued[0]!;
    expect(token.length).toBeGreaterThan(10);
    const tables = (await r.env.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all<{ name: string }>()).results;
    expect(tables.map(t => t.name)).toContain('sessions');
    const everything = JSON.stringify(await Promise.all(tables.map(t => r.env.DB.prepare(`SELECT * FROM ${t.name}`).all())));
    expect(everything).not.toContain(token);
    // The cookie's value itself is not stored either: only its hash.
    expect(everything).not.toContain(jar.get('__Host-board_session')!);
    expect(everything).toContain(PAYEE.login);
    expect(JSON.stringify(me)).not.toContain(token);
  });

  it('the session cookie is secure, HTTP-only and same-site', async () => {
    r.standin.signInAs = PAYEE;
    const jar: Jar = new Map();
    const start = await send(jar, '/auth/github');
    expect(start.headers.getSetCookie()[0]).toMatch(/^__Host-board_oauth_state=.*; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=600$/);
    const back = new URL((await fetch(start.headers.get('location')!, { redirect: 'manual' })).headers.get('location')!);
    const done = await send(jar, `${back.pathname}${back.search}`);
    const session = done.headers.getSetCookie().find(line => line.startsWith('__Host-board_session='))!;
    expect(session).toMatch(/; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=\d+$/);
  });

  it('a wrong or missing state is refused and signs nobody in', async () => {
    const jar: Jar = new Map();
    const start = await send(jar, '/auth/github');
    const back = new URL((await fetch(start.headers.get('location')!, { redirect: 'manual' })).headers.get('location')!);
    back.searchParams.set('state', 'f'.repeat(64));
    const done = await send(jar, `${back.pathname}${back.search}`);
    expect(done.headers.get('location')).toBe('/sign-in/?error=try-again');
    expect(await (await send(jar, '/api/me')).json()).toEqual({ signed_in: false });
    const none = await send(new Map(), `/auth/github/callback?code=x&state=y`);
    expect(none.headers.get('location')).toBe('/sign-in/?error=try-again');
  });

  it('a used code is refused, and the words shown name nothing from the address', async () => {
    const jar: Jar = new Map();
    const start = await send(jar, '/auth/github');
    const location = new URL((await fetch(start.headers.get('location')!, { redirect: 'manual' })).headers.get('location')!);
    await send(new Map(jar), `${location.pathname}${location.search}`);
    const again = await send(new Map(jar), `${location.pathname}${location.search}`);
    expect(again.headers.get('location')).toBe('/sign-in/?error=github');
  });

  it('without an OAuth app, sign-in says so instead of failing', async () => {
    const response = await handle(new Request(`${ORIGIN}/auth/github`), r.env);
    expect(response.headers.get('location')).toBe('/sign-in/?error=not-set-up');
  });

  it('sign-out: the session is gone, and a stolen copy of the cookie is refused', async () => {
    const jar = await signIn(PAYEE);
    const stolen = new Map(jar);
    expect((await (await send(stolen, '/api/me')).json() as any).signed_in).toBe(true);
    expect((await send(jar, '/auth/sign-out', { method: 'POST', headers: { origin: ORIGIN } })).status).toBe(200);
    expect(jar.has('__Host-board_session')).toBe(false);
    expect(await (await send(stolen, '/api/me')).json()).toEqual({ signed_in: false });
    expect((await write(stolen, '/api/me/methods', 'PUT', { methods: [] })).status).toBe(401);
    expect((await r.env.DB.prepare('SELECT COUNT(*) AS n FROM sessions').first<{ n: number }>())?.n).toBe(0);
  });

  it('an expired session is refused', async () => {
    const jar = await signIn(PAYEE);
    r.clock.at += 31 * 24 * 60 * MINUTE;
    expect(await (await send(jar, '/api/me')).json()).toEqual({ signed_in: false });
  });
});

describe('shape of a method', () => {
  it.each([
    ['paypal', 'https://evil.example/paypal.me/x'],
    ['paypal', 'javascript:alert(1)'],
    ['paypal', 'http://paypal.me/x'],
    ['paypal', 'https://paypal.me.evil.example/x'],
    ['paypal', 'https://paypal.me/x\nhttps://evil.example'],
    ['stripe', 'https://stripe.com/x'],
    ['stripe', 'javascript:alert(1)'],
    ['github-sponsors', 'https://github.com/evil/repo'],
    ['github-sponsors', 'javascript:alert(1)'],
    ['wise-email', 'not-an-email'],
    ['wise-email', 'javascript:alert(1)'],
    ['wise-email', 'a@b'],
    ['wallet', 'javascript:alert(1)'],
    ['wallet', 'short']
  ])('%s refuses %s, with the reason and the next step', (kind, value) => {
    const answer = checkMethod({ kind, value, chain: 'Ethereum', visibility: 'everyone' }) as { error: string };
    expect(answer.error).toBe(KINDS[kind]!.refusal);
    expect(answer.error).toContain('Next:');
  });

  it('accepts each kind\'s right shape', () => {
    for (const [kind, value] of [['paypal', 'https://paypal.me/someone'], ['stripe', 'https://buy.stripe.com/abc123'], ['github-sponsors', 'https://github.com/sponsors/someone'], ['wise-email', 'a.b@example.co.uk'], ['wallet', '0x52908400098527886E0F7030069857D2E4169EE7']]) {
      expect(checkMethod({ kind, value, chain: 'Ethereum', visibility: 'owner-only' })).toMatchObject({ kind, value, visibility: 'owner-only' });
    }
  });

  it('refuses an unknown or inherited kind, no chain, no visibility, by name', () => {
    expect(checkMethod({ kind: 'constructor', value: 'x', visibility: 'everyone' })).toHaveProperty('error');
    expect(checkMethod({ kind: 'bank', value: 'x', visibility: 'everyone' })).toHaveProperty('error');
    expect((checkMethod({ kind: 'wallet', value: '0x52908400098527886E0F7030069857D2E4169EE7', visibility: 'everyone' }) as any).error).toContain('chain');
    expect((checkMethod({ kind: 'paypal', value: PUBLIC_LINK, visibility: 'public' }) as any).error).toContain('who sees it');
    expect(checkMethod(null)).toHaveProperty('error');
  });

  it('a stored row that no longer passes is dropped, never shown', () => {
    expect(parseStored([{ kind: 'paypal', value: 'javascript:alert(1)', chain: null, visibility: 'everyone' }, { kind: 'paypal', value: PUBLIC_LINK, chain: null, visibility: 'everyone' }])).toHaveLength(1);
  });

  it('the save route refuses a bad list whole, naming which, and keeps what was saved', async () => {
    const jar = await signIn(PAYEE);
    await saveQuill(jar);
    const bad = await write(jar, '/api/me/methods', 'PUT', { methods: [{ kind: 'paypal', value: PUBLIC_LINK, visibility: 'everyone' }, { kind: 'paypal', value: 'javascript:alert(1)', visibility: 'everyone' }] });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: KINDS['paypal']!.refusal, index: 1 });
    const me = await (await send(jar, '/api/me')).json() as any;
    expect(me.methods.map((m: any) => m.value)).toEqual([PUBLIC_LINK, SECRET_EMAIL]);
    const many = Array.from({ length: 11 }, () => ({ kind: 'paypal', value: PUBLIC_LINK, visibility: 'everyone' }));
    expect((await write(jar, '/api/me/methods', 'PUT', { methods: many })).status).toBe(400);
  });
});

describe('writes', () => {
  it('another user cannot edit my profile: the route has no target, and my list stays mine', async () => {
    const mine = await signIn(PAYEE);
    await saveQuill(mine);
    const theirs = await signIn(THIRD);
    const attempt = await write(theirs, '/api/me/methods', 'PUT', { login: PAYEE.login, github_id: PAYEE.id, methods: [{ kind: 'paypal', value: 'https://paypal.me/thief', visibility: 'everyone' }] });
    expect(attempt.status).toBe(200);
    expect((await attempt.json() as any).login).toBe(THIRD.login);
    expect((await (await send(mine, '/api/me')).json() as any).methods.map((m: any) => m.value)).toEqual([PUBLIC_LINK, SECRET_EMAIL]);
    expect((await (await send(null, `/api/solver/${THIRD.login}`)).json() as any).methods[0].value).toBe('https://paypal.me/thief');
    expect((await (await send(null, `/api/solver/${PAYEE.login}`)).json() as any).methods.map((m: any) => m.value)).toEqual([PUBLIC_LINK]);
  });

  it('signed out, a write is refused', async () => {
    expect((await write(null, '/api/me/methods', 'PUT', { methods: [] })).status).toBe(401);
  });

  it.each([
    ['no Origin', {}],
    ['a foreign Origin', { origin: 'https://evil.example' }],
    ['a look-alike Origin', { origin: 'https://board.test.evil.example' }]
  ])('CSRF: %s is refused on every write, and nothing changes', async (_name, headers) => {
    const jar = await signIn(PAYEE);
    await saveQuill(jar);
    expect((await write(jar, '/api/me/methods', 'PUT', { methods: [] }, headers)).status).toBe(403);
    expect((await send(jar, '/auth/sign-out', { method: 'POST', headers })).status).toBe(403);
    expect((await write(jar, `/api/b/${STATE_IDS.owed}/receipt`, 'POST', { says: 'received' }, headers)).status).toBe(403);
    expect((await (await send(jar, '/api/me')).json() as any).methods).toHaveLength(2);
  });

  it('a form post (no JSON type) and an oversized body are refused', async () => {
    const jar = await signIn(PAYEE);
    await saveQuill(jar);
    const form = await send(jar, '/api/me/methods', { method: 'PUT', headers: { origin: ORIGIN, 'content-type': 'text/plain' }, body: '{"methods":[]}' });
    expect(form.status).toBe(415);
    const big = await write(jar, '/api/me/methods', 'PUT', { methods: [], pad: 'x'.repeat(20000) });
    expect(big.status).toBe(413);
    expect((await (await send(jar, '/api/me')).json() as any).methods).toHaveLength(2);
  });

  it('a login that changed hands: the earlier holder\'s methods go at the new holder\'s sign-in', async () => {
    await saveQuill(await signIn(PAYEE));
    const next = await signIn({ id: 9999, login: PAYEE.login });
    expect((await (await send(next, '/api/me')).json() as any).methods).toEqual([]);
    expect(JSON.stringify((await r.env.DB.prepare('SELECT * FROM methods').all()).results)).not.toContain(SECRET_EMAIL);
  });
});

describe('the rule, as a table', () => {
  const base: PaymentFacts = { amount: 45, poster: OWNER.login, merged: [{ number: 1, author: PAYEE.login }], record: null, receipt: null };
  const recorded = { at: '2026-10-30T00:00:00Z', amount: 45, withdrawn: 0 };
  const says = (value: 'received' | 'not-received', record_at = recorded.at) => ({ says: value, record_at, at: '2026-10-31T00:00:00Z' });
  it.each<[string, PaymentFacts, string | null, boolean]>([
    ['owed, the poster', base, OWNER.login, true],
    ['owed, the poster in another case', base, OWNER.login.toUpperCase(), true],
    ['owed, a stranger', base, THIRD.login, false],
    ['owed, nobody signed in', base, null, false],
    ['owed, the payee (their own view is /me/)', base, PAYEE.login, false],
    ['recorded, the poster', { ...base, record: recorded }, OWNER.login, false],
    ['recorded, says not received, the poster', { ...base, record: recorded, receipt: says('not-received') }, OWNER.login, true],
    ['recorded, says not received, a stranger', { ...base, record: recorded, receipt: says('not-received') }, THIRD.login, false],
    ['recorded, says received, the poster', { ...base, record: recorded, receipt: says('received') }, OWNER.login, false],
    ['two merged, the poster', { ...base, merged: [{ number: 1, author: PAYEE.login }, { number: 2, author: 'example-rook' }] }, OWNER.login, false],
    ['no reward, the poster', { ...base, amount: 0 }, OWNER.login, false],
    ['nothing merged, the poster', { ...base, merged: [] }, OWNER.login, false]
  ])('%s', (_name, facts, viewer, allowed) => {
    expect(ownerOnlyAllowed(facts, viewer)).toBe(allowed);
  });

  it('an answer about an earlier record says nothing about the current one', () => {
    expect(currentReceipt(recorded, says('not-received', '2026-01-01T00:00:00Z'))).toBeNull();
    expect(currentReceipt(null, says('not-received'))).toBeNull();
    expect(currentReceipt(recorded, says('not-received'))?.says).toBe('not-received');
  });

  it('the latest paid event decides', () => {
    expect(standingRecord([])).toBeNull();
    expect(standingRecord([recorded, { at: '2026-10-31T00:00:00Z', amount: null, withdrawn: 1 }])).toBeNull();
    expect(standingRecord([{ at: '2026-10-31T00:00:00Z', amount: 45, withdrawn: 0 }, { at: '2026-10-01T00:00:00Z', amount: null, withdrawn: 1 }])?.at).toBe('2026-10-31T00:00:00Z');
    expect(payeeOf({ amount: 45, merged: [] })).toBeNull();
  });
});

describe('visibility, on the real routes', () => {
  /** Every public address a stranger can reach, as read by this visitor. */
  const everyPublicAnswer = async (jar: Jar | null): Promise<string> => {
    const paths = ['/bounties.json', '/bounties.json?limit=25', '/bounties.schema.json', '/rss.xml', '/api/board',
      ...Object.values(STATE_IDS).flatMap(id => [`/api/b/${id}`, `/bounties/${id}.json`]),
      `/api/solver/${PAYEE.login}`, `/api/owner/${OWNER.login}`, `/api/solver/${OWNER.login}`];
    const texts = await Promise.all(paths.map(async path => (await send(jar, path)).text()));
    const mcp = async (name: string, args: object) => (await send(jar, '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) })).text();
    return [...texts, await mcp('find_bounties', { limit: 25 }), await mcp('get_bounty', { id: STATE_IDS.owed })].join('\n');
  };

  it('a restricted method is in no public page, feed or MCP output, for anyone, even the owner it is shown to', async () => {
    await saveQuill(await signIn(PAYEE));
    const public_ = await everyPublicAnswer(null);
    expect(public_).toContain(PUBLIC_LINK);
    expect(public_).toContain('find');
    expect(public_).not.toContain(SECRET_EMAIL);
    for (const who of [THIRD, OWNER, PAYEE]) expect(await everyPublicAnswer(await signIn(who))).not.toContain(SECRET_EMAIL);
  });

  it('your page\'s debts: the owner and the payee each see theirs, another account and signed out neither, and no method rides along', async () => {
    const payeeJar = await signIn(PAYEE);
    await saveQuill(payeeJar);
    const owner = await (await send(await signIn(OWNER), '/api/me')).json() as any;
    expect(owner.you_owe.map((debt: any) => [debt.id, debt.to, debt.amount])).toContainEqual([STATE_IDS.owed, PAYEE.login, 45]);
    expect(owner.owed_to_you).toEqual([]);
    expect(JSON.stringify(owner)).not.toContain(SECRET_EMAIL);
    expect(JSON.stringify(owner)).not.toContain(PUBLIC_LINK);
    const payee = await (await send(payeeJar, '/api/me')).json() as any;
    expect(payee.owed_to_you.map((debt: any) => [debt.id, debt.to, debt.amount])).toContainEqual([STATE_IDS.owed, PAYEE.login, 45]);
    expect(payee.you_owe).toEqual([]);
    const third = await (await send(await signIn(THIRD), '/api/me')).json() as any;
    expect(third.you_owe).toEqual([]);
    expect(third.owed_to_you).toEqual([]);
    expect(await (await send(null, '/api/me')).json()).toEqual({ signed_in: false });
  });

  it('your page\'s debts: a recorded payment leaves both lists, and a repository gone private leaves them', async () => {
    const ownerJar = await signIn(OWNER);
    const owed = async () => ((await (await send(ownerJar, '/api/me')).json() as any).you_owe as any[]).map(debt => debt.id);
    expect(await owed()).toContain(STATE_IDS.owed);
    expect((await write(ownerJar, `/api/b/${STATE_IDS.owed}/paid`, 'POST', {})).status).toBe(200);
    expect(await owed()).not.toContain(STATE_IDS.owed);
    expect((await write(ownerJar, `/api/b/${STATE_IDS.owed}/paid`, 'POST', { withdraw: true })).status).toBe(200);
    expect(await owed()).toContain(STATE_IDS.owed);
    const repository = r.standin.issues.find(issue => issue.id === STATE_IDS.owed)!.repository;
    r.standin.repositories.get(repository)!.visibility = 'private';
    r.clock.at += 6 * MINUTE;
    expect(await owed()).not.toContain(STATE_IDS.owed);
  });

  it('owed: shown to that bounty\'s poster on that bounty, to nobody else, and never on another of their bounties', async () => {
    await saveQuill(await signIn(PAYEE));
    const owner = await signIn(OWNER);
    expect(await seesSecret(owner)).toBe(true);
    expect((await payment(owner)).role).toBe('owner');
    expect(await seesSecret(null)).toBe(false);
    expect(await seesSecret(await signIn(THIRD))).toBe(false);
    expect((await (await send(owner, `/api/solver/${PAYEE.login}`)).text())).not.toContain(SECRET_EMAIL);
    expect(await seesSecret(owner, STATE_IDS.waiting)).toBe(false);
    expect(await seesSecret(owner, STATE_IDS.open)).toBe(false);
    // The solver sees their own, on their own page.
    expect(JSON.stringify(await (await send(await signIn(PAYEE), '/api/me')).json())).toContain(SECRET_EMAIL);
  });

  it('an owner of another bounty, who owes this solver nothing here, sees nothing', async () => {
    await saveQuill(await signIn(PAYEE));
    const issue = r.standin.issues.find(entry => entry.id === STATE_IDS.closed)!;
    issue.poster = THIRD.login;
    r.clock.at += 15 * MINUTE;
    await refreshUntilDone(r);
    const other = await signIn(THIRD);
    for (const id of [STATE_IDS.owed, STATE_IDS.closed]) expect(await seesSecret(other, id)).toBe(false);
  });

  // PF18's leftover, fixed in PF19: once a payment is recorded, asking how to be paid is no longer the next step.
  it('a recorded payment drops the next step of asking how the payee wants to be paid', async () => {
    const owner = await signIn(OWNER);
    expect((await payment(owner)).payees[0].next).toMatch(/^Next: ask on pull request #\d+ how example-quill wants to be paid\.$/);
    expect((await write(owner, `/api/b/${STATE_IDS.owed}/paid`, 'POST', { to: 'example-quill' })).status).toBe(200);
    const after = await payment(owner);
    expect(after.recorded).not.toBeNull();
    expect(after.payees[0].next).toBeNull();
  });

  it('more than one merged: public methods only, for each author, even to the owner, with the next step for one with none', async () => {
    await saveQuill(await signIn({ id: 7400, login: 'example-fern' }));
    const owner = await signIn(OWNER);
    const view = await payment(owner, STATE_IDS.moreThanOne);
    expect(view.payee).toBeNull();
    expect(JSON.stringify(view)).not.toContain(SECRET_EMAIL);
    expect(view.payees.map((p: any) => p.login)).toEqual(['example-fern', 'example-rook']);
    expect(view.payees[0].methods.map((m: any) => m.value)).toEqual([PUBLIC_LINK]);
    expect(view.payees[1].next).toBe('Next: ask on pull request #66 how example-rook wants to be paid.');
    expect(OTHER_MERGED.login).toBe(view.payees[1].login);
  });

  it('a no-reward bounty shows no one\'s methods', async () => {
    const view = await payment(await signIn(OWNER), STATE_IDS.noReward);
    expect(view.payees).toEqual([]);
  });

  it('a private repository: the payment answer is gone, and so is the payee\'s answer', async () => {
    await saveQuill(await signIn(PAYEE));
    await record([paidEvent(new Date(NOW).toISOString())]);
    const payee = await signIn(PAYEE);
    expect((await write(payee, `/api/b/${STATE_IDS.owed}/receipt`, 'POST', { says: 'not-received' })).status).toBe(200);
    r.standin.repositories.get('example-tidepool/ledger-lite')!.visibility = 'private';
    r.clock.at += 6 * MINUTE;
    const gone = await send(await signIn(OWNER), `/api/b/${STATE_IDS.owed}/payment`);
    expect(gone.status).toBe(404);
    expect(await gone.text()).not.toContain(SECRET_EMAIL);
    expect((await r.env.DB.prepare('SELECT COUNT(*) AS n FROM receipts').first<{ n: number }>())?.n).toBe(0);
  });
});

describe('a disputed payment, end to end', () => {
  it('shows again to that owner on "not received"; hides on "received" and on withdrawal', async () => {
    await saveQuill(await signIn(PAYEE));
    const owner = await signIn(OWNER);
    const payee = await signIn(PAYEE);
    const stranger = await signIn(THIRD);
    const answer = (says: string | null, jar = payee) => write(jar, `/api/b/${STATE_IDS.owed}/receipt`, 'POST', { says });

    expect(await seesSecret(owner)).toBe(true);
    expect((await answer('not-received')).status).toBe(409); // nothing recorded yet

    await record([paidEvent(new Date(NOW).toISOString())]);
    expect(await seesSecret(owner)).toBe(false);
    expect((await payment(owner)).owner_only_hidden).toBe(true);
    expect((await payment(payee)).can_answer).toBe(true);

    expect((await answer('not-received', stranger)).status).toBe(403);
    expect((await answer('not-received', owner)).status).toBe(403);
    expect(await seesSecret(owner)).toBe(false);

    expect((await answer('not-received')).status).toBe(200);
    expect(await seesSecret(owner)).toBe(true);
    expect((await payment(owner)).receipt.says).toBe('not-received');
    expect(await seesSecret(stranger)).toBe(false);
    expect(await seesSecret(null)).toBe(false);
    expect((await payment(stranger)).receipt.says).toBe('not-received'); // public since PF4; the methods are not
    expect(await seesSecret(owner, STATE_IDS.waiting)).toBe(false);
    expect(await (await send(owner, `/api/solver/${PAYEE.login}`)).text()).not.toContain(SECRET_EMAIL);
    expect(await (await send(owner, `/bounties/${STATE_IDS.owed}.json`)).text()).not.toContain(SECRET_EMAIL);

    expect((await answer('received')).status).toBe(200);
    expect(await seesSecret(owner)).toBe(false);

    expect((await answer('not-received')).status).toBe(200);
    expect(await seesSecret(owner)).toBe(true);
    expect((await answer(null)).status).toBe(200);
    expect(await seesSecret(owner)).toBe(false);
    expect((await payment(owner)).receipt).toBeNull();
  });

  it('a withdrawn record owes again; a new record ignores the answer about the old one', async () => {
    await saveQuill(await signIn(PAYEE));
    const owner = await signIn(OWNER);
    const payee = await signIn(PAYEE);
    const first = new Date(NOW).toISOString();
    await record([paidEvent(first)]);
    await write(payee, `/api/b/${STATE_IDS.owed}/receipt`, 'POST', { says: 'not-received' });
    expect(await seesSecret(owner)).toBe(true);

    await record([paidEvent(first), paidEvent(new Date(NOW + MINUTE).toISOString(), true)]);
    expect(await seesSecret(owner)).toBe(true);
    expect((await payment(owner)).recorded).toBeNull();

    await record([paidEvent(first), paidEvent(new Date(NOW + MINUTE).toISOString(), true), paidEvent(new Date(NOW + 2 * MINUTE).toISOString())]);
    expect(await seesSecret(owner)).toBe(false);
    expect((await payment(owner)).receipt).toBeNull();
  });

  it('bad answers are refused by name', async () => {
    await record([paidEvent(new Date(NOW).toISOString())]);
    const payee = await signIn(PAYEE);
    expect((await write(payee, `/api/b/${STATE_IDS.owed}/receipt`, 'POST', { says: 'maybe' })).status).toBe(400);
    expect((await write(payee, `/api/b/bt-000000000000/receipt`, 'POST', { says: 'received' })).status).toBe(404);
    expect((await write(null, `/api/b/${STATE_IDS.owed}/receipt`, 'POST', { says: 'received' })).status).toBe(401);
  });
});

describe('profiles', () => {
  it('a solver\'s page shows public methods and merged solutions; an owner\'s shows their bounties, none on a private repository', async () => {
    await saveQuill(await signIn(PAYEE));
    const solver = await (await send(null, `/api/solver/${PAYEE.login.toUpperCase()}`)).json() as any;
    expect(solver.methods.map((m: any) => m.value)).toEqual([PUBLIC_LINK]);
    expect(solver.merged.map((b: any) => b.id).sort()).toEqual([STATE_IDS.merged, STATE_IDS.owed].sort());
    const owner = await (await send(null, `/api/owner/${OWNER.login}`)).json() as any;
    expect(owner.bounties.map((b: any) => b.id)).toContain(STATE_IDS.open);
    expect(JSON.stringify(owner)).not.toContain('PRIVATE SAMPLE');
    expect(owner.bounties).toHaveLength(Object.keys(STATE_IDS).length - 1);
  });

  it('a person the board has never heard of: facts empty, not an error, and nothing fetched', async () => {
    const before = r.standin.requests.length;
    expect(await (await send(null, '/api/solver/example-nobody')).json()).toEqual({ login: 'example-nobody', record: { has_history: false, merged: 0, confirmed_received: 0 }, methods: [], methods_more: 0, merged: [], ways_set_up: { by_hand: true, one_click: [], on_merge: false }, takes: null });
    expect(await (await send(null, '/api/owner/example-nobody')).json()).toEqual({ login: 'example-nobody', record: { has_history: false, merged: 0, recorded_paid: 0, confirmed_received: 0, from_solvers: 0, owed_now: 0, oldest_owed_days: 0, says_not_received: 0, median_days_to_record_paid: null }, not_counted: [], bounties: [] });
    expect(r.standin.requests.length).toBe(before);
  });

  it('a malformed login is refused by name', async () => {
    for (const bad of ['a%2Fb', '%3Cscript%3E', '-x', '%E0%A4%A']) expect((await send(null, `/api/solver/${bad}`)).status).toBe(404);
    expect((await send(null, '/api/b/%E0%A4%A/payment')).status).toBe(404);
  });

  it('the feed tells a solver how to be paid, and points at the profile', async () => {
    const detail = await (await send(null, `/bounties/${STATE_IDS.open}.json`)).json() as any;
    expect(detail.bounty.how_to_get_paid.join(' ')).toContain(`${ORIGIN}/me/`);
    expect(detail.bounty.how_to_get_paid.join(' ')).toContain('say how in your pull request');
  });
});

describe('your bounties (PF21)', () => {
  // The stand-in gives each login a GitHub id; the owner's is made the one they sign in with, and the board reads it again.
  const asOwner = async (): Promise<Jar> => {
    r.standin.accountIds.set(OWNER.login, OWNER.id);
    r.clock.at += 15 * MINUTE;
    await refreshUntilDone(r);
    return signIn(OWNER);
  };
  const listed = async (jar: Jar) => ((await (await send(jar, '/api/me')).json() as any).bounties.list as any[]);
  const byId = (list: any[]) => new Map(list.map(b => [b.id, b]));

  it('every bounty GitHub says I opened, each in the stage its facts put it; a repository gone private leaves with its bounties', async () => {
    const jar = await asOwner();
    const list = byId(await listed(jar));
    expect(list.get(STATE_IDS.open)).toMatchObject({ stage: 'waiting', solutions: 0, reward: 45, repository: 'example-tidepool/ledger-lite', issue_number: 48 });
    expect(list.get(STATE_IDS.waiting)).toMatchObject({ stage: 'solutions', solutions: 2 });
    expect(list.get(STATE_IDS.closed)).toMatchObject({ stage: 'closed' });
    expect(list.get(STATE_IDS.owed)).toMatchObject({ stage: 'due', merged: PAYEE.login, payable: true, card_failed: false, note: 'Pay on merge is off for this repository.' });
    expect(list.get(STATE_IDS.moreThanOne)).toMatchObject({ stage: 'due', merged: null, merged_one_of: ['example-fern', 'example-rook'], note: 'More than one solution was merged. You choose whom to pay.' });
    expect(list.get(STATE_IDS.merged)).toMatchObject({ stage: 'paid', merged: PAYEE.login, paid_by: 'Recorded by you' });
    expect(list.has(STATE_IDS.private)).toBe(false);
    expect([...list.values()].map(b => b.created_at)).toEqual([...list.values()].map(b => b.created_at).sort().reverse());
    // A repository with nothing owed (so no other list reads it again) goes private: at the next look past the
    // recheck window, its bounties leave the list. First shown to be listed.
    r.standin.repositories.set('example-tidepool/quiet', { language: 'Go', visibility: 'public' });
    r.standin.issues.push({ ...r.standin.issues.find(issue => issue.id === STATE_IDS.open)!, id: 'bt-0000000000aa', repository: 'example-tidepool/quiet', number: 7, title: 'QUIET REPOSITORY BOUNTY' });
    r.clock.at += 15 * MINUTE;
    await refreshUntilDone(r);
    expect((await listed(jar)).map(b => b.title)).toContain('QUIET REPOSITORY BOUNTY');
    r.standin.repositories.get('example-tidepool/quiet')!.visibility = 'private';
    r.clock.at += 6 * MINUTE;
    expect((await listed(jar)).map(b => b.title)).not.toContain('QUIET REPOSITORY BOUNTY');
  });

  it('another person\'s bounty never appears, nor any to a new holder of my login', async () => {
    const ownerJar = await asOwner();
    // Another poster's bounty on a listed repository, first shown to be on the board.
    r.standin.issues.push({ ...r.standin.issues.find(issue => issue.id === STATE_IDS.open)!, id: 'bt-0123456789ab', number: 90, title: 'SOMEONE ELSES BOUNTY', poster: THIRD.login });
    r.standin.accountIds.set(THIRD.login, THIRD.id);
    r.clock.at += 15 * MINUTE;
    await refreshUntilDone(r);
    expect(await r.env.DB.prepare('SELECT poster_id FROM bounties WHERE id = ?').bind('bt-0123456789ab').first()).toEqual({ poster_id: THIRD.id });
    expect((await listed(ownerJar)).map(b => b.title)).not.toContain('SOMEONE ELSES BOUNTY');
    expect((await listed(await signIn(THIRD))).map(b => b.title)).toEqual(['SOMEONE ELSES BOUNTY']);
    // The login passed to someone else: the bounties stay with the GitHub account that opened them.
    expect(await listed(await signIn({ id: 7999, login: OWNER.login }))).toEqual([]);
  });

  it('how a payment went decides the stage: a declined card is due, in red; pay on merge and one click are paid, each by name', async () => {
    const jar = await asOwner();
    const charge = (state: string, method: string | null) => r.env.DB.prepare(`INSERT INTO charges (bounty_id, state, solver, payment_method, at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (bounty_id) DO UPDATE SET state = excluded.state, payment_method = excluded.payment_method`).bind(STATE_IDS.owed, state, PAYEE.login, method, r.clock.at).run();
    const owed = async () => byId(await listed(jar)).get(STATE_IDS.owed);
    await charge('declined', 'pm_saved');
    expect(await owed()).toMatchObject({ stage: 'due', card_failed: true, payable: true, note: 'The card was declined. Nothing was charged.' });
    await charge('charging', 'pm_saved');
    expect(await owed()).toMatchObject({ stage: 'due', card_failed: false, payable: false, note: 'A charge has been started and has not finished.' });
    await charge('paid', 'pm_saved');
    expect(await owed()).toMatchObject({ stage: 'paid', paid_by: 'Pay on merge', merged: PAYEE.login });
    await charge('paid', null);
    expect(await owed()).toMatchObject({ stage: 'paid', paid_by: 'Stripe, one click' });
  });
});
