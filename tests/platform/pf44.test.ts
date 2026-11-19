// PF44: an issue imported to the board waits for its owner's approval, given as one exact comment on the GitHub issue, with
// no sign-in to the board. Through handle() against the stand-in: the pending listing promises nothing and pays nothing,
// who may approve, each comment that approves nothing, the comment kept as proof, and the importer removing a pending one.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handle } from '../../packages/box-platform/src/api.js';
import type { StandinIssue } from '../../packages/box-platform/standin/standin.js';
import { MINUTE, NOW, rig, type Rig, refreshUntilDone } from './support.js';

const ORIGIN = 'https://board.test';
const REPO = 'example-org/tools';
const PIKE = { id: 7200, login: 'example-pike' };
const QUILL = { id: 7001, login: 'example-quill' };
const ROOK = { id: 7300, login: 'example-rook' };
const OMAKASE = { id: 7400, login: 'example-omakase' };

type Jar = Map<string, string>;
let r: Rig;
const env = () => ({ ...r.env, GITHUB_WEB: r.env.GITHUB_API, GITHUB_OAUTH_CLIENT_ID: r.standin.oauthClientId, GITHUB_OAUTH_CLIENT_SECRET: r.standin.oauthClientSecret });
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
const issue = (): StandinIssue => r.standin.issues.find(entry => entry.number === 14)!;
const comment = (login: string, body: string, association: string, at = NOW + 30 * MINUTE) => issue().comments!.push({ login, body, association, created_at: new Date(at).toISOString() });
const view = async (id: string) => (await (await send(null, `/api/b/${id}`)).json() as any).bounty;
const feedIds = async () => (await (await send(null, '/bounties.json')).json() as any).bounties.map((b: any) => b.id);
const row = (id: string) => r.env.DB.prepare('SELECT poster, poster_id, approval, approval_proof FROM bounties WHERE id = ?').bind(id).first<any>();
async function run(): Promise<void> { r.clock.at += 20 * MINUTE; await refreshUntilDone(r); }

/** Omakase, which cannot write to the repository, imports Pike's issue at $50. */
async function imported(): Promise<{ omakase: Jar; id: string; line: string }> {
  const omakase = await signIn(OMAKASE);
  const answer = await post(omakase, '/api/import', { issue: `https://github.com/${REPO}/issues/14`, reward: 50 });
  expect(answer.status).toBe(200);
  const body = await answer.json() as any;
  expect(body).toMatchObject({ pending: true, approve_with: `omakase approve ${body.listed} $50` });
  return { omakase, id: body.listed, line: body.approve_with };
}

beforeEach(async () => {
  r = await rig('standin-read');
  r.standin.repositories.set(REPO, { language: 'TypeScript', visibility: 'public', owner: { login: 'example-org', type: 'Organization' }, writers: [ROOK.id] });
  for (const who of [PIKE, ROOK, OMAKASE]) r.standin.accountIds.set(who.login, who.id);
  r.standin.issues.push({ id: 'plain-14', repository: REPO, number: 14, title: 'Plain issue 14', task: 'Make the export keep its order.', poster: PIKE.login, amount: 0,
    createdAt: new Date(NOW).toISOString(), plain: true, pulls: [], comments: [] });
}, 120000);
afterEach(async () => { await r.close(); });

describe('an imported listing before approval', () => {
  it('says it is not approved, promises nothing, is not in the open list, and nothing can be paid or recorded', async () => {
    const { id, line } = await imported();
    issue().pulls = [{ number: 41, author: QUILL.login, state: 'closed', merged_at: new Date(NOW).toISOString(), created_at: new Date(NOW).toISOString() }];
    await run();
    const bounty = await view(id);
    expect(bounty).toMatchObject({ source: 'listed', poster: PIKE.login, listed_by: OMAKASE.login, open_to_answers: false, how_it_pays: { ways: [] }, approval: { state: 'pending', approve_with: line, proof: null } });
    expect(await feedIds()).not.toContain(id);
    const pike = await signIn(PIKE);
    for (const step of ['paid', 'pay', 'pay-paypal']) {
      const answer = await post(pike, `/api/b/${id}/${step}`, { to: QUILL.login });
      expect(answer.status).toBe(409);
      expect((await answer.json() as any).error).toMatch(/^The issue's owner has not approved this listing/);
    }
    expect(await r.env.DB.prepare('SELECT COUNT(*) AS n FROM paid_clicks').first<{ n: number }>()).toEqual({ n: 0 });
  });

  it('PF41: a pending import alone leaves the board empty, so it shows the empty board', async () => {
    await imported();
    await run();
    const board = await (await send(null, '/api/board')).json() as any;
    expect(board).toMatchObject({ open_total: 0, count: 0, bounties: [] });
  });

  it('the importer may remove it while it waits; someone else may not', async () => {
    const { omakase, id } = await imported();
    expect((await post(await signIn(QUILL), `/api/b/${id}/remove`, {})).status).toBe(403);
    expect((await post(omakase, `/api/b/${id}/remove`, {})).status).toBe(200);
    expect(await row(id)).toBeNull();
  });
});

describe('approval by a comment on the issue', () => {
  it('the issue author\'s exact comment approves it with no sign-in: the comment is the proof and it opens to answers', async () => {
    const { id, line } = await imported();
    comment(PIKE.login, `  ${line}\n`, 'NONE');
    await run();
    expect(await row(id)).toEqual({ poster: PIKE.login, poster_id: PIKE.id, approval: 'comment', approval_proof: `https://github.com/${REPO}/issues/14#issuecomment-1` });
    expect(await view(id)).toMatchObject({ open_to_answers: true, approval: { state: 'approved', approve_with: null, proof: `https://github.com/${REPO}/issues/14#issuecomment-1` } });
    expect((await view(id)).how_it_pays.ways).toContain('by-hand');
    expect(await feedIds()).toContain(id);
  });

  it('a repository collaborator\'s comment approves it, and the collaborator becomes the poster who pays', async () => {
    const { id, line } = await imported();
    comment(ROOK.login, line, 'COLLABORATOR');
    await run();
    expect(await row(id)).toMatchObject({ poster: ROOK.login, poster_id: ROOK.id, approval: 'comment' });
  });

  it('approves nothing: another amount or id, a member or contributor or stranger, or a comment from before the import', async () => {
    const { id, line } = await imported();
    comment(PIKE.login, `omakase approve ${id} $5`, 'NONE');
    comment(PIKE.login, 'omakase approve bt-000000000000 $50', 'NONE');
    comment(PIKE.login, `${line} please`, 'NONE');
    comment(QUILL.login, line, 'MEMBER');
    comment(QUILL.login, line, 'CONTRIBUTOR');
    comment(QUILL.login, line, 'NONE');
    comment(PIKE.login, line, 'NONE', NOW - 10 * MINUTE);
    await run();
    expect(await row(id)).toMatchObject({ poster: PIKE.login, approval: 'pending', approval_proof: null });
    expect(await feedIds()).not.toContain(id);
  });
});
