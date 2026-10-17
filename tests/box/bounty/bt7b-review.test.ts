// BT7b pass review — adversarial cases the wave's own tests do not carry.
// Scratch additions by the reviewer; each states which attack it stands for.
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, writeFileSync, linkSync, copyFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { expect, it } from 'vitest';
import { answerGitHub, checkMergedSolutions, loadRecord, setMergeNoticeListener } from '../../../packages/box-bounty/index.js';
import { postedFixture } from './github-fixture.js';
import { CLI_DIST, boxFile, git, recordFilePath, runRoot, write } from './support.js';

const noticedLines: string[] = [];
setMergeNoticeListener(line => noticedLines.push(line));

const cli = (repo: string, env: NodeJS.ProcessEnv, ...args: string[]) =>
  spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args], { cwd: repo, encoding: 'utf8', env, timeout: 60000 });

const openPath = (repo: string) => boxFile(repo, 'OPEN');

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
  const collect = cli(repo, process.env, 'look', id, '1');
  expect(collect.status, collect.stderr).toBe(0);
  const head = git(repo, ['rev-parse', 'HEAD']);
  const conflict = cli(repo, process.env, 'apply', id, '1');
  console.log('--- conflicted apply (exit ' + conflict.status + ') ---\n' + conflict.stdout + conflict.stderr);
  expect(conflict.status).toBe(0);
  expect(conflict.stdout).toContain('conflicts in: "app.txt"');
  // BT17: the abort fact rides the conflict line itself now.
  expect(conflict.stdout).toContain('aborted; worktree and index are exactly as before');
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
  const path = recordFilePath(repo, id);
  const record = JSON.parse(readFileSync(path, 'utf8'));
  record.resume.branch = 'side'; // hand edit — the record is the tool's own state
  writeFileSync(path, JSON.stringify(record, null, 2));
  noticedLines.length = 0;
  checkMergedSolutions(repo);
  expect(loadRecord(repo, id).stage).toBe('applied');
  expect(noticedLines.some(line => line.includes('side') && line.includes('closed'))).toBe(true);
}, { collected: false }));

// Regression for review finding BT7b-1 (fixed at 4524abc): a solution merged
// into a side branch first must lose to the one merged onto the recorded
// branch first. The old --ancestry-path probe was empty for second-parent
// entries and sorted the candidate as deepest; the binary search now finds
// the true landing — the deepest first-parent commit containing it.
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
    const recBefore = readFileSync(recordFilePath(repo, id));
    const openBefore = readFileSync(openPath(repo));
    const run = cli(repo, env, ...args);
    expect(run.status, `bounty ${args[0]} with no git`).toBe(3);
    expect(run.stderr).toMatch(/refused \(git-missing\)/);
    expect(run.stderr).toMatch(/https:\/\/git-scm\.com/);
    expect(readFileSync(recordFilePath(repo, id))).toEqual(recBefore);
    expect(readFileSync(openPath(repo))).toEqual(openBefore);
  }
}, { collected: false }), 60000);

