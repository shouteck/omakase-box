// K37 regression tests: cheap honest load context in run records, the
// advisory comparable-cohort duration flag, and the read-only per-wave stats
// query. Everything runs on fabricated run dirs and one fabricated git repo
// under the OS temp dir; nothing touches the real .kitchen/runs, and the
// before/after comparisons are fixture arithmetic — never a performance or
// causal-load claim.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { platform, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const statsScript = join(root, 'scripts', 'kitchen-stats.mjs');
const temps: string[] = [];
const temp = () => { const dir = mkdtempSync(join(tmpdir(), 'kitchen-k37-')); temps.push(dir); return dir; };
afterAll(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }); });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const probe = (expression: string): Json => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `import * as k from './scripts/kitchen-stats.mjs'; console.log(JSON.stringify(${expression}));`], { cwd: root, encoding: 'utf8', timeout: 30000 }));
const loadProbe = (expression: string): Json => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `import * as h from './scripts/host-load.mjs'; console.log(JSON.stringify(${expression}));`], { cwd: root, encoding: 'utf8', timeout: 30000 }));

const sha = (char: string) => char.repeat(40);
const dirName = (ms: number, full: string) => new Date(ms).toISOString().replace(/[:.]/g, '-') + '-' + full.slice(0, 7);
const iso = (ms: number) => new Date(ms).toISOString();
const NOW = Date.parse('2026-02-01T12:00:00.000Z');
const LOAD = { capturedAt: iso(NOW), platform: 'linux', cpu: { model: 'fixture-cpu', logicalCores: 8 }, memory: { freeBytes: 100, totalBytes: 1000 }, loadAverage: { supported: true, one: 1, five: 2, fifteen: 3 } };

function fakeRun(rootDir: string, name: string, files: { started?: Record<string, unknown>; summary?: Record<string, unknown> | 'malformed' } = {}) {
  const dir = join(rootDir, '.kitchen', 'runs', name);
  mkdirSync(dir, { recursive: true });
  if (files.started) writeFileSync(join(dir, 'started.json'), JSON.stringify({ schemaVersion: 1, ...files.started }));
  if (files.summary === 'malformed') writeFileSync(join(dir, 'summary.json'), '{ not json');
  else if (files.summary) writeFileSync(join(dir, 'summary.json'), JSON.stringify({ schemaVersion: 1, notRun: [], failure: null, steps: [], ...files.summary }));
}
// One eligible duration observation: clean PASS, whole plan attempted, no reuse.
const pass = (ms: number, commit: string, seconds: number, extra: Record<string, unknown> = {}) =>
  ({ sha: commit, dirty: false, verdict: 'PASS', startedAt: iso(ms), seconds, notRun: [], steps: [{ name: 'check', exit: 0, seconds, log: 'check.log' }], load: LOAD, ...extra });
const readRuns = (dir: string): Json[] => probe(`k.readRuns(${JSON.stringify(join(dir, '.kitchen', 'runs'))})`);
const advisory = (dir: string, opts: Record<string, unknown> = {}): Json[] =>
  probe(`k.durationAdvisory(k.readRuns(${JSON.stringify(join(dir, '.kitchen', 'runs'))}), ${JSON.stringify(opts)})`);

