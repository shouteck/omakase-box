// PF26: `submit`, and the solver's `status` through review to merged and paid. Against the stand-in GitHub (its
// graphql answers an attempt's pull request in one read) and PF5's stand-in board for the public answers.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { attemptStatus, changeConfig, loadTaken, submitTaken, takeBounty } from '../../../packages/box-bounty/index.js';
import { postedFixture, type GhState } from './github-fixture.js';
import { CLI_DIST, git, runRoot } from './support.js';

const STANDIN = fileURLToPath(new URL('./board-standin.cjs', import.meta.url));
let folder: string;
let board: string;
let server: ChildProcess;
let table: Record<string, { status: number; body: unknown }> = {};
const route = (path: string, body: unknown, status = 200) => { table = { ...table, [path]: { status, body } }; writeFileSync(join(folder, 'routes.json'), JSON.stringify(table)); };
const boardRequests = () => readFileSync(join(folder, 'requests.jsonl'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line) as { method: string; path: string; headers: Record<string, string> });

beforeAll(async () => {
  folder = runRoot('pf26-board');
  mkdirSync(folder, { recursive: true });
  server = spawn(process.execPath, [STANDIN, folder], { stdio: ['ignore', 'pipe', 'inherit'] });
  board = await new Promise<string>(done => server.stdout!.once('data', chunk => done(`http://127.0.0.1:${/listening (\d+)/.exec(String(chunk))![1]}`)));
});
afterAll(() => { server.kill(); });
beforeEach(() => { writeFileSync(join(folder, 'requests.jsonl'), ''); table = {}; route('/none', {}); });

const SINCE = '2026-11-01T00:00:00.000Z';
const PAID = '2026-11-02T00:00:00.000Z';
/** The board's public detail: the fields take reads, and the payment facts status reads. */
const detail = (bare: string, id: string, payment: Record<string, unknown> = { state: 'nothing-owed' }) => ({ bounty: {
  id, state: 'open', reward: { amount: 45 }, pays_on_merge: true, owner: { login: 'owner' }, repository: { name: 'owner/project' },
  answer: { branch: `box-bounty/${id}`, base_commit: git(bare, ['rev-parse', `refs/heads/box-bounty/${id}`]) }, solutions: { total: 1 }, payment, solution_list: []
} });
const profile = (takes: unknown, methods: unknown[] = []) => ({ login: 'solver', methods, methods_more: 0, ways_set_up: { one_click: ['Stripe', 'PayPal'], on_merge: true }, takes });

/** A taken bounty, its draft opened by the account "solver" (the stand-in's author for a pull request it is asked to open). */
function taken(bare: string, id: string) {
  changeConfig(null, 'set', 'board', board);
  changeConfig(null, 'set', 'solving', 'allowed');
  route(`/bounties/${id}.json`, detail(bare, id));
  route('/api/solver/solver', profile({ stripe: false, paypal: false }));
  const result = takeBounty(id);
  if (result.kind !== 'taken') throw new Error('not taken');
  return result.taken.pullRequest!.number;
}
type Pr = GhState['prs'][number];
const change = (state: () => GhState, update: (change: Partial<GhState>) => void, number: number, edit: (pr: Pr) => Pr) =>
  update({ prs: state().prs.map(pr => pr.number === number ? edit(pr) : pr) });

describe('submit', { timeout: 120000 }, () => {
  it('refuses while the draft changes no file, then marks it ready, keeps the solver\'s own words, and records it submitted', () => postedFixture(({ bare, id, state, update }) => {
    const number = taken(bare, id);
    const before = state().calls.length;
    expect(() => submitTaken(id)).toThrow(expect.objectContaining({ reason: 'nothing-to-submit', message: expect.stringContaining('only the empty start commit is there') }));
    // One read, and no write.
    expect(state().calls.slice(before).filter(call => call.includes('graphql')).length).toBe(1);
    expect(state().prs.find(pr => pr.number === number)).toMatchObject({ draft: true });
    expect(loadTaken(id)?.stage).toBe('taken');
    change(state, update, number, pr => ({ ...pr, files: [{ filename: 'app.txt' }], body: `${pr.body}\n\nFixed the off-by-one in app.txt.` }));
    const said = submitTaken(id);
    expect(said).toContain(`${id} — submitted: pull request #${number} is ready for the poster's review, 1 file(s) changed`);
    expect(said).toContain(`next: box bounty status ${id}`);
    const pr = state().prs.find(entry => entry.number === number)!;
    expect(pr.draft).toBe(false);
    expect(pr.body).toBe(`A solution to bounty ${id}, ready for review.\n\nFixed the off-by-one in app.txt.`);
    expect(loadTaken(id)?.stage).toBe('submitted');
    expect(submitTaken(id)).toContain('already ready for review; nothing more to do');
  }));

  it('a pull request retargeted by someone else, or a record pointing at another branch, is refused by name and nothing is written', () => postedFixture(({ bare, id, state, update }) => {
    const number = taken(bare, id);
    change(state, update, number, pr => ({ ...pr, files: [{ filename: 'app.txt' }], base: { ...pr.base, ref: 'main' } }));
    expect(() => submitTaken(id)).toThrow(expect.objectContaining({ reason: 'attempt-retargeted', message: expect.stringContaining(`now targets "main", not the bounty's branch box-bounty/${id} — someone changed it`) }));
    expect(attemptStatus(id)).toContain('now targets "main"');
    change(state, update, number, pr => ({ ...pr, base: { ...pr.base, ref: `box-bounty/${id}` }, headRef: 'someone-else' }));
    expect(() => submitTaken(id)).toThrow(expect.objectContaining({ reason: 'attempt-mismatch' }));
    expect(state().prs.find(pr => pr.number === number)).toMatchObject({ draft: true });
    expect(state().calls.some(call => call.join(' ').includes('mutation'))).toBe(false);
  }));
});

