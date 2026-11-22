import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handle } from '../../packages/box-platform/src/api.js';
import { listIssue } from '../../packages/box-platform/src/listing.js';
import { refresh } from '../../packages/box-platform/src/refresh.js';
import { metaStatement } from '../../packages/box-platform/src/store.js';
import { MINUTE, NOW, refreshUntilDone, rig, type Rig } from './support.js';

const ORIGIN = 'https://board.test';
const REPO = 'example-org/tools';
const AUTHOR = { id: 7200, login: 'example-pike' };
const DAY = 24 * 60 * MINUTE;
let r: Rig;
const issueUrl = (number = 14) => `https://github.com/${REPO}/issues/${number}`;
const send = (path: string, init?: RequestInit) => handle(new Request(`${ORIGIN}${path}`, init), r.env);
const post = (body: unknown, headers: Record<string, string> = {}) => send('/api/agents/import', {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body)
});
const row = (id: string) => r.env.DB.prepare('SELECT poster_id, approval, listed_by_id, listed_by FROM bounties WHERE id = ?').bind(id).first<any>();
async function imported(number = 14, headers: Record<string, string> = {}) {
  const response = await post({ issue: issueUrl(number), reward: 50 }, headers);
  expect(response.status).toBe(200);
  return await response.json() as any;
}
async function tick() { r.clock.at += 20 * MINUTE; await refreshUntilDone(r); }

beforeEach(async () => {
  r = await rig('standin-read');
  r.standin.repositories.set(REPO, { language: 'TypeScript', visibility: 'public', owner: { login: 'example-org', type: 'Organization' } });
  r.standin.accountIds.set(AUTHOR.login, AUTHOR.id);
  for (const number of [14, 15, 16, 17]) r.standin.issues.push({
    id: `plain-${number}`, repository: REPO, number, title: `Plain issue ${number}`, task: 'Keep the export order.',
    poster: AUTHOR.login, amount: 0, createdAt: new Date(NOW).toISOString(), plain: true, pulls: [], comments: []
  });
});
afterEach(async () => { await r.close(); });

