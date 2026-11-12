// reads: scripts/guard-audit.mjs, scripts/proof-map.mjs, kitchen/reviews/guard-breaks.json, packages/box-bounty/, packages/box-platform/, tests/, docs/box-v4/CONTRACTS.md
// K66 (H3 of K51d): the hard stops, broken on purpose. `node scripts/guard-audit.mjs` breaks the code one place at a time in a
// throwaway worktree (the break table is kitchen/reviews/guard-breaks.json) and runs the tests named for each break: a break
// must turn at least one of them red, or a guarantee has a test that passes on broken code. Each row builds a small real
// repository (a source file, a test, a vitest config), commits it, and audits it; the real code's break table is checked
// statically here (every find text present exactly once, every hard-stop guarantee has a break) and run by hand.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const AUDIT = join(repoRoot, 'scripts', 'guard-audit.mjs');
const VITEST = join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs');
const temps: string[] = [];
afterAll(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }); });

const SOURCE = "export const refuse = (kind: string): boolean => kind === 'private' || kind === 'secret';\nexport const note = 'x';\n";
const TEST = [
  "import { expect, it } from 'vitest';",
  "import { refuse } from '../src/a';",
  "it('refuses private', () => { expect(refuse('private')).toBe(true); });",
  "it('refuses secret', () => { expect(refuse('secret')).toBe(true); });",
  "it('lets the ordinary through', () => { expect(refuse('plain')).toBe(false); });",
  ''
].join('\n');
const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', `safe.directory=${cwd.replaceAll('\\', '/')}`, '-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });

function world(breaks: unknown[]) {
  const dir = mkdtempSync(join(tmpdir(), 'k66-'));
  temps.push(dir);
  const files: Record<string, string> = { 'src/a.ts': SOURCE, 'tests/a.test.ts': TEST, 'vitest.config.mjs': "export default { test: { include: ['tests/**/*.test.ts'] } };\n", 'breaks.json': JSON.stringify({ breaks }) };
  for (const [path, text] of Object.entries(files)) { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); }
  git(dir, 'init', '-q', '-b', 'master');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'base');
  return dir;
}
interface Result { readonly id: string; readonly status: string; readonly failed: string[]; readonly detail: string }
function audit(dir: string, extra: string[] = []): { readonly status: number | null; readonly results: Result[]; readonly out: string } {
  const run = spawnSync(process.execPath, [AUDIT, '--root', dir, '--breaks', join(dir, 'breaks.json'), '--build', 'none', '--config', 'vitest.config.mjs', '--vitest', VITEST, '--modules', join(repoRoot, 'node_modules'), '--json', ...extra], { encoding: 'utf8', timeout: 300000 });
  let results: Result[] = [];
  try { results = (JSON.parse(run.stdout) as { results: Result[] }).results; } catch { /* the output says */ }
  return { status: run.status, results, out: `${run.stdout}${run.stderr}` };
}
const BREAK = (over: Record<string, unknown> = {}) => ({ id: 'b1', guarantees: ['P1'], file: 'src/a.ts', find: "kind === 'private' || ", replace: '', tests: ['tests/a.test.ts'], ...over });

describe('K66: the guard audit', () => {
  it('1. a break that turns a test red is "red", names the failing tests, and exits 0', () => {
    const { status, results } = audit(world([BREAK()]));
    expect(status).toBe(0);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: 'b1', status: 'red' });
    expect(results[0]!.failed).toEqual(['refuses private']);
  });

  it('2. a break no test notices is "silent", and the audit exits 1', () => {
    const { status, results } = audit(world([BREAK({ id: 'quiet', file: 'src/a.ts', find: "export const note = 'x';", replace: "export const note = 'y';" })]));
    expect(status).toBe(1);
    expect(results[0]).toMatchObject({ id: 'quiet', status: 'silent' });
  });

  it('3. a find text that is missing is "stale"; one that occurs twice without nth is "ambiguous"; nth picks one', () => {
    const dir = world([
      BREAK({ id: 'gone', find: 'text that is not there' }),
      BREAK({ id: 'twice', find: "kind === '", replace: "kind !== '" }),
      BREAK({ id: 'second', find: "kind === '", replace: "kind !== '", nth: 1 })
    ]);
    const { status, results } = audit(dir);
    expect(status).toBe(1);
    expect(results.map(result => [result.id, result.status])).toEqual([['gone', 'stale'], ['twice', 'ambiguous'], ['second', 'red']]);
  });

  it('4. the audited repository and the shared node_modules are untouched afterwards: clean tree, no worktree left, modules intact', () => {
    const dir = world([BREAK(), BREAK({ id: 'b2', find: "|| kind === 'secret'", replace: '' })]);
    audit(dir);
    expect(git(dir, 'status', '--porcelain')).toBe('');
    expect(git(dir, 'worktree', 'list').trim().split('\n')).toHaveLength(1);
    expect(readFileSync(join(dir, 'src', 'a.ts'), 'utf8')).toBe(SOURCE);
    expect(existsSync(join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs'))).toBe(true);
  });

  it('5. --only runs one break, and an unknown id is a refusal, exit 2', () => {
    const dir = world([BREAK(), BREAK({ id: 'b2', find: "|| kind === 'secret'", replace: '' })]);
    expect(audit(dir, ['--only', 'b2']).results.map(result => result.id)).toEqual(['b2']);
    expect(audit(dir, ['--only', 'nope']).status).toBe(2);
  });

  it('6. --check-breaks reads nothing but the table and the code: a stale find or a missing test file fails, exit 1', () => {
    const ok = world([BREAK()]);
    const good = spawnSync(process.execPath, [AUDIT, '--root', ok, '--breaks', join(ok, 'breaks.json'), '--check-breaks', '--json'], { encoding: 'utf8' });
    expect(good.status).toBe(0);
    const stale = world([BREAK({ find: 'not in the file' }), BREAK({ id: 'b2', tests: ['tests/missing.test.ts'] })]);
    const bad = spawnSync(process.execPath, [AUDIT, '--root', stale, '--breaks', join(stale, 'breaks.json'), '--check-breaks', '--json'], { encoding: 'utf8' });
    expect(bad.status).toBe(1);
    expect(bad.stdout).toContain('stale');
    expect(bad.stdout).toContain('missing.test.ts');
  });

  it('7. this repository: every hard-stop guarantee has a break, every break is current (find present once, test files exist and carry a tag for it)', () => {
    const run = spawnSync(process.execPath, [AUDIT, '--root', repoRoot, '--check-breaks', '--json'], { encoding: 'utf8', timeout: 120000 });
    const report = JSON.parse(run.stdout) as { ok: boolean; problems: { kind: string; detail: string }[]; breaks: number; hardStops: string[] };
    expect(report.problems, run.stdout).toEqual([]);
    expect(run.status).toBe(0);
    expect(report.hardStops.length).toBeGreaterThanOrEqual(8);
    expect(report.breaks).toBeGreaterThanOrEqual(report.hardStops.length);
  });
});
