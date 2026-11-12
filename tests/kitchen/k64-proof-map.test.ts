// reads: scripts/proof-map.mjs, docs/box-v4/CONTRACTS.md, kitchen/reviews/proof-gaps.json, tests/, scripts/suite.mjs
// K64 (H2 of K51d): the proof map as a check. Every guarantee in docs/box-v4/CONTRACTS.md has an id (C1, P1, ...); a test says which
// it proves with a comment line `// @guards P1 R3` directly above it. `node scripts/proof-map.mjs --check` fails when a hard-stop
// guarantee has no test, an annotation names an id CONTRACTS does not have, an annotation hangs above nothing, a guarantee with no
// test is not on the untagged list, or a listed one has since been tagged (the list only shrinks).
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const SCRIPT = join(repoRoot, 'scripts', 'proof-map.mjs');
const temps: string[] = [];
afterAll(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }); });

const CONTRACTS = [
  '# Contracts',
  '',
  '## create',
  '',
  '**Guarantees.**',
  '- C1. No never-ship file enters the draft (`snapshot.ts`) — hard stop 1, create side.',
  '- C2. Links resolving outside the repository are refused.',
  '',
  '## post',
  '',
  '**Guarantees.**',
  '- P1. A private repository is never posted outside — hard stop 2.',
  '- PY1. The amount comes only from the owner.',
  ''
].join('\n');

interface Map { readonly ok: boolean; readonly problems: { readonly kind: string; readonly id?: string; readonly detail: string }[]; readonly guarantees: { readonly id: string; readonly hardStop: string | null; readonly tests: { readonly file: string; readonly title: string }[] }[]; readonly text: string }
function world(files: Record<string, string>, gaps: string[] | null = []) {
  const dir = mkdtempSync(join(tmpdir(), 'k64-'));
  temps.push(dir);
  const all: Record<string, string> = { 'docs/box-v4/CONTRACTS.md': CONTRACTS, ...files };
  if (gaps !== null) all['kitchen/reviews/proof-gaps.json'] = JSON.stringify({ untagged: gaps });
  for (const [path, text] of Object.entries(all)) { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); }
  return dir;
}
function check(dir: string, extra: string[] = []): { readonly status: number | null; readonly map: Map; readonly out: string } {
  const run = spawnSync(process.execPath, [SCRIPT, '--root', dir, '--json', ...extra], { encoding: 'utf8', timeout: 60000 });
  return { status: run.status, map: JSON.parse(run.stdout) as Map, out: `${run.stdout}${run.stderr}` };
}
const testFile = (...blocks: string[]) => `import { it } from 'vitest';\n${blocks.join('\n')}\n`;

