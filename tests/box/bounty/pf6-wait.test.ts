import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as bounty from '../../../packages/box-bounty/index.js';
import { postedFixture, sharedPostedFixture } from './github-fixture.js';
import { CLI_DIST, git, readRecord, runRoot, write, writeRecord } from './support.js';
import { watchFields } from './surface.js';
import { renderWait, waitForSolutions } from '../../../packages/box-bounty/wait.js';
import { GitHubReadDeadlineReached, pages, useGitHubTransportForTests } from '../../../packages/box-bounty/gh.js';

interface Solution { pullRequest: number; commit: string; url: string; author: string }
type Result = Awaited<ReturnType<typeof waitForSolutions>>;
interface Dependencies { now: () => number; sleep: (ms: number, signal: AbortSignal) => Promise<void>; read: () => Solution[]; signal: AbortSignal }
const loop = (options: { id: string; timeoutSeconds: number; pollSeconds?: number; seen: { n: number; commit: string }[] }, deps: Dependencies): Promise<Result> =>
  waitForSolutions(options, deps);
const solution: Solution = { pullRequest: 7, commit: 'a'.repeat(40), url: 'https://github.com/owner/project/pull/7', author: 'solver' };

describe('PF6 bounded observation loop', () => {
  it('times out when the read transport spends the deadline without retrying', async () => {
    let now = 0;
    const result = await loop({ id: 'bt-test', timeoutSeconds: 1, seen: [] }, {
      now: () => now, sleep: async () => { throw new Error('must not sleep'); },
      read: () => { now = 1000; throw new GitHubReadDeadlineReached(); }, signal: new AbortController().signal
    });
    expect(result).toMatchObject({ outcome: 'timeout', polls: 1, solutions: [] });
  });
  it.each(['before selection', 'after selection', 'after failure'])('starts no request past the deadline %s', phase => {
    let now = phase === 'before selection' ? 1000 : 0;
    const clock = vi.spyOn(Date, 'now');
    if (phase === 'after selection') clock.mockReturnValueOnce(0).mockReturnValue(1000);
    else clock.mockImplementation(() => now);
    const calls: string[][] = [];
    useGitHubTransportForTests((_root, args) => {
      calls.push([...args]); now = 1000;
      return { status: 1, stderr: 'HTTP 429 rate limit exceeded' };
    });
    try {
      const read = () => pages('.', 'repos/owner/project/pulls', { readOnly: true, deadline: 1000 });
      if (phase === 'after failure') expect(read).toThrow(expect.objectContaining({ reason: 'github-rate-limited' }));
      else expect(read).toThrow(GitHubReadDeadlineReached);
      expect(calls).toHaveLength(phase === 'after failure' ? 1 : 0);
      expect(calls.flat()).not.toContain('rate_limit');
    } finally { clock.mockRestore(); useGitHubTransportForTests(null); }
  });
  it.each([
    { reason: 'github-rate-limited', answer: { status: 1, stderr: 'HTTP 429 rate limit exceeded' } },
    { reason: 'github-unreachable', answer: { status: null, error: new Error('request failed') } },
    { reason: 'github-unavailable', answer: { status: 1, stderr: 'HTTP 503 unavailable' } }
  ])('refuses a started request that fails past the deadline: $reason', async ({ reason, answer }) => {
    let now = 0; let calls = 0;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    useGitHubTransportForTests(() => { calls++; now = 2000; return answer; });
    try {
      await expect(loop({ id: 'bt-test', timeoutSeconds: 1, seen: [] }, {
        now: () => now, sleep: async () => { throw new Error('must not sleep'); },
        read: () => { pages('.', 'repos/owner/project/pulls', { readOnly: true, deadline: 1000 }); return []; },
        signal: new AbortController().signal
      })).rejects.toMatchObject({ reason });
      expect(calls).toBe(1);
    } finally { clock.mockRestore(); useGitHubTransportForTests(null); }
  });
  it('returns an unseen head immediately, including a moved head on a seen PR', async () => {
    const result = await loop({ id: 'bt-test', timeoutSeconds: 600, seen: [{ n: 7, commit: 'b'.repeat(40) }] }, {
      now: () => 0, sleep: async () => { throw new Error('must not sleep'); }, read: () => [solution], signal: new AbortController().signal
    });
    expect(result).toMatchObject({ outcome: 'solution', polls: 1, solutions: [solution], pollSeconds: 30, timeoutSeconds: 600 });
    const text = renderWait(result);
    expect(text).toContain('omakase-box look bt-test <number> collects a first version or shows the latest collected version');
    expect(text).toContain('omakase-box apply bt-test <number> checks the head and collects a moved version without merging');
    expect(text).toContain('apply can merge if the head is unchanged.');
  });
  it('ignores seen heads and returns an arrival on a later poll', async () => {
    let now = 0; let reads = 0;
    const sleeps: number[] = [];
    const result = await loop({ id: 'bt-test', timeoutSeconds: 60, seen: [{ n: 6, commit: solution.commit }] }, {
      now: () => now, sleep: async ms => { sleeps.push(ms); now += ms; },
      read: () => ++reads === 1 ? [{ ...solution, pullRequest: 6 }] : [solution], signal: new AbortController().signal
    });
    expect(result).toMatchObject({ outcome: 'solution', polls: 2, endedAt: '1970-01-01T00:00:30.000Z' });
    expect(sleeps).toEqual([30000]);
  });
  it('shortens the last sleep to the deadline without a poll at the deadline', async () => {
    let now = 0;
    const sleeps: number[] = [];
    const result = await loop({ id: 'bt-test', timeoutSeconds: 31, seen: [] }, {
      now: () => now, sleep: async ms => { sleeps.push(ms); now += ms; }, read: () => [], signal: new AbortController().signal
    });
    expect(result).toMatchObject({ outcome: 'timeout', polls: 2, solutions: [], endedAt: '1970-01-01T00:00:31.000Z' });
    expect(sleeps).toEqual([30000, 1000]);
  });
  it('stops on the first upstream error and never sleeps or retries', async () => {
    let reads = 0;
    await expect(loop({ id: 'bt-test', timeoutSeconds: 600, seen: [] }, {
      now: () => 0, sleep: async () => { throw new Error('must not sleep'); },
      read: () => { reads++; throw new Error('untrusted upstream text'); }, signal: new AbortController().signal
    })).rejects.toMatchObject({ reason: 'wait-upstream-unreadable' });
    expect(reads).toBe(1);
  });
  it('cancels before reading or during sleep with a named outcome', async () => {
    for (const before of [true, false]) {
      const abort = new AbortController();
      if (before) abort.abort();
      let reads = 0;
      const result = await loop({ id: 'bt-test', timeoutSeconds: 600, seen: [] }, {
        now: () => 0, sleep: async () => { abort.abort(); }, read: () => { reads++; return []; }, signal: abort.signal
      });
      expect(result).toMatchObject({ outcome: 'cancelled', solutions: [], polls: before ? 0 : 1 });
      expect(reads).toBe(before ? 0 : 1);
    }
  });
  it.each([new Error('reader failed'), new bounty.BountyRefused('github-unreachable', 'reader failed')])('cancels if the reader throws after abort: %s', async error => {
    const abort = new AbortController();
    const result = await loop({ id: 'bt-test', timeoutSeconds: 600, seen: [] }, {
      now: () => 0, sleep: async () => { throw new Error('must not sleep'); },
      read: () => { abort.abort(); throw error; }, signal: abort.signal
    });
    expect(result).toMatchObject({ outcome: 'cancelled', polls: 1, solutions: [] });
  });
});

