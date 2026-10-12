import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { answerGitHub, applyBounty, confirmBounty, finalizeBounty, loadRecord, persistRecord, planBounty, postBounty, questionsBounty, renderStatus, replyBounty } from '../../../packages/box-bounty/index.js';
import { fixture, refused } from './github-fixture.js';
import type { GithubFixture } from './github-fixture.js';
import { CLI_DIST, fingerprint, git, makeRepo, runRoot, write } from './support.js';

// "Done when" cases of BT7 that had no test of their own: a record from
// before the wave, master's clashing-apply behaviour, and a reply
// aimed at an issue that exists but is not this bounty's.

function arrived(context: GithubFixture): void {
  confirmBounty(context.repo, context.id, 'github');
  postBounty(context.repo, context.id, 'github');
  context.pr('outside-solver');
  answerGitHub(context.repo, context.id, 1);
}

const files = { 'app.txt': 'broken\n', 'untouched.txt': 'owner bytes\n' };

it('a record written before this wave loads and says the job context was not recorded', () => {
  const repo = makeRepo({ 'app.txt': 'x\n' });
  write(repo, 'TASK.md', 'the task\n');
  const made = finalizeBounty(planBounty({ repoPath: repo, why: 'a reason', title: 'a task', taskPath: join(repo, 'TASK.md'), outDir: join(runRoot('bt7-older'), 'bounty'), resumeNote: 'CURRENT_NOTE_73c5' }));
  // A record of this wave shows what was saved and never claims otherwise.
  const current = renderStatus(repo, { id: made.id });
  expect(current).toContain('CURRENT_NOTE_73c5');
  expect(current).not.toContain('not recorded');
  const file = join(repo, '.box', 'bounties', `${made.id}.json`);
  const older = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  for (const key of ['resume', 'noteSource']) delete older[key];
  writeFileSync(file, JSON.stringify(older));
  const loaded = loadRecord(repo, made.id);
  expect(loaded.resume).toEqual({ kind: 'not-recorded' });
  const status = renderStatus(repo, { id: made.id });
  expect(status).toContain('not recorded');
  expect(status).not.toContain('CURRENT_NOTE_73c5');
});

it('a clashing apply aborts the merge, keeps the worktree and index byte-identical, and names look', () => fixture(context => {
  arrived(context);
  write(context.repo, 'app.txt', 'owner version\n');
  git(context.repo, ['add', 'app.txt']);
  git(context.repo, ['-c', 'user.name=owner', '-c', 'user.email=owner@example.invalid', 'commit', '-qm', 'owner moved']);
  const bytes = fingerprint(context.repo);
  const result = applyBounty(context.repo, context.id, 1);
  expect(result.outcome).toBe('conflict');
  expect(result.conflicts).toEqual(['app.txt']);
  // `git merge --abort` rewrites the index file's bookkeeping even when its
  // staged content is identical — what survives intact is the state it means:
  // the same tree, the same HEAD, the same staged content, the same status.
  const after = fingerprint(context.repo);
  expect(after.files).toEqual(bytes.files);
  expect(after.head).toEqual(bytes.head);
  expect(after.status).toEqual(bytes.status);
  expect(loadRecord(context.repo, context.id).conflicts?.paths).toEqual(['app.txt']);
  const output = spawnSync(process.execPath, [CLI_DIST, 'bounty', 'apply', context.id, '1', '--repo', context.repo], { encoding: 'utf8' });
  expect(output.status).toBe(0);
  expect(output.stdout).toContain(`box bounty look ${context.id} 1`);
}, 'Repair app', files));

it('refuses to read or reply on an existing issue that is not this bounty\'s, and posts nothing', () => fixture(context => {
  arrived(context);
  const stranger = { number: 2, html_url: 'https://github.com/owner/project/issues/2', title: 'unrelated issue', body: 'no bounty marker here', state: 'open', user: { login: 'owner' } };
  context.update({ issues: [...context.state().issues, stranger], comments: [{ body: 'a question on the other issue', user: { login: 'questioner' }, created_at: '2026-10-10T01:02:03Z' }] });
  // The bounty's own issue answers; the same commands against the other issue do not.
  expect(questionsBounty(context.repo, context.id)).toContain('1 comment(s) written by others');
  const record = loadRecord(context.repo, context.id);
  if (record.github === undefined) throw new Error('publication missing');
  record.github = { ...record.github, issue: { number: 2, url: stranger.html_url } };
  persistRecord(context.repo, record);
  const before = context.state().comments.length;
  refused(() => replyBounty(context.repo, context.id, 'must not post'), 'github-issue-mismatch');
  refused(() => questionsBounty(context.repo, context.id), 'github-issue-mismatch');
  expect(context.state().comments).toHaveLength(before);
  expect(loadRecord(context.repo, context.id).replies ?? []).toHaveLength(0);
}, 'Repair app', files));
