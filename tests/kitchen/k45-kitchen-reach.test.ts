// reads: scripts/verify.mjs, scripts/suite.mjs, tests/kitchen/
// K45: verify runs the kitchen tests a change can reach. Every kitchen test
// declares its inputs in a header line; scripts/suite.mjs
// kitchenTestFilesForPaths turns a diff into the files to run, and verify
// passes them to the suite, records them and refuses an empty selection.
// This file pins the guard (every file declares), the map's fail-closed
// edges, the representative selections, and verify's use of it end to end in
// a fake repository. Nothing touches the real .kitchen/runs.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const temps: string[] = [];
const temp = () => { const dir = mkdtempSync(join(tmpdir(), 'kitchen-k45-')); temps.push(dir); return dir; };
afterAll(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }); });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const probe = (expression: string): Json => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `import * as s from './scripts/suite.mjs'; console.log(JSON.stringify(${expression}));`], { cwd: root, encoding: 'utf8', timeout: 30000 }));
const select = (paths: string[] | null, rootDir = '.'): Json => probe(`s.kitchenTestFilesForPaths(${JSON.stringify(paths)}, ${JSON.stringify(rootDir)})`);
// The header a fixture file carries, built so no line of THIS file starts with it.
const header = (entries: string) => ['//', ' reads: ', entries, '\n'].join('');

// The guard enumerates the directory itself — a list written from memory
// misses a file (BT22) — and reads each file's header the way suite.mjs does.
function undeclared(directory: string): string[] {
  const missing: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path, `${prefix}${name}/`);
      else if (name.endsWith('.test.ts') && !/^\/\/ reads: *\S/m.test(readFileSync(path, 'utf8'))) missing.push(`${prefix}${name}`);
    }
  };
  walk(directory, '');
  return missing;
}

describe('every kitchen test declares what it reads', () => {
  it('no file under tests/kitchen lacks a reads header, and suite.mjs sees the same files', () => {
    const directory = join(root, 'tests', 'kitchen');
    expect(undeclared(directory)).toEqual([]);
    const listed = readdirSync(directory).filter(name => name.endsWith('.test.ts')).sort();
    const declared: Json[] = probe(`s.kitchenDeclarations('.')`);
    expect(declared.map(item => item.file)).toEqual(listed);
    for (const item of declared) expect(item.reads.length, item.file).toBeGreaterThan(0);
    expect(probe(`s.kitchenReach('.').undeclared`)).toEqual([]);
  });

  it('the guard fails on a file that declares nothing — and the map runs that file for every change', () => {
    const dir = temp();
    mkdirSync(join(dir, 'tests', 'kitchen'), { recursive: true });
    writeFileSync(join(dir, 'tests', 'kitchen', 'a-waves.test.ts'), `${header('waves/')}export {};\n`);
    writeFileSync(join(dir, 'tests', 'kitchen', 'b-silent.test.ts'), '// a comment, but no inputs\nexport {};\n');
    expect(undeclared(join(dir, 'tests', 'kitchen'))).toEqual(['b-silent.test.ts']);
    expect(probe(`s.kitchenReach(${JSON.stringify(dir)}).undeclared`)).toEqual(['b-silent.test.ts']);
    const wave = select(['waves/K1.md'], dir);
    expect(wave.files).toEqual(['a-waves.test.ts', 'b-silent.test.ts']);
    expect(wave.reason).toContain('declare no inputs');
    // Even a diff no declaration reaches still runs the undeclared file.
    expect(select(['docs/note.md'], dir).files).toEqual(['b-silent.test.ts']);
  });

  it('every declared exact path exists and is not inert — a typo or a dead entry would under-run', () => {
    const declared: Json[] = probe(`s.kitchenDeclarations('.')`);
    const exact = [...new Set(declared.flatMap(item => item.reads as string[]).filter(entry => !entry.includes('*') && !entry.endsWith('/') && !entry.startsWith('@')))].sort();
    expect(exact.length).toBeGreaterThan(5);
    for (const entry of exact) expect(existsSync(join(root, entry)), entry).toBe(true);
    const inert: boolean[] = probe(`${JSON.stringify(exact)}.map(path => s.isInert(path))`);
    expect(exact.filter((_, index) => inert[index])).toEqual([]);
  });

  it('every path verify counts as a kitchen input is declared by some file — the reach map and the declarations agree', () => {
    const inputs: string[] = probe(`(await import('./scripts/kitchen-stats.mjs')).LIVE_RULE_FILES.concat(s.KITCHEN_TEST_READS, ['waves/K99.md', 'kitchen/roles/worker.md', 'kitchen/stations/evidence.md'])`);
    expect(inputs.length).toBeGreaterThan(10);
    for (const path of inputs) {
      const picked = select([path]);
      expect(picked.files.length, path).toBeGreaterThan(0);
      expect(picked.reason, path).not.toContain('unmapped');
    }
  });
});

