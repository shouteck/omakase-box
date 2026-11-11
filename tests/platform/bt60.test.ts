// BT60: the board lists no bounty whose reward is under the minimum. The refresh does not keep one and removes a stored
// one it reads below it, so every surface (the board, a bounty's page, the feed, MCP, RSS, the numbers) omits it with no
// change of its own. tests/platform/support.ts gives its board ALLOW_ZERO_FOR_TESTING so the other tests that seed at $0
// run as before; these tests remove it (rows 9 to 14) or keep it (row 15).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MINIMUM_REWARD_USD } from '../../packages/box-bounty/format.js';
import { handle } from '../../packages/box-platform/src/api.js';
import type { StandinIssue } from '../../packages/box-platform/standin/standin.js';
import { MINUTE, NOW, refreshUntilDone, rig, type Rig } from './support.js';

const ZERO = 'bt-000000000000';
const FIVE = 'bt-555555555555';
const issue = (id: string, number: number, amount: number, over: Partial<StandinIssue> = {}): StandinIssue => ({
  id, repository: 'example-tidepool/ledger', number, title: `Bounty ${number}`, task: 'Fix the 31st.', poster: 'example-mara', amount,
  createdAt: new Date(NOW - 4 * 86400000).toISOString(), ...over
});
const text = async (r: Rig, path: string, init?: RequestInit): Promise<{ status: number; text: string }> => {
  const answer = await handle(new Request(`http://board.test${path}`, init), r.env);
  return { status: answer.status, text: await answer.text() };
};
const mcp = (r: Rig, name: string, args: object) => text(r, '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
const ids = async (r: Rig): Promise<string[]> => (await r.env.DB.prepare('SELECT id FROM bounties ORDER BY id').all<{ id: string }>()).results.map(row => row.id);
const withAllowance = (r: Rig, on: boolean): void => {
  const env = r.env as unknown as Record<string, unknown>;
  if (on) env['ALLOW_ZERO_FOR_TESTING'] = '1'; else delete env['ALLOW_ZERO_FOR_TESTING'];
};

describe('BT60: the board lists no bounty below the minimum reward', () => {
  let r: Rig;
  beforeEach(async () => {
    r = await rig();
    r.standin.repositories.set('example-tidepool/ledger', { language: 'Go', visibility: 'public' });
    r.standin.issues.push(issue(ZERO, 70, 0), issue(FIVE, 71, 5));
  });
  afterEach(() => r.close());

  it('15. with the testing allowance both are listed (so rows 9 and 10 do start from two issues the refresh read)', async () => {
    withAllowance(r, true);
    await refreshUntilDone(r);
    expect(await ids(r)).toEqual([ZERO, FIVE]);
  });

  it('9. without it only the bounty with a reward is kept', async () => {
    withAllowance(r, false);
    await refreshUntilDone(r);
    expect(r.standin.requests.some(path => path.includes('/search/issues')), 'the refresh did not read the issues').toBe(true);
    expect(await ids(r)).toEqual([FIVE]);
  });

  it('10. every surface omits the $0 one: the board, its page, the feed, MCP, RSS and the numbers', async () => {
    withAllowance(r, false);
    await refreshUntilDone(r);
    for (const path of ['/api/board', '/bounties.json', '/bounties.json?limit=25', '/rss.xml', '/numbers.json']) {
      const answer = await text(r, path);
      expect(answer.status, path).toBe(200);
      expect(answer.text, path).not.toContain(ZERO);
      expect(answer.text, `${path} names the $0 bounty by its title`).not.toContain('Bounty 70');
      // the lists carry the one with a reward (the numbers carry counts only)
      if (path !== '/numbers.json') expect(answer.text, `${path} lost the bounty that has a reward`).toContain('Bounty 71');
    }
    expect((await text(r, `/api/b/${ZERO}`)).status).toBe(404);
    expect((await text(r, `/bounties/${ZERO}.json`)).status).toBe(404);
    expect((await text(r, `/api/b/${FIVE}`)).status).toBe(200);
    const found = await mcp(r, 'find_bounties', { limit: 25 });
    expect(found.text).not.toContain(ZERO);
    expect(found.text).toContain(FIVE);
    expect((JSON.parse((await text(r, '/numbers.json')).text) as { bounties: { listed: number } }).bounties.listed).toBe(1);
  });

  it('11. a row stored at 5 and read again at 0 is removed', async () => {
    withAllowance(r, false);
    await refreshUntilDone(r);
    expect(await ids(r)).toEqual([FIVE]);
    r.standin.issues.find(entry => entry.id === FIVE)!.amount = 0;
    r.clock.at += 15 * MINUTE;
    await refreshUntilDone(r);
    expect(await ids(r)).toEqual([]);
    expect((await text(r, `/api/b/${FIVE}`)).status).toBe(404);
  });

  it('12. an issue whose block says 5 and whose text says $0 is listed at 5: the block is the fact', async () => {
    r.standin.issues.length = 0;
    r.standin.issues.push(issue(FIVE, 72, 5, { task: 'This pays $0, the text says.' }));
    withAllowance(r, false);
    await refreshUntilDone(r);
    expect(await ids(r)).toEqual([FIVE]);
  });

  it('13. the feed\'s schema says a reward is at least the minimum', async () => {
    const schema = JSON.parse((await text(r, '/bounties.schema.json')).text) as unknown;
    const found: unknown[] = [];
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) { value.forEach(walk); return; }
      if (value === null || typeof value !== 'object') return;
      const entry = value as Record<string, unknown>;
      const amount = (entry['properties'] as Record<string, Record<string, unknown>> | undefined)?.['amount'];
      if (amount !== undefined && (entry['properties'] as Record<string, unknown>)['currency'] !== undefined) found.push(amount['minimum']);
      Object.values(entry).forEach(walk);
    };
    walk(schema);
    expect(found.length, 'no reward amount in the schema').toBeGreaterThan(0);
    expect(found.every(minimum => minimum === MINIMUM_REWARD_USD)).toBe(true);
  });

  it('14. the deployed config does not carry the testing allowance', () => {
    const config = readFileSync(fileURLToPath(new URL('../../packages/box-platform/wrangler.toml', import.meta.url)), 'utf8');
    expect(config).not.toContain('ALLOW_ZERO_FOR_TESTING');
  });
});