describe('PF6 moved-head next step', () => {
  it('status and look leave an old collected head; apply collects the moved head without merging', () => postedFixture(({ repo, bare, scratch, id, state, update }) => {
    const first = bounty.lookBounty(repo, id, 1);
    const solver = join(scratch, 'pf6-review');
    git(repo, ['clone', '--quiet', bare, solver]);
    git(solver, ['fetch', '--quiet', 'origin', 'refs/pull/1/head']);
    git(solver, ['checkout', '--quiet', 'FETCH_HEAD']);
    write(solver, 'app.txt', 'updated after review\n');
    git(solver, ['-c', 'user.name=solver', '-c', 'user.email=solver@test.invalid', 'commit', '-qam', 'update solution']);
    const second = git(solver, ['rev-parse', 'HEAD']);
    git(solver, ['push', '--quiet', 'origin', 'HEAD:refs/pull/1/head']);
    update({ prs: state().prs.map(pr => pr.number === 1 ? { ...pr, head: { sha: second } } : pr) });
    bounty.renderStatus(repo, { id });
    expect(bounty.lookBounty(repo, id, 1).attempt.commit).toBe(first.attempt.commit);
    const before = git(repo, ['rev-parse', 'HEAD']);
    expect(() => bounty.applyBounty(repo, id, 1)).toThrow(expect.objectContaining({ reason: 'pull-request-moved' }));
    expect(git(repo, ['rev-parse', 'HEAD'])).toBe(before);
    expect(bounty.lookBounty(repo, id, 1).attempt.commit).toBe(second);
  }));
});

