// reads: waves/
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

  // K57: since 10 November 2026 omakase-box is also the product's name (the
  // package and the command). A line that only names the package or the
  // command is not a step on the repository; these four, from BT53, BT63
  // and K48, failed the guard on master.
  it('a line naming only the package or the command is not a post on the repository', () => {
    const productLines = [
      '- `npm uninstall -g box-bounty` becomes `npm uninstall -g omakase-box`, both times; a test pins it equal to `PACKAGE_REMOVE`.',
      '- The release carries BT54, BT56, BT58, BT57, BT60 and BT63 (owner, 10 November 2026): cook them first, BT63 last. The guide is written in the new command, `omakase-box`. The README\'s first-bounty section then says a reward is set before the first post.',
      '**Brief.** Written by the CTO on 10 November 2026 from the owner\'s decisions that day: the product has one name, omakase-box, and the command follows it. Read on npm the same day: Box, the storage company, publishes its official command-line tool as `@box/cli` with the command `box`.',
      '- npm serves `omakase-box@0.1.3`, published 2 November: **before the solver side** (PF24 to PF29), before listed bounties (PF32) and before the plain issue text (PF33).'
    ];
    for (const line of productLines) expect(offendingLines(line), line).toHaveLength(0);
    // A step on the repository still offends, however it is spelled.
    for (const line of [
      'post the bounty to `omakase-box`',
      'merge it on omakase-box',
      'publish a real bounty against the omakase-box repository',
      'POST A REAL BOUNTY ON OMAKASE-BOX',
      'open the issue at `shouteck/omakase-box`',
      'the solver merges into github.com/shouteck/omakase-box'
    ]) expect(offendingLines(line), line).toHaveLength(1);
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
