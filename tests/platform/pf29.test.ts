// PF29: an earning agent can price a bounty from the board alone. Each fact is shown on a world where the rows it
// counts and the rows it must leave out are both really on the board.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handle } from '../../packages/box-platform/src/api.js';
import { idOf, type StandinIssue } from '../../packages/box-platform/standin/standin.js';
import { NOW, refreshUntilDone, rig, type Rig } from './support.js';

const ORIGIN = 'http://board.test';
const askJson = async (r: Rig, path: string): Promise<any> => (await handle(new Request(`${ORIGIN}${path}`), r.env)).json();
const DAY = 86400000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
const REPOSITORY = 'example-org/pf29';
const issue = (n: number, over: Partial<StandinIssue> = {}): StandinIssue => ({ id: idOf(0xf000 + n), repository: REPOSITORY, number: 9000 + n, title: `PF29 ${n}`, task: `Task ${n}.`, poster: 'pf29-poster', amount: 40, createdAt: ago(3), pulls: [], events: [], ...over });
type Pull = NonNullable<StandinIssue['pulls']>[number];
const pull = (number: number, over: Partial<Pull>): Pull => ({ number, author: 'example-fern', state: 'open', created_at: ago(2), association: 'NONE', ...over } as Pull);

let r: Rig;
beforeEach(async () => { r = await rig('not-a-real-token'); r.standin.repositories.set(REPOSITORY, { language: 'TypeScript', visibility: 'public' }); }, 120000);
afterEach(() => r.close());

describe('the owner\'s merge odds', () => {
  it('counts others\' pull requests merged, closed and open; leaves out the poster\'s own and a collaborator\'s', async () => {
    r.standin.issues.push(
      issue(1, { state: 'closed', closedAt: ago(1), pulls: [pull(101, { state: 'closed', merged_at: ago(1), landed: true }), pull(102, { state: 'closed', author: 'example-quill' })] }),
      // Left out: the poster's own merge, a collaborator's merge, and the poster's own open attempt.
      issue(3, { state: 'closed', closedAt: ago(1), pulls: [pull(104, { author: 'pf29-poster', state: 'closed', merged_at: ago(1), association: 'OWNER' })] }),
      issue(4, { state: 'closed', closedAt: ago(1), pulls: [pull(105, { author: 'example-mate', state: 'closed', merged_at: ago(1), association: 'COLLABORATOR' })] }),
      issue(2, { pulls: [pull(103, {}), pull(106, { author: 'pf29-poster', association: 'OWNER' })] })
    );
    await refreshUntilDone(r);
    // The rows the rule leaves out are really stored.
    const stored = (await r.env.DB.prepare('SELECT number FROM pull_requests ORDER BY number').all<{ number: number }>()).results.map(row => row.number);
    expect(stored).toEqual([101, 102, 103, 104, 105, 106]);
    const page = await askJson(r, '/bounties.json');
    const entry = page.bounties.find((b: { id: string }) => b.id === idOf(0xf002));
    expect(entry.owner.pull_requests).toEqual({ merged: 1, closed: 1, open: 1 });
    expect(page.legend['owner.pull_requests']).toContain('Counts, not a rate');
  });

  it('an owner with no pull requests by others shows zeros, not nothing', async () => {
    r.standin.issues.push(issue(5));
    await refreshUntilDone(r);
    const page = await askJson(r, '/bounties.json');
    expect(page.bounties[0].owner.pull_requests).toEqual({ merged: 0, closed: 0, open: 0 });
  });
});
