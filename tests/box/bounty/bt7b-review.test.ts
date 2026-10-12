// BT7b pass review — adversarial cases the wave's own tests do not carry.
// Scratch additions by the reviewer; each states which attack it stands for.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, linkSync, copyFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { expect, it } from 'vitest';
import { answerGitHub, checkMergedSolutions, loadRecord, setMergeNoticeListener } from '../../../packages/box-bounty/index.js';
import { postedFixture } from './github-fixture.js';
import { CLI_DIST, git, runRoot, write } from './support.js';

const noticedLines: string[] = [];
setMergeNoticeListener(line => noticedLines.push(line));

const cli = (repo: string, env: NodeJS.ProcessEnv, ...args: string[]) =>
  spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args], { cwd: repo, encoding: 'utf8', env, timeout: 60000 });

const recordPath = (repo: string, id: string) => join(repo, '.box', 'bounties', `${id}.json`);
const openPath = (repo: string) => join(repo, '.box', 'bounties', 'OPEN');

const mergeSolution = (repo: string, sha: string): string => {
  git(repo, ['merge', '--no-ff', '-X', 'theirs', '-m', 'agent merged the solution', sha]);
  return git(repo, ['rev-parse', 'HEAD']);
};

// The refusal path the UX lens needs: a real clashing apply, the agent's own
// merge, and a later command closing the bounty — all through the real CLI.
it('drives the post-refusal path: clashing apply, own merge, a later command closes', () => postedFixture(({ repo, id, waitingPr, state, bare }) => {
  write(repo, 'app.txt', 'owner moved on\n');
  git(repo, ['add', 'app.txt']);
  git(repo, ['-c', 'user.name=rv', '-c', 'user.email=rv@test.invalid', 'commit', '-qm', 'owner moved app']);
  const collect = cli(repo, process.env, 'answer', id, '--pr', '1');
  expect(collect.status, collect.stderr).toBe(0);
  const head = git(repo, ['rev-parse', 'HEAD']);
  const conflict = cli(repo, process.env, 'apply', id, '1');
  console.log('--- conflicted apply (exit ' + conflict.status + ') ---\n' + conflict.stdout + conflict.stderr);
  expect(conflict.status).toBe(0);
  expect(conflict.stdout).toContain('conflicts in: "app.txt"');
  expect(conflict.stdout).toContain('the merge was aborted');
  expect(conflict.stdout).toContain('owner moved app');
  expect(conflict.stdout).toContain("owner's own Git settings");
  expect(conflict.stdout).toContain(`box bounty look ${id} 1`);
  // No resolving command is offered — nothing says "run apply again".
  expect(conflict.stdout).not.toMatch(/run box bounty apply/);
  expect(git(repo, ['rev-parse', 'HEAD'])).toBe(head);
  // The agent merges the solution commit itself, then any later command ends it.
  const merge = mergeSolution(repo, waitingPr);
  const status = cli(repo, process.env, 'status');
  console.log('--- status after the agent merge ---\n' + status.stdout);
  expect(status.status).toBe(0);
  expect(status.stdout).toContain(`${id} — solution 1 is merged on main at ${merge.slice(0, 12)} — the bounty is closed (recorded applied)`);
  expect(status.stdout).toContain('applied');
  expect(state().issues[0]!.state).toBe('closed');
  expect(state().comments.some(c => c.body.includes(`<!-- box-bounty:${id}:merged -->`) && c.body.includes(merge))).toBe(true);
  expect(git(bare, ['show-ref'])).not.toContain(`box-bounty/${id}`);
  const again = cli(repo, process.env, 'status');
  expect(again.stdout).not.toContain('is merged on');
}, { collected: false }), 120000);

// Attack: a different commit carrying the solution's exact tree is not the solution.
it('a merged commit with the solution tree but a different sha closes nothing', () => postedFixture(({ repo, id, waitingPr }) => {
  answerGitHub(repo, id, 1);
  const tree = git(repo, ['rev-parse', `${waitingPr}^{tree}`]);
  const fake = git(repo, ['-c', 'user.name=rv', '-c', 'user.email=rv@test.invalid', 'commit-tree', tree, '-p', 'HEAD', '-m', 'same bytes, not the commit']);
  git(repo, ['merge', '--no-ff', '-X', 'theirs', '-m', 'merged the lookalike', fake]);
  noticedLines.length = 0;
  checkMergedSolutions(repo);
  expect(loadRecord(repo, id).stage).toBe('answered');
  expect(noticedLines.filter(line => line.includes('closed'))).toEqual([]);
}, { collected: false }));

// Attack: a cherry-pick carries the same change and message but a new sha.
it('a cherry-picked copy of the solution closes nothing', () => postedFixture(({ repo, id, waitingPr }) => {
  answerGitHub(repo, id, 1);
  git(repo, ['-c', 'user.name=rv', '-c', 'user.email=rv@test.invalid', 'cherry-pick', '--no-commit', waitingPr]);
  git(repo, ['-c', 'user.name=rv', '-c', 'user.email=rv@test.invalid', 'commit', '-qm', 'fix']);
  noticedLines.length = 0;
  checkMergedSolutions(repo);
  expect(loadRecord(repo, id).stage).toBe('answered');
  expect(noticedLines.filter(line => line.includes('closed'))).toEqual([]);
}, { collected: false }));

