// PF61: the board knows you by your GitHub ID, and signs you in with PKCE. A login can change hands (a renamed account
// releases its old name), so who may see owner-only methods, record a payment or answer it is decided by the GitHub ID the
// board stored, never by the name. GitHub sign-in carries an S256 code challenge. "Sign out everywhere" ends every session
// of one GitHub ID.
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handle } from '../../packages/box-platform/src/api.js';
import { seedStates, STATE_IDS } from '../../packages/box-platform/standin/standin.js';
import { NOW, rig, type Rig, refreshUntilDone } from './support.js';

const ORIGIN = 'https://board.test';
const SECRET_EMAIL = 'pf61-hidden-sentinel@example.com';
const OWNER_LOGIN = 'example-mara';
const PAYEE_LOGIN = 'example-quill';

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
const payment = async (jar: Jar | null) => (await send(jar, `/api/b/${STATE_IDS.owed}/payment`)).json() as Promise<any>;
const signedIn = async (jar: Jar): Promise<boolean> => ((await (await send(jar, '/api/me')).json()) as { signed_in?: boolean }).signed_in !== false;

let owner: { id: number; login: string };
let payee: { id: number; login: string };
beforeEach(async () => {
  r = await rig('standin-read');
  seedStates(r.standin, NOW);
  await refreshUntilDone(r);
  owner = { id: r.standin.idOf(OWNER_LOGIN), login: OWNER_LOGIN };
  payee = { id: r.standin.idOf(PAYEE_LOGIN), login: PAYEE_LOGIN };
  const saved = await write(await signIn(payee), '/api/me/methods', 'PUT', { methods: [{ kind: 'wise-email', value: SECRET_EMAIL, visibility: 'owner-only' }] });
  expect(saved.status).toBe(200);
});
afterEach(async () => { await r.close(); });

describe('PF61: roles are decided by GitHub ID', () => {
  it('the board stored the poster\'s and the merged author\'s GitHub IDs (the facts the rule reads)', async () => {
    const row = await r.env.DB.prepare('SELECT b.poster_id, p.author_id FROM bounties b JOIN pull_requests p ON p.bounty_id = b.id WHERE b.id = ? AND p.state = \'merged\'').bind(STATE_IDS.owed).first<{ poster_id: number; author_id: number }>();
    expect(row).toEqual({ poster_id: owner.id, author_id: payee.id });
  });

  it('a login that changed hands: the poster\'s old name with another GitHub ID sees no owner-only method and cannot record paid', async () => {
    const impostor = await signIn({ id: owner.id + 1, login: OWNER_LOGIN });
    const seen = await payment(impostor);
    expect(seen.role).toBe('other');
    expect(JSON.stringify(seen)).not.toContain(SECRET_EMAIL);
    expect((await write(impostor, `/api/b/${STATE_IDS.owed}/paid`, 'POST', {})).status).toBe(403);
    // The same name with the stored GitHub ID is the poster.
    const real = await signIn(owner);
    const shown = await payment(real);
    expect(shown.role).toBe('owner');
    expect(JSON.stringify(shown)).toContain(SECRET_EMAIL);
    expect((await write(real, `/api/b/${STATE_IDS.owed}/paid`, 'POST', {})).status).toBe(200);
  });

  it('a login that changed hands: the payee\'s old name with another GitHub ID cannot answer received', async () => {
    expect((await write(await signIn(owner), `/api/b/${STATE_IDS.owed}/paid`, 'POST', {})).status).toBe(200);
    const impostor = await signIn({ id: payee.id + 1, login: PAYEE_LOGIN });
    expect((await payment(impostor)).role).toBe('other');
    expect((await write(impostor, `/api/b/${STATE_IDS.owed}/receipt`, 'POST', { says: 'received' })).status).toBe(403);
    expect((await write(await signIn(payee), `/api/b/${STATE_IDS.owed}/receipt`, 'POST', { says: 'received' })).status).toBe(200);
  });

  it('a row with no GitHub ID fails safe: owner-only methods hidden, recording refused with the line', async () => {
    await r.env.DB.prepare('UPDATE bounties SET poster_id = NULL WHERE id = ?').bind(STATE_IDS.owed).run();
    const jar = await signIn(owner);
    const seen = await payment(jar);
    expect(seen.role).toBe('other');
    expect(JSON.stringify(seen)).not.toContain(SECRET_EMAIL);
    const refused = await write(jar, `/api/b/${STATE_IDS.owed}/paid`, 'POST', {});
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { error: string }).error).toContain("this bounty's account could not be confirmed by GitHub id; nothing changed");
  });
});

