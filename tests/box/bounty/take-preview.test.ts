import childProcess, { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs, { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { allowRepository, changeConfig, loadSettings, loadTaken, previewTake, takeBounty, takePreviewDocument } from '../../../packages/box-bounty/index.js';
import { postedFixture } from './github-fixture.js';
import { CLI_DIST, git, runRoot } from './support.js';
import { watchFields } from './surface.js';

const fields = watchFields('take-preview');
afterAll(fields.check);

let folder: string;
let board: string;
let server: ChildProcess;
const route = (id: string, bounty: unknown, status = 200) => writeFileSync(join(folder, 'routes.json'), JSON.stringify({ [`/bounties/${id}.json`]: { status, body: { bounty } } }));
const listed = (bare: string, id: string, over: Record<string, unknown> = {}) => {
  const base = git(bare, ['rev-parse', `refs/heads/box-bounty/${id}`]);
  route(id, { id, state: 'open', reward: { amount: 45 }, pays_on_merge: true, owner: { login: 'owner' }, repository: { name: 'owner/project' }, answer: { branch: `box-bounty/${id}`, base_commit: base }, ...over });
  return base;
};
const configure = (mode = 'allowed') => { changeConfig(null, 'set', 'board', board); changeConfig(null, 'set', 'solving', mode); };
const cli = (cwd: string, args: string[]) => spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args], { cwd, encoding: 'utf8', env: process.env, timeout: 90000 });

beforeAll(async () => {
  folder = runRoot('take-preview-board');
  server = spawn(process.execPath, [fileURLToPath(new URL('./board-standin.cjs', import.meta.url)), folder], { stdio: ['ignore', 'pipe', 'inherit'] });
  board = await new Promise<string>(done => server.stdout!.once('data', chunk => done(`http://127.0.0.1:${/listening (\d+)/.exec(String(chunk))![1]}`)));
});
afterAll(() => { server.kill(); });
beforeEach(() => { writeFileSync(join(folder, 'requests.jsonl'), ''); writeFileSync(join(folder, 'routes.json'), '{}'); });

