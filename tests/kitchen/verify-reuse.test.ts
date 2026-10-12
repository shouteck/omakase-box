// Fast unit tests for the K5 "stop repeating work" seam: the check-suite table,
// the diff->suite selection, and reusableStep — the predicate verify.mjs trusts
// before it lets a recorded PASS stand in for a real run. Everything runs on
// fabricated run dirs under the OS temp dir through node -e probes, same
// pattern as kitchen-stats.test.ts; nothing touches the real .kitchen/runs.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const temps: string[] = [];
const temp = () => { const dir = mkdtempSync(join(tmpdir(), 'kitchen-k5-')); temps.push(dir); return dir; };
afterAll(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }); });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const probe = (expression: string): Json => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `import * as s from './scripts/suite.mjs'; console.log(JSON.stringify(${expression}));`], { cwd: root, encoding: 'utf8', timeout: 30000 }));

const sha = (char: string) => char.repeat(40);
const dirName = (ms: number, full: string) => new Date(ms).toISOString().replace(/[:.]/g, '-') + '-' + full.slice(0, 7);
const iso = (ms: number) => new Date(ms).toISOString();
const NOW = Date.parse('2026-02-01T12:00:00.000Z');
const STEPS = [
  { name: 'check', exit: 0, seconds: 90, log: 'check.log' },
  { name: 'build', exit: 0, seconds: 45, log: 'build.log' },
  { name: 'test:kitchen', exit: 0, seconds: 12, log: 'test_kitchen.log' }
];

// Fabricates .kitchen/runs/<name>/summary.json plus the step logs a real verify
// writes, the way verify.mjs writes them.
function fakePass(dir: string, ms: number, commit: string, extra: Record<string, unknown> = {}) {
  const name = dirName(ms, commit);
  const runDir = join(dir, '.kitchen', 'runs', name);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, 'summary.json'), JSON.stringify({ schemaVersion: 1, sha: commit, dirty: false, verdict: 'PASS', startedAt: iso(ms), seconds: 150, steps: STEPS, notRun: [], failure: null, ...extra }));
  for (const step of STEPS) writeFileSync(join(runDir, step.log), `${step.name} output\n`);
  return name;
}
const reusable = (dir: string, commit: string, step: string, opts?: Record<string, unknown>) =>
  probe(`s.reusableStep(${JSON.stringify(join(dir, '.kitchen', 'runs'))}, ${JSON.stringify(commit)}, ${JSON.stringify(step)}, ${JSON.stringify(opts ?? {})})`);

describe('checkSuitesForPaths — the path->suite table', () => {
  const pick = (paths: string[]): Json => probe(`s.checkSuitesForPaths(${JSON.stringify(paths)})`);

  it('maps each suite area to the suites whose tests can reach it', () => {
    expect(pick(['services/private-api/src/x.ts']).suites).toEqual(['bootstrap', 'auth', 'contracts', 'planner']);
    expect(pick(['services/external-api/src/x.ts']).suites).toEqual(['bootstrap', 'auth']);
    expect(pick(['packages/planner/partition/x.ts']).suites).toEqual(['contracts', 'planner']);
    expect(pick(['tests/auth/routes.test.ts']).suites).toEqual(['auth']);
    expect(pick(['docs/box-v4/KITCHEN.md', 'waves/K5.md', 'AGENTS.md']).suites).toEqual([]);
  });

  it('fails safe: shared tooling and unmapped paths run every check suite', () => {
    for (const path of ['scripts/verify.mjs', 'package.json', 'pnpm-lock.yaml', 'vitest.config.mjs', 'unknown-dir/file.ts', 'tests/kitchen/x.test.ts'])
      expect(pick([path]).suites, path).toEqual(['bootstrap', 'auth', 'contracts', 'planner']);
  });

  it('K12: milestone-BT product paths reach no check suite — except box-contracts, which private-api imports', () => {
    for (const path of ['tests/box/bounty/x.test.ts', 'tests/box/package/support.ts', 'packages/box-bounty/index.ts', 'packages/box-cli/src/cli.ts', 'packages/box-package/index.ts', 'packages/box-trace/index.ts'])
      expect(pick([path]).suites, path).toEqual([]);
    expect(pick(['packages/box-contracts/index.ts']).suites).toEqual(['bootstrap', 'auth', 'contracts', 'planner']);
  });
});

