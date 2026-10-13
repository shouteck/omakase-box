import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allowBounty, allowRepository, changeConfig, closeBounty, denyRepository, finalizeBounty, loadRecord, loadSettings, planBounty, postBounty, readDecision, renderConfig, renderStatus, renderSummary, settingsFile } from '../../../packages/box-bounty/index.js';
import { CLI_DIST, git, makeRepo, runRoot, write } from './support.js';
import { fixture, postedFixture, refused, withoutGh } from './github-fixture.js';

function repo(address = 'owner/project'): string {
  const root = makeRepo({ 'app.txt': 'broken\n', 'TASK.md': 'repair it\n' });
  git(root, ['remote', 'add', 'origin', `https://github.com/${address}${address.toLowerCase().endsWith('.git') ? '' : '.git'}`]);
  return root;
}
function draft(root: string) {
  return finalizeBounty(planBounty({ repoPath: root, taskPath: join(root, 'TASK.md'), why: 'another pair of eyes', title: 'repair', outDir: join(runRoot('BT8a-out'), 'bounty') }));
}
const cli = (root: string, ...args: string[]) => spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args], { cwd: root, encoding: 'utf8', env: process.env, timeout: 30000 });
const saved = () => existsSync(settingsFile()) ? readFileSync(settingsFile(), 'utf8') : null;
const oldLevel = (bounty: string) => ({ bounty, at: '2026-10-13T00:00:00.000Z', changes: [] });

describe('repository authority replaces path authority', () => {
  it('covers copies and canonical case/.git, remote names can change, and a fork or path replacement gets no yes', () => {
    const root = repo();
    allowRepository(root);
    expect(readDecision(repo('OWNER/PROJECT.git'))).toMatchObject({ decision: 'allowed', level: 'project' });
    git(root, ['remote', 'rename', 'origin', 'renamed']);
    expect(readDecision(root).decision).toBe('allowed');
    expect(readDecision(repo('fork/project')).decision).toBeNull();
    git(root, ['remote', 'set-url', 'renamed', 'https://github.com/owner/replacement.git']);
    expect(readDecision(root).decision).toBeNull();
  });
  it('a different second remote and an edited push destination cannot borrow a yes', () => {
    const root = repo();
    allowRepository(root);
    const before = saved();
    git(root, ['remote', 'add', 'second', 'https://github.com/fork/project.git']);
    refused(() => allowRepository(root), 'repository-address-ambiguous');
    expect(saved()).toBe(before);
    git(root, ['remote', 'remove', 'second']);
    git(root, ['remote', 'set-url', '--push', 'origin', 'https://github.com/other/project.git']);
    refused(() => readDecision(root), 'github-remote-mismatch');
    expect(saved()).toBe(before);
  });
  it('URL rewrites to another destination refuse, same-address protocol/case rewrites work', () => {
    const root = repo();
    allowRepository(root);
    git(root, ['config', 'url.https://github.com/other/project.git.insteadOf', 'https://github.com/owner/project.git']);
    refused(() => readDecision(root), 'repository-destination-mismatch');
    git(root, ['config', '--unset', 'url.https://github.com/other/project.git.insteadOf']);
    git(root, ['config', 'url.git@github.com:OWNER/PROJECT.git.insteadOf', 'https://github.com/owner/project.git']);
    expect(readDecision(root).decision).toBe('allowed');
  });
  it('allows an explicit address outside its checkout and refuses missing addresses and lookalikes without writes', () => {
    const root = repo();
    allowRepository(null, 'owner/shop');
    expect(readDecision(repo('owner/shop')).decision).toBe('allowed');
    const before = saved();
    for (const name of ['junk', 'github.example/owner/shop', 'https://github.com.example/owner/shop', 'owner/shop extra']) {
      refused(() => allowRepository(root, name), 'repository-address-invalid');
      refused(() => denyRepository(root, name), 'repository-address-invalid');
    }
    refused(() => allowRepository(makeRepo({ 'a': 'a' })), 'repository-address-required');
    refused(() => denyRepository(root, 'owner/missing'), 'repository-not-listed');
    expect(saved()).toBe(before);
  });
  it('deny retains history, removes the active entry, blocks a blanket default, and re-allow clears the exception', () => {
    const root = repo();
    allowRepository(root);
    changeConfig(root, 'set', 'all-projects', 'true');
    const { id } = draft(root);
    denyRepository(root);
    expect(loadRecord(root, id).stage).toBe('drafted');
    expect(readDecision(root)).toMatchObject({ decision: null, denied: true });
    expect(renderConfig(root)).toContain('repositories: 0 active');
    expect(renderStatus(root)).toContain('this repository is no longer allowed; denied at');
    expect(loadSettings().repositories['owner/project']?.changes.map(entry => entry.bounty)).toEqual(['allowed']);
    allowRepository(root);
    expect(readDecision(root).decision).toBe('allowed');
    expect(loadSettings().repositories['owner/project']?.changes.map(entry => entry.bounty)).toEqual(['allowed', null]);
  });
});

