// BT63 — the command is `omakase-box`. Box (the storage company) owns the command `box`, and npm refuses to
// install a package that names it beside @box/cli (the wave file's "Stopped at step 1"), so the old name is
// gone: no `box` in the manifest and no notice. What is pinned here: nothing the tool prints names the old
// command, `omakase-box bounty <x>` still works silently, `setup` replaces and removes an old skill but
// never touches a file that is not ours, and an old instruction block is rewritten in place.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BOUNTY_COMMANDS, changeConfig, RULES_LINES, SKILL_TEXT } from '../../../packages/box-bounty/index.js';
import { SETUP_LINES } from '../../../packages/box-bounty/wording.js';
import { CLI_DIST, makeRepo, runRoot } from './support.js';

// The old command in any printed line: `box bounty`, `box setup`, `box <command>`, `box --…`, `box.cmd`. Not
// matched on purpose: `omakase-box`, the label `box-bounty`, and the posted issue's title prefix `[box bounty <id>]`
// (data that bounties already posted carry, not a command).
const OLD_COMMAND = /(?<![\[\w-])box (?:bounty|setup|help|status|post|look|apply|close|create|describe|discover|take|submit|allow|deny|config|hook|--)|(?<![\w-])box\.(?:cmd|exe)\b/;
const OLD_SKILL_MARKER = '<!-- written by box setup; box setup --remove takes it away -->';

const run = (cwd: string, args: string[], extraEnv: Record<string, string> = {}) =>
  spawnSync(process.execPath, [CLI_DIST, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...extraEnv }, timeout: 60000 });
const offending = (label: string, text: string): string[] => text.split('\n').filter(line => OLD_COMMAND.test(line)).map(line => `${label}: ${line.trim()}`);

describe('1. nothing the tool prints names the old command', () => {
  const NAMES = Object.keys(BOUNTY_COMMANDS);
  it('the command table, the skill, the setup lines and the instruction block', () => {
    const found: string[] = [];
    for (const [name, spec] of Object.entries(BOUNTY_COMMANDS)) found.push(...offending(`table ${name}`, [spec.label, spec.usage, spec.blurb, spec.example].join('\n')));
    found.push(...offending('skill', SKILL_TEXT), ...offending('setup lines', SETUP_LINES.join('\n')), ...offending('block', RULES_LINES.join('\n')));
    expect(found).toEqual([]);
  });
  it('every command through the new entry: its help, and one refusal in a folder that is no repository', () => {
    const dir = runRoot('bt63-printed');
    const found: string[] = [];
    for (const name of ['', ...NAMES]) {
      const asked = name === '' ? [] : [name];
      for (const args of [[...asked, '--help'], asked, [...asked, '--no-such-option']]) {
        const outcome = run(dir, args);
        found.push(...offending(`omakase-box ${args.join(' ')} (stdout)`, outcome.stdout), ...offending(`omakase-box ${args.join(' ')} (stderr)`, outcome.stderr));
      }
    }
    for (const args of [['setup', '--help'], ['--help'], ['--version'], ['nonsense']]) {
      const outcome = run(dir, args, { HOME: dir, USERPROFILE: dir });
      found.push(...offending(`omakase-box ${args.join(' ')}`, `${outcome.stdout}\n${outcome.stderr}`));
    }
    expect(found).toEqual([]);
  });
  it('a repository: the overview, describe and config, as an agent first meets them', () => {
    const repo = makeRepo({ 'a.txt': 'a\n' });
    const found: string[] = [];
    for (const args of [[], ['describe'], ['describe', '--solving'], ['config'], ['status']]) {
      const outcome = run(repo, args);
      found.push(...offending(`omakase-box ${args.join(' ')}`, `${outcome.stdout}\n${outcome.stderr}`));
    }
    expect(found).toEqual([]);
  });
});

describe('5. the form with `bounty` still works, silently', () => {
  it('`omakase-box bounty <x>` answers exactly as `omakase-box <x>`, with nothing on standard error', () => {
    const dir = runRoot('bt63-compat');
    for (const args of [['help'], ['create', '--help'], ['describe', '--rules']]) {
      const plain = run(dir, args);
      const spelled = run(dir, ['bounty', ...args]);
      expect(spelled.status, spelled.stderr).toBe(plain.status);
      expect(spelled.stdout).toBe(plain.stdout);
      expect(spelled.stderr).toBe(plain.stderr);
    }
  });
});

describe('6, 7. setup replaces an old skill and removes either; a file that is not ours is never touched', () => {
  let home = '';
  let bin = '';
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'kitchen-BT63-home-'));
    bin = join(home, 'bin');
    mkdirSync(bin);
    for (const name of ['omakase-box', 'omakase-box.cmd']) writeFileSync(join(bin, name), ''); // a stand-in on the path skips the npm install
    mkdirSync(join(home, '.claude'));
  });
  afterEach(() => rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }));
  const setup = (args: string[] = []) => run(home, ['setup', ...args], { HOME: home, USERPROFILE: home, PATH: [bin, process.env['PATH'] ?? ''].join(delimiter) });
  const skillFile = () => join(home, '.claude', 'skills', 'omakase-box', 'SKILL.md');
  const writeSkill = (text: string) => { mkdirSync(join(home, '.claude', 'skills', 'omakase-box'), { recursive: true }); writeFileSync(skillFile(), text); };

  it('a skill written under the old marker is replaced with the new text, and `setup --remove` then removes it', () => {
    writeSkill(`---\nname: omakase-box\n---\n${OLD_SKILL_MARKER}\n\nRun \`box bounty\` in the project.\n`);
    const done = setup();
    expect(done.status, done.stderr).toBe(0);
    expect(readFileSync(skillFile(), 'utf8')).toBe(SKILL_TEXT);
    expect(readFileSync(skillFile(), 'utf8')).not.toContain('box bounty');
    expect(setup(['--remove']).status).toBe(0);
    expect(existsSync(skillFile())).toBe(false);
  });
  it('`setup --remove` removes a skill that still carries the old marker', () => {
    writeSkill(`${OLD_SKILL_MARKER}\nold text\n`);
    expect(setup(['--remove']).status).toBe(0);
    expect(existsSync(skillFile())).toBe(false);
  });
  it('a skill file with neither marker is left exactly as it is, by both commands', () => {
    const theirs = 'someone else wrote this skill\n';
    writeSkill(theirs);
    const done = setup();
    expect(done.stdout).toContain('is not ours');
    setup(['--remove']);
    expect(readFileSync(skillFile(), 'utf8')).toBe(theirs);
  });
});

describe('8. an instruction block written under the old words is rewritten in place, once', () => {
  it('the markers stay, the interior says the new command, and nothing outside moves', () => {
    const repo = makeRepo({ 'TASK.md': 'Fix the sum.\n', 'AGENTS.md': 'first\n' });
    writeFileSync(join(repo, 'AGENTS.md'), 'before\n<!-- box-bounty -->\nRun `box bounty` in the project.\n<!-- /box-bounty -->\nafter\n');
    expect(changeConfig(repo, 'set', 'instructions', 'true')).toContain('AGENTS.md');
    const text = readFileSync(join(repo, 'AGENTS.md'), 'utf8');
    expect(text.startsWith('before\n<!-- box-bounty -->\n')).toBe(true);
    expect(text.endsWith('<!-- /box-bounty -->\nafter\n')).toBe(true);
    expect(text.match(/<!-- box-bounty -->/g)).toHaveLength(1);
    expect(text).not.toMatch(OLD_COMMAND);
    expect(text).toContain('omakase-box');
  });
});
