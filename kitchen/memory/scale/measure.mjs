// K39 scale measurement — the four unmeasured PLAN.md scale targets, on this
// host, against the built CLI (packages/box-cli/dist/cli.js) and the same
// GitHub stand-in the bounty suite uses.
//
//   node kitchen/memory/scale/measure.mjs [--target=<1|2|3|4|all>]
//
// Default is all four targets. Requires `node scripts/workspace.mjs build`
// first. Everything happens under one %TEMP%\kitchen-k39-* root — scratch
// git repositories, bare remotes, owner settings and the gh stand-in — which
// a finally block removes. The owner's settings are never touched and nothing
// outside Git is left.
//
// Targets (PLAN.md):
//   1. `create` under 1 s on a 10,000-file repository — measured at 1,000 /
//      10,000 / 100,000 tracked files so the curve shows.
//   2. one whole `post` under 30 s — 0, 5 and 50 unpushed commits,
//      --with-changes, a fresh draft per run.
//   3. `status` and `look` stay usable with 100 open pull requests on one
//      bounty (each a real commit on the bare remote).
//   4. `apply` and `close` stay cheap with 1,000 records in the store —
//      compared against the same operations with 10 records.
//
// Every timed measurement: five runs, all five values printed, median and
// min–max range. Host load context: captureLoad() from
// scripts/host-load.mjs plus a sampled CPU busy fraction (os.cpus() idle
// delta over ~250 ms — Windows loadavg is a stub, never an observation).
// Wall time varies with load and is reported, never asserted.
//
// The stand-in and its NODE_OPTIONS preload are extracted VERBATIM from
// tests/box/bounty/github-fixture.ts at run time, so the measured GitHub is
// key-for-key the one the bounty suite pins (evidence card: a stand-in that
// answers is not one that answers correctly — reuse the proven one).