describe('PF61: GitHub sign-in uses PKCE', () => {
  const challengeOf = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

  it('the authorize address carries an S256 challenge of the verifier kept in the state cookie, never the verifier', async () => {
    r.standin.signInAs = owner;
    const jar: Jar = new Map();
    const start = await send(jar, '/auth/github');
    const to = new URL(start.headers.get('location')!);
    expect(to.searchParams.get('code_challenge_method')).toBe('S256');
    const challenge = to.searchParams.get('code_challenge');
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const kept = [...jar.values()].find(value => value.includes('.'));
    expect(kept).toBeDefined();
    const verifier = kept!.split('.')[1]!;
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challengeOf(verifier)).toBe(challenge);
    expect(to.href).not.toContain(verifier);
  });

  it('the stand-in refuses an exchange whose verifier does not match the challenge', async () => {
    r.standin.signInAs = owner;
    const start = await send(new Map(), '/auth/github');
    const atGitHub = await fetch(start.headers.get('location')!, { redirect: 'manual' });
    const code = new URL(atGitHub.headers.get('location')!).searchParams.get('code');
    const exchange = await fetch(`${r.env.GITHUB_API}/login/oauth/access_token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_id: r.standin.oauthClientId, client_secret: r.standin.oauthClientSecret, code, code_verifier: 'x'.repeat(43) }) });
    expect(await exchange.json()).toMatchObject({ error: 'bad_verification_code' });
  });

  it('a callback whose cookie carries no verifier is refused like a bad state, and a replayed callback is refused', async () => {
    r.standin.signInAs = owner;
    const jar: Jar = new Map();
    const start = await send(jar, '/auth/github');
    const atGitHub = await fetch(start.headers.get('location')!, { redirect: 'manual' });
    const back = new URL(atGitHub.headers.get('location')!);
    const state = back.searchParams.get('state')!;
    const stateOnly: Jar = new Map([...jar].map(([name]) => [name, state]));
    expect((await send(stateOnly, `${back.pathname}${back.search}`)).headers.get('location')).toBe('/sign-in/?error=try-again');
    // A fresh sign-in completes once; the same callback again finds no state cookie.
    const fresh = await signIn(owner);
    expect(await signedIn(fresh)).toBe(true);
    expect((await send(new Map(), `${back.pathname}${back.search}`)).headers.get('location')).toBe('/sign-in/?error=try-again');
  });
});

describe('PF61: sign out everywhere', () => {
  it('ends every session of the viewer\'s GitHub ID and no other', async () => {
    const first = await signIn(owner);
    const second = await signIn(owner);
    const other = await signIn(payee);
    expect(await signedIn(first) && await signedIn(second) && await signedIn(other)).toBe(true);
    expect((await write(first, '/auth/sign-out', 'POST', { all: true })).status).toBe(200);
    expect(await signedIn(second)).toBe(false);
    expect(await signedIn(first)).toBe(false);
    expect(await signedIn(other)).toBe(true);
  });

  it('a forged Origin changes nothing', async () => {
    const first = await signIn(owner);
    const second = await signIn(owner);
    expect((await write(first, '/auth/sign-out', 'POST', { all: true }, { origin: 'https://evil.test' })).status).toBe(403);
    expect(await signedIn(first) && await signedIn(second)).toBe(true);
  });
});