describe('captureLoad — honest platform metadata, injected host', () => {
  it('marks win32 unsupported and keeps real numbers elsewhere', () => {
    const win = loadProbe(`h.captureLoad({ platform: () => 'win32', cpus: () => [{ model: 'x' }], freemem: () => 1, totalmem: () => 2, loadavg: () => [0, 0, 0] })`);
    expect(win.platform).toBe('win32');
    expect(win.loadAverage.supported).toBe(false);
    expect(win.loadAverage.five).toBeUndefined();
    expect(win.loadAverage.note).toContain('Windows');
    expect(win.memory).toEqual({ freeBytes: 1, totalBytes: 2 });
    expect(win.cpu).toEqual({ model: 'x', logicalCores: 1 });
    const nix = loadProbe(`h.captureLoad({ platform: () => 'linux', cpus: () => [], freemem: () => 1, totalmem: () => 2, loadavg: () => [0.5, 1.5, 2.5] })`);
    expect(nix.loadAverage).toEqual({ supported: true, one: 0.5, five: 1.5, fifteen: 2.5 });
    expect(nix.cpu).toEqual({ model: null, logicalCores: 0 });
  });
  it('a failing os call leaves the field missing, not invented', () => {
    const load = loadProbe(`h.captureLoad({ platform: () => 'linux', cpus: () => { throw new Error('no'); }, freemem: () => { throw new Error('no'); }, totalmem: () => 2, loadavg: () => { throw new Error('no'); } })`);
    expect(load.cpu).toEqual({ model: null, logicalCores: 0 });
    expect(load.memory).toBeNull();
    expect(load.loadAverage.supported).toBe(false);
    expect(load.loadAverage.note).toContain('failed');
  });
  it('the real host snapshot carries time, platform and capacity — and never env/user/command data', () => {
    const load = loadProbe('h.captureLoad()');
    expect(typeof load.capturedAt).toBe('string');
    expect(load.platform).toBe(platform());
    expect(load.loadAverage.supported).toBe(platform() !== 'win32');
    if (platform() === 'win32') expect(load.loadAverage.five).toBeUndefined();
    expect(Object.keys(load).sort()).toEqual(['capturedAt', 'cpu', 'loadAverage', 'memory', 'platform']);
  });
  it('verify.mjs writes the snapshot into both run records', () => {
    const source = readFileSync(join(root, 'scripts', 'verify.mjs'), 'utf8');
    expect(source).toContain('captureLoad');
    expect((source.match(/load/g) || []).length).toBeGreaterThanOrEqual(3); // capture + started + two summaries
  });
});

describe('readRuns — old, unsupported and malformed load records stay safe', () => {
  it('parses summary load, falls back to started.json, leaves legacy runs null', () => {
    const dir = temp();
    fakeRun(dir, dirName(NOW, sha('a')), { summary: pass(NOW, sha('a'), 30) });
    fakeRun(dir, dirName(NOW + 60000, sha('b')), { started: { sha: sha('b'), startedAt: iso(NOW + 60000), load: LOAD } });
    fakeRun(dir, dirName(NOW + 120000, sha('c')), { summary: { sha: sha('c'), dirty: false, verdict: 'PASS', startedAt: iso(NOW + 120000), seconds: 9 } });
    const runs = readRuns(dir);
    expect(runs[0].loadFrom).toBe('summary');
    expect(runs[0].load.platform).toBe('linux');
    expect(runs[0].load.loadAverage).toEqual({ supported: true, five: 2, note: null });
    expect(runs[1].loadFrom).toBe('started'); // unfinished runs keep their snapshot
    expect(runs[2].load).toBeNull(); // pre-K37 record: missing, not zero
  });
  it('tolerates malformed and unsupported load shapes field by field', () => {
    const dir = temp();
    fakeRun(dir, dirName(NOW, sha('a')), { summary: pass(NOW, sha('a'), 30, { load: 'garbage' }) });
    fakeRun(dir, dirName(NOW + 60000, sha('b')), { summary: pass(NOW + 60000, sha('b'), 30, { load: { platform: 42, loadAverage: { supported: false, five: 'x', note: 9 }, cpu: { logicalCores: 'many' } } }) });
    const runs = readRuns(dir);
    expect(runs[0].load).toBeNull();
    expect(runs[1].load.platform).toBeNull();
    expect(runs[1].load.loadAverage).toEqual({ supported: false, five: null, note: null });
    expect(runs[1].load.logicalCores).toBeNull();
  });
});