describe('take preview', { timeout: 120000 }, () => {
  it('only reads: no filesystem writes, git clone/push, taken record, approval change or workspace; the draft equals the real take', () => postedFixture(({ bare, id, state, scratch }) => {
    configure();
    const base = listed(bare, id);
    const before = loadSettings();
    const callsBefore = state().calls.length;
    const writes: string[] = [];
    const commands: string[][] = [];
    const spawnOriginal = childProcess.spawnSync;
    const originals = { mkdirSync: fs.mkdirSync, mkdtempSync: fs.mkdtempSync, writeFileSync: fs.writeFileSync, rmSync: fs.rmSync };
    const into = join(scratch, 'preview-workspace');
    let result: ReturnType<typeof previewTake>;
    try {
      for (const name of Object.keys(originals) as (keyof typeof originals)[]) {
        Object.assign(fs, { [name]: new Proxy(originals[name], { apply(target, receiver, args) { writes.push(name); return Reflect.apply(target, receiver, args); } }) });
      }
      childProcess.spawnSync = new Proxy(spawnOriginal, { apply(target, receiver, args) { commands.push([String(args[0]), ...(Array.isArray(args[1]) ? args[1].map(String) : [])]); return Reflect.apply(target, receiver, args); } });
      syncBuiltinESMExports();
      result = previewTake(id, { into });
    } finally {
      Object.assign(fs, originals);
      childProcess.spawnSync = spawnOriginal;
      syncBuiltinESMExports();
    }
    expect(writes).toEqual([]);
    expect(commands.filter(call => /(?:^|[\\/])git(?:\.exe)?$/i.test(call[0]!))).toEqual([]);
    const calls = state().calls.slice(callsBefore).filter(call => call[0] === 'api');
    expect(calls.map(call => call[call.indexOf('--hostname') + 2])).toEqual(['user', 'repos/owner/project', `repos/owner/project/git/ref/heads/box-bounty/${id}`]);
    expect(calls.every(call => !call.includes('--input') && !call.includes('--method'))).toBe(true);
    expect(existsSync(into)).toBe(false);
    expect(loadTaken(id)).toBeNull();
    expect(loadSettings()).toEqual(before);
    expect(result!).toMatchObject({ taken: false, repository: 'owner/project', target: 'owner/project', fork: false, baseCommit: base, approval: 'standing', ownBounty: true });
    expect(result!.lines.at(-1)).toBe('preview only — nothing was taken. Run again without --preview to take it.');
    expect(takeBounty(id).kind).toBe('taken');
    const draft = state().prs.at(-1)!;
    expect(draft).toMatchObject({ title: result!.pullRequest.title, body: result!.pullRequest.body, base: { ref: result!.pullRequest.base }, headRef: result!.pullRequest.head, draft: true });
  }));

  it('reports a prospective fork without creating it', () => postedFixture(({ bare, id, update, state }) => {
    configure(); listed(bare, id); update({ push: false, account: 'solver1' });
    const prsBefore = state().prs;
    const result = previewTake(id);
    expect(result).toMatchObject({ target: 'solver1/project', fork: true, ownBounty: false, pullRequest: { head: `solver1:box-solve/${id}` } });
    expect(result.lines.join('\n')).toContain('fork would be created');
    expect(state().calls.some(call => call.some(arg => arg.endsWith('/forks')))).toBe(false);
    expect(state().prs).toEqual(prsBefore);
  }));

  it('ask mode names the approval command but writes no waiting record', () => postedFixture(({ bare, id }) => {
    configure('ask'); listed(bare, id);
    const before = loadSettings();
    const result = previewTake(id);
    expect(result.approval).toBe('needed');
    expect(result.lines.join('\n')).toContain(`omakase-box allow ${id}`);
    expect(loadTaken(id)).toBeNull();
    expect(loadSettings()).toEqual(before);
  }));

  it('a one-use approval survives previews and is consumed only by real take', () => postedFixture(({ bare, id }) => {
    configure('ask'); listed(bare, id);
    expect(takeBounty(id).kind).toBe('waiting');
    allowRepository(null, id);
    const before = loadSettings();
    const waiting = loadTaken(id);
    const result = previewTake(id);
    expect(result.approval).toBe('one-use');
    expect(result.lines.join('\n')).toContain('the real take would consume it');
    expect(loadSettings()).toEqual(before);
    expect(loadTaken(id)).toEqual(waiting);
    expect(takeBounty(id).kind).toBe('taken');
    expect(loadSettings().solving?.approved).toEqual([]);
  }));

  it('shares invalid-id, settings, limits, board and already-taken refusals', () => postedFixture(({ bare, id }) => {
    expect(() => previewTake('invalid')).toThrow(expect.objectContaining({ reason: 'bounty-id-invalid' }));
    changeConfig(null, 'set', 'board', board);
    expect(() => previewTake(id)).toThrow(expect.objectContaining({ reason: 'solving-off' }));
    configure();
    expect(() => previewTake(id)).toThrow(expect.objectContaining({ reason: 'board-unread' }));
    listed(bare, id, { state: 'closed-none' });
    expect(() => previewTake(id)).toThrow(expect.objectContaining({ reason: 'bounty-not-open' }));
    listed(bare, id, { reward: { amount: '45' } });
    expect(() => previewTake(id)).toThrow(expect.objectContaining({ reason: 'board-unread' }));
    listed(bare, id);
    changeConfig(null, 'set', 'solving-floor', '50');
    expect(() => previewTake(id)).toThrow(expect.objectContaining({ reason: 'outside-owner-limits' }));
    changeConfig(null, 'set', 'solving-floor', '0');
    changeConfig(null, 'set', 'solving-pays-on-merge', 'true');
    listed(bare, id, { pays_on_merge: false });
    expect(() => previewTake(id)).toThrow(expect.objectContaining({ reason: 'outside-owner-limits' }));
    listed(bare, id);
    changeConfig(null, 'add', 'solving-skip', 'owner/project');
    expect(() => previewTake(id)).toThrow(expect.objectContaining({ reason: 'outside-owner-limits' }));
    changeConfig(null, 'remove', 'solving-skip', 'owner/project');
    takeBounty(id);
    expect(() => previewTake(id)).toThrow(expect.objectContaining({ reason: 'already-taken' }));
  }));

  it('refuses moved tool-posted bases and existing --into folders without taking anything', () => postedFixture(({ bare, id, scratch }) => {
    configure();
    listed(bare, id, { answer: { branch: `box-bounty/${id}`, base_commit: 'b'.repeat(40) } });
    expect(() => previewTake(id)).toThrow(expect.objectContaining({ reason: 'bounty-branch-moved' }));
    listed(bare, id);
    expect(() => previewTake(id, { into: scratch })).toThrow(expect.objectContaining({ reason: 'workspace-exists' }));
    expect(loadTaken(id)).toBeNull();
  }));

  it('listed issues use the default branch without enforcing the board base; their draft still closes the issue', () => postedFixture(({ bare, id }) => {
    configure();
    listed(bare, id, { way_in: 'listed', answer: { branch: 'main', base_commit: 'b'.repeat(40), closes_issue: 'Fixes #7' } });
    const result = previewTake(id);
    expect(result.bountyBranch).toBe('main');
    expect(result.lines.join('\n')).toContain('default branch main');
    expect(result.pullRequest.body).toContain('\n\nFixes #7\n\n');
    takeBounty(id);
    expect(result.pullRequest.base).toBe('main');
  }));

  it('the built CLI prints one JSON document, human lines and help; eligibility failures exit 3', () => postedFixture(({ bare, id, repo, state }) => {
    configure(); listed(bare, id);
    const before = loadSettings();
    const prsBefore = state().prs;
    const expected = takePreviewDocument(previewTake(id), []);
    const ran = cli(repo, ['take', id, '--preview', '--json']);
    expect(ran.status, ran.stderr).toBe(0);
    expect(ran.stderr).toBe('');
    expect(ran.stdout.trim().split('\n')).toHaveLength(1);
    const doc = fields.see(JSON.parse(ran.stdout));
    expect(doc).toEqual(expected);
    expect(doc).toMatchObject({ schema: 'box-bounty/take-preview@1', id, taken: false, target: 'owner/project', fork: false, branch: `box-solve/${id}`, approval: 'standing', reward: 45, ownBounty: true, pullRequest: { title: `Attempt on bounty ${id}`, base: `box-bounty/${id}`, head: `box-solve/${id}`, draft: true }, foreignFields: [{ field: 'lines[]', source: 'other account' }] });
    expect(Object.keys(doc).sort()).toEqual(['schema', 'id', 'taken', 'repository', 'target', 'fork', 'branch', 'bountyBranch', 'baseCommit', 'pullRequest', 'reward', 'ownBounty', 'approval', 'lines', 'notices', 'foreignFields'].sort());
    const human = cli(repo, ['take', id, '--preview']);
    expect(human.status, human.stderr).toBe(0);
    expect(human.stdout.trim()).toBe(doc.lines.join('\n'));
    expect(loadSettings()).toEqual(before);
    expect(loadTaken(id)).toBeNull();
    expect(state().prs).toEqual(prsBefore);
    const requests = readFileSync(join(folder, 'requests.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    expect(requests.every(request => request.method === 'GET')).toBe(true);
    const help = cli(repo, ['take', '--help']);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('--preview');
    expect(help.stdout).toContain('show what take would create; takes nothing');
    changeConfig(null, 'set', 'solving', 'off');
    const refused = cli(repo, ['take', id, '--preview', '--json']);
    expect(refused.status).toBe(3);
    expect(JSON.parse(refused.stdout)).toMatchObject({ refused: 'solving-off' });
  }));
});