import { spawnSync } from 'node:child_process';
import { existsSync, linkSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { writeFile as writeFileAsync } from 'node:fs/promises';
import { cpus, tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureLoad } from '../../../scripts/host-load.mjs';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const CLI = join(REPO, 'packages', 'box-cli', 'dist', 'cli.js');
if (!existsSync(CLI)) throw new Error('build first: node scripts/workspace.mjs build');

// ---------- arguments ----------

const targetArg = (process.argv.slice(2).find(a => a.startsWith('--target=')) ?? '--target=all').split('=')[1];
const ALL_TARGETS = ['1', '2', '3', '4'];
const TARGETS = targetArg === 'all' ? ALL_TARGETS : targetArg.split(',').filter(t => ALL_TARGETS.includes(t));
if (TARGETS.length === 0) throw new Error(`no such --target: ${targetArg}`);

// ---------- scratch root + gh stand-in ----------

const root = mkdtempSync(join(tmpdir(), 'kitchen-k39-'));
const bin = join(root, 'bin');
mkdirSync(bin, { recursive: true });
const settings = join(root, 'settings');
mkdirSync(settings, { recursive: true });
writeFileSync(join(settings, 'settings.json'), JSON.stringify({
  kind: 'box-owner-settings',
  default: { bounty: 'allowed', at: '2026-10-13T00:00:00.000Z', changes: [] },
  projects: {}
}, null, 2) + '\n');

// Extract the proven stand-in + preload from the bounty fixture source.
const fixtureSrc = readFileSync(join(REPO, 'tests', 'box', 'bounty', 'github-fixture.ts'), 'utf8');
const rawBlocks = [...fixtureSrc.matchAll(/String\.raw`([\s\S]*?)`/g)].map(m => m[1]);
if (rawBlocks.length < 2 || !rawBlocks[0].includes('BT6_GH_STATE') || !rawBlocks[1].includes('gh')) {
  throw new Error('could not extract stand-in + preload from github-fixture.ts — layout changed');
}
const CANARY = 'ghp_' + 'K39_SYNTHETIC_CANARY_VALUE' + '0000000000';
writeFileSync(join(bin, 'standin.cjs'), rawBlocks[0].replaceAll('${leakCanary}', CANARY));
writeFileSync(join(bin, 'gh-preload.cjs'), rawBlocks[1]);
if (process.platform === 'win32') {
  try { linkSync(process.execPath, join(bin, 'gh.exe')); }
  catch { copyFileSync(process.execPath, join(bin, 'gh.exe')); }
} else {
  writeFileSync(join(bin, 'gh'), `#!/bin/sh\nexec '${process.execPath}' '${join(bin, 'standin.cjs')}' "$@"\n`);
}
const preloadPath = join(bin, 'gh-preload.cjs').replaceAll('\\', '/');

// envFor: one GitHub stand-in environment bound to one world (its own state
// file + its own bare remote). Mirrors github-fixture.ts withGhEnv: PATH puts
// the gh binary first, BT15_GH_PROGRAM names it, and the NODE_OPTIONS preload
// rewrites the https remote URL to the bare path inside every child process.
const envFor = (world) => ({
  ...process.env,
  NO_COLOR: '1',
  PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
  BOX_BOUNTY_SETTINGS_DIR: settings,
  BT6_GH_STATE: world.stateFile,
  BT6_GH_STANDIN: join(bin, 'standin.cjs'),
  BT15_GH_PROGRAM: join(bin, process.platform === 'win32' ? 'gh.exe' : 'gh'),
  BT8A_GIT_REMOTE: world.bare,
  BT6_GH_REMOTE_URL: `https://github.com/${world.repository}.git`,
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require ${preloadPath}`.trim()
});
// gitEnv: plain environment — git calls in this script name repositories and
// remotes by path, never by github.com URL, so they need no transport shim.
const gitEnv = { ...process.env, NO_COLOR: '1' };

function git(dir, args, opts = {}) {
  const run = spawnSync('git', [
    '-c', `safe.directory=${String(dir).replaceAll('\\', '/')}`,
    '-c', 'user.name=k39-measure', '-c', 'user.email=k39@measure.invalid',
    '-C', dir, ...args
  ], { encoding: 'utf8', env: gitEnv, maxBuffer: 256 * 1024 * 1024, input: opts.input });
  if (run.status !== 0) throw new Error(`git ${args.join(' ')} @ ${dir}: ${run.stderr || run.stdout}`);
  return run.stdout.trim();
}
const silence = (dir) => { git(dir, ['config', 'gc.auto', '0']); git(dir, ['config', 'maintenance.auto', 'false']); };

// One timed CLI invocation: wall time from process start to exit, plus the
// captured output. timeout is generous — a huge scale point is the thing
// being measured, never asserted.
function box(world, args) {
  const started = performance.now();
  const run = spawnSync(process.execPath, [CLI, 'bounty', ...args], {
    cwd: world.repo, encoding: 'utf8', env: envFor(world), timeout: 1800000, maxBuffer: 256 * 1024 * 1024
  });
  const ms = Math.round(performance.now() - started);
  if (run.error) throw new Error(`box bounty ${args.join(' ')}: ${run.error}`);
  const out = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  if (run.status !== 0) throw new Error(`box bounty ${args.join(' ')} exited ${run.status}: ${out}`);
  return { out, ms };
}

// ---------- host load ----------

async function cpuBusy(ms = 250) {
  try {
    const snap = () => cpus().map(c => ({ t: c.times.user + c.times.nice + c.times.sys + c.times.irq + c.times.idle, i: c.times.idle }));
    const a = snap();
    await new Promise(r => setTimeout(r, ms));
    const b = snap();
    let dt = 0, di = 0;
    for (let k = 0; k < a.length; k++) { dt += b[k].t - a[k].t; di += b[k].i - a[k].i; }
    return dt > 0 ? Math.round((1 - di / dt) * 100) : null;
  } catch { return null; }
}
async function load() {
  const busy = await cpuBusy();
  const snap = captureLoad();
  return {
    at: snap.capturedAt, platform: snap.platform, cpu: snap.cpu, memory: snap.memory,
    loadAverage: snap.loadAverage, cpuBusyPercentSampled: busy
  };
}

// ---------- helpers ----------

const RUNS = 5;
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const summarize = (label, mss, ld, extra = {}) => ({ label, runs: mss, median: median(mss), min: Math.min(...mss), max: Math.max(...mss), load: ld, ...extra });
const print = (cell) => console.log(`${cell.label.padEnd(56)} runs: ${cell.runs.map(String).join(', ').padEnd(42)} median ${cell.median} ms  range ${cell.min}–${cell.max} ms  cpuBusy≈${cell.load.cpuBusyPercentSampled}%`);
const lineCount = (text) => text.split('\n').filter(l => l.trim() !== '').length;

const results = { meta: { startedAt: new Date().toISOString(), cli: CLI, host: null, targetArg }, targets: {} };

const readState = (world) => JSON.parse(readFileSync(world.stateFile, 'utf8'));
const writeState = (world, change) => writeFileSync(world.stateFile, JSON.stringify({ ...readState(world), ...change }));

// One scratch git repository + bare "GitHub" remote + stand-in state, shaped
// like github-fixture.ts makeWorld: origin spelled as a github.com URL so the
// tool resolves owner/project; main already on the bare remote.
function makeWorld(name, files) {
  const dir = join(root, name);
  const repo = join(dir, 'repo');
  const bare = join(dir, 'remote.git');
  mkdirSync(repo, { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(repo, path, '..'), { recursive: true });
    writeFileSync(join(repo, path), content);
  }
  git(repo, ['init', '-b', 'main', '-q']);
  git(repo, ['config', 'core.autocrlf', 'false']);
  silence(repo);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-qm', 'fixture base']);
  git(repo, ['init', '--bare', '-q', bare]);
  silence(bare);
  git(repo, ['remote', 'add', 'origin', 'git@github.com:owner/project.git']);
  git(repo, ['push', '-q', bare, 'main']);
  const stateFile = join(dir, 'state.json');
  writeFileSync(stateFile, JSON.stringify({ visibility: 'public', private: false, auth: true, account: 'owner', repository: 'owner/project', issues: [], comments: [], prs: [], labels: [], calls: [] }));
  return { repo, bare, dir, stateFile, repository: 'owner/project' };
}
// A no-remote world for target 1: create is local, the stand-in stays armed
// anyway (a create that ever reached out would fail the measurement's story).
function makeLocalWorld(name) {
  const dir = join(root, name);
  const repo = join(dir, 'repo');
  mkdirSync(repo, { recursive: true });
  git(repo, ['init', '-b', 'main', '-q']);
  git(repo, ['config', 'core.autocrlf', 'false']);
  silence(repo);
  const stateFile = join(dir, 'state.json');
  writeFileSync(stateFile, JSON.stringify({ visibility: 'public', private: false, auth: true, account: 'owner', repository: 'owner/project', issues: [], comments: [], prs: [], labels: [], calls: [] }));
  return { repo, bare: join(dir, 'no-remote'), dir, stateFile, repository: 'owner/project' };
}

const createDraft = (world, why = 'scale measurement') => {
  const r = box(world, ['create', '--task', 'TASK.md', '--why', why]);
  const id = /bt-[a-f\d]{12}/.exec(r.out)?.[0];
  if (id === undefined) throw new Error(`create did not print an id: ${r.out}`);
  return { id, ms: r.ms };
};

// One solver pull request whose head is a real commit descending from the
// bounty branch tip — commit-tree plus one batched push to refs/pull/<n>/head,
// then the stand-in's prs entries (github-fixture.ts prCommit pattern).
function plantPrs(world, bountyId, startN, count, files = ['app.txt']) {
  const tip = git(world.bare, ['rev-parse', `refs/heads/box-bounty/${bountyId}`]);
  // One "fixed" tree reused by every PR: HEAD's tree with app.txt patched.
  const blob = git(world.repo, ['hash-object', '-w', '--stdin'], { input: 'fixed\n' });
  const listing = git(world.repo, ['ls-tree', 'HEAD']).split('\n').map(line => {
    const [meta, name] = line.split('\t');
    return name === 'app.txt' ? `100644 blob ${blob}\tapp.txt` : `${meta}\t${name}`;
  }).join('\n') + '\n';
  const tree = git(world.repo, ['mktree'], { input: listing });
  const shas = [];
  for (let n = startN; n < startN + count; n++) {
    // n goes into the message: identical parent+tree+message would mint
    // byte-identical commits (BT7b flake).
    shas.push(git(world.repo, ['commit-tree', tree, '-p', tip, '-m', `fix (pr ${n})`]));
  }
  git(world.repo, ['push', '-q', world.bare, ...shas.map((sha, i) => `+${sha}:refs/pull/${startN + i}/head`)]);
  const st = readState(world);
  writeState(world, {
    prs: [...st.prs, ...shas.map((sha, i) => ({
      number: startN + i, user: { login: `solver-${startN + i}` },
      base: { ref: `box-bounty/${bountyId}`, repo: { full_name: world.repository } },
      head: { sha }, files: files.map(filename => ({ filename }))
    }))]
  });
  return shas;
}

// ---------- target 1: create on 1k / 10k / 100k files ----------

async function generateFiles(repo, n) {
  const started = performance.now();
  const POOL = 64;
  let next = 0;
  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= n) return;
      const dir = join(repo, 'src', `dir-${String(Math.floor(i / 100)).padStart(4, '0')}`);
      mkdirSync(dir, { recursive: true });
      const big = i % 997 === 0;
      const size = big ? 150_000 : 300 + (i * 37) % 2700;
      const line = `file ${i} — synthetic content for the scale fixture; the same line repeats to size.\n`;
      const text = line.repeat(Math.ceil(size / line.length)).slice(0, size);
      await writeFileAsync(join(dir, `file-${String(i).padStart(6, '0')}.txt`), text);
    }
  };
  await Promise.all(Array.from({ length: POOL }, worker));
  return Math.round(performance.now() - started);
}

function countOnDisk(repo) {
  let count = 0;
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === '.box') continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p); else count++;
    }
  };
  walk(repo);
  return count;
}

async function target1() {
  const out = {};
  for (const n of [1000, 10000, 100000]) {
    console.log(`\n=== target 1: create on ${n} tracked files ===`);
    const world = makeLocalWorld(`t1-${n}`);
    writeFileSync(join(world.repo, 'TASK.md'), 'Finish the nested-comment fixture.\n');
    writeFileSync(join(world.repo, 'AGENTS.md'), '# fixture\n\nDo the task and verify it.\n');
    const genMs = await generateFiles(world.repo, n);
    const addStart = performance.now();
    git(world.repo, ['add', '-A']);
    git(world.repo, ['commit', '-qm', `fixture base of ${n} files`]);
    const addMs = Math.round(performance.now() - addStart);
    const tracked = git(world.repo, ['ls-files']).split('\n').filter(Boolean).length;
    const onDisk = countOnDisk(world.repo);
    // A handful of uncommitted edits and untracked files, as a real repo has.
    const some = git(world.repo, ['ls-files', 'src/dir-0000/*']).split('\n').filter(Boolean).slice(0, 8);
    for (const p of some) writeFileSync(join(world.repo, p), `edited for the scale run\n`);
    mkdirSync(join(world.repo, 'scratch-notes'), { recursive: true });
    for (let i = 0; i < 6; i++) writeFileSync(join(world.repo, 'scratch-notes', `untracked-${i}.txt`), 'untracked scratch\n');
    const ld = await load();
    const mss = [], ids = [], failures = [];
    for (let i = 0; i < RUNS; i++) {
      // A failed create is a measured result, not a harness abort: record the
      // wall time to the failure and the first line of its error.
      const t0 = performance.now();
      try {
        const r = createDraft(world);
        mss.push(r.ms); ids.push(r.id);
      } catch (error) {
        mss.push(Math.round(performance.now() - t0));
        ids.push(null);
        // Keep the part of the message before the stdout dump — the failure
        // signature, not the megabyte of ls-tree output.
        const sig = String(error).replace(/: blob [\s\S]*/, ': <tree listing>');
        failures.push(sig.split('\n')[0].slice(0, 300));
        // An identical failure twice is deterministic: a fixed-size buffer
        // (ENOBUFS) cannot be out-waited, and each further run only re-pays
        // the same add -A. Stop and measure the failing call directly below.
        if (failures.length >= 2 && failures[failures.length - 1] === failures[failures.length - 2]) break;
      }
    }
    const okCount = ids.filter(id => id !== null).length;
    const cell = okCount === mss.length
      ? summarize(`create @ ${n} files`, mss, ld, { ids })
      : { label: `create @ ${n} files`, runs: mss, failures, succeeded: okCount, stoppedEarly: failures.length >= 2 && failures[failures.length - 1] === failures[failures.length - 2], median: median(mss), min: Math.min(...mss), max: Math.max(...mss), load: ld };
    // When create fails, time the actual failing call 5× with the tool's own
    // buffer semantics (spawnSync default = 1 MiB): `git ls-tree -r` against
    // the committed tree — the call that overflows.
    if (failures.length > 0) {
      const headCommit = git(world.repo, ['rev-parse', 'HEAD']);
      const micro = [];
      for (let i = 0; i < RUNS; i++) {
        const t0 = performance.now();
        const r = spawnSync('git', ['-c', 'core.quotepath=false', 'ls-tree', '-r', '-z', '--format=%(objecttype) %(objectsize) %(path)', headCommit], { cwd: world.repo, encoding: 'utf8' });
        micro.push({ ms: Math.round(performance.now() - t0), error: r.error ? String(r.error.message ?? r.error).split('\n')[0] : (r.status !== 0 ? `exit ${r.status}` : 'ok'), outChars: (r.stdout ?? '').length });
      }
      cell.failingCall = { call: `git ls-tree -r -z ${headCommit} (spawnSync default 1 MiB buffer)`, runs: micro };
      console.log(`  failing call isolated: ${micro.map(m => `${m.ms} ms ${m.error}`).join(', ')}`);
    }
    cell.fixture = { generatedFilesMs: genMs, addCommitMs: addMs, gitLsFiles: tracked, filesOnDisk: onDisk, uncommittedEdits: some.length, untracked: 6 };
    print(cell);
    if (failures.length > 0) console.log(`  ${failures.length} run(s) FAILED — first error: ${failures[0]}`);
    console.log(`  fixture: ${tracked} tracked (git ls-files), ${onDisk} files on disk; generation ${genMs} ms, add+commit ${addMs} ms`);
    out[n] = cell;
  }
  results.targets['1'] = out;
}

// ---------- target 2: one whole post ----------

async function target2() {
  console.log('\n=== target 2: whole post, 0 / 5 / 50 unpushed commits ===');
  const out = {};
  for (const ahead of [0, 5, 50]) {
    const world = makeWorld(`t2-${ahead}`, { 'app.txt': 'broken\n', 'check.cjs': 'process.exit(0);\n', 'TASK.md': 'Repair the app.\n' });
    for (let i = 0; i < ahead; i++) git(world.repo, ['commit', '--allow-empty', '-qm', `local work ${i + 1}`]);
    const tip = git(world.repo, ['rev-parse', 'HEAD']);
    const worldOut = { aheadOfRemote: ahead };

    // Isolated push leg: the same tip to a fresh ref on the same remote.
    {
      const ld = await load();
      const mss = [];
      for (let i = 0; i < RUNS; i++) {
        const started = performance.now();
        git(world.repo, ['push', '-q', world.bare, `${tip}:refs/heads/k39-probe-${i}`]);
        mss.push(Math.round(performance.now() - started));
      }
      const cell = summarize(`git push control @ ${ahead} unpushed`, mss, ld);
      print(cell);
      worldOut.pushControl = cell;
    }

    // Isolated local leg: --preview runs plan + scan, no push, no gh calls.
    {
      const ld = await load();
      const mss = [];
      for (let i = 0; i < RUNS; i++) {
        writeFileSync(join(world.repo, 'app.txt'), `broken — edited ${i}\n`);
        const { id } = createDraft(world);
        const r = box(world, ['post', id, '--preview', '--with-changes']);
        mss.push(r.ms);
      }
      const cell = summarize(`post --preview (plan+scan, no publish) @ ${ahead}`, mss, ld);
      print(cell);
      worldOut.preview = cell;
    }

    // The measured thing: fresh draft + uncommitted change per run, so every
    // post runs the full publish path.
    {
      const ld = await load();
      const mss = [], extras = [];
      for (let i = 0; i < RUNS; i++) {
        writeFileSync(join(world.repo, 'app.txt'), `broken — edited ${i}\n`);
        const { id } = createDraft(world);
        const callsBefore = readState(world).calls.length;
        const r = box(world, ['post', id, '--with-changes']);
        mss.push(r.ms);
        extras.push({ ghCalls: readState(world).calls.length - callsBefore });
      }
      const cell = summarize(`post --with-changes @ ${ahead} unpushed`, mss, ld, { extras });
      print(cell);
      worldOut.post = cell;
    }
    out[ahead] = worldOut;
  }
  results.targets['2'] = out;
}

// ---------- target 3: 100 pull requests on one bounty ----------

async function target3() {
  console.log('\n=== target 3: 100 pull requests on one posted bounty ===');
  const world = makeWorld('t3', { 'app.txt': 'broken\n', 'check.cjs': 'process.exit(0);\n', 'TASK.md': 'Repair the app.\n' });
  const { id } = createDraft(world);
  box(world, ['post', id]);
  plantPrs(world, id, 1, 100);
  const prCount = readState(world).prs.length;
  const refCount = git(world.bare, ['for-each-ref', 'refs/pull/']).split('\n').filter(Boolean).length;
  console.log(`  fixture: ${prCount} PRs in the stand-in, ${refCount} refs/pull/*/head on the remote`);
  const out = { bountyId: id, prs: prCount, pullRefsOnRemote: refCount };

  // status: run 1 is first discovery (collects every unseen attempt); runs
  // 2-5 are steady-state — reported separately, never averaged together.
  {
    const ld = await load();
    const first = box(world, ['status']);
    const steady = [];
    for (let i = 0; i < RUNS - 1; i++) steady.push(box(world, ['status']).ms);
    out.status = {
      label: 'status (100 PRs)',
      firstDiscovery: { ms: first.ms, load: ld },
      steadyState: { runs: steady, median: median(steady), min: Math.min(...steady), max: Math.max(...steady) },
      output: { lines: lineCount(first.out), chars: first.out.length },
      load: ld
    };
    console.log(`status (100 PRs): first discovery ${first.ms} ms; steady-state ${steady.join(', ')} median ${median(steady)} ms — output ${out.status.output.lines} lines / ${out.status.output.chars} chars`);
  }
  for (const [label, args] of [
    ['status --full (100 PRs)', ['status', '--full']],
    ['status --json (100 PRs)', ['status', '--json']],
    [`look ${id} 1 (first of 100)`, ['look', id, '1']],
    [`look ${id} 100 (last of 100)`, ['look', id, '100']]
  ]) {
    const ld = await load();
    const mss = [];
    let last = null;
    for (let i = 0; i < RUNS; i++) { const r = box(world, args); mss.push(r.ms); last = r; }
    const cell = summarize(label, mss, ld, { output: { lines: lineCount(last.out), chars: last.out.length } });
    print(cell);
    out[label.split(' ')[0] === 'look' ? (args[2] === '1' ? 'look1' : 'look100') : args[1].replace('--', '')] = cell;
  }
  results.targets['3'] = out;
}

// ---------- target 4: apply + close at 1,000 records vs 10 ----------

const recordId = (i) => `bt-${(i + 1).toString(16).padStart(12, '0')}`;
const recordAt = (i, step) => new Date(Date.parse('2026-01-05T09:00:00Z') + i * 86400000 + step * 3600000).toISOString();
// K25's generator pattern: compat record files in .box/bounties/ that the
// tool's own import path persists into .box/local/box.db on the next command.
function seedRecords(world, n) {
  const dir = join(world.repo, '.box', 'bounties');
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < n; i++) {
    const open = i < 5;
    const stage = open ? 'posted' : (i % 2 === 0 ? 'applied' : 'rejected');
    const events = [
      { stage: 'drafted', at: recordAt(i, 0), command: 'create' },
      { stage: 'confirmed', at: recordAt(i, 1), command: 'confirm' },
      { stage: 'posted', at: recordAt(i, 2), command: 'post', destination: 'folder' }
    ];
    if (stage === 'applied') events.push({ stage: 'applied', at: recordAt(i, 3), command: 'apply', attempt: 1, merge: '0'.repeat(40) });
    else if (stage === 'rejected') events.push({ stage: 'rejected', at: recordAt(i, 3), command: 'close', reason: 'the fixture was retired upstream' });
    writeFileSync(join(dir, `${recordId(i)}.json`), JSON.stringify({
      schemaVersion: 1, kind: 'box-bounty-record', id: recordId(i),
      title: `Finish the nested-comment fixture, part ${i + 1}`,
      why: 'the recursion case is design work beyond this session', noteSource: 'authored',
      resume: { kind: 'recorded', branch: 'main', commit: '(no commits yet)', changed: ['src/parser/tree.ts'], note: 'Resume the parser refactor on this branch: the tokeniser is split.' },
      stage,
      content: { task: { file: 'TASK.md', text: 'Finish the fixture.' }, note: { file: 'NOTE.md', text: 'Tried first.' }, tool: 'box-bounty' },
      createdAt: recordAt(i, 0), events
    }, null, 2) + '\n');
  }
}

async function target4() {
  console.log('\n=== target 4: apply + close at 1,000 vs 10 records ===');
  const out = {};
  for (const n of [10, 1000]) {
    const world = makeWorld(`t4-${n}`, { 'app.txt': 'broken\n', 'check.cjs': 'process.exit(0);\n', 'TASK.md': 'Repair the app.\n' });
    seedRecords(world, n);
    box(world, ['status']); // the store's own import path persists the seeds
    const stored = readdirSync(join(world.repo, '.box', 'bounties')).filter(f => f.endsWith('.json')).length;
    // 10 posted bounties with one solver PR each, collected — 5 apply, 5 close.
    const ids = [];
    for (let i = 0; i < 10; i++) {
      const { id } = createDraft(world, `target 4 bounty ${i + 1}`);
      box(world, ['post', id]);
      plantPrs(world, id, i + 1, 1); // this bounty's PR is stand-in number i+1
      box(world, ['look', id, String(i + 1)]); // collect the attempt (records n = pr number)
      ids.push(id);
    }
    const ld = await load();
    const applyRuns = ids.slice(0, 5).map((id, i) => box(world, ['apply', id, String(i + 1)]).ms);
    const closeRuns = ids.slice(5).map(id => box(world, ['close', id, '--reason', 'scale']).ms);
    out[n] = {
      recordsSeeded: n, recordFilesSeen: stored,
      apply: summarize(`apply @ ${n} records`, applyRuns, ld),
      close: summarize(`close @ ${n} records`, closeRuns, ld)
    };
    print(out[n].apply);
    print(out[n].close);
  }
  results.targets['4'] = out;
}

// ---------- main ----------

try {
  results.meta.host = await load();
  console.log(`host: ${results.meta.host.cpu.model} (${results.meta.host.cpu.logicalCores} cores), free memory ${Math.round((results.meta.host.memory?.freeBytes ?? 0) / 1e9)} GB, sampled busy ≈${results.meta.host.cpuBusyPercentSampled}% — Windows loadavg is a stub, see captureLoad note`);
  if (TARGETS.includes('1')) await target1();
  if (TARGETS.includes('2')) await target2();
  if (TARGETS.includes('3')) await target3();
  if (TARGETS.includes('4')) await target4();
  console.log('\n=== json ===');
  console.log(JSON.stringify(results, null, 2));
} finally {
  rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
}