describe('one-time legacy settings migration', () => {
  it('moves a readable path once to its address and retains the legacy default without widening it', () => {
    const root = repo();
    writeFileSync(settingsFile(), JSON.stringify({ kind: 'box-owner-settings', default: oldLevel('ask'), projects: { [root]: oldLevel('allowed') } }));
    expect(readDecision(root).decision).toBe('allowed');
    expect(readDecision(repo('owner/elsewhere')).decision).toBe('ask');
    expect(saved()).not.toContain('"projects"');
    expect(renderConfig(root)).toContain('moved to owner/project');
    const once = saved();
    loadSettings();
    expect(saved()).toBe(once);
  });
  it('conflicting old copies require a new decision even with a permissive default', () => {
    const root = repo(), copy = repo();
    writeFileSync(settingsFile(), JSON.stringify({ kind: 'box-owner-settings', default: oldLevel('allowed'), projects: { [root]: oldLevel('allowed'), [copy]: oldLevel('ask') } }));
    expect(readDecision(root)).toMatchObject({ decision: null, denied: true });
    expect(readDecision(copy).decision).toBeNull();
    expect(renderConfig(root)).toContain('conflicting old decisions; not allowed');
    allowRepository(root);
    expect(readDecision(copy).decision).toBe('allowed');
  });
  it('unreadable and ambiguous paths are consumed with a re-add command and do not inherit a permissive default', () => {
    const missing = join(runRoot('BT8a-missing'), 'gone'), root = repo();
    git(root, ['remote', 'add', 'other', 'https://github.com/other/project.git']);
    writeFileSync(settingsFile(), JSON.stringify({ kind: 'box-owner-settings', default: oldLevel('allowed'), projects: { [root]: oldLevel('ask'), [missing]: oldLevel('allowed') } }));
    expect(loadSettings().migrations).toHaveLength(2);
    expect(renderConfig(root)).toContain('no permission moved');
    git(root, ['remote', 'remove', 'other']);
    expect(readDecision(root).decision).toBeNull();
    expect(saved()).not.toContain('"projects"');
    allowRepository(root);
    expect(readDecision(root).decision).toBe('allowed');
  });
});

describe('the three owner words through the built CLI', () => {
  it.each(['setup', 'allow', 'ask', 'off', 'on', 'answer', 'summary'])('old owner %s is refused before settings or GitHub calls', verb => {
    const root = repo();
    const before = saved();
    const run = cli(root, 'owner', verb);
    expect(run.status).toBe(3);
    expect(run.stderr).toContain('command-removed');
    expect(run.stderr).toContain('use box bounty');
    expect(saved()).toBe(before);
  });
  it('stray arguments and unknown or hard-stop settings are named refusals with no write', () => {
    const root = repo();
    for (const args of [['allow', 'owner/project', 'stray'], ['allow', '--yes'], ['deny', 'junk'], ['config', 'set', 'unknown', 'true'], ['config', 'set', 'never-ship', 'false']]) {
      const run = cli(root, ...args);
      expect(run.status).toBe(3);
      expect(run.stderr).toContain('refused');
      expect(saved()).toBeNull();
    }
  });
  it('config names all settings, shows what is undecided and gives working changes', () => {
    const root = repo();
    const shown = cli(root, 'config');
    expect(shown.status).toBe(0);
    expect(shown.stdout).toContain('all-projects: false (off by default), nothing written');
    expect(shown.stdout).toContain('not decided yet: no repository permission');
    expect(shown.stdout).toContain('box bounty allow owner/project --ask');
    expect(shown.stdout).toContain('merging is not gated');
    expect(cli(root, 'config', 'add', 'repositories', 'owner/shop').status).toBe(0);
    expect(readDecision(repo('owner/shop')).decision).toBe('allowed');
    expect(cli(root, 'allow', '--ask').status).toBe(0);
    expect(readDecision(root).decision).toBe('ask');
    expect(cli(root, 'config', 'remove', 'repositories', 'owner/shop').status).toBe(0);
    expect(readDecision(repo('owner/shop')).decision).toBeNull();
  });
});

it('waiting exits 0, keeps the first time, and permission is read before any gh call', () => fixture(({ repo: root, id, scratch, state }) => {
  writeFileSync(join(scratch, 'settings', 'settings.json'), JSON.stringify({ kind: 'box-owner-settings', projects: {} }));
  withoutGh(() => {
    const first = cli(root, 'post', id, '--to', 'github');
    expect(first.status).toBe(0);
    expect(first.stderr).toBe('');
    expect(first.stdout.split('\n')[0]).toContain('waiting for the owner');
    expect(first.stdout).toContain('Bounties are public under their GitHub account');
    expect(first.stdout).toContain('A solution you choose is merged into their code');
    expect(first.stdout).toContain('this repository only');
    const at = loadRecord(root, id).waiting?.at;
    const again = cli(root, 'post', id, '--to', 'github');
    expect(again.status).toBe(0);
    expect(loadRecord(root, id).waiting?.at).toBe(at);
    expect(state().calls).toEqual([]);
  });
}));

