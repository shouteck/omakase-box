import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { answerGitHub, applyBounty, closeBounty, lookBounty, postBounty } from '../../../packages/box-bounty/index.js';
import { asOneCommand, git as safeGit, gitOutcome } from '../../../packages/box-bounty/git.js';
import { fixture } from './github-fixture.js';
import { git, makeRepo, runRoot, write } from './support.js';

const quote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;
const CLI_DIST = fileURLToPath(new URL('../../../packages/box-cli/dist/cli.js', import.meta.url));

it.skipIf(process.platform !== 'win32')('uses pinned Git and command interpreter when the CLI cwd carries replacement executables', () => fixture(context => {
  postBounty(context.repo, context.id, 'github');
  copyFileSync(process.execPath, join(context.repo, 'git.exe'));
  copyFileSync(process.execPath, join(context.repo, 'cmd.exe'));
  const result = spawnSync(process.execPath, [CLI_DIST, 'bounty', 'status', context.id], { cwd: context.repo, encoding: 'utf8' });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain(context.id);
  expect(result.stderr).not.toContain('MODULE_NOT_FOUND');
  const questions = spawnSync(process.execPath, [CLI_DIST, 'bounty', 'status', context.id, '--comments'], { cwd: context.repo, encoding: 'utf8' });
  expect(questions.status).toBe(0);
  expect(questions.stdout).toContain('next:');
}));
function program(root: string, name: string, marker: string, exit: number): string {
  const path = join(root, name);
  const code = `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'EXECUTED');`;
  write(root, name, `#!/bin/sh\n${quote(process.execPath.replaceAll('\\', '/'))} -e ${quote(code)}\nexit ${exit}\n`);
  chmodSync(path, 0o755);
  return path;
}

it('does not invoke a reference-transaction hook when creating or deleting a tool ref', () => {
  const repo = makeRepo({ 'app.txt': 'owner\n' });
  const scratch = runRoot('bt7-reference');
  const marker = join(scratch, 'reference-ran');
  const hooks = join(scratch, 'hooks'); mkdirSync(hooks);
  program(hooks, 'reference-transaction', marker, 0);
  git(repo, ['config', 'core.hooksPath', hooks]);
  const ref = 'refs/box-bt7/sentinel';
  try {
    safeGit(repo, ['update-ref', ref, git(repo, ['rev-parse', 'HEAD'])]);
    expect(existsSync(marker)).toBe(false);
  } finally { safeGit(repo, ['update-ref', '-d', ref]); }
  expect(existsSync(marker)).toBe(false);
  expect(git(repo, ['config', '--get', 'core.hooksPath'])).toBe(hooks);
});

it('does not invoke a repository-relative signing program for a tool commit', () => {
  const repo = makeRepo({ 'app.txt': 'owner\n' });
  const marker = join(runRoot('bt7-signing'), 'signing-ran');
  program(repo, 'trip-gpg', marker, 1);
  git(repo, ['config', 'gpg.program', './trip-gpg']);
  git(repo, ['config', 'user.signingkey', 'BT7-SENTINEL']);
  git(repo, ['config', 'commit.gpgSign', 'true']);
  const result = gitOutcome(repo, ['-c', 'user.name=tool', '-c', 'user.email=tool@example.invalid', 'commit', '--allow-empty', '-m', 'tool signing sentinel']);
  expect(existsSync(marker)).toBe(false);
  expect(result.status).toBe(0);
  expect(git(repo, ['config', '--get', 'commit.gpgSign'])).toBe('true');
});

it('keeps reference hooks disabled through look, apply and close', () => fixture(context => {
  postBounty(context.repo, context.id, 'github');
  context.pr('solver'); answerGitHub(context.repo, context.id, 1);
  const marker = join(context.scratch, 'reference-ran');
  const hooks = join(context.scratch, 'reference-hooks'); mkdirSync(hooks);
  program(hooks, 'reference-transaction', marker, 0);
  git(context.repo, ['config', 'core.hooksPath', hooks]);
  lookBounty(context.repo, context.id, 1);
  expect(applyBounty(context.repo, context.id, 1).outcome).toBe('applied');
  expect(existsSync(marker)).toBe(false);
  expect(closeBounty(context.repo, context.id).outcome).toBe('already-ended');
  expect(existsSync(marker)).toBe(false);
  expect(git(context.repo, ['config', '--get', 'core.hooksPath'])).toBe(hooks);
}, 'Repair app', { 'app.txt': 'broken\n' }));

// The test that stood here asserted that a configured filter never runs when the
// tool builds a tree from the owner's own files in the owner's own repository.
// That is what `create` does, and there the owner's filter must run (BT7
// Correction 1). What it guarded is now two tests in bt7-filters.test.ts:
// `create` ships the bytes the owner's clean filter stores, and `look` prints
// the stored form off objects with no filter run.

it('used as a library, reads executable-naming configuration before each call: a filter configured between two calls is still silenced', () => {
  const repo = makeRepo({ 'app.txt': 'owner\n', '.gitattributes': '*.txt filter=trip\n' });
  const sentinel = join(runRoot('bt7-pins-library'), 'filter-ran');
  write(repo, 'trip.cjs', `require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'EXECUTED');\n`);
  write(repo, 'app.txt', 'owner changed\n');
  expect(gitOutcome(repo, ['diff']).stdout).toContain('+owner changed'); // a first call, before the filter exists
  git(repo, ['config', 'filter.trip.clean', 'node trip.cjs']);
  git(repo, ['config', 'filter.trip.required', 'true']);
  const diff = gitOutcome(repo, ['diff']);
  expect(diff.status).toBe(0);
  expect(diff.stdout).toContain('+owner changed');
  expect(existsSync(sentinel)).toBe(false);
  // The trap is live: the same read by plain Git, without the tool's pins, runs it.
  spawnSync('git', ['-C', repo, 'diff'], { encoding: 'utf8' });
  expect(existsSync(sentinel)).toBe(true);
});

it('a library command reads the names once for its own length and remembers nothing afterwards: a filter configured between two commands is silenced in the second', () => {
  const repo = makeRepo({ 'app.txt': 'owner\n', '.gitattributes': '*.txt filter=trip\n' });
  const sentinel = join(runRoot('bt7-pins-command'), 'filter-ran');
  write(repo, 'trip.cjs', `require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'EXECUTED');\n`);
  write(repo, 'app.txt', 'owner changed\n');
  // One command, several calls: the first reads the names, before the filter exists.
  asOneCommand(() => {
    for (let call = 0; call < 3; call += 1) expect(gitOutcome(repo, ['diff']).stdout).toContain('+owner changed');
  });
  git(repo, ['config', 'filter.trip.clean', 'node trip.cjs']);
  git(repo, ['config', 'filter.trip.required', 'true']);
  // The next command reads them again, nested calls included.
  asOneCommand(() => asOneCommand(() => {
    const diff = gitOutcome(repo, ['diff']);
    expect(diff.status).toBe(0);
    expect(diff.stdout).toContain('+owner changed');
  }));
  expect(existsSync(sentinel)).toBe(false);
  // And a bare call after a command remembers nothing from it either.
  git(repo, ['config', 'filter.trip.process', 'node trip.cjs']);
  expect(gitOutcome(repo, ['diff']).stdout).toContain('+owner changed');
  expect(existsSync(sentinel)).toBe(false);
  // The trap is live: the same read by plain Git, without the tool's pins, runs it.
  spawnSync('git', ['-C', repo, 'diff'], { encoding: 'utf8' });
  expect(existsSync(sentinel)).toBe(true);
});
