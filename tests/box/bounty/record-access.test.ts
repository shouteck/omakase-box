// Guard: no file under tests/box/bounty/ may name the record location. All
// record access goes through the helpers in support.ts so BT31 can move
// records into a database without touching assertions.
import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const DIR = dirname(fileURLToPath(import.meta.url));
// support.ts owns the only spelling of the records folder; this file is the
// scanner itself, which must name what it bans.
const EXEMPT = new Set(['support.ts', 'record-access.test.ts']);
const FORBIDDEN = [
  '.box/bounties',
  `'.box', 'bounties'`,
  `".box", "bounties"`,
  'recordPath',
  'recordDir',
];

const allFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? allFiles(join(dir, entry.name)) : [join(dir, entry.name)]);

export const findForbidden = (text: string): string[] =>
  FORBIDDEN.filter(literal => text.includes(literal));

describe('record access guard', () => {
  it('no file under tests/box/bounty/ names a record file or folder', () => {
    const offenders = allFiles(DIR)
      .filter(file => !EXEMPT.has(basename(file)))
      .filter(file => findForbidden(readFileSync(file, 'utf8')).length > 0);
    expect(offenders.map(file => file.slice(DIR.length + 1))).toEqual([]);
  });

  it('the scanner itself flags a forbidden literal (negative proof)', () => {
    expect(findForbidden(`const p = join(repo, '.box', 'bounties');`)).toContain(`'.box', 'bounties'`);
    expect(findForbidden(`readFileSync('.box/bounties/bt-x.json')`)).toContain('.box/bounties');
    expect(findForbidden(`const recordPath = repo + id;`)).toContain('recordPath');
    expect(findForbidden(`open bounties here`)).toEqual([]);
  });
});
