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
  expect(cli(context.repo, 'confirm', '--to', 'github').status).toBe(0);
  expect(cli(context.repo, 'post', '--to', 'github').status).toBe(0);
  context.pr('solver');
  const answer = cli(context.repo, 'answer', '--pr', '1');
  expect(answer.status).toBe(0); expect(answer.stdout).toContain('attempt 1');
  expect(cli(context.repo, 'questions').status).toBe(0);
  expect(cli(context.repo, 'reply', '--text', 'Please keep the task wording.').status).toBe(0);
  const look = cli(context.repo, 'look', '1');
  expect(look.status).toBe(0); expect(look.stdout).toContain('Nothing in this copy was run'); expect(look.stdout).toContain('box bounty unlook');
  expect(cli(context.repo, 'unlook', '1').status).toBe(0);
  write(context.repo, 'app.txt', 'owner version\n'); git(context.repo, ['add', 'app.txt']);
  git(context.repo, ['-c', 'user.name=owner', '-c', 'user.email=owner@example.invalid', 'commit', '-qm', 'owner moved']);
  write(context.repo, 'unrelated.txt', 'precious dirty bytes\n');
  write(context.repo, 'staged.txt', 'precious staged bytes\n'); git(context.repo, ['add', 'staged.txt']);
  const index = readFileSync(join(context.repo, '.git/index'));
  // The staged change stops the live merge, exactly as on master: a named
  // refusal, and index and worktree untouched.
  const refused = cli(context.repo, 'apply', '1');
  expect(refused.status).toBe(3); expect(refused.stderr).toContain('apply-worktree-dirty');
  expect(readFileSync(join(context.repo, '.git/index'))).toEqual(index);
  expect(readFileSync(join(context.repo, 'staged.txt'), 'utf8')).toBe('precious staged bytes\n');
  git(context.repo, ['reset', '-q', 'HEAD', '--', 'staged.txt']);
  const apply = cli(context.repo, 'apply', '1');
  expect(apply.status).toBe(0); expect(apply.stdout).toContain('conflict'); expect(apply.stdout).toContain(`box bounty look ${context.id} 1`);
  // Resolving a clash is the agent's own work: resolve the path, commit, apply again.
  write(context.repo, 'app.txt', 'fixed\n'); git(context.repo, ['add', 'app.txt']);
  git(context.repo, ['-c', 'user.name=owner', '-c', 'user.email=owner@example.invalid', 'commit', '-qm', 'resolved for the solution']);
  const applied = cli(context.repo, 'apply', '1');
  expect(applied.status).toBe(0); expect(applied.stdout).toContain('applied'); expect(applied.stdout).toContain('Saved job context'); expect(applied.stdout).toContain('box bounty undo');
  expect(readFileSync(join(context.repo, 'unrelated.txt'), 'utf8')).toBe('precious dirty bytes\n');
  expect(readFileSync(join(context.repo, 'staged.txt'), 'utf8')).toBe('precious staged bytes\n');
  expect(git(context.repo, ['status', '--porcelain', '--', 'staged.txt'])).toBe(' M staged.txt');
  expect(cli(context.repo, 'status', context.id).stdout).toContain('applied');
  const undo = cli(context.repo, 'undo');
  expect(undo.status).toBe(0); expect(undo.stdout).toContain('undone');
}, 'Repair app', files));

it('names each bounty when omitted ids are ambiguous and keeps explicit ended inspection available', () => fixture(context => {
  const second = finalizeBounty(planBounty({ repoPath: context.repo, title: 'Another task', taskPath: join(context.repo, 'TASK.md'), why: 'separate task', outDir: join(context.scratch, 'second-draft') }));
  for (const command of [['confirm'], ['post', '--to', 'github'], ['answer', '--pr', '1'], ['look', '1'], ['unlook', '1'], ['apply', '1'], ['questions'], ['reply', '--text', 'hello'], ['reject', '--reason', 'done'], ['withdraw']]) {
    const result = cli(context.repo, ...command);
    expect(result.status).toBe(3); expect(result.stderr).toContain('bounty-ambiguous');
    expect(result.stderr).toContain(context.id); expect(result.stderr).toContain(second.id);
  }
  expect(cli(context.repo, 'withdraw', second.id).status).toBe(0);
  expect(cli(context.repo, 'status', second.id, '--full').stdout).toContain('withdrawn');
}, 'Repair app', files));
