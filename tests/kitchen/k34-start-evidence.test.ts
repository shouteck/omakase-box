// K34 regression tests: a verify invocation leaves a durable started.json at
// run-directory creation, so a killed run stays attributable; stats classify
// that evidence as unfinished, never as completion. Unit halves run on
// fabricated run dirs through node -e probes (same pattern as
// kitchen-stats.test.ts); the end-to-end half drives the real verify.mjs in
// a fake repository and kills only the verifier it spawned.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const temps: string[] = [];
const temp = () => { const dir = mkdtempSync(join(tmpdir(), 'kitchen-k34-')); temps.push(dir); return dir; };
afterAll(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }); });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const statsProbe = (expression: string): Json => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `import * as k from './scripts/kitchen-stats.mjs'; console.log(JSON.stringify(${expression}));`], { cwd: root, encoding: 'utf8', timeout: 30000 }));
const suiteProbe = (expression: string): Json => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `import * as s from './scripts/suite.mjs'; console.log(JSON.stringify(${expression}));`], { cwd: root, encoding: 'utf8', timeout: 30000 }));

const sha = (char: string) => char.repeat(40);
const dirName = (ms: number, full: string) => new Date(ms).toISOString().replace(/[:.]/g, '-') + '-' + full.slice(0, 7);
const iso = (ms: number) => new Date(ms).toISOString();
const NOW = Date.parse('2026-02-01T12:00:00.000Z');

// Fabricates .kitchen/runs/<name>/ exactly the way verify.mjs would leave it:
// 'started' / 'summary' objects become files, 'malformed' writes unparseable
// text, and an omitted key writes no file (a pre-K34 legacy dir, or a crash).
function fakeRun(rootDir: string, name: string, files: { started?: Record<string, unknown> | 'malformed'; summary?: Record<string, unknown> | 'malformed' } = {}) {
  const dir = join(rootDir, '.kitchen', 'runs', name);
  mkdirSync(dir, { recursive: true });
  if (files.started === 'malformed') writeFileSync(join(dir, 'started.json'), '{ not json');
  else if (files.started) writeFileSync(join(dir, 'started.json'), JSON.stringify({ schemaVersion: 1, ...files.started }));
  if (files.summary === 'malformed') writeFileSync(join(dir, 'summary.json'), '{ not json');
  else if (files.summary) writeFileSync(join(dir, 'summary.json'), JSON.stringify({ schemaVersion: 1, notRun: [], failure: null, steps: [], ...files.summary }));
}
const startedAt = (ms: number, commit: string, extra: Record<string, unknown> = {}) => ({ sha: commit, startedAt: iso(ms), dirty: false, flags: { only: false, fresh: false, full: false }, steps: ['check', 'build', 'test:kitchen'], ...extra });
const passAt = (ms: number, commit: string, extra: Record<string, unknown> = {}) => ({ sha: commit, dirty: false, verdict: 'PASS', startedAt: iso(ms), seconds: 30, steps: [{ name: 'check', exit: 0, seconds: 10, log: 'check.log' }], ...extra });
const readRuns = (rootDir: string): Json[] => statsProbe(`k.readRuns(${JSON.stringify(join(rootDir, '.kitchen', 'runs'))})`);

describe('readRuns — started.json makes a killed run legible without becoming a verdict', () => {
  it('a start-only dir reports its recorded plan but no verdict, seconds or PASS', () => {
    const dir = temp();
    fakeRun(dir, dirName(NOW, sha('a')), { started: startedAt(NOW, sha('a')) });
    const runs = readRuns(dir);
    expect(runs[0].summary).toBe('missing');
    expect(runs[0].start).toBe('ok');
    expect(runs[0].plannedSteps).toEqual(['check', 'build', 'test:kitchen']);
    expect(runs[0].sha).toBe('aaaaaaa');
    expect(runs[0].startedAt).toBe(NOW);
    expect(runs[0].verdict).toBeNull(); // unfinished — running or interrupted, not a result
    expect(runs[0].seconds).toBeNull();
  });

  it('labels malformed and mismatched markers, and legacy dirs with none', () => {
    const dir = temp();
    fakeRun(dir, dirName(NOW, sha('a')), { started: 'malformed' });
    // A marker whose sha or timestamp disagrees with the dir name verify
    // minted is untrusted: labelled, and its claims change nothing.
    fakeRun(dir, dirName(NOW + 60000, sha('b')), { started: startedAt(NOW + 60000, sha('f')) });
    fakeRun(dir, dirName(NOW + 120000, sha('c'))); // legacy: predates K34
    const runs = readRuns(dir);
    expect(runs.map((r: Json) => r.start)).toEqual(['malformed', 'mismatched', 'missing']);
    expect(runs[1].sha).toBe('bbbbbbb'); // attribution stays with the dir name
    expect(runs[1].plannedSteps).toBeUndefined();
    expect(runs[2].sha).toBe('ccccccc');
  });

  it('a completed run keeps its summary as authority even beside a marker', () => {
    const dir = temp();
    fakeRun(dir, dirName(NOW, sha('a')), { started: startedAt(NOW, sha('a')), summary: passAt(NOW, sha('a')) });
    const runs = readRuns(dir);
    expect(runs[0].summary).toBe('ok');
    expect(runs[0].verdict).toBe('PASS');
    expect(runs[0].seconds).toBe(30);
  });
});

