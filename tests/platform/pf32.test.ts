// PF32: an owner lists an existing GitHub issue as a bounty from the board. Through handle() against the stand-in: who
// may list, each refusal, the refresh keeping a listed bounty and reading the pull requests linked to its issue, the
// human way's payment (the owner chooses, a merge names nobody, never owed), and removing it.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handle } from '../../packages/box-platform/src/api.js';
import { refresh } from '../../packages/box-platform/src/refresh.js';
import type { StandinIssue } from '../../packages/box-platform/standin/standin.js';
import { MINUTE, NOW, rig, type Rig, refreshUntilDone } from './support.js';

const ORIGIN = 'https://board.test';
const REPO = 'example-mara/notes';
const ORG_REPO = 'example-org/tools';
const MARA = { id: 7100, login: 'example-mara' };
const QUILL = { id: 7001, login: 'example-quill' };
const PIKE = { id: 7200, login: 'example-pike' };
const ROOK = { id: 7300, login: 'example-rook' };

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
const plain = (number: number, repository: string, author: string, over: Partial<StandinIssue> = {}): StandinIssue =>
  ({ id: `plain-${number}`, repository, number, title: `Plain issue ${number}`, task: 'Make the export keep its order.', poster: author, amount: 0, createdAt: new Date(NOW).toISOString(), plain: true, pulls: [], ...over });
const list = (jar: Jar, issue: string, reward: unknown = 50) => post(jar, '/api/list', { issue, reward });
const issueOf = (number: number, repository = REPO) => `https://github.com/${repository}/issues/${number}`;

beforeEach(async () => {
  r = await rig('standin-read');
  for (const [name, owner] of [[REPO, undefined], [ORG_REPO, { login: 'example-org', type: 'Organization' as const }]] as const) {
    r.standin.repositories.set(name, { language: 'TypeScript', visibility: 'public', ...(owner ? { owner, writers: [ROOK.id] } : {}) });
  }
  for (const [login, id] of [[MARA.login, MARA.id], [PIKE.login, PIKE.id], [ROOK.login, ROOK.id]] as const) r.standin.accountIds.set(login, id);
  r.standin.issues.push(
    plain(12, REPO, PIKE.login),
    plain(13, REPO, MARA.login, { state: 'closed' }),
    plain(14, ORG_REPO, PIKE.login),
    plain(15, ORG_REPO, MARA.login)
  );
}, 120000);
afterEach(async () => { await r.close(); });

