// BT54 — the secret scan reads a patch exactly. Two faults in scanPatch and binaryPatchPaths (hard stop 1):
//  1. an added content line that starts `++ ` reads `+++ ` in a patch and was taken for a file header: the line was not
//     scanned and every later hit in that file was filed under a wrong name;
//  2. a quoted file name kept its octal escapes, so the owner was told of a file that does not exist.
// The patches below are written by hand, the way Git writes them; row 9 goes through the preview on a real repository.
// The key is assembled at run time so this file's own bytes hold no secret-shaped string (BT8's standing guard).
import { describe, expect, it } from 'vitest';
import { binaryPatchPaths, previewGitHub, scanPatch } from '../../../packages/box-bounty/index.js';
import { fixture } from './github-fixture.js';
import { git, write } from './support.js';

const KEY = ['AKIA', 'IOSFODNN7EXAMPLE'].join('');
const RULE = 'aws-access-key-id';

// A new file's patch: the header Git writes, one hunk, the given lines.
const added = (header: string, lines: readonly string[], hunk = `@@ -0,0 +1,${lines.length} @@`): string => [
  `diff --git a/${header} b/${header}`, 'new file mode 100644', 'index 0000000..1111111', '--- /dev/null', `+++ b/${header}`, hunk, ...lines, ''
].join('\n');

describe('scanPatch reads each line as the hunk says it is', () => {
  // @guards P5
  it('1. a key on an added `++ ` line is a hit, under the right file and line', () => {
    expect(scanPatch(added('a.txt', [`+${KEY}`]))).toEqual([{ path: 'a.txt', line: 1, rule: RULE }]); // the same key on a plain line
    expect(scanPatch(added('a.txt', [`+++ ${KEY}`, '+plain']))).toEqual([{ path: 'a.txt', line: 1, rule: RULE }]);
  });

  // @guards P5
  it('2. a hit after a `++ ` line keeps the right file and line (it was filed under a file named x)', () => {
    expect(scanPatch(added('a.txt', ['+++ x', `+${KEY}`, '+end']))).toEqual([{ path: 'a.txt', line: 2, rule: RULE }]);
  });

  // @guards P5
  it('3. a removed line starting `-- ` changes nothing: it is not a header either', () => {
    const patch = ['diff --git a/a.txt b/a.txt', 'index 1111111..2222222 100644', '--- a/a.txt', '+++ b/a.txt', '@@ -1,2 +1,1 @@', '--- gone', '-old', `+${KEY}`, ''].join('\n');
    expect(scanPatch(patch)).toEqual([{ path: 'a.txt', line: 1, rule: RULE }]);
  });

  // @guards P5
  it('4. two files: the second header follows the first hunk and each hit is filed under its own file', () => {
    const patch = added('a.txt', [`+${KEY}`]) + added('b.txt', ['+one', `+${KEY}`]);
    expect(scanPatch(patch)).toEqual([{ path: 'a.txt', line: 1, rule: RULE }, { path: 'b.txt', line: 2, rule: RULE }]);
  });

  // @guards P5
  it('5. a quoted name with non-ASCII bytes is reported by its real name', () => {
    const patch = ['diff --git "a/caf\\303\\251.txt" "b/caf\\303\\251.txt"', 'new file mode 100644', '--- /dev/null', '+++ "b/caf\\303\\251.txt"', '@@ -0,0 +1,1 @@', `+${KEY}`, ''].join('\n');
    expect(scanPatch(patch)).toEqual([{ path: 'café.txt', line: 1, rule: RULE }]);
  });

  it('6. a binary file with a quoted non-ASCII name is named by its real name', () => {
    const patch = ['diff --git "a/caf\\303\\251.bin" "b/caf\\303\\251.bin"', 'new file mode 100644', 'index 0000000..1111111', 'Binary files /dev/null and "b/caf\\303\\251.bin" differ', ''].join('\n');
    expect(binaryPatchPaths(patch)).toEqual(['café.bin']);
    expect(binaryPatchPaths(['diff --git a/x.bin b/x.bin', 'index 1111111..2222222 100644', 'Binary files a/x.bin and b/x.bin differ', ''].join('\n'))).toEqual(['x.bin']);
  });

  // @guards P5
  it('7. a file literally named b/x keeps its name: only one leading a/ or b/ goes', () => {
    expect(scanPatch(added('b/x', [`+${KEY}`]))).toEqual([{ path: 'b/x', line: 1, rule: RULE }]);
  });

  // @guards P5
  it('8. a hunk that ends with "No newline at end of file" keeps the right line', () => {
    expect(scanPatch(added('a.txt', [`+${KEY}`, '\\ No newline at end of file']))).toEqual([{ path: 'a.txt', line: 1, rule: RULE }]);
    expect(scanPatch(added('a.txt', ['+one', `+${KEY}`, '\\ No newline at end of file']))).toEqual([{ path: 'a.txt', line: 2, rule: RULE }]);
  });
});

