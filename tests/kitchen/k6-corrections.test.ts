import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const suiteScript = join(root, 'scripts', 'suite.mjs');
const shimScript = join(root, 'tests', 'box', 'package', 'pnpm-shim.mjs');
const pnpmCjs = join(root, 'scripts', 'tooling', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs');
const temps: string[] = [];
const temp = () => { const dir = mkdtempSync(join(tmpdir(), 'kitchen-k6-fix-')); temps.push(dir); return dir; };
const junction = join(root, 'tests', 'kitchen', 'kitchen-k6-fix-link');
afterAll(() => {
  rmSync(junction, { recursive: true, force: true });
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const probe = (expression: string): Json => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `import * as k from './scripts/kitchen-stats.mjs'; console.log(JSON.stringify(${expression}));`], { cwd: root, encoding: 'utf8', timeout: 30000 }));

const sha = (char: string) => char.repeat(40);
const dirName = (ms: number, full: string) => new Date(ms).toISOString().replace(/[:.]/g, '-') + '-' + full.slice(0, 7);
const iso = (ms: number) => new Date(ms).toISOString();
const NOW = Date.parse('2026-02-01T12:00:00.000Z');
const PROFILE = 'verify --full test:box-package test:kitchen';
const STEPS = (seconds: number) => [
  { name: 'check', exit: 0, seconds },
  { name: 'build', exit: 0, seconds: 20 },
  { name: 'test:box-package', exit: 0, seconds: 120 },
  { name: 'test:kitchen', exit: 0, seconds: 10 }
];

function run(rootDir: string, ms: number, commit: string, steps: Json[], extra: Record<string, unknown> = {}) {
  const dir = join(rootDir, '.kitchen', 'runs', dirName(ms, commit));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'summary.json'), JSON.stringify({ schemaVersion: 1, sha: commit, dirty: false, verdict: 'PASS', startedAt: iso(ms), seconds: 200, profile: PROFILE, steps, notRun: [], failure: null, ...extra }));
}

const budget = (rootDir: string, opts?: Record<string, unknown>) =>
  probe(`k.budgetCheck(k.readRuns(${JSON.stringify(join(rootDir, '.kitchen', 'runs'))}), ${JSON.stringify(opts ?? {})})`);
const readRuns = (rootDir: string) =>
  probe(`k.readRuns(${JSON.stringify(join(rootDir, '.kitchen', 'runs'))})`);

describe('budgetCheck fails closed on the latest profile observation', () => {
  it('a dirty FAIL run with a failed step is not a budget pass', () => {
    const dir = temp();
    run(dir, NOW, sha('a'), STEPS(160), { dirty: true, verdict: 'FAIL', failure: 'test:box-package' });
    const hit = budget(dir, { budgetSeconds: 330 });
    expect(hit.ok).not.toBe(true);
  });
  it('the latest observation wins: missing seconds never falls back to an older complete run', () => {
    const dir = temp();
    run(dir, NOW - 60000, sha('a'), STEPS(10));
    run(dir, NOW, sha('a'), STEPS(10).map(step => ({ name: step.name, exit: step.exit })));
    const hit = budget(dir, { budgetSeconds: 330 });
    expect(hit.ok).not.toBe(true);
    expect(hit.actual).not.toBe('160s');
  });
  it('negative step seconds are rejected, not summed', () => {
    const dir = temp();
    run(dir, NOW, sha('a'), STEPS(10).map(step => ({ ...step, seconds: -50 })));
    const hit = budget(dir, { budgetSeconds: 330 });
    expect(hit.ok).not.toBe(true);
  });
  it('a malformed latest summary is judged invalid, not skipped for an older PASS', () => {
    const dir = temp();
    run(dir, NOW - 60000, sha('a'), STEPS(10));
    const bad = join(dir, '.kitchen', 'runs', dirName(NOW, sha('b')));
    mkdirSync(bad, { recursive: true });
    writeFileSync(join(bad, 'summary.json'), '{not json');
    const hit = budget(dir, { budgetSeconds: 330 });
    expect(hit.ok).not.toBe(true);
    expect(hit.actual).not.toBe('160s');
  });
  it('a newest run dir with no summary.json never falls back to an older PASS', () => {
    const dir = temp();
    run(dir, NOW - 60000, sha('a'), STEPS(10));
    mkdirSync(join(dir, '.kitchen', 'runs', dirName(NOW, sha('b'))), { recursive: true });
    const hit = budget(dir, { budgetSeconds: 330 });
    expect(hit.ok).not.toBe(true);
    expect(hit.actual).not.toBe('160s');
  });
  it('readRuns keeps per-step reused metadata so a partially reused run is visible', () => {
    const dir = temp();
    run(dir, NOW, sha('a'), STEPS(10).map(step => ({ ...step, reused: 'earlier-run' })));
    const runs = readRuns(dir);
    expect(runs[0].steps.every((step: Json) => step.reused === 'earlier-run')).toBe(true);
    expect(budget(dir, { budgetSeconds: 330 }).ok).not.toBe(true);
  });
});

