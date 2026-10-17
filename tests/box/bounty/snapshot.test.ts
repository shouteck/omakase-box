import { gitBlob } from '../../../packages/box-bounty/git.js';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BountyRefused, finalizeBounty, planBounty } from '../../../packages/box-bounty/index.js';
import type { CreateOptions } from '../../../packages/box-bounty/index.js';
import { fingerprint, git, listTree, makeRepo, recreateSnapshot, recordExists, runRoot, write } from './support.js';

// Snapshot semantics: the bounty ships the repository as it stands — tracked files
// with uncommitted changes, untracked files that are not ignored, no .git, no
// history — and creating it changes nothing in the source repository.

const BASE_FILES = {
  'src/app.py': 'print("v1")\n',
  'README.md': 'base\n',
  '.gitignore': 'ignored.txt\n'
};

function options(repo: string, extra: Partial<CreateOptions> = {}): CreateOptions {
  write(repo, 'TASK.md', 'Make the greeting say hello twice.\n');
  return {
    repoPath: repo,
    why: 'a reason',
    title: 'double the greeting',
    taskPath: join(repo, 'TASK.md'),
    ...extra
  };
}

describe('the snapshot is the repository as it stands', () => {
  it('ships a clean tree', () => {
    const repo = makeRepo(BASE_FILES);
    const plan = planBounty(options(repo));
    expect(plan.files.map(file => file.path).sort()).toEqual(['.gitignore', 'README.md', 'TASK.md', 'src/app.py']);
    const result = finalizeBounty(plan);
    expect(result.plan.files.map(file => file.path).sort()).toEqual(['.gitignore', 'README.md', 'TASK.md', 'src/app.py']);
    expect(gitBlob(repo, result.plan.snapshot.commit, ['src', 'app.py'].join('/'))!.toString('utf8')).toBe('print("v1")\n');
  });

  it('ships uncommitted edits, untracked new files, and omits ignored and deleted files', () => {
    const repo = makeRepo(BASE_FILES, r => {
      write(r, 'src/app.py', 'print("v2-uncommitted")\n');
      write(r, 'new-file.txt', 'untracked\n');
      write(r, 'ignored.txt', 'ignored\n');
      rmSync(join(r, 'README.md'));
    });
    const plan = planBounty(options(repo));
    const result = finalizeBounty(plan);
    const shipped = result.plan.files.map(file => file.path);
    expect(shipped).toContain('new-file.txt');
    expect(shipped).not.toContain('ignored.txt');
    expect(shipped).not.toContain('README.md');
    expect(gitBlob(repo, result.plan.snapshot.commit, ['src', 'app.py'].join('/'))!.toString('utf8')).toBe('print("v2-uncommitted")\n');
  });

  it('leaves the working tree, the index and the branch byte-for-byte unchanged', () => {
    const repo = makeRepo(BASE_FILES, r => {
      write(r, 'src/app.py', 'print("dirty")\n');
      write(r, 'untracked.txt', 'u\n');
      write(r, 'staged.txt', 's\n');
      git(r, ['add', 'staged.txt']);
    });
    const opts = options(repo); // options() writes TASK.md into the tree — snapshot it before fingerprinting
    const before = fingerprint(repo);
    const result = finalizeBounty(planBounty(opts));
    expect(recordExists(repo, result.id)).toBe(true);
    expect(fingerprint(repo)).toEqual(before);
  });

  it('the capture is a real Git object during create, and recreation reproduces the tree', () => {
    const repo = makeRepo(BASE_FILES, r => {
      write(r, 'src/app.py', 'print("v2-uncommitted")\n');
      write(r, 'new-file.txt', 'untracked\n');
      rmSync(join(r, 'README.md'));
    });
    const plan = planBounty(options(repo));
    expect(git(repo, ['cat-file', '-t', plan.snapshot.commit])).toBe('commit');
    const recreated = recreateSnapshot(repo, plan.snapshot.commit);
    // The identifier captures the full working state, before never-ship removal.
    expect(recreated.files.sort()).toEqual(['.gitignore', 'TASK.md', 'new-file.txt', 'src/app.py']);
    expect(readFileSync(join(recreated.dir, 'src', 'app.py'), 'utf8')).toBe('print("v2-uncommitted")\n');
    const result = finalizeBounty(plan);
    expect(result.plan.files.map(file => file.path).sort()).toEqual(recreated.files);
  });

  it('ships files whose names are not ASCII', () => {
    const repo = makeRepo({ ...BASE_FILES, 'docs/ünïcode.txt': 'umlauts\n', '数据/值.py': 'x\n' });
    const result = finalizeBounty(planBounty(options(repo)));
    const shipped = result.plan.files.map(file => file.path);
    expect(shipped).toContain('docs/ünïcode.txt');
    expect(shipped).toContain('数据/值.py');
    expect(gitBlob(repo, result.plan.snapshot.commit, ['docs', 'ünïcode.txt'].join('/'))!.toString('utf8')).toBe('umlauts\n');
  });

  it('ships the bytes the snapshot recorded, not bytes swapped in after planning', () => {
    const repo = makeRepo(BASE_FILES);
    const plan = planBounty(options(repo));
    write(repo, 'src/app.py', 'print("SWAPPED-AFTER-PLAN")\n');
    const result = finalizeBounty(plan);
    expect(gitBlob(repo, result.plan.snapshot.commit, ['src', 'app.py'].join('/'))!.toString('utf8')).toBe('print("v1")\n');
  });

  it('a directory swapped for an outside junction after planning cannot smuggle bytes', () => {
    const repo = makeRepo({ 'src/app.py': 'x\n', 'inner/keep.txt': 'inside-bytes\n' });
    const plan = planBounty(options(repo));
    rmSync(join(repo, 'inner'), { recursive: true });
    const outside = runRoot('outside');
    write(outside, 'keep.txt', 'OUTSIDE-BYTES\n');
    symlinkSync(outside, join(repo, 'inner'), 'junction');
    const result = finalizeBounty(plan);
    expect(gitBlob(repo, result.plan.snapshot.commit, ['inner', 'keep.txt'].join('/'))!.toString('utf8')).toBe('inside-bytes\n');
  });

  it('names a tracked link whose target does not resolve', () => {
    const repo = makeRepo(BASE_FILES);
    symlinkSync('no-such-target', join(repo, 'dangling.txt'), 'file'); // git records the link itself; realpath cannot resolve it
    try {
      planBounty(options(repo));
      expect.unreachable('expected a refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(BountyRefused);
      const refusal = error as BountyRefused;
      expect(refusal.reason).toBe('unreadable-path');
      expect(refusal.message).toContain('dangling.txt');
    }
  });

  it('refuses clearly outside a Git checkout', () => {
    const dir = runRoot('plain');
    mkdirSync(dir, { recursive: true });
    write(dir, 'TASK.md', 'task\n');
    try {
      planBounty(options(dir));
      expect.unreachable('expected a refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(BountyRefused);
      expect((error as BountyRefused).reason).toBe('not-a-repository');
    }
  });
});
