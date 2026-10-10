import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BountyUsage, parseCreateArgs } from '../../../packages/box-bounty/index.js';
import { CLI_DIST, makeRepo, runRoot, write } from './support.js';

// The command line: how a person or agent actually drives it, and the arg shapes
// it must take without a shell.

describe('bounty create argument parsing', () => {
  it('parses the documented form', () => {
    const parsed = parseCreateArgs(['--title', 'fix me', '--task', 'TASK.md', '--note', 'NOTE.md', '--setup', '--', 'npm.cmd', 'install', '--check', '--', 'python', 'check.py', '--out', 'dist-bounty', '--repo', '.', '--preview']);
    expect(parsed).toEqual({
      title: 'fix me', task: 'TASK.md', note: 'NOTE.md',
      setup: ['npm.cmd', 'install'], check: ['python', 'check.py'],
      out: 'dist-bounty', repo: '.', preview: true
    });
  });

  it('keeps a bare -- inside a command and ends the segment at the next box flag', () => {
    const parsed = parseCreateArgs(['--out', 'out', '--check', '--', 'npm.cmd', 'test', '--', '--grep', 'x', '--title', 't', '--task', 'T.md']);
    expect(parsed.check).toEqual(['npm.cmd', 'test', '--', '--grep', 'x']);
    expect(parsed.out).toBe('out');
    expect(parsed.title).toBe('t');
  });

  it('rejects missing and malformed input with usage wording', () => {
    for (const argv of [
      ['--check', 'python', 'x.py'],
      ['--setup', '--'],
      ['--title'],
      ['nonsense'],
      ['--title', 'a', '--title', 'b']
    ]) {
      expect(() => parseCreateArgs(argv)).toThrowError(BountyUsage);
    }
  });
});

// The real command, against the built CLI: a preview writes nothing, a passing
// check is refused with a named state and a non-check exit, and a failing check
// produces the folder and the stage line. Skipped unless the bundle exists —
// verify builds before suites run.
describe('box bounty create (built cli)', () => {
  const cli = (cwd: string, args: string[]) =>
    spawnSync(process.execPath, [CLI_DIST, ...args], { cwd, encoding: 'utf8' });
  const built = existsSync(CLI_DIST);

  it('preview prints what would leave and writes nothing', () => {
    if (!built) throw new Error('packages/box-cli/dist/cli.js is missing — run the build first');
    const repo = makeRepo({ 'src/x.py': 'x\n', 'TASK.md': 'task\n', 'secrets/k.key': 'fake\n' });
    const out = join(runRoot('out'), 'bounty');
    const run = cli(repo, ['bounty', 'create', '--title', 't', '--task', 'TASK.md', '--check', '--', 'python', '-c', 'import sys; sys.exit(1)', '--out', out, '--preview']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('preview of what would leave');
    expect(run.stdout).toContain('secrets/k.key');
    expect(run.stdout).toContain('secrets-dir: 1');
    expect(run.stdout).toContain('preview only — nothing was written');
    expect(existsSync(out)).toBe(false);
  });

  it('prints the stage line on success', () => {
    if (!built) throw new Error('packages/box-cli/dist/cli.js is missing — run the build first');
    const repo = makeRepo({ 'src/x.py': 'x\n', 'TASK.md': 'task\n' });
    const out = join(runRoot('out'), 'bounty');
    const run = cli(repo, ['bounty', 'create', '--title', 't', '--task', 'TASK.md', '--check', '--', 'python', '-c', 'import sys; sys.exit(7)', '--out', out]);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('stage 1 of 7: drafted');
    expect(run.stdout).toMatch(/bt-[a-f0-9]{12}/);
    expect(existsSync(join(out, 'bounty.json'))).toBe(true);
  });

  it('refuses a passing check with a named state and a non-check exit', () => {
    if (!built) throw new Error('packages/box-cli/dist/cli.js is missing — run the build first');
    const repo = makeRepo({ 'src/x.py': 'x\n', 'TASK.md': 'task\n' });
    const out = join(runRoot('out'), 'bounty');
    const run = cli(repo, ['bounty', 'create', '--title', 't', '--task', 'TASK.md', '--check', '--', 'python', '-c', 'import sys; sys.exit(0)', '--out', out]);
    expect(run.status).toBe(3);
    expect(run.stderr).toContain('check-already-passes');
    expect(existsSync(out)).toBe(false);
  });

  it('refuses clearly outside a Git checkout', () => {
    if (!built) throw new Error('packages/box-cli/dist/cli.js is missing — run the build first');
    const dir = runRoot('plain');
    write(dir, 'TASK.md', 'task\n');
    const run = cli(dir, ['bounty', 'create', '--title', 't', '--task', 'TASK.md', '--out', join(runRoot('out'), 'b')]);
    expect(run.status).toBe(3);
    expect(run.stderr).toContain('not-a-repository');
  });
});
