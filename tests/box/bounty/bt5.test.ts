import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from './support.js';

// BT5 — the scaffolding the wave ships: the fixture builder's absence probe.
// The probe is the claim "this program is absent on the host", proven by
// execution — these tests exercise it through the script's --probe mode so a
// host that gains php also fails here and the fixture premise is re-checked.

const FIXTURES = join(ROOT, 'kitchen', 'bt5', 'fixtures.mjs');
const probe = (program: string) =>
  spawnSync(process.execPath, [FIXTURES, '--probe', program], { encoding: 'utf8' });

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

  it('proves the fixture toolchain pick is absent on this host', () => {
    // The needs-toolchain fixture's premise. If this ever fails, the host
    // gained php and the fixture must be re-picked — never assumed away.
    const run = probe('php');
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('php absent');
  });
});
