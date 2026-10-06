// R1 driver safety regression: the preparation driver must refuse an unsafe
// --out target instead of mutating it. Reproduces the CTO review finding on
// research/box-delegation/r1/driver.mjs: it recursively deleted a nonempty
// --out and unconditionally overwrote the pinned agreement beside it, before
// the clean-tree check could even run.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, runRoot } from './support.js';

const DRIVER = join(ROOT, 'research', 'box-delegation', 'r1', 'driver.mjs');
const runDriver = (out: string) => spawnSync(process.execPath, [DRIVER, '--out', out], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });

describe('r1 driver refuses unsafe --out targets instead of mutating them', () => {
  it('exits nonzero on a nonempty out directory and leaves every byte in place', () => {
    const parent = runRoot('r1-driver-sentinel');
    const out = join(parent, 'unrelated-work');
    mkdirSync(join(out, 'nested'), { recursive: true });
    writeFileSync(join(out, 'sentinel.txt'), 'unrelated bytes that must survive');
    writeFileSync(join(out, 'nested', 'deep.txt'), 'deep');
    const run = runDriver(out);
    expect(run.status).not.toBe(0);
    expect(`${run.stdout}${run.stderr}`).toMatch(/not empty/i);
    expect(readFileSync(join(out, 'sentinel.txt'), 'utf8')).toBe('unrelated bytes that must survive');
    expect(readFileSync(join(out, 'nested', 'deep.txt'), 'utf8')).toBe('deep');
  });

  it('refuses to overwrite an existing pinned agreement beside the out directory', () => {
    const parent = runRoot('r1-driver-pinned');
    const pinned = join(parent, 'r1-agreement.pinned.json');
    writeFileSync(pinned, 'recorded original pinned agreement');
    const run = runDriver(join(parent, 'box'));
    expect(run.status).not.toBe(0);
    expect(`${run.stdout}${run.stderr}`).toMatch(/pinned/i);
    expect(readFileSync(pinned, 'utf8')).toBe('recorded original pinned agreement');
  });

  it('refuses --out inside or equal to the checkout, whatever the spelling', () => {
    for (const out of [ROOT, join(ROOT, 'research'), join(ROOT, 'research', '..', 'waves')]) {
      const run = runDriver(out);
      expect(run.status).not.toBe(0);
      expect(`${run.stdout}${run.stderr}`).toMatch(/outside/i);
    }
    expect(readdirSync(join(ROOT, 'research'))).toContain('box-delegation');
  });

  it('refuses --out that resolves inside the checkout through a link', () => {
    const parent = runRoot('r1-driver-link');
    const link = join(parent, 'junction');
    try { symlinkSync(ROOT, link, 'junction'); } catch { return; }
    const run = runDriver(join(link, 'box'));
    expect(run.status).not.toBe(0);
    expect(`${run.stdout}${run.stderr}`).toMatch(/outside/i);
    expect(existsSync(join(ROOT, 'box'))).toBe(false);
  });
});