describe('suite.mjs scoped containment is canonical', () => {
  it('a junction inside the suite cannot reach a test file outside it', () => {
    const outside = temp();
    writeFileSync(join(outside, 'escape.test.ts'), "import { it, expect } from 'vitest';\nit('escapes', () => expect(1).toBe(1));\n");
    rmSync(junction, { recursive: true, force: true });
    symlinkSync(outside, junction, 'junction');
    const run = spawnSync(process.execPath, [suiteScript, 'kitchen', join('tests', 'kitchen', 'kitchen-k6-fix-link', 'escape.test.ts')], { cwd: root, encoding: 'utf8', timeout: 120000 });
    expect(run.status, `${run.stdout}${run.stderr}`).toBe(2);
    expect(`${run.stdout}${run.stderr}`).toContain('refuses');
  });
});

describe('pnpm-shim never trusts preexisting global cache bytes', () => {
  it('a planted global lockfile cannot make a nonexistent dependency resolve', () => {
    const project = temp();
    const manifest = JSON.stringify({ name: 'k6-poison-probe', version: '0.0.0', private: true, dependencies: { 'k6-package-that-does-not-exist-zzz': '9.9.9' } }) + '\n';
    writeFileSync(join(project, 'package.json'), manifest);
    const globalCache = join(tmpdir(), 'box-k6-lockfile-cache');
    mkdirSync(globalCache, { recursive: true });
    const planted = join(globalCache, createHash('sha256').update(manifest).digest('hex') + '.yaml');
    writeFileSync(planted, 'lockfileVersion: 9.0\nimporters: {}\n');
    const env = { ...process.env };
    delete env.BOX_K6_LOCKFILE_CACHE;
    const run = spawnSync(process.execPath, [shimScript, pnpmCjs, 'install', '--lockfile-only'], { cwd: project, encoding: 'utf8', timeout: 120000, env });
    expect(run.status, `${run.stdout}${run.stderr}`).not.toBe(0);
    rmSync(planted, { force: true });
  });
  it('a caller-supplied BOX_K6_LOCKFILE_CACHE is never consulted', () => {
    const project = temp();
    const manifest = JSON.stringify({ name: 'k6-poison-probe', version: '0.0.0', private: true, dependencies: { 'k6-package-that-does-not-exist-zzz': '9.9.9' } }) + '\n';
    writeFileSync(join(project, 'package.json'), manifest);
    const callerCache = temp();
    writeFileSync(join(callerCache, createHash('sha256').update(manifest).digest('hex') + '.yaml'), 'lockfileVersion: 9.0\nimporters: {}\n');
    const run = spawnSync(process.execPath, [shimScript, pnpmCjs, 'install', '--lockfile-only'], { cwd: project, encoding: 'utf8', timeout: 120000, env: { ...process.env, BOX_K6_LOCKFILE_CACHE: callerCache } });
    expect(run.status, `${run.stdout}${run.stderr}`).not.toBe(0);
  });
  it('K6_LOCKFILE_MODE=uncached resolves for real even when a cache env is supplied', () => {
    const project = temp();
    const manifest = JSON.stringify({ name: 'k6-poison-probe', version: '0.0.0', private: true, dependencies: { 'k6-package-that-does-not-exist-zzz': '9.9.9' } }) + '\n';
    writeFileSync(join(project, 'package.json'), manifest);
    const callerCache = temp();
    writeFileSync(join(callerCache, createHash('sha256').update(manifest).digest('hex') + '.yaml'), 'lockfileVersion: 9.0\nimporters: {}\n');
    const run = spawnSync(process.execPath, [shimScript, pnpmCjs, 'install', '--lockfile-only'], { cwd: project, encoding: 'utf8', timeout: 120000, env: { ...process.env, BOX_K6_LOCKFILE_CACHE: callerCache, K6_LOCKFILE_MODE: 'uncached' } });
    expect(run.status, `${run.stdout}${run.stderr}`).not.toBe(0);
  });
});
