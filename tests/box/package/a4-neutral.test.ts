import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exportBox, verifySubmission } from '../../../packages/box-package/index.js';
import type { ExportResult } from '../../../packages/box-package/index.js';
import { copyBox, fixtureCommit, fixtureGit, listFiles, ROOT, runRoot, runSubmitTool } from './support.js';

// A4 neutral-loop capability fixtures: an npm-style JavaScript project, a
// pure-Python project (no JavaScript project files) and a multi-package npm
// workspace carrying the real outside dependency picocolors@1.1.1. Each
// fixture is materialized into a disposable mini owner repository (the fixture
// subtree committed under the same sourceRoot spelling), exported with only
// declared setup/checks, and exercised end to end: red outcome on the
// untouched base, guard green, paired base/Box records, byte-preserved
// dependency files, excluded member absent, read-only seal refusal, and
// verify pass for an alternative-right candidate vs fail for no-op/wrong.
// Check authorship: written by the A4 cook before any recipient ran; no
// existing assertions were changed.

const HEAVY = 600_000;
const FIXTURES = join(ROOT, 'examples');

interface FixtureHandle { repo: string; baseCommit: string; agreementPath: string }

function a4Repo(name: string): FixtureHandle {
  const repo = join(runRoot(`a4-${name}`), 'owner-repo');
  const target = join(repo, 'examples', name);
  mkdirSync(target, { recursive: true });
  cpSync(join(FIXTURES, name), target, { recursive: true });
  writeFileSync(join(repo, '.gitattributes'), '* -text\n'); // pin bytes: the baseline hash binds blob bytes
  fixtureGit(repo, ['init', '-b', 'main']);
  const baseCommit = fixtureCommit(repo, `a4-${name}-owner-base`);
  const agreement = JSON.parse(readFileSync(join(target, 'box-agreements', 'request.json'), 'utf8')) as Record<string, unknown>;
  agreement.baseCommit = baseCommit;
  const agreementPath = join(runRoot('a4-agreement'), `${name}.json`);
  writeFileSync(agreementPath, JSON.stringify(agreement, null, 2));
  return { repo, baseCommit, agreementPath };
}

function exportFixture(fixture: FixtureHandle, label: string): ExportResult {
  return exportBox({ agreementPath: fixture.agreementPath, repoPath: fixture.repo, outDir: join(runRoot(`a4-${label}-out`), 'box') }); // no pnpm — the agreements need none
}

interface Manifest { baseChecks: Array<{ name: string; role: string; context: string; result: string; exit: number | null }>; paired: Array<{ name: string }>; files: Array<{ box: string }> }
const manifest = (dir: string): Manifest => JSON.parse(readFileSync(join(dir, 'box.json'), 'utf8')) as Manifest;

function sealed(fixture: FixtureHandle, label: string, edit?: (dir: string) => void) {
  const exported = exportFixture(fixture, label);
  const dir = copyBox(exported.outDir, `a4-${label}-box`);
  edit?.(dir);
  const run = runSubmitTool(dir);
  return { exported, dir, run };
}

// Harness-owned alternative-right candidates: deliberately different
// implementations from the obvious reference, written by the cook for proof
// only — recipient Boxes were exported untouched.
const ALT_RIGHT: Record<string, { path: string; content: string }> = {
  'a4-npm-cli': {
    path: 'src/paint.js',
    content: `const CODES = new Map([['red', 31], ['green', 32], ['blue', 34]]);\nexport function paint(text, color) {\n  if (typeof text !== 'string' || text.length === 0) return '';\n  const code = CODES.get(color);\n  return code === undefined ? text : String.fromCharCode(27) + '[' + code + 'm' + text + String.fromCharCode(27) + '[39m';\n}\n`
  },
  'a4-py-tools': {
    path: 'tools/slug.py',
    content: `import re\n\ndef slugify(text):\n    """Return a lowercase ASCII URL slug for the text."""\n    if not isinstance(text, str):\n        return ""\n    return re.sub(r"-{2,}", "-", re.sub(r"[^a-z0-9]+", "-", text.lower())).strip("-")\n`
  },
  'a4-multi-pkg': {
    path: 'packages/cli/bin.js',
    content: `import pc from 'picocolors';\nimport { banner } from '../core/index.js';\n\nprocess.stdout.write(pc.green(banner()) + String.fromCharCode(10));\n`
  }
};

function expectRedBasePaired(dir: string, outcomeName: string, guardName: string): void {
  const m = manifest(dir);
  const outcome = m.baseChecks.find(record => record.name === outcomeName);
  expect(outcome, JSON.stringify(m.baseChecks)).toMatchObject({ context: 'recipient', role: 'outcome', result: 'fail' });
  const guard = m.baseChecks.find(record => record.name === guardName);
  expect(guard).toMatchObject({ context: 'recipient', role: 'guard', result: 'pass', exit: 0 });
  expect(m.paired.map(pair => pair.name).sort()).toEqual([guardName, outcomeName].sort());
}