describe('selectCheckSuites — what check runs this invocation', () => {
  it('runs every suite under --full even when the diff touched nothing it can see', () => {
    expect(probe(`s.selectCheckSuites('.', { full: true })`).suites).toEqual(['bootstrap', 'auth', 'contracts', 'planner']);
  });

  it('runs every suite when git cannot answer — a broken diff never narrows the gate', () => {
    expect(probe(`s.selectCheckSuites(${JSON.stringify(join(temp(), 'not-a-repo'))}, {})`).suites).toEqual(['bootstrap', 'auth', 'contracts', 'planner']);
  });
});

describe('suiteKey — the dedup key for test:* steps', () => {
  it('keys a suite step on its suite.mjs arguments and nothing else', () => {
    const key = (command: string): Json => probe(`s.suiteKey(${JSON.stringify(command)})`);
    expect(key('node scripts/suite.mjs auth')).toBe('auth');
    expect(key('node scripts/suite.mjs box --suite auth')).toBe('box --suite auth');
    expect(key('node scripts/workspace.mjs check')).toBeNull();
    expect(key('node scripts/workspace.mjs build')).toBeNull();
  });
});

describe('reusableStep — when a recorded PASS may stand in', () => {
  it('reuses a step from a clean PASS on the same commit, naming the source run', () => {
    const dir = temp();
    const name = fakePass(dir, NOW, sha('a'));
    const hit = reusable(dir, sha('a'), 'build');
    expect(hit.run).toBe(name);
    expect(hit.seconds).toBe(45);
  });

  it('refuses a step that failed or was never run in the source', () => {
    const dir = temp();
    fakePass(dir, NOW, sha('a'), { steps: [{ name: 'check', exit: 1, seconds: 5, log: 'check.log' }], verdict: 'FAIL' });
    expect(reusable(dir, sha('a'), 'check')).toBeNull();
    expect(reusable(dir, sha('a'), 'test:security')).toBeNull();
  });

  it('refuses every forgery shape: wrong sha, dirty tree, renamed dir, missing log, malformed summary', () => {
    const dir = temp();
    fakePass(dir, NOW, sha('a'));
    expect(reusable(dir, sha('b'), 'check')).toBeNull(); // different commit

    const dirty = temp();
    fakePass(dirty, NOW, sha('a'), { dirty: true });
    expect(reusable(dirty, sha('a'), 'check')).toBeNull(); // PASS on a dirty tree is not a committed PASS

    const renamed = temp(); // a run dir copied under a name its summary contradicts
    const runDir = join(renamed, '.kitchen', 'runs', dirName(NOW + 999000, sha('b')));
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, 'summary.json'), JSON.stringify({ schemaVersion: 1, sha: sha('a'), dirty: false, verdict: 'PASS', startedAt: iso(NOW), steps: STEPS }));
    for (const step of STEPS) writeFileSync(join(runDir, step.log), 'forged\n');
    expect(reusable(renamed, sha('a'), 'check')).toBeNull();

    const noLog = temp(); // summary claims the step passed but its log was never written
    fakePass(noLog, NOW, sha('a'));
    rmSync(join(noLog, '.kitchen', 'runs', dirName(NOW, sha('a')), 'build.log'));
    expect(reusable(noLog, sha('a'), 'build')).toBeNull();

    const malformed = temp();
    const runDir2 = join(malformed, '.kitchen', 'runs', dirName(NOW, sha('a')));
    mkdirSync(runDir2, { recursive: true });
    writeFileSync(join(runDir2, 'summary.json'), '{ not json');
    expect(reusable(malformed, sha('a'), 'check')).toBeNull();

    const noStartedAt = temp(); // summary without startedAt cannot prove its own dir name
    fakePass(noStartedAt, NOW, sha('a'), { startedAt: null });
    expect(reusable(noStartedAt, sha('a'), 'check')).toBeNull();
  });

  it('a reused check must have covered at least the suites this run needs — --full never inherits a partial check', () => {
    const dir = temp();
    fakePass(dir, NOW, sha('a'), { checkSuites: ['auth'] });
    expect(reusable(dir, sha('a'), 'check', { suites: ['auth'] })).not.toBeNull();
    expect(reusable(dir, sha('a'), 'check', { suites: ['auth', 'planner'] })).toBeNull();
    // a summary from before checkSuites existed ran every check suite
    const old = temp();
    fakePass(old, NOW, sha('a'));
    expect(reusable(old, sha('a'), 'check', { suites: ['bootstrap', 'auth', 'contracts', 'planner'] })).not.toBeNull();
  });

  it('picks the newest qualifying run when several PASS on the commit', () => {
    const dir = temp();
    fakePass(dir, NOW, sha('a'));
    const newer = fakePass(dir, NOW + 60000, sha('a'));
    expect(reusable(dir, sha('a'), 'build').run).toBe(newer);
  });
});