describe('durationAdvisory — comparable cohort, strict threshold, never a verdict', () => {
  const three = (dir: string) => {
    fakeRun(dir, dirName(NOW - 400000, sha('a')), { summary: pass(NOW - 400000, sha('a'), 100) });
    fakeRun(dir, dirName(NOW - 300000, sha('b')), { summary: pass(NOW - 300000, sha('b'), 120) });
    fakeRun(dir, dirName(NOW - 200000, sha('c')), { summary: pass(NOW - 200000, sha('c'), 140) });
  };
  it('flags strictly over 2x the median; exactly 2x is not an outlier', () => {
    const dir = temp();
    three(dir);
    fakeRun(dir, dirName(NOW, sha('d')), { summary: pass(NOW, sha('d'), 241) }); // median 120, 2x = 240
    const [report] = advisory(dir);
    expect(report.status).toBe('outlier');
    expect(report.n).toBe(3);
    expect(report.median).toBe(120);
    expect([report.min, report.max]).toEqual([100, 140]);
    expect(report.sources).toHaveLength(3);
    expect(report.sources).not.toContain(report.run); // no self-baseline
    const exact = temp();
    three(exact);
    fakeRun(exact, dirName(NOW, sha('d')), { summary: pass(NOW, sha('d'), 240) });
    expect(advisory(exact)[0].status).toBe('within');
  });
  it('under three earlier eligible observations is unavailable, not green', () => {
    const dir = temp();
    fakeRun(dir, dirName(NOW - 100000, sha('a')), { summary: pass(NOW - 100000, sha('a'), 100) });
    fakeRun(dir, dirName(NOW - 50000, sha('b')), { summary: pass(NOW - 50000, sha('b'), 120) });
    fakeRun(dir, dirName(NOW, sha('c')), { summary: pass(NOW, sha('c'), 900) });
    const [report] = advisory(dir);
    expect(report.status).toBe('unavailable');
    expect(report.reason).toContain('2 earlier eligible');
  });
  it('excludes reused, dirty, incomplete and invalid-duration observations from the cohort', () => {
    const dir = temp();
    three(dir);
    fakeRun(dir, dirName(NOW - 150000, sha('e')), { summary: pass(NOW - 150000, sha('e'), 5, { steps: [{ name: 'check', exit: 0, seconds: 0, reused: 'earlier-run' }] }) });
    fakeRun(dir, dirName(NOW - 140000, sha('f')), { summary: pass(NOW - 140000, sha('f'), 5, { dirty: true }) });
    fakeRun(dir, dirName(NOW - 130000, sha('1')), { summary: pass(NOW - 130000, sha('1'), 5, { notRun: ['test:x'] }) });
    fakeRun(dir, dirName(NOW - 120000, sha('2')), { summary: pass(NOW - 120000, sha('2'), 5, { seconds: null }) });
    fakeRun(dir, dirName(NOW - 110000, sha('3'))); // no summary at all
    fakeRun(dir, dirName(NOW, sha('d')), { summary: pass(NOW, sha('d'), 241) });
    const [report] = advisory(dir);
    expect(report.status).toBe('outlier');
    expect(report.n).toBe(3); // only the three clean 100-140s runs form the baseline
    expect(report.median).toBe(120);
  });
  it('a different platform or plan is a different cohort — never pooled', () => {
    const dir = temp();
    three(dir); // linux, steps check
    fakeRun(dir, dirName(NOW, sha('d')), { summary: pass(NOW, sha('d'), 900, { load: { ...LOAD, platform: 'darwin' } }) });
    const reports = advisory(dir);
    const darwin = reports.find((r: Json) => r.platform === 'darwin');
    expect(darwin.status).toBe('unavailable');
    expect(darwin.reason).toContain('0 earlier eligible');
    // The linux cohort kept only its own members — still just two earlier.
    expect(reports.find((r: Json) => r.platform === 'linux').reason).toContain('2 earlier eligible');
    // Different executed plan: same platform, extra step — separate cohort.
    const dir2 = temp();
    three(dir2);
    fakeRun(dir2, dirName(NOW, sha('d')), { summary: pass(NOW, sha('d'), 900, { steps: [{ name: 'check', exit: 0, seconds: 500 }, { name: 'build', exit: 0, seconds: 400 }] }) });
    expect(advisory(dir2).find((r: Json) => r.run === dirName(NOW, sha('d'))).status).toBe('unavailable');
  });
  it('reports carry no causal claim: a timeout-shaped failure stays a failure, never a load verdict', () => {
    const dir = temp();
    three(dir);
    fakeRun(dir, dirName(NOW - 50000, sha('f')), { summary: { sha: sha('f'), dirty: false, verdict: 'FAIL', startedAt: iso(NOW - 50000), seconds: 600, notRun: [], steps: [{ name: 'check', exit: 124, seconds: 600, log: 'check.log' }], load: LOAD } });
    fakeRun(dir, dirName(NOW, sha('d')), { summary: pass(NOW, sha('d'), 130) });
    const reports = advisory(dir);
    for (const report of reports) {
      expect(['outlier', 'within', 'unavailable']).toContain(report.status);
      expect(JSON.stringify(report)).not.toMatch(/caus|because|overload/i);
    }
    // The FAIL run completed its plan and is itself eligible — its duration is
    // a fact, but its verdict is untouched by the advisory.
    expect(readRuns(dir).find((r: Json) => r.verdict === 'FAIL').verdict).toBe('FAIL');
  });
});

