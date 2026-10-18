// BT7b: the tool owns the life of the bounty. A clashing apply states the
// facts and offers no resolving command; a solution the agent merges with
// its own Git is recognised by ancestry on the branch the bounty was created
// on and the bounty ends exactly as a clean apply ends it; Git and gh are
// checked where needed, by name.
//
// The library runs many logical commands inside one vitest process, so the
// memoised per-command notice cannot see a merge the test makes after an
// earlier read — tests call checkMergedSolutions, which is exactly what the
// next real command does in its own process.
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, linkSync, mkdirSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { expect, it } from 'vitest';
import { answerGitHub, applyBounty, BountyRefused, checkMergedSolutions, listGitHubAnswers, loadRecord, setMergeNoticeListener } from '../../../packages/box-bounty/index.js';
import { postedFixture } from './github-fixture.js';
import { CLI_DIST, git, runRoot, write } from './support.js';

const noticedLines: string[] = [];
setMergeNoticeListener(line => noticedLines.push(line));

const mergeSolution = (repo: string, sha: string, extra?: (repo: string) => void): string => {
  if (extra === undefined) git(repo, ['merge', '--no-ff', '-X', 'theirs', '-m', 'agent merged the solution', sha]);
  else {
    git(repo, ['merge', '--no-ff', '--no-commit', sha]);
    extra(repo);
    git(repo, ['add', '-A']);
    git(repo, ['-c', 'user.name=bt', '-c', 'user.email=bt@test.invalid', 'commit', '-qm', 'agent merged the solution']);
  }
  return git(repo, ['rev-parse', 'HEAD']);
};

it('a clashing apply states the facts, changes nothing, and offers no resolving command', () => postedFixture(({ repo, id }) => {
  // The owner moves the clashing file after the bounty was posted — the
  // solver's fix for the same line now conflicts.
  write(repo, 'app.txt', 'owner moved on\n');
  git(repo, ['add', 'app.txt']);
  git(repo, ['-c', 'user.name=bt', '-c', 'user.email=bt@test.invalid', 'commit', '-qm', 'owner moved app']);
  answerGitHub(repo, id, 1);
  const head = git(repo, ['rev-parse', 'HEAD']);
  const pristine = git(repo, ['status', '--porcelain']);
  const result = applyBounty(repo, id, 1);
  expect(result.outcome).toBe('conflict');
  expect(result.conflicts).toEqual(['app.txt']);
  expect(result.clean).toEqual([]);
  expect(result.commits?.join('\n')).toContain('owner moved app');
  // Nothing changed: branch unmoved, worktree and index exactly as before.
  expect(git(repo, ['rev-parse', 'HEAD'])).toBe(head);
  expect(git(repo, ['status', '--porcelain'])).toBe(pristine);
  const record = loadRecord(repo, id);
  expect(record.stage).toBe('answered');
  expect(record.conflicts?.paths).toEqual(['app.txt']);
}, { collected: false }));