// The version boundary: 2.39 refuses with the found version named.
it('git 2.39.9 is refused as too old, naming what was found', () => postedFixture(({ repo, id }) => {
  answerGitHub(repo, id, 1);
  const bin = runRoot('bt7b-review-oldgit');
  mkdirSync(bin, { recursive: true });
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` };
  if (process.platform === 'win32') {
    // git.exe is node itself, like the gh stand-in: a preload recognises the
    // renamed binary and answers `version` with an old release.
    try { linkSync(process.execPath, join(bin, 'git.exe')); }
    catch { copyFileSync(process.execPath, join(bin, 'git.exe')); }
    writeFileSync(join(bin, 'git-preload.cjs'), [
      'if (/(^|[\\\\/])git\\.exe$/i.test(process.execPath)) {',
      "  console.log('git version 2.39.9');",
      '  process.exit(0);',
      '}',
      ''
    ].join('\n'));
    env['NODE_OPTIONS'] = `${process.env.NODE_OPTIONS ?? ''} --require ${join(bin, 'git-preload.cjs').split('\\').join('/')}`.trim();
  } else {
    // POSIX knows no PATHEXT: `git` resolves only an executable at that exact
    // name, so the old version rides a plain shell script on PATH.
    writeFileSync(join(bin, 'git'), "#!/bin/sh\necho 'git version 2.39.9'\n");
    chmodSync(join(bin, 'git'), 0o755);
  }
  const run = cli(repo, env, 'status');
  expect(run.status).toBe(3);
  expect(run.stderr).toMatch(/refused \(git-too-old\)/);
  expect(run.stderr).toContain('2.40');
  // Nit: the message reports major.minor only — a 2.39.9 binary reads '2.39'.
  expect(run.stderr).toContain('2.39');
}, { collected: false }), 60000);

// The recorded merge must be the landing commit, not the candidate sha — and
// the never-ship extras diff must read the real merge's first-parent diff.
it('a nested merge names the real landing commit and diffs it for extras', () => postedFixture(({ repo, id, waitingPr }) => {
  answerGitHub(repo, id, 1);
  git(repo, ['checkout', '-qb', 'side']);
  git(repo, ['merge', '--no-ff', '-X', 'theirs', '-m', 'sol onto side', waitingPr]);
  write(repo, 'prod.env', 'AGENT_OWNED=1\n'); // a never-ship path inside the side branch
  git(repo, ['add', 'prod.env']);
  git(repo, ['-c', 'user.name=rv', '-c', 'user.email=rv@test.invalid', 'commit', '-qm', 'side carries .env']);
  git(repo, ['checkout', '-q', 'main']);
  const landing = git(repo, ['merge', '--no-ff', '-X', 'theirs', '-m', 'bring side in', 'side']) && git(repo, ['rev-parse', 'HEAD']);
  noticedLines.length = 0;
  checkMergedSolutions(repo);
  const event = loadRecord(repo, id).events.at(-1)!;
  expect(event.command).toBe('merged');
  expect(event.attempt).toBe(1);
  expect(event.merge).toBe(landing); // the merge on main, never the solution sha
  expect(noticedLines.some(line => line.includes('is merged on main') && line.includes(landing.slice(0, 12)))).toBe(true);
  expect(noticedLines.some(line => line.includes('prod.env') && line.includes('dot-env'))).toBe(true);
}, { collected: false }));

// A solution whose commit lands directly on the first-parent chain (fast-
// forward land) is its own landing point — recorded merge == the commit.
it('a fast-forward-landed solution records the commit itself', () => postedFixture(({ repo, id, waitingPr }) => {
  answerGitHub(repo, id, 1);
  // waitingPr descends from the post-time main tip (nothing moved since): ff.
  git(repo, ['merge', '--ff-only', waitingPr]);
  noticedLines.length = 0;
  checkMergedSolutions(repo);
  const event = loadRecord(repo, id).events.at(-1)!;
  expect(event.command).toBe('merged');
  expect(event.merge).toBe(waitingPr);
}, { collected: false }));

// A candidate entering twice via two different side branches: the deepest
// containing commit — its FIRST entry into the first-parent chain — wins.
it('a solution landed twice is recognised at its first first-parent entry', () => postedFixture(({ repo, id, waitingPr }) => {
  answerGitHub(repo, id, 1);
  git(repo, ['checkout', '-qb', 'sideA']);
  git(repo, ['merge', '--no-ff', '-X', 'theirs', '-m', 'sol onto sideA', waitingPr]);
  git(repo, ['checkout', '-q', 'main']);
  git(repo, ['checkout', '-qb', 'sideB']);
  git(repo, ['merge', '--no-ff', '-X', 'theirs', '-m', 'sol onto sideB', waitingPr]);
  git(repo, ['checkout', '-q', 'main']);
  const first = git(repo, ['rev-parse', 'HEAD']) && mergeSolution(repo, 'sideA');
  git(repo, ['merge', '--no-ff', '-X', 'theirs', '-m', 'bring sideB in', 'sideB']);
  noticedLines.length = 0;
  checkMergedSolutions(repo);
  const event = loadRecord(repo, id).events.at(-1)!;
  expect(event.command).toBe('merged');
  expect(event.merge).toBe(first); // first entry, not the later second landing
}, { collected: false }));

// Octopus: two solutions land in ONE merge commit — same first-parent index.
// The tool must still close, deterministically, on one solution.
it('two solutions landed by one octopus merge still close the bounty once', () => postedFixture((context) => {
  const { repo, id, waitingPr } = context;
  answerGitHub(repo, id, 1);
  const second = context.pr('solver2');
  answerGitHub(repo, id, 2);
  git(repo, ['checkout', '-qb', 'sa']);
  git(repo, ['merge', '--no-ff', '-X', 'theirs', '-m', 'sol1 onto sa', waitingPr]);
  git(repo, ['checkout', '-q', 'main']);
  git(repo, ['checkout', '-qb', 'sb']);
  git(repo, ['merge', '--no-ff', '-X', 'theirs', '-m', 'sol2 onto sb', second]);
  git(repo, ['checkout', '-q', 'main']);
  const octo = git(repo, ['merge', '--no-ff', '-X', 'theirs', '-m', 'octopus', 'sa', 'sb']) && git(repo, ['rev-parse', 'HEAD']);
  checkMergedSolutions(repo);
  const event = loadRecord(repo, id).events.at(-1)!;
  expect(event.command).toBe('merged');
  expect(event.merge).toBe(octo);
}, { collected: false }), 60000);

// Boundary probe for the binary search: a solution landed at the deepest
// non-root chain position, with a long chain tip-ward of it.
it('a solution landed deep in a long chain is found at its merge commit', () => postedFixture(({ repo, id, waitingPr }) => {
  answerGitHub(repo, id, 1);
  const landing = mergeSolution(repo, waitingPr);
  for (let i = 0; i < 25; i += 1) {
    write(repo, `f${i}.txt`, `${i}\n`);
    git(repo, ['add', `f${i}.txt`]);
    git(repo, ['-c', 'user.name=rv', '-c', 'user.email=rv@test.invalid', 'commit', '-qm', `later ${i}`]);
  }
  noticedLines.length = 0;
  checkMergedSolutions(repo);
  const event = loadRecord(repo, id).events.at(-1)!;
  expect(event.command).toBe('merged');
  expect(event.merge).toBe(landing);
}, { collected: false }), 60000);

// Boundary probe the other way: the landing IS the tip — chain index 0.
it('a solution landed at the very tip is found', () => postedFixture(({ repo, id, waitingPr }) => {
  answerGitHub(repo, id, 1);
  const landing = mergeSolution(repo, waitingPr);
  noticedLines.length = 0;
  checkMergedSolutions(repo);
  const event = loadRecord(repo, id).events.at(-1)!;
  expect(event.command).toBe('merged');
  expect(event.merge).toBe(landing);
}, { collected: false }));

// Shallowest case: the fixture's main is one base commit, so the landing
// merge is both the tip and a direct child of the root — search bounds.
it('a merge landing on the shallowest chain is found', () => postedFixture(({ repo, id, waitingPr }) => {
  answerGitHub(repo, id, 1);
  const landing = mergeSolution(repo, waitingPr);
  noticedLines.length = 0;
  checkMergedSolutions(repo);
  const event = loadRecord(repo, id).events.at(-1)!;
  expect(event.command).toBe('merged');
  expect(event.merge).toBe(landing);
}, { collected: false }));
