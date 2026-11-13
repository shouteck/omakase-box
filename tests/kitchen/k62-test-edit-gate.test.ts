// reads: scripts/test-edit-gate.mjs, scripts/verify.mjs, AGENTS.md
// K62 (H8 of K51d): rule 2 as a check. A wave that deletes a test, skips it, drops or changes an assertion, raises a time
// limit or changes a snapshot must say so in its wave file under "## Changed expectations", one line per test with a reason.
// Each row builds a real Git repository in a temporary folder, commits a base, branches `wave/T1`, edits, and runs the gate.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const GATE = join(root, 'scripts', 'test-edit-gate.mjs');
const temps: string[] = [];
afterAll(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }); });

const BASE_TEST = [
  "import { describe, expect, it } from 'vitest';",
  "describe('maths', () => {",
  "  it('adds', () => { expect(add(1, 2)).toBe(3); expect(add(0, 0)).toBe(0); });",
  "  it('subtracts', { timeout: 30000 }, () => { expect(sub(3, 1)).toBe(2); });",
  "  it.skipIf(process.platform === 'win32')('quotes', () => { expect(quote('a')).toBe('a'); });",
  '});',
  ''
].join('\n');

const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
function world(files: Record<string, string> = { 'tests/a.test.ts': BASE_TEST, 'waves/T1.md': '# T1\n' }, branch = 'wave/T1') {
  const dir = mkdtempSync(join(tmpdir(), 'k62-'));
  temps.push(dir);
  git(dir, 'init', '-q', '-b', 'master');
  for (const [path, text] of Object.entries(files)) { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'base');
  if (branch !== 'master') git(dir, 'checkout', '-q', '-b', branch);
  return dir;
}
const change = (dir: string, files: Record<string, string | null>) => {
  for (const [path, text] of Object.entries(files)) {
    if (text === null) rmSync(join(dir, path)); else { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); }
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'wave');
};
interface Flag { readonly kind: string; readonly key: string; readonly listed: boolean; readonly listable: boolean; readonly detail: string }
interface Report { readonly applied: boolean; readonly ok: boolean; readonly flags: Flag[]; readonly unlisted: Flag[]; readonly refused?: string; readonly text: string }
function gate(dir: string, extra: string[] = []): { readonly status: number | null; readonly report: Report; readonly out: string } {
  const run = spawnSync(process.execPath, [GATE, '--repo', dir, '--json', ...extra], { encoding: 'utf8', timeout: 60000 });
  return { status: run.status, report: JSON.parse(run.stdout) as Report, out: `${run.stdout}${run.stderr}` };
}
const listing = (...lines: string[]) => `# T1\n\n## Changed expectations\n\n${lines.join('\n')}\n`;

