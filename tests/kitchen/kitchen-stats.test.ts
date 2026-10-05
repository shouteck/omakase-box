// Fast unit tests for the K4 kitchen numbers page and the verify stall guard.
// Everything runs on fabricated run dirs under the OS temp dir; nothing touches
// the real .kitchen/runs or spawns verify inside verify. The module under test
// is plain .mjs, so it is exercised through node -e probes (same pattern as
// tests/contracts/boundaries.test.ts) — no type declarations needed.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const statsScript = join(root, 'scripts', 'kitchen-stats.mjs');
const temps: string[] = [];
const temp = () => { const dir = mkdtempSync(join(tmpdir(), 'kitchen-k4-')); temps.push(dir); return dir; };
afterAll(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }); });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const probe = (expression: string): Json => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `import * as k from './scripts/kitchen-stats.mjs'; console.log(JSON.stringify(${expression}));`], { cwd: root, encoding: 'utf8', timeout: 30000 }));

const sha = (char: string) => char.repeat(40);
const dirName = (ms: number, full: string) => new Date(ms).toISOString().replace(/[:.]/g, '-') + '-' + full.slice(0, 7);
const iso = (ms: number) => new Date(ms).toISOString();
const NOW = Date.parse('2026-02-01T12:00:00.000Z');

// Fabricates .kitchen/runs/<name>/summary.json the way verify.mjs writes it;
// pass 'malformed' for an unparseable summary or omit it for a dir with none.
function fakeRun(rootDir: string, name: string, summary?: Record<string, unknown> | 'malformed') {
  const dir = join(rootDir, '.kitchen', 'runs', name);
  mkdirSync(dir, { recursive: true });
  if (summary === 'malformed') writeFileSync(join(dir, 'summary.json'), '{ not json');
  else if (summary) writeFileSync(join(dir, 'summary.json'), JSON.stringify({ schemaVersion: 1, notRun: [], failure: null, steps: [], ...summary }));
}
// The same seam verify.mjs calls: stallCheck(readRuns(runsDir), branchCommits, opts).
const stall = (rootDir: string, commits: string[], opts: Record<string, unknown>) =>
  probe(`k.stallCheck(k.readRuns(${JSON.stringify(join(rootDir, '.kitchen', 'runs'))}), ${JSON.stringify(commits)}, ${JSON.stringify(opts)})`);
const fail = (rootDir: string, ms: number, commit: string, extra: Record<string, unknown> = {}) =>
  fakeRun(rootDir, dirName(ms, commit), { sha: commit, dirty: false, verdict: 'FAIL', startedAt: iso(ms), seconds: 30, ...extra });

describe('readRuns', () => {
  it('counts every run dir — including missing and malformed summaries — and labels each', () => {
    const dir = temp();
    fakeRun(dir, dirName(NOW, sha('a')), { sha: sha('a'), dirty: false, verdict: 'PASS', startedAt: iso(NOW), seconds: 10 });
    fakeRun(dir, dirName(NOW + 60000, sha('b')), 'malformed');
    fakeRun(dir, dirName(NOW + 120000, sha('c')));
    const runs = probe(`k.readRuns(${JSON.stringify(join(dir, '.kitchen', 'runs'))})`);
    expect(runs.map((r: Json) => r.summary)).toEqual(['ok', 'malformed', 'missing']);
    expect(runs[1].sha).toBe('bbbbbbb'); // sha recovered from the dir name
    expect(runs[2].sha).toBe('ccccccc');
    expect(runs[1].startedAt).toBe(NOW + 60000); // timestamp recovered too
    expect(runs[1].verdict).toBeNull();
  });
});

