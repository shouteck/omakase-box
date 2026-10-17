// BT26 — the run's leftovers closed: every .git/.box segment anywhere in an
// instruction-file path is tool-owned (not the first segment only); one
// reader — baseCommitOf — decides a record's base commit, so `look` never
// hands Git the '(no commits yet)' display sentinel; a new record's apply
// merge message carries no `snapshot:` line; and an option that takes a
// value reads the next word as the value even when it is -h or --help.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyBounty, changeConfig, finalizeBounty, loadRecord, lookBounty, parseOptions, planBounty, settingsFile } from '../../../packages/box-bounty/index.js';
import { postedFixture, refused } from './github-fixture.js';
import { CLI_DIST, git, makeRepo, readRecordRaw, rewriteRecordRaw, runRoot, write, writeRecordRaw } from './support.js';

const bounty = (cwd: string, args: string[]) =>
  spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args], { cwd, encoding: 'utf8', env: process.env, timeout: 60000 });

it('an instruction file under any .git or .box segment is refused by name — bytes and settings untouched', () => {
  const repo = makeRepo({ 'a.txt': 'a\n' });
  // A nested checkout's own Git folder and a tool folder nested deep: each
  // holds bytes a synced block would corrupt exactly as the root's would.
  mkdirSync(join(repo, 'sub', '.git'), { recursive: true });
  writeFileSync(join(repo, 'sub', '.git', 'config'), '[core]\n\tbare = false\n');
  mkdirSync(join(repo, 'a', 'b', '.box'), { recursive: true });
  writeFileSync(join(repo, 'a', 'b', '.box', 'x.json'), '{}\n');
  const gitConfig = readFileSync(join(repo, 'sub', '.git', 'config'));
  const boxFile = readFileSync(join(repo, 'a', 'b', '.box', 'x.json'));
  for (const named of ['sub/.git/config', 'sub/.GIT/config', 'a/b/.box/x.json']) {
    refused(() => changeConfig(repo, 'set', 'instruction-file', named), 'instruction-file-tool-owned');
  }
  // A link inside the project landing in sub/.git reads the same refusal —
  // judged on where it lands, not on how it was spelled.
  symlinkSync(join(repo, 'sub', '.git'), join(repo, 'linked'), 'junction');
  refused(() => changeConfig(repo, 'set', 'instruction-file', 'linked/config'), 'instruction-file-tool-owned');
  expect(readFileSync(join(repo, 'sub', '.git', 'config'))).toEqual(gitConfig);
  expect(readFileSync(join(repo, 'a', 'b', '.box', 'x.json'))).toEqual(boxFile);
  expect(existsSync(settingsFile())).toBe(false);
  // Only exact segment names count: .github and git.md stay ordinary files.
  write(repo, 'docs/.github/x.md', 'x\n');
  write(repo, 'notes/git.md', 'x\n');
  expect(changeConfig(repo, 'set', 'instruction-file', 'docs/.github/x.md')).toContain('instruction-file: docs/.github/x.md');
  expect(changeConfig(repo, 'set', 'instruction-file', 'notes/git.md')).toContain('instruction-file: notes/git.md');
});

// The pass found the boundary still writable through a Windows 8.3
// short-name alias: `sub/GIT~1/config` reached `sub/.git/config` because
// neither the declared spelling nor realpathSync names the real segment.
// The fix judges each component's on-disk name, so the alias form refuses
// the same way. The alias is discovered (`for %~sI` reports the volume's
// own short spelling — `dir /x` showed GIT~1/BOX~1 on this host), never
// assumed; a filesystem with 8.3 disabled has no alias class to test.
it('an 8.3 short-name alias for a .git or .box segment is still tool-owned', (context) => {
  const repo = makeRepo({ 'a.txt': 'a\n' });
  mkdirSync(join(repo, 'sub', '.git'), { recursive: true });
  writeFileSync(join(repo, 'sub', '.git', 'config'), '[core]\n\tbare = false\n');
  mkdirSync(join(repo, 'a', 'b', '.box'), { recursive: true });
  writeFileSync(join(repo, 'a', 'b', '.box', 'x.json'), '{}\n');
  const aliasOf = (target: string): string | null => {
    // `for %~sI` echoes the volume's short spelling; the set stays unquoted —
    // a space in the temp path would misparse and read as "no alias" below.
    const run = spawnSync('cmd.exe', ['/d', '/c', `for %I in (${target}) do @echo %~sI`], { encoding: 'utf8' });
    const short = run.status === 0 ? basename(run.stdout.trim()) : '';
    return short !== '' && short !== basename(target) && existsSync(join(dirname(target), short)) ? short : null;
  };
  const gitAlias = aliasOf(join(repo, 'sub', '.git'));
  const boxAlias = aliasOf(join(repo, 'a', 'b', '.box'));
  if (gitAlias === null && boxAlias === null) context.skip('this filesystem hands back no 8.3 short names — the alias class does not exist here');
  const gitConfig = readFileSync(join(repo, 'sub', '.git', 'config'));
  const boxFile = readFileSync(join(repo, 'a', 'b', '.box', 'x.json'));
  const named: string[] = [];
  if (gitAlias !== null) named.push(`sub/${gitAlias}/config`, `sub/${gitAlias}`);
  if (boxAlias !== null) named.push(`a/b/${boxAlias}/x.json`, `a/b/${boxAlias}`);
  for (const path of named) {
    refused(() => changeConfig(repo, 'set', 'instruction-file', path), 'instruction-file-tool-owned');
  }
  expect(readFileSync(join(repo, 'sub', '.git', 'config'))).toEqual(gitConfig);
  expect(readFileSync(join(repo, 'a', 'b', '.box', 'x.json'))).toEqual(boxFile);
  expect(existsSync(settingsFile())).toBe(false);
});

