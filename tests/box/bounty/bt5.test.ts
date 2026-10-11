import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from './support.js';

// Exercise the fixture builder's probe in a controlled child environment.
// The builder itself still checks the real host before creating fixtures.

const FIXTURES = join(ROOT, 'kitchen', 'bt5', 'fixtures.mjs');
const probe = (program: string) => {
  const directory = mkdtempSync(join(tmpdir(), 'kitchen-BT5-ci-probe-'));
  // Remove every PATH spelling, including Windows' case-insensitive aliases.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'path'));
  try {
    return spawnSync(process.execPath, [FIXTURES, '--probe', program], {
      cwd: directory,
      env: { ...env, PATH: directory },
      encoding: 'utf8'
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

describe('bt5 fixtures.mjs absence probe', () => {
  it('reports a program that exists as present — node itself', () => {
    const run = probe(process.execPath);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('present');
    expect(run.stdout).not.toContain('absent —');
  });

  it('reports a program that cannot be executed as absent', () => {
    const run = probe('bt5-no-such-program-9f3d2e7c');
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('absent');
  });

  it('reports the fixture toolchain pick as absent in the isolated child', () => {
    const run = probe('php');
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('php absent');
  });
});

// Journey finding: the declared setup failed in the shipped snapshot —
// scripts/pnpm.mjs cannot start until `npm ci` restores scripts/tooling, and
// a cold copy carries no node_modules. The bootstrap must precede install
// and build in setup.mjs AND in the solver-facing TASK.md, or the next cold
// run hits the same wall. Order is asserted on the text: the full cold run
// is minutes long and is proven in evidence/scaffold-proof.md instead.
describe('bt5 cold-copy setup order', () => {
  const steps = ['scripts/tooling', 'scripts/pnpm.mjs', 'scripts/workspace.mjs'];
  const positionsOf = (file: string) => {
    const text = readFileSync(file, 'utf8');
    return steps.map(step => text.indexOf(step));
  };
  for (const name of ['setup.mjs', 'TASK.md', 'PROTOCOL.md']) {
    it(`${name} names tooling bootstrap before install and build`, () => {
      const positions = positionsOf(join(ROOT, 'kitchen', 'bt5', name));
      expect(positions.every(position => position >= 0)).toBe(true);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    });
  }
});