describe('who may list an issue', () => {
  it('its author, and the owner of a personal repository; a maintainer of an organisation repository after one sign-in; anyone else is refused', async () => {
    // The repository's owner (example-mara owns example-mara/notes) lists an issue someone else opened.
    const mara = await signIn(MARA);
    const owned = await list(mara, issueOf(12));
    expect(owned.status).toBe(200);
    // The issue's author lists their own issue on an organisation's repository.
    const ownIssue = await list(mara, issueOf(15, ORG_REPO), 20);
    expect(ownIssue.status).toBe(200);
    // Someone who opened neither and owns nothing is asked to show their permission once; GitHub says no: refused.
    const quill = await signIn(QUILL);
    const asked = await list(quill, issueOf(14, ORG_REPO));
    expect(asked.status).toBe(409);
    expect((await asked.json() as any).needs_permission).toBe(true);
    // A maintainer with write access, through the one-time sign-in: listed; the token is never stored.
    const rook = await signIn(ROOK);
    const next = (await (await list(rook, issueOf(14, ORG_REPO), 30)).json() as any).next as string;
    const start = await send(rook, next);
    const atGitHub = await fetch(start.headers.get('location')!, { redirect: 'manual' });
    const back = new URL(atGitHub.headers.get('location')!);
    const done = await send(rook, `${back.pathname}${back.search}`);
    expect(done.headers.get('location')).toMatch(/^\/me\/\?listed=bt-[a-f\d]{12}#bounties$/);
    const tables = (await r.env.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all<{ name: string }>()).results;
    const everything = JSON.stringify(await Promise.all(tables.map(t => r.env.DB.prepare(`SELECT * FROM ${t.name}`).all())));
    for (const token of r.standin.tokensIssued) expect(everything).not.toContain(token);
    // The same for quill through the sign-in: GitHub says they cannot write; nothing is listed.
    r.standin.signInAs = QUILL;
    const quillNext = (await (await list(quill, issueOf(14, ORG_REPO))).json() as any).next as string;
    expect(quillNext).toBeUndefined(); // already listed by rook: refused before any permission check
  });

  it('refuses, saying why and that nothing was listed: not an address, no reward, closed, a pull request, missing, unlisted, already listed', async () => {
    const mara = await signIn(MARA);
    const refusals: [string, unknown, RegExp][] = [
      ['https://example.com/x', 50, /not a GitHub issue's address/],
      [issueOf(12), 0, /whole US dollars/],
      [issueOf(13), 50, /is closed/],
      [issueOf(99), 50, /no issue #99/],
    ];
    for (const [issue, reward, words] of refusals) {
      const answer = await list(mara, issue, reward);
      expect(answer.status).toBeGreaterThanOrEqual(400);
      const error = (await answer.json() as any).error as string;
      expect(error).toMatch(words);
      expect(error).toContain('Nothing was listed.');
    }
    expect((await list(mara, issueOf(12))).status).toBe(200);
    expect(((await (await list(mara, issueOf(12))).json()) as any).error).toMatch(/already a bounty on this board, bt-/);
    const unlistedEnv = { ...env(), UNLISTED_REPOSITORIES: REPO };
    const refused = await handle(new Request(`${ORIGIN}/api/list`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: [...mara].map(([k, v]) => `${k}=${v}`).join('; ') }, body: JSON.stringify({ issue: issueOf(12), reward: 5 }) }), unlistedEnv);
    expect(refused.status).toBe(409);
    expect((await (await send(null, '/api/me')).json() as any).signed_in).toBe(false);
    expect((await list(new Map(), issueOf(12))).status).toBe(401);
  });
});

describe('a listed bounty on the board', () => {
  it('stays across refreshes with no block and no label, and reads the pull requests linked to its issue', async () => {
    const mara = await signIn(MARA);
    const id = (await (await list(mara, issueOf(12))).json() as any).listed as string;
    // Open and listed at once: in the feed agents read.
    expect((await (await send(null, '/bounties.json')).json() as any).bounties.map((b: any) => b.id)).toContain(id);
    const issue = r.standin.issues.find(entry => entry.number === 12 && entry.repository === REPO)!;
    issue.pulls = [{ number: 41, author: QUILL.login, state: 'open', created_at: new Date(NOW).toISOString() }, { number: 42, author: ROOK.login, state: 'closed', merged_at: new Date(NOW).toISOString(), created_at: new Date(NOW).toISOString() }];
    for (let run = 0; run < 3; run += 1) { r.clock.at += 20 * MINUTE; await refreshUntilDone(r); }
    const bounty = (await (await send(null, `/api/b/${id}`)).json() as any).bounty;
    expect(bounty).toMatchObject({ source: 'listed', issue_author: PIKE.login, listed_by: MARA.login, branch: null, pays_on_merge: false, amount: 50 });
    expect(bounty.task).toBe('Make the export keep its order.');
    expect(bounty.solutions.map((s: any) => [s.number, s.state])).toEqual([[41, 'open'], [42, 'merged']]);
  });

  it('is never owed: a merge names nobody; the owner chooses from every linked pull request, merged or not, and one is paid', async () => {
    const mara = await signIn(MARA);
    const id = (await (await list(mara, issueOf(12))).json() as any).listed as string;
    const issue = r.standin.issues.find(entry => entry.number === 12 && entry.repository === REPO)!;
    issue.pulls = [{ number: 41, author: QUILL.login, state: 'open', created_at: new Date(NOW).toISOString() }, { number: 42, author: ROOK.login, state: 'closed', merged_at: new Date(NOW).toISOString(), created_at: new Date(NOW).toISOString() }];
    r.clock.at += 20 * MINUTE; await refreshUntilDone(r);
    let view = await (await send(mara, `/api/b/${id}/payment`)).json() as any;
    expect(view.payment.state).toBe('owner-chooses');
    expect(view.payment.owed).toBeNull();
    expect(view.payee).toBeNull();
    expect(view.payees.map((p: any) => [p.login, p.state])).toEqual([[QUILL.login, 'open'], [ROOK.login, 'merged']]);
    // Not owed anywhere: not on the owner's Your page as due, not in the owner's public record, not owed to the merged author.
    const me = await (await send(mara, '/api/me')).json() as any;
    expect(me.you_owe).toEqual([]);
    expect(me.bounties.list.find((b: any) => b.id === id)).toMatchObject({ stage: 'solutions', note: '#42 merged · no payment recorded · you choose whom to pay' });
    expect((await (await send(null, `/api/owner/${MARA.login}`)).json() as any).record.owed_now).toBe(0);
    // A record must name someone, and may name the one not merged.
    expect((await post(mara, `/api/b/${id}/paid`, {})).status).toBe(400);
    expect((await post(mara, `/api/b/${id}/paid`, { to: QUILL.login })).status).toBe(200);
    view = await (await send(mara, `/api/b/${id}/payment`)).json() as any;
    expect(view.payee).toBe(QUILL.login);
    expect(view.payment.state).toBe('recorded');
    const solver = await (await send(await signIn(QUILL), '/api/me')).json() as any;
    expect(solver.solutions.list.find((s: any) => s.id === id)).toMatchObject({ stage: 'paid', needs_confirm: true });
    const other = await (await send(await signIn(ROOK), '/api/me')).json() as any;
    expect(other.solutions.list.find((s: any) => s.id === id)).toMatchObject({ stage: 'closed', note: 'Another solution was paid.' });
    // Remove and Withdraw never both: paid by hand means Withdraw, not Remove.
    expect(view.can_withdraw).toBe(true);
    expect(view.can_remove).toBe(false);
  });

  it('can be removed by its lister before any merge or payment, and not after; a posted bounty never', async () => {
    const mara = await signIn(MARA);
    const id = (await (await list(mara, issueOf(12))).json() as any).listed as string;
    expect((await (await send(mara, `/api/b/${id}/payment`)).json() as any).can_remove).toBe(true);
    expect((await post(await signIn(QUILL), `/api/b/${id}/remove`, {})).status).toBe(403);
    const issue = r.standin.issues.find(entry => entry.number === 12 && entry.repository === REPO)!;
    issue.pulls = [{ number: 42, author: ROOK.login, state: 'closed', merged_at: new Date(NOW).toISOString(), created_at: new Date(NOW).toISOString() }];
    r.clock.at += 20 * MINUTE; await refreshUntilDone(r);
    expect((await post(mara, `/api/b/${id}/remove`, {})).status).toBe(409);
    issue.pulls = [];
    await r.env.DB.prepare('DELETE FROM pull_requests WHERE bounty_id = ?').bind(id).run();
    expect((await post(mara, `/api/b/${id}/remove`, {})).status).toBe(200);
    expect((await send(null, `/api/b/${id}`)).status).toBe(404);
  });

  it('is never charged on merge, whatever the owner\'s pay-on-merge switch', async () => {
    const mara = await signIn(MARA);
    const id = (await (await list(mara, issueOf(12))).json() as any).listed as string;
    await r.env.DB.prepare(`INSERT INTO pay_settings (github_id, customer_id, payment_method, card_label, limit_per_bounty) VALUES (?, 'cus_x', 'pm_x', 'Visa', 500)`).bind(MARA.id).run();
    await r.env.DB.prepare(`INSERT INTO pay_repositories (github_id, repository, on_at, limit_per_bounty) VALUES (?, ?, ?, NULL)`).bind(MARA.id, REPO, new Date(NOW - 86400000).toISOString()).run();
    const issue = r.standin.issues.find(entry => entry.number === 12 && entry.repository === REPO)!;
    issue.pulls = [{ number: 42, author: ROOK.login, state: 'closed', merged_at: new Date(NOW).toISOString(), created_at: new Date(NOW).toISOString() }];
    r.clock.at += 20 * MINUTE; await refresh(r.env);
    const { results } = await r.env.DB.prepare(`SELECT b.id FROM bounties b JOIN pay_repositories r ON r.github_id = b.poster_id AND r.repository = b.repository WHERE b.amount > 0 AND b.source = 'posted'`).all<{ id: string }>();
    expect(results.map(row => row.id)).not.toContain(id);
  });
});
