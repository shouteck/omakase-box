// reads: scripts/verify.mjs, scripts/suite.mjs, .github/workflows/verify.yml
// Fast unit tests for the K5 "stop repeating work" seam: the check-suite table,
// the diff->suite selection, and reusableStep — the predicate verify.mjs trusts
// before it lets a recorded PASS stand in for a real run. Everything runs on
// fabricated run dirs under the OS temp dir through node -e probes, same
// pattern as kitchen-stats.test.ts; nothing touches the real .kitchen/runs.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const temps: string[] = [];
const temp = () => { const dir = mkdtempSync(join(tmpdir(), 'kitchen-k5-')); temps.push(dir); return dir; };
afterAll(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }); });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const probe = (expression: string): Json => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `import * as s from './scripts/suite.mjs'; console.log(JSON.stringify(${expression}));`], { cwd: root, encoding: 'utf8', timeout: 30000 }));

const sha = (char: string) => char.repeat(40);
const dirName = (ms: number, full: string) => new Date(ms).toISOString().replace(/[:.]/g, '-') + '-' + full.slice(0, 7);
const iso = (ms: number) => new Date(ms).toISOString();
const NOW = Date.parse('2026-02-01T12:00:00.000Z');
const STEPS = [
  { name: 'check', exit: 0, seconds: 90, log: 'check.log' },
  { name: 'build', exit: 0, seconds: 45, log: 'build.log' },
  { name: 'test:kitchen', exit: 0, seconds: 12, log: 'test_kitchen.log' }
];

// Fabricates .kitchen/runs/<name>/summary.json plus the step logs a real verify
// writes, the way verify.mjs writes them.
function fakePass(dir: string, ms: number, commit: string, extra: Record<string, unknown> = {}) {
  const name = dirName(ms, commit);
  const runDir = join(dir, '.kitchen', 'runs', name);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, 'summary.json'), JSON.stringify({ schemaVersion: 1, sha: commit, dirty: false, verdict: 'PASS', startedAt: iso(ms), seconds: 150, steps: STEPS, notRun: [], failure: null, ...extra }));
  for (const step of STEPS) writeFileSync(join(runDir, step.log), `${step.name} output\n`);
  return name;
}
const reusable = (dir: string, commit: string, step: string, opts?: Record<string, unknown>) =>
  probe(`s.reusableStep(${JSON.stringify(join(dir, '.kitchen', 'runs'))}, ${JSON.stringify(commit)}, ${JSON.stringify(step)}, ${JSON.stringify(opts ?? {})})`);

describe('checkSuitesForPaths — the path->suite table', () => {
  const pick = (paths: string[]): Json => probe(`s.checkSuitesForPaths(${JSON.stringify(paths)})`);

  // K29: the check suites belonged to the older platform. CHECK_SUITES is
  // empty, so every verdict below is `[]` — the machinery stays pinned: a
  // suite added back must re-enter this table deliberately, not silently.
  it('no path owes a check suite — the set is empty after the platform removal', () => {
    expect(probe('[...s.CHECK_SUITES]')).toEqual([]);
    for (const path of ['packages/box-bounty/index.ts', 'packages/box-cli/src/cli.ts', 'tests/box/bounty/x.test.ts', 'tests/kitchen/x.test.ts', 'docs/box-v4/KITCHEN.md', 'waves/K5.md', 'AGENTS.md'])
      expect(pick([path]).suites, path).toEqual([]);
  });

  it('fails safe: shared tooling and unmapped paths run every check suite — still none', () => {
    for (const path of ['scripts/verify.mjs', 'package.json', 'pnpm-lock.yaml', 'vitest.config.mjs', 'unknown-dir/file.ts'])
      expect(pick([path]).suites, path).toEqual([]);
  });

  it('no check suite needs the disposable database — there is no database', () => {
    // K29: the *-live suites that reached acquireHostRuntime are all gone.
    // The set stays pinned so a reintroduced DB consumer must be named.
    expect(probe('[...s.DB_CHECK_SUITES].sort()')).toEqual([]);
    expect(probe('[...s.DB_SUITES].sort()')).toEqual([]);
  });
});

describe('selectCheckSuites — what check runs this invocation', () => {
  it('runs every suite under --full even when the diff touched nothing it can see — zero today', () => {
    expect(probe(`s.selectCheckSuites('.', { full: true })`).suites).toEqual([]);
  });

  it('runs every suite when git cannot answer — a broken diff never narrows the gate', () => {
    // K29: "every check suite" is currently the empty set — same rule, no suites.
    expect(probe(`s.selectCheckSuites(${JSON.stringify(join(temp(), 'not-a-repo'))}, {})`).suites).toEqual([]);
  });
});

