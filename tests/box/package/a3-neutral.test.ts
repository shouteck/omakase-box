import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exportBox, verifySubmission } from '../../../packages/box-package/index.js';
import { copyBox, fixtureCommit, fixtureGit, ROOT, runRoot, runSubmitTool } from './support.js';

// A3 neutral-loop proof: export and owner verify driven only by owner-selected
// files and declared commands — no nodejs helper, no evaluator generators, no
// implicit install/compile, arbitrary file extensions. The fixture is the R1
// kitchen-stats task replayed neutrally: a mini owner repo whose
// scripts/kitchen-stats.mjs still prints the obsolete Usage section, checked by
// a plain-Node declaration (research/box-delegation/a3/r1-check.mjs).

const AGREEMENT = join(ROOT, 'research', 'box-delegation', 'a3', 'r1-neutral.agreement.json');
const CHECKER = join(ROOT, 'research', 'box-delegation', 'a3', 'r1-check.mjs');
const PREFIX_SHA = '54ece571c58fd3d65fefed55ed58a5ce152c8055'; // last commit where kitchen-stats printed Usage
const SAFE_ROOT = ROOT.replace(/[\\/]+$/, '').split('\\').join('/');
const HEAVY = 600_000;

function blobAt(sha: string, path: string): Buffer {
  const result = spawnSync('git', ['-c', `safe.directory=${SAFE_ROOT}`, '-C', ROOT, 'show', `${sha}:${path}`]);
  if (result.status !== 0) throw new Error(`cannot read ${path} at ${sha}: ${result.stderr}`);
  return result.stdout;
}

