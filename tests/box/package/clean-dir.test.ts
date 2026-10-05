import { describe, expect, it } from 'vitest';
import { agreementFile, cleanCheck, privateByteLeaks, runExport } from './support.js';

const LONG = 300_000;

describe('clean-directory proof', () => {
  it('request A installs from its own lockfile and runs its declared checks green outside the repo', { timeout: LONG }, () => {
    const exported = runExport(agreementFile('request-a'));
    expect(privateByteLeaks(exported.outDir)).toEqual([]);
    const run = cleanCheck(exported.outDir, 'evaluator/request-a.test.ts');
    expect(run.ok, run.steps.map(step => `${step.command} -> ${step.code}\n${step.output}`).join('\n')).toBe(true);
  });

  it('request B installs from its own lockfile and runs its declared checks green outside the repo', { timeout: LONG }, () => {
    const exported = runExport(agreementFile('request-b'));
    expect(privateByteLeaks(exported.outDir)).toEqual([]);
    const run = cleanCheck(exported.outDir, 'evaluator/request-b.test.ts');
    expect(run.ok, run.steps.map(step => `${step.command} -> ${step.code}\n${step.output}`).join('\n')).toBe(true);
  });
});
