import { expect, it } from 'vitest';
import { binaryPatchPaths, looksBinary, scanPatch, scanText } from '../../../packages/box-bounty/scan.js';

// The secret-scan text functions are pure text work — BT20 moved them out
// of github.ts so drafting does not import the GitHub module. These cases
// start no Git and no gh. Every secret-shaped value is assembled at run
// time: this file's bytes must never hold a contiguous literal, because
// secret-literals.test.ts runs the same scanner over every tracked test
// file.
const TOKEN_VALUE = 'Xk9Qm2Zv8Lp4' + 'Nr7Ty1Wb6Jd0Fg';

it('names the rule and line of a secret-shaped assignment in plain text', () => {
  const hits = scanText('config.env', `API_TOKEN="${TOKEN_VALUE}"\nplain = true\n`);
  expect(hits).toEqual([{ path: 'config.env', line: 1, rule: 'assigned-secret' }]);
});

it('lets an assigned name holding a plain-words value go — the pattern alone cannot say random', () => {
  const hits = scanText('config.env', 'api_token = "thequickbrownfoxjumps"\n');
  expect(hits).toEqual([]);
});

it('names an added diff line\'s new-file line; a removed line is already leaving', () => {
  const diff = [
    'diff --git a/src/app.ts b/src/app.ts',
    '--- a/src/app.ts',
    '+++ b/src/app.ts',
    '@@ -1,2 +1,3 @@',
    ' const keep = 1;',
    `-const token = "${TOKEN_VALUE}";`,
    `+const token = "${TOKEN_VALUE}";`
  ].join('\n');
  expect(scanPatch(diff)).toEqual([{ path: 'src/app.ts', line: 2, rule: 'assigned-secret' }]);
});

it('names a binary file as not scanned — a fact, never a hit', () => {
  expect(looksBinary(Buffer.from('before\0after'))).toBe(true);
  expect(looksBinary(Buffer.from('plain text\n'))).toBe(false);
  const diff = 'diff --git a/logo.png b/logo.png\nindex 000..111\nBinary files a/logo.png and b/logo.png differ\n';
  expect(binaryPatchPaths(diff)).toEqual(['logo.png']);
  expect(scanPatch(diff)).toEqual([]);
});