describe('the attacks the Security lens names', () => {
  // @guards P5
  it('a content line `+++ b/other` is a line, not a file: the later hit stays in the real file', () => {
    expect(scanPatch(added('a.txt', ['++++ b/other', `+${KEY}`]))).toEqual([{ path: 'a.txt', line: 2, rule: RULE }]);
    expect(scanPatch(added('a.txt', ['+++ b/other', `+${KEY}`]))).toEqual([{ path: 'a.txt', line: 2, rule: RULE }]);
  });

  // @guards P5
  it('a line that is exactly `+++` or exactly `++` is an added line', () => {
    expect(scanPatch(added('a.txt', ['+++', `+${KEY}`]))).toEqual([{ path: 'a.txt', line: 2, rule: RULE }]);
    expect(scanPatch(added('a.txt', ['+++ ', `+++ ${KEY}`]))).toEqual([{ path: 'a.txt', line: 2, rule: RULE }]);
  });

  // @guards P5
  it('a quote, a tab and a backslash in a name are decoded, not shown as escapes', () => {
    const header = (name: string) => ['diff --git a/q b/q', 'new file mode 100644', '--- /dev/null', `+++ b/${name}`, '@@ -0,0 +1,1 @@', `+${KEY}`, ''].join('\n');
    expect(scanPatch(header('"has\\"quote\\ttab\\\\slash.txt"').replace('b/"', '"b/'))).toEqual([{ path: 'has"quote\ttab\\slash.txt', line: 1, rule: RULE }]);
  });

  // @guards P5
  it('a deleted file, a mode-only change and an empty new file have no hit and no crash', () => {
    const deleted = ['diff --git a/a.txt b/a.txt', 'deleted file mode 100644', 'index 1111111..0000000', '--- a/a.txt', '+++ /dev/null', '@@ -1,1 +0,0 @@', `-${KEY}`, ''].join('\n');
    const modeOnly = ['diff --git a/run.sh b/run.sh', 'old mode 100644', 'new mode 100755', ''].join('\n');
    const empty = ['diff --git a/new.txt b/new.txt', 'new file mode 100644', 'index 0000000..e69de29', ''].join('\n');
    expect(scanPatch(deleted + modeOnly + empty)).toEqual([]);
    expect(scanPatch(deleted + modeOnly + empty + added('z.txt', [`+${KEY}`]))).toEqual([{ path: 'z.txt', line: 1, rule: RULE }]);
  });

  // @guards P5
  it('a hunk header that leaves out a count means one line, not none', () => {
    const patch = ['diff --git a/a.txt b/a.txt', 'index 1111111..2222222 100644', '--- a/a.txt', '+++ b/a.txt', '@@ -3 +3 @@', '-old', `+${KEY}`, ''].join('\n');
    expect(scanPatch(patch)).toEqual([{ path: 'a.txt', line: 3, rule: RULE }]);
  });

  // @guards P5
  it('context lines count, and a later hunk restarts the line from its header', () => {
    const patch = ['diff --git a/a.txt b/a.txt', 'index 1111111..2222222 100644', '--- a/a.txt', '+++ b/a.txt', '@@ -1,2 +1,3 @@', ' one', '+two', ' three', '@@ -10,1 +11,2 @@', ' ten', `+${KEY}`, ''].join('\n');
    expect(scanPatch(patch)).toEqual([{ path: 'a.txt', line: 12, rule: RULE }]);
  });
});

describe('9. through the preview, on a real repository', () => {
  it('an unpushed commit whose line starts `++ ` holds the preview, naming the file and the line', () => fixture(({ repo, id }) => {
    write(repo, 'plain.txt', `${KEY}\n`);
    git(repo, ['add', 'plain.txt']);
    git(repo, ['commit', '-qm', 'a key on a plain line']);
    expect(previewGitHub(repo, id)).toContain('"plain.txt":1'); // the control: the same key, plainly, is found
    write(repo, 'config.txt', `++ ${KEY}\nplain\n`);
    git(repo, ['add', 'config.txt']);
    git(repo, ['commit', '-qm', 'a key after two plus signs']);
    const preview = previewGitHub(repo, id);
    expect(preview).toContain('"config.txt":1');
    expect(preview).toContain(RULE);
    expect(preview).not.toContain(KEY);
  }));

  it('a non-ASCII file name holding a key is named as it is, not as escapes', () => fixture(({ repo, id }) => {
    write(repo, 'café.txt', `${KEY}\n`);
    git(repo, ['add', 'café.txt']);
    git(repo, ['commit', '-qm', 'a key in a non-ASCII name']);
    const preview = previewGitHub(repo, id);
    expect(preview).toContain('café.txt');
    expect(preview).not.toContain('\\303');
  }));
});
