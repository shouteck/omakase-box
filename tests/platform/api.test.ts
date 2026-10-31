import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handle, historyOf, stateOf } from '../../packages/box-platform/src/api.js';
import { seed120 } from '../../packages/box-platform/standin/standin.js';
import { askJson, NOW, refreshUntilDone, rig, type Rig } from './support.js';

describe('filters and paging on a seeded 120', () => {
  let r: Rig;
  beforeAll(async () => {
    r = await rig('not-a-real-token');
    seed120(r.standin, NOW);
    await refreshUntilDone(r);
    r.clock.at = NOW; // ages below are computed from the seed
  }, 120000);
  afterAll(() => r.close());
  const board = async (query: string) => (await askJson(r, handle, `/api/board${query}`)).body;
  // Counts computed from the seed's own rule, not from the code under test.
  const all = Array.from({ length: 120 }, (_, n) => ({ n, amount: n % 3 === 0 ? 0 : (n % 4 + 1) * 25, language: ['TypeScript', 'Python', 'Go', 'Rust'][n % 8 % 4], repo: `example-org/repo-${n % 8}` }));
  const count = (test: (b: (typeof all)[number]) => boolean) => all.filter(test).length;

  it('walks every bounty exactly once across its pages', async () => {
    const seen: string[] = [];
    const first = await board('');
    expect(first.count).toBe(120);
    expect(first.pages).toBe(6);
    for (let page = 1; page <= first.pages; page++) seen.push(...(await board(`?page=${page}`)).bounties.map((b: { id: string }) => b.id));
    expect(seen).toHaveLength(120);
    expect(new Set(seen).size).toBe(120);
  });

  it('a page past the end is the last page, not an empty one', async () => {
    const answer = await board('?page=99');
    expect(answer.page).toBe(6);
    expect(answer.bounties).toHaveLength(20);
  });

  it.each([
    ['language', '?language=python', (b: (typeof all)[number]) => b.language === 'Python'],
    ['repository', '?repository=example-org/repo-3', (b: (typeof all)[number]) => b.repo === 'example-org/repo-3'],
    ['stated reward', '?min_reward=50', (b: (typeof all)[number]) => b.amount >= 50],
    ['age', '?max_age_days=30', (b: (typeof all)[number]) => b.n <= 30],
    ['solutions: some', '?solutions=some', (b: (typeof all)[number]) => b.n % 10 === 0],
    ['solutions: none', '?solutions=none', (b: (typeof all)[number]) => b.n % 10 !== 0],
    ['approved for this bounty', '?approved_by=owner-this-bounty', (b: (typeof all)[number]) => b.n % 12 === 0],
    ['approved by standing rule', '?approved_by=owner-standing-rule', (b: (typeof all)[number]) => b.n % 6 === 0 && b.n % 12 !== 0],
    ['query in a title', '?query=Fix', (b: (typeof all)[number]) => b.n % 2 === 0],
    ['query in a repository', '?query=repo-1', (b: (typeof all)[number]) => b.n % 8 === 1],
    ['two together', '?language=Go&min_reward=50', (b: (typeof all)[number]) => b.language === 'Go' && b.amount >= 50]
  ])('filters by %s', async (_name, query, test) => {
    expect((await board(query)).count).toBe(count(test));
  });

  it('sorts newest first by default and by reward on request', async () => {
    const newest = (await board('')).bounties;
    expect(newest[0].age_days).toBe(0);
    expect(newest[19].age_days).toBe(19);
    const reward = (await board('?sort=reward')).bounties;
    expect(reward[0].amount).toBe(100);
    expect(reward.every((b: { amount: number }, i: number) => i === 0 || reward[i - 1].amount >= b.amount)).toBe(true);
  });

  it('a percent or underscore in a query is a character, not a wildcard', async () => {
    expect((await board('?query=%25')).count).toBe(0);
    expect((await board('?query=_')).count).toBe(0);
  });

  it('a SQL shape in a filter is only a value', async () => {
    expect((await board(`?language=${encodeURIComponent(`' OR 1=1 --`)}`)).count).toBe(0);
  });

  it.each([
    ['?solutions=lots', 'solutions'], ['?sort=best', 'sort'], ['?min_reward=abc', 'min_reward'], [`?query=${'x'.repeat(101)}`, 'query']
  ])('refuses %s by name, with a next step', async (query, field) => {
    const { status, body } = await askJson(r, handle, `/api/board${query}`);
    expect(status).toBe(400);
    expect(body.error).toContain(field);
    expect(body.error).toContain('Next:');
  });

  it('reports every language and repository for the filters, not only this page', async () => {
    const answer = await board('');
    expect(answer.languages).toEqual(['Go', 'Python', 'Rust', 'TypeScript']);
    expect(answer.repositories).toHaveLength(8);
  });

  it('every non-GET is refused: the board is read-only', async () => {
    expect((await handle(new Request('http://board.test/api/board', { method: 'POST' }), r.env)).status).toBe(405);
  });

  it('a mistyped address gets the page wording with a next step', async () => {
    for (const path of ['/api/b/nope', '/api/b/bt-ffffffffffff']) {
      const { status, body } = await askJson(r, handle, path);
      expect(status).toBe(404);
      expect(body.error).toContain('private repository (those are never listed)');
      expect(body.error).toContain('Next:');
    }
  });
});

describe('a bounty state from its facts', () => {
  it.each([
    ['open', [], 'open'],
    ['open', [{ state: 'open' }], 'solutions-waiting'],
    ['open', [{ state: 'closed' }], 'open'],
    ['closed', [{ state: 'closed' }], 'closed-none'],
    ['closed', [{ state: 'merged' }, { state: 'open' }], 'merged'],
    ['closed', [{ state: 'merged' }, { state: 'merged' }], 'merged-more-than-one']
  ])('issue %s, pulls %j: %s', (issue, pulls, expected) => {
    expect(stateOf(issue, pulls)).toBe(expected);
  });

  it('history falls back to GitHub where the memory is silent, and stays bounded', () => {
    const pulls = Array.from({ length: 80 }, (_, i) => ({ number: i + 1, author: 'a', state: 'open', opened_at: new Date(NOW + i * 1000).toISOString(), merged_at: null }));
    const lines = historyOf({ created_at: new Date(NOW - 1000).toISOString(), issue_state: 'open', closed_at: null }, pulls, []);
    expect(lines).toHaveLength(50);
    expect(lines.at(-1)?.event).toBe('solution: pull request #80');
    expect(lines.every(line => line.source === 'github')).toBe(true);
  });
});
