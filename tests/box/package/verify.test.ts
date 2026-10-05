import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifySubmission } from '../../../packages/box-package/index.js';
import type { VerifyOptions } from '../../../packages/box-package/index.js';
import { agreementFile, cleanCheck, copyBox, fixtureGit, ownerRepo, PNPM_CJS, requirePnpmTooling, runExport, runRoot, runSubmitTool } from './support.js';

requirePnpmTooling();

const sha256 = (buffer: Buffer | string): string => createHash('sha256').update(buffer).digest('hex');
const HARDENED = '{"schemaVersion":1,"frameAncestors":"none","noSniff":true,"referrerPolicy":"no-referrer","hsts":{"enabled":true,"maxAgeSeconds":31536000,"includeSubDomains":false}}';
const EDITABLE = 'src/config/response-security.json';
const HEAVY = 600_000;

function ownerBox(edit?: (dir: string) => void) {
  // The full recipient path against the installable owner fixture: export, work in a
  // folder copy, seal with the in-box tool — then verify owner-side.
  const agreementPath = agreementFile('request-a', { baseCommit: ownerRepo().baseCommit });
  const exported = runExport(agreementPath, ownerRepo().repo);
  const dir = copyBox(exported.outDir, 'verify-box');
  edit?.(dir);
  const run = runSubmitTool(dir);
  return { agreementPath, exported, dir, run };
}
function verify(submissionPath: string, agreementPath: string, extra: Partial<VerifyOptions> = {}) {
  return verifySubmission({
    submissionPath,
    agreementPath,
    repoPath: ownerRepo().repo,
    pnpm: { command: process.execPath, args: [PNPM_CJS] },
    workRoot: runRoot('verify-scratch'),
    ...extra
  });
}
function editConfig(dir: string): void {
  writeFileSync(join(dir, EDITABLE), HARDENED);
}
function mutateArtifact(dir: string, mutate: (artifact: Record<string, unknown>) => void): string {
  const artifact = JSON.parse(readFileSync(join(dir, 'submission.json'), 'utf8')) as Record<string, unknown>;
  mutate(artifact);
  const path = join(runRoot('verify-mutant'), 'submission.json');
  writeFileSync(path, JSON.stringify(artifact));
  return path;
}