describe('A4 npm-JavaScript fixture (a4-npm-cli)', () => {
  it('exports only declared files and records a red paired outcome on the base', { timeout: HEAVY }, () => {
    const fixture = a4Repo('a4-npm-cli');
    const exported = exportFixture(fixture, 'npm');
    expect([...exported.files].sort()).toEqual([
      'README.md', 'box.json', 'box/submit.mjs', 'checks/guard.mjs', 'checks/outcome.mjs', 'package.json', 'src/paint.js'
    ]);
    const m = manifest(exported.outDir);
    expect(m.files.some(file => /tsconfig|pnpm-lock|node_modules/.test(file.box))).toBe(false);
    expectRedBasePaired(exported.outDir, 'box-cli-outcome', 'box-cli-guard');
    expect(m.baseChecks.find(record => record.name === 'cli-outcome')).toMatchObject({ context: 'owner', result: 'fail' });
    expect(m.baseChecks.find(record => record.name === 'cli-guard')).toMatchObject({ context: 'owner', result: 'pass' });
  });

  it('runs the declared checks in a clean directory and refuses read-only tamper', { timeout: HEAVY }, () => {
    const fixture = a4Repo('a4-npm-cli');
    const dir = copyBox(exportFixture(fixture, 'npm-clean').outDir, 'a4-npm-clean');
    const outcome = spawnSync('node', ['checks/outcome.mjs'], { cwd: dir, encoding: 'utf8' });
    expect(outcome.status).toBe(1); // red at base — the intended behavior is missing
    const guard = spawnSync('node', ['checks/guard.mjs'], { cwd: dir, encoding: 'utf8' });
    expect(guard.status).toBe(0);
    writeFileSync(join(dir, 'checks', 'outcome.mjs'), '// tampered read-only check\n');
    const refused = runSubmitTool(dir);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('read-only file checks/outcome.mjs was modified');
  });

  it('verifies an alternative-right seal and rejects no-op, wrong and deleted edits', { timeout: HEAVY }, () => {
    const fixture = a4Repo('a4-npm-cli');
    const verify = (dir: string) => verifySubmission({ submissionPath: join(dir, 'submission.json'), agreementPath: fixture.agreementPath, repoPath: fixture.repo, workRoot: runRoot('a4-npm-verify') });

    const right = sealed(fixture, 'npm-right', box => writeFileSync(join(box, 'src', 'paint.js'), ALT_RIGHT['a4-npm-cli']!.content));
    expect(right.run.status, right.run.stderr).toBe(0);
    const rightReport = verify(right.dir);
    expect(rightReport.verdict, JSON.stringify(rightReport.commandChecks ?? rightReport.checks)).toBe('pass');

    const noop = sealed(fixture, 'npm-noop');
    expect(noop.run.status).toBe(0);
    const noopReport = verify(noop.dir);
    expect(noopReport.verdict).toBe('fail');
    expect(noopReport.failureClass).toBe('implementation-failure');
    expect(noopReport.reason).toBe('command-check');

    const wrong = sealed(fixture, 'npm-wrong', box => writeFileSync(join(box, 'src', 'paint.js'), 'export function paint(text) { return "XX" + text; }\n'));
    const wrongReport = verify(wrong.dir);
    expect(wrongReport.verdict).toBe('fail');
    expect(wrongReport.failureClass).toBe('implementation-failure');

    const deleted = sealed(fixture, 'npm-deleted', box => rmSync(join(box, 'src', 'paint.js')));
    expect(deleted.run.status).toBe(1);
    expect(deleted.run.stderr).toContain('recorded file src/paint.js is missing');
  });
});

describe('A4 Python fixture (a4-py-tools)', () => {
  it('exports only declared files and records a red paired outcome on the base', { timeout: HEAVY }, () => {
    const fixture = a4Repo('a4-py-tools');
    const exported = exportFixture(fixture, 'py');
    expect([...exported.files].sort()).toEqual([
      'README.md', 'box.json', 'box/submit.mjs', 'checks/guard.py', 'checks/outcome.py', 'pyproject.toml', 'tools/slug.py'
    ]);
    const m = manifest(exported.outDir);
    const jsLike = m.files.filter(file => /\.(ts|tsx|js|mjs|cjs)$/.test(file.box) && !file.box.startsWith('box/'));
    expect(jsLike).toEqual([]); // no JavaScript project files ship in the Python Box
    expectRedBasePaired(exported.outDir, 'box-slug-outcome', 'box-slug-guard');
    expect(m.baseChecks.find(record => record.name === 'slug-outcome')).toMatchObject({ context: 'owner', result: 'fail' });
  });

  it('runs the declared checks in a clean directory and refuses read-only tamper', { timeout: HEAVY }, () => {
    const fixture = a4Repo('a4-py-tools');
    const dir = copyBox(exportFixture(fixture, 'py-clean').outDir, 'a4-py-clean');
    const outcome = spawnSync('python', ['checks/outcome.py'], { cwd: dir, encoding: 'utf8' });
    expect(outcome.status).toBe(1);
    const guard = spawnSync('python', ['checks/guard.py'], { cwd: dir, encoding: 'utf8' });
    expect(guard.status).toBe(0);
    writeFileSync(join(dir, 'checks', 'outcome.py'), '# tampered read-only check\n');
    const refused = runSubmitTool(dir);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('read-only file checks/outcome.py was modified');
  });
});

