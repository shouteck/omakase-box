import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const statsScript = join(root, 'scripts', 'kitchen-stats.mjs');
const suiteScript = join(root, 'scripts', 'suite.mjs');
const runsDir = join(root, '.kitchen', 'runs');
const temps: string[] = [];
const temp = () => { const dir = mkdtempSync(join(tmpdir(), 'kitchen-k6-')); temps.push(dir); return dir; };
const scratch = join(root, 'tests', 'kitchen', 'k6-scoped-tmp');
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const probe = (expression: string): Json => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `import * as k from './scripts/kitchen-stats.mjs'; console.log(JSON.stringify(${expression}));`], { cwd: root, encoding: 'utf8', timeout: 30000 }));

const sha = (char: string) => char.repeat(40);
const dirName = (ms: number, full: string) => new Date(ms).toISOString().replace(/[:.]/g, '-') + '-' + full.slice(0, 7);
const iso = (ms: number) => new Date(ms).toISOString();
const NOW = Date.parse('2026-02-01T12:00:00.000Z');
// K29: profile/step names moved to the surviving suites — the fixture must
// keep matching scripts/kitchen-stats.mjs ACCEPTANCE_PROFILE verbatim.
const PROFILE = 'verify --full test:box-bounty test:kitchen';
const STEPS = (seconds: number) => [
  { name: 'check', exit: 0, seconds },
  { name: 'build', exit: 0, seconds: 20 },
  { name: 'test:box-bounty', exit: 0, seconds: 120 },
  { name: 'test:kitchen', exit: 0, seconds: 10 }
];

function acceptanceRun(rootDir: string, ms: number, commit: string, steps: Json[], extra: Record<string, unknown> = {}) {
  const dir = join(rootDir, '.kitchen', 'runs', dirName(ms, commit));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'summary.json'), JSON.stringify({ schemaVersion: 1, sha: commit, dirty: false, verdict: 'PASS', startedAt: iso(ms), seconds: 200, profile: PROFILE, steps, notRun: [], failure: null, ...extra }));
}

const budget = (rootDir: string, opts?: Record<string, unknown>) =>
  probe(`k.budgetCheck(k.readRuns(${JSON.stringify(join(rootDir, '.kitchen', 'runs'))}), ${JSON.stringify(opts ?? {})})`);

describe('suite.mjs file-scoped inner loop', () => {
  const scoped = (files: string[]) => spawnSync(process.execPath, [suiteScript, 'kitchen', ...files], { cwd: root, encoding: 'utf8', timeout: 120000 });

  it('rejects a missing file, an out-of-suite file and a non-test file', () => {
    for (const file of [
      'tests/kitchen/does-not-exist.test.ts',
      'tests/box/bounty/answer.test.ts',
      join(root, 'scripts', 'verify.mjs'),
      '../outside.test.ts'
    ]) {
      const run = scoped([file]);
      expect(run.status, `${file}: ${run.stdout}${run.stderr}`).toBe(2);
      expect(`${run.stdout}${run.stderr}`).toContain('refuses');
    }
  });

  it('runs named files only, propagates a real failure, and writes no run record', () => {
    mkdirSync(scratch, { recursive: true });
    writeFileSync(join(scratch, 'k6-pass.test.ts'), "import { it, expect } from 'vitest';\nit('passes', () => expect(1).toBe(1));\n");
    writeFileSync(join(scratch, 'k6-fail.test.ts'), "import { it, expect } from 'vitest';\nit('fails', () => expect(1).toBe(2));\n");
    const before = readdirSync(runsDir).length;
    const pass = scoped(['tests/kitchen/k6-scoped-tmp/k6-pass.test.ts']);
    expect(pass.status, `${pass.stdout}${pass.stderr}`).toBe(0);
    expect(`${pass.stdout}${pass.stderr}`).toContain('1 file');
    const fail = scoped(['tests/kitchen/k6-scoped-tmp/k6-fail.test.ts']);
    expect(fail.status, `${fail.stdout}${fail.stderr}`).not.toBe(0);
    expect(readdirSync(runsDir).length).toBe(before);
  });
});

describe('budgetCheck — the executed-time ratchet on the acceptance profile', () => {
  it('passes under and at budget, fails a fabricated over-budget run with the numbers', () => {
    const under = temp();
    acceptanceRun(under, NOW, sha('a'), STEPS(10));
    expect(budget(under, { budgetSeconds: 200 }).ok).toBe(true);
    const at = temp();
    acceptanceRun(at, NOW, sha('a'), STEPS(10));
    expect(budget(at, { budgetSeconds: 160 }).ok).toBe(true);
    const over = temp();
    acceptanceRun(over, NOW, sha('a'), STEPS(200));
    const hit = budget(over, { budgetSeconds: 160 });
    expect(hit.ok).toBe(false);
    expect(hit.actual).toBe('350s');
    expect(hit.limit).toBe('160s');
  });

  it('labels partial, fully-reused and missing observations as missing, never a pass', () => {
    const partial = temp();
    acceptanceRun(partial, NOW, sha('a'), STEPS(10).slice(0, 2));
    expect(budget(partial, { budgetSeconds: 160 }).ok).toBe('missing');
    const reused = temp();
    acceptanceRun(reused, NOW, sha('a'), STEPS(0).map(step => ({ ...step, seconds: 0, reused: 'run' })));
    expect(budget(reused, { budgetSeconds: 160 }).ok).toBe('missing');
    const empty = temp();
    expect(budget(empty, { budgetSeconds: 160 }).ok).toBe('missing');
    const foreign = temp();
    acceptanceRun(foreign, NOW, sha('a'), STEPS(10), { profile: 'verify --full test:kitchen' });
    expect(budget(foreign, { budgetSeconds: 160 }).ok).toBe('missing');
  });

  it('the page enforces an explicitly configured budget: over-budget fabricated root exits 1 naming the profile', () => {
    // K29: the inherited 330s exporter default is retired, so page enforcement
    // now runs through the explicit --budget=<seconds> flag. The same flagless
    // root reports the seconds without failing — the profile is uncalibrated.
    const dir = temp();
    mkdirSync(join(dir, 'docs', 'box-v4'), { recursive: true });
    mkdirSync(join(dir, 'kitchen'), { recursive: true });
    writeFileSync(join(dir, 'AGENTS.md'), 'agents\n');
    writeFileSync(join(dir, 'docs', 'box-v4', 'KITCHEN.md'), 'kitchen\n');
    writeFileSync(join(dir, 'kitchen', 'INBOX.md'), '- one\n');
    writeFileSync(join(dir, 'STATUS.md'), 'status\n');
    acceptanceRun(dir, NOW, sha('a'), STEPS(9999));
    const unbudgeted = spawnSync(process.execPath, [statsScript, '--root=' + dir], { encoding: 'utf8', timeout: 60000 });
    expect(unbudgeted.status).toBe(0);
    expect(unbudgeted.stderr + unbudgeted.stdout).toContain('none calibrated');
    const run = spawnSync(process.execPath, [statsScript, '--root=' + dir, '--budget=330'], { encoding: 'utf8', timeout: 60000 });
    expect(run.status).toBe(1);
    expect(run.stderr + run.stdout).toContain('LIMIT FAIL');
    expect(run.stderr + run.stdout).toContain(PROFILE);
    const malformed = spawnSync(process.execPath, [statsScript, '--root=' + dir, '--budget=bogus'], { encoding: 'utf8', timeout: 60000 });
    expect(malformed.status).toBe(2);
  });
});
