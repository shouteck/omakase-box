// PF27: the tool describes both halves. `describe` gives the solving half one line; `describe --solving` prints it
// whole; the instruction block carries one solving line only while the owner allows solving.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { changeConfig, renderDescribe, renderDescribeSolving, renderRules } from '../../../packages/box-bounty/index.js';
import { instructionBlock } from '../../../packages/box-bounty/instructions.js';
import { SOLVING_BLOCK_LINE } from '../../../packages/box-bounty/wording.js';
import { makeRepo } from './support.js';

const AGENTS_PAGE = fileURLToPath(new URL('../../../packages/box-platform/app/agents/page.jsx', import.meta.url));

describe('the solving half, described', () => {
  it('describe --solving says what, when it is worth it and not, how to schedule, and where to work; its next step follows the owner\'s word', () => {
    changeConfig(null, 'set', 'solving', 'off');
    const off = renderDescribeSolving();
    expect(off).toContain('worth taking when: it pays on merge');
    expect(off).toContain('not worth taking when: others are already on it');
    expect(off).toContain('no more often than every\n15 minutes');
    expect(off).toContain('Work only in the folder take gives you');
    expect(off).toContain('solving: off');
    expect(off.split('\n').at(-1)).toBe('next: ask the owner to run box bounty config set solving allowed (or ask, to be asked before each bounty)');
    changeConfig(null, 'set', 'solving', 'allowed');
    const allowed = renderDescribeSolving();
    expect(allowed).toContain('solving: allowed');
    expect(allowed.split('\n').at(-1)).toBe('next: box bounty discover --language <a language you work in>, then box bounty take <id>');
  });

  it('describe gives the solving half one line, worded by the owner\'s word', () => {
    changeConfig(null, 'set', 'solving', 'off');
    const off = renderDescribe(null).split('\n');
    expect(off.filter(line => line.includes('describe --solving'))).toEqual(['it can also take paid bounties others posted, once the owner allows it: box bounty describe --solving.']);
    expect(off.some(line => line.startsWith('worth taking when'))).toBe(false);
    changeConfig(null, 'set', 'solving', 'ask');
    expect(renderDescribe(null)).toContain('the owner allows taking paid bounties others posted: box bounty describe --solving says when one is worth it.');
  });

  it('the instruction block carries the solving line only while the owner allows solving', () => {
    const repo = makeRepo({ 'README.md': 'pf27\n' });
    changeConfig(null, 'set', 'solving', 'off');
    expect(instructionBlock(repo)).not.toContain(SOLVING_BLOCK_LINE);
    expect(renderRules(null)).not.toContain(SOLVING_BLOCK_LINE);
    for (const mode of ['ask', 'allowed']) {
      changeConfig(null, 'set', 'solving', mode);
      const block = instructionBlock(repo).split('\n');
      // One line, inside the markers, before the closing one.
      expect(block.filter(line => line === SOLVING_BLOCK_LINE)).toHaveLength(1);
      expect(block.indexOf(SOLVING_BLOCK_LINE)).toBeLessThan(block.length - 1);
      expect(renderRules(null)).toContain(SOLVING_BLOCK_LINE);
    }
    changeConfig(null, 'set', 'solving', 'off');
    expect(instructionBlock(repo)).not.toContain(SOLVING_BLOCK_LINE);
  });

  it('the board\'s For agents page shows the solving path, with the board\'s own floor', () => {
    const page = readFileSync(AGENTS_PAGE, 'utf8');
    for (const command of ['box bounty discover --language TypeScript', 'box bounty take <id>', 'box bounty submit <id>', 'box bounty status <id>']) expect(page).toContain(`'${command}'`);
    expect(page).toContain('box bounty config set solving allowed');
    expect(page).toContain('every 15 minutes at most');
    expect(page).not.toContain('more than every 5');
    expect(page).toContain('cursor, since, limit');
  });
});
