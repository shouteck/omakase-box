import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAgreement } from '../../../packages/box-package/agreement.js';
import { packageManifest } from '../../../packages/box-package/scaffolds.js';
import { agreementFile, cleanCheck, copyBox, fixtureCommit, materializeFixtureRepo, runExport } from './support.js';

const LONG = 300_000;

describe('broken shared setup is caught through the export path', () => {
  it('a box exported from an owner repo whose shipped source is broken fails cleanCheck, not just a mutated copy', { timeout: LONG }, () => {
    const repo = materializeFixtureRepo();
    const broken = join(repo.repo, 'examples', 'private-shop', 'src', 'policy', 'loader.ts');
    writeFileSync(broken, "export const broken: number = 'not a number';\n");
    const agreement = agreementFile('request-a', { baseCommit: fixtureCommit(repo.repo, 'break shipped source') });
    const exported = runExport(agreement, repo.repo);
    const dir = copyBox(exported.outDir, 'broken-source');
    const run = cleanCheck(dir, 'evaluator/request-a.test.ts');
    expect(run.ok, run.steps.map(step => `${step.command} -> ${step.code}`).join('\n')).toBe(false);
    expect(run.steps.some(step => step.code !== 0)).toBe(true);
  });
});

describe('the harness never trusts an inherited lockfile cache', () => {
  // The reviewer planted <sha256(package.json)>.yaml in a caller-controlled dir
  // and BOX_K6_LOCKFILE_CACHE let those bytes stand in for a real resolution.
  // Through the actual harness path that env must not be forwarded: the export
  // resolves the nonexistent dependency for real and fails.
  it('an inherited BOX_K6_LOCKFILE_CACHE cannot plant a lockfile for a nonexistent dependency', { timeout: LONG }, () => {
    const hostile = mkdtempSync(join(tmpdir(), 'kitchen-k6-fix2-hostile-'));
    const agreementPath = agreementFile('request-a', {
      mutate: agreement => {
        agreement.declaredDependencies = { ...(agreement.declaredDependencies as Record<string, string>), 'k6-package-that-does-not-exist-zzz': '9.9.9' };
      }
    });
    const agreement = parseAgreement(JSON.parse(readFileSync(agreementPath, 'utf8')));
    mkdirSync(hostile, { recursive: true });
    writeFileSync(join(hostile, createHash('sha256').update(packageManifest(agreement)).digest('hex') + '.yaml'), 'lockfileVersion: 9.0\nimporters: {}\n');
    const previous = process.env.BOX_K6_LOCKFILE_CACHE;
    process.env.BOX_K6_LOCKFILE_CACHE = hostile;
    try {
      expect(() => runExport(agreementPath)).toThrow();
    } finally {
      if (previous === undefined) delete process.env.BOX_K6_LOCKFILE_CACHE;
      else process.env.BOX_K6_LOCKFILE_CACHE = previous;
      rmSync(hostile, { recursive: true, force: true });
    }
  });
});