it('a solution the agent merges itself is recognised and closes the bounty exactly as apply', () => postedFixture(({ repo, id, waitingPr, state, bare }) => {
  write(repo, 'app.txt', 'owner moved on\n');
  git(repo, ['add', 'app.txt']);
  git(repo, ['-c', 'user.name=bt', '-c', 'user.email=bt@test.invalid', 'commit', '-qm', 'owner moved app']);
  answerGitHub(repo, id, 1);
  expect(applyBounty(repo, id, 1).outcome).toBe('conflict');
  // The agent merges the solution commit itself — its own Git, its own
  // settings. The tool keeps no merge state of its own.
  const merge = mergeSolution(repo, waitingPr);
  noticedLines.length = 0;
  checkMergedSolutions(repo);
  const record = loadRecord(repo, id);
  expect(record.stage).toBe('applied');
  const event = record.events.at(-1)!;
  expect(event.command).toBe('merged');
  expect(event.attempt).toBe(1);
  expect(event.merge).toBe(merge);
  expect(noticedLines.filter(line => line.includes(id) && line.includes('closed'))).toHaveLength(1);
  // Ended exactly as a clean apply: closing comment, closed issue, branch
  // removed, durability refs dropped.
  expect(state().issues[0]!.state).toBe('closed');
  expect(state().comments.some(comment => comment.body.includes(`<!-- box-bounty:${id}:merged -->`) && comment.body.includes(merge))).toBe(true);
  expect(git(bare, ['show-ref'])).not.toContain(`refs/heads/box-bounty/${id}`); // BT32: the chain ref stays; the solver branch is what close removes
  // BT32: the chain ref `refs/box-bounty/<id>` stays — it is the shared
  // memory, not a durability pin. What end-stage drops is every other ref
  // under the namespace (the legacy snapshot, the `-answer-<n>` pins).
  const under = git(repo, ['for-each-ref', '--format=%(refname)', `refs/box-bounty/`]).split('\n').filter(l => l !== '');
  expect(under).toEqual([`refs/box-bounty/${id}`]);
  // Quiet afterwards — closing happens once.
  noticedLines.length = 0;
  checkMergedSolutions(repo);
  expect(noticedLines).toEqual([]);
  expect(record.events.filter(entry => entry.command === 'merged')).toHaveLength(1);
  // A later apply sees the same applied truth, never a second close.
  expect(applyBounty(repo, id, 1).mergeCommit).toBe(merge);
}, { collected: false }));

it('a merge on another branch closes nothing and is never mentioned', () => postedFixture(({ repo, id, waitingPr }) => {
  answerGitHub(repo, id, 1);
  git(repo, ['checkout', '-qb', 'side']);
  git(repo, ['merge', '--no-ff', '-m', 'merged elsewhere', waitingPr]);
  git(repo, ['checkout', '-q', 'main']);
  noticedLines.length = 0;
  checkMergedSolutions(repo);
  expect(loadRecord(repo, id).stage).toBe('answered');
  expect(noticedLines.filter(line => line.includes('closed'))).toEqual([]);
}, { collected: false }));

it('of two merged solutions the one merged first in first-parent history wins', () => postedFixture((context) => {
  const { repo, id, waitingPr } = context;
  answerGitHub(repo, id, 1);
  const second = context.pr('solver2');
  answerGitHub(repo, id, 2);
  const secondMerge = mergeSolution(repo, second);
  mergeSolution(repo, waitingPr);
  checkMergedSolutions(repo);
  const record = loadRecord(repo, id);
  const event = record.events.at(-1)!;
  expect(record.stage).toBe('applied');
  expect(event.attempt).toBe(2);
  expect(event.merge).toBe(secondMerge);
}, { collected: false }));

it('a pull request never collected is recognised once the tool has seen its head', () => postedFixture(({ repo, id, waitingPr, state }) => {
  // Listing the open PRs records the head — after that, the agent merging it
  // is its solution landing, collected or not. The agent fetches the head
  // itself; the tool only records having seen it.
  listGitHubAnswers(repo, id);
  git(repo, ['fetch', 'https://github.com/owner/project.git', waitingPr]);
  const merge = mergeSolution(repo, waitingPr);
  noticedLines.length = 0;
  checkMergedSolutions(repo);
  const record = loadRecord(repo, id);
  expect(record.stage).toBe('applied');
  const event = record.events.at(-1)!;
  expect(event.command).toBe('merged');
  expect(event.attempt).toBeUndefined();
  expect(event.reason).toContain('pull request #1');
  expect(event.merge).toBe(merge);
  expect(noticedLines.some(line => line.includes('pull request #1') && line.includes('closed'))).toBe(true);
  expect(state().issues[0]!.state).toBe('closed');
}));

it('a record whose branch is gone is stated, and nothing closes', () => postedFixture(({ repo, id }) => {
  answerGitHub(repo, id, 1);
  git(repo, ['checkout', '-qb', 'elsewhere']);
  git(repo, ['branch', '-D', 'main']);
  noticedLines.length = 0;
  checkMergedSolutions(repo);
  expect(loadRecord(repo, id).stage).toBe('answered');
  expect(noticedLines.some(line => line.includes(id) && line.includes('gone'))).toBe(true);
  git(repo, ['branch', 'main', 'elsewhere']);
  git(repo, ['checkout', '-q', 'main']);
}));