describe('K64: the proof map', () => {
  it('1. reads every guarantee id and its hard-stop label from CONTRACTS', () => {
    const { map } = check(world({}, ['C1', 'C2', 'P1', 'PY1']));
    expect(map.guarantees.map(guarantee => [guarantee.id, guarantee.hardStop])).toEqual([['C1', '1'], ['C2', null], ['P1', '2'], ['PY1', null]]);
  });

  it('2. an annotation attaches to the test directly below it: several ids, stacked comment lines, a skipIf and a template title', () => {
    const dir = world({
      'tests/a.test.ts': testFile(
        "// @guards C1 P1",
        "it('removes a secret', () => {});",
        "// why this one matters",
        "// @guards C2",
        "// @guards PY1",
        "it.skipIf(process.platform === 'win32')(`quoted names`, () => {});",
        "it('not annotated', () => {});"
      )
    }, []);
    const { map } = check(dir);
    const tests = (id: string) => map.guarantees.find(guarantee => guarantee.id === id)!.tests.map(test => test.title);
    expect(tests('C1')).toEqual(['removes a secret']);
    expect(tests('P1')).toEqual(['removes a secret']);
    expect(tests('C2')).toEqual(['quoted names']);
    expect(tests('PY1')).toEqual(['quoted names']);
  });

  it('3. all guarantees tagged and the hard stops covered: ok, exit 0', () => {
    const dir = world({ 'tests/a.test.ts': testFile('// @guards C1 C2', "it('a', () => {});", '// @guards P1 PY1', "it('b', () => {});") }, []);
    const { status, map } = check(dir, ['--check']);
    expect(status).toBe(0);
    expect(map.ok).toBe(true);
  });

  it('4. an annotation naming an id CONTRACTS does not have fails, naming it', () => {
    const dir = world({ 'tests/a.test.ts': testFile('// @guards C1 P9', "it('a', () => {});") }, ['C2', 'P1', 'PY1']);
    const { status, map } = check(dir, ['--check']);
    expect(status).toBe(1);
    expect(map.problems).toContainEqual(expect.objectContaining({ kind: 'unknown-id', id: 'P9' }));
  });

  it('5. an annotation with no test below it fails (a typo above a blank line would otherwise vouch for nothing)', () => {
    const dir = world({ 'tests/a.test.ts': testFile('// @guards C1', '', "const x = 1;", "it('a', () => {});") }, ['C2', 'P1', 'PY1']);
    const { status, map } = check(dir, ['--check']);
    expect(status).toBe(1);
    expect(map.problems.map(problem => problem.kind)).toContain('dangling');
  });

  it('6. a hard-stop guarantee with no test fails even when it is on the untagged list', () => {
    const dir = world({ 'tests/a.test.ts': testFile('// @guards C2 PY1', "it('a', () => {});") }, ['C1', 'P1']);
    const { status, map } = check(dir, ['--check']);
    expect(status).toBe(1);
    expect(map.problems.filter(problem => problem.kind === 'hard-stop-untested').map(problem => problem.id).sort()).toEqual(['C1', 'P1']);
  });

  it('7. a guarantee with no test that is not on the untagged list fails; on the list it passes', () => {
    const tests = testFile('// @guards C1 P1', "it('a', () => {});");
    const unlisted = check(world({ 'tests/a.test.ts': tests }, ['C2']), ['--check']);
    expect(unlisted.status).toBe(1);
    expect(unlisted.map.problems).toContainEqual(expect.objectContaining({ kind: 'untagged-not-listed', id: 'PY1' }));
    expect(check(world({ 'tests/a.test.ts': tests }, ['C2', 'PY1']), ['--check']).status).toBe(0);
  });

  it('8. the list only shrinks: a listed guarantee that now has a test, or is unknown, fails', () => {
    const dir = world({ 'tests/a.test.ts': testFile('// @guards C1 C2 P1 PY1', "it('a', () => {});") }, ['C2', 'ZZ9']);
    const { status, map } = check(dir, ['--check']);
    expect(status).toBe(1);
    expect(map.problems.map(problem => [problem.kind, problem.id])).toEqual(expect.arrayContaining([['gap-now-tagged', 'C2'], ['gap-unknown', 'ZZ9']]));
  });

  it('9. no CONTRACTS file, or no guarantees in it, is a refusal and never a pass', () => {
    const dir = mkdtempSync(join(tmpdir(), 'k64-'));
    temps.push(dir);
    const run = spawnSync(process.execPath, [SCRIPT, '--root', dir, '--check'], { encoding: 'utf8', timeout: 60000 });
    expect(run.status).toBe(2);
    expect(`${run.stdout}${run.stderr}`).toContain('CONTRACTS');
  });

  it('10. this repository: every hard-stop guarantee has at least one test, every id is real, the untagged list is exact', () => {
    const run = spawnSync(process.execPath, [SCRIPT, '--root', repoRoot, '--json', '--check'], { encoding: 'utf8', timeout: 120000 });
    const map = JSON.parse(run.stdout) as Map;
    expect(map.problems, run.stdout).toEqual([]);
    expect(run.status).toBe(0);
    const hard = map.guarantees.filter(guarantee => guarantee.hardStop !== null);
    expect(hard.length).toBeGreaterThanOrEqual(8);
    for (const guarantee of hard) expect(guarantee.tests.length, `${guarantee.id} has a test`).toBeGreaterThan(0);
  });

  it('11. the hosted workflow and the kitchen reach list know the two files this check reads', () => {
    const probe = spawnSync(process.execPath, ['--input-type=module', '-e', "import * as s from './scripts/suite.mjs'; console.log(JSON.stringify(s.KITCHEN_TEST_READS));"], { cwd: repoRoot, encoding: 'utf8' });
    const reads = JSON.parse(probe.stdout) as string[];
    expect(reads).toContain('docs/box-v4/CONTRACTS.md');
    expect(reads).toContain('kitchen/reviews/proof-gaps.json');
  });
});
