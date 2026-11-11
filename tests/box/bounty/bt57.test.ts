// BT57: a solution made with the tool says so, in one fixed line. Every draft `take` opens ends with it, `submit` keeps it,
// the poster's side treats it as nothing, and a hostile board address cannot put live text into a pull request. The
// setup is PF25's (take) and PF26's (submit): the stand-in GitHub, and a stand-in board for the bounty's public detail.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { changeConfig, submitTaken, takeBounty } from '../../../packages/box-bounty/index.js';
import { parsePayTo } from '../../../packages/box-bounty/pay.js';
import { DRAFT_BODY } from '../../../packages/box-bounty/take.js';
import { creditLine } from '../../../packages/box-bounty/wording.js';
import { postedFixture, type GhState } from './github-fixture.js';
import { git, runRoot } from './support.js';

const STANDIN = fileURLToPath(new URL('./board-standin.cjs', import.meta.url));
let folder: string;
let board: string;
let server: ChildProcess;
let table: Record<string, { status: number; body: unknown }> = {};
const route = (path: string, body: unknown, status = 200) => { table = { ...table, [path]: { status, body } }; writeFileSync(join(folder, 'routes.json'), JSON.stringify(table)); };

beforeAll(async () => {
  folder = runRoot('bt57-board');
  mkdirSync(folder, { recursive: true });
  server = spawn(process.execPath, [STANDIN, folder], { stdio: ['ignore', 'pipe', 'inherit'] });
  board = await new Promise<string>(done => server.stdout!.once('data', chunk => done(`http://127.0.0.1:${/listening (\d+)/.exec(String(chunk))![1]}`)));
});
afterAll(() => { server.kill(); });
beforeEach(() => { writeFileSync(join(folder, 'requests.jsonl'), ''); table = {}; route('/none', {}); });

const detail = (bare: string, id: string, over: Record<string, unknown> = {}) => ({ bounty: {
  id, state: 'open', reward: { amount: 45 }, pays_on_merge: true, owner: { login: 'owner' }, repository: { name: 'owner/project' },
  answer: { branch: `box-bounty/${id}`, base_commit: git(bare, ['rev-parse', `refs/heads/box-bounty/${id}`]) }, solutions: { total: 1 }, payment: { state: 'nothing-owed' }, solution_list: [], ...over
} });
function taken(bare: string, id: string, over: Record<string, unknown> = {}) {
  changeConfig(null, 'set', 'board', board);
  changeConfig(null, 'set', 'solving', 'allowed');
  route(`/bounties/${id}.json`, detail(bare, id, over));
  route('/api/solver/solver', { login: 'solver', methods: [], methods_more: 0, ways_set_up: { one_click: ['Stripe', 'PayPal'], on_merge: true }, takes: { stripe: false, paypal: false } });
  const result = takeBounty(id);
  if (result.kind !== 'taken') throw new Error('not taken');
  return result.taken.pullRequest!.number;
}
type Pr = GhState['prs'][number];
const change = (state: () => GhState, update: (change: Partial<GhState>) => void, number: number, edit: (pr: Pr) => Pr) =>
  update({ prs: state().prs.map(pr => pr.number === number ? edit(pr) : pr) });