describe('kitchenTestFilesForPaths — the representative diffs', () => {
  const total = readdirSync(join(root, 'tests', 'kitchen')).filter(name => name.endsWith('.test.ts')).length;

  it('a wave file selects only the files that read waves/ — at most two', () => {
    const picked = select(['waves/K45.md']);
    expect(picked.files).toEqual(['k15-sandbox-guard.test.ts', 'kitchen-stats.test.ts']);
    expect(picked.total).toBe(total);
    expect(picked.reason).toContain('waves/K45.md');
  });

  it('a bounty package change selects the demo/CLI files, not the verify meta-tests', () => {
    const picked = select(['packages/box-bounty/look.ts']);
    for (const file of ['k16-record.test.ts', 'k19-github-standin.test.ts', 'k12-bounty-parallel.test.ts']) expect(picked.files).toContain(file);
    for (const file of ['verify-reuse.test.ts', 'k36-brief-check.test.ts']) expect(picked.files).not.toContain(file);
  });

  it('a verify.mjs or suite.mjs change selects verify-reuse and the stats tests that read it', () => {
    for (const path of ['scripts/verify.mjs', 'scripts/suite.mjs']) {
      const picked = select([path]);
      for (const file of ['verify-reuse.test.ts', 'k37-load-stats.test.ts', 'k6-scope-budget.test.ts']) expect(picked.files, path).toContain(file);
      expect(picked.files.length, path).toBeLessThan(total);
    }
    // suite.mjs imports kitchen-stats.mjs: a stats change reaches every file that runs suite.mjs.
    expect(select(['scripts/kitchen-stats.mjs']).files).toContain('verify-reuse.test.ts');
  });

  it('fails closed: an unmapped path, a runner path and an unreadable diff select every file', () => {
    const unmapped = select(['scripts/unknown.mjs']);
    expect(unmapped.files.length).toBe(total);
    expect(unmapped.reason).toContain('scripts/unknown.mjs is declared by no kitchen file (unmapped)');
    const mixed = select(['waves/K45.md', 'some-new-dir/thing.ts']);
    expect(mixed.files.length).toBe(total);
    for (const path of ['package.json', 'scripts/vitest.config.mjs', 'pnpm-lock.yaml']) {
      const runner = select([path]);
      expect(runner.files.length, path).toBe(total);
      expect(runner.reason, path).toContain('suite runner');
    }
    const unreadable = select(null);
    expect(unreadable.files.length).toBe(total);
    expect(unreadable.reason).toContain('cannot be read');
  });

  it('an inert-only or empty diff selects nothing — which verify refuses rather than passes', () => {
    for (const paths of [['docs/box-v4/PLAN.md'], ['kitchen/demo/RECORDING.md'], []]) {
      const picked = select(paths);
      expect(picked.files, JSON.stringify(paths)).toEqual([]);
      expect(picked.total).toBe(total);
    }
  });

  it('--full selects every file', () => {
    const full = probe(`s.selectKitchenFiles('.', { full: true })`);
    expect(full.files.length).toBe(total);
    expect(full.reason).toBe('--full');
  });
});

