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
  it('hole C: refuses find -exec and -execdir carrying a `git` operand — the whole operand is a command', () => {
    const repo = filteredRepo();
    write(repo, 'tools/pwn.cjs', '// owner placeholder\n');
    git(repo, ['add', 'tools/pwn.cjs']);
    git(repo, ['-c', 'user.name=owner', '-c', 'user.email=owner@example.invalid', 'commit', '-qm', 'alias target placeholder']);
    git(repo, ['config', 'filter.own.smudge', 'find . -exec git pwn {} +']);
    git(repo, ['config', 'alias.pwn', '!node tools/pwn.cjs']);
    const { id, folder } = delivered(repo);
    const marker = join(runRoot('bt6b-pwn'), 'exec.txt');
    write(folder, 'repo/tools/pwn.cjs', `require('node:fs').writeFileSync(${JSON.stringify(marker.replaceAll('\\', '/'))}, 'pwned');\n`);
    write(folder, 'repo/zz.dat', 'solver changed\n');
    expect(cli(repo, 'look', id, String(pullRequestFor(repo, id, folder))).status).toBe(0);

    for (const command of ['find . -exec git pwn {} +', 'find . -execdir git pwn {} +']) {
      git(repo, ['config', 'filter.own.smudge', command]);
      const before = fingerprint(repo);
      const applied = cli(repo, 'apply', id, '1');
      expect(applied.status).toBe(3);
      expect(applied.stderr).toContain('apply-unsafe-config');
      expect(applied.stderr).toContain('filter.own.smudge');
      expect(fingerprint(repo)).toEqual(before);
    }
    expect(existsSync(marker)).toBe(false);
  });

  it('hole C: refuses the `git` operand even when every other word places outside', () => {
    const repo = filteredRepo();
    write(repo, 'tools/pwn.cjs', '// owner placeholder\n');
    git(repo, ['add', 'tools/pwn.cjs']);
    git(repo, ['-c', 'user.name=owner', '-c', 'user.email=owner@example.invalid', 'commit', '-qm', 'alias target placeholder']);
    const outside = runRoot('bt6b-out-dir');
    git(repo, ['config', 'filter.own.smudge', `find "${outside.replaceAll('\\', '/')}" -exec git pwn {} +`]);
    git(repo, ['config', 'alias.pwn', '!node tools/pwn.cjs']);
    const { id, folder } = delivered(repo);
    write(folder, 'repo/app.txt', 'fixed\n');
    expect(cli(repo, 'look', id, String(pullRequestFor(repo, id, folder))).status).toBe(0);

    const before = fingerprint(repo);
    const applied = cli(repo, 'apply', id, '1');
    expect(applied.status).toBe(3);
    expect(applied.stderr).toContain('apply-unsafe-config');
    expect(applied.stderr).toContain('tools/pwn.cjs');
    expect(fingerprint(repo)).toEqual(before);
  });

  it('hole C: refuses a host/exec wrapper (ssh, wsl, stdbuf) whose operand is a command', () => {
    const repo = filteredRepo();
    git(repo, ['config', 'alias.pwn', '!node tools/pwn.cjs']);
    const { id, folder } = delivered(repo);
    write(folder, 'repo/app.txt', 'fixed\n');
    expect(cli(repo, 'look', id, String(pullRequestFor(repo, id, folder))).status).toBe(0);

    for (const command of ['ssh localhost git pwn', 'wsl git pwn', 'stdbuf git pwn']) {
      git(repo, ['config', 'filter.own.smudge', command]);
      const before = fingerprint(repo);
      const applied = cli(repo, 'apply', id, '1');
      expect(applied.status).toBe(3);
      expect(applied.stderr).toContain('apply-unsafe-config');
      expect(applied.stderr).toContain('filter.own.smudge');
      expect(fingerprint(repo)).toEqual(before);
    }
  });

  it('hole D: refuses a command carried in an option value — --use-compress-program and spellings like it', () => {
    const repo = filteredRepo();
    write(repo, 'tools/pwn.cjs', '// owner placeholder\n');
    git(repo, ['add', 'tools/pwn.cjs']);
    git(repo, ['-c', 'user.name=owner', '-c', 'user.email=owner@example.invalid', 'commit', '-qm', 'alias target placeholder']);
    git(repo, ['config', 'alias.pwn', '!node tools/pwn.cjs']);
    const { id, folder } = delivered(repo);
    write(folder, 'repo/app.txt', 'fixed\n');
    expect(cli(repo, 'look', id, String(pullRequestFor(repo, id, folder))).status).toBe(0);

    for (const command of [
      `tar -cf "${join(runRoot('bt6b-tar'), 'x.tar').replaceAll('\\', '/')}" --use-compress-program='git pwn' zz.dat`,
      "sort --compress-program='git pwn' zz.dat",
      "tar -I 'git pwn' -cf x.tar zz.dat"
    ]) {
      git(repo, ['config', 'filter.own.smudge', command]);
      const before = fingerprint(repo);
      const applied = cli(repo, 'apply', id, '1');
      expect(applied.status).toBe(3);
      expect(applied.stderr).toContain('apply-unsafe-config');
      expect(applied.stderr).toContain('filter.own.smudge');
      expect(applied.stderr).toContain('tools/pwn.cjs');
      expect(fingerprint(repo)).toEqual(before);
    }
  });

  it('hole E: refuses a launcher when the flag is not that launcher\'s manifest flag — npm -f is --force, not a file', () => {
    const repo = filteredRepo();
    const outside = runRoot('bt6b-npm-f');
    writeFileSync(join(outside, 'package.json'), JSON.stringify({ scripts: { go: 'node -e 1' } }));
    const { id, folder } = delivered(repo);
    // The solver carries the manifest npm actually reads — `-f` moves nothing.
    write(folder, 'repo/package.json', JSON.stringify({ scripts: { bt6bpwn: `node ${join(runRoot('bt6b-pwn'), 'x.cjs').replaceAll('\\', '/')}` } }));
    write(folder, 'repo/app.txt', 'fixed\n');
    expect(cli(repo, 'look', id, String(pullRequestFor(repo, id, folder))).status).toBe(0);

    for (const command of [
      `npm run bt6bpwn -f "${outside.replaceAll('\\', '/')}"`,
      `npm -f "${outside.replaceAll('\\', '/')}" run bt6bpwn`
    ]) {
      git(repo, ['config', 'filter.own.smudge', command]);
      const before = fingerprint(repo);
      const applied = cli(repo, 'apply', id, '1');
      expect(applied.status).toBe(3);
      expect(applied.stderr).toContain('apply-unsafe-config');
      expect(applied.stderr).toContain('package.json');
      expect(fingerprint(repo)).toEqual(before);
    }
  });

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
