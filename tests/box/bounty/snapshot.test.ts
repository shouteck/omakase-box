import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BountyRefused, finalizeBounty, planBounty } from '../../../packages/box-bounty/index.js';
import type { CreateOptions } from '../../../packages/box-bounty/index.js';
import { fingerprint, git, listTree, makeRepo, recreateSnapshot, runRoot, write } from './support.js';

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
    title: 'double the greeting',
    taskPath: join(repo, 'TASK.md'),
    outDir: join(runRoot('out'), 'bounty'),
    ...extra
  };
}

describe('the snapshot is the repository as it stands', () => {
  it('ships a clean tree', () => {
    const repo = makeRepo(BASE_FILES);
    const plan = planBounty(options(repo));
    expect(plan.files.map(file => file.path).sort()).toEqual(['.gitignore', 'README.md', 'TASK.md', 'src/app.py']);
    const result = finalizeBounty(plan);
    expect(listTree(join(result.outDir, 'repo')).sort()).toEqual(['.gitignore', 'README.md', 'TASK.md', 'src/app.py']);
    expect(readFileSync(join(result.outDir, 'repo', 'src', 'app.py'), 'utf8')).toBe('print("v1")\n');
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
    const shipped = listTree(join(result.outDir, 'repo'));
    expect(shipped).toContain('new-file.txt');
    expect(shipped).not.toContain('ignored.txt');
    expect(shipped).not.toContain('README.md');
    expect(readFileSync(join(result.outDir, 'repo', 'src', 'app.py'), 'utf8')).toBe('print("v2-uncommitted")\n');
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
    expect(existsSync(result.outDir)).toBe(true);
    expect(fingerprint(repo)).toEqual(before);
  });

  it('records an identifier Git itself resolves, and recreation reproduces the tree', () => {
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
    expect(listTree(join(result.outDir, 'repo'))).toEqual(recreated.files);
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