describe('suiteKey — the dedup key for test:* steps', () => {
  it('keys a suite step on its suite.mjs arguments and nothing else', () => {
    const key = (command: string): Json => probe(`s.suiteKey(${JSON.stringify(command)})`);
    expect(key('node scripts/suite.mjs auth')).toBe('auth');
    expect(key('node scripts/suite.mjs box --suite auth')).toBe('box --suite auth');
    expect(key('node scripts/workspace.mjs check')).toBeNull();
    expect(key('node scripts/workspace.mjs build')).toBeNull();
  });
});

describe('reusableStep — when a recorded PASS may stand in', () => {
  it('reuses a step from a clean PASS on the same commit, naming the source run', () => {
    const dir = temp();
    const name = fakePass(dir, NOW, sha('a'));
    const hit = reusable(dir, sha('a'), 'build');
    expect(hit.run).toBe(name);
    expect(hit.seconds).toBe(45);
  });

  it('refuses a step that failed or was never run in the source', () => {
    const dir = temp();
    fakePass(dir, NOW, sha('a'), { steps: [{ name: 'check', exit: 1, seconds: 5, log: 'check.log' }], verdict: 'FAIL' });
    expect(reusable(dir, sha('a'), 'check')).toBeNull();
    expect(reusable(dir, sha('a'), 'test:security')).toBeNull();
  });

  it('refuses every forgery shape: wrong sha, dirty tree, renamed dir, missing log, malformed summary', () => {
    const dir = temp();
    fakePass(dir, NOW, sha('a'));
    expect(reusable(dir, sha('b'), 'check')).toBeNull(); // different commit

    const dirty = temp();
    fakePass(dirty, NOW, sha('a'), { dirty: true });
    expect(reusable(dirty, sha('a'), 'check')).toBeNull(); // PASS on a dirty tree is not a committed PASS

    const renamed = temp(); // a run dir copied under a name its summary contradicts
    const runDir = join(renamed, '.kitchen', 'runs', dirName(NOW + 999000, sha('b')));
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, 'summary.json'), JSON.stringify({ schemaVersion: 1, sha: sha('a'), dirty: false, verdict: 'PASS', startedAt: iso(NOW), steps: STEPS }));
    for (const step of STEPS) writeFileSync(join(runDir, step.log), 'forged\n');
    expect(reusable(renamed, sha('a'), 'check')).toBeNull();

    const noLog = temp(); // summary claims the step passed but its log was never written
    fakePass(noLog, NOW, sha('a'));
    rmSync(join(noLog, '.kitchen', 'runs', dirName(NOW, sha('a')), 'build.log'));
    expect(reusable(noLog, sha('a'), 'build')).toBeNull();

    const malformed = temp();
    const runDir2 = join(malformed, '.kitchen', 'runs', dirName(NOW, sha('a')));
    mkdirSync(runDir2, { recursive: true });
    writeFileSync(join(runDir2, 'summary.json'), '{ not json');
    expect(reusable(malformed, sha('a'), 'check')).toBeNull();

    const noStartedAt = temp(); // summary without startedAt cannot prove its own dir name
    fakePass(noStartedAt, NOW, sha('a'), { startedAt: null });
    expect(reusable(noStartedAt, sha('a'), 'check')).toBeNull();
  });

  it('K24: a run dirty only in waves/ counts for every step but test:kitchen', () => {
    // A verify run whose tree was dirty only in a wave file: every step ran,
    // the verdict stayed UNCOMMITTED, and the dirty path list is what the
    // reuse rule reads. waves/*.md are kitchen inputs, so only test:kitchen
    // read them.
    const dir = temp();
    const steps = [...STEPS, { name: 'test:box-bounty', exit: 0, seconds: 40, log: 'test_box-bounty.log' }];
    const name = fakePass(dir, NOW, sha('a'), { dirty: true, verdict: 'UNCOMMITTED', dirtyPaths: ['waves/K99.md'], steps });
    writeFileSync(join(dir, '.kitchen', 'runs', name, 'test_box-bounty.log'), 'test:box-bounty output\n');
    expect(reusable(dir, sha('a'), 'test:box-bounty').run).toBe(name);
    expect(reusable(dir, sha('a'), 'check').run).toBe(name);
    expect(reusable(dir, sha('a'), 'build').run).toBe(name);
    expect(reusable(dir, sha('a'), 'test:kitchen')).toBeNull();
  });

  it('K24: a run dirty in a path every step reads counts for nothing — and an unlisted dirty path never does', () => {
    const dir = temp();
    fakePass(dir, NOW, sha('a'), { dirty: true, verdict: 'UNCOMMITTED', dirtyPaths: ['packages/box-bounty/index.ts'] });
    for (const step of ['check', 'build', 'test:kitchen']) expect(reusable(dir, sha('a'), step), step).toBeNull();

    const unlisted = temp(); // dirty recorded without its path list — nothing to reason from
    fakePass(unlisted, NOW, sha('a'), { dirty: true, verdict: 'UNCOMMITTED' });
    expect(reusable(unlisted, sha('a'), 'build')).toBeNull();

    const unreadable = temp(); // the same for a null list — the end-of-run status could not be read
    fakePass(unreadable, NOW, sha('a'), { dirty: true, verdict: 'UNCOMMITTED', dirtyPaths: null });
    expect(reusable(unreadable, sha('a'), 'build')).toBeNull();
  });

  it('a reused check must have covered at least the suites this run needs — --full never inherits a partial check', () => {
    const dir = temp();
    fakePass(dir, NOW, sha('a'), { checkSuites: ['auth'] });
    expect(reusable(dir, sha('a'), 'check', { suites: ['auth'] })).not.toBeNull();
    expect(reusable(dir, sha('a'), 'check', { suites: ['auth', 'planner'] })).toBeNull();
    // A summary from before checkSuites existed is trusted to have covered
    // the check suites OF ITS DAY — read as the current CHECK_SUITES, which
    // K29 emptied. It still stands in for an empty need and never for a
    // named suite that no longer exists.
    const old = temp();
    fakePass(old, NOW, sha('a'));
    expect(reusable(old, sha('a'), 'check', { suites: [] })).not.toBeNull();
    expect(reusable(old, sha('a'), 'check', { suites: ['auth'] })).toBeNull();
  });

  it('K45: a reused test:kitchen must have covered this run\'s kitchen selection — wide stands in for narrow, never the reverse', () => {
    const narrow = temp();
    fakePass(narrow, NOW, sha('a'), { kitchenSelected: ['k15-sandbox-guard.test.ts', 'kitchen-stats.test.ts'] });
    expect(reusable(narrow, sha('a'), 'test:kitchen', { kitchenFiles: ['kitchen-stats.test.ts'] })).not.toBeNull();
    expect(reusable(narrow, sha('a'), 'test:kitchen', { kitchenFiles: ['k15-sandbox-guard.test.ts', 'kitchen-stats.test.ts'] })).not.toBeNull();
    // A narrow PASS never stands in for a wider selection.
    expect(reusable(narrow, sha('a'), 'test:kitchen', { kitchenFiles: ['k15-sandbox-guard.test.ts', 'kitchen-stats.test.ts', 'verify-reuse.test.ts'] })).toBeNull();
    expect(reusable(narrow, sha('a'), 'test:kitchen', { kitchenFiles: ['verify-reuse.test.ts'] })).toBeNull();
    // The rule binds test:kitchen only: the other steps of that run still count.
    expect(reusable(narrow, sha('a'), 'build').run).toBe(dirName(NOW, sha('a')));
    // A recorded selection that is not a list proves no coverage.
    const unreadable = temp();
    fakePass(unreadable, NOW, sha('a'), { kitchenSelected: null });
    expect(reusable(unreadable, sha('a'), 'test:kitchen', { kitchenFiles: [] })).toBeNull();
    // Before K45 every recorded test:kitchen ran the whole directory.
    const legacy = temp();
    fakePass(legacy, NOW, sha('a'));
    expect(reusable(legacy, sha('a'), 'test:kitchen', { kitchenFiles: ['verify-reuse.test.ts', 'kitchen-stats.test.ts'] })).not.toBeNull();
  });

  it('picks the newest qualifying run when several PASS on the commit', () => {
    const dir = temp();
    fakePass(dir, NOW, sha('a'));
    const newer = fakePass(dir, NOW + 60000, sha('a'));
    expect(reusable(dir, sha('a'), 'build').run).toBe(newer);
  });
});