describe('unfinished evidence can never satisfy completion checks', () => {
  const commits = [sha('a'), sha('b')];
  const stall = (rootDir: string, opts: Record<string, unknown>) =>
    statsProbe(`k.stallCheck(k.readRuns(${JSON.stringify(join(rootDir, '.kitchen', 'runs'))}), ${JSON.stringify(commits)}, ${JSON.stringify(opts)})`);

  it('start-only runs still count as non-PASS in the stall streak', () => {
    const dir = temp();
    for (let i = 0; i < 6; i += 1) {
      const ms = NOW - (6 - i) * 60000;
      const commit = commits[i % 2]!;
      fakeRun(dir, dirName(ms, commit), { started: startedAt(ms, commit) });
    }
    const hit = stall(dir, { now: NOW, maxRuns: 6, maxMinutes: 900 });
    expect(hit).not.toBeNull();
    expect(hit.consecutive).toBe(6);
  });

  it('the acceptance budget stays missing when the latest run only started', () => {
    const dir = temp();
    fakeRun(dir, dirName(NOW, sha('e')), { started: startedAt(NOW, sha('e')) });
    const check = statsProbe(`k.budgetCheck(k.readRuns(${JSON.stringify(join(dir, '.kitchen', 'runs'))}))`);
    expect(check.ok).toBe('missing');
    expect(check.actual).toContain('invalid latest run');
  });

  it('a started.json is never reusable as a completed step, however PASS-shaped it looks', () => {
    const dir = temp();
    // Even a hand-forged marker naming a step and an exit code proves nothing:
    // reusableStep reads summary.json alone.
    fakeRun(dir, dirName(NOW, sha('a')), { started: startedAt(NOW, sha('a'), { verdict: 'PASS', steps: [{ name: 'check', exit: 0 }] }) });
    expect(suiteProbe(`s.reusableStep(${JSON.stringify(join(dir, '.kitchen', 'runs'))}, ${JSON.stringify(sha('a'))}, 'check', {})`)).toBeNull();
  });
});

describe('the stats page separates unfinished from completed and legacy', () => {
  it('names each unfinished dir with its class, without calling a live run dead', () => {
    const dir = temp();
    mkdirSync(join(dir, 'docs', 'box-v4'), { recursive: true });
    mkdirSync(join(dir, 'kitchen'), { recursive: true });
    writeFileSync(join(dir, 'AGENTS.md'), 'agents\n');
    writeFileSync(join(dir, 'docs', 'box-v4', 'KITCHEN.md'), 'kitchen\n');
    writeFileSync(join(dir, 'kitchen', 'INBOX.md'), '- one\n');
    writeFileSync(join(dir, 'STATUS.md'), 'status\n');
    fakeRun(dir, dirName(NOW, sha('a')), { started: startedAt(NOW, sha('a')), summary: passAt(NOW, sha('a')) });
    fakeRun(dir, dirName(NOW + 60000, sha('b')), { started: startedAt(NOW + 60000, sha('b'), { steps: ['test:x'] }) });
    fakeRun(dir, dirName(NOW + 120000, sha('c')));
    const run = spawnSync(process.execPath, [join(root, 'scripts', 'kitchen-stats.mjs'), '--root=' + dir], { encoding: 'utf8' });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('1 runs with summary.json · 2 without');
    expect(run.stdout).toMatch(/started, unfinished — running or interrupted; planned test:x/);
    expect(run.stdout).toContain('no start record');
    expect(run.stdout).not.toMatch(/dead|killed/); // unfinished is a fact; dead is a claim
  });
});

