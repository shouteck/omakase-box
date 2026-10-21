// reads: @rulebook, scripts/kitchen-stats.mjs
// K35: the living-rulebook guards kitchen-stats.mjs checkLimits enforces —
// bounded station cards, retired role/station names absent from live rules,
// and station listings that match the cards on disk. Every negative runs on a
// fabricated root under the OS temp dir, so a bad fixture really fails — it is
// never a scan of the committed tree for literals.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const temps: string[] = [];
const temp = () => { const dir = mkdtempSync(join(tmpdir(), 'kitchen-k35-')); temps.push(dir); return dir; };
afterAll(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }); });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const probe = (expression: string): Json => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `import * as k from './scripts/kitchen-stats.mjs'; console.log(JSON.stringify(${expression}));`], { cwd: root, encoding: 'utf8', timeout: 30000 }));
const limits = (rootDir: string): Json[] => probe(`k.checkLimits(${JSON.stringify(rootDir)})`);
const CARD_BYTES: number = probe('k.CARD_LIMIT_BYTES');

// The smallest root the guard can judge: one card, the two listing files and
// the base limit files the older checks need.
function fakeRoot(cardText = 'card\n'): string {
  const dir = temp();
  mkdirSync(join(dir, 'docs', 'box-v4'), { recursive: true });
  mkdirSync(join(dir, 'kitchen', 'stations'), { recursive: true });
  mkdirSync(join(dir, 'templates'), { recursive: true });
  writeFileSync(join(dir, 'AGENTS.md'), 'agents\n');
  writeFileSync(join(dir, 'docs', 'box-v4', 'KITCHEN.md'), 'kitchen\n');
  writeFileSync(join(dir, 'kitchen', 'INBOX.md'), '- one\n');
  writeFileSync(join(dir, 'STATUS.md'), 'status\n');
  writeFileSync(join(dir, 'kitchen', 'stations', 'packaging.md'), cardText);
  writeFileSync(join(dir, 'kitchen', 'README.md'), '[card](stations/packaging.md)\n');
  writeFileSync(join(dir, 'templates', 'wave.md'), 'Station: <packaging>\n');
  return dir;
}
const byLabel = (list: Json[], part: string): Json => list.find((check: Json) => check.label.includes(part));

describe('card byte limit — real UTF-8 bytes, not characters', () => {
  it('a slim card passes with its measured size; a fat one fails by name', () => {
    const ok = limits(fakeRoot());
    const slim = byLabel(ok, 'kitchen/stations/packaging.md size');
    expect(slim.ok).toBe(true);
    expect(slim.limit).toBe(String(CARD_BYTES) + ' B');

    const fat = fakeRoot('x'.repeat(CARD_BYTES + 1));
    const over = byLabel(limits(fat), 'kitchen/stations/packaging.md size');
    expect(over.ok).toBe(false);
    expect(over.actual).toBe(`${CARD_BYTES + 1} B`);
  });

  it('a root with no station cards reports missing, never a silent pass', () => {
    const dir = temp();
    expect(byLabel(limits(dir), 'living station cards').ok).toBe('missing');
  });
});

describe('retired role/station names are not live instructions', () => {
  it.each(['station-chef', 'service-data', 'stations/console', 'box-station-chef'])('a live rule file containing %s fails', (token) => {
    const dir = fakeRoot();
    writeFileSync(join(dir, 'kitchen', 'README.md'), `[card](stations/packaging.md) — dispatch the ${token} for this\n`);
    const check = byLabel(limits(dir), 'retired role/station names');
    expect(check.ok).toBe(false);
    expect(check.actual).toContain('kitchen/README.md');
  });

  it('the committed live rules carry no retired names', () => {
    const check = byLabel(limits(root), 'retired role/station names');
    expect(check.ok).toBe(true);
    expect(check.actual).toBe('none');
  });
});

describe('station listings match the cards on disk', () => {
  it('a listed station with no card fails; so does a card nobody lists', () => {
    const dangling = fakeRoot();
    writeFileSync(join(dangling, 'kitchen', 'README.md'), '[gone](stations/vanished.md) [card](stations/packaging.md)\n');
    const check = byLabel(limits(dangling), 'station listings match');
    expect(check.ok).toBe(false);
    expect(check.actual).toContain('listed without card: vanished.md');

    const unlisted = fakeRoot();
    writeFileSync(join(unlisted, 'kitchen', 'stations', 'orphan.md'), 'orphan\n');
    const check2 = byLabel(limits(unlisted), 'station listings match');
    expect(check2.ok).toBe(false);
    expect(check2.actual).toContain('card not listed: orphan.md');
  });

  it('the committed tree lists exactly the living cards', () => {
    const check = byLabel(limits(root), 'station listings match');
    expect(check.ok).toBe(true);
    expect(check.actual).toBe('match');
  });
});
