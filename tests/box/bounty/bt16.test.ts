import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allowRepository, denyRepository, finalizeBounty, loadRecord, loadSettings, planBounty, postBounty, readDecision, renderConfig, renderStatus, settingsFile, writeDecision } from '../../../packages/box-bounty/index.js';
import { repositoryIdentity, requireRepository } from '../../../packages/box-bounty/settings.js';
import { CLI_DIST, git, makeRepo } from './support.js';
import { githubRepository, refused } from './github-fixture.js';

// BT16: a checkout with several GitHub remotes — the fork workflow and the
// mirror — resolves through the owner's list of allowed repositories. A yes
// still covers exactly one repository; non-GitHub remotes are ignored, and a
// checkout the list cannot settle waits or refuses by name.
function fork(): string {
  const root = makeRepo({ 'app.txt': 'broken\n', 'TASK.md': 'repair it\n' });
  git(root, ['remote', 'add', 'origin', 'https://github.com/me/project.git']);
  git(root, ['remote', 'add', 'upstream', 'https://github.com/owner/project.git']);
  return root;
}
function draft(root: string) {
  return finalizeBounty(planBounty({ repoPath: root, taskPath: join(root, 'TASK.md'), why: 'another pair of eyes', title: 'repair' }));
}
const cli = (root: string, ...args: string[]) => spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args], { cwd: root, encoding: 'utf8', env: process.env, timeout: 30000 });
const saved = () => existsSync(settingsFile()) ? readFileSync(settingsFile(), 'utf8') : null;
const oldLevel = (bounty: string) => ({ bounty, at: '2026-10-13T00:00:00.000Z', changes: [] });
const ACTING = 'acting on me/project (2 GitHub remotes; the one on your list)';

