// BT61: take and submit answer --json with one document. The setup is BT57's: the stand-in GitHub, and a stand-in board for the
// bounty's public detail; the commands run through the built tool, as a program would run them.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { changeConfig } from '../../../packages/box-bounty/index.js';
import { postedFixture, type GhState } from './github-fixture.js';
import { CLI_DIST, git, runRoot } from './support.js';
import { watchFields } from './surface.js';

// BT62: the fields of the take and submit documents this file prints are checked against the surface record.
const fields = watchFields('bt61-solver');
afterAll(fields.check);

type Doc = Record<string, unknown>;
const STANDIN = fileURLToPath(new URL('./board-standin.cjs', import.meta.url));
let folder: string;
let board: string;
let server: ChildProcess;
let table: Record<string, { status: number; body: unknown }> = {};
const route = (path: string, body: unknown, status = 200) => { table = { ...table, [path]: { status, body } }; writeFileSync(join(folder, 'routes.json'), JSON.stringify(table)); };

beforeAll(async () => {
  folder = runRoot('bt61-board');
  mkdirSync(folder, { recursive: true });
  server = spawn(process.execPath, [STANDIN, folder], { stdio: ['ignore', 'pipe', 'inherit'] });
  board = await new Promise<string>(done => server.stdout!.once('data', chunk => done(`http://127.0.0.1:${/listening (\d+)/.exec(String(chunk))![1]}`)));
});
afterAll(() => { server.kill(); });
beforeEach(() => { writeFileSync(join(folder, 'requests.jsonl'), ''); table = {}; route('/none', {}); });

const cli = (cwd: string, args: string[]) => spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args], { cwd, encoding: 'utf8', env: process.env, timeout: 90000 });
const one = (cwd: string, args: string[], exit = 0): Doc => {
  const ran = cli(cwd, args);
  expect(ran.status, `${args.join(' ')}: ${ran.stdout}${ran.stderr}`).toBe(exit);
  expect(ran.stderr, `${args.join(' ')} wrote to standard error`).toBe('');
  expect(ran.stdout.trim().split('\n')).toHaveLength(1);
  return fields.see(JSON.parse(ran.stdout) as Doc);
};

describe('BT61: the solver\'s half answers --json', { timeout: 300000 }, () => {
  it('take and submit: one document each, with the pull request as a number and an address', () => postedFixture(({ bare, id, state, update, repo }) => {
    changeConfig(null, 'set', 'board', board);
    changeConfig(null, 'set', 'solving', 'allowed');
    route(`/bounties/${id}.json`, { bounty: {
      id, state: 'open', reward: { amount: 45 }, pays_on_merge: true, owner: { login: 'owner' }, repository: { name: 'owner/project' },
      answer: { branch: `box-bounty/${id}`, base_commit: git(bare, ['rev-parse', `refs/heads/box-bounty/${id}`]) }, solutions: { total: 1 }, payment: { state: 'nothing-owed' }, solution_list: []
    } });
    route('/api/solver/solver', { login: 'solver', methods: [], methods_more: 0, ways_set_up: { one_click: ['Stripe', 'PayPal'], on_merge: true }, takes: { stripe: false, paypal: false } });

    const taken = one(repo, ['take', id, '--json']);
    expect(taken['schema']).toBe('box-bounty/take@1');
    expect(taken).toMatchObject({ id, outcome: 'taken', repository: 'owner/project', stage: 'taken' });
    const pullRequest = taken['pullRequest'] as { number: number; url: string };
    expect(Number.isInteger(pullRequest.number)).toBe(true);
    expect(pullRequest.url).toContain('/pull/');
    expect(String(taken['baseCommit'])).toMatch(/^[0-9a-f]{40}$/);
    expect(String(taken['branch'])).toContain(id);
    expect(typeof taken['workspace']).toBe('string');
    expect((taken['lines'] as string[]).join('\n')).toContain('taken');

    // the solver pushes a file; the stand-in's pull request then changes one
    type Pr = GhState['prs'][number];
    update({ prs: state().prs.map((entry: Pr) => entry.number === pullRequest.number ? { ...entry, files: [{ filename: 'app.txt' }] } : entry) });
    const submitted = one(repo, ['submit', id, '--json']);
    expect(submitted['schema']).toBe('box-bounty/submit@1');
    expect(submitted).toMatchObject({ id, outcome: 'submitted', changedFiles: 1 });
    expect((submitted['pullRequest'] as { number: number }).number).toBe(pullRequest.number);

    const again = one(repo, ['submit', id, '--json']);
    expect(again).toMatchObject({ schema: 'box-bounty/submit@1', outcome: 'already-ready' });
  }));
});
