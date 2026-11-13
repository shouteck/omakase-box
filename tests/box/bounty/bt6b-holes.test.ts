import { pullRequestFor } from './github-solver.js';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fingerprint, git, runRoot, write } from './support.js';
import { cli, delivered, filteredRepo, filteredRepoUnder, loggingFilter, readLog, withLog } from './bt6b-shared.js';
import { closeStores } from '../../../packages/box-bounty/index.js';

// BT6b pass holes — three ways the first refusal layer still let a solver's
// program run, each proven live through the built CLI. `undo` is gone since
// BT7c; its cases here ran the same shared check through apply instead, so
// what remains is apply's coverage alone.
describe('pass holes — configured commands that still reached a solver program', () => {

  it('hole 1: keeps landing when a process filter names a real program — the stream is its data', () => {
    const repo = filteredRepo();
    // `git-lfs filter-process` also reads stdin, but treats it as bytes —
    // the command has a program name, not a stream-as-program interpreter.
    git(repo, ['config', 'filter.lfs.process', 'git-lfs filter-process']);
    const { id, folder } = delivered(repo);
    write(folder, 'repo/app.txt', 'fixed\n');
    expect(cli(repo, 'look', id, String(pullRequestFor(repo, id, folder))).status).toBe(0);

    const applied = cli(repo, 'apply', id, '1');
    expect(applied.status).toBe(0);
    expect(applied.stdout).toContain('applied');
    expect(readFileSync(join(repo, 'app.txt'), 'utf8')).toBe('fixed\n');
  });

  it('hole 2: lands when the `git` alias expands to programs placed outside the tree — and it runs', () => withLog(logFile => {
    const repo = filteredRepo();
    const external = join(runRoot('bt6b-ext'), 'crypt.cjs');
    writeFileSync(external, loggingFilter('EXTERNAL'));
    git(repo, ['config', 'filter.own.smudge', 'git pwn']);
    git(repo, ['config', 'alias.pwn', `!node "${external.replaceAll('\\', '/')}"`]);
    const { id, folder } = delivered(repo);
    write(folder, 'repo/zz.dat', 'solver changed\n');
    write(folder, 'repo/app.txt', 'fixed\n');
    expect(cli(repo, 'look', id, String(pullRequestFor(repo, id, folder))).status).toBe(0);

    const applied = cli(repo, 'apply', id, '1');
    expect(applied.status).toBe(0);
    // The alias really ran as the owner's command — outside the tree, the
    // whole chain placeable, so the merge behaves exactly as configured.
    expect(readLog(logFile).some(line => line.startsWith('EXTERNAL'))).toBe(true);
    expect(readFileSync(join(repo, 'zz.dat'), 'utf8')).toBe('solver changed\n');
  }));

  it('hole 3: lands when every include in the chain resolves outside the tree', () => {
    const repo = filteredRepo();
    const dir = runRoot('bt6b-inc');
    writeFileSync(join(dir, 'outside.conf'), '[include]\n\tpath = ./sibling.conf\n');
    writeFileSync(join(dir, 'sibling.conf'), '[filter "benign"]\n\tclean = cat\n');
    git(repo, ['config', 'include.path', join(dir, 'outside.conf').replaceAll('\\', '/')]);
    const { id, folder } = delivered(repo);
    write(folder, 'repo/app.txt', 'fixed\n');
    expect(cli(repo, 'look', id, String(pullRequestFor(repo, id, folder))).status).toBe(0);

    const applied = cli(repo, 'apply', id, '1');
    expect(applied.status).toBe(0);
    expect(applied.stdout).toContain('applied');
    expect(readFileSync(join(repo, 'app.txt'), 'utf8')).toBe('fixed\n');
  });
});