describe('kitchenSuiteReason — when a diff owes test:kitchen (K22)', () => {
  const reason = (paths: string[] | null): Json => probe(`s.kitchenSuiteReason(${JSON.stringify(paths)})`);

  it('a diff reaching the bounty tool owes the suite the kitchen demo drives', () => {
    for (const path of ['packages/box-bounty/index.ts', 'packages/box-cli/src/cli.ts']) {
      expect(reason([path]), path).toBe('the change reaches the built CLI the kitchen demo drives');
    }
  });

  it('a docs-only diff owes nothing', () => {
    expect(reason(['docs/box-v4/PLAN.md'])).toBeNull();
    expect(reason(['kitchen/demo/RECORDING.md'])).toBeNull();
    expect(reason(['packages/other-lib/index.ts'])).toBeNull(); // no demo drives that package
    expect(reason([])).toBeNull();
  });

  it('a file a kitchen test reads owes test:kitchen however doc-shaped it is', () => {
    for (const path of ['AGENTS.md', 'STATUS.md', 'kitchen/INBOX.md', 'docs/box-v4/KITCHEN.md', 'waves/K21.md', 'kitchen/demo/gh-standin.cjs', 'kitchen/demo/record.mjs', 'kitchen/demo/bt11b-replay.mjs']) {
      expect(reason([path]), path).toBe('the change touches a file a kitchen test reads');
    }
    // …but no check suite reads them — `check` still owes them nothing.
    expect(probe(`s.checkSuitesForPaths(${JSON.stringify(['AGENTS.md', 'docs/box-v4/KITCHEN.md', 'kitchen/demo/gh-standin.cjs', 'waves/K21.md'])})`).suites).toEqual([]);
  });

  it('an unreadable diff owes it — the same fail-safe as check', () => {
    expect(reason(null)).not.toBeNull();
  });
});

