// reads: scripts/vitest.config.mjs, scripts/test-timeout.mjs, .github/workflows/verify.yml
// K59: the per-test limit scales with the system. On the hosted Windows runner many heavy tests take 20 to 35 s
// against the old 30 s limit, and about one run in five failed on a single timeout in a different test each time
// (docs/box-v4/K59-measurements.md). The limit is a hang detector, so it is twice as long on Windows, where a Git or
// Node start costs three to six times what it does on Linux, and unchanged elsewhere. This file pins the rule, that the
// config uses it (so a hard-coded number cannot quietly come back), and that the hosted run reports the slowest tests.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
// Run a snippet as an ES module from the repository root: the scripts are .mjs and this file is typed.
const evaluate = (code: string): unknown => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], { cwd: root, encoding: 'utf8' }));

describe('K59: the limit on one test scales with the system', () => {
  it('1, 2. Windows gets 60 s; Linux and macOS keep 30 s', () => {
    expect(evaluate(`import { testTimeoutMs } from './scripts/test-timeout.mjs'; console.log(JSON.stringify([testTimeoutMs('win32'), testTimeoutMs('linux'), testTimeoutMs('darwin')]))`)).toEqual([60000, 30000, 30000]);
  });

  it('3. with no argument it answers for the system it runs on', () => {
    expect(evaluate(`import { testTimeoutMs } from './scripts/test-timeout.mjs'; console.log(JSON.stringify(testTimeoutMs()))`)).toBe(process.platform === 'win32' ? 60000 : 30000);
  });

  it('4. the vitest config takes its limit from that rule, not from a number of its own', () => {
    expect(evaluate(`import config from './scripts/vitest.config.mjs'; import { testTimeoutMs } from './scripts/test-timeout.mjs'; console.log(JSON.stringify([config.test.testTimeout, testTimeoutMs(process.platform)]))`)).toEqual(
      process.platform === 'win32' ? [60000, 60000] : [30000, 30000]
    );
    // And the file says so in words, so a hard-coded number is a visible edit.
    expect(readFileSync(`${root}scripts/vitest.config.mjs`, 'utf8')).toMatch(/testTimeout:\s*testTimeoutMs\(\)/);
  });

  it('5. the hosted run reports the slowest tests per system, and the step cannot fail a job', () => {
    const workflow = readFileSync(`${root}.github/workflows/verify.yml`, 'utf8');
    const at = workflow.indexOf('Slowest tests on');
    expect(at, 'the report step').toBeGreaterThan(-1);
    const step = workflow.slice(at, workflow.indexOf('- name:', at + 10) === -1 ? undefined : workflow.indexOf('- name:', at + 10));
    expect(step).toContain('if: always()');
  });
});