const fields = watchFields('pf6-wait');
afterAll(fields.check);
const world = sharedPostedFixture({ prAuthor: 'solver' });
const settings = join(world.scratch, 'settings');
let api: ChildProcess; let board: ChildProcess; let apiFolder: string; let boardFolder: string; let apiBase: string; let boardBase: string;
const start = async (script: string, folder: string) => {
  const child = spawn(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), folder], { stdio: ['ignore', 'pipe', 'inherit'] });
  const base = await new Promise<string>(resolve => child.stdout!.once('data', chunk => resolve(`http://127.0.0.1:${/listening (\d+)/.exec(String(chunk))![1]}`)));
  return { child, base };
};
beforeAll(async () => {
  apiFolder = runRoot('pf6-api'); boardFolder = runRoot('pf6-board');
  writeFileSync(join(apiFolder, 'config.json'), '{}');
  writeFileSync(join(boardFolder, 'routes.json'), '{}');
  ({ child: api, base: apiBase } = await start('./api-standin.cjs', apiFolder));
  ({ child: board, base: boardBase } = await start('./board-standin.cjs', boardFolder));
});
afterAll(() => { api?.kill(); board?.kill(); });
const log = (folder: string): { method: string; path: string }[] => {
  const file = join(folder, 'requests.jsonl');
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
};
const configure = (extra: Record<string, unknown> = {}) => {
  world.update({ auth: false });
  writeFileSync(join(apiFolder, 'config.json'), JSON.stringify({ standin: join(world.bin, 'standin.cjs'), state: join(world.scratch, 'state.json'), bare: world.bare, remoteUrl: 'https://github.com/owner/project.git', ...extra }));
  writeFileSync(join(apiFolder, 'requests.jsonl'), ''); writeFileSync(join(boardFolder, 'requests.jsonl'), '');
};
const environment = (): NodeJS.ProcessEnv => world.run(() => ({ ...process.env, GH_TOKEN: 'pf6-dummy-token', BOX_BOUNTY_GITHUB_API_FOR_TESTS: apiBase, BOX_BOUNTY_WAIT_POLL_MS_FOR_TESTS: '10' }));
const box = (args: string[], extra: NodeJS.ProcessEnv = {}) => spawnSync(process.execPath, [CLI_DIST, 'status', ...args, '--repo', world.repo], { encoding: 'utf8', env: { ...environment(), ...extra }, timeout: 10000 });
const document = (run: ReturnType<typeof box>): Result => {
  expect(run.status, run.stdout + run.stderr).toBe(0);
  const value = JSON.parse(run.stdout) as Result;
  expect(run.stdout).toBe(JSON.stringify(value) + '\n');
  expect(run.stderr).toBe('');
  fields.see(value);
  return value;
};
const snapshot = (path: string): Record<string, string> => {
  if (!existsSync(path)) return {};
  const result: Record<string, string> = {};
  const visit = (folder: string, prefix: string) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const relative = `${prefix}${entry.name}`;
      if (entry.isDirectory()) { result[relative + '/'] = ''; visit(join(folder, entry.name), relative + '/'); }
      else result[relative] = createHash('sha256').update(readFileSync(join(folder, entry.name))).digest('hex');
    }
  };
  visit(path, ''); return result;
};
const localState = () => [snapshot(join(world.repo, '.box')), snapshot(join(world.repo, '.git')), snapshot(settings), snapshot(join(world.bare, 'refs'))];