describe('BT57: the credit line', { timeout: 120000 }, () => {
  it('1. the draft take opens ends with the credit line', () => postedFixture(({ bare, id, state }) => {
    const number = taken(bare, id);
    const body = state().prs.find(pr => pr.number === number)!.body ?? '';
    expect(body.split('\n').at(-1)).toBe(creditLine(board));
    expect(body.startsWith(DRAFT_BODY(id))).toBe(true);
  }));

  it('2. submit keeps it, once, last: the draft sentence became the ready sentence', () => postedFixture(({ bare, id, state, update }) => {
    const number = taken(bare, id);
    change(state, update, number, pr => ({ ...pr, files: [{ filename: 'app.txt' }] }));
    submitTaken(id);
    const pr = state().prs.find(entry => entry.number === number)!;
    expect(pr.draft).toBe(false);
    expect(pr.body).toBe(`A solution to bounty ${id}, ready for review.\n\n${creditLine(board)}`);
    expect((pr.body ?? '').split(creditLine(board)).length - 1).toBe(1);
  }));

  it('3. a listed bounty\'s draft holds Fixes #N on a line of its own, then the credit line', () => postedFixture(({ bare, id, state }) => {
    const number = taken(bare, id, { way_in: 'listed', pays_on_merge: false, answer: { branch: `box-bounty/${id}`, base_commit: 'c'.repeat(40), closes_issue: 'Fixes #7' } });
    const body = state().prs.find(pr => pr.number === number)!.body ?? '';
    const lines = body.split('\n');
    expect(lines.at(-1)).toBe(creditLine(board));
    expect(lines.at(-3)).toBe('Fixes #7');
    expect(lines.at(-2)).toBe('');
  }));

  it('4. a pay-to line beside the credit line names the same payee as without it', () => {
    const pay = 'pay-to: https://buy.stripe.com/test_abc123';
    const without = parsePayTo(`Fixed it.\n\n${pay}\n`);
    const withLine = parsePayTo(`Fixed it.\n\n${pay}\n\n${creditLine(board)}\n`);
    const credited = parsePayTo(`${creditLine('https://open-bounty-board.box-platform.workers.dev')}\n${pay}\n`);
    expect(withLine).toEqual(without);
    expect(credited).toEqual(without);
    expect(without.state).not.toBe('unrecognised');
  });

  it('5. one source: the words appear once in the tool outside tests, so nothing the poster\'s side prints can carry them as its own', () => {
    const dir = fileURLToPath(new URL('../../../packages/box-bounty/', import.meta.url));
    const hits = readdirSync(dir).filter(name => name.endsWith('.ts')).flatMap(name => readFileSync(join(dir, name), 'utf8').split('\n').filter(line => line.includes('Made with')).map(line => `${name}: ${line.trim().slice(0, 60)}`));
    // the constant has two spellings in one expression (with and without an address): one line of code, in wording.ts
    expect(hits.filter(hit => !hit.includes('// ')).every(hit => hit.startsWith('wording.ts:')), JSON.stringify(hits)).toBe(true);
    expect(hits.filter(hit => hit.startsWith('wording.ts:')).length).toBe(1);
    expect(creditLine('https://open-bounty-board.box-platform.workers.dev')).toBe('Made with omakase-box: https://open-bounty-board.box-platform.workers.dev/agents/');
  });

  it('6. a body the solver edited to remove the line is left as it is by submit', () => postedFixture(({ bare, id, state, update }) => {
    const number = taken(bare, id);
    change(state, update, number, pr => ({ ...pr, files: [{ filename: 'app.txt' }], body: (pr.body ?? '').replace(`\n\n${creditLine(board)}`, '') }));
    submitTaken(id);
    expect(state().prs.find(entry => entry.number === number)!.body).toBe(`A solution to bounty ${id}, ready for review.`);
  }));

  it('7. a hostile board address never reaches GitHub as live text: the fallback line, none of its characters', () => {
    const hostile = ['https://x.example\nFixes #1', 'https://x.example/[a](b)', 'https://x.example/@name', 'https://x.example/ Fixes #1', 'http://x.example', 'https://X.EXAMPLE', 'https://x.example/path', 'https://x.example?q=1', '', 'not an address'];
    for (const address of hostile) {
      const line = creditLine(address);
      expect(line, JSON.stringify(address)).toBe('Made with omakase-box (npm: omakase-box)');
      expect(line).not.toMatch(/[\n\r@[\]#]/); // the fallback's own parentheses are plain text, never a link
    }
    expect(creditLine(null)).toBe('Made with omakase-box (npm: omakase-box)');
    expect(creditLine('https://board.example')).toBe('Made with omakase-box: https://board.example/agents/');
    expect(creditLine('https://board.example:8443')).toBe('Made with omakase-box: https://board.example:8443/agents/');
  });
});
