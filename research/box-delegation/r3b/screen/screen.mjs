// R3b-1 screening script. Runs INSIDE the kitchen-r3b-tools container only, fed on stdin
// (`node - <mode> ... < screen.mjs`), never on the host. Two modes:
//
//   prepare <base> <fix>                 network on:  clone/fetch, npm ci --ignore-scripts per distinct lockfile
//   run <id> <base> <fix> [--only A,B,C]  network none: the three runs, each command spawned directly (no shell)
//
// Every exit code below is spawnSync().status of the command itself. The script prints one JSON
// document on stdout; the host captures it. The script's own exit is 0 when it completed, whatever
// the test results were, so the docker exit code only says "the recording finished".
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';

const REPO_URL = 'https://github.com/tj/commander.js.git';
const REPO = '/src/repo';
const utc = () => new Date().toISOString();

function exec(argv, cwd, timeoutMs = 600_000) {
  const startedAt = utc();
  const r = spawnSync(argv[0], argv.slice(1), { cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 256 * 1024 * 1024 });
  return { argv, cwd, startedAt, endedAt: utc(), exit: r.status, signal: r.signal, error: r.error ? r.error.message : null, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
function must(argv, cwd) {
  const r = exec(argv, cwd);
  if (r.exit !== 0) { console.error(JSON.stringify(r, null, 2)); process.exit(3); }
  return r.stdout.trim();
}
const git = (...args) => must(['git', '-C', REPO, ...args]);
const show = (sha, path) => must(['git', '-C', REPO, 'show', `${sha}:${path}`]);
const lockHash = sha => createHash('sha256').update(exec(['git', '-C', REPO, 'show', `${sha}:package-lock.json`]).stdout).digest('hex');
const nmDir = sha => `/src/nm/${lockHash(sha)}`;

function runnerFor(sha, files) {
  const pkg = JSON.parse(show(sha, 'package.json'));
  const script = pkg.scripts?.test ?? '';
  if (/\bjest\b/.test(script)) return { runner: 'jest', testScript: script, argv: ['node', 'node_modules/jest/bin/jest.js', '--runTestsByPath', ...files] };
  if (/node --test/.test(script)) return { runner: 'node:test', testScript: script, argv: ['node', '--test', ...files] };
  return { runner: 'unknown', testScript: script, argv: null };
}

function prepare(base, fix) {
  const steps = [];
  if (!existsSync(REPO)) steps.push(exec(['git', 'clone', '--no-checkout', '--quiet', REPO_URL, REPO]));
  for (const sha of [base, fix]) {
    if (exec(['git', '-C', REPO, 'cat-file', '-e', `${sha}^{commit}`]).exit !== 0) steps.push(exec(['git', '-C', REPO, 'fetch', '--quiet', 'origin', sha]));
    const dir = nmDir(sha);
    if (existsSync(`${dir}/.installed`)) { steps.push({ note: `node_modules reused for ${sha}`, lockSha256: lockHash(sha), dir }); continue; }
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/package.json`, show(sha, 'package.json') + '\n');
    writeFileSync(`${dir}/package-lock.json`, exec(['git', '-C', REPO, 'show', `${sha}:package-lock.json`]).stdout);
    const install = exec(['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], dir);
    install.lockSha256 = lockHash(sha); install.forCommit = sha;
    if (install.exit === 0) writeFileSync(`${dir}/.installed`, sha + '\n');
    steps.push(install);
  }
  return { mode: 'prepare', base, fix, steps };
}

function worktree(name, sha) {
  const dir = `/src/wt/${name}`;
  exec(['git', '-C', REPO, 'worktree', 'remove', '--force', dir]);
  rmSync(dir, { recursive: true, force: true });
  git('worktree', 'prune');
  git('worktree', 'add', '--detach', '--quiet', dir, sha);
  must(['cp', '-al', `${nmDir(sha)}/node_modules`, `${dir}/node_modules`]);
  return dir;
}

function run(id, base, fix, only) {
  const isTest = f => /^tests\/.*\.test\.[cm]?[jt]s$/.test(f);
  const changed = git('diff', '--name-status', base, fix).split('\n').map(l => l.split('\t'));
  const fixTests = changed.filter(([s, f]) => s !== 'D' && isTest(f)).map(([, f]) => f);
  const touched = new Set(changed.map(c => c[c.length - 1]).concat(changed.map(c => c[1])));
  const guards = git('ls-tree', '-r', '--name-only', base, 'tests').split('\n').filter(f => isTest(f) && !touched.has(f));
  const out = { mode: 'run', id, repo: REPO_URL, base, fix, node: process.version, changed, fixTests, guards, lockSame: lockHash(base) === lockHash(fix), runs: {} };
  const record = (key, dir, sha, files, overlay) => {
    const r = runnerFor(sha, files);
    const head = must(['git', '-C', dir, 'rev-parse', 'HEAD']);
    const status = must(['git', '-C', dir, 'status', '--porcelain', '--untracked-files=no']);
    const rec = r.argv === null ? { exit: null, error: `unknown test runner: ${r.testScript}` } : exec(r.argv, dir);
    out.runs[key] = { ...rec, runner: r.runner, testScript: r.testScript, head, overlay, statusBeforeRun: status };
    exec(['git', '-C', REPO, 'worktree', 'remove', '--force', dir]);
  };
  if (only.includes('A')) {
    const dir = worktree(`${id}-A`, base);
    must(['git', '-C', dir, 'checkout', fix, '--', ...fixTests]);
    record('A_fixTests_at_base', dir, base, fixTests, `git checkout ${fix} -- ${fixTests.join(' ')}`);
  }
  if (only.includes('B')) record('B_fixTests_at_fix', worktree(`${id}-B`, fix), fix, fixTests, null);
  if (only.includes('C')) record('C_guards_at_base', worktree(`${id}-C`, base), base, guards, null);
  return out;
}

const [mode, ...rest] = process.argv.slice(2);
let result;
if (mode === 'prepare') result = prepare(rest[0], rest[1]);
else if (mode === 'run') {
  const i = rest.indexOf('--only');
  result = run(rest[0], rest[1], rest[2], i >= 0 ? rest[i + 1].split(',') : ['A', 'B', 'C']);
} else { console.error('usage: prepare <base> <fix> | run <id> <base> <fix> [--only A,B,C]'); process.exit(2); }
console.log(JSON.stringify(result, null, 2));