describe('verify runs, records and refuses the selection (end to end)', () => {
  it('passes the selected files, labels the run, reuses only a covering PASS, and refuses an empty selection', () => {
    // A fake repository running the real scripts, as in verify-reuse.test.ts,
    // with a pnpm stub that forwards extra arguments and a test:kitchen that
    // writes down what it was asked to run.
    const dir = temp();
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    for (const name of readdirSync(join(root, 'scripts'))) {
      if (name.endsWith('.mjs') || name === 'toolchain.json') copyFileSync(join(root, 'scripts', name), join(dir, 'scripts', name));
    }
    const pnpmBin = join(dir, 'scripts', 'tooling', 'node_modules', 'pnpm', 'bin');
    mkdirSync(pnpmBin, { recursive: true });
    writeFileSync(join(pnpmBin, 'pnpm.cjs'), "const { spawnSync } = require('child_process');\nconst { readFileSync } = require('fs');\nconst { join } = require('path');\nconst scripts = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).scripts;\nconst at = process.argv.indexOf('run') + 1;\nconst command = scripts[process.argv[at]];\nif (!command) process.exit(2);\nconst extra = process.argv.slice(at + 1).map(arg => JSON.stringify(arg)).join(' ');\nprocess.exit(spawnSync(`${command} ${extra}`, { shell: true, stdio: 'inherit', cwd: process.cwd() }).status ?? 1);\n");
    const asked = join(dir, 'asked.json');
    writeFileSync(join(dir, 'record-args.cjs'), `require('fs').writeFileSync(${JSON.stringify(asked)}, JSON.stringify({ args: process.argv.slice(2), label: process.env.KITCHEN_SELECTION ?? null }));\n`);
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fake-repo', private: true, scripts: { 'test:kitchen': 'node record-args.cjs' } }));
    writeFileSync(join(dir, '.gitignore'), '.kitchen/\nasked.json\n');
    mkdirSync(join(dir, 'tests', 'kitchen'), { recursive: true });
    writeFileSync(join(dir, 'tests', 'kitchen', 'a-waves.test.ts'), `${header('waves/')}export {};\n`);
    writeFileSync(join(dir, 'tests', 'kitchen', 'b-other.test.ts'), `${header('other/')}export {};\n`);
    const gitDir = dir.replace(/[\\/]+$/, '').replaceAll(String.fromCharCode(92), '/');
    const git = (args: string[]) => execFileSync('git', ['-c', `safe.directory=${gitDir}`, '-c', 'user.email=kitchen@test.invalid', '-c', 'user.name=kitchen', ...args], { cwd: dir, encoding: 'utf8' }).trim();
    const commit = (path: string) => { const parts = path.split('/'); mkdirSync(join(dir, ...parts.slice(0, -1)), { recursive: true }); writeFileSync(join(dir, ...parts), 'x\n'); git(['add', '-A']); git(['commit', '-qm', path]); };
    git(['init', '-q', '-b', 'master']);
    git(['add', '-A']);
    git(['commit', '-qm', 'init']);
    const verify = (extra: string[] = []) => spawnSync(process.execPath, [join(dir, 'scripts', 'verify.mjs'), '--only', '--db=none', ...extra, 'test:kitchen'], { cwd: dir, encoding: 'utf8', timeout: 120000 });
    const runsDir = join(dir, '.kitchen', 'runs');
    const names = () => new Set(existsSync(runsDir) ? readdirSync(runsDir) : []);
    const latestRun = (before: Set<string>) => readdirSync(runsDir).find(name => !before.has(name))!;
    const summary = (name: string): Json => JSON.parse(readFileSync(join(runsDir, name, 'summary.json'), 'utf8'));
    const lastAsked = (): Json => JSON.parse(readFileSync(asked, 'utf8'));

    // A wave file alone: one of the two files runs, named in every record.
    git(['checkout', '-q', '-b', 'wave']);
    commit('waves/K1.md');
    let before = names();
    const narrow = verify();
    expect(narrow.status, `${narrow.stdout}${narrow.stderr}`).toBe(0);
    expect(lastAsked().args).toEqual(['tests/kitchen/a-waves.test.ts']);
    expect(lastAsked().label).toBe('selected: 1 of 2 kitchen files, these files declare the changed paths (waves/K1.md)');
    const narrowRun = latestRun(before);
    const narrowSummary = summary(narrowRun);
    expect(narrowSummary.kitchenSelected).toEqual(['a-waves.test.ts']);
    expect(narrowSummary.kitchenReason).toBe('selected: 1 of 2 kitchen files, these files declare the changed paths (waves/K1.md)');
    expect(narrowSummary.line).toContain('test:kitchen=0(selected 1 of 2 kitchen files)');
    expect(narrow.stdout).toContain('test:kitchen selected: 1 of 2 kitchen files');

    // --full on the same commit wants both files: the narrow PASS cannot stand in.
    before = names();
    const full = verify(['--full']);
    expect(full.status, `${full.stdout}${full.stderr}`).toBe(0);
    const fullRun = latestRun(before);
    const fullStep = summary(fullRun).steps.find((step: Json) => step.name === 'test:kitchen');
    expect(fullStep.reused).toBeUndefined();
    expect(lastAsked().args).toEqual([]); // every file: the plain suite run
    expect(summary(fullRun).kitchenSelected).toEqual(['a-waves.test.ts', 'b-other.test.ts']);
    expect(summary(fullRun).kitchenReason).toBe('selected: 2 of 2 kitchen files, --full');

    // The wide PASS stands in for the narrow selection on the same commit.
    before = names();
    const again = verify();
    expect(again.status).toBe(0);
    const againStep = summary(latestRun(before)).steps.find((step: Json) => step.name === 'test:kitchen');
    expect(againStep.reused).toBe(fullRun);
    expect(summary(latestRun(before)).line).toContain(`test:kitchen=reused@${fullRun}(selected 1 of 2 kitchen files)`);

    // An unmapped path selects every file.
    commit('elsewhere/new.ts');
    before = names();
    const unmapped = verify();
    expect(unmapped.status).toBe(0);
    expect(lastAsked().args).toEqual([]);
    expect(summary(latestRun(before)).kitchenReason).toContain('elsewhere/new.ts is declared by no kitchen file (unmapped), so every file runs');

    // A docs-only branch reaches no kitchen file: refused before any run record.
    git(['checkout', '-q', 'master']);
    git(['checkout', '-q', '-b', 'docs-only']);
    commit('docs/note.md');
    before = names();
    const refused = verify();
    expect(refused.status).toBe(2);
    expect(refused.stderr).toContain('test:kitchen refused — selected: 0 of 2 kitchen files, no kitchen file declares a changed path (docs/note.md)');
    expect(names()).toEqual(before);
  }, 180000);
});
