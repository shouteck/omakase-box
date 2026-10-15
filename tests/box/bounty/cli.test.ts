import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BountyRefused, BountyUsage, parseCreateArgs } from '../../../packages/box-bounty/index.js';
import { CLI_DIST, makeRepo, runRoot, write } from './support.js';

// The command line: how a person or agent actually drives it, and the arg shapes
// it must take without a shell.

describe('bounty create argument parsing', () => {
  it('parses the documented form', () => {
    const parsed = parseCreateArgs(['--why', 'stuck', '--title', 'fix me', '--task', 'TASK.md', '--resume', 'unfinished work', '--repo', '.']);
    expect(parsed).toEqual({
      why: 'stuck', title: 'fix me', task: 'TASK.md', resume: 'unfinished work',
      repo: '.'
    });
  });

  // Checks were removed on 11 October 2026: each old command flag is a NAMED
  // refusal that says checks were removed — an agent reusing an old command
  // line gets the reason, never a silent drop.
  it.each(['--check', '--setup', '--guard'])('the removed %s flag is a named checks-removed refusal', flag => {
    try {
      parseCreateArgs(['--why', 'w', '--task', 'T.md', flag, '--', 'npm', 'test']);
      expect.unreachable('expected a refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(BountyRefused);
      expect(error).toMatchObject({ reason: 'checks-removed' });
      expect((error as Error).message).toContain(flag);
      expect((error as Error).message).toContain('removed');
    }
  });

  it('rejects missing and malformed input with usage wording', () => {
    for (const argv of [
      ['--title'],
      ['nonsense'],
      ['--title', 'a', '--title', 'b']
    ]) {
      expect(() => parseCreateArgs(argv)).toThrowError(BountyUsage);
    }
  });
});

// The real command, against the built CLI: a preview writes nothing, and a
// create produces the folder and the stage line. An old check flag is a named
// refusal — checks were removed, nothing runs. Skipped unless the bundle
// exists — verify builds before suites run.
describe('box bounty create (built cli)', () => {
  const cli = (cwd: string, args: string[]) =>
    spawnSync(process.execPath, [CLI_DIST, ...args], { cwd, encoding: 'utf8' });
  const built = existsSync(CLI_DIST);

  it('prints the stage line on success', () => {
    if (!built) throw new Error('packages/box-cli/dist/cli.js is missing — run the build first');
    const repo = makeRepo({ 'src/x.py': 'x\n', 'TASK.md': 'task\n' });
    const out = join(runRoot('out'), 'bounty');
    const run = cli(repo, ['bounty', 'create', '--why', 'w', '--title', 't', '--task', 'TASK.md']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('— drafted in '); // BT17: <id> — drafted in <repository>
    expect(run.stdout).toMatch(/bt-[a-f0-9]{12}/);
    const id = /bt-[a-f0-9]{12}/.exec(run.stdout)![0];
    expect(existsSync(join(repo, '.box/bounties', id + '.json'))).toBe(true);
    expect(existsSync(out)).toBe(false);
  });

  it('refuses an old check flag with the named checks-removed state and writes nothing', () => {
    if (!built) throw new Error('packages/box-cli/dist/cli.js is missing — run the build first');
    const repo = makeRepo({ 'src/x.py': 'x\n', 'TASK.md': 'task\n' });
    const out = join(runRoot('out'), 'bounty');
    const run = cli(repo, ['bounty', 'create', '--why', 'w', '--title', 't', '--task', 'TASK.md', '--check', '--', 'python', 'check.py']);
    expect(run.status).toBe(3);
    expect(run.stderr).toContain('checks-removed');
    expect(run.stderr).toContain('removed');
    expect(existsSync(out)).toBe(false);
  });

  it('refuses clearly outside a Git checkout', () => {
    if (!built) throw new Error('packages/box-cli/dist/cli.js is missing — run the build first');
    const dir = runRoot('plain');
    write(dir, 'TASK.md', 'task\n');
    const run = cli(dir, ['bounty', 'create', '--why', 'w', '--title', 't', '--task', 'TASK.md']);
    expect(run.status).toBe(3);
    expect(run.stderr).toContain('not-a-repository');
    expect(run.stderr).toContain('box bounty create'); // names the command actually run
  });

  it('refuses create without --why by name, not with a usage wall', () => {
    if (!built) throw new Error('packages/box-cli/dist/cli.js is missing — run the build first');
    const repo = makeRepo({ 'src/x.py': 'x\n', 'TASK.md': 'task\n' });
    const run = cli(repo, ['bounty', 'create', '--task', 'TASK.md']);
    expect(run.status).toBe(3);
    expect(run.stderr).toContain('missing-why');
  });

  it('creates with the minimum command — task and why only', () => {
    if (!built) throw new Error('packages/box-cli/dist/cli.js is missing — run the build first');
    const repo = makeRepo({ 'src/x.py': 'x\n', 'TASK.md': 'Fix the thing.\n' });
    const run = cli(repo, ['bounty', 'create', '--task', 'TASK.md', '--why', 'stuck']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('— drafted in ');
    // The derived title is detail now — the compact surface prints it only
    // when it was shortened; --full carries the whole draft preview (BT17).
    const full = cli(repo, ['bounty', 'create', '--task', 'TASK.md', '--why', 'stuck', '--full']);
    expect(full.status).toBe(0);
    expect(full.stdout).toContain('title: Fix the thing.');
    // The default place to write: bounties/<slug> next to the repository root.
    const out = join(realpathSync(dirname(repo)), 'bounties', 'fix-the-thing');
    expect(existsSync(out)).toBe(false);
    expect(run.stdout).toContain(`box bounty post`);
  });
});

describe('box bounty help (built cli)', () => {
  const cli = (cwd: string, args: string[]) =>
    spawnSync(process.execPath, [CLI_DIST, ...args], { cwd, encoding: 'utf8' });
  const built = existsSync(CLI_DIST);

  it('prints the whole journey on one screen — and works outside a checkout', () => {
    if (!built) throw new Error('packages/box-cli/dist/cli.js is missing — run the build first');
    const dir = runRoot('plain');
    mkdirSync(dir, { recursive: true });
    const run = cli(dir, ['bounty', 'help']);
    expect(run.status).toBe(0);
    expect(run.stdout).not.toBe('');
    for (const word of ['create', 'post', 'look', 'apply', 'close', 'status', 'describe', 'drafted', 'posted', 'applied']) {
      expect(run.stdout).toContain(word);
    }
    // help lists only commands that exist — no removed name.
    expect(run.stdout).not.toMatch(/\b(answer|answers|undo|reject|withdraw|questions|reply|remind|confirm)\b/);
    expect(run.stdout).toContain('what ends a bounty');
    expect(run.stdout).toContain('--why');
  });

  it('a wrong verb names the command run', () => {
    if (!built) throw new Error('packages/box-cli/dist/cli.js is missing — run the build first');
    const dir = runRoot('plain');
    mkdirSync(dir, { recursive: true });
    const wrong = cli(dir, ['bounty', 'frobnicate']);
    expect(wrong.status).toBe(2);
    expect(wrong.stderr).toContain('frobnicate');
    expect(wrong.stderr).toContain('box bounty help');
  });

  it('status outside a checkout names the command actually run, not create', () => {
    if (!built) throw new Error('packages/box-cli/dist/cli.js is missing — run the build first');
    const dir = runRoot('plain');
    mkdirSync(dir, { recursive: true });
    const run = cli(dir, ['bounty', 'status']);
    expect(run.status).toBe(3);
    expect(run.stderr).toContain('not-a-repository');
    expect(run.stderr).toContain('box bounty status');
  });
});