describe('K62: the test-edit gate', () => {
  it('1. no test changed: applied, nothing flagged, exit 0', () => {
    const dir = world();
    change(dir, { 'packages/x.ts': 'export const x = 1;\n' });
    const { status, report } = gate(dir);
    expect(status).toBe(0);
    expect(report).toMatchObject({ applied: true, ok: true, flags: [] });
  });

  it('2. new tests, new files and added assertions are never flagged', () => {
    const dir = world();
    change(dir, {
      'tests/a.test.ts': BASE_TEST.replace("expect(add(0, 0)).toBe(0); });", "expect(add(0, 0)).toBe(0); expect(add(2, 2)).toBe(4); });") + "it('new', () => { expect(1).toBe(1); });\n",
      'tests/b.test.ts': "import { it, expect } from 'vitest';\nit('b', () => { expect(2).toBe(2); });\n"
    });
    expect(gate(dir).report.flags).toEqual([]);
  });

  it('3. a removed test is flagged and unlisted: exit 1, and the text says the exact line to add', () => {
    const dir = world();
    change(dir, { 'tests/a.test.ts': BASE_TEST.replace(/ {2}it\('subtracts'.*\n/, '') });
    const { status, report, out } = gate(dir);
    expect(status).toBe(1);
    expect(report.flags.map(flag => [flag.kind, flag.key])).toEqual([['test-removed', 'a.test.ts::subtracts']]);
    expect(report.unlisted).toHaveLength(1);
    expect(out).toContain('## Changed expectations');
    expect(out).toContain('waves/T1.md');
    expect(out).toContain('- a.test.ts::subtracts — ');
  });

  it('4. the same removal listed in the wave file with a reason passes', () => {
    const dir = world();
    change(dir, { 'tests/a.test.ts': BASE_TEST.replace(/ {2}it\('subtracts'.*\n/, ''), 'waves/T1.md': listing('- a.test.ts::subtracts — folded into adds, which now asserts the same difference') });
    const { status, report } = gate(dir);
    expect(status).toBe(0);
    expect(report.flags[0]).toMatchObject({ kind: 'test-removed', listed: true });
    expect(report.unlisted).toEqual([]);
  });

  it('5. a changed expected value is flagged as an assertion changed, showing the old line', () => {
    const dir = world();
    change(dir, { 'tests/a.test.ts': BASE_TEST.replace('expect(add(1, 2)).toBe(3)', 'expect(add(1, 2)).toBe(4)') });
    const { report } = gate(dir);
    expect(report.flags.map(flag => [flag.kind, flag.key])).toEqual([['assertion-changed', 'a.test.ts::adds']]);
    expect(report.flags[0]!.detail).toContain('expect(add(1, 2)).toBe(3)');
  });

  it('6. a dropped assertion is flagged', () => {
    const dir = world();
    change(dir, { 'tests/a.test.ts': BASE_TEST.replace(' expect(add(0, 0)).toBe(0);', '') });
    expect(gate(dir).report.flags.map(flag => flag.kind)).toEqual(['assertion-changed']);
  });

  it('7. a newly skipped test is flagged; a skip already there is not', () => {
    const dir = world();
    change(dir, { 'tests/a.test.ts': BASE_TEST.replace("it('adds'", "it.skip('adds'") });
    expect(gate(dir).report.flags.map(flag => [flag.kind, flag.key])).toEqual([['test-skipped', 'a.test.ts::adds']]);
    const untouched = world();
    change(untouched, { 'tests/a.test.ts': BASE_TEST.replace("expect(add(1, 2)).toBe(3);", "expect(add(1, 2)).toBe(3); expect(add(5, 5)).toBe(10);") });
    expect(gate(untouched).report.flags).toEqual([]);
  });

  it('8. a new test that is skipped on a system is flagged too (name it in the wave file)', () => {
    const dir = world();
    change(dir, { 'tests/a.test.ts': `${BASE_TEST}it.skipIf(process.platform === 'win32')('new guard', () => { expect(1).toBe(1); });\n` });
    expect(gate(dir).report.flags.map(flag => [flag.kind, flag.key])).toEqual([['test-skipped', 'a.test.ts::new guard']]);
  });

  it('9. .only is a hard error even when listed, and is never listable', () => {
    const dir = world();
    change(dir, { 'tests/a.test.ts': BASE_TEST.replace("it('adds'", "it.only('adds'"), 'waves/T1.md': listing('- a.test.ts::adds — focusing while I work, honest') });
    const { status, report } = gate(dir);
    expect(status).toBe(1);
    expect(report.flags.find(flag => flag.kind === 'only')).toMatchObject({ listable: false });
  });

  it('10. a raised time limit is flagged; a lowered one is not', () => {
    const dir = world();
    change(dir, { 'tests/a.test.ts': BASE_TEST.replace('timeout: 30000', 'timeout: 60000') });
    expect(gate(dir).report.flags.map(flag => [flag.kind, flag.key])).toEqual([['timeout-raised', 'a.test.ts::subtracts']]);
    const lowered = world();
    change(lowered, { 'tests/a.test.ts': BASE_TEST.replace('timeout: 30000', 'timeout: 10000') });
    expect(gate(lowered).report.flags).toEqual([]);
  });

  it('11. a deleted test file, a changed snapshot and a changed limit file are each flagged by path', () => {
    const dir = world({ 'tests/a.test.ts': BASE_TEST, 'tests/a.snapshot.json': '[1]\n', 'scripts/test-timeout.mjs': 'export const a = 1;\n', 'waves/T1.md': '# T1\n' });
    change(dir, { 'tests/a.test.ts': null, 'tests/a.snapshot.json': '[2]\n', 'scripts/test-timeout.mjs': 'export const a = 2;\n' });
    expect(gate(dir).report.flags.map(flag => [flag.kind, flag.key]).sort()).toEqual([['file-deleted', 'tests/a.test.ts'], ['limit-changed', 'scripts/test-timeout.mjs'], ['snapshot-changed', 'tests/a.snapshot.json']]);
  });

  it('12. reformatting alone changes nothing: whitespace and line breaks inside an assertion are not edits', () => {
    const dir = world();
    change(dir, { 'tests/a.test.ts': BASE_TEST.replace('expect(add(1, 2)).toBe(3);', 'expect(add(1, 2))\n      .toBe(3);') });
    expect(gate(dir).report.flags).toEqual([]);
  });

  it('13. a flag with no wave file, or a wave file with no section, fails and names what to write', () => {
    const dir = world({ 'tests/a.test.ts': BASE_TEST }, 'wave/T9');
    change(dir, { 'tests/a.test.ts': BASE_TEST.replace(/ {2}it\('subtracts'.*\n/, '') });
    const missing = gate(dir);
    expect(missing.status).toBe(1);
    expect(missing.out).toContain('waves/T9.md');
    const bare = world();
    change(bare, { 'tests/a.test.ts': BASE_TEST.replace(/ {2}it\('subtracts'.*\n/, ''), 'waves/T1.md': '# T1\n\nno section here\n' });
    expect(gate(bare).status).toBe(1);
  });

  it('14. a listing for one test does not cover another, and a listing with no reason does not count', () => {
    const dir = world();
    change(dir, {
      'tests/a.test.ts': BASE_TEST.replace(/ {2}it\('subtracts'.*\n/, '').replace("it('adds'", "it.skip('adds'"),
      'waves/T1.md': listing('- a.test.ts::adds', '- a.test.ts::quotes — not this one')
    });
    const { report } = gate(dir);
    expect(report.unlisted.map(flag => flag.key).sort()).toEqual(['a.test.ts::adds', 'a.test.ts::subtracts']);
  });

  it('15. not a wave branch: not applied, said plainly, exit 0', () => {
    const dir = world({ 'tests/a.test.ts': BASE_TEST }, 'master');
    const { status, report, out } = gate(dir);
    expect(status).toBe(0);
    expect(report.applied).toBe(false);
    expect(out).toContain('not a wave branch');
  });

  it('16. no master to compare with is a named refusal, exit 2, never a pass', () => {
    const dir = world({ 'tests/a.test.ts': BASE_TEST }, 'wave/T1');
    git(dir, 'branch', '-m', 'master', 'trunk');
    const { status, report } = gate(dir);
    expect(status).toBe(2);
    expect(report.refused).toBe('no-base');
  });

  it('17. --wave and --base name the comparison explicitly', () => {
    const dir = world({ 'tests/a.test.ts': BASE_TEST, 'waves/Q7.md': listing('- a.test.ts::subtracts — moved to the new file') }, 'topic');
    change(dir, { 'tests/a.test.ts': BASE_TEST.replace(/ {2}it\('subtracts'.*\n/, '') });
    const { status, report } = gate(dir, ['--wave', 'Q7', '--base', 'master']);
    expect(status).toBe(0);
    expect(report.applied).toBe(true);
  });

  it('19. a title holding backticks is matched by the line that lists it (K69: eight such titles read as unlisted)', () => {
    const title = 'refuses a `git` filter command — the alias lands inside the tree';
    const dir = world({ 'tests/a.test.ts': BASE_TEST + `it('${title}', () => { expect(1).toBe(1); });\n`, 'waves/T1.md': '# T1\n' });
    change(dir, { 'tests/a.test.ts': BASE_TEST, 'waves/T1.md': listing(`- a.test.ts::${title} — moved into a table`) });
    const { status, report } = gate(dir);
    expect(status).toBe(0);
    expect(report.flags[0]).toMatchObject({ kind: 'test-removed', listed: true });
  });

  it('18. verify runs the gate before any step, and the rulebook names the section', () => {
    const verify = execFileSync(process.execPath, ['-e', "process.stdout.write(require('fs').readFileSync(process.argv[1], 'utf8'))", join(root, 'scripts', 'verify.mjs')], { encoding: 'utf8' });
    expect(verify).toContain('test-edit-gate');
    expect(verify.indexOf('test-edit-gate')).toBeLessThan(verify.indexOf('const steps ='));
    const rules = execFileSync(process.execPath, ['-e', "process.stdout.write(require('fs').readFileSync(process.argv[1], 'utf8'))", join(root, 'AGENTS.md')], { encoding: 'utf8' });
    expect(rules).toContain('Changed expectations');
  });
});
