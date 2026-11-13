import { pullRequestFor } from './github-solver.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fingerprint, git, runRoot, write } from './support.js';
import { cli, delivered, filteredRepo, loggingFilter, readLog, withLog } from './bt6b-shared.js';

// Second pass — two more ways a solver's program ran: a `git` reached after
// a shell command separator (Git hands the line to `sh -c`), and a launcher
// whose program lives in an in-repo manifest the solution writes.
describe('second pass — multi-command lines and config-file launchers', () => {

  it('hole A: lands when every command in the line places outside the tree', () => withLog(logFile => {
    const repo = filteredRepo();
    const external = join(runRoot('bt6b-ext'), 'crypt.cjs');
    writeFileSync(external, loggingFilter('EXTERNAL'));
    git(repo, ['config', 'filter.own.smudge', 'cat | git pwn']);
    git(repo, ['config', 'alias.pwn', `!node "${external.replaceAll('\\', '/')}"`]);
    const { id, folder } = delivered(repo);
    write(folder, 'repo/zz.dat', 'solver changed\n');
    write(folder, 'repo/app.txt', 'fixed\n');
    expect(cli(repo, 'look', id, String(pullRequestFor(repo, id, folder))).status).toBe(0);

    const applied = cli(repo, 'apply', id, '1');
    expect(applied.status).toBe(0);
    // The pipeline really ran: cat fed the blob to the owner's outside
    // program through the alias — the same line, fully placed.
    expect(readLog(logFile).some(line => line.startsWith('EXTERNAL'))).toBe(true);
    expect(readFileSync(join(repo, 'zz.dat'), 'utf8')).toBe('solver changed\n');
  }));

  it('hole B: lands when the launcher names an operand placed outside the tree', () => withLog(logFile => {
    const repo = filteredRepo();
    const external = join(runRoot('bt6b-ext'), 'crypt.cjs');
    writeFileSync(external, loggingFilter('EXTERNAL'));
    const dir = runRoot('bt6b-npm');
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { go: `node "${external.replaceAll('\\', '/')}"` } }));
    // --prefix points npm at a manifest outside the repository: the operand
    // is placed, so the line lands and the owner's script really runs.
    git(repo, ['config', 'filter.own.smudge', `npm --prefix "${dir.replaceAll('\\', '/')}" --silent run go`]);
    const { id, folder } = delivered(repo);
    write(folder, 'repo/zz.dat', 'solver changed\n');
    write(folder, 'repo/app.txt', 'fixed\n');
    expect(cli(repo, 'look', id, String(pullRequestFor(repo, id, folder))).status).toBe(0);

    const applied = cli(repo, 'apply', id, '1');
    expect(applied.status).toBe(0);
    expect(readLog(logFile).some(line => line.startsWith('EXTERNAL'))).toBe(true);
    expect(readFileSync(join(repo, 'zz.dat'), 'utf8')).toBe('solver changed\n');
  }));
});
