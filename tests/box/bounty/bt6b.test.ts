import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixture } from './github-fixture.js';
import { CLI_DIST, fingerprint, git, makeRepo, ownerSays, runRoot, write } from './support.js';

// BT6b: "nothing a solver wrote runs" holds for the tool's own merge whatever
// the owner's Git configuration is, and a work-in-progress commit holds the
// same filtered bytes `create` would ship. Both defects were reproduced on
// master through the built CLI; every run below is `node dist/cli.js bounty`.
//
// Defect 1: owner configuration `filter.own.clean/smudge = node
// tools/filter.cjs`, committed `*.dat filter=own`, tracked tools/filter.cjs.
// A solution that replaces tools/filter.cjs and changes a .dat file Git
// writes after it makes the merge run the solver's program on the owner's
// machine. The fix: `apply` refuses by name whenever a configured command
// Git could run at merge/checkout resolves inside the repository or cannot
// be placed, before the working tree, index or branch is touched. Reversing
// a landed merge is plain `git revert` — the owner's own Git on the owner's
// own configuration — so there is no tool-side undo to guard.
//
// Defect 2: `post --to github --with-changes` pushed raw working-tree bytes
// of a clean-filtered file. The fix hashes each placed file exactly as `git
// add` would — clean filter applied — and refuses the post when the filtered
// form cannot be produced.

const cli = (repo: string, ...args: string[]) =>
  spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args, '--repo', repo], { encoding: 'utf8', env: process.env });

// A clean/smudge filter that passes bytes through unchanged and logs every
// run — the tag says whose program ran (the owner's or the solver's). The log
// path rides an environment variable so the same script works from the bounty
// folder copy a solver edits.
const loggingFilter = (tag: string): string => [
  "const fs = require('node:fs');",
  `try { fs.appendFileSync(process.env.BT6B_FILTER_LOG, ${JSON.stringify(tag)} + ' ' + process.argv[2] + '\\n'); } catch {}`,
  'process.stdout.write(fs.readFileSync(0));'
].join('\n');

const LOG_ENV = 'BT6B_FILTER_LOG';

// A repository with a committed .gitattributes, a tracked filter program and
// two .dat files — the tool's filter configuration is set separately so the
// armed variant can point it outside or inside the tree.
function filteredRepo(): string {
  return armFilter(makeRepo({ 'app.txt': 'broken\n' }));
}

// The same fixture, built at a path the caller picks instead of the run
// root — a `~/`-spelled include reaches the tree only while the repository
// itself lives under the home directory.
function filteredRepoUnder(parent: string): string {
  const repo = join(parent, 'repo');
  mkdirSync(repo, { recursive: true });
  git(repo, ['init', '-b', 'main', '-q']);
  git(repo, ['config', 'core.autocrlf', 'false']);
  write(repo, 'app.txt', 'broken\n');
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'user.name=owner', '-c', 'user.email=owner@example.invalid', 'commit', '-qm', 'base']);
  return armFilter(repo);
}

function armFilter(repo: string): string {
  write(repo, '.gitattributes', '*.dat filter=own\n');
  write(repo, 'tools/filter.cjs', loggingFilter('OWNER'));
  write(repo, 'data.dat', 'first\n');
  write(repo, 'zz.dat', 'second\n');
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'user.name=owner', '-c', 'user.email=owner@example.invalid', 'commit', '-qm', 'filtered files']);
  return repo;
}

const inTreeFilter = (repo: string): void => {
  git(repo, ['config', 'filter.own.clean', 'node tools/filter.cjs clean']);
  git(repo, ['config', 'filter.own.smudge', 'node tools/filter.cjs smudge']);
  git(repo, ['config', 'filter.own.required', 'true']);
};

const readLog = (logFile: string): string[] =>
  existsSync(logFile) ? readFileSync(logFile, 'utf8').split('\n').filter(line => line !== '') : [];

// The outbound journey through the CLI: create, post to a folder — the
// owner already allowed the tool (BT8). The returned value is the delivered
// bounty folder a solver edits.
function delivered(repo: string): { id: string; folder: string } {
  write(repo, 'TASK.md', 'the task\n');
  const out = join(runRoot('bt6b-out'), 'bounty');
  const created = cli(repo, 'create', '--task', join(repo, 'TASK.md'), '--why', 'a reason', '--out', out);
  expect(created.status).toBe(0);
  const id = /bt-[a-f0-9]{12}/.exec(created.stdout)![0];
  ownerSays(repo, 'allowed');
  const dest = join(runRoot('bt6b-dest'), 'inbox');
  expect(cli(repo, 'post', id, '--to', dest).status).toBe(0);
  return { id, folder: join(dest, id) };
}

