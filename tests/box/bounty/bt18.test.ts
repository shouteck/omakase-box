import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRecord, settingsFile } from '../../../packages/box-bounty/index.js';
import { CLI_DIST, ROOT, makeRepo, runRoot } from './support.js';

// BT18: every command reads options through one parser driven by one table —
// an option is understood or refused by name, --help/-h answers everywhere,
// --name=value equals --name value, and --version prints the version.
const cli = (cwd: string, args: string[], input?: string) =>
  spawnSync(process.execPath, [CLI_DIST, ...args], { cwd, encoding: 'utf8', env: process.env, timeout: 60000, ...(input === undefined ? {} : { input }) });
const bounty = (cwd: string, args: string[], input?: string) => cli(cwd, ['bounty', ...args], input);

// Every command the option table lists; '' is the bare `box bounty` overview.
const COMMANDS = ['', 'help', 'describe', 'create', 'status', 'post', 'look', 'apply', 'close', 'allow', 'deny', 'config', 'hook'];
const call = (dir: string, command: string, args: string[]) => bounty(dir, [...(command === '' ? [] : [command]), ...args]);

describe('1. --help and -h on every command', () => {
  for (const command of COMMANDS) {
    for (const flag of ['--help', '-h']) {
      it(`box bounty ${command === '' ? '' : `${command} `}${flag} prints that command's usage`, () => {
        const dir = runRoot('bt18-help'); // a plain folder, no checkout — help needs nothing
        const run = call(dir, command, [flag]);
        expect(run.status, run.stderr).toBe(0);
        expect(run.stdout.startsWith(`usage: box bounty${command === '' ? ' ' : ` ${command}`}`)).toBe(true);
        expect(run.stderr).toBe('');
        expect(readdirSync(dir)).toEqual([]);
        expect(existsSync(settingsFile())).toBe(false);
      });
    }
  }
});

it('2. status --repo=<path> is the same as status --repo <path>', () => {
  const repo = makeRepo({ 'TASK.md': 'Repair the app.\n', 'app.txt': 'owner bytes\n' });
  const other = runRoot('bt18-elsewhere');
  const spaced = cli(other, ['bounty', 'status', '--repo', repo]);
  const equals = cli(other, ['bounty', 'status', `--repo=${repo}`]);
  expect(spaced.status, spaced.stderr).toBe(0);
  expect(equals.status, equals.stderr).toBe(0);
  expect(equals.stdout).toBe(spaced.stdout);
});

it('3. create --task=TASK.md --why=x is the same as the spaced form', () => {
  // Two identical repositories — the second create in one repository would
  // see the first's .box record and report the never-ship removal.
  const repoA = makeRepo({ 'TASK.md': 'Repair the app.\n', 'app.txt': 'owner bytes\n' });
  const repoB = makeRepo({ 'TASK.md': 'Repair the app.\n', 'app.txt': 'owner bytes\n' });
  const spaced = bounty(repoA, ['create', '--task', 'TASK.md', '--why', 'x']);
  const equals = bounty(repoB, ['create', '--task=TASK.md', '--why=x']);
  expect(spaced.status, spaced.stderr).toBe(0);
  expect(equals.status, equals.stderr).toBe(0);
  const norm = (text: string) => text.replace(/bt-[a-f0-9]{12}/g, 'bt-<id>').split(repoA).join('<repo>').split(realpathSync(repoA)).join('<repo>').split(repoB).join('<repo>').split(realpathSync(repoB)).join('<repo>');
  expect(norm(equals.stdout)).toBe(norm(spaced.stdout));
});

describe('4. an unknown option on every command is a usage error naming it', () => {
  for (const command of COMMANDS) {
    it(`box bounty ${command === '' ? '' : `${command} `}--frobnicate`, () => {
      const dir = runRoot('bt18-unknown');
      const run = call(dir, command, ['--frobnicate']);
      expect(run.status, run.stderr).toBe(2);
      expect(run.stderr).toContain(`unknown option --frobnicate for box bounty${command === '' ? '' : ` ${command}`}`);
      expect(run.stderr).toContain('usage: box bounty');
    });
  }
});

it('5. --json refuses json-not-supported until a command grows it', () => {
  const dir = runRoot('bt18-json');
  // post is the brief's case; BT19 grew it on status, look and config, so
  // the refusal is pinned here on commands that still do not take it.
  for (const command of ['post', 'apply', 'create']) {
    const run = bounty(dir, [command, '--json']);
    expect(run.status, run.stderr).toBe(3);
    expect(run.stderr).toContain('json-not-supported');
    expect(run.stderr).toContain(`--json is not available on box bounty ${command} yet`);
  }
});