describe('PF6 built status --wait', () => {
  it('reads unseen PRs in one poll without any local, ref, board or GitHub write', () => {
    world.run(() => {
      const path = join(settings, 'settings.json');
      writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), board: boardBase }));
      bounty.metaSet(world.repo, `board_hint:${world.id}:posted`, JSON.stringify({ repository: 'owner/project', issue: 1, bounty: world.id, event: 'posted' }));
      for (const key of bounty.metaKeys(world.repo, 'gh_probe:')) bounty.metaSet(world.repo, key, null);
      bounty.closeStores();
    });
    configure();
    const before = localState();
    const doc = document(box([world.id, '--wait', '--json']));
    expect(doc).toMatchObject({ schema: 'box-bounty/status-wait@1', id: world.id, outcome: 'solution', timeoutSeconds: 600, polls: 1 });
    expect(doc.solutions).toEqual([{ pullRequest: 1, commit: world.waitingPr, url: 'https://github.com/owner/project/pull/1', author: 'solver' }]);
    expect(Date.parse(doc.endedAt)).toBeGreaterThanOrEqual(Date.parse(doc.startedAt));
    expect(localState()).toEqual(before);
    expect(log(apiFolder).length).toBeGreaterThan(0);
    expect(log(apiFolder).every(request => request.method === 'GET')).toBe(true);
    expect(log(boardFolder)).toEqual([]);
    const text = box([world.id, '--wait']);
    expect(text.status, text.stderr).toBe(0);
    expect(text.stdout).toContain(`#1 ${world.waitingPr.slice(0, 12)} https://github.com/owner/project/pull/1`);
    expect(text.stdout).toContain(`next: omakase-box status ${world.id} shows them; omakase-box look ${world.id} <number> collects a first version or shows the latest collected version`);
    expect(text.stdout).toContain('apply can merge if the head is unchanged.');
    expect(localState()).toEqual(before);
    world.run(() => bounty.metaSet(world.repo, 'pf6-live-wal', 'read this without checkpointing'));
    const live = localState();
    const callsBefore = world.state().calls.length;
    document(box([world.id, '--wait', '--json'], { GH_TOKEN: '', GITHUB_TOKEN: '' }));
    expect(localState()).toEqual(live);
    const calls = world.state().calls.slice(callsBefore).filter(call => call[0] === 'api');
    expect(calls).toHaveLength(1);
    expect(calls.every(call => !call.includes('--input') && !call.includes('--method'))).toBe(true);
    expect(log(boardFolder)).toEqual([]);
    bounty.closeStores();
  });
  it('reports timeout in text and one JSON document, never marks the seen head again', () => {
    world.run(() => {
      const record = readRecord(world.repo, world.id);
      record.github!.seenPullRequests = [{ n: 1, commit: world.waitingPr, at: '2026-01-01T00:00:00Z' }];
      writeRecord(world.repo, record);
    });
    configure();
    const before = localState();
    const doc = document(box([world.id, '--wait', '--timeout', '1', '--json']));
    expect(doc).toMatchObject({ outcome: 'timeout', timeoutSeconds: 1, solutions: [] });
    expect(Date.parse(doc.endedAt) - Date.parse(doc.startedAt)).toBeGreaterThanOrEqual(1000);
    const text = box([world.id, '--wait', '--timeout', '1']);
    expect(text.status).toBe(0);
    expect(text.stdout).toContain('no solution arrived within 1 s');
    expect(text.stdout).toContain('nothing changed');
    expect(localState()).toEqual(before);
  });
  it('refuses upstream failures and malformed PRs immediately without retries or state writes', () => {
    for (const failure of [{ status: 503, body: '{}' }, { status: 200, body: '[{"number":1}]' }]) {
      configure({ failure: { on: '/pulls?', ...failure } });
      const before = localState();
      const run = box([world.id, '--wait', '--json']);
      expect(run.status, run.stderr).toBe(3);
      expect(JSON.parse(run.stdout)).toMatchObject({ schema: 'box-bounty/refusal@1', refused: failure.status === 200 ? 'github-response-invalid' : 'github-unavailable', exitCode: 3 });
      expect(log(apiFolder).filter(request => request.path.includes('/pulls?'))).toHaveLength(1);
      expect(localState()).toEqual(before);
    }
  });
  it.each(process.platform === 'win32' ? ['console signal relay'] : ['native signal', 'console signal relay'])('cancels the spawned CLI with SIGINT through %s, one named document and exit 130', async delivery => {
    configure();
    const relay = delivery === 'console signal relay';
    const env = environment();
    if (relay) {
      const preload = join(apiFolder, 'signal.cjs').replaceAll('\\', '/');
      writeFileSync(preload, "process.on('message', signal => { if (signal === 'SIGINT') process.emit('SIGINT'); });\n");
      env['NODE_OPTIONS'] = `${env['NODE_OPTIONS'] ?? ''} --require ${JSON.stringify(preload)}`;
    }
    const before = localState();
    const child = spawn(process.execPath, [CLI_DIST, 'status', world.id, '--wait', '--json', '--repo', world.repo], { env, stdio: ['ignore', 'pipe', 'pipe', ...(relay ? ['ipc' as const] : [])] });
    let stdout = ''; let stderr = '';
    child.stdout!.on('data', chunk => { stdout += chunk; }); child.stderr!.on('data', chunk => { stderr += chunk; });
    const exited = new Promise<number | null>(resolve => child.once('exit', resolve));
    const deadline = Date.now() + 5000;
    while (!log(apiFolder).some(request => request.path.includes('/pulls?')) && child.exitCode === null && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    if (relay) child.send('SIGINT');
    else child.kill('SIGINT');
    expect(await exited, stderr).toBe(130);
    const doc = JSON.parse(stdout) as Result;
    expect(stdout).toBe(JSON.stringify(doc) + '\n');
    expect(doc).toMatchObject({ outcome: 'cancelled', solutions: [] }); fields.see(doc);
    expect(localState()).toEqual(before);
  });
  it('rejects invalid combinations and timeout spellings as usage before reads', () => {
    configure();
    for (const args of [['--wait'], [world.id, '--timeout', '1'], ...['0', '3601', '1.5', '-1', 'abc'].map(value => [world.id, '--wait', '--timeout', value]), ...['--full', '--comments', '--since'].map(flag => [world.id, '--wait', flag, ...(flag === '--since' ? ['2026-01-01'] : [])])]) {
      const run = box([...args, '--json']);
      expect(run.status, `${args}: ${run.stdout} ${run.stderr}`).toBe(2);
      expect(JSON.parse(run.stdout)).toMatchObject({ refused: 'usage', exitCode: 2 });
    }
    expect(log(apiFolder)).toEqual([]); expect(log(boardFolder)).toEqual([]);
  });
  it('names unknown, draft, ended and taken bounties without reading GitHub', () => {
    configure();
    expect(JSON.parse(box(['bt-000000000000', '--wait', '--json']).stdout)).toMatchObject({ refused: 'unknown-bounty' });
    world.run(() => {
      const record = readRecord(world.repo, world.id);
      const original = structuredClone(record);
      record.stage = 'drafted'; delete record.github; delete record.reward; writeRecord(world.repo, record);
      expect(JSON.parse(box([world.id, '--wait', '--json']).stdout)).toMatchObject({ refused: 'wait-not-posted' });
      original.stage = 'withdrawn'; writeRecord(world.repo, original);
      expect(JSON.parse(box([world.id, '--wait', '--json']).stdout)).toMatchObject({ refused: 'wait-bounty-ended' });
      mkdirSync(join(settings, 'taken'), { recursive: true });
      writeFileSync(join(settings, 'taken', `${world.id}.json`), JSON.stringify({ id: world.id, repository: 'owner/project', stage: 'taken' }));
      expect(JSON.parse(box([world.id, '--wait', '--json']).stdout)).toMatchObject({ refused: 'taken-status-options' });
    });
    expect(log(apiFolder)).toEqual([]); expect(log(boardFolder)).toEqual([]);
  });
});
