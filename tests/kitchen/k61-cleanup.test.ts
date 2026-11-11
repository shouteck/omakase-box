// reads: tests/box/bounty/remove-tree.ts, tests/box/bounty/support.ts, tests/box/bounty/github-fixture.ts, .github/workflows/verify.yml
// K61: a scratch folder Windows will not release (a copied node.exe or git.exe a process still holds) never fails a test whose
// assertions passed, and GitHub's own artifact outage never fails a run whose tests passed. Hosted runs 43027294715 attempt 1
// and 43088503658 attempts 1 and 2.
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { removeTree } from '../box/bounty/remove-tree.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const failing = (code: string, times: number) => {
  const calls: string[] = [];
  const remove = (dir: string) => {
    calls.push(dir);
    if (calls.length <= times) throw Object.assign(new Error(`${code}, Permission denied: ${dir}`), { code, syscall: 'rm' });
  };
  return { calls, remove };
};
const noWait = () => undefined;

describe('K61: the cleanup of a scratch folder', () => {
  it('1. retries a folder Windows still holds, and succeeds when it lets go', () => {
    const { calls, remove } = failing('EPERM', 2);
    expect(removeTree('C:/scratch/a', remove, noWait)).toBe(true);
    expect(calls).toHaveLength(3);
  });

  it('2. leaves a folder that is never released, after 8 tries, and throws nothing', () => {
    const { calls, remove } = failing('EBUSY', 100);
    expect(removeTree('C:/scratch/b', remove, noWait)).toBe(false);
    expect(calls).toHaveLength(8);
  });

  it('3. throws any other fault at once: a real failure is still a failure', () => {
    const { calls, remove } = failing('EINVAL', 100);
    expect(() => removeTree('C:/scratch/c', remove, noWait)).toThrow(/EINVAL/);
    expect(calls).toHaveLength(1);
  });

  it('4. removes a real folder with a nested file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'box-k61-'));
    mkdirSync(join(dir, 'inner'));
    writeFileSync(join(dir, 'inner', 'file.txt'), 'x');
    expect(removeTree(dir)).toBe(true);
    expect(existsSync(dir)).toBe(false);
  });

  it('5. the two cleanups that failed use it, and the plain call does not come back', () => {
    const support = readFileSync(`${root}tests/box/bounty/support.ts`, 'utf8');
    const fixture = readFileSync(`${root}tests/box/bounty/github-fixture.ts`, 'utf8');
    expect(support).toContain('removeTree(');
    expect(fixture).toContain('removeTree(bin)');
    expect(fixture).not.toContain('rmSync(bin');
    expect(support).not.toContain('rmSync(dir, { recursive: true, force: true, maxRetries');
  });

  it('6. GitHub\'s artifact outage cannot fail a run: the upload step may fail, and still always runs', () => {
    const workflow = readFileSync(`${root}.github/workflows/verify.yml`, 'utf8');
    const at = workflow.indexOf('- name: Upload verify run logs');
    expect(at, 'the upload step').toBeGreaterThan(-1);
    const next = workflow.indexOf('- name:', at + 10);
    const step = workflow.slice(at, next === -1 ? undefined : next);
    expect(step).toContain('if: always()');
    expect(step).toContain('continue-on-error: true');
  });
});