it('a merge carrying a never-ship path the solution did not is named as a fact and still closes', () => postedFixture(({ repo, id, waitingPr }) => {
  answerGitHub(repo, id, 1);
  mergeSolution(repo, waitingPr, repo => write(repo, 'prod.env', 'AGENT_OWNED=1\n'));
  noticedLines.length = 0;
  checkMergedSolutions(repo);
  expect(loadRecord(repo, id).stage).toBe('applied');
  expect(noticedLines.some(line => line.includes('prod.env') && line.includes('dot-env'))).toBe(true);
}, { collected: false }));

it('apply names a pull request or attempt that does not exist', () => postedFixture(({ repo, id }) => {
  answerGitHub(repo, id, 1);
  // A number no attempt and no pull request carries: apply treats it as a
  // pull request first — GitHub's miss is the named refusal, nothing written.
  try { applyBounty(repo, id, 99); expect.unreachable('apply of attempt 99 should refuse'); }
  catch (error) {
    expect(error).toBeInstanceOf(BountyRefused);
    expect((error as BountyRefused).reason).toBe('github-pr-missing');
  }
  expect(loadRecord(repo, id).stage).toBe('answered');
}));

it('any command without Git refuses by name before anything runs', () => postedFixture(({ repo }) => {
  const bin = runRoot('bt7b-nogit');
  mkdirSync(bin, { recursive: true });
  const run = spawnSync(process.execPath, [CLI_DIST, 'bounty', 'status'], {
    cwd: repo, encoding: 'utf8',
    env: { ...process.env, PATH: bin }
  });
  expect(run.status).toBe(3);
  expect(run.stderr).toMatch(/refused \(git-missing\)/);
  expect(run.stderr).toMatch(/https:\/\/git-scm\.com/);
}));

it('a Git too old to carry the pins refuses by name', () => postedFixture(({ repo }) => {
  const bin = runRoot('bt7b-oldgit');
  mkdirSync(bin, { recursive: true });
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` };
  if (process.platform === 'win32') {
    // git.exe is node itself, like the gh stand-in: a preload recognises the
    // renamed binary and answers `version` with an old release.
    try { linkSync(process.execPath, join(bin, 'git.exe')); }
    catch { copyFileSync(process.execPath, join(bin, 'git.exe')); }
    writeFileSync(join(bin, 'git-preload.cjs'), [
      'if (/(^|[\\\\/])git\\.exe$/i.test(process.execPath)) {',
      "  console.log('git version 1.9.0');",
      '  process.exit(0);',
      '}',
      ''
    ].join('\n'));
    env['NODE_OPTIONS'] = `${process.env.NODE_OPTIONS ?? ''} --require ${join(bin, 'git-preload.cjs').split('\\').join('/')}`.trim();
  } else {
    writeFileSync(join(bin, 'git'), "#!/bin/sh\necho 'git version 1.9.0'\n");
    chmodSync(join(bin, 'git'), 0o755);
  }
  const run = spawnSync(process.execPath, [CLI_DIST, 'bounty', 'status'], { cwd: repo, encoding: 'utf8', env });
  expect(run.status).toBe(3);
  expect(run.stderr).toMatch(/refused \(git-too-old\)/);
  expect(run.stderr).toMatch(/https:\/\/git-scm\.com/);
}));

it('a gh too old for GitHub bounties refuses by name', () => postedFixture(({ repo, id, update }) => {
  update({ ghVersion: '1.9.0' });
  try { listGitHubAnswers(repo, id); expect.unreachable('gh 1.9 should refuse'); }
  catch (error) {
    expect(error).toBeInstanceOf(BountyRefused);
    expect((error as BountyRefused).reason).toBe('github-cli-too-old');
    expect((error as BountyRefused).message).toContain('https://cli.github.com');
  }
}));
