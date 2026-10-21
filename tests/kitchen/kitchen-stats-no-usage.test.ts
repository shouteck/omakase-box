// reads: scripts/kitchen-stats.mjs
// R1 contract: the real scripts/kitchen-stats.mjs must no longer print the
// obsolete "Usage per wave" section (or anything matching /usage/i) while every
// verification figure, wave attribution, missing-data label and limit exit
// survives, and the helpers verify.mjs reuses stay exported. Fixtures cover
// populated and absent Usage metadata, real numbers, missing summaries and a
// broken limit. Until the delegated change lands this file is the failing
// reproduction; it is the owner-check shape run directly on the owner tree.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const script = join(root, 'scripts', 'kitchen-stats.mjs');
const temps: string[] = [];
const temp = () => { const dir = mkdtempSync(join(tmpdir(), 'kitchen-r1-')); temps.push(dir); return dir; };
afterAll(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }); });

const NOW = Date.parse('2026-02-01T12:00:00.000Z');
const dirName = (ms: number, sha: string) => new Date(ms).toISOString().replace(/[:.]/g, '-') + '-' + sha.slice(0, 7);
const iso = (ms: number) => new Date(ms).toISOString();

// A populated kitchen root: compliant limit files, one summarized run, one
// summary-less run, and a wave file whose Result may record Usage metadata —
// exactly the input the obsolete section used to print.
function kitchenRoot(usageLine: boolean): string {
  const dir = temp();
  mkdirSync(join(dir, 'docs', 'box-v4'), { recursive: true });
  mkdirSync(join(dir, 'kitchen'), { recursive: true });
  mkdirSync(join(dir, 'waves'), { recursive: true });
  writeFileSync(join(dir, 'AGENTS.md'), 'agents\n');
  writeFileSync(join(dir, 'docs', 'box-v4', 'KITCHEN.md'), 'kitchen\n');
  writeFileSync(join(dir, 'kitchen', 'INBOX.md'), '- one\n');
  writeFileSync(join(dir, 'STATUS.md'), 'status\n');
  const sha = 'a'.repeat(40);
  const run = join(dir, '.kitchen', 'runs', dirName(NOW, sha));
  mkdirSync(run, { recursive: true });
  writeFileSync(join(run, 'summary.json'), JSON.stringify({ schemaVersion: 1, sha, dirty: false, verdict: 'PASS', startedAt: iso(NOW), seconds: 61, steps: [{ name: 'check', exit: 0, seconds: 61 }], notRun: [], failure: null }));
  mkdirSync(join(dir, '.kitchen', 'runs', dirName(NOW + 60000, 'b'.repeat(40))), { recursive: true });
  writeFileSync(join(dir, 'waves', 'w1.md'), ['# w1', '', '- Commit: `' + 'a'.repeat(40) + '`', '- Branch: `wave/w1`', ...(usageLine ? ['- Usage: 12k tokens'] : []), ''].join('\n'));
  return dir;
}

const runStats = (rootDir: string) => spawnSync(process.execPath, [script, '--root=' + rootDir], { encoding: 'utf8', timeout: 60000 });

describe('kitchen-stats: Usage output removed, everything else intact', () => {
  it('prints every verification section and no usage output, populated or absent', () => {
    for (const usageLine of [true, false]) {
      const run = runStats(kitchenRoot(usageLine));
      expect(run.status, run.stderr).toBe(0);
      for (const section of ['Verify runs', 'Verify minutes per step', 'Runs per wave branch', 'Largest costs', 'Kitchen limits'])
        expect(run.stdout).toContain(section);
      expect(run.stdout).not.toMatch(/usage/i);
      expect(run.stdout).toContain('1 runs with summary.json');
      expect(run.stdout).toContain('61');
    }
  });

  it('labels missing data instead of printing zeros or crashing', () => {
    const run = runStats(temp());
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('missing');
    expect(run.stdout).not.toMatch(/usage/i);
  });

  it('still exits nonzero and names the broken limit', () => {
    const dir = kitchenRoot(true);
    writeFileSync(join(dir, 'STATUS.md'), Array(61).fill('x').join('\n') + '\n');
    const run = runStats(dir);
    expect(run.status).toBe(1);
    expect(run.stderr + run.stdout).toContain('LIMIT FAIL');
    expect(run.stderr + run.stdout).toContain('STATUS.md');
  });

  it('keeps the exported helpers verify.mjs reuses', () => {
    const href = pathToFileURL(script).href;
    const probe = spawnSync(process.execPath, ['--input-type=module', '-e', 'import * as k from ' + JSON.stringify(href) + '; console.log(JSON.stringify([typeof k.readRuns, typeof k.stallCheck, typeof k.checkLimits]));'], { encoding: 'utf8', cwd: root, timeout: 30000 });
    expect(probe.status, probe.stderr).toBe(0);
    expect(JSON.parse(probe.stdout.trim())).toEqual(['function', 'function', 'function']);
  });
});
