import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const probe = (expression: string) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `import * as b from './scripts/boundaries.mjs'; console.log(JSON.stringify(${expression}));`], { cwd: fileURLToPath(new URL('../../../', import.meta.url)), encoding: 'utf8', timeout: 30000 }));

describe('private box boundary regression', () => {
  it('forbids external-side imports of packages/box-* and box-contracts workspace specifiers', () => {
    const source = readFileSync(fileURLToPath(new URL('../../../scripts/boundaries.mjs', import.meta.url)), 'utf8');
    expect(source).toContain("'packages/box-'");
    expect(probe("b.allowedExternalSpecifier('@private-task/box-contracts')")).toBe(false);
    expect(probe("b.allowedExternalSpecifier('@private-task/contracts/public')")).toBe(true);
    expect(probe("b.importSpecifiers(\"import { BoxVersionSchema } from '../../../packages/box-contracts/index.js';\")")).toEqual(['../../../packages/box-contracts/index.js']);
  });
});
