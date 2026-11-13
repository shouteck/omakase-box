// BT62: the record's own shape. Separate from bt62.test.ts because `node scripts/surface.mjs --write` rewrites the record
// from bt62 and the owner tests, and does not run this file: a check of the old record would stand in the way of the new.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOUNTY_COMMANDS } from '../../../packages/box-bounty/index.js';
import { OWNERS, SURFACE_FILE } from './surface.js';

const record = () => readFileSync(SURFACE_FILE, 'utf8').split('\n').filter(line => line !== '');

describe('BT62: the surface record reads plainly', () => {
  it('the record is sorted, holds no duplicate line and no blank line, and ends with one newline', () => {
    const text = readFileSync(SURFACE_FILE, 'utf8');
    const lines = text.split('\n');
    expect(lines.pop(), 'ends with a newline').toBe('');
    expect(lines.filter(line => line === ''), 'no blank line').toEqual([]);
    expect(lines, 'sorted').toEqual([...lines].sort());
    expect(new Set(lines).size, 'no duplicate line').toBe(lines.length);
  });

  it('every command in the option table has a command line, and every document name has at least one field', () => {
    const lines = record();
    for (const name of [...Object.keys(BOUNTY_COMMANDS), 'setup']) expect(lines, `command ${name}`).toContain(`command ${name}`);
    for (const schema of Object.keys(OWNERS)) expect(lines.some(line => line.startsWith(`field ${schema} `)), `no field recorded for ${schema}`).toBe(true);
    const unowned = lines.filter(line => line.startsWith('field ')).map(line => line.split(' ')[1]!).filter(schema => OWNERS[schema] === undefined);
    expect([...new Set(unowned)], 'fields recorded for a document no test owns').toEqual([]);
  });
});
