// BT53: the next release is ready to publish, and its first page is true. The package's README is FIRST-FIVE-MINUTES.md,
// so these tests read it as an agent would: every command it names exists in this build, the uninstall line is the one the
// tool prints, the solving half is described, and "nobody is known to be watching" is gone from every place it was said.
// The packed manifest and the tarball's README are checked in bt12-package.test.ts, which already packs once.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BOUNTY_COMMANDS, renderDescribe, renderHelp, renderOverview } from '../../../packages/box-bounty/index.js';
import { BOARD_DEFAULT } from '../../../packages/box-bounty/board.js';
import { PACKAGE_REMOVE } from '../../../packages/box-bounty/wording.js';
import { makeRepo } from './support.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const README = readFileSync(join(ROOT, 'FIRST-FIVE-MINUTES.md'), 'utf8');

/** The word after the tool's name in every code line and inline code span: what the README tells a reader to type. */
const commandWords = (text: string): string[] => {
  const spans = [...text.matchAll(/^ {4}(omakase-box(?:\.cmd)? [^\n]*)$/gm), ...text.matchAll(/`(omakase-box(?:\.cmd)? [^`]*)`/g)].map(match => match[1]!);
  return spans.map(span => /^omakase-box(?:\.cmd)? (\S+)/.exec(span)?.[1] ?? '').filter(word => word !== '' && !word.startsWith('-') && !word.startsWith('<'));
};
const unknownCommands = (text: string): string[] => commandWords(text).filter(word => !(word in BOUNTY_COMMANDS) && word !== 'setup' && word !== 'bounty');

describe('BT53: the README names only commands this build has', () => {
  it('1. every command word in a code span is a command of the tool', () => {
    const words = commandWords(README);
    expect(words.length, 'the README names no commands').toBeGreaterThan(10);
    expect(unknownCommands(README)).toEqual([]);
  });

  it('1b. the check fails on a made-up command (so it can fail)', () => {
    expect(unknownCommands(`${README}\n    omakase-box frobnicate <id>\n`)).toEqual(['frobnicate']);
    expect(unknownCommands(`Run \`omakase-box transmute --now\` later.`)).toEqual(['transmute']);
  });

  it('2. both uninstall lines are the one the tool prints, and the package is never named box-bounty', () => {
    const lines = README.split('\n').filter(line => line.includes('npm uninstall -g'));
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) expect(line.replace(/^[\s-]*`?/, '').replace(/`.*$/, '').trim().startsWith(PACKAGE_REMOVE), line).toBe(true);
    expect(README).not.toMatch(/npm (?:i|install|uninstall)(?: -g)? box-bounty/);
  });

  it('3. nothing says nobody is known to be watching: help, describe, a bare run and the README', () => {
    const repo = makeRepo({ 'TASK.md': 'task\n' });
    for (const [name, text] of Object.entries({ help: renderHelp(), describe: renderDescribe(repo), bare: renderOverview(repo), readme: README })) {
      expect(text.toLowerCase(), name).not.toContain('watching');
    }
  });

  it('4. a reward is set before the first post, and an unasked status does not remind the owner of a payment', () => {
    expect(README).toContain('omakase-box allow owner/project --reward <whole dollars> --reward-limit <whole dollars>');
    expect(README).not.toContain('keeps naming the payment owed');
    expect(README).toMatch(/`omakase-box status <id>`[^.]*(owed|paid)/);
  });

  it('5. the solving half is described: off until the owner allows it, then discover, take, submit, and being paid', () => {
    const at = README.indexOf('\n## Solving');
    expect(at, 'no Solving section').toBeGreaterThan(-1);
    const next = README.indexOf('\n## ', at + 5);
    const section = README.slice(at, next === -1 ? undefined : next).trim().split('\n');
    expect(section.length).toBeLessThanOrEqual(17); // the heading, a blank line and at most 15 lines
    const text = section.join('\n');
    for (const needed of ['omakase-box config set solving allowed', 'omakase-box discover', 'omakase-box take', 'omakase-box submit', 'connects a way once on the board']) expect(text, needed).toContain(needed);
    expect(text.toLowerCase()).not.toMatch(/guarantee|will find work|always/);
  });

  it('6. the board, its feed and its MCP address are named once, with the three ways to pay', () => {
    expect(README.split(BOARD_DEFAULT).length - 1).toBeGreaterThanOrEqual(1);
    expect(README).toContain('/bounties.json');
    expect(README).toContain('POST /mcp');
    for (const way of ['by hand', 'one click', 'on merge']) expect(README.toLowerCase(), way).toContain(way);
  });
});
