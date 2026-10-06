import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { agreementFile, cleanCheck, copyBox, runExport } from './support.js';

const LONG = 300_000;

describe('broken output stays caught', () => {
  it('a box whose shipped source no longer compiles fails its declared checks in the clean directory', { timeout: LONG }, () => {
    runExport(agreementFile('request-a'));
    const exported = runExport(agreementFile('request-a'));
    const dir = copyBox(exported.outDir, 'broken-box');
    writeFileSync(join(dir, 'src/policy/loader.ts'), "export const broken: number = 'not a number';\n");
    const run = cleanCheck(dir, 'evaluator/request-a.test.ts');
    expect(run.ok, run.steps.map(step => `${step.command} -> ${step.code}`).join('\n')).toBe(false);
    expect(run.steps.some(step => step.code !== 0)).toBe(true);
  });

  it('a box whose evaluator no longer holds fails its declared checks in the clean directory', { timeout: LONG }, () => {
    const exported = runExport(agreementFile('request-a'));
    const dir = copyBox(exported.outDir, 'broken-evaluator');
    writeFileSync(join(dir, 'evaluator/request-a.test.ts'), "import { it } from 'vitest';\nit('fails', () => { throw new Error('broken evaluator'); });\n");
    const run = cleanCheck(dir, 'evaluator/request-a.test.ts');
    expect(run.ok, run.steps.map(step => `${step.command} -> ${step.code}`).join('\n')).toBe(false);
  });
});