function withLog<T>(run: (logFile: string) => T): T {
  const logFile = join(runRoot('bt6b-log'), 'runs.log');
  const before = process.env[LOG_ENV];
  process.env[LOG_ENV] = logFile;
  try { return run(logFile); }
  finally { if (before === undefined) delete process.env[LOG_ENV]; else process.env[LOG_ENV] = before; }
}

describe('defect 1 — a merge must never run a program the solution can supply or change', () => {
  it('refuses apply when the filter program lives inside the repository and the solution replaces it — before anything is touched', () => withLog(logFile => {
    const repo = filteredRepo();
    inTreeFilter(repo);
    const { id, folder } = delivered(repo);
    // The solver's return: a new filter program and a change to a .dat file
    // Git writes after it — the trap BT7's second pass reproduced.
    write(folder, 'repo/tools/filter.cjs', loggingFilter('SOLVER'));
    write(folder, 'repo/zz.dat', 'solver changed\n');
    expect(cli(repo, 'look', id, '--from', folder).status).toBe(0);

    const before = fingerprint(repo);
    const applied = cli(repo, 'apply', id, '1');
    expect(applied.status).toBe(3);
    expect(applied.stderr).toContain('apply-unsafe-config');
    expect(applied.stderr).toContain('filter.own.');
    expect(applied.stderr).toContain('tools/filter.cjs');
    // Nothing ran the solver's program, and nothing moved.
    expect(readLog(logFile).filter(line => line.startsWith('SOLVER'))).toEqual([]);
    expect(fingerprint(repo)).toEqual(before);
    expect(readFileSync(join(repo, 'tools', 'filter.cjs'), 'utf8')).toBe(loggingFilter('OWNER'));
  }));

  it('refuses apply when the in-tree program is unchanged but calls a file the solution changes — the indirection case', () => withLog(logFile => {
    const repo = filteredRepo();
    write(repo, 'tools/key.txt', 'owner key\n');
    git(repo, ['add', 'tools/key.txt']);
    git(repo, ['-c', 'user.name=owner', '-c', 'user.email=owner@example.invalid', 'commit', '-qm', 'a key the filter reads']);
    inTreeFilter(repo);
    const { id, folder } = delivered(repo);
    // The program itself is untouched; the file it reads is not. What a
    // program reads cannot be bounded, so any in-tree program refuses.
    write(folder, 'repo/tools/key.txt', 'solver key\n');
    write(folder, 'repo/zz.dat', 'solver changed\n');
    expect(cli(repo, 'look', id, '--from', folder).status).toBe(0);

    const before = fingerprint(repo);
    const applied = cli(repo, 'apply', id, '1');
    expect(applied.status).toBe(3);
    expect(applied.stderr).toContain('apply-unsafe-config');
    expect(readLog(logFile).filter(line => line.startsWith('SOLVER'))).toEqual([]);
    expect(fingerprint(repo)).toEqual(before);
  }));

  it('refuses apply for a merge driver whose program is inside the repository', () => {
    const repo = filteredRepo();
    write(repo, '.gitattributes', '*.dat filter=own\n*.drv merge=own\n');
    write(repo, 'tools/drv.cjs', "// merge driver the owner configures\n");
    git(repo, ['add', '-A']);
    git(repo, ['-c', 'user.name=owner', '-c', 'user.email=owner@example.invalid', 'commit', '-qm', 'a merge driver']);
    git(repo, ['config', 'merge.own.driver', 'node tools/drv.cjs %O %A %B %L']);
    const { id, folder } = delivered(repo);
    write(folder, 'repo/tools/drv.cjs', "// the solver's driver\n");
    write(folder, 'repo/app.txt', 'fixed\n');
    expect(cli(repo, 'look', id, '--from', folder).status).toBe(0);

    const before = fingerprint(repo);
    const applied = cli(repo, 'apply', id, '1');
    expect(applied.status).toBe(3);
    expect(applied.stderr).toContain('apply-unsafe-config');
    expect(applied.stderr).toContain('merge.own.driver');
    expect(applied.stderr).toContain('tools/drv.cjs');
    expect(fingerprint(repo)).toEqual(before);
  });

  it('refuses apply for a configured command the tool cannot place inside or outside the tree', () => {
    const repo = makeRepo({ 'app.txt': 'broken\n' });
    git(repo, ['config', 'filter.mystery.clean', 'bt6b-no-such-program %f']);
    const { id, folder } = delivered(repo);
    write(folder, 'repo/app.txt', 'fixed\n');
    expect(cli(repo, 'look', id, '--from', folder).status).toBe(0);

    const before = fingerprint(repo);
    const applied = cli(repo, 'apply', id, '1');
    expect(applied.status).toBe(3);
    expect(applied.stderr).toContain('apply-unsafe-config');
    expect(applied.stderr).toContain('filter.mystery.clean');
    expect(fingerprint(repo)).toEqual(before);
  });

  it('lands a solution as today when every configured command resolves outside the repository — filters applied', () => withLog(logFile => {
    const repo = filteredRepo();
    const external = join(runRoot('bt6b-ext'), 'crypt.cjs');
    writeFileSync(external, loggingFilter('EXTERNAL'));
    const command = (mode: string): string => `"${process.execPath.replaceAll('\\', '/')}" "${external.replaceAll('\\', '/')}" ${mode}`;
    git(repo, ['config', 'filter.own.clean', command('clean')]);
    git(repo, ['config', 'filter.own.smudge', command('smudge')]);
    git(repo, ['config', 'filter.own.required', 'true']);
    const { id, folder } = delivered(repo);
    write(folder, 'repo/new.dat', 'solver new\n');
    write(folder, 'repo/app.txt', 'fixed\n');
    expect(cli(repo, 'look', id, '--from', folder).status).toBe(0);

    const applied = cli(repo, 'apply', id, '1');
    expect(applied.status).toBe(0);
    expect(applied.stdout).toContain('applied');
    // The owner's filter ran on the landed file — the external program is the
    // owner's, so apply behaves exactly as on master.
    expect(readLog(logFile).some(line => line.startsWith('EXTERNAL smudge'))).toBe(true);
    expect(readFileSync(join(repo, 'new.dat'), 'utf8')).toBe('solver new\n');
  }));
});

