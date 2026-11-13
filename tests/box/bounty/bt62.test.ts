// BT62: the tool's surface is on record in tests/box/bounty/SURFACE.txt, so it changes only on purpose. This file holds the
// static half (commands, options, positionals, exit codes, held answers, refusal names, the document names) and the
// record's own shape; each document's fields are checked by the one test that prints it (surface.ts, OWNERS). All of it
// is read from the code: no command runs here.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOUNTY_COMMANDS } from '../../../packages/box-bounty/index.js';
import { ROOT } from './refusal-sites.js';
import { checkStatic, difference, exitCodes, fieldLines, OWNERS, staticLines, SURFACE_FILE, WRITING } from './surface.js';

const record = () => readFileSync(SURFACE_FILE, 'utf8').split('\n').filter(line => line !== '');

describe('BT62: the surface is on record', () => {
  it('the static surface derived from the code equals the record', () => {
    checkStatic();
  });

  it.skipIf(WRITING)('the record is sorted, holds no duplicate line and no blank line, and ends with one newline', () => {
    const text = readFileSync(SURFACE_FILE, 'utf8');
    const lines = text.split('\n');
    expect(lines.pop(), 'ends with a newline').toBe('');
    expect(lines.filter(line => line === ''), 'no blank line').toEqual([]);
    expect(lines, 'sorted').toEqual([...lines].sort());
    expect(new Set(lines).size, 'no duplicate line').toBe(lines.length);
  });

  it.skipIf(WRITING)('every command in the option table has a command line, and every document name has at least one field', () => {
    const lines = record();
    for (const name of [...Object.keys(BOUNTY_COMMANDS), 'setup']) expect(lines, `command ${name}`).toContain(`command ${name}`);
    for (const schema of Object.keys(OWNERS)) expect(lines.some(line => line.startsWith(`field ${schema} `)), `no field recorded for ${schema}`).toBe(true);
    const unowned = lines.filter(line => line.startsWith('field ')).map(line => line.split(' ')[1]!).filter(schema => OWNERS[schema] === undefined);
    expect([...new Set(unowned)], 'fields recorded for a document no test owns').toEqual([]);
  });

  it('every owner is a test file that watches its documents', () => {
    for (const owner of new Set(Object.values(OWNERS))) {
      const file = join(ROOT, 'tests', 'box', 'bounty', `${owner}.test.ts`);
      expect(existsSync(file), `${owner}.test.ts`).toBe(true);
      expect(readFileSync(file, 'utf8'), `${owner}.test.ts calls watchFields('${owner}')`).toContain(`watchFields('${owner}')`);
    }
  });

  it('the entry points exit only with 0, 1, 2 and 3', () => {
    expect(exitCodes()).toEqual([0, 1, 2, 3]);
  });

  it('the comparison names what changed: added, removed, and a changed type as one of each', () => {
    expect(difference(['option a --x value'], ['option a --x switch'])).toEqual(['added: option a --x value', 'removed: option a --x switch']);
    expect(difference(['command a', 'command b'], ['command a'])).toEqual(['added: command b']);
    expect(difference(['command a'], ['command a', 'command b'])).toEqual(['removed: command b']);
  });

  it('fields: nesting, array elements, maps keyed by data, mixed types and optional keys', () => {
    expect(fieldLines('s', [
      { schema: 's', id: 'a', list: [{ n: 1, x: 'y' }, { n: 2 }], byId: { 'bt-1': true }, maybe: null },
      { schema: 's', id: 'b', list: [], byId: {}, maybe: 'text', extra: 1 }
    ])).toEqual([
      'field s byId object',
      'field s byId{} boolean',
      'field s extra number optional',
      'field s id string',
      'field s list array',
      'field s list[] object',
      'field s list[].n number',
      'field s list[].x string optional',
      'field s maybe null|string',
      'field s schema string'
    ]);
  });

  it('the static surface is not empty: the walkers found the table, the codes and the refusals', () => {
    const lines = staticLines();
    expect(lines.filter(line => line.startsWith('command ')).length).toBeGreaterThanOrEqual(17);
    expect(lines.filter(line => line.startsWith('refusal ')).length).toBeGreaterThanOrEqual(100);
    expect(lines.filter(line => line.startsWith('held ')).length).toBeGreaterThanOrEqual(1);
  });
});
