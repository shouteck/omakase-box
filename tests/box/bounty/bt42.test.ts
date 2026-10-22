// BT42 — the instruction block says what posting really costs. K44's fresh
// agents read "what it costs" as a fee and the tool as "an outside service";
// the block now states, in constant words, that posting is free, that a
// bounty goes only to this repository's own public GitHub, and that the
// owner's permission applies (`box bounty config` shows it). Two assertions
// over the real surfaces: the rendered block in every state, and the block
// the tool writes into two projects whose owner settings differ. BT17's
// `describe --rules` budget is held by bt17.test.ts. The bites (put "what it
// costs" back; put a setting value in a line) are recorded in waves/BT42.md.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderRulesBlock, RULES_MARKERS } from '../../../packages/box-bounty/index.js';
import { CLI_DIST, git, makeRepo } from './support.js';

const box = (cwd: string, args: string[]) =>
  spawnSync(process.execPath, [CLI_DIST, 'bounty', ...args], { cwd, encoding: 'utf8', env: process.env, timeout: 60000 });

const STATES = ['idle', 'open', 'new'] as const;

// The lines between the markers of the first block in a text.
const interior = (text: string): string => {
  const open = text.indexOf(RULES_MARKERS.open);
  const close = text.indexOf(RULES_MARKERS.close);
  expect(open, `no ${RULES_MARKERS.open} in:\n${text}`).toBeGreaterThanOrEqual(0);
  expect(close, `no ${RULES_MARKERS.close} in:\n${text}`).toBeGreaterThan(open);
  return text.slice(open + RULES_MARKERS.open.length, close).replaceAll('\r\n', '\n').trim();
};

describe('BT42 — the instruction block states the decision facts in constant words', () => {
  it('every state says free, public and `box bounty config`, and nothing that reads as a price', () => {
    for (const state of STATES) {
      const block = renderRulesBlock(state);
      for (const fact of ['free', 'public', '`box bounty config`']) expect(block, `${state} block lacks ${fact}`).toContain(fact);
      for (const price of ['cost', 'fee', 'price', 'paid']) expect(block.toLowerCase(), `${state} block reads as a price (${price})`).not.toContain(price);
    }
  });

  it('two projects with different owner settings get the same block, written and printed', () => {
    // Project A: allowed, reward $25. Project B: not allowed, reward $0.
    const projects = [
      { name: 'bt42-a', allow: true },
      { name: 'bt42-b', allow: false }
    ].map(({ name, allow }) => {
      const repo = makeRepo({ 'AGENTS.md': '# rules\n' });
      git(repo, ['remote', 'add', 'origin', `https://github.com/owner/${name}.git`]);
      if (allow) {
        const allowed = box(repo, ['allow', `owner/${name}`, '--reward', '25', '--reward-limit', '25']);
        expect(allowed.status, allowed.stderr).toBe(0);
      }
      const on = box(repo, ['config', 'set', 'instructions', 'true']);
      expect(on.status, on.stderr).toBe(0);
      return repo;
    });
    const [a, b] = projects as [string, string];

    // The settings really differ: config states each one.
    const configA = box(a, ['config']).stdout;
    const configB = box(b, ['config']).stdout;
    expect(configA).toContain('allowed by this repository entry');
    expect(configB).toContain('not allowed');
    const statusA = box(a, ['status']).stdout;
    expect(statusA).toContain('$25');
    expect(box(b, ['status']).stdout).not.toContain('$25');

    // The block the tool wrote into each project's AGENTS.md, and the one
    // `describe --rules` prints there, are the same lines — and the lines
    // carry no setting.
    const written = projects.map(repo => interior(readFileSync(join(repo, 'AGENTS.md'), 'utf8')));
    const printed = projects.map(repo => interior(box(repo, ['describe', '--rules']).stdout));
    expect(written[0]).toBe(written[1]);
    expect(printed[0]).toBe(printed[1]);
    expect(written[0]).toBe(printed[0]);
    expect(written[0]).toBe(interior(renderRulesBlock('idle')));
    for (const setting of ['$', '25', 'owner/bt42', 'allowed', 'not allowed']) expect(written[0], `the block carries a setting (${setting})`).not.toContain(setting);
  });
});