describe('the hosted workflow mirrors INERT (K22)', () => {
  // GitHub applies `paths` patterns in order — a later positive re-includes
  // what an earlier '!' excluded. Evaluate the committed list the same way
  // and require agreement with suite.mjs's isInert on every probe path.
  const patterns = (() => {
    const workflow = readFileSync(join(root, '.github', 'workflows', 'verify.yml'), 'utf8');
    const list: { negated: boolean; re: RegExp }[] = [];
    let inPaths = false;
    for (const line of workflow.split('\n')) {
      if (/^\s+paths:/.test(line)) { inPaths = true; continue; }
      if (!inPaths) continue;
      const match = /^\s+-\s+'([^']+)'/.exec(line);
      if (!match) { if (/^\s*(#|$)/.test(line)) continue; break; }
      let pattern = match[1]!;
      const negated = pattern.startsWith('!');
      if (negated) pattern = pattern.slice(1);
      const source = pattern
        .replace(/[.+^${}()|[\]\\?]/g, '\\$&')
        .replace(/\*\*\/|\*\*|\*/g, token => (token === '**/' ? '(?:.*/)?' : token === '**' ? '.*' : '[^/]*'));
      list.push({ negated, re: new RegExp(`^${source}$`) });
    }
    return list;
  })();
  const hostedRuns = (path: string): boolean => {
    let run = false;
    for (const { negated, re } of patterns) if (re.test(path)) run = !negated;
    return run;
  };
  const SAMPLES = [
    'AGENTS.md', 'STATUS.md', 'kitchen/INBOX.md', 'docs/box-v4/KITCHEN.md',
    'kitchen/demo/gh-standin.cjs', 'kitchen/demo/record.mjs', 'kitchen/demo/bt11b-replay.mjs',
    'waves/K22.md', 'waves/night-2026-10-05.md',
    'packages/box-bounty/index.ts', 'scripts/suite.mjs', 'package.json',
    'tests/kitchen/x.test.ts', '.github/workflows/verify.yml',
    'docs/box-v4/PLAN.md', 'README.md', 'kitchen/README.md', 'kitchen/roles/worker.md',
    'kitchen/stations/packaging.md', 'kitchen/stations/evidence.md', 'templates/wave.md',
    '.devin/rules/box-kitchen.md', '.claude/skills/kitchen/SKILL.md', '.cursor/rules/box-kitchen.mdc',
    '.devin/plugins/box-pstack/skills/poteto-mode/SKILL.md', '.devin/plugins/box-pstack/DEVIN-COMPATIBILITY.md',
    'kitchen/demo/RECORDING.md', 'templates/x.md', 'milestones/x.md', 'research/x.md',
    'tasks/x.md', '.devin/rules/x.md', '.cursor/x.mdc', '.gitignore', 'waves/x.txt', 'docs/legacy/x.md',
  ];

  it('a push runs exactly when a changed path is not inert', () => {
    expect(patterns.length).toBeGreaterThan(0);
    const expected: boolean[] = probe(`${JSON.stringify(SAMPLES)}.map(path => !s.isInert(path))`);
    SAMPLES.forEach((path, index) => {
      expect(hostedRuns(path), `${path}: workflow ${hostedRuns(path) ? 'runs' : 'skips'}; isInert says ${expected[index] ? 'non-inert' : 'inert'}`).toBe(expected[index]);
    });
  });
});

describe('verify adds test:kitchen when the diff owes it (K22, end to end)', () => {
  it('a product path adds it; a docs-only diff does not', () => {
    // A fake repository running the real scripts — the same harness
    // k7-ci-clean-checkout uses, plus the minimal pnpm stub k7-ci2 wrote so
    // each named script actually runs.
    const dir = temp();
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    for (const name of readdirSync(join(root, 'scripts'))) {
      if (name.endsWith('.mjs') || name === 'toolchain.json') copyFileSync(join(root, 'scripts', name), join(dir, 'scripts', name));
    }
    const pnpmBin = join(dir, 'scripts', 'tooling', 'node_modules', 'pnpm', 'bin');
    mkdirSync(pnpmBin, { recursive: true });
    writeFileSync(join(pnpmBin, 'pnpm.cjs'), "const { spawnSync } = require('child_process');\nconst { readFileSync } = require('fs');\nconst { join } = require('path');\nconst scripts = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).scripts;\nconst name = process.argv[process.argv.indexOf('run') + 1];\nconst command = scripts[name];\nif (!command) process.exit(2);\nprocess.exit(spawnSync(command, { shell: true, stdio: 'inherit', cwd: process.cwd() }).status ?? 1);\n");
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fake-repo', private: true, scripts: { 'test:x': 'node -e "process.exit(0)"', 'test:kitchen': 'node -e "process.exit(0)"' } }));
    writeFileSync(join(dir, '.gitignore'), '.kitchen/\n');
    writeFileSync(join(dir, 'tracked.txt'), 'base\n');
    const gitDir = dir.replace(/[\\/]+$/, '').replaceAll(String.fromCharCode(92), '/');
    const git = (args: string[]) => execFileSync('git', ['-c', `safe.directory=${gitDir}`, '-c', 'user.email=kitchen@test.invalid', '-c', 'user.name=kitchen', ...args], { cwd: dir, encoding: 'utf8' });
    git(['init', '-q', '-b', 'master']);
    git(['add', '-A']);
    git(['commit', '-qm', 'init']);
    const verify = () => spawnSync(process.execPath, [join(dir, 'scripts', 'verify.mjs'), '--only', '--db=none', 'test:x'], { cwd: dir, encoding: 'utf8', timeout: 120000 });
    const runsDir = join(dir, '.kitchen', 'runs');
    const runs = () => (existsSync(runsDir) ? readdirSync(runsDir) : []);
    const latestRun = (before: Set<string>) => runs().find(name => !before.has(name))!;
    const summary = (name: string): Json => JSON.parse(readFileSync(join(runsDir, name, 'summary.json'), 'utf8'));

    git(['checkout', '-q', '-b', 'product-change']);
    mkdirSync(join(dir, 'packages', 'box-bounty'), { recursive: true });
    writeFileSync(join(dir, 'packages', 'box-bounty', 'index.ts'), 'export {};\n');
    git(['add', '-A']);
    git(['commit', '-qm', 'touch the bounty package']);
    const before = new Set(runs());
    const productRun = verify();
    expect(productRun.stdout).toContain('added test:kitchen: the change reaches the built CLI the kitchen demo drives');
    expect(productRun.status).toBe(0);
    const product = summary(latestRun(before));
    expect(product.steps.map((step: Json) => step.name)).toEqual(['test:x', 'test:kitchen']);
    expect(product.steps.every((step: Json) => step.exit === 0)).toBe(true);

    git(['checkout', '-q', 'master']);
    git(['checkout', '-q', '-b', 'docs-only']);
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'note.md'), 'prose\n');
    git(['add', '-A']);
    git(['commit', '-qm', 'docs only']);
    const beforeDocs = new Set(runs());
    const docsRun = verify();
    expect(docsRun.stdout).not.toContain('added test:kitchen');
    expect(docsRun.status).toBe(0);
    const docs = summary(latestRun(beforeDocs));
    expect(docs.steps.map((step: Json) => step.name)).toEqual(['test:x']);
  }, 180000);
});

