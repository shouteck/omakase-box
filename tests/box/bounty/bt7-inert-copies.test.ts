import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { answerGitHub, confirmBounty, loadRecord, lookBounty, postBounty, questionsBounty, renderStatus, unlookBounty } from '../../../packages/box-bounty/index.js';
import { fixture, refused } from './github-fixture.js';
import type { GithubFixture } from './github-fixture.js';
import { ahead, ordinaryTree, plainGit } from './ordinary-tree.js';
import { git, runRoot, write } from './support.js';

// BT7 Correction 2. The agent works inside a look copy with ordinary Git, and
// the tool tells it to. So a copy has to be safe for anybody's Git, not only
// for the tool's own pinned calls: these tests run Git exactly as an agent
// types it. Each trap is first shown live in an ordinary linked working tree
// of the same commit — what a copy used to be — and then silent in the copy.

const pause = (ms: number): void => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };
const fold = (path: string): string => path.replaceAll('\\', '/').toLowerCase();
const committer = ['-c', 'user.name=agent', '-c', 'user.email=agent@example.invalid'];

function posted(context: GithubFixture): void {
  confirmBounty(context.repo, context.id, 'github');
  postBounty(context.repo, context.id, 'github');
}

// What an agent does in a copy, typed as an agent types it.
function agentWorksIn(copy: string, edit: string): void {
  for (const file of ['data.dat', 'zz.dat', 'app.txt']) if (existsSync(join(copy, file))) ahead(join(copy, file));
  plainGit(copy, ['status']);
  plainGit(copy, ['diff']);
  plainGit(copy, ['log', '-p', '-1']);
  writeFileSync(join(copy, edit), 'edited by the agent\n');
  plainGit(copy, ['diff']);
  plainGit(copy, ['stash']);
  plainGit(copy, ['stash', 'pop']);
  plainGit(copy, ['add', '-A']);
  plainGit(copy, [...committer, 'commit', '-m', 'the agent commits in the copy']);
  writeFileSync(join(copy, edit), 'edited again\n');
  plainGit(copy, ['checkout', '--', '.']);
  plainGit(copy, ['status']);
}

// The second pass's blocker 1. The owner's filter command names a program by a
// path inside the repository; the solution replaces that program.
const filterLog = join(runRoot('bt7-inert-log'), 'ran.log');
const filterProgram = (who: string): string => `require('node:fs').appendFileSync(${JSON.stringify(filterLog)}, '${who} ' + process.argv[2] + ' ' + process.cwd() + '\\n');\nprocess.stdin.pipe(process.stdout);\n`;
const filterRuns = (): string[] => existsSync(filterLog) ? readFileSync(filterLog, 'utf8').split('\n').filter(Boolean) : [];
const filterFiles = { 'app.txt': 'broken\n', 'untouched.txt': 'owner bytes\n', 'data.dat': 'data\n', 'zz.dat': 'zz\n', '.gitattributes': '*.dat filter=own\n', 'tools/filter.cjs': filterProgram('OWNER') };