describe('defect 2 — a work-in-progress commit holds the filtered bytes create would ship', () => {
  // The encrypting filter of bt7-filters: clean stores `ENC:` + text, smudge
  // strips it, and the program lives outside the repository.
  function cryptFilter(): (mode: string) => string {
    const script = join(runRoot('bt6b-crypt'), 'crypt.cjs');
    writeFileSync(script, [
      "const fs = require('node:fs');",
      'const mode = process.argv[2];',
      'const input = fs.readFileSync(0);',
      "const stored = input.subarray(0, 4).toString() === 'ENC:';",
      "process.stdout.write(mode === 'clean' ? (stored ? input : Buffer.concat([Buffer.from('ENC:'), input])) : (stored ? input.subarray(4) : input));"
    ].join('\n'));
    const command = (mode: string): string => `"${process.execPath.replaceAll('\\', '/')}" "${script.replaceAll('\\', '/')}" ${mode}`;
    return command;
  }

  function armCrypt(repo: string): void {
    const command = cryptFilter();
    git(repo, ['config', 'filter.crypt.clean', command('clean')]);
    git(repo, ['config', 'filter.crypt.smudge', command('smudge')]);
    git(repo, ['config', 'filter.crypt.required', 'true']);
    write(repo, '.gitattributes', '*.dat filter=crypt\n');
    write(repo, 'secret.dat', 'committed plaintext\n');
    git(repo, ['add', '.gitattributes', 'secret.dat']);
    git(repo, ['-c', 'user.name=owner', '-c', 'user.email=owner@example.invalid', 'commit', '-qm', 'a filtered file']);
    git(repo, ['push', 'https://github.com/owner/project.git', 'main']);
  }

  it('pushes the stored form of a clean-filtered file, never the working-tree bytes', () => fixture(context => {
    armCrypt(context.repo);
    write(context.repo, 'secret.dat', 'edited plaintext\n');
    expect(cli(context.repo, 'post', context.id, '--to', 'github', '--with-changes').status).toBe(0);
    const remote = 'https://github.com/owner/project.git';
    const tip = git(context.repo, ['ls-remote', remote, `box-bounty/${context.id}`]).split(/\s/)[0];
    expect(tip).toMatch(/^[a-f0-9]{40}$/);
    // The pushed work-in-progress commit carries the filtered bytes — the
    // same form `create` ships — never the plaintext working-tree form.
    expect(git(context.repo, ['cat-file', 'blob', `${tip}:secret.dat`])).toBe('ENC:edited plaintext');
  }, 'Repair app', { 'app.txt': 'broken\n' }));

  it('refuses the post by name when the filtered form cannot be produced — nothing is pushed', () => fixture(context => {
    armCrypt(context.repo);
    // An untracked .dat file named --include: it reaches the work-in-progress
    // build, where its blob is hashed through the clean filter. The filter
    // breaks on this file's bytes only — the refusal lands exactly where the
    // filtered form is built, before the publish or the owner hold.
    write(context.repo, 'new.dat', 'FAIL this\n');
    const picky = join(runRoot('bt6b-picky'), 'picky.cjs');
    writeFileSync(picky, `let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{if(d.startsWith('FAIL'))process.exit(1);process.stdout.write('ENC:'+d)});\n`);
    git(context.repo, ['config', 'filter.crypt.clean', `"${process.execPath.replaceAll('\\', '/')}" "${picky.replaceAll('\\', '/')}"`]);
    const posted = cli(context.repo, 'post', context.id, '--to', 'github', '--include', 'new.dat');
    expect(posted.status).toBe(3);
    expect(posted.stderr).toContain('github-filter-failed');
    expect(posted.stderr).toContain('new.dat');
    const remote = 'https://github.com/owner/project.git';
    expect(git(context.repo, ['ls-remote', remote, 'box-bounty/*'])).toBe('');
    expect(readFileSync(join(context.repo, 'new.dat'), 'utf8')).toBe('FAIL this\n');
  }, 'Repair app', { 'app.txt': 'broken\n' }));
});

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
    expect(cli(repo, 'look', id, '--from', folder).status).toBe(0);

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
    expect(cli(repo, 'look', id, '--from', folder).status).toBe(0);

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
    expect(cli(repo, 'look', id, '--from', folder).status).toBe(0);

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
    expect(cli(repo, 'look', id, '--from', folder).status).toBe(0);

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
    expect(cli(repo, 'look', id, '--from', folder).status).toBe(0);

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
    // than assuming the host's temp root is there.
    const home = mkdtempSync(join(homedir(), 'bt6bhh-'));
    try {
      const repo = filteredRepoUnder(home);
      const fromHome = relative(homedir(), repo).split(sep).join('/');
      expect(fromHome.startsWith('..')).toBe(false); // the test places the repo under ~
      write(repo, 'armed.conf', '[filter "arm"]\n\tclean = node tools/pwn.cjs\n');
      git(repo, ['config', 'include.path', `~/${fromHome}/armed.conf`]);
      const { id, folder } = delivered(repo);
      write(folder, 'repo/app.txt', 'fixed\n');
      expect(cli(repo, 'look', id, '--from', folder).status).toBe(0);

      const before = fingerprint(repo);
      const applied = cli(repo, 'apply', id, '1');
      expect(applied.status).toBe(3);
      expect(applied.stderr).toContain('apply-unsafe-config');
      expect(applied.stderr).toContain('include.path');
      expect(fingerprint(repo)).toEqual(before);
    } finally {
      rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
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
    expect(cli(repo, 'look', id, '--from', folder).status).toBe(0);

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
    expect(cli(repo, 'look', id, '--from', folder).status).toBe(0);

    const applied = cli(repo, 'apply', id, '1');
    expect(applied.status).toBe(0);
    expect(applied.stdout).toContain('applied');
    expect(readFileSync(join(repo, 'app.txt'), 'utf8')).toBe('fixed\n');
  });
});

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
    expect(cli(repo, 'look', id, '--from', folder).status).toBe(0);

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
    expect(cli(repo, 'look', id, '--from', folder).status).toBe(0);

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
    expect(cli(repo, 'look', id, '--from', folder).status).toBe(0);

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
    expect(cli(repo, 'look', id, '--from', folder).status).toBe(0);

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
    expect(cli(repo, 'look', id, '--from', folder).status).toBe(0);

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
    expect(cli(repo, 'look', id, '--from', folder).status).toBe(0);

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
    expect(cli(repo, 'look', id, '--from', folder).status).toBe(0);

    const applied = cli(repo, 'apply', id, '1');
    expect(applied.status).toBe(0);
    expect(readLog(logFile).some(line => line.startsWith('EXTERNAL'))).toBe(true);
    expect(readFileSync(join(repo, 'zz.dat'), 'utf8')).toBe('solver changed\n');
  }));
});

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
    expect(cli(repo, 'look', id, '--from', folder).status).toBe(0);

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
    expect(cli(repo, 'look', id, '--from', folder).status).toBe(0);

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
    expect(cli(repo, 'look', id, '--from', folder).status).toBe(0);

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
    expect(cli(repo, 'look', id, '--from', folder).status).toBe(0);

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
    expect(cli(repo, 'look', id, '--from', folder).status).toBe(0);

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
    expect(cli(repo, 'look', id, '--from', folder).status).toBe(0);

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
    expect(cli(repo, 'look', id, '--from', folder).status).toBe(0);

    const applied = cli(repo, 'apply', id, '1');
    expect(applied.status).toBe(0);
    expect(applied.stdout).toContain('applied');
  });
});