describe('verify reuses an ancestor PASS when the commits between read nothing the step sees (K23, end to end)', () => {
  it('a wave-file-only commit reuses test:box-bounty but reruns test:kitchen; a packages/ change reuses nothing; FAIL and dirty ancestors are never used; --fresh reruns', () => {
    // The same fake-repository harness as the K22 test above, with check and
    // build stubbed too so the whole step list runs.
    const dir = temp();
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    for (const name of readdirSync(join(root, 'scripts'))) {
      if (name.endsWith('.mjs') || name === 'toolchain.json') copyFileSync(join(root, 'scripts', name), join(dir, 'scripts', name));
    }
    const pnpmBin = join(dir, 'scripts', 'tooling', 'node_modules', 'pnpm', 'bin');
    mkdirSync(pnpmBin, { recursive: true });
    writeFileSync(join(pnpmBin, 'pnpm.cjs'), "const { spawnSync } = require('child_process');\nconst { readFileSync } = require('fs');\nconst { join } = require('path');\nconst scripts = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).scripts;\nconst name = process.argv[process.argv.indexOf('run') + 1];\nconst command = scripts[name];\nif (!command) process.exit(2);\nprocess.exit(spawnSync(command, { shell: true, stdio: 'inherit', cwd: process.cwd() }).status ?? 1);\n");
    const stub = 'node -e "process.exit(0)"';
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fake-repo', private: true, scripts: { check: stub, build: stub, 'test:box-bounty': stub, 'test:kitchen': stub } }));
    writeFileSync(join(dir, '.gitignore'), '.kitchen/\n');
    writeFileSync(join(dir, 'tracked.txt'), 'base\n');
    const gitDir = dir.replace(/[\\/]+$/, '').replaceAll(String.fromCharCode(92), '/');
    const git = (args: string[]) => execFileSync('git', ['-c', `safe.directory=${gitDir}`, '-c', 'user.email=kitchen@test.invalid', '-c', 'user.name=kitchen', ...args], { cwd: dir, encoding: 'utf8' }).trim();
    const commit = (path: string, content: string) => { const parts = path.split('/'); mkdirSync(join(dir, ...parts.slice(0, -1)), { recursive: true }); writeFileSync(join(dir, ...parts), content); git(['add', '-A']); git(['commit', '-qm', path]); return git(['rev-parse', 'HEAD']); };
    git(['init', '-q', '-b', 'master']);
    git(['add', '-A']);
    git(['commit', '-qm', 'init']);
    git(['checkout', '-q', '-b', 'wave']);
    const verify = (extra: string[] = []) => spawnSync(process.execPath, [join(dir, 'scripts', 'verify.mjs'), '--db=none', ...extra, 'test:box-bounty'], { cwd: dir, encoding: 'utf8', timeout: 120000 });
    const runsDir = join(dir, '.kitchen', 'runs');
    const latestRun = (before: Set<string>) => readdirSync(runsDir).find(name => !before.has(name))!;
    const names = () => new Set(existsSync(runsDir) ? readdirSync(runsDir) : []);
    const summary = (name: string): Json => JSON.parse(readFileSync(join(runsDir, name, 'summary.json'), 'utf8'));
    // A hand-written run record for a sha that never really ran — FAIL or
    // dirty — to prove the walk passes it by.
    const fakeRun = (forSha: string, ms: number, extra: Record<string, unknown>) => {
      const name = `${new Date(ms).toISOString().replace(/[:.]/g, '-')}-${forSha.slice(0, 7)}`;
      const runDir = join(runsDir, name);
      mkdirSync(runDir, { recursive: true });
      writeFileSync(join(runDir, 'summary.json'), JSON.stringify({ schemaVersion: 1, sha: forSha, startedAt: new Date(ms).toISOString(), seconds: 10, database: 'none', steps: [{ name: 'check', exit: 0, seconds: 3, log: 'check.log' }, { name: 'build', exit: 0, seconds: 3, log: 'build.log' }, { name: 'test:box-bounty', exit: 0, seconds: 3, log: 'test_box-bounty.log' }, { name: 'test:kitchen', exit: 0, seconds: 3, log: 'test_kitchen.log' }], notRun: [], failure: null, ...extra }));
      for (const step of ['check', 'build', 'test_box-bounty', 'test_kitchen']) writeFileSync(join(runDir, `${step}.log`), `${step}\n`);
      return name;
    };

    // C1 — a real change earns a real PASS on every step.
    const code = commit('packages/box-bounty/index.ts', 'export {};\n');
    let before = names();
    const first = verify();
    expect(first.status).toBe(0);
    const firstRun = latestRun(before);
    expect(summary(firstRun).steps.every((step: Json) => step.exit === 0 && step.reused === undefined)).toBe(true);

    // C2 — a wave file alone: only inert-to-the-suite paths changed.
    commit('waves/K99.md', '# wave\n');
    before = names();
    const waveRun = verify();
    expect(waveRun.status).toBe(0);
    expect(waveRun.stdout).toContain(`test:box-bounty=reused@${firstRun}(ancestor ${code.slice(0, 7)}, only inert paths changed)`);
    const waveSummary = summary(latestRun(before));
    const stepOf = (name: string): Json => waveSummary.steps.find((step: Json) => step.name === name);
    expect(stepOf('test:box-bounty').ancestor).toBe(code);
    expect(stepOf('check').ancestor).toBe(code);
    expect(stepOf('build').ancestor).toBe(code);
    // …but waves/*.md are kitchen inputs: the kitchen suite reruns for real.
    expect(stepOf('test:kitchen').reused).toBeUndefined();
    expect(stepOf('test:kitchen').exit).toBe(0);
    expect(waveSummary.steps.find((step: Json) => step.name === 'test:kitchen').log).toBeDefined();

    // C3 — packages/ is inert to nobody: nothing reuses anything.
    const productSha = commit('packages/other-lib/index.ts', 'export {};\n');
    before = names();
    const product = verify();
    expect(product.status).toBe(0);
    const productRun = latestRun(before);
    const productSummary = summary(productRun);
    expect(productSummary.steps.every((step: Json) => step.reused === undefined)).toBe(true);

    // C4 fails (never ran — a hand-written FAIL), C5's record sat on a dirty
    // tree. C6's wave file can only legitimately reach back to C3.
    const failed = commit('waves/K98.md', '# wave\n');
    fakeRun(failed, Date.parse('2026-02-02T00:00:00.000Z'), { verdict: 'FAIL', dirty: false });
    const dirtied = commit('waves/K97.md', '# wave\n');
    fakeRun(dirtied, Date.parse('2026-02-02T00:01:00.000Z'), { verdict: 'PASS', dirty: true });
    commit('waves/K96.md', '# wave\n');
    before = names();
    const skipped = verify();
    expect(skipped.status).toBe(0);
    // The FAIL and dirty ancestors are passed by; the last real PASS is C3's.
    expect(skipped.stdout).toContain(`test:box-bounty=reused@${productRun}(ancestor ${productSha.slice(0, 7)}, only inert paths changed)`);
    const skippedSummary = summary(latestRun(before));
    const skippedStep = (name: string): Json => skippedSummary.steps.find((step: Json) => step.name === name);
    expect(skippedStep('test:box-bounty').ancestor).toBe(productSha);
    expect(skippedStep('test:kitchen').reused).toBeUndefined();

    // --fresh forces real runs even when an ancestor qualifies.
    commit('waves/K95.md', '# wave\n');
    before = names();
    const forced = verify(['--fresh']);
    expect(forced.status).toBe(0);
    expect(summary(latestRun(before)).steps.every((step: Json) => step.reused === undefined)).toBe(true);
  }, 240000);
});