// Boundary of the ancestry rule: `-s ours` makes the commit an ancestor with
// none of its bytes. Documented here — ancestry is the fact the spec chose.
it('a -s ours merge of the solution commit is counted as merged', () => postedFixture(({ repo, id, waitingPr }) => {
  answerGitHub(repo, id, 1);
  git(repo, ['merge', '--no-ff', '-s', 'ours', '-m', 'merged but kept nothing', waitingPr]);
  expect(git(repo, ['show', '--format=', '--name-only', 'HEAD']).trim()).toBe(''); // no bytes landed
  noticedLines.length = 0;
  checkMergedSolutions(repo);
  const record = loadRecord(repo, id);
  expect(record.stage).toBe('applied');
  expect(readFileSync(join(repo, 'app.txt'), 'utf8')).toBe('broken\n'); // the fix never landed
}, { collected: false }));

// Attack: hand-edit the record so the branch it names is one the merge went to.
it('a record edited to name the branch the merge went to closes on that branch', () => postedFixture(({ repo, id, waitingPr }) => {
  answerGitHub(repo, id, 1);
  git(repo, ['checkout', '-qb', 'side']);
  git(repo, ['merge', '--no-ff', '-m', 'merged elsewhere', waitingPr]);
  git(repo, ['checkout', '-q', 'main']);
  const path = recordPath(repo, id);
  const record = JSON.parse(readFileSync(path, 'utf8'));
  record.resume.branch = 'side'; // hand edit — the record is the tool's own state
  writeFileSync(path, JSON.stringify(record, null, 2));
  noticedLines.length = 0;
  checkMergedSolutions(repo);
  expect(loadRecord(repo, id).stage).toBe('applied');
  expect(noticedLines.some(line => line.includes('side') && line.includes('closed'))).toBe(true);
}, { collected: false }));

// Attack: of two merged solutions, one merged into a side branch first must
// NOT win over the one that reached the recorded branch first.
// FAILING — review finding BT7b-1: rev-list --first-parent --ancestry-path
// S2..main is empty when S2 entered via a nested merge, so entryCommit falls
// back to the candidate sha itself; chainIndex misses and the `?? chain.length`
// fallback sorts it as the DEEPEST entry — the tool names attempt 2 (last onto
// the branch) instead of attempt 1 (merged onto it first).
it('a solution merged via a side branch loses to the one merged onto the branch first', () => postedFixture((context) => {
  const { repo, id, waitingPr } = context;
  answerGitHub(repo, id, 1);
  const second = context.pr('solver2');
  answerGitHub(repo, id, 2);
  git(repo, ['checkout', '-qb', 'side']);
  git(repo, ['merge', '--no-ff', '-X', 'theirs', '-m', 'sol2 onto side', second]);
  git(repo, ['checkout', '-q', 'main']);
  const first = mergeSolution(repo, waitingPr); // sol1 reaches main first
  git(repo, ['merge', '--no-ff', '-X', 'theirs', '-m', 'bring side in', 'side']);
  checkMergedSolutions(repo);
  const event = loadRecord(repo, id).events.at(-1)!;
  expect(event.command).toBe('merged');
  expect(event.attempt).toBe(1);
  expect(event.merge).toBe(first);
}, { collected: false }), 60000);

// The requirement refusals: missing Git refuses by name on more than status,
// and nothing is written first.
it('commands refuse git-missing before writing anything', () => postedFixture(({ repo, id }) => {
  answerGitHub(repo, id, 1); // give the scan a candidate so gitProgram is truly reached
  const bin = runRoot('bt7b-review-nogit');
  mkdirSync(bin, { recursive: true });
  const env = { ...process.env, PATH: bin };
  for (const args of [['status'], ['look', id, '1'], ['apply', id, '1']]) {
    const recBefore = readFileSync(recordPath(repo, id));
    const openBefore = readFileSync(openPath(repo));
    const run = cli(repo, env, ...args);
    expect(run.status, `bounty ${args[0]} with no git`).toBe(3);
    expect(run.stderr).toMatch(/refused \(git-missing\)/);
    expect(run.stderr).toMatch(/https:\/\/git-scm\.com/);
    expect(readFileSync(recordPath(repo, id))).toEqual(recBefore);
    expect(readFileSync(openPath(repo))).toEqual(openBefore);
  }
}, { collected: false }), 60000);

// The version boundary: 2.39 refuses with the found version named.
it('git 2.39.9 is refused as too old, naming what was found', () => postedFixture(({ repo, id }) => {
  answerGitHub(repo, id, 1);
  const bin = runRoot('bt7b-review-oldgit');
  mkdirSync(bin, { recursive: true });
  try { linkSync(process.execPath, join(bin, 'git.exe')); }
  catch { copyFileSync(process.execPath, join(bin, 'git.exe')); }
  writeFileSync(join(bin, 'git-preload.cjs'), [
    'if (/(^|[\\\\/])git\\.exe$/i.test(process.execPath)) {',
    "  console.log('git version 2.39.9');",
    '  process.exit(0);',
    '}',
    ''
  ].join('\n'));
  const env = {
    ...process.env,
    PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require ${join(bin, 'git-preload.cjs').split('\\').join('/')}`.trim()
  };
  const run = cli(repo, env, 'status');
  expect(run.status).toBe(3);
  expect(run.stderr).toMatch(/refused \(git-too-old\)/);
  expect(run.stderr).toContain('2.40');
  // Nit: the message reports major.minor only — a 2.39.9 binary reads '2.39'.
  expect(run.stderr).toContain('2.39');
}, { collected: false }), 60000);
