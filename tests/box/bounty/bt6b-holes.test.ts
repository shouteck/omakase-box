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
  it('hole 1: refuses a bare interpreter filter — the filtered stream itself is the program', () => {
    const repo = filteredRepo();
    // `node` with no script file operand reads JavaScript from stdin — and
    // a smudge filter's stdin is the blob. The solver's .dat is the program.
    git(repo, ['config', 'filter.own.smudge', 'node']);
    const { id, folder } = delivered(repo);
    const marker = join(runRoot('bt6b-pwn'), 'pwned.txt');
    write(folder, 'repo/zz.dat', `require('node:fs').writeFileSync(${JSON.stringify(marker.replaceAll('\\', '/'))}, 'pwned');\n`);
    write(folder, 'repo/app.txt', 'fixed\n');
    expect(cli(repo, 'look', id, String(pullRequestFor(repo, id, folder))).status).toBe(0);

    const before = fingerprint(repo);
    const applied = cli(repo, 'apply', id, '1');
    expect(applied.status).toBe(3);
    expect(applied.stderr).toContain('apply-unsafe-config');
    expect(applied.stderr).toContain('filter.own.smudge');
    expect(applied.stderr).toContain('node');
    expect(existsSync(marker)).toBe(false);
    expect(fingerprint(repo)).toEqual(before);
  });

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

  it('hole 2: refuses a `git` filter command whose alias lands inside the tree', () => {
    const repo = filteredRepo();
    write(repo, 'tools/pwn.cjs', '// owner placeholder\n');
    git(repo, ['add', 'tools/pwn.cjs']);
    git(repo, ['-c', 'user.name=owner', '-c', 'user.email=owner@example.invalid', 'commit', '-qm', 'alias target placeholder']);
    git(repo, ['config', 'filter.own.smudge', 'git pwn']);
    git(repo, ['config', 'alias.pwn', '!node tools/pwn.cjs']);
    const { id, folder } = delivered(repo);
    write(folder, 'repo/tools/pwn.cjs', `require('node:fs').writeFileSync(${JSON.stringify(join(runRoot('bt6b-pwn'), 'alias.txt').replaceAll('\\', '/'))}, 'pwned');\n`);
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

  it('hole 3: refuses an include.path that escapes .git/config into the tree', () => {
    const repo = filteredRepo();
    // Git resolves a relative include.path against the including file's
    // directory — `.git/../armed.conf` is the worktree root.
    write(repo, 'armed.conf', '[filter "arm"]\n\tclean = node tools/pwn.cjs\n');
    git(repo, ['config', 'include.path', '../armed.conf']);
    const { id, folder } = delivered(repo);
    write(folder, 'repo/app.txt', 'fixed\n');
    expect(cli(repo, 'look', id, String(pullRequestFor(repo, id, folder))).status).toBe(0);

    const before = fingerprint(repo);
    const applied = cli(repo, 'apply', id, '1');
    expect(applied.status).toBe(3);
    expect(applied.stderr).toContain('apply-unsafe-config');
    expect(applied.stderr).toContain('include.path');
    expect(applied.stderr).toContain('armed.conf');
    expect(fingerprint(repo)).toEqual(before);
  });

  it('hole 3: refuses a `~/`-spelled include that lands inside the tree — the test places the repo under the home directory', () => {
    // A `~/…` include can only land inside a repository that lives under ~,
    // so this test builds its fixture under the home directory itself rather
    // than assuming the host's temp root is there (on Linux it is /tmp). The
    // folder is this test's own, created directly under ~ and removed by its
    // exact path below.
    const home = mkdtempSync(join(homedir(), 'box-bt15-ci-home-include-'));
    try {
      const repo = filteredRepoUnder(home);
      const fromHome = relative(homedir(), repo).split(sep).join('/');
      expect(fromHome.startsWith('..')).toBe(false); // the test places the repo under ~
      write(repo, 'armed.conf', '[filter "arm"]\n\tclean = node tools/pwn.cjs\n');
      git(repo, ['config', 'include.path', `~/${fromHome}/armed.conf`]);
      const { id, folder } = delivered(repo);
      write(folder, 'repo/app.txt', 'fixed\n');
      expect(cli(repo, 'look', id, String(pullRequestFor(repo, id, folder))).status).toBe(0);

      const before = fingerprint(repo);
      const applied = cli(repo, 'apply', id, '1');
      expect(applied.status).toBe(3);
      expect(applied.stderr).toContain('apply-unsafe-config');
      expect(applied.stderr).toContain('include.path');
      expect(fingerprint(repo)).toEqual(before);
    } finally {
      // In-process calls (postBounty and friends) cached this repo's
      // box.db connection in this worker — close it before removal or
      // Windows refuses to delete the still-open WAL files.
      closeStores();
      rmSync(home, { recursive: true, force: true, maxRetries: 40, retryDelay: 500 });
    }
  });

  it('hole 3: follows a nested include — a relative path inside an outside file can still land in the tree', () => {
    const repo = filteredRepo();
    const dir = runRoot('bt6b-inc');
    const outside = join(dir, 'outside.conf');
    writeFileSync(outside, `[include]\n\tpath = ${relative(dir, join(repo, 'armed.conf')).replaceAll('\\', '/')}\n`);
    write(repo, 'armed.conf', '[filter "arm"]\n\tclean = node tools/pwn.cjs\n');
    git(repo, ['config', 'include.path', outside.replaceAll('\\', '/')]);
    const { id, folder } = delivered(repo);
    write(folder, 'repo/app.txt', 'fixed\n');
    expect(cli(repo, 'look', id, String(pullRequestFor(repo, id, folder))).status).toBe(0);

    const before = fingerprint(repo);
    const applied = cli(repo, 'apply', id, '1');
    expect(applied.status).toBe(3);
    expect(applied.stderr).toContain('apply-unsafe-config');
    expect(applied.stderr).toContain('armed.conf');
    expect(fingerprint(repo)).toEqual(before);
  });

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