describe('PF51 sessionless imports', () => {
  it('returns the pending approval instructions without Origin or authentication and hides it from discovery', async () => {
    const body = await imported();
    expect(body).toEqual({ listed: expect.stringMatching(/^bt-[a-f\d]{12}$/), pending: true,
      approve_with: `omakase approve ${body.listed} $50`, approve_on: issueUrl(), next: expect.stringContaining('owns or can write to the repository') });
    expect(body.next).toContain('A human still pays');
    expect(await row(body.listed)).toEqual({ poster_id: AUTHOR.id, approval: 'pending', listed_by_id: null, listed_by: null });
    const detail = await (await send(`/api/b/${body.listed}`)).json() as any;
    expect(detail.bounty).toMatchObject({ listed_by: null, open_to_answers: false });
    for (const path of ['/bounties.json', '/api/board']) {
      const answer = await (await send(path)).json() as any;
      expect(answer.bounties).toEqual([]);
    }
    const mcp = await (await send('/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'find_bounties', arguments: {} } }) })).json() as any;
    expect(mcp.result.structuredContent.bounties).toEqual([]);
  });

  it('ignores even a valid session cookie and a foreign Origin', async () => {
    const token = 'session-for-pf51';
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map(b => b.toString(16).padStart(2, '0')).join('');
    await r.env.DB.prepare('INSERT INTO sessions (token_hash, github_id, login, expires_at) VALUES (?, ?, ?, ?)').bind(hash, 7400, 'example-importer', NOW + DAY).run();
    const body = await imported(14, { cookie: `__Host-board_session=${token}`, origin: 'https://elsewhere.test' });
    expect(await row(body.listed)).toMatchObject({ listed_by_id: null, listed_by: null, poster_id: AUTHOR.id });
  });

  it.each(['OWNER', 'COLLABORATOR', 'MEMBER'])('accepts the issue author approving with GitHub association %s', async association => {
    const body = await imported();
    r.standin.issues.find(i => i.number === 14)!.comments!.push({ login: AUTHOR.login, body: body.approve_with, association, created_at: new Date(NOW + MINUTE).toISOString() });
    await tick();
    expect(await row(body.listed)).toMatchObject({ approval: 'comment', poster_id: AUTHOR.id, listed_by_id: null });
    const feed = await (await send('/bounties.json')).json() as any;
    expect(feed.bounties.map((b: any) => b.id)).toContain(body.listed);
  });

  it.each(['NONE', 'CONTRIBUTOR'])('does not let the issue author self-approve with association %s', async association => {
    const body = await imported();
    r.standin.issues.find(i => i.number === 14)!.comments!.push({ login: AUTHOR.login, body: body.approve_with, association, created_at: new Date(NOW + MINUTE).toISOString() });
    await tick();
    expect(await row(body.listed)).toMatchObject({ approval: 'pending' });
  });

  it.each([{}, null, [], { issue: issueUrl(), reward: 50, extra: true }, { issue: 'not-an-issue', reward: 50 },
    { issue: issueUrl(), reward: 0 }, { issue: issueUrl(), reward: 1.5 }, { issue: issueUrl(), reward: '50' }])('refuses malformed fields: %j', async body => {
    const response = await post(body);
    expect(response.status).toBe(400);
    expect((await response.json() as any).error).toMatch(/Nothing was listed\. Next:/);
  });

  it.each(['', '{', ' '.repeat(1025)])('refuses an empty, invalid or oversized JSON body', async body => {
    const response = await send('/api/agents/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    expect(response.status).toBe(400);
  });

  it('requires JSON and preserves the shared listing errors', async () => {
    expect((await send('/api/agents/import', { method: 'POST', body: '{}' })).status).toBe(400);
    r.standin.repositories.get(REPO)!.visibility = 'private';
    const response = await post({ issue: issueUrl(), reward: 50 });
    expect(response.status).toBe(409);
    expect((await response.json() as any).error).toContain('not a public repository');
  });

  it('allows ten attempts per minute globally and resets the counter next minute', async () => {
    for (let i = 0; i < 10; i++) expect((await post({ issue: 'bad', reward: 50 })).status).toBe(400);
    expect((await post({ issue: issueUrl(), reward: 50 })).status).toBe(429);
    r.clock.at += MINUTE;
    expect((await post({ issue: issueUrl(), reward: 50 })).status).toBe(200);
  });

  it('preserves half the hourly GitHub budget without fetching or listing', async () => {
    await r.env.DB.batch([metaStatement(r.env.DB, 'budget_hour', String(Math.floor(NOW / 3600000))), metaStatement(r.env.DB, 'budget_used', '2500')]);
    expect((await post({ issue: issueUrl(), reward: 50 })).status).toBe(429);
    expect(await r.env.DB.prepare('SELECT COUNT(*) AS n FROM bounties').first()).toEqual({ n: 0 });
  });

  it('expires only sessionless pending imports at 14 days, even when GitHub is paused', async () => {
    const expired = await imported();
    const approved = await imported(15);
    await r.env.DB.prepare("UPDATE bounties SET approval = 'comment' WHERE id = ?").bind(approved.listed).run();
    const session = await listIssue(r.env, { github_id: 7400, login: 'example-importer' }, issueUrl(16), 50, NOW, undefined, true);
    expect('id' in session).toBe(true);
    r.clock.at = NOW + MINUTE;
    const recent = await imported(17);
    r.clock.at = NOW + 14 * DAY - 1;
    await r.env.DB.batch([metaStatement(r.env.DB, 'paused_until', String(r.clock.at + DAY))]);
    await refresh(r.env);
    expect(await row(expired.listed)).not.toBeNull();
    r.clock.at += 1;
    await refresh(r.env);
    expect(await row(expired.listed)).toBeNull();
    expect(await row(approved.listed)).not.toBeNull();
    expect(await row(recent.listed)).not.toBeNull();
    expect(await row('id' in session ? session.id : '')).toMatchObject({ approval: 'pending', listed_by_id: 7400 });
    expect(await r.env.DB.prepare("SELECT reason, issue FROM log WHERE reason = 'agent-import-expired'").all()).toMatchObject({ results: [{ reason: 'agent-import-expired', issue: issueUrl() }] });
  });

  it.each(['listed', 'posted'])('exposes the PR target and take/submit instructions in both %s detail forms and MCP, reflecting draft changes', async source => {
    let id: string;
    const issue = r.standin.issues.find(i => i.number === 14)!;
    r.standin.repositories.get(REPO)!.default_branch = 'develop';
    if (source === 'listed') {
      const body = await imported();
      id = body.listed;
      issue.comments!.push({ login: AUTHOR.login, body: body.approve_with, association: 'OWNER', created_at: new Date(NOW + MINUTE).toISOString() });
    } else {
      id = 'bt-000000005151';
      issue.id = id;
      issue.plain = false;
      issue.amount = 50;
    }
    issue.pulls = [{ number: 41, author: 'example-solver', state: 'open', draft: true, created_at: new Date(NOW + MINUTE).toISOString() }];
    await tick();
    const detail = await (await send(`/bounties/${id}.json`)).json() as any;
    expect(detail.bounty.attempt).toEqual({ repository: REPO,
      pull_request_base: source === 'listed' ? 'develop' : `box-bounty/${id}`,
      body_must_include: source === 'listed' ? 'Fixes #14' : null,
      take: expect.stringContaining('Open a draft pull request'), reserves: false,
      submit: expect.stringContaining('Mark the pull request ready for review') });
    expect(detail.bounty.attempt.submit).toContain('reserves nothing');
    expect(detail.bounty.attempts_in_progress.count).toBe(1);
    const site = await (await send(`/api/b/${id}`)).json() as any;
    expect(site.bounty.attempt).toEqual(detail.bounty.attempt);
    const mcp = await (await send('/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_bounty', arguments: { id } } }) })).json() as any;
    expect(mcp.result.structuredContent.bounty.attempt).toEqual(detail.bounty.attempt);
    issue.pulls[0]!.draft = false;
    await tick();
    const submitted = await (await send(`/bounties/${id}.json`)).json() as any;
    expect(submitted.bounty.attempts_in_progress.count).toBe(0);
    expect(submitted.bounty.solution_list).toMatchObject([{ number: 41, state: 'open' }]);
  });
});
