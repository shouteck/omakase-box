// BT39: Git output is read through a 512 MiB buffer everywhere — no project
// size can overflow it into ENOBUFS — and a status refresh does not re-ask
// GitHub for a pull request file list it already recorded.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { git as bountyGit, gitStdin, GitFailed } from '../../../packages/box-bounty/git.js';
import { gitBlob } from '../../../packages/box-bounty/git.js';
import { renderStatus } from '../../../packages/box-bounty/index.js';
import { planBounty, finalizeBounty } from '../../../packages/box-bounty/index.js';
import type { CreateOptions } from '../../../packages/box-bounty/index.js';
import { git, makeRepo, runRoot, write } from './support.js';
import { postedFixture } from './github-fixture.js';

describe('Git reads carry a named large buffer, not the 1 MiB default', () => {
  it('reads a tree listing far over 1 MiB through the generic helper', () => {
    const repo = makeRepo({ 'a.txt': 'x\n' });
    const blob = gitStdin(repo, ['hash-object', '-w', '--stdin'], 'blob-bytes\n');
    const names = 70000;
    const listing = Array.from({ length: names }, (_, i) => `100644 blob ${blob}\tlong-file-name-${String(i).padStart(6, '0')}.txt`).join('\n') + '\n';
    const tree = gitStdin(repo, ['mktree'], listing);
    const commit = bountyGit(repo, [
      '-c', 'user.name=bt39', '-c', 'user.email=bt39@test.invalid',
      'commit-tree', tree, '-p', 'HEAD', '-m', 'a tree with 40,000 entries'
    ]);
    // The same call snapshot.ts makes — the one that overflowed at 100k files.
    const out = bountyGit(repo, ['-c', 'core.quotepath=false', 'ls-tree', '-r', '-z', '--format=%(objecttype) %(objectsize) %(path)', commit]);
    expect(out.length).toBeGreaterThan(2 * 1024 * 1024);
    expect(out.split('\0').filter(Boolean)).toHaveLength(names);
  });

  it('a Git process failure is still a named failure carrying the command', () => {
    const repo = makeRepo({ 'a.txt': 'x\n' });
    try {
      bountyGit(repo, ['ls-tree', 'not-a-commit-000000000000000000000000']);
      expect.unreachable('the read should fail');
    } catch (error) {
      expect(error).toBeInstanceOf(GitFailed);
      expect(String(error)).toContain('ls-tree');
      expect(String(error)).toContain('not-a-commit');
    }
  });
});

describe('the snapshot tree is the working state, index cache or not', () => {
  // The snapshot seeds its temporary index from the repository's real index —
  // unchanged files are not re-hashed. Staged entries must never leak: what
  // ships is the working tree, exactly as before.
  it('ships worktree bytes even where the index was staged differently', () => {
    const repo = makeRepo({ 'a.txt': 'base\n', 'b.txt': 'b\n' }, r => {
      write(r, 'a.txt', 'staged version\n');
      git(r, ['add', 'a.txt']);
      write(r, 'a.txt', 'worktree version\n');
      write(r, 'c.txt', 'untracked\n');
    });
    write(repo, 'TASK.md', 'Ship the worktree.\n');
    const options: CreateOptions = { repoPath: repo, why: 'test', taskPath: join(repo, 'TASK.md') };
    const plan = finalizeBounty(planBounty(options));
    expect(gitBlob(repo, plan.plan.snapshot.commit, 'a.txt')!.toString('utf8')).toBe('worktree version\n');
    expect(plan.plan.files.map(file => file.path)).toContain('c.txt');
    // The real index is untouched: the staged entry stays staged.
    expect(git(repo, ['diff', '--cached', '--name-only']).trim()).toBe('a.txt');
  });
});

describe('status does not re-ask GitHub for a listing it already recorded', () => {
  it('an unchanged pull-request set costs no per-request file calls', () => postedFixture(context => {
    const { repo, id } = context;
    for (let i = 0; i < 4; i++) context.pr(`solver-${i}`);
    const fileCalls = () => context.state().calls.filter(call => call.join(' ').includes('/files')).length;
    renderStatus(repo); // first refresh lists every waiting PR, files included
    const afterFirst = fileCalls();
    expect(afterFirst).toBeGreaterThanOrEqual(5);
    renderStatus(repo); // 'new' became 'seen since' — one re-list, files again
    const afterSecond = fileCalls();
    expect(afterSecond).toBeGreaterThan(afterFirst);
    renderStatus(repo); // the same set is already recorded — nothing re-asked
    expect(fileCalls()).toBe(afterSecond);
    // A re-pushed pull request (same number, new head) is a different fact:
    // the listing refreshes, paying the per-request reads again.
    const state = context.state();
    context.update({ prs: state.prs.map(pr => pr.number === 1 ? { ...pr, head: { sha: context.waitingPr.replace(/^../, 'ff') } } : pr) });
    renderStatus(repo);
    expect(fileCalls()).toBeGreaterThan(afterSecond);
  }));
});