it('a record with no commits diffs its attempts against the empty tree — never (no commits yet)', () => {
  const repo = join(runRoot('bt26-nocommits'), 'repo');
  mkdirSync(repo, { recursive: true });
  git(repo, ['init', '-b', 'main', '-q']);
  git(repo, ['config', 'core.autocrlf', 'false']);
  write(repo, 'TASK.md', 'Repair the app.\n');
  write(repo, 'app.txt', 'broken\n');
  const created = finalizeBounty(planBounty({ repoPath: repo, taskPath: join(repo, 'TASK.md'), title: 'Repair app', why: 'stuck' }));
  // The premise: a repository with no commits records the display sentinel.
  expect((JSON.parse(readRecordRaw(repo, created.id)) as { resume: { commit: string } }).resume.commit).toBe('(no commits yet)');
  // The solver's work lands as the repository's first commit, hand-recorded.
  write(repo, 'sol.txt', 'fixed\n');
  git(repo, ['add', 'sol.txt']);
  git(repo, ['commit', '-qm', 'solver work']);
  const sha = git(repo, ['rev-parse', 'HEAD']);
  rewriteRecordRaw(repo, created.id, record => {
    record['attempts'] = [{ n: 1, at: record['createdAt'], commit: sha, changed: [], added: ['sol.txt'], deleted: [], outcome: 'answered', conflicts: null, report: [] }];
  });
  const result = lookBounty(repo, created.id, 1);
  // The empty tree is the base: every file in the attempt's commit is added.
  expect(result.files).toEqual(['sol.txt']);
  expect(result.diff).toContain('new file');
  expect(result.diff).toContain('sol.txt');
});

it('a new record\'s apply merge message has no snapshot: line; a record carrying one keeps it', () => {
  postedFixture(({ repo, id }) => {
    const result = applyBounty(repo, id, 1);
    expect(result.outcome).toBe('applied');
    const message = git(repo, ['log', '-1', '--format=%B']);
    expect(message.split('\n').some(line => line.startsWith('snapshot:'))).toBe(false);
  }, { collected: true });
  // The pin is not vacuous: a hand-made old record that carries `snapshot`
  // still names the capture in its merge message.
  postedFixture(({ repo, id }) => {
    const record = JSON.parse(readRecordRaw(repo, id)) as { snapshot?: unknown; github: { commit: string } };
    const head = record.github.commit;
    record.snapshot = { commit: head, tree: head, baseCommit: head };
    writeRecordRaw(repo, id, JSON.stringify(record));
    const result = applyBounty(repo, id, 1);
    expect(result.outcome).toBe('applied');
    const message = git(repo, ['log', '-1', '--format=%B']);
    expect(message).toContain(`snapshot: ${head}`);
  }, { collected: true });
});

describe('a value is taken before help', () => {
  it('close --reason -h records -h as the reason', () => {
    const repo = makeRepo({ 'TASK.md': 'Repair the app.\n', 'app.txt': 'broken\n' });
    const created = finalizeBounty(planBounty({ repoPath: repo, taskPath: join(repo, 'TASK.md'), title: 'Repair app', why: 'stuck' }));
    const run = bounty(repo, ['close', created.id, '--reason', '-h']);
    expect(run.status, run.stderr).toBe(0);
    expect(loadRecord(repo, created.id).events.at(-1)).toMatchObject({ stage: 'rejected', reason: '-h' });
  });
  it('close -h and close --reason x -h still print help', () => {
    const dir = runRoot('bt26-help');
    for (const args of [['close', '-h'], ['close', '--reason', 'x', '-h']]) {
      const run = bounty(dir, args);
      expect(run.status, run.stderr).toBe(0);
      expect(run.stdout.startsWith('usage: box bounty close')).toBe(true);
    }
  });
  it('status --since --help takes --help as the value — which --since refuses as not a time', () => {
    const repo = makeRepo({ 'a.txt': 'a\n' });
    const run = bounty(repo, ['status', '--since', '--help']);
    expect(run.status, run.stderr).toBe(3);
    expect(run.stderr).toContain('summary-time-invalid');
    expect(run.stderr).toContain('is not a readable time');
    // The status view itself already printed; the summary never ran.
    expect(run.stdout).not.toContain('what was done since');
  });
  it('the parser reads the same: value position swallows -h and --help', () => {
    expect(parseOptions('close', ['--reason', '-h']).values['--reason']).toBe('-h');
    expect(parseOptions('close', ['--reason', '--help']).values['--reason']).toBe('--help');
    expect(parseOptions('status', ['--since', '--help']).values['--since']).toBe('--help');
    expect(parseOptions('close', ['-h']).help).toBe(true);
    expect(parseOptions('close', ['--reason', 'x', '-h']).help).toBe(true);
    // A word naming an option the command lists is still no value.
    expect(() => parseOptions('status', ['--since', '--full'])).toThrow('--since needs a value');
  });
});