describe('waveReport — the close-time machine-readable per-wave query', () => {
  // A real tiny git repo: base commit on master, wave/k9 branch with two
  // commits, merged --no-ff; a master-only commit sits outside the bounds.
  function fakeRepoWithWave() {
    const dir = temp();
    const gitDir = dir.replace(/[\\/]+$/, '').replaceAll(String.fromCharCode(92), '/');
    const git = (args: string[]) => execFileSync('git', ['-c', `safe.directory=${gitDir}`, '-c', 'user.email=kitchen@test.invalid', '-c', 'user.name=kitchen', ...args], { cwd: dir, encoding: 'utf8' }).trim();
    mkdirSync(join(dir, 'waves'), { recursive: true });
    git(['init', '-q', '-b', 'master']);
    writeFileSync(join(dir, 'tracked.txt'), 'base\n');
    git(['add', '-A']); git(['commit', '-qm', 'base']);
    git(['checkout', '-qb', 'wave/k9']);
    writeFileSync(join(dir, 'tracked.txt'), 'one\n');
    git(['add', '-A']); git(['commit', '-qm', 'k9 one']);
    const c1 = git(['rev-parse', 'HEAD']);
    writeFileSync(join(dir, 'tracked.txt'), 'two\n');
    git(['add', '-A']); git(['commit', '-qm', 'k9 two']);
    const c2 = git(['rev-parse', 'HEAD']);
    git(['checkout', '-q', 'master']);
    git(['merge', '-q', '--no-ff', '-m', 'merge k9', 'wave/k9']);
    const merge = git(['rev-parse', 'HEAD']);
    writeFileSync(join(dir, 'waves', 'k9.md'), ['# k9', '', 'Branch: `wave/k9`', '', '- Commit: `' + c2 + '`', '- Merged: `' + merge + '`', ''].join('\n'));
    git(['add', '-A']); git(['commit', '-qm', 'k9 wave file']);
    return { dir, c1, c2, merge };
  }
  const waveReport = (dir: string, id: string): Json => JSON.parse(spawnSync(process.execPath, [statsScript, '--root=' + dir, '--wave=' + id], { encoding: 'utf8', timeout: 60000 }).stdout);

  it('attributes every attempt inside the branch bounds and recomputes exact totals', () => {
    const { dir, c1, c2 } = fakeRepoWithWave();
    fakeRun(dir, dirName(NOW - 300000, c1), { summary: pass(NOW - 300000, c1, 100) });
    fakeRun(dir, dirName(NOW - 200000, c2), { summary: pass(NOW - 200000, c2, 130) });
    // A reused invocation: its own tiny wall time counts; the reused step adds no executed seconds.
    fakeRun(dir, dirName(NOW - 150000, c2), { summary: pass(NOW - 150000, c2, 4, { steps: [{ name: 'check', exit: 0, seconds: 0, reused: 'earlier' }] }) });
    // Failed and dirty attempts count. An unfinished dir counts but carries no wall time.
    fakeRun(dir, dirName(NOW - 100000, c1), { summary: { sha: c1, dirty: false, verdict: 'FAIL', startedAt: iso(NOW - 100000), seconds: 60, notRun: ['build'], steps: [{ name: 'check', exit: 1, seconds: 60 }] } });
    fakeRun(dir, dirName(NOW - 50000, c1), { summary: { sha: c1, dirty: true, verdict: 'UNCOMMITTED', startedAt: iso(NOW - 50000), seconds: 2, notRun: [], steps: [] } });
    fakeRun(dir, dirName(NOW - 25000, c2), { started: { sha: c2, startedAt: iso(NOW - 25000) } });
    // A run on a foreign commit never enters the wave's totals.
    fakeRun(dir, dirName(NOW - 400000, sha('f')), { summary: pass(NOW - 400000, sha('f'), 999) });
    const report = waveReport(dir, 'k9');
    expect(report.wave).toBe('k9');
    expect(report.history).toBe('present');
    expect(report.runs.attributed).toBe(6);
    expect(report.runs.verdicts).toEqual({ PASS: 3, FAIL: 1, UNCOMMITTED: 1, other: 0, unfinished: 1 });
    expect(report.wallSeconds).toEqual({ known: 296, missing: 1 }); // 100+130+4+60+2; the started-only dir is missing
    expect(report.executedStepSeconds.known).toBe(290); // reused step contributes 0
    expect(report.runIds).toHaveLength(6);
    expect(report.unattributed.count).toBe(1);
    expect(report.line).toBe('verify: 6 runs, total 296s (1 runs without a recorded wall time)');
    expect(report.attribution.merge).toBeDefined();
    expect(report.attribution.branchCommits).toBe(2);
    // A FAIL in the cohort is duration-eligible but never verdict-touched.
    expect(JSON.stringify(report.durationAdvisory)).not.toMatch(/caus/i);
  });

  it('a checkout without .kitchen/runs reports missing history, never zero', () => {
    const { dir } = fakeRepoWithWave();
    const report = waveReport(dir, 'k9');
    expect(report.history).toBe('missing');
    expect(report.runs.attributed).toBe(0);
    expect(report.provenance).toContain('fresh clone');
    expect(report.wallSeconds.known).toBe(0);
  });

  it('an unknown wave id reports its record missing instead of attributing everything', () => {
    const { dir } = fakeRepoWithWave();
    const report = waveReport(dir, 'zz9');
    expect(report.waveRecord).toBe('missing');
    expect(report.runs.attributed).toBe(0);
    expect(report.error).toContain('zz9');
  });
});

