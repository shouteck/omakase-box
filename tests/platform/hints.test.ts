// PF5: a hint moves one read earlier and carries no fact. Everything shown comes from GitHub.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handle } from '../../packages/box-platform/src/api.js';
import { LIMITS } from '../../packages/box-platform/src/github.js';
import { idOf, type StandinIssue } from '../../packages/box-platform/standin/standin.js';
import { MINUTE, NOW, rig, type Rig } from './support.js';

const ID = idOf(0xa001);
const REPOSITORY = 'example-org/hinted';
const issue = (over: Partial<StandinIssue> = {}): StandinIssue => ({ id: ID, repository: REPOSITORY, number: 7, title: 'GitHub title', task: 'GitHub task', poster: 'example-mara', amount: 50, createdAt: new Date(NOW).toISOString(), ...over });
const hint = (over: Record<string, unknown> = {}) => ({ repository: REPOSITORY, issue: 7, bounty: ID, event: 'posted', ...over });
const send = (r: Rig, body: unknown) => handle(new Request('http://board.test/api/hint', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }), r.env);
const row = (r: Rig, id = ID) => r.env.DB.prepare('SELECT title, repository, details_read_at FROM bounties WHERE id = ?').bind(id).first<{ title: string; repository: string; details_read_at: number }>();
const count = async (r: Rig, table: string) => (await r.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;

describe('POST /api/hint', () => {
  let r: Rig;
  beforeEach(async () => {
    r = await rig();
    r.standin.repositories.set(REPOSITORY, { language: 'Go', visibility: 'public' });
    r.standin.issues.push(issue());
  });
  afterEach(() => r.close());

  it('puts a bounty on the board at once, from what GitHub says', async () => {
    expect(await row(r)).toBeNull();
    const answer = await send(r, hint());
    expect(answer.status).toBe(202);
    expect(await answer.json()).toEqual({ looked: 'read' });
    expect(await row(r)).toMatchObject({ title: 'GitHub title', repository: REPOSITORY, details_read_at: NOW });
    const shown = await handle(new Request(`http://board.test/bounties/${ID}.json`), r.env);
    expect(shown.status).toBe(200);
  });

  it.each([
    ['a path', hint({ path: 'src/secret.ts' })],
    ['a missing field', { repository: REPOSITORY, issue: 7, bounty: ID }],
    ['a title', hint({ title: 'mine' })],
    ['an unknown event', hint({ event: 'deleted' })],
    ['a bad id', hint({ bounty: 'bt-XYZ' })],
    ['a bad issue', hint({ issue: 1.5 })],
    ['a bad repository', hint({ repository: '../../etc' })],
    ['an array', [hint()]],
    ['not JSON', '{'],
    ['too long', JSON.stringify(hint({ repository: `a/${'b'.repeat(600)}` }))]
  ])('refuses %s, reads nothing and stores nothing', async (_name, body) => {
    const answer = await send(r, body);
    expect(answer.status).toBe(400);
    expect((await answer.json() as { error: string }).error).toContain('Next:');
    expect(r.standin.requests).toEqual([]);
    expect(await count(r, 'bounties')).toBe(0);
    expect(await count(r, 'hints')).toBe(0);
  });

  it('takes no fact from the hint: the wrong issue number or id changes nothing', async () => {
    expect(await (await send(r, hint({ issue: 8 }))).json()).toEqual({ looked: 'not-this-bounty' });
    r.clock.at += MINUTE;
    const other = idOf(0xa002);
    expect(await (await send(r, hint({ bounty: other }))).json()).toEqual({ looked: 'not-this-bounty' });
    expect(await count(r, 'bounties')).toBe(0);
  });

  // @guards BD1
  it('never lists a private repository, and purges one that went private', async () => {
    await send(r, hint());
    expect(await count(r, 'bounties')).toBe(1);
    r.standin.repositories.set(REPOSITORY, { language: 'Go', visibility: 'private' });
    r.clock.at += MINUTE;
    expect(await (await send(r, hint())).json()).toEqual({ looked: 'not-public' });
    expect(await count(r, 'bounties')).toBe(0);
  });

  it('a copy of a bounty in another repository cannot read its pull requests into the bounty', async () => {
    await send(r, hint());
    const copy = 'example-thief/copy';
    r.standin.repositories.set(copy, { language: null, visibility: 'public' });
    r.standin.issues.unshift(issue({ repository: copy, number: 1, pulls: [{ number: 9, author: 'example-thief', state: 'closed', merged_at: new Date(NOW).toISOString(), created_at: new Date(NOW).toISOString() }] }));
    r.clock.at += MINUTE;
    expect(await (await send(r, hint({ repository: copy, issue: 1 }))).json()).toEqual({ looked: 'not-this-bounty' });
    expect(await count(r, 'pull_requests')).toBe(0);
    expect(await row(r)).toMatchObject({ repository: REPOSITORY });
  });

  it('one look per bounty per minute; the second says so and reads nothing', async () => {
    await send(r, hint());
    const used = r.standin.requests.length;
    const again = await send(r, hint({ event: 'paid' }));
    expect(again.status).toBe(429);
    expect((await again.json() as { error: string }).error).toContain('Next:');
    expect(r.standin.requests.length).toBe(used);
    r.clock.at += MINUTE;
    expect((await send(r, hint({ event: 'paid' }))).status).toBe(202);
  });

  it('a stated number of hints per minute over all bounties', async () => {
    await r.close();
    r = await rig('not-a-real-token'); // With no token the budget reserve answers first.
    r.standin.repositories.set(REPOSITORY, { language: 'Go', visibility: 'public' });
    for (let n = 0; n < 30; n++) expect((await send(r, hint({ bounty: idOf(0xb000 + n) }))).status).toBe(202);
    const used = r.standin.requests.length;
    expect((await send(r, hint({ bounty: idOf(0xc000) }))).status).toBe(429);
    expect(r.standin.requests.length).toBe(used);
  });

  it('leaves the second half of the hour\'s GitHub budget to the scheduled refresh', async () => {
    const { DB } = r.env;
    await DB.prepare('INSERT INTO meta (key, value) VALUES (?, ?), (?, ?)').bind('budget_hour', String(Math.floor(NOW / 3600000)), 'budget_used', String(LIMITS.anonymous.hour / 2)).run();
    expect((await send(r, hint())).status).toBe(429);
    expect(r.standin.requests).toEqual([]);
    await DB.prepare('UPDATE meta SET value = ? WHERE key = ?').bind(String(LIMITS.anonymous.hour / 2 - 1), 'budget_used').run();
    expect((await send(r, hint())).status).toBe(202);
  });

  it('answers at once where the host can finish the work afterwards', async () => {
    const later: Promise<unknown>[] = [];
    const env = { ...r.env, defer: (work: Promise<unknown>) => { later.push(work); } };
    const answer = await handle(new Request('http://board.test/api/hint', { method: 'POST', body: JSON.stringify(hint()) }), env);
    expect(await answer.json()).toEqual({ looked: 'started' });
    await Promise.all(later);
    expect(await count(r, 'bounties')).toBe(1);
  });

  it('a solver profile says how many methods are held back, never what they are', async () => {
    const SECRET = 'hidden@example.com';
    await r.env.DB.prepare('INSERT INTO methods (github_id, login, position, kind, value, chain, visibility) VALUES (1, ?, 0, ?, ?, NULL, ?), (1, ?, 1, ?, ?, NULL, ?)')
      .bind('example-quill', 'paypal', 'https://paypal.me/example-quill', 'everyone', 'example-quill', 'wise-email', SECRET, 'owner-only').run();
    const text = await (await handle(new Request('http://board.test/api/solver/example-quill'), r.env)).text();
    const profile = JSON.parse(text);
    expect(profile.methods.map((method: { value: string }) => method.value)).toEqual(['https://paypal.me/example-quill']);
    expect(profile.methods_more).toBe(1);
    expect(text).not.toContain(SECRET);
  });
});
