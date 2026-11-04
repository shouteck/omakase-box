// PF9b: the board never lists a repository its own setting names (the kitchen's sandbox), on any surface, and reads
// nothing of it from GitHub. Each case first shows the other repository's bounty really is listed.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handle } from '../../packages/box-platform/src/api.js';
import { lookNow, refresh } from '../../packages/box-platform/src/refresh.js';
import { idOf, type StandinIssue } from '../../packages/box-platform/standin/standin.js';
import { MINUTE, NOW, refreshUntilDone, rig, type Rig } from './support.js';

const ORIGIN = 'http://board.test';
const HIDDEN = 'example-org/sandbox';
const SHOWN = 'example-org/ledger';
const ask = async (env: Rig['env'], path: string) => handle(new Request(`${ORIGIN}${path}`), env);
const json = async (env: Rig['env'], path: string): Promise<any> => (await ask(env, path)).json();
const issue = (n: number, repository: string, over: Partial<StandinIssue> = {}): StandinIssue => ({ id: idOf(0xa900 + n), repository, number: 900 + n, title: `PF9b ${n}`, task: 't', poster: 'example-mara', amount: 5, createdAt: new Date(NOW - 86400000).toISOString(), pulls: [{ number: 950 + n, author: 'example-fern', state: 'open', created_at: new Date(NOW).toISOString() }], events: [], ...over });

let r: Rig;
let unlistedEnv: Rig['env'];
beforeEach(async () => {
  r = await rig('not-a-real-token');
  for (const name of [HIDDEN, SHOWN]) r.standin.repositories.set(name, { language: 'TypeScript', visibility: 'public' });
  r.standin.issues.push(issue(1, HIDDEN), issue(2, SHOWN));
  unlistedEnv = { ...r.env, UNLISTED_REPOSITORIES: ` ${HIDDEN.toUpperCase()} , other/thing ` };
}, 120000);
afterEach(() => r.close());

const listedIds = async (env: Rig['env']) => (await json(env, '/bounties.json')).bounties.map((b: { id: string }) => b.id);

describe('a repository the board never lists', () => {
  it('is never stored or shown, on any surface, and nothing of it is read from GitHub', async () => {
    r.env = unlistedEnv;
    await refreshUntilDone(r);
    expect(await listedIds(unlistedEnv)).toEqual([idOf(0xa902)]);
    expect((await ask(unlistedEnv, `/bounties/${idOf(0xa901)}.json`)).status).toBe(404);
    expect((await json(unlistedEnv, '/numbers.json')).bounties.listed).toBe(1);
    const mcp = await (await handle(new Request(`${ORIGIN}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'find_bounties', arguments: {} } }) }), unlistedEnv)).json() as any;
    expect(mcp.result.structuredContent.bounties.map((b: { id: string }) => b.id)).toEqual([idOf(0xa902)]);
    expect((await unlistedEnv.DB.prepare('SELECT COUNT(*) AS n FROM bounties WHERE repository = ?').bind(HIDDEN).first<{ n: number }>())!.n).toBe(0);
    // Nothing of it was read: no repository read, no pull request list.
    expect(r.standin.requests.filter(path => path.startsWith(`/repos/${HIDDEN}`))).toEqual([]);
  });

  it('a repository already listed leaves at the next run once the setting names it, not at its next scheduled read', async () => {
    await refreshUntilDone(r);
    expect((await listedIds(r.env)).sort()).toEqual([idOf(0xa901), idOf(0xa902)]);
    // A minute later, inside the repository's 15-minute freshness: one run with the setting removes it.
    r.clock.at += MINUTE;
    await refresh(unlistedEnv);
    expect(await listedIds(unlistedEnv)).toEqual([idOf(0xa902)]);
    expect((await unlistedEnv.DB.prepare('SELECT COUNT(*) AS n FROM pull_requests WHERE bounty_id = ?').bind(idOf(0xa901)).first<{ n: number }>())!.n).toBe(0);
  });

  it('a bounty page refuses at once, before the next run; a notice stores nothing', async () => {
    await refreshUntilDone(r);
    expect((await ask(r.env, `/bounties/${idOf(0xa901)}.json`)).status).toBe(200);
    expect((await ask(unlistedEnv, `/bounties/${idOf(0xa901)}.json`)).status).toBe(404);
    await unlistedEnv.DB.prepare('DELETE FROM bounties').run();
    expect(await lookNow(unlistedEnv, HIDDEN, 901, idOf(0xa901), r.clock.at)).toBe('not-public');
    expect((await unlistedEnv.DB.prepare('SELECT COUNT(*) AS n FROM bounties').first<{ n: number }>())!.n).toBe(0);
  });
});