describe('the page prints the advisory section without changing any verdict', () => {
  function fakeRoot(): string {
    const dir = temp();
    mkdirSync(join(dir, 'docs', 'box-v4'), { recursive: true });
    mkdirSync(join(dir, 'kitchen'), { recursive: true });
    writeFileSync(join(dir, 'AGENTS.md'), 'agents\n');
    writeFileSync(join(dir, 'docs', 'box-v4', 'KITCHEN.md'), 'kitchen\n');
    writeFileSync(join(dir, 'kitchen', 'INBOX.md'), '- one\n');
    writeFileSync(join(dir, 'STATUS.md'), 'status\n');
    return dir;
  }
  it('prints n, median, range and source ids for an outlier cohort', () => {
    const dir = fakeRoot();
    for (let i = 0; i < 4; i += 1) fakeRun(dir, dirName(NOW - (5 - i) * 60000, sha('a')), { summary: pass(NOW - (5 - i) * 60000, sha('a'), 100 + i * 10) });
    fakeRun(dir, dirName(NOW, sha('b')), { summary: pass(NOW, sha('b'), 999) });
    const run = spawnSync(process.execPath, [statsScript, '--root=' + dir], { encoding: 'utf8', timeout: 60000 });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('Duration vs comparable runs');
    expect(run.stdout).toContain('OUTLIER');
    expect(run.stdout).toMatch(/n=4/);
    expect(run.stdout).toMatch(/median 115s/);
    expect(run.stdout).toContain('advisory');
  });
  it('missing and thin cohorts are unavailable or absent, never zero or green', () => {
    const run = spawnSync(process.execPath, [statsScript, '--root=' + fakeRoot()], { encoding: 'utf8', timeout: 60000 });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('missing — no eligible duration observations');
    const thin = fakeRoot();
    fakeRun(thin, dirName(NOW, sha('a')), { summary: pass(NOW, sha('a'), 500) });
    const run2 = spawnSync(process.execPath, [statsScript, '--root=' + thin], { encoding: 'utf8', timeout: 60000 });
    expect(run2.stdout).toContain('comparison unavailable');
    expect(run2.stdout).not.toContain('OUTLIER');
  });
});