describe('6. an option that takes a value, given without one', () => {
  it.each([
    ['status', ['--since'], '--since'],
    ['status', ['--since', '--full'], '--since'],
    ['close', ['--reason'], '--reason']
  ])('box bounty %s %j exits 2 saying needs a value', (command, args, option) => {
    const run = bounty(runRoot('bt18-novalue'), [command, ...args]);
    expect(run.status, run.stderr).toBe(2);
    expect(run.stderr).toContain(`${option} needs a value`);
  });
});

it('7. a non-repeatable option twice errors; --include repeats fine', () => {
  const dir = runRoot('bt18-twice');
  const twice = bounty(dir, ['look', '--full', '--full']);
  expect(twice.status, twice.stderr).toBe(2);
  expect(twice.stderr).toContain('--full was given twice');
  // --include is the one repeatable option: the parse succeeds, so the run
  // gets as far as the repository check — not-a-repository, not a usage error.
  const include = bounty(dir, ['post', '--include', 'a', '--include', 'b']);
  expect(include.status, include.stderr).toBe(3);
  expect(include.stderr).toContain('not-a-repository');
});

it('8. status -h is help; status -x is an unknown option, never an id', () => {
  const dir = runRoot('bt18-dash');
  const help = bounty(dir, ['status', '-h']);
  expect(help.status, help.stderr).toBe(0);
  expect(help.stdout.startsWith('usage: box bounty status')).toBe(true);
  const unknown = bounty(dir, ['status', '-x']);
  expect(unknown.status, unknown.stderr).toBe(2);
  expect(unknown.stderr).toContain('unknown option -x for box bounty status');
  expect(unknown.stderr).not.toContain('unknown-bounty');
});

it('9. create --task - still reads the task from standard input', () => {
  const repo = makeRepo({ 'app.txt': 'owner bytes\n' });
  const task = '# Repair the app.\nI tried the existing implementation twice.\n';
  const run = bounty(repo, ['create', '--task', '-', '--why', 'stuck'], task);
  expect(run.status, run.stderr).toBe(0);
  const id = /bt-[a-f0-9]{12}/.exec(run.stdout)![0];
  expect(loadRecord(repo, id).content?.task).toEqual({ file: 'standard input', text: task });
});

describe('10. the existing named refusals keep their reason names and exit codes', () => {
  it.each([
    [['create', '--task', 'TASK.md', '--why', 'x', '--setup'], 'checks-removed'],
    [['create', '--task', 'TASK.md', '--why', 'x', '--check'], 'checks-removed'],
    [['create', '--task', 'TASK.md', '--why', 'x', '--guard'], 'checks-removed'],
    [['create', '--task', 'TASK.md', '--why', 'x', '--reward', '5'], 'reward-agent-set'],
    [['create', '--task', 'TASK.md', '--why', 'x', '--note', 'n'], 'create-option-retired'],
    [['create', '--task', 'TASK.md', '--why', 'x', '--job', 'j'], 'create-option-retired'],
    [['create', '--task', 'TASK.md', '--why', 'x', '--out', 'dir'], 'folder-delivery-retired'],
    [['look', 'bt-000000000000', '1', '--from', 'dir'], 'folder-delivery-retired'],
    [['post', 'bt-000000000000', '--to', 'dir'], 'folder-delivery-retired'],
    [['post', 'bt-000000000000', '--reward', '5'], 'reward-agent-set'],
    [['apply', 'bt-000000000000', '1', '--yes'], 'merge-approval-agent'],
    [['answer'], 'command-removed'],
    [['owner', 'setup'], 'command-removed']
  ])('box bounty %j refuses (%s) exit 3', (args, reason) => {
    const run = bounty(runRoot('bt18-refusals'), args);
    expect(run.status, run.stderr).toBe(3);
    expect(run.stderr).toContain(`(${reason})`);
  });
});

it('11. box --version and box bounty --version print the package version', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'packages', 'box-cli', 'package.json'), 'utf8')) as { version: string };
  for (const args of [['--version'], ['bounty', '--version']]) {
    const run = cli(runRoot('bt18-version'), args);
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout.trim()).toBe(`box ${pkg.version}`);
  }
});
