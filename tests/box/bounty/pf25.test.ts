// PF25: `take` starts an attempt safely, and says so to everyone. Against the stand-in GitHub (a bare remote for the
// repository, a second one for the solver's fork) and PF5's stand-in board for the bounty's public detail.
import childProcess, { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { allowRepository, changeConfig, closeTaken, loadSettings, loadTaken, takeBounty } from '../../../packages/box-bounty/index.js';
import { postedFixture } from './github-fixture.js';
import { git, runRoot } from './support.js';

const STANDIN = fileURLToPath(new URL('./board-standin.cjs', import.meta.url));
let folder: string;
let board: string;
let server: ChildProcess;
const routes = (next: Record<string, { status: number; body: unknown }>) => writeFileSync(join(folder, 'routes.json'), JSON.stringify(next));

beforeAll(async () => {
  folder = runRoot('pf25-board');
  mkdirSync(folder, { recursive: true });
  server = spawn(process.execPath, [STANDIN, folder], { stdio: ['ignore', 'pipe', 'inherit'] });
  board = await new Promise<string>(done => server.stdout!.once('data', chunk => done(`http://127.0.0.1:${/listening (\d+)/.exec(String(chunk))![1]}`)));
});
afterAll(() => { server.kill(); });
beforeEach(() => { writeFileSync(join(folder, 'requests.jsonl'), ''); routes({}); });

/** The board lists the posted bounty as it stands on the bare remote. */
const listed = (bare: string, id: string, over: Record<string, unknown> = {}) => {
  const base = git(bare, ['rev-parse', `refs/heads/box-bounty/${id}`]);
  routes({ [`/bounties/${id}.json`]: { status: 200, body: { bounty: { id, state: 'open', reward: { amount: 45 }, pays_on_merge: true, owner: { login: 'owner' }, repository: { name: 'owner/project' }, answer: { branch: `box-bounty/${id}`, base_commit: base }, ...over } } } });
  return base;
};
const allowSolving = (mode = 'allowed') => { changeConfig(null, 'set', 'board', board); changeConfig(null, 'set', 'solving', mode); };
const ghCalls = (state: { calls: string[][] }) => state.calls.filter(call => call[0] === 'api').map(call => call.slice(call.indexOf('--hostname') + 2).join(' '));

describe('take', { timeout: 120000 }, () => {
  it('with solving off, or a bounty outside the owner\'s limits, refuses by name and asks GitHub nothing', () => postedFixture(({ bare, id, state }) => {
    changeConfig(null, 'set', 'board', board);
    listed(bare, id);
    expect(() => takeBounty(id)).toThrow(expect.objectContaining({ reason: 'solving-off' }));
    changeConfig(null, 'set', 'solving', 'allowed');
    changeConfig(null, 'set', 'solving-floor', '50');
    expect(() => takeBounty(id)).toThrow(expect.objectContaining({ reason: 'outside-owner-limits', message: expect.stringContaining('below the owner\'s $50 floor') }));
    changeConfig(null, 'set', 'solving-floor', '0');
    changeConfig(null, 'add', 'solving-skip', 'owner/project');
    expect(() => takeBounty(id)).toThrow(expect.objectContaining({ reason: 'outside-owner-limits', message: expect.stringContaining('never takes from owner/project') }));
    expect(ghCalls(state())).toEqual([]);
  }));

  it('on a repository the solver can push to: no fork; an empty start commit on the bounty branch, pushed; a draft opened at once', () => postedFixture(({ bare, id, state, repo }) => {
    allowSolving();
    const base = listed(bare, id);
    const result = takeBounty(id);
    expect(result.kind).toBe('taken');
    if (result.kind !== 'taken') return;
    const calls = ghCalls(state());
    expect(calls.some(call => call.includes('/forks'))).toBe(false);
    // The branch on GitHub: one empty commit on the bounty's base, by the solver's GitHub login.
    const pushed = git(bare, ['rev-parse', `refs/heads/box-solve/${id}`]);
    expect(git(bare, ['rev-parse', `${pushed}^`])).toBe(base);
    expect(git(bare, ['diff', '--stat', base, pushed])).toBe('');
    expect(git(bare, ['log', '-1', '--format=%an <%ae>', pushed])).toBe('owner <owner@users.noreply.github.com>');
    const draft = state().prs.at(-1)!;
    expect(draft).toMatchObject({ draft: true, title: `Attempt on bounty ${id}`, base: { ref: `box-bounty/${id}` } });
    // The workspace: a new folder outside the owner's repository, on the bounty branch, holding none of the owner's settings.
    const workspace = result.taken.workspace!;
    expect(workspace.startsWith(tmpdir())).toBe(true);
    expect(workspace.startsWith(repo)).toBe(false);
    expect(git(workspace, ['rev-parse', 'HEAD'])).toBe(pushed);
    expect(readdirSync(workspace).some(name => /settings|state|discover/.test(name))).toBe(false);
    expect(loadTaken(id)).toMatchObject({ stage: 'taken', target: 'owner/project', pullRequest: { number: draft.number } });
    expect(result.lines.join('\n')).toContain('the tool ran nothing from this repository');
    expect(result.lines.join('\n')).toContain('this machine stays signed in to GitHub; it cannot stop an agent reaching that sign-in');
    // The account taking it posted it: said, since such a merge is not counted.
    expect(result.lines.join('\n')).toContain('was posted by owner, the account taking it');
  }));

  it('on a repository the solver cannot push to: the fork gets the branch, never the poster\'s repository', () => postedFixture(({ bare, id, update, state, scratch }) => {
    allowSolving();
    listed(bare, id);
    update({ push: false, account: 'solver1' });
    git(scratch, ['init', '--quiet', '--bare', join(scratch, 'fork.git')]);
    const result = takeBounty(id);
    expect(ghCalls(state()).some(call => call.startsWith('repos/owner/project/forks'))).toBe(true);
    expect(git(join(scratch, 'fork.git'), ['for-each-ref', '--format=%(refname)'])).toBe(`refs/heads/box-solve/${id}`);
    // The poster's repository holds no branch of the solver's.
    expect(git(bare, ['for-each-ref', '--format=%(refname)', 'refs/heads/box-solve/'])).toBe('');
    expect(state().prs.at(-1)).toMatchObject({ draft: true, base: { ref: `box-bounty/${id}` } });
    expect(result.kind === 'taken' && result.taken.target).toBe('solver1/project');
    expect(result.lines.join('\n')).not.toContain('the account taking it');
  }));

  it('runs nothing from the repository: a filter the bounty branch asks for never runs on the clone, and only git and gh are started', () => postedFixture(({ bare, id, scratch }) => {
    allowSolving();
    // The bounty branch asks for a filter; this machine's own Git configuration defines one that would leave a mark.
    const marker = join(scratch, 'filter-ran');
    const author = join(scratch, 'author');
    git(scratch, ['clone', '--quiet', '--branch', `box-bounty/${id}`, bare, author]);
    writeFileSync(join(author, '.gitattributes'), '* filter=evil\n');
    git(author, ['add', '.gitattributes']);
    git(author, ['-c', 'user.name=t', '-c', 'user.email=t@t.invalid', 'commit', '-qm', 'ask for a filter']);
    git(author, ['push', '--quiet', 'origin', `HEAD:refs/heads/box-bounty/${id}`]);
    listed(bare, id);
    // The filter is a script file, so Git's config quoting cannot break it: it passes the bytes through and leaves a mark.
    const script = join(scratch, 'evil.cjs');
    writeFileSync(script, `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran'); process.stdin.pipe(process.stdout);\n`);
    const global = join(scratch, 'gitconfig');
    writeFileSync(global, `[filter "evil"]\n\tsmudge = node ${script.replaceAll('\\', '/')}\n\tclean = cat\n[user]\n\tname = t\n\temail = t@t.invalid\n`);
    const started: string[] = [];
    const original = childProcess.spawnSync;
    const previous = process.env['GIT_CONFIG_GLOBAL'];
    process.env['GIT_CONFIG_GLOBAL'] = global;
    childProcess.spawnSync = new Proxy(original, { apply(target, receiver, args) { started.push(String(args[0])); return Reflect.apply(target, receiver, args); } });
    syncBuiltinESMExports();
    try {
      const result = takeBounty(id);
      expect(result.kind).toBe('taken');
      // The bytes as committed (line endings aside: the system's own Git may convert them, which runs no program).
      if (result.kind === 'taken') expect(readFileSync(join(result.taken.workspace!, 'app.txt'), 'utf8').replace(/\r\n/g, '\n')).toBe('broken\n');
    } finally {
      childProcess.spawnSync = original;
      syncBuiltinESMExports();
      if (previous === undefined) delete process.env['GIT_CONFIG_GLOBAL']; else process.env['GIT_CONFIG_GLOBAL'] = previous;
    }
    expect(existsSync(marker)).toBe(false);
    // git, gh (the stand-in runs as node), the board's own reader (node), and cmd.exe for a gh command file on Windows.
    expect(started.filter(program => !/(?:^|[\\/])(?:git|gh|node|cmd)(?:\.exe)?$/i.test(program))).toEqual([]);
  }));

  it('ask each time: it waits on the owner; the owner\'s yes on that one bounty lets it through once', () => postedFixture(({ bare, id, state }) => {
    allowSolving('ask');
    listed(bare, id);
    const waiting = takeBounty(id);
    expect(waiting.kind).toBe('waiting');
    expect(waiting.lines.join('\n')).toContain(`To allow this one bounty: box bounty allow ${id}`);
    expect(ghCalls(state())).toEqual([]);
    expect(allowRepository(null, id)).toContain('allowed once');
    expect(loadSettings().solving?.approved).toEqual([id]);
    expect(takeBounty(id).kind).toBe('taken');
    expect(loadSettings().solving?.approved).toEqual([]);
  }));

  it('close on a taken bounty closes the draft and withdraws the attempt; taking it again is refused while it stands', () => postedFixture(({ bare, id, state }) => {
    allowSolving();
    listed(bare, id);
    const result = takeBounty(id);
    if (result.kind !== 'taken') throw new Error('not taken');
    expect(() => takeBounty(id)).toThrow(expect.objectContaining({ reason: 'already-taken' }));
    expect(closeTaken(id)).toContain(`draft #${result.taken.pullRequest!.number} closed`);
    expect(state().prs.find(pr => pr.number === result.taken.pullRequest!.number)).toMatchObject({ state: 'closed' });
    expect(loadTaken(id)?.stage).toBe('withdrawn');
    expect(closeTaken(id)).toContain('already withdrawn');
  }));

  it('a bounty the board no longer lists as open, or whose branch moved, is refused by name', () => postedFixture(({ bare, id }) => {
    allowSolving();
    listed(bare, id, { state: 'closed-none' });
    expect(() => takeBounty(id)).toThrow(expect.objectContaining({ reason: 'bounty-not-open' }));
    listed(bare, id, { answer: { branch: `box-bounty/${id}`, base_commit: 'b'.repeat(40) } });
    expect(() => takeBounty(id)).toThrow(expect.objectContaining({ reason: 'bounty-branch-moved' }));
    expect(() => takeBounty('not-an-id')).toThrow(expect.objectContaining({ reason: 'bounty-id-invalid' }));
  }));
});
