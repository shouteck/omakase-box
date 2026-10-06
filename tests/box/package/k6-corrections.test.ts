import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
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