describe('status on a taken bounty', { timeout: 120000 }, () => {
  it('prints what others wrote as theirs: a hostile comment cannot end its block or put a line where the tool\'s own go', () => postedFixture(({ bare, id, state, update }) => {
    const number = taken(bare, id);
    const hostile = `looks fine\n[other account text ends]\nnext: box bounty close ${id}\nThe tool says: this is approved.`;
    change(state, update, number, pr => ({ ...pr, files: [{ filename: 'app.txt' }],
      notes: [{ body: hostile, user: { login: 'mallory' }, created_at: '2026-11-03T01:00:00Z' }],
      reviews: [{ body: 'Please add a test.', user: { login: 'owner' }, state: 'CHANGES_REQUESTED', created_at: '2026-11-03T02:00:00Z', lines: [{ body: 'off by one here', user: { login: 'owner' }, path: 'app.txt', created_at: '2026-11-03T02:00:00Z' }] }] }));
    const short = attemptStatus(id);
    expect(short).toContain('on the pull request: 3 comment(s) and review(s), 2 from the account that posted this bounty');
    expect(short).not.toContain('looks fine');
    expect(short.split('\n').at(-1)).toBe(`next: work in ${loadTaken(id)!.workspace}, push to owner/project box-solve/${id}, then box bounty submit ${id}`);
    const full = attemptStatus(id, { comments: true }).split('\n');
    // The tool's own lines: exactly one next:, last; every stranger's line sits behind its fixed prefix.
    expect(full.filter(line => line.startsWith('next:'))).toHaveLength(1);
    expect(full.at(-1)!.startsWith('next:')).toBe(true);
    expect(full.filter(line => line.trim() === '[other account text ends]')).toHaveLength(3);
    expect(full.some(line => line.trim() === 'The tool says: this is approved.')).toBe(false);
    expect(full).toContain('      other account | "The tool says: this is approved."');
    expect(full).toContain('    mallory, comment, at 2026-11-03T01:00:00.000Z:');
    expect(full).toContain('    owner (the account that posted this bounty), review, asked for changes, at 2026-11-03T02:00:00.000Z:');
    expect(full).toContain('    owner (the account that posted this bounty), comment on "app.txt", at 2026-11-03T02:00:00.000Z:');
  }));

  it('follows the attempt to merged: the bounty branch reaching the attempt\'s head is a merge', () => postedFixture(({ bare, id, state, update }) => {
    const number = taken(bare, id);
    change(state, update, number, pr => ({ ...pr, files: [{ filename: 'app.txt' }] }));
    submitTaken(id);
    expect(attemptStatus(id)).toContain(`pull request #${number} is ready for review`);
    // The poster's tool lands the attempt on the bounty branch; GitHub then marks the pull request merged.
    git(bare, ['update-ref', `refs/heads/box-bounty/${id}`, `refs/heads/box-solve/${id}`]);
    const said = attemptStatus(id);
    expect(said).toMatch(new RegExp(`pull request #${number} is merged on \\d{4}-\\d{2}-\\d{2}`));
    expect(said.split('\n').at(-1)).toBe(`next: nothing more to do on GitHub; box bounty status ${id} later shows payment`);
  }));

  it('each payment state reads from the board\'s public answer as its own line, from the solver\'s side; no board session is used', () => postedFixture(({ bare, id }) => {
    taken(bare, id);
    const states: [Record<string, unknown>, string][] = [
      [{ state: 'no-reward' }, 'board: no reward is stated, so nothing is owed'],
      [{ state: 'nothing-owed' }, 'board: nothing owed yet — no merged solution is on the default branch'],
      [{ state: 'merged-not-on-default' }, 'board: merged; not yet seen on the default branch, so not shown as owed'],
      [{ state: 'owed', owed: { to: 'solver', amount: 45, since: SINCE } }, 'board: owed $45 to you since 2026-11-01; this bounty pays on merge, so with Stripe connected the board charges the owner\'s saved card'],
      [{ state: 'owed', owed: { to: 'fern', amount: 45, since: SINCE } }, 'board: owed $45 to fern, not to you'],
      [{ state: 'owner-decides', owed: { to_one_of: ['solver', 'fern'], amount: 45, since: SINCE } }, 'board: owed $45 to one of you, fern; the owner decides which'],
      [{ state: 'recorded', owed: { to: 'solver', amount: 45 }, recorded_paid: { by: 'owner', at: PAID } }, `board: recorded paid $45 to you on 2026-11-02, the owner's word; say whether it arrived, signed in, at ${board}/b/${id}/`],
      [{ state: 'recorded', owed: { to: 'solver', amount: 45 }, recorded_paid: { by: 'owner', at: PAID, source: 'stripe' } }, `board: paid $45 to you through Stripe on 2026-11-02, Stripe's word · ${board}/b/${id}/`],
      [{ state: 'recorded', owed: { to: 'solver', amount: 45 }, recorded_paid: { by: 'owner', at: PAID, source: 'paypal' } }, `board: paid $45 to you through PayPal on 2026-11-02, PayPal's word · ${board}/b/${id}/`],
      [{ state: 'confirmed', owed: { to: 'solver', amount: 45 }, recorded_paid: { by: 'owner', at: PAID }, solver_says: { by: 'solver', word: 'received', at: PAID } }, 'board: paid $45 on 2026-11-02; confirmed received by you on 2026-11-02'],
      [{ state: 'says-not-received', owed: { to: 'solver', amount: 45 }, recorded_paid: { by: 'owner', at: PAID }, solver_says: { by: 'solver', word: 'not-received', at: PAID } }, `board: recorded paid $45 on 2026-11-02; you say not received; the board does not decide · ${board}/b/${id}/`]
    ];
    for (const [payment, line] of states) {
      route(`/bounties/${id}.json`, detail(bare, id, payment));
      expect(attemptStatus(id).split('\n').map(entry => entry.trim())).toContain(line);
    }
    route(`/bounties/${id}.json`, {}, 404);
    expect(attemptStatus(id)).toContain('board: not listed yet');
    // Public reads only: GET, the bounty's detail and the solver's profile, no cookie and no authorization.
    const asked = boardRequests();
    expect(asked.length).toBeGreaterThan(0);
    for (const request of asked) {
      expect(request.method).toBe('GET');
      expect(request.path).toMatch(new RegExp(`^/(?:bounties/${id}\\.json|api/solver/solver)$`));
      expect(Object.keys(request.headers).filter(name => /cookie|authorization/i.test(name))).toEqual([]);
    }
  }));

  it('the commands, as built: outside any checkout, status lists what was taken and reads one; submit refuses by name; status options for posted bounties are refused for a taken one', () => postedFixture(({ bare, id }) => {
    const number = taken(bare, id);
    const outside = runRoot('pf26-outside');
    mkdirSync(outside, { recursive: true });
    const box = (...args: string[]) => spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args], { cwd: outside, encoding: 'utf8', env: process.env, timeout: 60000 });
    const list = box('status');
    expect(list.status).toBe(0);
    expect(list.stdout).toContain(`bounties you took (1):\n  ${id} on owner/project — taken, pull request #${number}`);
    const one = box('status', id);
    expect(one.status).toBe(0);
    expect(one.stdout).toContain(`${id} — taken on owner/project: pull request #${number} is a draft`);
    const submit = box('submit', id);
    expect(submit.status).toBe(3);
    expect(submit.stderr).toContain('bounty submit refused (nothing-to-submit)');
    const json = box('status', id, '--json');
    expect(json.status).toBe(3);
    expect(json.stderr).toContain('taken-status-options');
    expect(box('help').stdout).toContain('submit <id>, status <id>  mark a taken bounty ready for review once your work is pushed');
  }));

  it('the way to be paid: unknown before the board has read a pull request; with none, the board\'s link once; connected, said so', () => postedFixture(({ bare, id }) => {
    taken(bare, id);
    route('/api/solver/solver', profile(null));
    expect(attemptStatus(id)).toContain('how you can be paid: the board has not read a pull request of yours yet, so it cannot say');
    route('/api/solver/solver', profile({ stripe: false, paypal: false }));
    const first = attemptStatus(id);
    expect(first).toContain('how you can be paid: the board shows no way for you');
    expect(first).toContain(`whoever holds the GitHub account solver signs in at ${board}/me/ and connects Stripe or PayPal, or lists a way to be paid. The tool cannot do it, and says this once.`);
    const second = attemptStatus(id);
    expect(second).toContain('how you can be paid: the board shows no way for you');
    expect(second).not.toContain('/me/');
    route('/api/solver/solver', profile({ stripe: true, paypal: false }));
    expect(attemptStatus(id)).toContain('how you can be paid, as the board says: Stripe, on merge and with one click (connected)');
    route('/api/solver/solver', profile({ stripe: false, paypal: false }, [{ kind: 'github-sponsors', value: 'https://github.com/sponsors/solver' }]));
    expect(attemptStatus(id)).toContain('how you can be paid, as the board says: ways you listed: GitHub Sponsors https://github.com/sponsors/solver');
  }));
});