it('closing a waiting bounty twice stays a named terminal outcome', () => {
  const root = repo(), { id } = draft(root);
  expect(cli(root, 'post', id, '--to', join(runRoot('BT8a-inbox'), 'inbox')).status).toBe(0);
  expect(closeBounty(root, id).outcome).toBe('withdrawn');
  const again = cli(root, 'close', id);
  expect(again.status).toBe(0);
  expect(again.stdout).toContain('already ended');
  expect(again.stdout).toContain('the job it came from: repair');
});

it('a previous one-bounty choice is visible on the next held post', () => {
  const root = repo(), first = draft(root);
  refused(() => postBounty(root, first.id, join(runRoot('BT8a-once'), 'inbox')), 'owner-allow-needed');
  allowBounty(root, first.id);
  const second = draft(root);
  try { postBounty(root, second.id, join(runRoot('BT8a-once'), 'inbox')); expect.unreachable('post must wait'); }
  catch (error) { expect(error).toMatchObject({ reason: 'owner-allow-needed' }); expect(String(error)).toContain('previously chose this one bounty only'); }
  expect(readDecision(root).decision).toBeNull();
});

it('GitHub account and API calls pin github.com despite a different GH_HOST', () => fixture(({ repo: root, id, state }) => {
  const before = process.env.GH_HOST;
  process.env.GH_HOST = 'another.example';
  try { postBounty(root, id, 'github'); }
  finally { if (before === undefined) delete process.env.GH_HOST; else process.env.GH_HOST = before; }
  const calls = state().calls.filter(args => args[0] === 'api' || args[0] === 'auth');
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.every(args => args[args.indexOf('--hostname') + 1] === 'github.com')).toBe(true);
}));

it('legacy tool-written owner spellings are scrubbed on every replay field and history', () => postedFixture(({ repo: root, id }) => {
  const path = join(root, '.box', 'bounties', id + '.json');
  const record = JSON.parse(readFileSync(path, 'utf8'));
  record.github.pending = `waiting-owner: box bounty owner answer ${id}; box bounty owner setup`;
  record.github.outside = { at: '2026-10-13T00:00:00.000Z', issueState: 'open', answers: 'box bounty owner setup; box bounty owner allow; box bounty owner ask; box bounty owner off; box bounty owner on; box bounty owner summary; box bounty owner answer ' + id };
  for (const verb of ['setup', 'allow', 'ask', 'off', 'on', 'answer', 'summary']) record.events.push({ stage: 'posted', at: '2026-10-13T00:00:00.000Z', command: 'owner ' + verb });
  record.events.push({ stage: 'confirmed', at: '2026-10-13T00:00:00.000Z', command: 'confirm' });
  writeFileSync(path, JSON.stringify(record));
  withoutGh(() => {
    const status = renderStatus(root, { full: true });
    expect(status).not.toContain('box bounty owner ');
    expect(status).not.toContain('"command":"owner ');
    expect(status).not.toContain('"command":"confirm"');
    expect(status).toContain('box bounty allow ' + id);
  });
}));

it('ask covers publishing only; allowing a waiting bounty posts directly and closes without another question', () => fixture(({ repo: root, id, state, bare }) => {
  allowRepository(root, undefined, true);
  refused(() => postBounty(root, id, 'github'), 'owner-answer-needed');
  expect(allowBounty(root, id)).toContain('answered once');
  expect(state().issues).toHaveLength(1);
  closeBounty(root, id, 'no solution');
  expect(loadRecord(root, id).waiting).toBeUndefined();
  expect(state().issues[0]?.state).toBe('closed');
  expect(git(bare, ['branch', '--list', 'box-bounty/*'])).toBe('');
  refused(() => allowBounty(root, id), 'owner-answer-not-waiting');
  expect(renderSummary(root)).toContain('bounties posted: 1');
  expect(renderSummary(root, '2999-01-01')).toContain('bounties posted: 0');
}));

it('a stranger merge notice names the commit once per repository and status retains it', () => postedFixture(({ repo: root, id, waitingPr }) => {
  const first = cli(root, 'apply', id, '1');
  expect(first.status).toBe(0);
  expect(first.stdout).toContain('Tell the owner in your closing message');
  expect(first.stdout).toContain('a solution written by someone outside was merged');
  const merge = git(root, ['rev-parse', 'HEAD']);
  expect(first.stdout).toContain(merge);
  expect(git(root, ['merge-base', '--is-ancestor', waitingPr, 'HEAD'])).toBe('');
  expect(cli(root, 'apply', id, '1').stdout).not.toContain('Tell the owner');
  expect(renderStatus(root)).toContain(`first outside solution merged in owner/project: commit ${merge}`);
  expect(loadSettings().firstMerges['owner/project']?.commit).toBe(merge);
}, { prAuthor: 'solver' }));
