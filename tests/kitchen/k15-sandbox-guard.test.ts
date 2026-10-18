// K15 pin: the sandbox (shouteck/box-bounty-sandbox, kitchen/sandbox.md)
// exists so a real GitHub bounty step never again targets the owner's
// working repository — on BT10 a live run there had to stop and ask the
// owner three times. A wave file that asks for a real post on
// shouteck/omakase-box after this wave is a regression, and this test
// fails on it.
//
// The cutoff is derived, not restated: the commit that added this test is
// K15, so every line the diff adds under waves/ since then is "written
// after this wave" — a line added to an old wave file counts too (editing
// an old brief is not a loophole). CI fetches full history
// (fetch-depth: 0), so the log below is always resolvable.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const posixRoot = root.replace(/[\\/]+$/, '').replaceAll(String.fromCharCode(92), '/');
const TEST_FILE = 'tests/kitchen/k15-sandbox-guard.test.ts';

const git = (args: string[]): string => {
  try {
    // The wave-file diff since K15 passed Node's 1 MiB default on 19 October 2026.
    return execFileSync('git', ['-c', `safe.directory=${posixRoot}`, ...args], { cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 256 * 1024 * 1024 });
  } catch (error) {
    throw new Error(`K15 sandbox guard could not read git (git ${args.join(' ')}): ${(error as Error).message}`);
  }
};

// The commit that introduced this test — every wave content present then is
// pre-K15. Last line, not first: log lists newest first and a file's own
// add commit is the oldest entry.
function cutoffCommit(): string {
  const commits = git(['log', '--diff-filter=A', '--format=%H', '--', TEST_FILE]).trim().split('\n').filter(Boolean);
  expect(commits.length, `could not find the commit that added ${TEST_FILE}`).toBeGreaterThan(0);
  return commits[commits.length - 1]!;
}

// "asks for a real post on shouteck/omakase-box": a line naming the working
// repository together with a live-step word. A line that instead prohibits
// or exempts it ("never", "not", "instead", "the sandbox") is a statement
// of the rule, not a breach of it — the sandbox mention exemption exists so
// guidance like "post to the sandbox, never omakase-box" stays legal.
const REPO = /omakase-box/i;
const LIVE_STEP = /post|publish|real|live|bounty|bounties|issue|pull\s*request|\bpr\b|merge|journey|solver|solve/i;
const PROHIBITION = /never|not\b|no\b|without|instead|except|refus|declin|avoid|only the sandbox|sandbox/i;
function offendingLines(text: string): string[] {
  return text.split(/\r?\n/).filter(line => REPO.test(line) && LIVE_STEP.test(line) && !PROHIBITION.test(line));
}

// Lines added to wave files since the cutoff, with the file each came from.
function addedWaveLines(commit: string): { file: string; line: string }[] {
  const diff = git(['diff', '--unified=0', commit, '--', 'waves/']);
  const added: { file: string; line: string }[] = [];
  let file = '';
  for (const raw of diff.split('\n')) {
    const named = /^\+\+\+ b\/(.+)$/.exec(raw);
    if (named !== null) { file = named[1]!; continue; }
    if (raw.startsWith('+') && !raw.startsWith('+++')) added.push({ file, line: raw.slice(1) });
  }
  return added;
}

describe('K15 sandbox guard — no new wave asks for a real post on shouteck/omakase-box', () => {
  it('the derivation is not vacuous: the cutoff predates this test and already holds waves', () => {
    const commit = cutoffCommit();
    const waves = git(['ls-tree', '-r', '--name-only', commit, '--', 'waves/']).trim().split('\n').filter(Boolean);
    expect(waves).toContain('waves/K15.md');
    expect(waves).toContain('waves/BT10.md'); // the journey that caused the rule
    expect(readdirSync(join(root, 'waves')).some(name => name.endsWith('.md'))).toBe(true);
  });

  it('the detector flags a real post asked of the working repository', () => {
    expect(offendingLines('Run one real bounty journey on shouteck/omakase-box, posting the issue to github.')).toHaveLength(1);
    expect(offendingLines('post --to github publishes the bounty on omakase-box')).toHaveLength(1);
    // Prohibitions, exemptions and the sandbox itself are legal.
    expect(offendingLines('No later wave posts a real bounty on shouteck/omakase-box; the sandbox exists for that.')).toHaveLength(0);
    expect(offendingLines('post --to github on shouteck/box-bounty-sandbox — the sandbox, not the working repository')).toHaveLength(0);
    expect(offendingLines('a plain line about omakase-box, with no step named')).toHaveLength(0);
  });

  it('no line added under waves/ since K15 asks for a real post on the working repository', () => {
    const added = addedWaveLines(cutoffCommit());
    const offenders = added.filter(entry => offendingLines(entry.line).length > 0);
    expect(
      offenders,
      `wave content added after K15 asks for a real post on shouteck/omakase-box — real GitHub steps belong in the sandbox (kitchen/sandbox.md):\n${offenders.map(entry => `  ${entry.file}: ${entry.line.trim()}`).join('\n')}`
    ).toEqual([]);
  });
});