describe('a checkout with several GitHub remotes resolves through the owner list', () => {
  it('case 1: nothing listed — identity is undecided, post waits and the wait names each candidate with its remote and command', () => {
    const root = fork();
    const before = saved();
    const { id } = draft(root);   // create itself never needs the repository settled
    expect(readDecision(root)).toMatchObject({ decision: null });
    const run = cli(root, 'post', id);
    expect(run.status).toBe(0);
    expect(run.stderr).toBe('');
    expect(run.stdout.split('\n')[0]).toContain('waiting for the owner');
    expect(run.stdout).toContain('allow me/project (remote origin): box bounty allow me/project');
    expect(run.stdout).toContain('allow owner/project (remote upstream): box bounty allow owner/project');
    expect(run.stdout).toContain('or ask me each time: add --ask');
    expect(run.stdout).not.toContain(`box bounty allow ${id}`);
    expect(loadRecord(root, id).stage).toBe('waiting');
    expect(saved()).toBe(before);
  });
  it('case 2: allow names the fork — the waiting bounty releases and posts to it, and the acting line leads the output', () => {
    const root = fork();
    const { id } = draft(root);
    refused(() => postBounty(root, id), 'owner-allow-needed');
    const out = allowRepository(root, 'me/project');
    expect(repositoryIdentity(root)).toBe('me/project');
    expect(readDecision(root)).toMatchObject({ decision: 'allowed', level: 'project' });
    const world = githubRepository(root, id);
    const released = world.run(() => allowRepository(root, 'me/project'));
    expect(released).toContain('waiting bounty went out');
    expect(world.state().issues).toHaveLength(1);
    expect(world.state().issues[0]?.html_url).toContain('github.com/me/project/issues/');
    expect(git(world.bare, ['branch', '--list', 'box-bounty/*']).length).toBeGreaterThan(0);
    const status = world.run(() => cli(root, 'status'));
    expect(status.status).toBe(0);
    expect(status.stdout.split('\n')[0]).toBe(ACTING);
    expect(out).not.toContain('not one of this checkout');
  });
  it('case 3: bare allow in a fork checkout refuses repository-choice-needed, listing both candidates, and writes nothing', () => {
    const root = fork();
    const before = saved();
    try {
      allowRepository(root);
      expect.unreachable('expected a refusal');
    } catch (error) {
      expect(error).toMatchObject({ reason: 'repository-choice-needed' });
      expect(String(error)).toContain('me/project');
      expect(String(error)).toContain('owner/project');
      expect(String(error)).toContain('box bounty allow me/project');
      expect(String(error)).toContain('box bounty allow owner/project');
    }
    expect(loadSettings().repositories).toEqual({});
    expect(saved()).toBe(before);
  });
  it('case 4: two candidates both listed — every identity read refuses repository-several-allowed, naming both; no write, no gh call', () => {
    const root = fork();
    const { id } = draft(root);
    allowRepository(root, 'me/project');
    allowRepository(root, 'owner/project');
    const before = saved();
    refused(() => repositoryIdentity(root), 'repository-several-allowed');
    refused(() => readDecision(root), 'repository-several-allowed');
    refused(() => requireRepository(root), 'repository-several-allowed');
    try {
      renderStatus(root);
      expect.unreachable('expected a refusal');
    } catch (error) {
      expect(error).toMatchObject({ reason: 'repository-several-allowed' });
      expect(String(error)).toContain('me/project');
      expect(String(error)).toContain('owner/project');
    }
    const world = githubRepository(root, id, 'me/project');
    refused(() => world.run(() => postBounty(root, id)), 'repository-several-allowed');
    expect(world.state().calls).toEqual([]);
    expect(world.state().issues).toEqual([]);
    expect(saved()).toBe(before);
  });
  it('case 5: a GitLab mirror remote, and a GitLab pushurl on the GitHub remote, are ignored completely', () => {
    const root = makeRepo({ 'app.txt': 'broken\n', 'TASK.md': 'repair it\n' });
    git(root, ['remote', 'add', 'origin', 'https://github.com/owner/project.git']);
    git(root, ['remote', 'add', 'mirror', 'https://gitlab.com/me/project.git']);
    git(root, ['remote', 'set-url', '--push', '--add', 'origin', 'https://gitlab.com/me/project-push.git']);
    expect(repositoryIdentity(root)).toBe('owner/project');
    expect(readDecision(root).decision).toBeNull();
    expect(renderStatus(root)).toContain('owner: nothing written');
    const { id } = draft(root);
    const world = githubRepository(root, id);
    world.run(() => allowRepository(root));
    const posted = world.run(() => postBounty(root, id));
    // The post reached GitHub's canonical URL only — a fetch or push aimed
    // at gitlab.com would have died on the network guard, not posted.
    expect(posted.destination).toContain('github.com/owner/project/issues/');
    expect(world.state().issues).toHaveLength(1);
  });
  it('case 6: one remote naming two different GitHub addresses still refuses github-remote-mismatch', () => {
    const root = makeRepo({ 'app.txt': 'broken\n', 'TASK.md': 'repair it\n' });
    git(root, ['remote', 'add', 'origin', 'https://github.com/owner/project.git']);
    const before = saved();
    git(root, ['remote', 'set-url', '--push', '--add', 'origin', 'https://github.com/other/project.git']);
    refused(() => repositoryIdentity(root), 'github-remote-mismatch');
    refused(() => requireRepository(root), 'github-remote-mismatch');
    refused(() => allowRepository(root), 'github-remote-mismatch');
    expect(readDecision(root).decision).toBeNull();
    expect(saved()).toBe(before);
  });
  it('case 7: all-projects allowed never chooses between remotes — post waits until one is listed, then posts', () => {
    const root = fork();
    writeDecision(root, 'default', 'allowed');
    const { id } = draft(root);
    expect(readDecision(root)).toMatchObject({ decision: null });
    refused(() => postBounty(root, id), 'owner-allow-needed');
    const before = saved();
    allowRepository(root, 'me/project');
    const world = githubRepository(root, id);
    const run = world.run(() => cli(root, 'post', id));
    expect(run.status).toBe(0);
    expect(run.stdout.split('\n')[0]).toBe(ACTING);
    expect(run.stdout).toContain('posted');
    expect(world.state().issues[0]?.html_url).toContain('github.com/me/project/issues/');
    expect(saved()).not.toBe(before);
  });
  it('case 8: re-pointing the listed remote leaves the checkout unlisted — the yes does not follow it', () => {
    const root = fork();
    allowRepository(root, 'me/project');
    const { id } = draft(root);
    expect(repositoryIdentity(root)).toBe('me/project');
    git(root, ['remote', 'set-url', 'origin', 'https://github.com/other/project.git']);
    expect(repositoryIdentity(root)).toBeNull();
    expect(readDecision(root)).toMatchObject({ decision: null });
    refused(() => postBounty(root, id), 'owner-allow-needed');
    expect(loadRecord(root, id).stage).toBe('waiting');
  });
  it('case 9: adding a second remote that is also listed refuses repository-several-allowed and posts nothing', () => {
    const root = makeRepo({ 'app.txt': 'broken\n', 'TASK.md': 'repair it\n' });
    git(root, ['remote', 'add', 'origin', 'https://github.com/me/project.git']);
    allowRepository(root, 'me/project');
    const { id } = draft(root);
    const world = githubRepository(root, id);
    git(root, ['remote', 'add', 'upstream', 'https://github.com/owner/project.git']);
    allowRepository(root, 'owner/project');
    const before = saved();
    refused(() => world.run(() => postBounty(root, id)), 'repository-several-allowed');
    expect(world.state().calls).toEqual([]);
    expect(world.state().issues).toEqual([]);
    expect(saved()).toBe(before);
    denyRepository(root, 'owner/project');
    const posted = world.run(() => postBounty(root, id));
    expect(posted.destination).toContain('github.com/me/project/issues/');
  });
  it('case 10: a rewrite redirecting the chosen repository refuses; a rewrite on the other candidate is ignored', () => {
    const root = fork();
    allowRepository(root, 'me/project');
    const before = saved();
    git(root, ['config', 'url.https://github.com/evil/elsewhere.git.insteadOf', 'https://github.com/me/project.git']);
    refused(() => repositoryIdentity(root), 'repository-destination-mismatch');
    expect(saved()).toBe(before);
    git(root, ['config', '--unset', 'url.https://github.com/evil/elsewhere.git.insteadOf']);
    git(root, ['config', 'url.https://github.com/evil/elsewhere.git.insteadOf', 'https://github.com/owner/project.git']);
    expect(repositoryIdentity(root)).toBe('me/project');
    expect(readDecision(root)).toMatchObject({ decision: 'allowed' });
  });
  it('case 11: a different repository at the same folder is judged on its own remotes', () => {
    const root = fork();
    allowRepository(root, 'me/project');
    expect(repositoryIdentity(root)).toBe('me/project');
    rmSync(join(root, '.git'), { recursive: true, force: true });
    git(root, ['init', '-b', 'main', '-q']);
    git(root, ['add', '-A']);
    git(root, ['-c', 'user.name=bt16-test', '-c', 'user.email=bt16@test.invalid', 'commit', '-qm', 'base']);
    git(root, ['remote', 'add', 'origin', 'https://github.com/other/thing.git']);
    expect(repositoryIdentity(root)).toBe('other/thing');
    expect(readDecision(root)).toMatchObject({ decision: null });
  });
  it('case 12: the GitHub sign-in without push permission refuses github-push-denied before anything is published', () => {
    const root = makeRepo({ 'app.txt': 'broken\n', 'TASK.md': 'repair it\n' });
    git(root, ['remote', 'add', 'origin', 'https://github.com/owner/project.git']);
    allowRepository(root);
    const { id } = draft(root);
    const world = githubRepository(root, id);
    world.update({ push: false });
    const before = saved();
    try {
      world.run(() => postBounty(root, id));
      expect.unreachable('expected a refusal');
    } catch (error) {
      expect(error).toMatchObject({ reason: 'github-push-denied' });
      expect(String(error)).toContain('cannot push to owner/project');
    }
    expect(world.state().issues).toEqual([]);
    expect(world.state().labels).toEqual([]);
    expect(git(world.bare, ['branch', '--list', 'box-bounty/*'])).toBe('');
    expect(saved()).toBe(before);
  });
  it('case 13: allow naming a repository this checkout does not have writes it and says nothing here was released', () => {
    const root = fork();
    const { id } = draft(root);
    refused(() => postBounty(root, id), 'owner-allow-needed');
    const out = allowRepository(root, 'other/thing');
    expect(out).toContain('allowed: other/thing');
    expect(out).toContain('other/thing is not one of this checkout\'s remotes; nothing here was released');
    expect(loadSettings().repositories['other/thing']?.bounty).toBe('allowed');
    refused(() => postBounty(root, id), 'owner-allow-needed');
    expect(loadRecord(root, id).stage).toBe('waiting');
  });
  it('case 14: a legacy projects entry over a two-remote checkout still migrates as no permission moved', () => {
    const root = fork();
    writeFileSync(settingsFile(), JSON.stringify({ kind: 'box-owner-settings', projects: { [root]: oldLevel('allowed') } }));
    expect(loadSettings().migrations[0]).toMatchObject({ repository: null });
    expect(loadSettings().migrations[0]?.detail).toContain('no permission moved');
    expect(loadSettings().repositories).toEqual({});
    expect(renderConfig(root)).toContain('no permission moved');
  });
  it('case 15: a hand-edited settings entry naming no remote is inert for this checkout', () => {
    const root = makeRepo({ 'app.txt': 'broken\n', 'TASK.md': 'repair it\n' });
    git(root, ['remote', 'add', 'origin', 'https://github.com/owner/project.git']);
    writeFileSync(settingsFile(), JSON.stringify({ kind: 'box-owner-settings', repositories: { 'ghost/elsewhere': oldLevel('allowed') } }));
    expect(repositoryIdentity(root)).toBe('owner/project');
    expect(readDecision(root)).toMatchObject({ decision: null });
    const config = renderConfig(root);
    expect(config).toContain('ghost/elsewhere');
    expect(config).toContain('this repository: owner/project');
  });
  it('a one-bounty allow cannot name a repository — it refuses repository-choice-needed and changes nothing', () => {
    const root = fork();
    const { id } = draft(root);
    refused(() => postBounty(root, id), 'owner-allow-needed');
    const before = saved();
    try {
      allowRepository(root, id);
      expect.unreachable('expected a refusal');
    } catch (error) {
      expect(error).toMatchObject({ reason: 'repository-choice-needed' });
      expect(String(error)).toContain('me/project');
      expect(String(error)).toContain('owner/project');
    }
    expect(loadRecord(root, id).waiting?.answered).toBeUndefined();
    expect(loadRecord(root, id).stage).toBe('waiting');
    expect(saved()).toBe(before);
  });
  it('an ask entry still selects the repository — the post waits for the owner answer', () => {
    const root = fork();
    allowRepository(root, 'me/project', true);
    expect(repositoryIdentity(root)).toBe('me/project');
    expect(readDecision(root)).toMatchObject({ decision: 'ask', level: 'project' });
    const { id } = draft(root);
    refused(() => postBounty(root, id), 'owner-answer-needed');
  });
  it('a denied entry is not on the list — the checkout is unlisted again', () => {
    const root = fork();
    allowRepository(root, 'me/project');
    expect(repositoryIdentity(root)).toBe('me/project');
    denyRepository(root, 'me/project');
    expect(repositoryIdentity(root)).toBeNull();
    const { id } = draft(root);
    refused(() => postBounty(root, id), 'owner-allow-needed');
  });
});