describe('A4 Python verify (a4-py-tools)', () => {
  it('verifies an alternative-right seal and rejects no-op, wrong and deleted edits', { timeout: HEAVY }, () => {
    const fixture = a4Repo('a4-py-tools');
    const verify = (dir: string) => verifySubmission({ submissionPath: join(dir, 'submission.json'), agreementPath: fixture.agreementPath, repoPath: fixture.repo, workRoot: runRoot('a4-py-verify') });

    const right = sealed(fixture, 'py-right', box => writeFileSync(join(box, 'tools', 'slug.py'), ALT_RIGHT['a4-py-tools']!.content));
    expect(right.run.status, right.run.stderr).toBe(0);
    const rightReport = verify(right.dir);
    expect(rightReport.verdict, JSON.stringify(rightReport.commandChecks ?? rightReport.checks)).toBe('pass');

    const noop = sealed(fixture, 'py-noop');
    const noopReport = verify(noop.dir);
    expect(noopReport.verdict).toBe('fail');
    expect(noopReport.failureClass).toBe('implementation-failure');

    const wrong = sealed(fixture, 'py-wrong', box => writeFileSync(join(box, 'tools', 'slug.py'), 'def slugify(text):\n    return "WRONG"\n'));
    const wrongReport = verify(wrong.dir);
    expect(wrongReport.verdict).toBe('fail');
    expect(wrongReport.failureClass).toBe('implementation-failure');

    const deleted = sealed(fixture, 'py-deleted', box => rmSync(join(box, 'tools', 'slug.py')));
    expect(deleted.run.status).toBe(1);
    expect(deleted.run.stderr).toContain('recorded file tools/slug.py is missing');
  });
});

describe('A4 multi-package fixture (a4-multi-pkg)', () => {
  it('preserves dependency files byte-for-byte, excludes the unselected member and installs the locked package', { timeout: HEAVY }, () => {
    const fixture = a4Repo('a4-multi-pkg');
    const exported = exportFixture(fixture, 'pkg');
    const dir = exported.outDir;
    // Owner dependency files ship with their exact bytes, not regenerated ones.
    for (const dep of ['package.json', 'package-lock.json', 'packages/cli/package.json', 'packages/core/package.json']) {
      expect(readFileSync(join(dir, dep)).equals(readFileSync(join(FIXTURES, 'a4-multi-pkg', dep))), dep).toBe(true);
    }
    const lock = readFileSync(join(dir, 'package-lock.json'), 'utf8');
    expect(lock).toContain('"version": "1.1.1"');
    expect(lock).toContain('sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==');
    // The excluded member is absent — no file, no canary token anywhere.
    const files = listFiles(dir);
    expect(files.some(file => file.startsWith('packages/internal/'))).toBe(false);
    for (const file of files) expect(readFileSync(join(dir, file), 'utf8').includes('A4_INTERNAL_CANARY')).toBe(false);
    // Real install + execution: the declared recipient setup installed the
    // locked picocolors and the paired outcome is red at base, guard green.
    const m = manifest(dir);
    expect(m.baseChecks.find(record => record.name === 'box-install')).toMatchObject({ context: 'recipient', role: 'setup', result: 'pass', exit: 0 });
    expect(m.baseChecks.find(record => record.name === 'install')).toMatchObject({ context: 'owner', role: 'setup', result: 'pass', exit: 0 });
    expectRedBasePaired(dir, 'box-pkg-outcome', 'box-pkg-guard');
  });
});

describe('A4 multi-package verify (a4-multi-pkg)', () => {
  it('verifies an alternative-right seal in the owner scratch clone and rejects a no-op', { timeout: HEAVY }, () => {
    const fixture = a4Repo('a4-multi-pkg');
    const verify = (dir: string) => verifySubmission({ submissionPath: join(dir, 'submission.json'), agreementPath: fixture.agreementPath, repoPath: fixture.repo, workRoot: runRoot('a4-pkg-verify') });

    const right = sealed(fixture, 'pkg-right', box => writeFileSync(join(box, 'packages', 'cli', 'bin.js'), ALT_RIGHT['a4-multi-pkg']!.content));
    expect(right.run.status, right.run.stderr).toBe(0);
    const rightReport = verify(right.dir);
    expect(rightReport.verdict, JSON.stringify(rightReport.commandChecks ?? rightReport.checks)).toBe('pass');

    const noop = sealed(fixture, 'pkg-noop');
    const noopReport = verify(noop.dir);
    expect(noopReport.verdict).toBe('fail');
    expect(noopReport.failureClass).toBe('implementation-failure');
    expect(noopReport.reason).toBe('command-check');
  });
});
