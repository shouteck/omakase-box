// BT65: `omakase-box setup` acts only on exactly what it was asked. `--help` writes nothing, a typo of `--remove` is refused
// instead of running the setup, and every command's `--help` is safe to run (BT12's rule, pinned). The command writes into the
// owner's home folder, so each case runs in a scratch home with a stub `npm` first on the PATH that records any call.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOUNTY_COMMANDS } from '../../../packages/box-bounty/index.js';
import { SKILL_TEXT } from '../../../packages/box-bounty/wording.js';
import { CLI_DIST, git, runRoot } from './support.js';

/** A scratch world: a home folder where Claude Code and the shared agents folder exist, a working repository, a settings
    folder, and a stub `npm` that records a call and fails, so an install attempt is seen and never happens. */
function world(label: string) {
  const root = runRoot(`bt65-${label}`);
  const home = join(root, 'home');
  const work = join(root, 'work');
  const settings = join(root, 'settings');
  const stub = join(root, 'stub');
  const calls = join(root, 'npm-calls.txt');
  for (const dir of [join(home, '.claude'), join(home, '.agents'), work, settings, stub]) mkdirSync(dir, { recursive: true });
  git(work, ['init', '-q', '.']);
  if (process.platform === 'win32') writeFileSync(join(stub, 'npm.cmd'), `@echo off\r\necho %* >> "${calls}"\r\nexit /b 1\r\n`);
  else { writeFileSync(join(stub, 'npm'), `#!/bin/sh\necho "$@" >> "${calls}"\nexit 1\n`); chmodSync(join(stub, 'npm'), 0o755); }
  const env = { ...process.env, HOME: home, USERPROFILE: home, BOX_BOUNTY_SETTINGS_DIR: settings, PATH: `${stub}${delimiter}${process.env['PATH'] ?? ''}` };
  const run = (entry: string, args: string[]) => spawnSync(process.execPath, [entry, ...args], { cwd: work, encoding: 'utf8', env, timeout: 60000 });
  const npmCalls = (): string => (existsSync(calls) ? readFileSync(calls, 'utf8') : '');
  return { home, work, settings, run, npmCalls };
}

/** Every file under the given folders, by relative path and size, so any write shows. `.git` is left out. */
function snapshot(...roots: string[]): string[] {
  const out: string[] = [];
  const walk = (base: string, dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      if (name === '.git') continue;
      const full = join(dir, name);
      const stat = statSync(full);
      out.push(`${base}|${full.slice(base.length)}|${stat.isDirectory() ? 'dir' : stat.size}`);
      if (stat.isDirectory()) walk(base, full);
    }
  };
  for (const root of roots) walk(root, root);
  return out;
}

describe('BT65: setup acts only on exactly what it was asked', () => {
  it('1. --help and -h print what setup does and write nothing', () => {
    const w = world('help');
    const before = snapshot(w.home, w.work, w.settings);
    for (const flag of ['--help', '-h']) {
      const ran = w.run(CLI_DIST, ['setup', flag]);
      expect(ran.status, `${flag}: ${ran.stdout}${ran.stderr}`).toBe(0);
      const text = ran.stdout;
      expect(text).toContain('usage: omakase-box setup');
      expect(text).toContain('--remove');
      expect(text.toLowerCase()).toContain('edits to it are replaced');
      expect(text).toContain('own folder');
    }
    expect(snapshot(w.home, w.work, w.settings)).toEqual(before);
    expect(w.npmCalls(), 'help tried an install').toBe('');
  });

  it('2. a typo, a stray word or an extra word is refused with exit 2 and nothing is written', () => {
    const w = world('refuse');
    const before = snapshot(w.home, w.work, w.settings);
    for (const args of [['--remov'], ['--help', 'extra'], ['foo'], ['--remove', 'extra'], ['--dry-run']]) {
      const ran = w.run(CLI_DIST, ['setup', ...args]);
      expect(ran.status, `setup ${args.join(' ')}: ${ran.stdout}${ran.stderr}`).toBe(2);
      expect(ran.stderr).toContain('nothing was written');
      expect(ran.stderr).toContain('omakase-box setup --help');
    }
    const typo = w.run(CLI_DIST, ['setup', '--remov']);
    expect(typo.stderr).toContain('did you mean --remove?');
    expect(snapshot(w.home, w.work, w.settings)).toEqual(before);
    expect(w.npmCalls(), 'a refused setup tried an install').toBe('');
  });

  it('3. --remove takes away our skill and leaves a file without our marker as it is', () => {
    const w = world('remove');
    const ours = join(w.home, '.claude', 'skills', 'omakase-box');
    const theirs = join(w.home, '.agents', 'skills', 'omakase-box');
    mkdirSync(ours, { recursive: true });
    mkdirSync(theirs, { recursive: true });
    writeFileSync(join(ours, 'SKILL.md'), SKILL_TEXT);
    writeFileSync(join(theirs, 'SKILL.md'), '---\nname: omakase-box\n---\nA skill the owner wrote.\n');
    const ran = w.run(CLI_DIST, ['setup', '--remove']);
    expect(ran.status, ran.stdout + ran.stderr).toBe(0);
    expect(existsSync(ours), 'our skill is still there').toBe(false);
    expect(readFileSync(join(theirs, 'SKILL.md'), 'utf8')).toContain('A skill the owner wrote.');
    expect(ran.stdout).toContain('is not ours');
    expect(w.npmCalls()).toBe('');
  });

  it('4. every command answers --help with usage, exit 0, and changes nothing', () => {
    const w = world('every');
    // `overview` is the bare command's own table entry, not a word a person types.
    const commands = [...Object.keys(BOUNTY_COMMANDS).filter(name => name !== 'overview'), 'setup'];
    expect(commands.length).toBeGreaterThan(12);
    const before = snapshot(w.home, w.work, w.settings);
    for (const command of commands) {
      const ran = w.run(CLI_DIST, [command, '--help']);
      expect(ran.status, `${command} --help: ${ran.stdout}${ran.stderr}`).toBe(0);
      expect((ran.stdout + ran.stderr).trim().length, `${command} --help printed nothing`).toBeGreaterThan(0);
    }
    expect(snapshot(w.home, w.work, w.settings)).toEqual(before);
    expect(w.npmCalls()).toBe('');
  });
});
