// reads: scripts/ci-select.mjs, scripts/suite.mjs, scripts/kitchen-stats.mjs, .github/workflows/verify.yml
// K76: the hosted run picks its jobs from what the push changed. `ci-select.mjs <before> <after>` reads the push's two-dot
// diff and answers `full=true` (every job) or `full=false` (kitchen and audit only). The dangerous direction is skipping a job
// that should run, so every uncertain case answers `full=true`, and the rule it uses is checked against every tracked file.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const selector = join(root, 'scripts', 'ci-select.mjs');
const scratch: string[] = [];
afterAll(() => { for (const dir of scratch) rmSync(dir, { recursive: true, force: true }); });

const git = (cwd: string, ...args: string[]): string => execFileSync('git', ['-c', `safe.directory=${cwd.replaceAll('\\', '/').replace(/\/+$/, '')}`, '-c', 'user.name=k76', '-c', 'user.email=k76@test.invalid', ...args], { cwd, encoding: 'utf8' }).trim();

// A scratch repository with one base commit, then one commit changing `paths`. Returns both SHAs.
function pushOf(paths: readonly string[]): { repo: string; before: string; after: string } {
  const repo = mkdtempSync(join(tmpdir(), 'kitchen-K76-'));
  scratch.push(repo);
  git(repo, 'init', '-q', '-b', 'main');
  writeFileSync(join(repo, 'base.txt'), 'base\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'base');
  const before = git(repo, 'rev-parse', 'HEAD');
  for (const path of paths) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), `changed ${path}\n`);
  }
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'change');
  return { repo, before, after: git(repo, 'rev-parse', 'HEAD') };
}

const select = (cwd: string, before: string, after: string): { full: boolean; stdout: string } => {
  const run = spawnSync(process.execPath, [selector, before, after], { cwd, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: '' } });
  expect(run.status, run.stderr).toBe(0);
  const answer = /^full=(true|false)\b/m.exec(run.stdout);
  expect(answer, run.stdout).not.toBeNull();
  return { full: answer![1] === 'true', stdout: run.stdout };
};

describe('K76: ci-select answers from the changed paths', () => {
  const TABLE: readonly (readonly [number, readonly string[], boolean])[] = [
    [1, ['waves/BT80.md'], false],
    [2, ['STATUS.md', 'kitchen/stations/packaging.md'], false],
    [3, ['packages/box-bounty/never-ship.ts'], true],
    [4, ['tests/box/bounty/bt80.test.ts'], true],
    [5, ['waves/BT80.md', 'packages/box-bounty/answer.ts'], true],
    [6, ['.github/workflows/verify.yml'], true],
    [7, ['scripts/ci-select.mjs', 'scripts/suite.mjs'], true],
    [8, ['new-folder/x.txt'], true],
    [12, ['docs/box-v4/KITCHEN.md'], false],
    // Files a kitchen test reads that product tests read too: the full run owes them.
    [13, ['kitchen/demo/gh-standin.cjs'], true],
    [14, ['waves/BT80.md', 'docs/box-v4/LAUNCH.md'], true]
  ];
  it.each(TABLE)('row %i: %j -> full=%s', (_row, paths, full) => {
    const { repo, before, after } = pushOf(paths);
    expect(select(repo, before, after).full).toBe(full);
  });

  it('row 9: a new branch (before is all zeros) runs everything', () => {
    const { repo, after } = pushOf(['waves/BT80.md']);
    expect(select(repo, '0'.repeat(40), after).full).toBe(true);
  });

  it('row 10: a forced push (before is not an ancestor of after) runs everything', () => {
    const { repo, before } = pushOf(['waves/BT80.md']);
    git(repo, 'checkout', '-q', '--orphan', 'other');
    git(repo, 'commit', '-qm', 'unrelated', '--allow-empty');
    expect(select(repo, before, git(repo, 'rev-parse', 'HEAD')).full).toBe(true);
  });

  it('row 11: a before the repository does not know runs everything', () => {
    const { repo, after } = pushOf(['waves/BT80.md']);
    expect(select(repo, 'f'.repeat(40), after).full).toBe(true);
  });

  it('it prints each changed path with its class and the reason for its answer', () => {
    const { repo, before, after } = pushOf(['waves/BT80.md', 'packages/box-bounty/answer.ts']);
    const { stdout } = select(repo, before, after);
    expect(stdout).toContain('waves/BT80.md');
    expect(stdout).toContain('packages/box-bounty/answer.ts');
    expect(stdout).toMatch(/^full=true \(.+\)$/m);
  });
});

describe('K76: the workflow mirror covers every tracked file, not a sample', () => {
  // GitHub applies `paths` patterns in order; evaluate the committed list the same way for every tracked file and require
  // agreement with suite.mjs's isInert. A file a product test names must never be skipped by the filter.
  it('every tracked file runs the workflow exactly when isInert says it is not inert', () => {
    const workflow = readFileSync(join(root, '.github', 'workflows', 'verify.yml'), 'utf8');
    const patterns: { negated: boolean; re: RegExp }[] = [];
    let inPaths = false;
    for (const line of workflow.split('\n')) {
      if (/^\s+paths:/.test(line)) { inPaths = true; continue; }
      if (!inPaths) continue;
      const match = /^\s+-\s+'([^']+)'/.exec(line);
      if (!match) { if (/^\s*(#|$)/.test(line)) continue; break; }
      let pattern = match[1]!;
      const negated = pattern.startsWith('!');
      if (negated) pattern = pattern.slice(1);
      const source = pattern.replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/\*\*\/|\*\*|\*/g, token => (token === '**/' ? '(?:.*/)?' : token === '**' ? '.*' : '[^/]*'));
      patterns.push({ negated, re: new RegExp(`^${source}$`) });
    }
    const runs = (path: string): boolean => { let run = false; for (const { negated, re } of patterns) if (re.test(path)) run = !negated; return run; };
    const tracked = git(root, 'ls-files').split('\n').filter(Boolean);
    expect(tracked.length).toBeGreaterThan(500);
    const nonInert: boolean[] = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `import * as s from './scripts/suite.mjs'; import { readFileSync } from 'node:fs'; const paths = JSON.parse(readFileSync(0, 'utf8')); console.log(JSON.stringify(paths.map(path => !s.isInert(path))));`], { cwd: root, encoding: 'utf8', input: JSON.stringify(tracked), maxBuffer: 64 * 1024 * 1024 }));
    const disagree = tracked.filter((path, index) => runs(path) !== nonInert[index]).map(path => `${path}: workflow ${runs(path) ? 'runs' : 'skips'}`);
    expect(disagree).toEqual([]);
  });
});