describe('verify writes started.json before any step work (end to end)', () => {
  // The same fake-repository harness as verify-reuse.test.ts, with one
  // controllable step: `test:x` writes MARKER when it has started, then waits
  // for RELEASE — so the test synchronises on observable readiness, never a
  // fixed sleep, and the only process ever signalled is the verifier this
  // test spawned.
  function fakeRepo() {
    const dir = temp();
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    for (const name of readdirSync(join(root, 'scripts'))) {
      if (name.endsWith('.mjs') || name === 'toolchain.json') copyFileSync(join(root, 'scripts', name), join(dir, 'scripts', name));
    }
    const pnpmBin = join(dir, 'scripts', 'tooling', 'node_modules', 'pnpm', 'bin');
    mkdirSync(pnpmBin, { recursive: true });
    writeFileSync(join(pnpmBin, 'pnpm.cjs'), "const { spawnSync } = require('child_process');\nconst { readFileSync } = require('fs');\nconst { join } = require('path');\nconst scripts = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).scripts;\nconst name = process.argv[process.argv.indexOf('run') + 1];\nconst command = scripts[name];\nif (!command) process.exit(2);\nprocess.exit(spawnSync(command, { shell: true, stdio: 'inherit', cwd: process.cwd() }).status ?? 1);\n");
    const gated = 'node -e "const fs=require(\'fs\');fs.writeFileSync(process.env.MARKER,\'ready\');const t=setInterval(()=>{if(fs.existsSync(process.env.RELEASE)){clearInterval(t);process.exit(0)}},25)"';
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fake-repo', private: true, scripts: { 'test:x': gated } }));
    writeFileSync(join(dir, '.gitignore'), '.kitchen/\n');
    writeFileSync(join(dir, 'tracked.txt'), 'base\n');
    const gitDir = dir.replace(/[\\/]+$/, '').replaceAll(String.fromCharCode(92), '/');
    const git = (args: string[]) => execFileSync('git', ['-c', `safe.directory=${gitDir}`, '-c', 'user.email=kitchen@test.invalid', '-c', 'user.name=kitchen', ...args], { cwd: dir, encoding: 'utf8' }).trim();
    git(['init', '-q', '-b', 'master']);
    git(['add', '-A']);
    git(['commit', '-qm', 'init']);
    return { dir, git };
  }
  const waitFor = (path: string, timeout = 30000): Promise<void> => new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;
    const tick = () => existsSync(path) ? resolve() : Date.now() > deadline ? reject(new Error('timed out waiting for ' + path)) : setTimeout(tick, 25);
    tick();
  });

  it('a killed run leaves readable start evidence and no invented summary; PASS and refusal keep their records', async () => {
    const { dir, git } = fakeRepo();
    const head = git(['rev-parse', 'HEAD']);
    const marker = join(dir, '.kitchen', 'marker.txt'); // under .kitchen/ — gitignored, never dirties the tree
    const release = join(dir, '.kitchen', 'release.txt');
    const runsDir = join(dir, '.kitchen', 'runs');
    const env = { ...process.env, MARKER: marker, RELEASE: release };

    // 1 — kill the verifier mid-step: started.json survives, summary never appears.
    const killed = spawn(process.execPath, [join(dir, 'scripts', 'verify.mjs'), '--only', '--db=none', 'test:x'], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let killedOut = '';
    killed.stdout.on('data', chunk => { killedOut += chunk; });
    killed.stderr.on('data', chunk => { killedOut += chunk; });
    try {
      await waitFor(marker); // the step is running — the run dir must already exist
      const names = () => (existsSync(runsDir) ? readdirSync(runsDir) : []);
      expect(names().length).toBe(1);
      const runDir = join(runsDir, names()[0]!);
      // The marker exists BEFORE the step finishes: attribution survives a kill.
      const started = JSON.parse(readFileSync(join(runDir, 'started.json'), 'utf8'));
      expect(started.schemaVersion).toBe(1);
      expect(started.sha).toBe(head);
      expect(started.dirty).toBe(false);
      expect(started.steps).toEqual(['test:x']);
      expect(typeof started.startedAt).toBe('string');
      killed.kill('SIGKILL'); // uncatchable: no handler may invent a summary
      await new Promise(resolve => killed.once('exit', resolve));
      expect(existsSync(join(runDir, 'summary.json'))).toBe(false);
      expect(killedOut).not.toContain('PASS');
    } finally {
      writeFileSync(release, 'go'); // let the orphaned gated step exit on its own
      if (killed.exitCode === null && killed.signalCode === null) killed.kill('SIGKILL');
    }

    const names = () => new Set(existsSync(runsDir) ? readdirSync(runsDir) : []);
    const newDir = (before: Set<string>) => join(runsDir, readdirSync(runsDir).find(name => !before.has(name))!);

    // 2 — a normal PASS still writes its summary, now beside started.json.
    let before = names();
    const pass = spawnSync(process.execPath, [join(dir, 'scripts', 'verify.mjs'), '--only', '--db=none', 'test:x'], { cwd: dir, env: { ...env, MARKER: join(dir, '.kitchen', 'm2'), RELEASE: release }, encoding: 'utf8', timeout: 120000 });
    expect(pass.status).toBe(0);
    const passDir = newDir(before);
    const summary = JSON.parse(readFileSync(join(passDir, 'summary.json'), 'utf8'));
    expect(summary.verdict).toBe('PASS');
    expect(JSON.parse(readFileSync(join(passDir, 'started.json'), 'utf8')).sha).toBe(head);

    // 3 — a dirty tree is still refused at exit 3, and started.json already
    // records the attempt with its dirty-at-start flag.
    writeFileSync(join(dir, 'tracked.txt'), 'dirty\n');
    before = names();
    const refused = spawnSync(process.execPath, [join(dir, 'scripts', 'verify.mjs'), '--only', '--db=none', 'test:x'], { cwd: dir, env, encoding: 'utf8', timeout: 120000 });
    expect(refused.status).toBe(3);
    const refusedDir = newDir(before);
    expect(JSON.parse(readFileSync(join(refusedDir, 'started.json'), 'utf8')).dirty).toBe(true);
    expect(JSON.parse(readFileSync(join(refusedDir, 'summary.json'), 'utf8')).verdict).toBe('UNCOMMITTED');
  }, 240000);
});
