import { pullRequestFor } from './github-solver.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fingerprint, git, runRoot, write } from './support.js';
import { cli, delivered, filteredRepo } from './bt6b-shared.js';

// Third pass — one level deeper: a program reached through another program's
// operand (find -exec, wsl, ssh, stdbuf and every program like them), an
// option's own value (--use-compress-program, -I, equivalent spellings), a
// launcher flag that is not that launcher's manifest flag, and quoted text
// that is data, never a command.
describe('third pass — operand-level exec, option values and quoted data', () => {

  it('lands when a double-quoted word holds a separator — "a;b" is data, not two commands', () => {
    const repo = filteredRepo();
    // The splitter must not cut inside "…" — this filter is one echo of one
    // quoted word. It runs for real: the smudge writes a;b into the file.
    git(repo, ['config', 'filter.own.smudge', 'echo "a;b"']);
    const { id, folder } = delivered(repo);
    write(folder, 'repo/zz.dat', 'solver changed\n');
    write(folder, 'repo/app.txt', 'fixed\n');
    expect(cli(repo, 'look', id, String(pullRequestFor(repo, id, folder))).status).toBe(0);

    const applied = cli(repo, 'apply', id, '1');
    expect(applied.status).toBe(0);
    expect(applied.stdout).toContain('applied');
    expect(readFileSync(join(repo, 'zz.dat'), 'utf8')).toContain('a;b');
  });

  it('lands when an exec operand names only outside programs — find runs cat, not a solver file', () => {
    const repo = filteredRepo();
    const outside = runRoot('bt6b-find-out');
    writeFileSync(join(outside, 'f.txt'), 'outside\n');
    git(repo, ['config', 'filter.own.smudge', `find "${outside.replaceAll('\\', '/')}" -exec cat {} +`]);
    const { id, folder } = delivered(repo);
    write(folder, 'repo/zz.dat', 'solver changed\n');
    write(folder, 'repo/app.txt', 'fixed\n');
    expect(cli(repo, 'look', id, String(pullRequestFor(repo, id, folder))).status).toBe(0);

    const applied = cli(repo, 'apply', id, '1');
    expect(applied.status).toBe(0);
    expect(applied.stdout).toContain('applied');
  });
});