describe('stallCheck — the same function verify.mjs calls for its STALL line', () => {
  const commits = [sha('a'), sha('b'), sha('c')];

  it('warns at six consecutive non-PASS runs on the branch, not at five', () => {
    const dir = temp();
    for (let i = 0; i < 5; i += 1) fail(dir, NOW - (5 - i) * 60000, commits[i % 3]!);
    expect(stall(dir, commits, { now: NOW, maxRuns: 6, maxMinutes: 90 })).toBeNull();
    fail(dir, NOW - 30000, commits[0]!);
    const hit = stall(dir, commits, { now: NOW, maxRuns: 6, maxMinutes: 90 });
    expect(hit).not.toBeNull();
    expect(hit.consecutive).toBe(6);
    expect(hit.triggers.join(' ')).toContain('6 consecutive non-PASS');
  });

  it('warns once the streak is older than the minutes limit, not before', () => {
    const dir = temp();
    fail(dir, NOW - 89 * 60000, commits[0]!);
    fail(dir, NOW - 60000, commits[1]!);
    expect(stall(dir, commits, { now: NOW, maxRuns: 6, maxMinutes: 90 })).toBeNull();
    const older = temp();
    fail(older, NOW - 91 * 60000, commits[0]!);
    fail(older, NOW - 60000, commits[1]!);
    const hit = stall(older, commits, { now: NOW, maxRuns: 6, maxMinutes: 90 });
    expect(hit).not.toBeNull();
    expect(hit.triggers.join(' ')).toContain('min since the last PASS');
  });

  it('lets a clean committed PASS break the streak, and only that', () => {
    const dir = temp();
    for (let i = 0; i < 4; i += 1) fail(dir, NOW - (10 - i) * 60000, commits[0]!);
    fakeRun(dir, dirName(NOW - 5 * 60000, commits[1]!), { sha: sha('b'), dirty: false, verdict: 'PASS', startedAt: iso(NOW - 5 * 60000), seconds: 30 });
    for (let i = 0; i < 3; i += 1) fail(dir, NOW - (4 - i) * 60000, commits[2]!);
    const hit = stall(dir, commits, { now: NOW, maxRuns: 6, maxMinutes: 90 });
    expect(hit).toBeNull(); // 4 before + 3 after the PASS are not consecutive
    // and a PASS recorded on a dirty tree must not count as a committed PASS
    const dirty = temp();
    for (let i = 0; i < 5; i += 1) fail(dirty, NOW - (6 - i) * 60000, commits[0]!);
    fakeRun(dirty, dirName(NOW - 30000, commits[1]!), { sha: sha('b'), dirty: true, verdict: 'PASS', startedAt: iso(NOW - 30000), seconds: 30 });
    expect(stall(dirty, commits, { now: NOW, maxRuns: 6, maxMinutes: 90 })).not.toBeNull();
  });

  it('counts UNCOMMITTED and summary-less runs as non-PASS; ignores other commits', () => {
    const dir = temp();
    for (let i = 0; i < 3; i += 1) fail(dir, NOW - (8 - i) * 60000, commits[0]!);
    fakeRun(dir, dirName(NOW - 5 * 60000, commits[1]!), { sha: sha('b'), dirty: true, verdict: 'UNCOMMITTED', startedAt: iso(NOW - 5 * 60000), seconds: 30 });
    fakeRun(dir, dirName(NOW - 4 * 60000, commits[2]!)); // crashed before summary.json
    fail(dir, NOW - 3 * 60000, commits[0]!);
    // six foreign-commit failures in between must not count
    for (let i = 0; i < 6; i += 1) fail(dir, NOW - (8 - i) * 60000 + 30000, sha('f'));
    const hit = stall(dir, commits, { now: NOW, maxRuns: 6, maxMinutes: 900 });
    expect(hit).not.toBeNull();
    expect(hit.consecutive).toBe(6);
    expect(stall(dir, ['f'.repeat(40)], { now: NOW, maxRuns: 6, maxMinutes: 900 })?.consecutive).toBe(6);
  });
});

