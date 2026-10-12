import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { answerGitHub, applyBounty, confirmBounty, finalizeBounty, loadRecord, lookBounty, persistRecord, planBounty, postBounty, questionsBounty, quoteForeign, renderStatus, unlookBounty } from '../../../packages/box-bounty/index.js';
import { git as safeGit } from '../../../packages/box-bounty/git.js';
import { fixture, refused } from './github-fixture.js';
import type { GithubFixture } from './github-fixture.js';
import { CLI_DIST, fingerprint, git, makeRepo, runRoot, write } from './support.js';

// BT7 Correction 1, the cases the pass found that BT7a keeps: named refusals,
// hidden characters, a copy that vanished, and seen-once marking.

const cli = (repo: string, ...args: string[]) => spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args, '--repo', repo], { encoding: 'utf8', env: process.env });
const files = { 'app.txt': 'broken\n', 'untouched.txt': 'owner bytes\n' };
const nexts = (text: string): number => text.split('next:').length - 1;

function ownerCommits(context: GithubFixture, path: string, content: string): void {
  write(context.repo, path, content);
  git(context.repo, ['add', path]);
  git(context.repo, ['-c', 'user.name=owner', '-c', 'user.email=owner@example.invalid', 'commit', '-qm', `owner changed ${path}`]);
}

function collected(context: GithubFixture, extra: Record<string, string> = {}): void {
  confirmBounty(context.repo, context.id, 'github');
  postBounty(context.repo, context.id, 'github');
  context.pr('outside-solver', extra);
  answerGitHub(context.repo, context.id, 1);
}

const toolLeftovers = (repo: string): { worktrees: string; branches: string; registry: boolean } => ({
  worktrees: git(repo, ['worktree', 'list', '--porcelain']),
  branches: git(repo, ['branch', '--list', 'box-bt7/*']),
  registry: existsSync(join(repo, '.git', 'box-bt7-copies'))
});

it('an answer names look and apply; hidden characters are escaped in questions and look output; a clashing apply names look as its one next step', () => fixture(context => {
  const hidden = 'right‮to-left \u009b[31m zero​width del\u007f';
  // The solver also adds a file with a reStructuredText heading and a file with hidden characters.
  collected(context, { 'README.rst': 'Title\n=======\n', 'notes.txt': `${hidden}\n` });
  // answer names look, apply and reject.
  const report = loadRecord(context.repo, context.id).attempts?.[0]?.report.join('\n') ?? '';
  expect(report).toContain(`box bounty look ${context.id} 1`);
  expect(report).toContain(`box bounty apply ${context.id} 1`);
  // A comment from another account with characters that hide or reorder text.
  context.update({ comments: [{ body: hidden, user: { login: 'questioner' }, created_at: '2026-10-10T01:02:03Z' }] });
  const questions = questionsBounty(context.repo, context.id);
  for (const raw of ['‮', '\u009b', '​', '\u007f']) expect(questions).not.toContain(raw);
  expect(questions).toContain('\\u202e');
  expect(questions).toContain('\\u009b');

  lookBounty(context.repo, context.id, 1);
  ownerCommits(context, 'app.txt', 'owner version\n');
  // One next step per bounty, and the saved job context sits inside the bounty's lines.
  const open = renderStatus(context.repo);
  expect(nexts(open)).toBe(1);
  expect(open).toMatch(/\n {6}Saved job context/);
  expect(open).toContain('look copy #1');

  // The clash keeps master's named refusal; its one next step names look.
  const apply = cli(context.repo, 'apply', '1');
  expect(apply.status).toBe(0);
  expect(apply.stdout).toContain('conflict');
  expect(apply.stdout).toContain(`box bounty look ${context.id} 1`);
  expect(nexts(apply.stdout)).toBe(1);
  const staged = renderStatus(context.repo);
  expect(staged).toContain('conflict');
  expect(nexts(staged)).toBe(1);
  const look = cli(context.repo, 'look', '1');
  expect(look.status).toBe(0);
  expect(look.stdout).toContain(`box bounty apply ${context.id} 1`);
  for (const raw of ['‮', '\u009b', '​', '\u007f']) expect(look.stdout).not.toContain(raw);
  expect(look.stdout).toContain('\\u202e');

  // The look copy is still there; unlook with the id left out removes it.
  expect(cli(context.repo, 'unlook', '1').status).toBe(0);
  expect(renderStatus(context.repo)).not.toContain('look copy');
  expect(toolLeftovers(context.repo)).toMatchObject({ branches: '', registry: false });
}, 'Repair app', files));

