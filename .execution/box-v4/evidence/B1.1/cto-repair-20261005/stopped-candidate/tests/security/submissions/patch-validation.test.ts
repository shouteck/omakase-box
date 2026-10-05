import { expect, it } from 'vitest';
import { validatePatch, PatchRejected, PATCH_LIMITS } from '../../../services/external-api/submissions/patch-validation.js';

const EDITABLE = ['src/PlanSelector.tsx', 'src/selectPlan.ts', 'config/response-security.json'];

function diff(path: string, extra = ''): Uint8Array {
  return Buffer.from(`diff --git a/${path} b/${path}\nindex 1111111..2222222 100644\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-old\n+new\n${extra}`, 'utf8');
}

function code(patch: Uint8Array, editable: readonly string[] = EDITABLE): string {
  try {
    validatePatch({ bytes: patch, editablePaths: editable });
    return 'accepted';
  } catch (error) {
    return error instanceof PatchRejected ? error.code : 'unexpected';
  }
}

it('accepts a bounded unified diff inside the editable allowlist', () => {
  const result = validatePatch({ bytes: diff('src/PlanSelector.tsx'), editablePaths: EDITABLE });
  expect(result.files).toEqual([{ path: 'src/PlanSelector.tsx', addedLines: 1, removedLines: 1 }]);
  expect(result.changedLines).toBe(2);
  expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
});

it('accepts one patch spanning multiple approved paths across units', () => {
  const bytes = Buffer.concat([diff('src/PlanSelector.tsx'), diff('src/selectPlan.ts'), diff('config/response-security.json')]);
  const result = validatePatch({ bytes, editablePaths: EDITABLE });
  expect(result.files.length).toBe(3);
});

it('rejects traversal, absolute, Windows-unsafe and device paths', () => {
  for (const path of ['../evil.ts', 'src/../../evil.ts', '/etc/passwd', 'C:/windows/system32/evil.dll', 'src/../con.ts', 'aux.ts', 'src/NUL.txt', 'src/file.txt:stream', 'src/name.ts.', 'src/trailing .ts']) {
    expect(code(diff(path)), path).not.toBe('accepted');
  }
  expect(code(diff('src\\evil.ts'))).toBe('path_unsafe');
});

it('rejects case-fold collisions and file/directory collisions', () => {
  const bytes = Buffer.concat([diff('src/PlanSelector.tsx'), diff('src/PLANSELECTOR.tsx')]);
  expect(code(bytes, [...EDITABLE, 'src/PLANSELECTOR.tsx'])).toBe('path_collision');
  const dup = Buffer.concat([diff('src/PlanSelector.tsx'), diff('src/PlanSelector.tsx')]);
  expect(code(dup)).toBe('path_collision');
});

it('rejects evaluator, harness, manifest, lockfile and config paths even when allowlisted', () => {
  const extended = [...EDITABLE, 'tests/harness/evaluator.ts', 'package.json', 'pnpm-lock.yaml', 'vite.config.ts', 'tsconfig.json', 'Dockerfile'];
  for (const path of ['tests/harness/evaluator.ts', 'package.json', 'pnpm-lock.yaml', 'vite.config.ts', 'tsconfig.json', 'Dockerfile']) {
    expect(code(diff(path), extended), path).toBe('path_not_editable');
  }
});

it('rejects editable-surface escapes even for portable paths', () => {
  expect(code(diff('src/other.ts'))).toBe('path_outside_allowlist');
  expect(code(diff('.git/config'))).toBe('path_not_editable');
});

