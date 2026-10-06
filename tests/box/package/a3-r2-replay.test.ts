import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exportBox, verifySubmission } from '../../../packages/box-package/index.js';
import type { VerifyReport } from '../../../packages/box-package/index.js';
import { copyBox, fixtureCommit, fixtureGit, PNPM_CJS, requirePnpmTooling, ROOT, runRoot, runSubmitTool } from './support.js';

// A3 R2 neutral replay: the unused `repo` parameter delegation (r2/agreement.json,
// migrated to plain program/argv declarations — the old `tool` dispatch is gone).
// The fixture is a clone of this repository with the defect reintroduced
// (`_repo` -> `repo`, the exact R2 base symptom TS6133) committed on top, so the
// declared outcome is red at base and the declaration — not a builtin compile —
// is what judges each candidate. Every owner check is a declared command:
// `node scripts/pnpm.mjs install --frozen-lockfile --ignore-scripts` (setup),
// `pnpm exec tsc --noUnusedParameters` (outcome), `pnpm exec vitest run` (guard).
//
// Heavy: each verdict installs and type-checks a scratch clone (~1-3 min on this
// host). Runs only with BOX_A3_REPLAY=1 — the wave replay evidence lives in
// research/box-delegation/a3/evidence/; the committed suite proves the neutral
// mechanics in a3-neutral.test.ts.

const REPLAY = process.env.BOX_A3_REPLAY === '1';
const AGREEMENT = join(ROOT, 'research', 'box-delegation', 'r2', 'agreement.json');
const EDITABLE_BOX = 'src/tests/box/package/r1-kitchen-stats.test.ts';
const EDITABLE_OWNER = 'tests/box/package/r1-kitchen-stats.test.ts';
const HEAVY = 1_800_000;

requirePnpmTooling();

// One clone + export shared by every candidate: the Box bytes are identical for
// all of them, which is exactly what a real recipient field sees.
let fixture: { repo: string; baseCommit: string; agreementPath: string; boxDir: string } | undefined;
function prepare() {
  if (fixture !== undefined) return fixture;
  const repo = join(runRoot('a3-r2'), 'owner-repo');
  const safeRoot = ROOT.replace(/[\\/]+$/, '').split('\\').join('/');
  fixtureGit(ROOT, ['-c', `safe.directory=${safeRoot}`, 'clone', '--local', '--quiet', ROOT, repo]);
  // The pinned toolchain is installed, never committed (node_modules/ is ignored):
  // copy it into the fixture working tree so declared `node scripts/pnpm.mjs …`
  // commands resolve — exactly what a real owner checkout looks like — and so
  // materializeTooling has something to carry into scratch clones.
  cpSync(join(ROOT, 'scripts', 'tooling'), join(repo, 'scripts', 'tooling'), { recursive: true });
  const target = join(repo, EDITABLE_OWNER);
  const buggy = readFileSync(target, 'utf8').replace('r1Agreement(_repo: string', 'r1Agreement(repo: string');
  if (buggy === readFileSync(target, 'utf8')) throw new Error('fixture reintroduction failed: _repo not found');
  writeFileSync(target, buggy);
  const baseCommit = fixtureCommit(repo, 'a3-r2-replay-base: reintroduce unused repo param');
  const agreement = JSON.parse(readFileSync(AGREEMENT, 'utf8')) as Record<string, unknown>;
  agreement.baseCommit = baseCommit;
  const agreementPath = join(runRoot('a3-r2-agreement'), 'agreement.json');
  writeFileSync(agreementPath, JSON.stringify(agreement, null, 2));
  const boxDir = exportBox({ agreementPath, repoPath: repo, outDir: join(runRoot('a3-r2-out'), 'box') }).outDir;
  fixture = { repo, baseCommit, agreementPath, boxDir };
  return fixture;
}

function attempt(mutate?: (text: string) => string): VerifyReport {
  const { repo, agreementPath, boxDir } = prepare();
  const dir = copyBox(boxDir, 'a3-r2-box');
  if (mutate !== undefined) {
    const file = join(dir, EDITABLE_BOX);
    writeFileSync(file, mutate(readFileSync(file, 'utf8')));
  }
  const run = runSubmitTool(dir);
  if (run.status !== 0) throw new Error(`submit failed: ${run.stderr}`);
  return verifySubmission({
    submissionPath: join(dir, 'submission.json'),
    agreementPath,
    repoPath: repo,
    pnpm: { command: process.execPath, args: [PNPM_CJS] }, // unused by this agreement; supplied harmlessly
    workRoot: runRoot('a3-r2-verify')
  });
}

describe.skipIf(!REPLAY)('A3 R2 neutral replay — the five-candidate matrix by declarations', () => {
  it('positive: the upstream fix (repo -> _repo) verifies and lands in scratch history', { timeout: HEAVY }, () => {
    const report = attempt(text => text.replace('r1Agreement(repo: string', 'r1Agreement(_repo: string'));
    expect(report.verdict, JSON.stringify(report.commandChecks?.map(record => [record.name, record.result]))).toBe('pass');
    expect(report.merge?.commit).toMatch(/^[a-f0-9]{40}$/);
  });

  it('no-op: an untouched editable file fails the declared outcome check', { timeout: HEAVY }, () => {
    const report = attempt(); // seal without editing
    expect(report.verdict).toBe('fail');
    expect(report.failureClass).toBe('implementation-failure');
    expect(report.reason).toBe('command-check');
    expect(report.commandChecks?.find(record => record.name === 'unused-param-outcome')?.result).toBe('fail');
  });

  it('wrong edit: the param stays unused while behavior is untouched — outcome red', { timeout: HEAVY }, () => {
    const report = attempt(text => text.replace('function r1Agreement(repo: string, baseCommit: string)', 'function r1Agreement(repo: string, baseCommit: string)\n// cosmetic change that fixes nothing'));
    expect(report.verdict).toBe('fail');
    expect(report.reason).toBe('command-check');
    expect(report.commandChecks?.find(record => record.name === 'unused-param-outcome')?.result).toBe('fail');
  });

  it('guard failure: the diagnostic is fixed but an assertion is broken — guard red', { timeout: HEAVY }, () => {
    const report = attempt(text => text
      .replace('r1Agreement(repo: string', 'r1Agreement(_repo: string')
      .replace('expect(selection.gaps).toEqual([])', 'expect(selection.gaps).toEqual([\'broken\'])'));
    expect(report.verdict).toBe('fail');
    expect(report.reason).toBe('command-check');
    expect(report.commandChecks?.find(record => record.name === 'unused-param-outcome')?.result).toBe('pass');
    expect(report.commandChecks?.find(record => record.name === 'r1-behavior-guard')?.result).toBe('fail');
  });

  it('alternative solution: consuming the parameter also clears the diagnostic', { timeout: HEAVY }, () => {
    const report = attempt(text => text.replace(
      'function r1Agreement(repo: string, baseCommit: string): string {',
      'function r1Agreement(repo: string, baseCommit: string): string {\n  void repo;'));
    expect(report.verdict).toBe('pass');
  });

  it('known limit: a weakened editable guard still verifies — honest blind spot, reported', { timeout: HEAVY }, () => {
    const report = attempt(text => text
      .replace('r1Agreement(repo: string', 'r1Agreement(_repo: string')
      .replace('.toEqual([])', '.toBeTruthy()')); // guard stays green while checking nothing
    // The R2 evidence accepted this candidate class: the guard lives inside the
    // editable file, so the recipient can weaken it. It must not be relabeled a
    // rejection — the blind spot is the recorded result.
    expect(report.verdict).toBe('pass');
  });
});