describe('owner-side verify', () => {
  it('verifies a real submission and lands it in a scratch history', { timeout: HEAVY }, () => {
    const { agreementPath, dir, run } = ownerBox(editConfig);
    expect(run.status, run.stderr).toBe(0);
    const report = verify(join(dir, 'submission.json'), agreementPath, { keepScratch: true });
    expect(report.verdict, JSON.stringify(report.checks)).toBe('pass');
    expect(report.checks.map(check => `${check.name}:${check.status}`)).toEqual(['install:pass', 'compile:pass', 'outcome:pass']);
    const merge = report.merge;
    expect(merge?.branch).toContain('box-verify/private-shop-request-a-v1-');
    expect(merge?.scratch).not.toBeNull();
    const scratch = merge!.scratch!;
    expect(fixtureGit(scratch, ['rev-parse', 'HEAD'])).toBe(merge!.commit);
    expect(fixtureGit(scratch, ['show', 'HEAD:examples/private-shop/config/response-security.json'])).toBe(HARDENED);
    const message = fixtureGit(scratch, ['log', '-1', '--format=%B']);
    expect(message).toContain(`box-verify: private-shop-request-a v1 attempt ${report.attemptSha256?.slice(0, 12)}`);
    expect(message).toContain(`attempt: ${report.attemptSha256}`);
    expect(message).toContain(`base: ${ownerRepo().baseCommit}`);
    // The owner check files are not part of the landed change, and real history
    // was never touched: HEAD is still the base and no scratch branch leaked.
    expect(fixtureGit(scratch, ['status', '--porcelain']).split('\n').filter(line => line.startsWith(' M') || line.startsWith('M '))).toEqual([]);
    expect(fixtureGit(ownerRepo().repo, ['rev-parse', 'HEAD'])).toBe(ownerRepo().baseCommit);
    expect(fixtureGit(ownerRepo().repo, ['branch', '--list', 'box-verify/*'])).toBe('');
  });

  it('accepts an identical replay (idempotent-accept policy)', { timeout: HEAVY }, () => {
    const { agreementPath, dir } = ownerBox(editConfig);
    const submission = join(dir, 'submission.json');
    const first = verify(submission, agreementPath, { keepScratch: true });
    expect(first.verdict, JSON.stringify(first.checks)).toBe('pass');
    const second = verify(submission, agreementPath, { keepScratch: true });
    expect(second.verdict, JSON.stringify(second.checks)).toBe('pass');
    expect(second.attemptSha256).toBe(first.attemptSha256);
    expect(second.merge?.branch).toBe(first.merge?.branch);
    // Each replay lands an equivalent merge in its own scratch history.
    const landed = (scratch: string) => fixtureGit(scratch, ['show', 'HEAD:examples/private-shop/config/response-security.json']);
    expect(landed(second.merge!.scratch!)).toBe(landed(first.merge!.scratch!));
  });

  it('fails a no-op patch the box evaluator passes (local-pass-but-owner-fail)', { timeout: HEAVY }, () => {
    const { agreementPath, dir, run } = ownerBox(); // the recipient changed nothing
    expect(run.status, run.stderr).toBe(0);
    // Prove the local side really is green on this exact folder: the box evaluator
    // only checks that the config parses, so the untouched baseline passes it.
    const local = cleanCheck(dir, 'evaluator/request-a.test.ts');
    expect(local.ok, JSON.stringify(local.steps)).toBe(true);
    const report = verify(join(dir, 'submission.json'), agreementPath);
    expect(report.verdict).toBe('fail');
    expect(report.failureClass).toBe('implementation-failure');
    expect(report.reason).toBe('outcome');
    expect(report.checks).toEqual([
      { name: 'install', status: 'pass' },
      { name: 'compile', status: 'pass' },
      { name: 'outcome', status: 'fail', detail: expect.any(String) }
    ]);
    expect(report.merge).toBeUndefined();
  });

  it('classifies a stale base commit as a preparation defect', () => {
    const { agreementPath, dir } = ownerBox(editConfig);
    const report = verify(join(dir, 'submission.json'), agreementPath, { baseCommit: '0'.repeat(40) });
    expect(report).toMatchObject({ verdict: 'fail', failureClass: 'preparation-defect', reason: 'base-commit-mismatch' });
    expect(report.checks).toEqual([]);
  });

  it('classifies a patch outside the editable surface as a preparation defect', () => {
    const { agreementPath, dir } = ownerBox(editConfig);
    const path = mutateArtifact(dir, artifact => {
      (artifact.files as Array<Record<string, unknown>>).push({ box: 'src/policy/loader.ts', owner: 'src/policy/loader.ts', baselineSha256: null, sha256: sha256('x'), content: 'x' });
    });
    const report = verify(path, agreementPath);
    expect(report).toMatchObject({ verdict: 'fail', failureClass: 'preparation-defect', reason: 'outside-editable' });
    expect(report.checks).toEqual([]);
  });

  it('classifies an agreement with no registered owner check as a preparation defect', () => {
    // A Box that declares an evaluator generator with no owner-side counterpart
    // cannot prove its outcome — verify must refuse, not wave it through.
    const agreementPath = agreementFile('request-a', {
      baseCommit: ownerRepo().baseCommit,
      mutate: value => { value.evaluator = [{ box: 'evaluator/rank.test.ts', generator: 'rank-items-contract' }]; }
    });
    const blob = spawnSync('git', ['-C', ownerRepo().repo, 'show', `${ownerRepo().baseCommit}:examples/private-shop/config/response-security.json`]);
    expect(blob.status).toBe(0);
    const artifact = {
      schemaVersion: 1,
      format: 'editable-overlay',
      box: { id: 'private-shop-request-a', name: 'Strengthen the response security policy', version: 1 },
      baseCommit: ownerRepo().baseCommit,
      agreementSha256: sha256(readFileSync(agreementPath)),
      boxJsonSha256: '0'.repeat(64),
      files: [{ box: EDITABLE, owner: 'config/response-security.json', baselineSha256: sha256(blob.stdout), sha256: sha256(HARDENED), content: HARDENED }]
    };
    const path = join(runRoot('verify-no-check'), 'submission.json');
    writeFileSync(path, JSON.stringify(artifact));
    const report = verify(path, agreementPath);
    expect(report).toMatchObject({ verdict: 'fail', failureClass: 'preparation-defect', reason: 'no-owner-check' });
    expect(report.checks).toEqual([]);
  });

  it('classifies a toolchain that cannot run as an environment failure', { timeout: HEAVY }, () => {
    const { agreementPath, dir } = ownerBox(editConfig);
    const report = verify(join(dir, 'submission.json'), agreementPath, { pnpm: { command: 'box-verify-no-such-tool', args: [] } });
    expect(report.verdict).toBe('fail');
    expect(report.failureClass).toBe('environment-failure');
    expect(report.checks[0]).toMatchObject({ name: 'install', status: 'fail' });
    expect(report.checks.slice(1).every(check => check.status === 'skipped')).toBe(true);
  });
});
