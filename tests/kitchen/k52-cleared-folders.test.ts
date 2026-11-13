// reads: .execution/, docs/legacy/, kitchen/platform-prototype/, .gitignore
// K52: the retired platform's folders left the working tree (owner,
// D-2026-11-10-clear-the-repository) and stay in Git history at the tag
// history/before-K52. A visitor or a solver's agent cloning the repository
// meets the product, not them. This fails if any path under them is tracked
// again, or if the ignore lines that keep local leftovers out are dropped.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const git = (...args: string[]): string => execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/').replace(/\/$/, '')}`, ...args], { cwd: root, encoding: 'utf8' });
const CLEARED = ['.execution', 'docs/legacy', 'kitchen/platform-prototype'] as const;

describe('K52: the cleared folders stay out of the tracked tree', () => {
  it('Git tracks no path under any of them', () => {
    const tracked = git('ls-files', '--', ...CLEARED).split('\n').filter(Boolean);
    expect(tracked, `tracked again: ${tracked.slice(0, 5).join(', ')}; they are history at the tag history/before-K52`).toEqual([]);
  });

  it('.gitignore ignores each of them, so a plain git add cannot bring one back', () => {
    for (const folder of CLEARED) {
      const answer = git('check-ignore', '--no-index', '-v', `${folder}/probe.txt`);
      expect(answer, `${folder} is not ignored`).toContain('.gitignore');
    }
  });
});
