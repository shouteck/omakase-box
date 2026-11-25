// BT99: the --json surface check tells a compatible change from a breaking one. The classifier runs here on scratch
// copies of SURFACE.txt, never on the record itself; `--classify` is the same code path `surface.mjs` uses before a write.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ROOT } from './refusal-sites.js';
import { staticLines } from './surface.js';

const SCRIPT = join(ROOT, 'scripts', 'surface.mjs');
const scratchDirs: string[] = [];
afterAll(() => { for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

const BASE = [
  'schema box-bounty/status@1',
  'field box-bounty/status@1 bounties[].stage string',
  'values box-bounty/status@1 bounties[].stage open drafted|waiting|posted',
  'field box-bounty/status@1 foreignFields[].source string',
  'values box-bounty/status@1 foreignFields[].source closed other%20account|solver'
].sort();

const classify = (before: readonly string[], after: readonly string[]): { compatible: string[]; breaking: string[]; versioned: string[] } => {
  const dir = mkdtempSync(join(tmpdir(), 'box-bt99-surface-'));
  scratchDirs.push(dir);
  const beforeFile = join(dir, 'before.txt');
  const afterFile = join(dir, 'after.txt');
  writeFileSync(beforeFile, `${before.join('\n')}\n`);
  writeFileSync(afterFile, `${after.join('\n')}\n`);
  const run = spawnSync(process.execPath, [SCRIPT, '--classify', beforeFile, afterFile], { encoding: 'utf8' });
  expect(run.status, `classify exited ${run.status}: ${run.stdout}${run.stderr}`).toBe(0);
  return JSON.parse(run.stdout) as { compatible: string[]; breaking: string[]; versioned: string[] };
};

describe('BT99: surface differences are classified by the contract', () => {
  it('an added field is compatible', () => {
    const result = classify(BASE, [...BASE, 'field box-bounty/status@1 bounties[].newFact null|string'].sort());
    expect(result.compatible).toEqual(['added field box-bounty/status@1 bounties[].newFact null|string']);
    expect(result.breaking).toEqual([]);
  });

  it('a value added to an open stage field is compatible', () => {
    const after = BASE.map(line => line.startsWith('values box-bounty/status@1 bounties[].stage ')
      ? 'values box-bounty/status@1 bounties[].stage open drafted|starting|waiting|posted'
      : line).sort();
    const result = classify(BASE, after);
    expect(result.compatible).toEqual(['added value box-bounty/status@1 bounties[].stage starting']);
    expect(result.breaking).toEqual([]);
  });

  it('a value added to closed foreignFields[].source is breaking and named', () => {
    const after = BASE.map(line => line.startsWith('values box-bounty/status@1 foreignFields[].source ')
      ? 'values box-bounty/status@1 foreignFields[].source closed maintainer|other%20account|solver'
      : line).sort();
    const result = classify(BASE, after);
    expect(result.breaking).toEqual(['added value box-bounty/status@1 foreignFields[].source maintainer']);
    expect(result.compatible).toEqual([]);
  });

  it('a removed field is breaking and named', () => {
    const after = BASE.filter(line => !line.startsWith('field box-bounty/status@1 bounties[].stage '));
    const result = classify(BASE, after);
    expect(result.breaking).toEqual(['removed field box-bounty/status@1 bounties[].stage string']);
  });

  it('the same removal is accepted when the document moves to @2', () => {
    const after = BASE
      .filter(line => !line.startsWith('field box-bounty/status@1 bounties[].stage ') && !line.startsWith('values box-bounty/status@1 bounties[].stage '))
      .map(line => line.replaceAll('box-bounty/status@1', 'box-bounty/status@2')).sort();
    const result = classify(BASE, after);
    expect(result.breaking).toEqual([]);
    expect(result.versioned).toContain('removed field box-bounty/status@1 bounties[].stage string');
  });

  it('a value removed from an open field is breaking and named', () => {
    const after = BASE.map(line => line.startsWith('values box-bounty/status@1 bounties[].stage ')
      ? 'values box-bounty/status@1 bounties[].stage open drafted|posted'
      : line).sort();
    const result = classify(BASE, after);
    expect(result.breaking).toEqual(['removed value box-bounty/status@1 bounties[].stage waiting']);
  });

  it('a changed field type is breaking and named', () => {
    const after = BASE.map(line => line === 'field box-bounty/status@1 bounties[].stage string'
      ? 'field box-bounty/status@1 bounties[].stage null|string'
      : line).sort();
    const result = classify(BASE, after);
    expect(result.breaking).toEqual([
      'changed type field box-bounty/status@1 bounties[].stage null|string',
      'changed type removed field box-bounty/status@1 bounties[].stage string'
    ]);
  });

  it('the values lines are derived, including the open stage list and the one closed source list', () => {
    const lines = staticLines();
    expect(lines).toContain('values box-bounty/status@1 bounties[].stage open answered|applied|confirmed|drafted|posted|rejected|taken|undone|waiting|withdrawn');
    expect(lines).toContain('values box-bounty/status@1 foreignFields[].source closed other%20account|solver');
    expect(lines).toContain('values box-bounty/status@1 bounties[].landingChecks[].state open not-landed|not-merged|unknown|waiting');
    expect(lines).toContain('values box-bounty/config@1 solving.mode open allowed|ask|off');
  });
});
