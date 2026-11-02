// `box setup` (PF16): one command, and a new agent session finds the tool. It runs the built
// CLI with its own home, so this machine's agents are never touched. A `box` stand-in on the
// path skips the install; bt12-install covers the install itself from the package.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderRulesBlock, SKILL_MARKER, SKILL_TEXT } from '../../../packages/box-bounty/index.js';
import { CLI_DIST } from './support.js';

let home = '';
let bin = '';
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'kitchen-PF16-home-'));
  bin = join(home, 'bin');
  mkdirSync(bin);
  for (const name of ['box', 'box.cmd']) writeFileSync(join(bin, name), '');
});
afterEach(() => rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }));

const box = (args: string[]) => spawnSync(process.execPath, [CLI_DIST, 'setup', ...args], { encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home, PATH: [bin, process.env['PATH']].join(delimiter) } });
const claude = () => join(home, '.claude', 'skills', 'omakase-box', 'SKILL.md');
const agents = () => join(home, '.agents', 'skills', 'omakase-box', 'SKILL.md');

describe('box setup', { timeout: 60000 }, () => {
  it('writes a skill for the agents it finds, says exactly what, and touches nothing else', () => {
    mkdirSync(join(home, '.claude'));
    const run = box([]);
    expect(run.status, run.stderr).toBe(0);
    expect(readFileSync(claude(), 'utf8')).toBe(SKILL_TEXT);
    expect(existsSync(agents())).toBe(false);
    expect(run.stdout).toContain('box: already on this machine.');
    expect(run.stdout).toContain('Claude Code: wrote ~/.claude/skills/omakase-box/SKILL.md, nothing else.');
    // Plain, and no username to paste into a chat.
    expect(run.stdout).not.toContain(home);
    expect(run.stdout).not.toContain('\\');
    expect(run.stdout).toContain('your next agent session finds the tool');
    expect(run.stdout).toContain('undo: box setup --remove');
  });
  it('one folder serves Codex, Cursor and Gemini CLI', () => {
    mkdirSync(join(home, '.codex'));
    expect(box([]).stdout).toContain('Codex, Cursor and Gemini CLI: wrote ~/.agents/skills/omakase-box/SKILL.md');
    expect(readFileSync(agents(), 'utf8')).toBe(SKILL_TEXT);
    expect(existsSync(claude())).toBe(false);
  });
  it('with no agent found it writes nothing and names the other way', () => {
    const run = box([]);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('no agent found in its usual place');
    expect(run.stdout).toContain('box bounty config set instructions true');
    expect(existsSync(join(home, '.claude'))).toBe(false);
    expect(existsSync(join(home, '.agents'))).toBe(false);
  });
  it('running it twice changes nothing', () => {
    mkdirSync(join(home, '.claude'));
    box([]);
    expect(box([]).status).toBe(0);
    expect(readFileSync(claude(), 'utf8')).toBe(SKILL_TEXT);
  });
  it('a folder of that name that is not ours is left alone, by setup and by remove', () => {
    const folder = join(home, '.claude', 'skills', 'omakase-box');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'SKILL.md'), 'somebody else wrote this');
    writeFileSync(join(folder, 'notes.txt'), 'and this');
    expect(box([]).stdout).toContain('is not ours, so it was left as it is');
    expect(readFileSync(join(folder, 'SKILL.md'), 'utf8')).toBe('somebody else wrote this');
    expect(box(['--remove']).stdout).toContain('is not ours, so it was left as it is');
    expect(readFileSync(join(folder, 'notes.txt'), 'utf8')).toBe('and this');
  });
  it('--remove takes away only what it wrote, and says box itself stays', () => {
    mkdirSync(join(home, '.claude'));
    writeFileSync(join(home, '.claude', 'keep.txt'), 'mine');
    box([]);
    const run = box(['--remove']);
    expect(run.status).toBe(0);
    expect(existsSync(join(home, '.claude', 'skills', 'omakase-box'))).toBe(false);
    expect(readFileSync(join(home, '.claude', 'keep.txt'), 'utf8')).toBe('mine');
    expect(run.stdout).toContain('box itself stays');
    expect(box(['--remove']).stdout).toContain('no skill of ours was found');
  });
  it('a failed install says why and what to run, and the skill is still written', () => {
    mkdirSync(join(home, '.claude'));
    rmSync(bin, { recursive: true });
    const run = spawnSync(process.execPath, [CLI_DIST, 'setup'], { encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home, BOX_SETUP_PACKAGE: join(home, 'no-such-package.tgz'), npm_config_prefix: join(home, 'prefix'), PATH: (process.env['PATH'] ?? '').split(delimiter).filter(dir => !existsSync(join(dir, 'box')) && !existsSync(join(dir, 'box.cmd'))).join(delimiter) } });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('box: not installed (');
    expect(run.stdout).toContain('next: npm install -g');
    expect(existsSync(claude())).toBe(true);
  });
});

describe('the skill', () => {
  it('states the block\'s facts, carries the marker, and steers nobody', () => {
    for (const fact of ['free', 'public GitHub', 'The owner decides once', 'says what to ask them', 'box bounty', 'always your call']) expect(SKILL_TEXT).toContain(fact);
    expect(renderRulesBlock('idle')).toContain('free');
    expect(SKILL_TEXT).toContain(SKILL_MARKER);
    expect(SKILL_TEXT.startsWith('---\nname: omakase-box\ndescription: ')).toBe(true);
    expect(SKILL_TEXT).not.toMatch(/\bmust\b|solvers? (are|is) waiting|guarantee/i);
    expect(SKILL_TEXT.length).toBeLessThan(800);
  });
});
