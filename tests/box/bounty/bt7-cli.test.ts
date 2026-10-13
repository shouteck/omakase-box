import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { finalizeBounty, planBounty } from '../../../packages/box-bounty/index.js';
import { fixture } from './github-fixture.js';
import { CLI_DIST, git, write } from './support.js';

const cli = (repo: string, ...args: string[]) => spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args, '--repo', repo], { encoding: 'utf8', env: process.env });
const files = { 'app.txt': 'broken\n', 'unrelated.txt': 'owner\n', 'staged.txt': 'owner staged base\n' };

it('names and runs the whole CLI journey with omitted ids, preserving unrelated dirty and staged owner files', () => fixture(context => {
  expect(cli(context.repo, 'post', '--to', 'github').status).toBe(0);
  context.pr('solver', { 'extra.txt': 'solver added\n' });
  // The commands BT7c and BT8 folded away each refuse by name and say what
  // took the place — never a silent drop, never an alias that runs the old
  // operation.
  for (const gone of [['answer', '--pr', '1'], ['questions'], ['reply', '--text', 'hi'], ['undo'], ['reject', '--reason', 'x'], ['withdraw'], ['remind'], ['confirm']]) {
    const result = cli(context.repo, ...gone);
    expect(result.status).toBe(3);
    expect(result.stderr).toContain('command-removed');
  }
  // look <n> collects the pull request itself, then shows its change.
  const look = cli(context.repo, 'look', '1');
  expect(look.status).toBe(0);
  expect(look.stdout).toContain('collected first');
  expect(look.stdout).toContain('written by the solver');
  expect(look.stdout).toContain('ran nothing of the solver');
  expect(look.stdout).toContain('+fixed');
  expect(look.stdout).toContain(`box bounty apply ${context.id} 1`);
  // Nothing is created to remove: no copy, no unlook.
  expect(look.stdout).not.toContain('unlook');
  expect(cli(context.repo, 'unlook', '1').status).toBe(2);
  write(context.repo, 'app.txt', 'owner version\n'); git(context.repo, ['add', 'app.txt']);
  git(context.repo, ['-c', 'user.name=owner', '-c', 'user.email=owner@example.invalid', 'commit', '-qm', 'owner moved']);
  write(context.repo, 'unrelated.txt', 'precious dirty bytes\n');
  write(context.repo, 'staged.txt', 'precious staged bytes\n'); git(context.repo, ['add', 'staged.txt']);
  const index = git(context.repo, ['ls-files', '--stage']);
  // The staged change stops the live merge, exactly as on master: a named
  // refusal, and the staged content and worktree are what they were.
  const refused = cli(context.repo, 'apply', '1');
  expect(refused.status).toBe(3); expect(refused.stderr).toContain('apply-worktree-dirty');
  expect(git(context.repo, ['ls-files', '--stage'])).toBe(index);
  expect(readFileSync(join(context.repo, 'staged.txt'), 'utf8')).toBe('precious staged bytes\n');
  git(context.repo, ['reset', '-q', 'HEAD', '--', 'staged.txt']);
  const apply = cli(context.repo, 'apply', '1');
  expect(apply.status).toBe(0); expect(apply.stdout).toContain('conflict'); expect(apply.stdout).toContain(`box bounty look ${context.id} 1`);
  // Resolving a clash is the agent's own work: resolve the path, commit, apply again.
  write(context.repo, 'app.txt', 'fixed\n'); git(context.repo, ['add', 'app.txt']);
  git(context.repo, ['-c', 'user.name=owner', '-c', 'user.email=owner@example.invalid', 'commit', '-qm', 'resolved for the solution']);
  const applied = cli(context.repo, 'apply', '1');
  expect(applied.status).toBe(0); expect(applied.stdout).toContain('applied'); expect(applied.stdout).toContain('Saved job context'); expect(applied.stdout).toContain('git revert -m 1');
  expect(readFileSync(join(context.repo, 'unrelated.txt'), 'utf8')).toBe('precious dirty bytes\n');
  expect(readFileSync(join(context.repo, 'staged.txt'), 'utf8')).toBe('precious staged bytes\n');
  // Both owner files are modified in the worktree and neither is staged, as
  // they were before the merges ran.
  expect(git(context.repo, ['diff', '--name-only']).split('\n').sort()).toEqual(['staged.txt', 'unrelated.txt']);
  expect(git(context.repo, ['diff', '--cached', '--name-only'])).toBe('');
  expect(cli(context.repo, 'status', context.id).stdout).toContain('applied');
  // Reversing the merge is ordinary Git: the merge is one ordinary commit.
  git(context.repo, ['-c', 'user.name=owner', '-c', 'user.email=owner@example.invalid', 'revert', '--no-edit', '-m', '1', 'HEAD']);
  // The merge brought the solver's new file; the revert commit takes it out.
  expect(git(context.repo, ['ls-files', '--', 'extra.txt'])).toBe('');
}, 'Repair app', files));

it('names each bounty when omitted ids are ambiguous and keeps explicit ended inspection available', () => fixture(context => {
  const second = finalizeBounty(planBounty({ repoPath: context.repo, title: 'Another task', taskPath: join(context.repo, 'TASK.md'), why: 'separate task', outDir: join(context.scratch, 'second-draft') }));
  for (const command of [['post', '--to', 'github'], ['look', '1'], ['apply', '1'], ['close'], ['close', '--reason', 'done']]) {
    const result = cli(context.repo, ...command);
    expect(result.status).toBe(3); expect(result.stderr).toContain('bounty-ambiguous');
    expect(result.stderr).toContain(context.id); expect(result.stderr).toContain(second.id);
  }
  expect(cli(context.repo, 'close', second.id).status).toBe(0);
  expect(cli(context.repo, 'status', second.id, '--full').stdout).toContain('withdrawn');
}, 'Repair app', files));
