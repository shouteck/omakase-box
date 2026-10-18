// K29 correction round: removed options must refuse, never pass silently.
// verify.mjs retired the disposable-Postgres modes with the older platform;
// --db=none stays as the kept callers' no-database spelling and every other
// --db form exits nonzero before any check, build, suite or run-directory
// work. suite.mjs's `unavailable` refusal (previously covered by the retired
// tests/bootstrap/commands.test.ts) is pinned here too.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const verify = join(root, 'scripts', 'verify.mjs');
const suite = join(root, 'scripts', 'suite.mjs');
const runsDir = join(root, '.kitchen', 'runs');
const runDirs = () => { try { return readdirSync(runsDir).length; } catch { return 0; } };

const verifyWith = (args: string[]) => spawnSync(process.execPath, [verify, ...args], { cwd: root, encoding: 'utf8' });

describe('verify --db: obsolete modes refuse before any work, --db=none stays', () => {
  for (const arg of ['--db=bogus', '--db=embedded', '--db=docker', '--db']) {
    it(`${arg} exits nonzero with an actionable message and creates no run`, () => {
      const before = runDirs();
      const result = verifyWith([arg, '--only']);
      expect(result.status).not.toBe(0);
      const output = result.stderr + result.stdout;
      expect(output).toContain(arg === '--db' ? '--db' : arg);
      expect(output).toContain('removed');
      expect(output).toContain('--db=none');
      // No side effects precede the refusal: no run directory, no step output.
      expect(output).not.toContain('Logs:');
      expect(runDirs()).toBe(before);
    });
  }

  it('--db=none is accepted — a later, unrelated refusal names it, not the flag', () => {
    // test:nosuch is refused by the unknown-script check that runs only after
    // argument validation: reaching it proves --db=none parsed as accepted.
    const result = verifyWith(['--db=none', 'test:nosuch']);
    expect(result.status).toBe(2);
    expect(result.stderr + result.stdout).toContain('Unknown package script');
    expect(result.stderr + result.stdout).not.toContain('removed');
  });
});

describe('suite.mjs unavailable refusal (coverage retired with tests/bootstrap)', () => {
  it('an unimplemented suite reports status unavailable and exits nonzero', () => {
    const result = spawnSync(process.execPath, [suite, 'nosuchsuite'], { cwd: root, encoding: 'utf8' });
    expect(result.status).toBe(2);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.status).toBe('unavailable');
    expect(parsed.suite).toBe('nosuchsuite');
    expect(parsed.reason).toContain('not been implemented');
  });

  it('--real refuses on a real suite: no VM execution exists', () => {
    const result = spawnSync(process.execPath, [suite, 'kitchen', '--real'], { cwd: root, encoding: 'utf8' });
    expect(result.status).toBe(2);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.status).toBe('unavailable');
    expect(parsed.reason).toContain('Real VM execution');
  });
});
