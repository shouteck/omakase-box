import { pullRequestFor } from './github-solver.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixture } from './github-fixture.js';
import { fingerprint, git, makeRepo, runRoot, write } from './support.js';
import { cli, delivered, filteredRepo, inTreeFilter, loggingFilter, readLog, withLog } from './bt6b-shared.js';

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

describe('defect 1 — a merge must never run a program the solution can supply or change', () => {
  it('refuses apply when the filter program lives inside the repository and the solution replaces it — before anything is touched', () => withLog(logFile => {
    const repo = filteredRepo();
    inTreeFilter(repo);
    const { id, folder } = delivered(repo);
    // The solver's return: a new filter program and a change to a .dat file
    // Git writes after it — the trap BT7's second pass reproduced.
    write(folder, 'repo/tools/filter.cjs', loggingFilter('SOLVER'));
    write(folder, 'repo/zz.dat', 'solver changed\n');
    expect(cli(repo, 'look', id, String(pullRequestFor(repo, id, folder))).status).toBe(0);

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
    expect(cli(repo, 'look', id, String(pullRequestFor(repo, id, folder))).status).toBe(0);

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
    expect(cli(repo, 'look', id, String(pullRequestFor(repo, id, folder))).status).toBe(0);

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
    expect(cli(repo, 'look', id, String(pullRequestFor(repo, id, folder))).status).toBe(0);

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
    expect(cli(repo, 'look', id, String(pullRequestFor(repo, id, folder))).status).toBe(0);

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
    // refs/heads/ spelled out: ls-remote's `box-bounty/<id>` pattern also
    // matches BT32's chain ref `refs/box-bounty/<id>` — the branch tip is
    // what this test reads the wip blob from.
    const tip = git(context.repo, ['ls-remote', remote, `refs/heads/box-bounty/${context.id}`]).split(/\s/)[0];
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
