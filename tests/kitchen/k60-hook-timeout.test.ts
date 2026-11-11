// reads: scripts/vitest.config.mjs, scripts/test-timeout.mjs, .github/workflows/verify.yml
// K60: the limit on one setup hook scales with the system like K59's limit on one test, and the Linux browser install no
// longer lets a dead package mirror cancel the job. Hosted run 43024146368 (Windows: "Hook timed out in 10000ms" in
// bt8c and pf26) and run 43035172554 (Ubuntu cancelled three times in `playwright install --with-deps chromium`).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const evaluate = (code: string): unknown => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], { cwd: root, encoding: 'utf8' }));
const workflow = (): string => readFileSync(`${root}.github/workflows/verify.yml`, 'utf8');
const stepNamed = (text: string, name: string): string => {
  const at = text.indexOf(`- name: ${name}`);
  expect(at, `the step "${name}"`).toBeGreaterThan(-1);
  const next = text.indexOf('- name:', at + 10);
  return text.slice(at, next === -1 ? undefined : next);
};

describe('K60: the limit on one hook scales with the system', () => {
  it('1. Windows gets 30 s', () => {
    expect(evaluate(`import { hookTimeoutMs } from './scripts/test-timeout.mjs'; console.log(JSON.stringify(hookTimeoutMs('win32')))`)).toBe(30000);
  });

  it('2. Linux and macOS keep the 10 s default', () => {
    expect(evaluate(`import { hookTimeoutMs } from './scripts/test-timeout.mjs'; console.log(JSON.stringify([hookTimeoutMs('linux'), hookTimeoutMs('darwin')]))`)).toEqual([10000, 10000]);
  });

  it('3. the vitest config takes its hook limit from that rule', () => {
    expect(evaluate(`import config from './scripts/vitest.config.mjs'; import { hookTimeoutMs } from './scripts/test-timeout.mjs'; console.log(JSON.stringify([config.test.hookTimeout, hookTimeoutMs(process.platform)]))`)).toEqual(
      process.platform === 'win32' ? [30000, 30000] : [10000, 10000]
    );
    expect(readFileSync(`${root}scripts/vitest.config.mjs`, 'utf8')).toMatch(/hookTimeout:\s*hookTimeoutMs\(\)/);
  });
});

describe('K60: the Linux browser install cannot be cancelled by a dead mirror', () => {
  it('4. the browser is its own fatal step; the system libraries are a bounded step that may fail', () => {
    const text = workflow();
    expect(text).not.toContain('playwright install --with-deps');
    const browser = stepNamed(text, 'Install Chromium for browser-backed tests');
    expect(browser).toContain('playwright install chromium');
    expect(browser).not.toContain('continue-on-error');
    const libraries = stepNamed(text, 'Install Chromium system libraries (Linux)');
    expect(libraries).toContain("runner.os == 'Linux'");
    expect(libraries).toMatch(/timeout-minutes:\s*5\b/);
    expect(libraries).toContain('continue-on-error: true');
    expect(libraries).toContain('install-deps chromium');
  });
});
