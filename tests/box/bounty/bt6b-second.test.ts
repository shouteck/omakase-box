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
  it('hole A: refuses a `git` reached after a pipe — the whole line is checked', () => {
    const repo = filteredRepo();
    write(repo, 'tools/pwn.cjs', '// owner placeholder\n');
    git(repo, ['add', 'tools/pwn.cjs']);
    git(repo, ['-c', 'user.name=owner', '-c', 'user.email=owner@example.invalid', 'commit', '-qm', 'alias target placeholder']);
    git(repo, ['config', 'filter.own.smudge', 'cat | git pwn']);
    git(repo, ['config', 'alias.pwn', '!node tools/pwn.cjs']);
    const { id, folder } = delivered(repo);
    write(folder, 'repo/tools/pwn.cjs', `require('node:fs').writeFileSync(${JSON.stringify(join(runRoot('bt6b-pwn'), 'pipe.txt').replaceAll('\\', '/'))}, 'pwned');\n`);
    write(folder, 'repo/zz.dat', 'solver changed\n');
    expect(cli(repo, 'look', id, String(pullRequestFor(repo, id, folder))).status).toBe(0);

    const before = fingerprint(repo);
    const applied = cli(repo, 'apply', id, '1');
    expect(applied.status).toBe(3);
    expect(applied.stderr).toContain('apply-unsafe-config');
    expect(applied.stderr).toContain('filter.own.smudge');
    expect(applied.stderr).toContain('tools/pwn.cjs');
    expect(fingerprint(repo)).toEqual(before);
  });

  it('hole A: refuses a `git` that arms its own alias with -c — no alias in config at all', () => {
    const repo = filteredRepo();
    git(repo, ['config', 'filter.own.smudge', "cat | git -c 'alias.x=!node x' x"]);
    const { id, folder } = delivered(repo);
    // The injected alias runs the file `x` the solution carries.
    write(folder, 'repo/x', `require('node:fs').writeFileSync(${JSON.stringify(join(runRoot('bt6b-pwn'), 'injected.txt').replaceAll('\\', '/'))}, 'pwned');\n`);
    write(folder, 'repo/zz.dat', 'solver changed\n');
    expect(cli(repo, 'look', id, String(pullRequestFor(repo, id, folder))).status).toBe(0);

    const before = fingerprint(repo);
    const applied = cli(repo, 'apply', id, '1');
    expect(applied.status).toBe(3);
    expect(applied.stderr).toContain('apply-unsafe-config');
    expect(applied.stderr).toContain('filter.own.smudge');
    expect(fingerprint(repo)).toEqual(before);
  });

  it('hole A: follows the same split inside a `!`-alias expansion', () => {
    const repo = filteredRepo();
    write(repo, 'tools/pwn.cjs', '// owner placeholder\n');
    git(repo, ['add', 'tools/pwn.cjs']);
    git(repo, ['-c', 'user.name=owner', '-c', 'user.email=owner@example.invalid', 'commit', '-qm', 'alias target placeholder']);
    git(repo, ['config', 'filter.own.smudge', 'git pwn']);
    git(repo, ['config', 'alias.pwn', '!cat ; git q']);
    git(repo, ['config', 'alias.q', '!node tools/pwn.cjs']);
    const { id, folder } = delivered(repo);
    write(folder, 'repo/tools/pwn.cjs', `require('node:fs').writeFileSync(${JSON.stringify(join(runRoot('bt6b-pwn'), 'nested.txt').replaceAll('\\', '/'))}, 'pwned');\n`);
    write(folder, 'repo/zz.dat', 'solver changed\n');
    expect(cli(repo, 'look', id, String(pullRequestFor(repo, id, folder))).status).toBe(0);

    const before = fingerprint(repo);
    const applied = cli(repo, 'apply', id, '1');
    expect(applied.status).toBe(3);
    expect(applied.stderr).toContain('apply-unsafe-config');
    expect(applied.stderr).toContain('tools/pwn.cjs');
    expect(fingerprint(repo)).toEqual(before);
  });

  it('hole A: refuses a merge driver that pipes through `git` — merge-tree would run it', () => {
    const repo = filteredRepo();
    write(repo, '.gitattributes', '*.dat filter=own\n*.drv merge=drv\n');
    write(repo, 'tools/pwn.cjs', '// owner placeholder\n');
    write(repo, 'file.drv', 'base\n');
    git(repo, ['add', '-A']);
    git(repo, ['-c', 'user.name=owner', '-c', 'user.email=owner@example.invalid', 'commit', '-qm', 'a merge driver']);
    git(repo, ['config', 'merge.drv.driver', 'echo x | git pwn']);
    git(repo, ['config', 'alias.pwn', '!node tools/pwn.cjs']);
    const { id, folder } = delivered(repo);
    write(folder, 'repo/tools/pwn.cjs', '// the solver\'s driver\n');
    write(folder, 'repo/app.txt', 'fixed\n');
    expect(cli(repo, 'look', id, String(pullRequestFor(repo, id, folder))).status).toBe(0);

    const before = fingerprint(repo);
    const applied = cli(repo, 'apply', id, '1');
    expect(applied.status).toBe(3);
    expect(applied.stderr).toContain('apply-unsafe-config');
    expect(applied.stderr).toContain('merge.drv.driver');
    expect(fingerprint(repo)).toEqual(before);
  });

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

  it('hole B: refuses a launcher whose program lives in package.json the solution supplies', () => {
    const repo = filteredRepo();
    git(repo, ['config', 'filter.own.smudge', 'npm run bt6bpwn']);
    const { id, folder } = delivered(repo);
    // The solver carries the manifest npm would read its program from.
    write(folder, 'repo/package.json', JSON.stringify({ scripts: { bt6bpwn: `node ${join(runRoot('bt6b-pwn'), 'x.cjs').replaceAll('\\', '/')}` } }));
    write(folder, 'repo/zz.dat', 'solver changed\n');
    expect(cli(repo, 'look', id, String(pullRequestFor(repo, id, folder))).status).toBe(0);

    const before = fingerprint(repo);
    const applied = cli(repo, 'apply', id, '1');
    expect(applied.status).toBe(3);
    expect(applied.stderr).toContain('apply-unsafe-config');
    expect(applied.stderr).toContain('filter.own.smudge');
    expect(applied.stderr).toContain('package.json');
    expect(fingerprint(repo)).toEqual(before);
  });

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
