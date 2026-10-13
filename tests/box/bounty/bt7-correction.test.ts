import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { answerGitHub, finalizeBounty, loadRecord, lookBounty, planBounty, postBounty, quoteForeign, renderStatus } from '../../../packages/box-bounty/index.js';
import { fixture } from './github-fixture.js';
import type { GithubFixture } from './github-fixture.js';
import { CLI_DIST, git, makeRepo, runRoot, write } from './support.js';

// BT7 Correction 1, the cases the pass found that BT7a keeps: named refusals,
// hidden characters, and seen-once marking.

const cli = (repo: string, ...args: string[]) => spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args, '--repo', repo], { encoding: 'utf8', env: process.env });
const files = { 'app.txt': 'broken\n', 'untouched.txt': 'owner bytes\n' };
const nexts = (text: string): number => text.split('next:').length - 1;

function ownerCommits(context: GithubFixture, path: string, content: string): void {
  write(context.repo, path, content);
  git(context.repo, ['add', path]);
  git(context.repo, ['-c', 'user.name=owner', '-c', 'user.email=owner@example.invalid', 'commit', '-qm', `owner changed ${path}`]);
}

function collected(context: GithubFixture, extra: Record<string, string> = {}): void {
  postBounty(context.repo, context.id, 'github');
  context.pr('outside-solver', extra);
  answerGitHub(context.repo, context.id, 1);
}

it('an answer names look and apply; hidden characters are escaped in questions and look output; a clashing apply names look as its one next step', () => fixture(context => {
  const hidden = 'right‮to-left \u009b[31m zero​width del\u007f';
  // The solver also adds a file with a reStructuredText heading and a file with hidden characters.
  collected(context, { 'README.rst': 'Title\n=======\n', 'notes.txt': `${hidden}\n` });
  // An answer's report names look and apply.
  const report = loadRecord(context.repo, context.id).attempts?.[0]?.report.join('\n') ?? '';
  expect(report).toContain(`box bounty look ${context.id} 1`);
  expect(report).toContain(`box bounty apply ${context.id} 1`);
  // A comment from another account with characters that hide or reorder text.
  context.update({ comments: [{ body: hidden, user: { login: 'questioner' }, created_at: '2026-10-10T01:02:03Z' }] });
  const questions = renderStatus(context.repo, { id: context.id, comments: true });
  for (const raw of ['‮', '\u009b', '​', '\u007f']) expect(questions).not.toContain(raw);
  expect(questions).toContain('\\u202e');
  expect(questions).toContain('\\u009b');

  lookBounty(context.repo, context.id, 1);
  ownerCommits(context, 'app.txt', 'owner version\n');
  // One next step per bounty, and the saved job context sits inside the bounty's lines.
  const open = renderStatus(context.repo);
  expect(nexts(open)).toBe(1);
  expect(open).toMatch(/\n {6}Saved job context/);

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
  expect(look.stdout).toContain('written by the solver');
  expect(look.stdout).not.toContain('unlook');
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
  for (const line of ['box bounty status [<id>] [--full] [--comments]', 'box bounty look [<id>] (<n> | --from <dir>)', 'box bounty apply [<id>] [<n> | --from <dir>]', 'box bounty close [<id>]']) expect(usage.stderr).toContain(line);
  expect(usage.stderr).not.toContain('unlook');
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