for (const solverAttributes of [false, true]) {
  it(`plain Git in a look copy runs no filter program the solution replaced${solverAttributes ? ', also for files only the solution\'s attributes mark' : ''}; the same commit in an ordinary working tree does`, () => fixture(context => {
    git(context.repo, ['config', 'filter.own.clean', 'node tools/filter.cjs clean']);
    git(context.repo, ['config', 'filter.own.smudge', 'node tools/filter.cjs smudge']);
    // The owner's Git identity, kept in the repository's own configuration.
    git(context.repo, ['config', 'user.name', 'Owner "Q" \\ Name']);
    git(context.repo, ['config', 'user.email', 'owner@example.invalid']);
    posted(context);
    context.pr('solver', { 'tools/filter.cjs': filterProgram('SOLVER'), ...(solverAttributes ? { '.gitattributes': '*.dat filter=own\n*.txt filter=own\n' } : {}) });
    answerGitHub(context.repo, context.id, 1);
    const commit = loadRecord(context.repo, context.id).attempts?.[0]?.commit;
    if (commit === undefined) throw new Error('missing solution');
    const ownerConfig = readFileSync(join(context.repo, '.git', 'config'), 'utf8');
    const ownerTrees = git(context.repo, ['worktree', 'list', '--porcelain']);

    // The trap is live: the same commit in an ordinary working tree of this repository.
    writeFileSync(filterLog, '');
    const ordinary = ordinaryTree(context.repo, commit, join(context.scratch, 'ordinary'));
    try {
      expect(filterRuns()).toEqual([]);
      for (const file of ['data.dat', 'zz.dat', 'app.txt']) ahead(join(ordinary.path, file));
      plainGit(ordinary.path, ['status']);
      const ran = filterRuns().filter(line => line.startsWith('SOLVER ') && fold(line).endsWith(fold(ordinary.path)));
      expect(ran.length).toBeGreaterThan(0);
    } finally { ordinary.remove(); }

    // The look copy: nothing at all runs, the owner's program included.
    writeFileSync(filterLog, '');
    const looked = lookBounty(context.repo, context.id, 1);
    expect(readFileSync(join(looked.copy.path, 'tools', 'filter.cjs'), 'utf8')).toBe(filterProgram('SOLVER'));
    agentWorksIn(looked.copy.path, 'data.dat');
    expect(filterRuns()).toEqual([]);

    // Built without touching the owner's repository: its configuration is as it
    // was, and it has gained no working tree and no branch.
    expect(readFileSync(join(context.repo, '.git', 'config'), 'utf8')).toBe(ownerConfig);
    expect(git(context.repo, ['worktree', 'list', '--porcelain'])).toBe(ownerTrees);
    expect(git(context.repo, ['branch', '--list', 'box-bt7/*'])).toBe('');
    // Plain values are repeated in a copy: who commits, and line endings.
    expect(plainGit(looked.copy.path, ['config', 'user.name']).stdout.trim()).toBe('Owner "Q" \\ Name');
    expect(plainGit(looked.copy.path, ['config', 'user.email']).stdout.trim()).toBe('owner@example.invalid');
    expect(plainGit(looked.copy.path, ['config', 'core.autocrlf']).stdout.trim()).toBe('false');

    unlookBounty(context.repo, context.id, 1);
    expect(filterRuns()).toEqual([]);
    expect(existsSync(looked.copy.path)).toBe(false);
    expect(existsSync(join(context.repo, '.git', 'box-bt7-copies'))).toBe(false);
  }, 'Repair app', filterFiles));
}

it('plain Git in a copy runs nothing the user-level configuration points into the working tree — a hooks folder, a file-system monitor, a filter, a merge driver, a diff driver, a text conversion — while an ordinary working tree does', () => fixture(context => {
  posted(context);
  const sentinel = join(context.scratch, 'solver-ran');
  const hook = '#!/bin/sh\nnode trip.cjs\n';
  context.pr('solver', { '.gitattributes': '* filter=g merge=g diff=g\n', 'trip.cjs': `require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'EXECUTED');\n`, '.githooks/pre-commit': hook, '.githooks/post-checkout': hook, '.githooks/post-index-change': hook });
  answerGitHub(context.repo, context.id, 1);
  const commit = loadRecord(context.repo, context.id).attempts?.[0]?.commit;
  if (commit === undefined) throw new Error('missing solution');
  // The owner's own user-level settings, each naming its program by a relative path.
  const globalConfig = join(context.scratch, 'user.gitconfig');
  writeFileSync(globalConfig, ['[core]', '\thooksPath = .githooks', '\tfsmonitor = node trip.cjs', '[filter "g"]', '\tclean = node trip.cjs', '\tsmudge = node trip.cjs', '[merge "g"]', '\tdriver = node trip.cjs', '[diff "g"]', '\ttextconv = node trip.cjs', '\tcommand = node trip.cjs', ''].join('\n'));
  const before = process.env['GIT_CONFIG_GLOBAL'];
  process.env['GIT_CONFIG_GLOBAL'] = globalConfig;
  try {
    // The trap is live: an ordinary working tree of the same commit.
    const ordinary = ordinaryTree(context.repo, commit, join(context.scratch, 'ordinary'));
    try {
      expect(existsSync(sentinel)).toBe(false);
      ahead(join(ordinary.path, 'app.txt'));
      plainGit(ordinary.path, ['status']);
      expect(existsSync(sentinel)).toBe(true);
    } finally { ordinary.remove(); rmSync(sentinel, { force: true }); }

    const looked = lookBounty(context.repo, context.id, 1);
    expect(readFileSync(join(looked.copy.path, '.githooks', 'pre-commit'), 'utf8')).toBe(hook);
    agentWorksIn(looked.copy.path, 'app.txt');
    expect(existsSync(sentinel)).toBe(false);
    unlookBounty(context.repo, context.id, 1);
    expect(existsSync(sentinel)).toBe(false);
  } finally {
    if (before === undefined) delete process.env['GIT_CONFIG_GLOBAL']; else process.env['GIT_CONFIG_GLOBAL'] = before;
  }
}, 'Repair app', { 'app.txt': 'broken\n', 'untouched.txt': 'owner bytes\n' }));