it('a copy that vanished is not a dead end, a folder that is not the tool\'s is refused by name and left alone, and git~1 is refused with its reason', () => fixture(context => {
  collected(context);
  const record = loadRecord(context.repo, context.id);
  const attempt = record.attempts?.[0];
  if (attempt === undefined) throw new Error('missing solution');

  // A solution carrying the short name Windows gives `.git`.
  const index = join(context.scratch, 'short-name.index');
  const env = { GIT_INDEX_FILE: index };
  safeGit(context.repo, ['read-tree', attempt.commit], env);
  safeGit(context.repo, ['-c', 'core.protectNTFS=false', 'update-index', '--add', '--cacheinfo', '100644', git(context.repo, ['rev-parse', `${attempt.commit}:app.txt`]), 'git~1'], env);
  const alias = safeGit(context.repo, ['-c', 'user.name=solver', '-c', 'user.email=solver@example.invalid', 'commit-tree', safeGit(context.repo, ['write-tree'], env), '-p', attempt.commit, '-m', 'short name']);
  record.attempts = [{ ...attempt, commit: alias }]; persistRecord(context.repo, record);
  const untouched = fingerprint(context.repo);
  for (const action of [() => lookBounty(context.repo, context.id, 1), () => applyBounty(context.repo, context.id, 1)]) {
    try { action(); expect.unreachable('git~1 must refuse'); }
    catch (error) { expect(error).toMatchObject({ reason: 'answer-unsafe-path' }); expect(String(error)).toContain('"git~1"'); expect(String(error)).toContain('Windows reads as .git'); }
  }
  expect(fingerprint(context.repo)).toEqual(untouched);
  expect(loadRecord(context.repo, context.id).copies).toEqual([]);
  record.attempts = [attempt]; persistRecord(context.repo, record);

  // A look copy deleted by hand: status says so, look makes it anew.
  const lookPath = lookBounty(context.repo, context.id, 1).copy.path;
  rmSync(lookPath, { recursive: true, force: true });
  expect(renderStatus(context.repo)).toMatch(/look copy #1: .* is gone/);
  expect(lookBounty(context.repo, context.id, 1).copy.path).toBe(lookPath);
  expect(readFileSync(join(lookPath, 'app.txt'), 'utf8')).toBe('fixed\n');

  // The copy is moved away and somebody else's folder sits at its path.
  const away = join(context.scratch, 'moved-away');
  renameSync(lookPath, away);
  mkdirSync(lookPath); writeFileSync(join(lookPath, 'keep.txt'), 'KEEP');
  try {
    const bytes = fingerprint(context.repo);
    refused(() => unlookBounty(context.repo, context.id, 1), 'copy-foreign-folder');
    refused(() => lookBounty(context.repo, context.id, 1), 'copy-foreign-folder');
    expect(readFileSync(join(lookPath, 'keep.txt'), 'utf8')).toBe('KEEP');
    expect(readFileSync(join(away, 'app.txt'), 'utf8')).toBe('fixed\n');
    expect(fingerprint(context.repo)).toEqual(bytes);
    expect(renderStatus(context.repo)).toContain('look copy #1');
  } finally { rmSync(lookPath, { recursive: true, force: true }); }
  // With that folder out of the way, unlook ends with nothing of the copy left.
  unlookBounty(context.repo, context.id, 1);
  expect(loadRecord(context.repo, context.id).copies).toEqual([]);
  expect(toolLeftovers(context.repo)).toMatchObject({ branches: '', registry: false });
  expect(toolLeftovers(context.repo).worktrees).not.toContain('box-bt7-');
  expect(readFileSync(join(away, 'app.txt'), 'utf8')).toBe('fixed\n'); // what was moved away is not the tool's to delete
  rmSync(away, { recursive: true, force: true });
  refused(() => unlookBounty(context.repo, context.id, 1), 'look-not-open');
}, 'Repair app', files));

it('asking which bounty lists each title, usage lists the commands of this wave, and hidden characters are escaped', () => {
  const repo = makeRepo({ 'app.txt': 'x\n' });
  write(repo, 'TASK.md', 'the task\n');
  const out = runRoot('bt7-two');
  const first = finalizeBounty(planBounty({ repoPath: repo, why: 'a reason', title: 'Mend the first thing', taskPath: join(repo, 'TASK.md'), outDir: join(out, 'one') }));
  const second = finalizeBounty(planBounty({ repoPath: repo, why: 'a reason', title: 'Mend the second thing', taskPath: join(repo, 'TASK.md'), outDir: join(out, 'two') }));
  const which = cli(repo, 'look', '1');
  expect(which.status).toBe(3);
  expect(which.stderr).toContain('bounty-ambiguous');
  expect(which.stderr).toContain(`${first.id} "Mend the first thing"`);
  expect(which.stderr).toContain(`${second.id} "Mend the second thing"`);
  const usage = cli(repo, 'look', first.id);
  expect(usage.status).toBe(2);
  for (const line of ['box bounty status [<id>] [--full]', 'box bounty look [<id>] <n>', 'box bounty unlook [<id>] <n>', 'box bounty questions [<id>]', 'box bounty reply [<id>] --text']) expect(usage.stderr).toContain(line);
  expect(quoteForeign('a‮b\u009bc​d\u007fe⁦f\u001bg')).toBe('"a\\u202eb\\u009bc\\u200bd\\u007fe\\u2066f\\u001bg"');
  expect(quoteForeign('plain "quoted" path/with spaces.txt')).toBe(JSON.stringify('plain "quoted" path/with spaces.txt'));
});

it('the fresh-agent fixture shows nothing to anybody while it is built: the first status announces every solution as new, and only once', () => {
  const script = fileURLToPath(new URL('./bt7-ux-fixture.mjs', import.meta.url));
  const root = join(runRoot('bt7-ux'), 'kitchen-BT7-cooktest');
  const created = spawnSync(process.execPath, [script, 'create', root], { encoding: 'utf8' });
  expect(created.status, created.stderr).toBe(0);
  try {
    const from = created.stdout.indexOf('{');
    const made = JSON.parse(created.stdout.slice(from, created.stdout.indexOf('\n}', from) + 2)) as { id: string; repository: string };
    const record = JSON.parse(readFileSync(join(made.repository, '.box', 'bounties', `${made.id}.json`), 'utf8')) as { attempts?: { seenAt?: string }[]; github?: { seenPullRequests?: unknown[] } };
    expect((record.attempts ?? []).filter(attempt => attempt.seenAt !== undefined)).toEqual([]);
    expect(record.github?.seenPullRequests ?? []).toEqual([]);
    const status = (): string => spawnSync(process.execPath, [join(root, 'invoke.cjs'), 'bounty', 'status'], { encoding: 'utf8' }).stdout;
    const first = status();
    expect(first).not.toContain('seen since');
    // Three pull requests wait on the issue; each is new once.
    const lines = 3;
    expect(first.split('; new').length - 1).toBe(lines);
    const second = status();
    expect(second).not.toContain('; new');
    expect(second.split('seen since').length - 1).toBe(lines);
  } finally {
    const cleaned = spawnSync(process.execPath, [script, 'cleanup', root], { encoding: 'utf8' });
    expect(cleaned.status, cleaned.stderr).toBe(0);
  }
  expect(existsSync(root)).toBe(false);
});