describe('checkLimits — the kitchen-size guards the page enforces', () => {
  function fakeRoot(): string {
    const dir = temp();
    mkdirSync(join(dir, 'docs', 'box-v4'), { recursive: true });
    mkdirSync(join(dir, 'kitchen'), { recursive: true });
    writeFileSync(join(dir, 'AGENTS.md'), 'agents\n');
    writeFileSync(join(dir, 'docs', 'box-v4', 'KITCHEN.md'), 'kitchen\n');
    writeFileSync(join(dir, 'kitchen', 'INBOX.md'), '- one\n- two\n');
    writeFileSync(join(dir, 'STATUS.md'), 'status\n');
    return dir;
  }
  const limits = (rootDir: string): Json[] => probe(`k.checkLimits(${JSON.stringify(rootDir)})`);

  it('passes a compliant root and reports missing files as missing, not ok', () => {
    const ok = limits(fakeRoot());
    expect(ok.map((c: Json) => c.ok)).toEqual([true, true, true]);
    const empty = temp();
    expect(limits(empty).map((c: Json) => c.ok)).toEqual(['missing', 'missing', 'missing']);
  });

  it('fails each fabricated violation by name — all three limits must trip', () => {
    const big = fakeRoot();
    writeFileSync(join(big, 'AGENTS.md'), 'x'.repeat(21000));
    expect(limits(big).find((c: Json) => c.label.includes('AGENTS.md'))?.ok).toBe(false);

    const inbox = fakeRoot();
    writeFileSync(join(inbox, 'kitchen', 'INBOX.md'), Array.from({ length: 11 }, (_, i) => `- entry ${i}`).join('\n') + '\n');
    expect(limits(inbox).find((c: Json) => c.label.includes('INBOX'))?.ok).toBe(false);

    const status = fakeRoot();
    writeFileSync(join(status, 'STATUS.md'), Array(61).fill('x').join('\n') + '\n');
    expect(limits(status).find((c: Json) => c.label.includes('STATUS'))?.ok).toBe(false);
  });

  it('does not trip at the boundary: ten inbox entries and sixty status lines pass', () => {
    const dir = fakeRoot();
    writeFileSync(join(dir, 'kitchen', 'INBOX.md'), Array.from({ length: 10 }, (_, i) => `- entry ${i}`).join('\n') + '\n');
    writeFileSync(join(dir, 'STATUS.md'), Array(60).fill('x').join('\n') + '\n');
    expect(limits(dir).every((c: Json) => c.ok === true)).toBe(true);
  });
});

describe('the page itself', () => {
  it('exits 1 naming the broken limit on a fabricated root, 0 on the real repo', () => {
    const bad = fakeRoot0();
    writeFileSync(join(bad, 'STATUS.md'), Array(61).fill('x').join('\n') + '\n');
    const violation = spawnSync(process.execPath, [statsScript, '--root=' + bad], { encoding: 'utf8' });
    expect(violation.status).toBe(1);
    expect(violation.stderr + violation.stdout).toContain('STATUS.md');
    expect(violation.stderr + violation.stdout).toContain('LIMIT FAIL');

    const real = spawnSync(process.execPath, [statsScript], { cwd: root, encoding: 'utf8' });
    expect(real.status).toBe(0);
    expect(real.stdout).toContain('Verify minutes per step');
    expect(real.stdout).toContain('Runs per wave branch');
    expect(real.stdout).toContain('Kitchen limits');
  });

  it('prints fabricated runs as counted data, never silently dropped', () => {
    const dir = fakeRoot0();
    fakeRun(dir, dirName(NOW, sha('a')), { sha: sha('a'), dirty: false, verdict: 'FAIL', startedAt: iso(NOW), seconds: 61, steps: [{ name: 'check', exit: 1, seconds: 61 }] });
    fakeRun(dir, dirName(NOW + 60000, sha('b')));
    const run = spawnSync(process.execPath, [statsScript, '--root=' + dir], { encoding: 'utf8' });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('1 runs with summary.json · 1 without');
    expect(run.stdout).toContain('check');
    expect(run.stdout).toContain('61s');
    expect(run.stdout).toContain('not on a wave branch: 2 runs');
  });

  function fakeRoot0(): string {
    const dir = temp();
    mkdirSync(join(dir, 'docs', 'box-v4'), { recursive: true });
    mkdirSync(join(dir, 'kitchen'), { recursive: true });
    writeFileSync(join(dir, 'AGENTS.md'), 'agents\n');
    writeFileSync(join(dir, 'docs', 'box-v4', 'KITCHEN.md'), 'kitchen\n');
    writeFileSync(join(dir, 'kitchen', 'INBOX.md'), '- one\n');
    writeFileSync(join(dir, 'STATUS.md'), 'status\n');
    return dir;
  }
});