describe('verify counts a dirty run for the steps that read none of it (K24, end to end)', () => {
  it('a run that ends dirty only in waves/ counts for test:box-bounty, not test:kitchen; one dirty in packages/ counts for nothing', () => {
    // The same fake-repository harness as the K22/K23 tests above, with one
    // addition: the `build` stub dirties the path DIRTY_STEP names while the
    // run is in flight — the wave-file-edit-during-verify case. A tree dirty
    // before verify starts is still refused (k7-ci-clean-checkout), so a
    // dirty run only ever comes from mid-run edits.
    const dir = temp();
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    for (const name of readdirSync(join(root, 'scripts'))) {
      if (name.endsWith('.mjs') || name === 'toolchain.json') copyFileSync(join(root, 'scripts', name), join(dir, 'scripts', name));
    }
    const pnpmBin = join(dir, 'scripts', 'tooling', 'node_modules', 'pnpm', 'bin');
    mkdirSync(pnpmBin, { recursive: true });
    writeFileSync(join(pnpmBin, 'pnpm.cjs'), "const { spawnSync } = require('child_process');\nconst { readFileSync } = require('fs');\nconst { join } = require('path');\nconst scripts = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).scripts;\nconst name = process.argv[process.argv.indexOf('run') + 1];\nconst command = scripts[name];\nif (!command) process.exit(2);\nprocess.exit(spawnSync(command, { shell: true, stdio: 'inherit', cwd: process.cwd() }).status ?? 1);\n");
    const stub = 'node -e "process.exit(0)"';
    const dirtyStub = 'node -e "const p=process.env.DIRTY_STEP;if(p){const fs=require(\'fs\');const path=require(\'path\');fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,\'x\')}process.exit(0)"';
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fake-repo', private: true, scripts: { check: stub, build: dirtyStub, 'test:box-bounty': stub, 'test:kitchen': stub } }));
    writeFileSync(join(dir, '.gitignore'), '.kitchen/\n');
    writeFileSync(join(dir, 'tracked.txt'), 'base\n');
    const gitDir = dir.replace(/[\\/]+$/, '').replaceAll(String.fromCharCode(92), '/');
    const git = (args: string[]) => execFileSync('git', ['-c', `safe.directory=${gitDir}`, '-c', 'user.email=kitchen@test.invalid', '-c', 'user.name=kitchen', ...args], { cwd: dir, encoding: 'utf8' }).trim();
    const commit = (path: string, content: string) => { const parts = path.split('/'); mkdirSync(join(dir, ...parts.slice(0, -1)), { recursive: true }); writeFileSync(join(dir, ...parts), content); git(['add', '-A']); git(['commit', '-qm', path]); return git(['rev-parse', 'HEAD']); };
    git(['init', '-q', '-b', 'master']);
    git(['add', '-A']);
    git(['commit', '-qm', 'init']);
    git(['checkout', '-q', '-b', 'wave']);
    const verify = (extra: string[] = [], env: Record<string, string> = {}) => spawnSync(process.execPath, [join(dir, 'scripts', 'verify.mjs'), '--db=none', ...extra, 'test:box-bounty'], { cwd: dir, encoding: 'utf8', timeout: 120000, env: { ...process.env, ...env } });
    const runsDir = join(dir, '.kitchen', 'runs');
    const names = () => new Set(existsSync(runsDir) ? readdirSync(runsDir) : []);
    const latestRun = (before: Set<string>) => readdirSync(runsDir).find(name => !before.has(name))!;
    const summary = (name: string): Json => JSON.parse(readFileSync(join(runsDir, name, 'summary.json'), 'utf8'));

    // A real change earns a clean PASS on every step first.
    commit('packages/box-bounty/index.ts', 'export {};\n');
    let before = names();
    const first = verify();
    expect(first.status).toBe(0);

    // A wave file appears while the run is in flight. The run finishes —
    // verdict UNCOMMITTED, exit 3 — and its record says which steps count:
    // everything but test:kitchen, the only step that reads waves/*.md.
    // --fresh so this run's own step results (with logs) are what get judged.
    before = names();
    const dirtyRun = verify(['--fresh'], { DIRTY_STEP: 'waves/K99.md' });
    expect(dirtyRun.status).toBe(3);
    expect(dirtyRun.stdout).toContain('+dirty UNCOMMITTED');
    const dirtyName = latestRun(before);
    const dirtySummary = summary(dirtyName);
    const dirtyStep = (name: string): Json => dirtySummary.steps.find((step: Json) => step.name === name);
    expect(dirtySummary.steps.map((step: Json) => step.name)).toEqual(['check', 'build', 'test:box-bounty', 'test:kitchen']);
    expect(dirtySummary.dirtyPaths).toEqual(['waves/K99.md']);
    expect(dirtyStep('check').reusable).toBe(true);
    expect(dirtyStep('build').reusable).toBe(true);
    expect(dirtyStep('test:box-bounty').reusable).toBe(true);
    expect(dirtyStep('test:kitchen').reusable).toBe(false);

    // Committing the wave file changes nothing the bounty suite reads: the
    // next verify reuses the DIRTY run's own record through the ancestor
    // walk — editing the wave file cost no rerun. The kitchen suite reruns.
    commit('waves/K99.md', '# wave\n');
    before = names();
    const after = verify();
    expect(after.status).toBe(0);
    expect(after.stdout).toContain(`test:box-bounty=reused@${dirtyName}(ancestor ${summary(dirtyName).sha.slice(0, 7)}, only inert paths changed)`);
    const afterSummary = summary(latestRun(before));
    const afterStep = (name: string): Json => afterSummary.steps.find((step: Json) => step.name === name);
    expect(afterStep('test:box-bounty').reused).toBe(dirtyName);
    expect(afterStep('test:kitchen').reused).toBeUndefined();

    // A packages/ path is read by every step: the run finishes and is
    // recorded, but nothing in it counts — reusable:false across the board,
    // and once committed the suites run for real.
    before = names();
    const productDirty = verify(['--fresh'], { DIRTY_STEP: 'packages/other-lib/index.ts' });
    expect(productDirty.status).toBe(3);
    const productSummary = summary(latestRun(before));
    expect(productSummary.steps.every((step: Json) => step.reusable === false)).toBe(true);
    commit('packages/other-lib/index.ts', 'export {};\n');
    before = names();
    const product = verify();
    expect(product.status).toBe(0);
    expect(product.stdout).not.toContain('reused@');
  }, 240000);
});
