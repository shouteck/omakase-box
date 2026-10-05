import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const run = (expression: string) => execFileSync(process.execPath, ['--input-type=module', '-e', `import { importSpecifiers, allowedExternalSpecifier } from './scripts/boundaries.mjs'; ${expression}`], { encoding: 'utf8', stdio: 'pipe' });
describe('public/private import export boundaries', () => {
  it('has no generic root contracts export and keeps private schemas out of public exports', () => {
    const manifest = JSON.parse(readFileSync('packages/contracts/package.json', 'utf8'));
    expect(manifest.exports['.']).toBeUndefined();
    expect(readFileSync('packages/contracts/public/index.ts', 'utf8')).not.toContain('private');
  });
  it('rejects private package imports and handles static imports, reexports and dynamic imports', () => {
    const result = run(`console.log(JSON.stringify(['@private-task/contracts/private', '@private-task/planner', '@private-task/contracts/public', 'https://attacker.invalid/script'].map(allowedExternalSpecifier)));`);
    expect(JSON.parse(result)).toEqual([false, false, true, false]);
    const imports = run(`console.log(JSON.stringify(importSpecifiers('import x from "one"; export {y} from "two"; const z = import("three");')));`);
    expect(JSON.parse(imports)).toEqual(['one', 'two', 'three']);
  });
  it('fails closed for an unresolved dynamic import', () => {
    expect(() => run('importSpecifiers("const x = import(privatePath)");')).toThrow();
  });
  it('walks real external source import closures without private source access', () => {
    const output = execFileSync(process.execPath, ['scripts/boundaries.mjs'], { encoding: 'utf8', stdio: 'pipe' });
    expect(JSON.parse(output)).toMatchObject({ assurance: 'tested', status: 'passed' });
  });
});