// A process sitting in a folder keeps Windows from removing it.
function holderIn(folder: string, stop: string): () => void {
  const holder = spawn(process.execPath, ['-e', `setInterval(() => { if (require('node:fs').existsSync(${JSON.stringify(stop)})) process.exit(0); }, 50);`], { cwd: folder, stdio: 'ignore' });
  const gone = (): boolean => { try { process.kill(holder.pid!, 0); return false; } catch { return true; } };
  pause(500);
  return () => { writeFileSync(stop, ''); for (let waited = 0; waited < 100 && !gone(); waited += 1) pause(100); };
}

const strangers = (folder: string): void => { mkdirSync(join(folder, 'sub'), { recursive: true }); writeFileSync(join(folder, 'keep.txt'), 'KEEP'); writeFileSync(join(folder, 'sub', 'more.txt'), 'MORE'); };
const strangersIntact = (folder: string): void => { expect(readFileSync(join(folder, 'keep.txt'), 'utf8')).toBe('KEEP'); expect(readFileSync(join(folder, 'sub', 'more.txt'), 'utf8')).toBe('MORE'); };

it.skipIf(process.platform !== 'win32')('a removal that was interrupted never deletes somebody else\'s folder found at the path afterwards: unlook refuses it by name, leaves it untouched, and ends with nothing left once it is moved away', () => fixture(context => {
  posted(context);
  context.pr('solver');
  answerGitHub(context.repo, context.id, 1);
  const lookPath = lookBounty(context.repo, context.id, 1).copy.path;

  // A process inside the copy keeps Windows from removing it: what is left is
  // the tool's own remnant, and look says so and names unlook.
  const release = holderIn(lookPath, join(context.scratch, 'stop-look'));
  try {
    refused(() => unlookBounty(context.repo, context.id, 1), 'copy-in-use');
    expect(existsSync(lookPath)).toBe(true);
    try { lookBounty(context.repo, context.id, 1); expect.unreachable('a half-removed copy must refuse'); }
    catch (error) {
      expect(error).toMatchObject({ reason: 'copy-half-removed' });
      expect(String(error)).toContain(`box bounty unlook ${context.id} 1`);
      expect(String(error)).not.toContain('move it away');
    }
  } finally { release(); }
  // What was left goes away outside the tool, and somebody else's folder appears there.
  rmSync(lookPath, { recursive: true, force: true });
  strangers(lookPath);
  refused(() => unlookBounty(context.repo, context.id, 1), 'copy-foreign-folder');
  refused(() => lookBounty(context.repo, context.id, 1), 'copy-foreign-folder');
  strangersIntact(lookPath);
  expect(renderStatus(context.repo)).toContain('look copy #1');
  const awayLook = join(context.scratch, 'strangers-look');
  renameSync(lookPath, awayLook);
  unlookBounty(context.repo, context.id, 1);
  expect(loadRecord(context.repo, context.id).copies).toEqual([]);
  expect(existsSync(join(context.repo, '.git', 'box-bt7-copies'))).toBe(false);
  strangersIntact(awayLook);
}, 'Repair app', { 'app.txt': 'broken\n', 'untouched.txt': 'owner bytes\n' }));