it('rejects binary, rename, mode, symlink and submodule constructs', () => {
  expect(code(Buffer.from('diff --git a/src/PlanSelector.tsx b/src/PlanSelector.tsx\nBinary files differ\n'))).toBe('patch_binary');
  expect(code(Buffer.from('diff --git a/src/PlanSelector.tsx b/src/PlanSelector.tsx\nGIT binary patch\n'))).toBe('patch_binary');
  expect(code(Buffer.from('diff --git a/src/PlanSelector.tsx b/src/PlanSelector.tsx\nrename from src/PlanSelector.tsx\nrename to src/Renamed.tsx\n'))).toBe('patch_rename');
  expect(code(Buffer.from('diff --git a/src/PlanSelector.tsx b/src/PlanSelector.tsx\nold mode 100644\nnew mode 100755\n'))).toBe('patch_mode_change');
  expect(code(Buffer.from('diff --git a/src/PlanSelector.tsx b/src/PlanSelector.tsx\nnew file mode 100644\nindex 0000000..2222222\n'))).toBe('patch_mode_change');
  expect(code(Buffer.from('diff --git a/src/PlanSelector.tsx b/src/PlanSelector.tsx\nindex 1111111..2222222 120000\n'))).toBe('patch_symlink');
  expect(code(Buffer.from('diff --git a/src/PlanSelector.tsx b/src/PlanSelector.tsx\nindex 1111111..2222222 160000\nSubproject commit abc\n'))).toBe('patch_submodule');
});

it('rejects /dev/null create-delete headers and path mismatches', () => {
  expect(code(Buffer.from('diff --git a/src/PlanSelector.tsx b/src/PlanSelector.tsx\n--- /dev/null\n+++ b/src/PlanSelector.tsx\n@@ -0,0 +1 @@\n+new\n'))).toBe('patch_mode_change');
  expect(code(Buffer.from('diff --git a/src/PlanSelector.tsx b/src/PlanSelector.tsx\n--- a/other.ts\n+++ b/other.ts\n@@ -1 +1 @@\n-a\n+b\n'))).toBe('path_mismatch');
  expect(code(Buffer.from('diff --git a/src/a.ts b/src/b.ts\n--- a/src/a.ts\n+++ b/src/b.ts\n@@ -1 +1 @@\n-a\n+b\n', 'utf8'), ['src/a.ts', 'src/b.ts'])).toBe('path_mismatch');
});

it('rejects malformed hunks, non-UTF8, empties and count overflows', () => {
  expect(code(Buffer.from('not a patch'))).toBe('patch_malformed');
  expect(code(Buffer.from('diff --git a/src/PlanSelector.tsx b/src/PlanSelector.tsx\n'))).toBe('patch_malformed');
  expect(code(Buffer.from('diff --git a/src/PlanSelector.tsx b/src/PlanSelector.tsx\n@@ bogus @@\n'))).toBe('patch_malformed');
  expect(code(Buffer.from('diff --git a/src/PlanSelector.tsx b/src/PlanSelector.tsx\n--- a/src/PlanSelector.tsx\n+++ b/src/PlanSelector.tsx\n@@ -1 +1 @@\n-a\n+b\n+extra\n'))).toBe('patch_malformed');
  expect(code(new Uint8Array([0xff, 0xfe, 0x00]))).toBe('patch_not_utf8');
  expect(code(new Uint8Array(0))).toBe('patch_empty');
  expect(code(Buffer.alloc(PATCH_LIMITS.maxBytes + 1, 0x61))).toBe('patch_too_large');
});

it('bounds changed lines at the default ceiling', () => {
  const lines = ['diff --git a/src/PlanSelector.tsx b/src/PlanSelector.tsx', '--- a/src/PlanSelector.tsx', '+++ b/src/PlanSelector.tsx', `@@ -1,1 +1,${PATCH_LIMITS.maxChangedLines + 1} @@`, '-a'];
  for (let index = 0; index < PATCH_LIMITS.maxChangedLines + 1; index += 1) lines.push('+x');
  expect(code(Buffer.from(lines.join('\n')))).toBe('too_many_changed_lines');
});

it('normalizes CRLF for parsing without changing the byte-bound hash', () => {
  const lf = diff('src/PlanSelector.tsx');
  const crlf = Buffer.from(Buffer.from(diff('src/PlanSelector.tsx')).toString('utf8').replaceAll('\n', '\r\n'), 'utf8');
  const a = validatePatch({ bytes: lf, editablePaths: EDITABLE });
  const b = validatePatch({ bytes: crlf, editablePaths: EDITABLE });
  expect(b.files).toEqual(a.files);
  expect(b.hash).not.toBe(a.hash); // hash binds raw submitted bytes
});
