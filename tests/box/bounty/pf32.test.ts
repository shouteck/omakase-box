// PF32: `take` on a bounty an owner listed from the board on an existing issue. Against the stand-in GitHub (a bare
// remote) and PF5's stand-in board: the clone is the default branch, the draft is against it, and its description closes
// the issue, so GitHub links it and the board reads it as this bounty's.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { changeConfig, takeBounty } from '../../../packages/box-bounty/index.js';
import { postedFixture } from './github-fixture.js';
import { git, runRoot } from './support.js';

const STANDIN = fileURLToPath(new URL('./board-standin.cjs', import.meta.url));
let folder: string;
let board: string;
let server: ChildProcess;
const routes = (next: Record<string, { status: number; body: unknown }>) => writeFileSync(join(folder, 'routes.json'), JSON.stringify(next));

beforeAll(async () => {
  folder = runRoot('pf32-board');
  mkdirSync(folder, { recursive: true });
  server = spawn(process.execPath, [STANDIN, folder], { stdio: ['ignore', 'pipe', 'inherit'] });
  board = await new Promise<string>(done => server.stdout!.once('data', chunk => done(`http://127.0.0.1:${/listening (\d+)/.exec(String(chunk))![1]}`)));
});
afterAll(() => { server.kill(); });
beforeEach(() => { writeFileSync(join(folder, 'requests.jsonl'), ''); routes({}); });

describe('take on a listed bounty', { timeout: 120000 }, () => {
  it('clones the default branch, opens the draft against it, and the draft\'s description closes the issue', () => postedFixture(({ bare, id, state }) => {
    changeConfig(null, 'set', 'board', board);
    changeConfig(null, 'set', 'solving', 'allowed');
    // The fixture's repository has one branch; it stands for the default branch the board names.
    const main = `box-bounty/${id}`;
    const head = git(bare, ['rev-parse', `refs/heads/${main}`]);
    routes({ [`/bounties/${id}.json`]: { status: 200, body: { bounty: { id, state: 'open', way_in: 'listed', reward: { amount: 45 }, pays_on_merge: false, owner: { login: 'owner' }, repository: { name: 'owner/project' }, answer: { branch: main, base_commit: 'c'.repeat(40), pull_request_base: main, closes_issue: 'Fixes #7' } } } } });
    const result = takeBounty(id);
    expect(result.kind).toBe('taken');
    if (result.kind !== 'taken') return;
    // The start commit sits on the default branch's head (the listing's commit is only what it was then).
    const pushed = git(bare, ['rev-parse', `refs/heads/box-solve/${id}`]);
    expect(git(bare, ['rev-parse', `${pushed}^`])).toBe(head);
    const draft = state().prs.at(-1)!;
    expect(draft).toMatchObject({ draft: true, base: { ref: main } });
    // BT57: the closing line stays on its own line; the credit line follows it.
    expect(draft.body).toMatch(/\n\nFixes #7\n\nMade with omakase-box/);
  }));

  it('a posted bounty still needs its bounty branch: an answer naming another branch without closing an issue is refused', () => postedFixture(({ id }) => {
    changeConfig(null, 'set', 'board', board);
    changeConfig(null, 'set', 'solving', 'allowed');
    routes({ [`/bounties/${id}.json`]: { status: 200, body: { bounty: { id, state: 'open', reward: { amount: 45 }, pays_on_merge: false, owner: { login: 'owner' }, repository: { name: 'owner/project' }, answer: { branch: 'main', base_commit: 'c'.repeat(40) } } } } });
    expect(() => takeBounty(id)).toThrow(expect.objectContaining({ reason: 'board-unread' }));
  }));
});