it('a copy whose own Git directory was replaced is not the tool\'s: a folder with other content there is refused and left untouched', () => fixture(context => {
  posted(context);
  context.pr('solver');
  answerGitHub(context.repo, context.id, 1);
  const lookPath = lookBounty(context.repo, context.id, 1).copy.path;
  // Somebody else's repository, with a file, where the copy was.
  const away = join(context.scratch, 'moved-away');
  renameSync(lookPath, away);
  mkdirSync(lookPath);
  git(lookPath, ['init', '-q']);
  writeFileSync(join(lookPath, 'keep.txt'), 'KEEP');
  try {
    refused(() => unlookBounty(context.repo, context.id, 1), 'copy-foreign-folder');
    expect(readFileSync(join(lookPath, 'keep.txt'), 'utf8')).toBe('KEEP');
    expect(existsSync(join(lookPath, '.git', 'HEAD'))).toBe(true);
  } finally { rmSync(lookPath, { recursive: true, force: true }); }
  renameSync(away, lookPath);
  unlookBounty(context.repo, context.id, 1);
  expect(existsSync(lookPath)).toBe(false);
}, 'Repair app', { 'app.txt': 'broken\n', 'untouched.txt': 'owner bytes\n' }));

it('a link planted inside a look copy is refused by name and names the step that gets past it', () => fixture(context => {
  posted(context);
  context.pr('solver');
  answerGitHub(context.repo, context.id, 1);
  const looked = lookBounty(context.repo, context.id, 1);
  const outside = join(context.scratch, 'precious'); mkdirSync(outside); writeFileSync(join(outside, 'keep.txt'), 'KEEP');
  const planted = join(looked.copy.path, 'planted');
  let linked = true;
  try { symlinkSync(outside, planted, process.platform === 'win32' ? 'junction' : 'dir'); } catch { linked = false; }
  if (linked) {
    try { unlookBounty(context.repo, context.id, 1); expect.unreachable('a link must refuse'); }
    catch (error) {
      expect(error).toMatchObject({ reason: 'copy-unsafe-path' });
      expect(String(error)).toContain(`box bounty unlook ${context.id} 1`);
    }
    expect(readFileSync(join(outside, 'keep.txt'), 'utf8')).toBe('KEEP');
    rmSync(planted, { recursive: true, force: true });
  }
  unlookBounty(context.repo, context.id, 1);
  expect(readFileSync(join(outside, 'keep.txt'), 'utf8')).toBe('KEEP');
}, 'Repair app', { 'app.txt': 'broken\n', 'untouched.txt': 'owner bytes\n' }));

it('a comment from an account whose name cannot be read is still counted and shown, with the name left out', () => fixture(context => {
  posted(context);
  context.pr('solver');
  answerGitHub(context.repo, context.id, 1);
  const name = 'zz bad\u001b[31m name';
  context.update({ comments: [
    { body: 'Which wording should we use?', user: { login: name }, created_at: '2026-10-10T01:02:03Z' },
    { body: 'A second question.', user: { login: 'questioner' }, created_at: '2026-10-10T04:05:06Z' }
  ] });
  const status = renderStatus(context.repo);
  expect(status).toContain('comments from other accounts: 2 (1 from an account whose name could not be read); latest: 2026-10-10T04:05:06Z');
  expect(status).not.toContain('github-status-unavailable');
  const questions = questionsBounty(context.repo, context.id);
  expect(questions).toContain('2 comment(s) written by others');
  expect(questions).toContain('an account whose name could not be read at 2026-10-10T01:02:03Z:');
  expect(questions).toContain('other account | "Which wording should we use?"');
  expect(questions).toContain('"questioner" at 2026-10-10T04:05:06Z:');
  for (const text of [status, questions]) { expect(text).not.toContain('zz bad'); expect(text).not.toContain('\u001b'); }
}, 'Repair app', { 'app.txt': 'broken\n', 'untouched.txt': 'owner bytes\n' }));