function miniR1Repo(): { repo: string; baseCommit: string } {
  const repo = join(runRoot('a3-r1'), 'owner-repo');
  const put = (rel: string, content: Buffer | string): void => {
    const target = join(repo, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  };
  put('.gitattributes', '* -text\n'); // pin bytes: the baseline hash binds blob bytes
  put('README.md', '# mini r1 owner\n');
  put('docs/brief.md', 'Remove the obsolete Usage per wave section.\n'); // arbitrary extension, explicit selection
  put('scripts/kitchen-stats.mjs', blobAt(PREFIX_SHA, 'scripts/kitchen-stats.mjs'));
  put('scripts/process.mjs', readFileSync(join(ROOT, 'scripts', 'process.mjs')));
  cpSync(CHECKER, join(repo, 'research', 'box-delegation', 'a3', 'r1-check.mjs'));
  fixtureGit(repo, ['init', '-b', 'main']);
  return { repo, baseCommit: fixtureCommit(repo, 'a3-r1-mini-owner') };
}

function pinnedAgreement(baseCommit: string): string {
  const agreement = JSON.parse(readFileSync(AGREEMENT, 'utf8')) as Record<string, unknown>;
  agreement.baseCommit = baseCommit;
  const path = join(runRoot('a3-agreement'), 'agreement.json');
  writeFileSync(path, JSON.stringify(agreement, null, 2));
  return path;
}

function sealedBox(repo: string, agreementPath: string, edit?: (dir: string) => void) {
  const exported = exportBox({ agreementPath, repoPath: repo, outDir: join(runRoot('a3-out'), 'box') }); // no pnpm — the agreement needs none
  const dir = copyBox(exported.outDir, 'a3-box');
  edit?.(dir);
  const run = runSubmitTool(dir);
  return { exported, dir, run };
}

describe('A3 neutral export and verify (R1 replayed by declarations)', () => {
  it('exports explicit files only — no generated package.json, tsconfig or lockfile', { timeout: HEAVY }, () => {
    const { repo, baseCommit } = miniR1Repo();
    const exported = exportBox({ agreementPath: pinnedAgreement(baseCommit), repoPath: repo, outDir: join(runRoot('a3-out'), 'box') }); // no pnpm invocation at all
    const produced = exported.files;
    expect(produced).toContain('scripts/kitchen-stats.mjs');
    expect(produced).toContain('scripts/process.mjs');
    expect(produced).toContain('research/box-delegation/a3/r1-check.mjs');
    expect(produced).toContain('docs/brief.md'); // arbitrary extension ships verbatim
    expect(produced).toContain('box/submit.mjs');
    expect(produced).toContain('box.json');
    expect(produced.some(file => /(^|\/)package\.json$/.test(file))).toBe(false);
    expect(produced.some(file => /(^|\/)tsconfig\.json$/.test(file))).toBe(false);
    expect(produced.some(file => /(^|\/)pnpm-lock\.yaml$/.test(file))).toBe(false);
    const manifest = JSON.parse(readFileSync(join(exported.outDir, 'box.json'), 'utf8')) as Record<string, unknown>;
    expect(manifest.nodejs).toBeUndefined();
    expect(manifest.evaluator).toEqual([]);
    // The declared outcome is red on the untouched base — recorded, exactly as declared.
    const baseChecks = manifest.baseChecks as Array<{ name: string; result: string; context: string }>;
    expect(baseChecks.find(record => record.name === 'stats-outcome')).toMatchObject({ context: 'owner', result: 'fail' });
  });

  it('verifies a real fix in a scratch history with declared commands only', { timeout: HEAVY }, () => {
    const { repo, baseCommit } = miniR1Repo();
    const agreementPath = pinnedAgreement(baseCommit);
    const { dir, run } = sealedBox(repo, agreementPath, box => {
      // The recipient fix, exactly as it landed upstream: the current file no longer prints Usage.
      writeFileSync(join(box, 'scripts', 'kitchen-stats.mjs'), readFileSync(join(ROOT, 'scripts', 'kitchen-stats.mjs')));
    });
    expect(run.status, run.stderr).toBe(0);
    const report = verifySubmission({
      submissionPath: join(dir, 'submission.json'),
      agreementPath,
      repoPath: repo,
      workRoot: runRoot('a3-verify')
      // no pnpm — the agreement declares nothing that needs it
    });
    expect(report.verdict, JSON.stringify(report.commandChecks ?? report.checks)).toBe('pass');
    expect(report.checks).toEqual([]); // no implicit install/compile/outcome steps ran
    expect(report.commandChecks?.map(record => `${record.name}:${record.result}`)).toEqual(['stats-outcome:pass']);
    const scratch = report.merge?.scratch;
    expect(report.merge?.commit).toMatch(/^[a-f0-9]{40}$/);
    expect(fixtureGit(repo, ['rev-parse', 'HEAD'])).toBe(baseCommit); // real history untouched
    expect(scratch === null || scratch === undefined || !existsSync(scratch)).toBe(true);
  });

  it('fails a no-op submission as a declared command-check, not silently', { timeout: HEAVY }, () => {
    const { repo, baseCommit } = miniR1Repo();
    const agreementPath = pinnedAgreement(baseCommit);
    const { dir, run } = sealedBox(repo, agreementPath); // nothing edited
    expect(run.status, run.stderr).toBe(0);
    const report = verifySubmission({
      submissionPath: join(dir, 'submission.json'),
      agreementPath,
      repoPath: repo,
      workRoot: runRoot('a3-verify')
    });
    expect(report.verdict).toBe('fail');
    expect(report.failureClass).toBe('implementation-failure');
    expect(report.reason).toBe('command-check');
    expect(report.commandChecks?.find(record => record.name === 'stats-outcome')?.result).toBe('fail');
    expect(report.merge).toBeUndefined();
  });

  it('keeps the folder runnable in a clean directory with declared commands only', { timeout: HEAVY }, () => {
    const { repo, baseCommit } = miniR1Repo();
    const exported = exportBox({ agreementPath: pinnedAgreement(baseCommit), repoPath: repo, outDir: join(runRoot('a3-out'), 'box') });
    const dir = copyBox(exported.outDir, 'a3-clean');
    // No install, no manifest: the declared recipient check is a plain node run.
    expect(readdirSync(dir).sort()).toEqual(['box', 'box.json', 'docs', 'research', 'scripts']);
    const check = spawnSync(process.execPath, ['research/box-delegation/a3/r1-check.mjs', 'scripts/kitchen-stats.mjs'], { cwd: dir, encoding: 'utf8' });
    expect(check.status).toBe(1); // pre-fix script still prints Usage — outcome is red at base
    expect(`${check.stderr}${check.stdout}`).toContain('obsolete Usage output');
  });
});
