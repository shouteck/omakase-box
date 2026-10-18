// The kitchen's single acceptance command: node scripts/verify.mjs [--only] [--full] [--fresh] [suite...]
// Runs check, build and the named package scripts on the host,
// writes one log per step plus summary.json under .kitchen/runs/, and exits 0 only when every step passed
// on a committed tree.
// K29: no remaining suite reads a database, so the disposable Postgres
// provisioning (embedded/docker/KITCHEN_PG_URL) is gone and every run reports
// db=none; scripts/docker.mjs and the embedded-postgres dependency went with it.
// K5: a step already PASS on this exact commit with a clean tree reports `reused` (~0s) instead of re-running —
// the recorded summary.json is the trust anchor, `--fresh` forces real runs. K23: a PASS on an ancestor (the
// nearest 20 commits walked) also stands in for a step when every path between it and HEAD is one the step does
// not read — a Result commit that only edits its wave file no longer re-runs the bounty suite. K24: a tree
// dirty at the start still refuses, but a run that ends dirty keeps a per-step reusable verdict — a step's
// PASS counts for the commit when every path the tree was dirty in (start and end) is one that step does
// not read, so a wave file edited mid-run costs no rerun. `check` runs only
// the suites this branch's diff can reach (`--full` runs them all), and no suite runs twice inside one invocation.
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './process.mjs';
import { changedPaths, kitchenSuiteReason, reusableStep, selectCheckSuites, stepReadsPath, suiteKey } from './suite.mjs';

const args = process.argv.slice(2);
const only = args.includes('--only');
const fresh = args.includes('--fresh');
const full = args.includes('--full');
const suites = args.filter(arg => !arg.startsWith('--'));
// K29: the disposable-Postgres modes went with the older platform. `--db=none`
// stays as the kept callers' no-database spelling; every other --db form must
// refuse here, before any check/build/suite or run-directory work — a green
// run that silently never provided a database is the failure this guards.
const dbArg = args.find(arg => (arg === '--db' || arg.startsWith('--db=')) && arg !== '--db=none');
if (dbArg !== undefined) {
  console.error(`verify: ${dbArg} refused — the database modes were removed with the older platform (K29); no remaining suite needs one. Drop the flag or pass --db=none.`);
  process.exit(2);
}
const { scripts } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const unknown = suites.filter(name => !Object.hasOwn(scripts, name));
if (unknown.length) {
  console.error(`Unknown package script: ${unknown.join(', ')}`);
  process.exit(2);
}
// K22: the committed diff against master can owe test:kitchen even when the
// caller did not name it — `check`'s reach map only covers its own suites,
// and BT16's stand-in drift shipped under a bounty change verify ran without
// the kitchen suite. --only narrows check/build, never this.
const kitchenReason = kitchenSuiteReason(changedPaths(root));
if (kitchenReason !== null && !suites.includes('test:kitchen')) {
  suites.push('test:kitchen');
  console.log(`added test:kitchen: ${kitchenReason}`);
}
const steps = [...(only ? [] : ['check', 'build']), ...suites];
if (!steps.length) { console.error('Nothing to run.'); process.exit(2); }

const checkout = root.replace(/[\\/]+$/, '').replaceAll('\\', '/');
function capture(command, commandArgs) {
  return new Promise(resolve => {
    const child = spawn(command, commandArgs, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.on('error', () => resolve(null));
    child.on('exit', code => resolve(code === 0 ? output : null));
  });
}
const git = gitArgs => capture('git', ['-c', `safe.directory=${checkout}`, ...gitArgs]);
const sha = (await git(['rev-parse', 'HEAD']))?.trim();
const status = await git(['status', '--porcelain', '-uall']);
if (!sha || status === null) { console.error('Cannot read the Git revision.'); process.exit(2); }
// -uall: porcelain otherwise collapses an untracked directory into one
// `?? dir/` line, hiding which path inside it a step might read. Porcelain
// lines carry a two-letter status and renames carry both sides; the dirty
// path set is what the reuse rule reasons about.
const porcelainPaths = output => output.split('\n').filter(line => line.trim()).flatMap(line => line.slice(3).split(' -> ').map(side => side.trim().replace(/^"|"$/g, '')).filter(Boolean));
const dirtyPathsStart = porcelainPaths(status);
const dirty = dirtyPathsStart.length > 0;

const startedAt = new Date();
const runDirectory = join(root, '.kitchen', 'runs', `${startedAt.toISOString().replace(/[:.]/g, '-')}-${sha.slice(0, 7)}`);
mkdirSync(runDirectory, { recursive: true });
if (dirty) {
  const line = `verify ${sha.slice(0, 7)}+dirty UNCOMMITTED not-run=${steps.join(',')} db=none 0s (refused before database, build and tests: uncommitted changes)`;
  writeFileSync(join(runDirectory, 'summary.json'), JSON.stringify({ schemaVersion: 1, sha, dirty: true, verdict: 'UNCOMMITTED', startedAt: startedAt.toISOString(), seconds: 0, database: 'none', profile: full ? `verify --full ${suites.join(' ')}` : null, checkSuites: null, steps: [], notRun: steps, dirtyPaths: dirtyPathsStart, failure: 'uncommitted changes in the working tree', line }, null, 2) + '\n');
  console.error('verify: refusing before database, build or test work — the working tree has uncommitted changes:');
  for (const path of dirtyPathsStart) console.error(`  ${path}`);
  console.log(`\n${line}\nLogs: ${runDirectory}`);
  process.exit(3);
}
// K24: a run that STARTS clean but ends dirty — a wave file edited while the
// suites ran — is no longer wasted. The verdict stays UNCOMMITTED (+dirty,
// exit 3), but a step's PASS counts for the commit when every path the tree
// was dirty in, at the start and again at the end, is one that step does not
// read (the same stepReadsPath rule the ancestor reuse below uses). A step
// that read a dirty path ran against uncommitted content: its result is
// recorded with reusable:false and stands for nothing.
const pnpm = fileURLToPath(new URL('./pnpm.mjs', import.meta.url));
function runStep(name, env) {
  return new Promise(resolve => {
    const log = `${name.replace(/[^a-z0-9-]/gi, '_')}.log`;
    const sink = createWriteStream(join(runDirectory, log));
    const began = Date.now();
    const child = spawn(process.execPath, [pnpm, name], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { sink.write(chunk); process.stdout.write(chunk); });
    const finish = exit => sink.end(() => resolve({ name, exit, seconds: Math.round((Date.now() - began) / 1000), log }));
    child.on('error', () => finish(127));
    child.on('exit', code => finish(code ?? 1));
  });
}

// K23 — a recorded PASS on an ancestor also stands in for a step when every
// path the commits since then changed is one the step does not read, judged
// by suite.mjs's stepReadsPath (exported for K24's dirty-tree rule and
// reusableStep's own check): the kitchen inputs (KITCHEN_TEST_READS,
// waves/*.md) count as read by test:kitchen alone; to every other step they
// are the docs they look like. Anything else every step reads — an unmapped
// path always means "run it", never "skip it".
// The nearest 20 ancestors of HEAD (rev-list order, HEAD itself skipped),
// each paired with the paths it differs from HEAD by. Computed lazily, once
// per invocation, shared by every step; a git answer that cannot be read ends
// the walk — a missing diff is no basis for reuse.
let ancestorDiffs;
async function ancestorsBefore() {
  if (ancestorDiffs !== undefined) return ancestorDiffs;
  ancestorDiffs = [];
  const list = await git(['rev-list', '--max-count=21', 'HEAD']);
  if (list === null) return ancestorDiffs;
  for (const ancestor of list.split('\n').map(line => line.trim()).filter(Boolean).slice(1)) {
    const diff = await git(['diff', '--name-only', ancestor, 'HEAD']);
    if (diff === null) break;
    ancestorDiffs.push({ sha: ancestor, paths: diff.split('\n').filter(Boolean) });
  }
  return ancestorDiffs;
}
// Exact-commit reuse first; then ancestors nearest-first, each only when its
// whole distance to HEAD is unread by this step. An ancestor whose recorded
// run failed or sat on a dirty tree is skipped by reusableStep's own checks.
async function reusableStepFor(name, options) {
  const exact = reusableStep(runsDir, sha, name, options);
  if (exact !== null) return exact;
  for (const { sha: ancestor, paths } of await ancestorsBefore()) {
    if (paths.some(path => stepReadsPath(name, path))) continue;
    const hit = reusableStep(runsDir, ancestor, name, options);
    if (hit !== null) return { ...hit, ancestor };
  }
  return null;
}

let db = { kind: 'none', stop: async () => undefined };
const results = [];
let failure;
// checkPlan: which suites this invocation's check covers — used to keep a named
// suite from running twice and to demand enough coverage from a reused check.
const checkPlan = steps.includes('check') ? selectCheckSuites(root, { full }) : null;
const checkCovered = new Set();
const ran = new Set();
const runsDir = join(root, '.kitchen', 'runs');
const stopAndExit = () => db.stop().finally(() => process.exit(130));
process.on('SIGINT', stopAndExit);
process.on('SIGTERM', stopAndExit);
try {
  const env = { ...process.env, ...(full ? { KITCHEN_CHECK_FULL: '1' } : {}) };
  for (const name of steps) {
    // A suite check already ran this invocation, or a step named twice, costs nothing.
    const key = suiteKey(scripts[name]);
    if (ran.has(name) || (key && checkCovered.has(key))) {
      results.push({ name, exit: 0, seconds: 0, reused: 'this run' });
      ran.add(name);
      console.log(`verify: ${name} already covered by this run — reused`);
      continue;
    }
    // A recorded PASS on this exact commit with a clean tree stands in — or
    // (K23) one on an ancestor whose whole distance to HEAD is paths this
    // step does not read — or (K24) one on this commit or an ancestor that
    // ran on a tree dirty only where this step does not read. A dirty tree
    // of our own changes nothing about what those earlier runs proved;
    // --fresh always runs for real.
    const hit = fresh ? null : await reusableStepFor(name, name === 'check' ? { suites: checkPlan.suites } : {});
    if (hit) {
      results.push({ name, exit: 0, seconds: 0, reused: hit.run, reusedSeconds: hit.seconds, ...(hit.ancestor === undefined ? {} : { ancestor: hit.ancestor }) });
      ran.add(name);
      console.log(`verify: ${name} reused a recorded PASS from ${hit.run}${hit.ancestor === undefined ? '' : ` (ancestor ${hit.ancestor.slice(0, 7)}, only inert paths changed)`}`);
      if (name === 'check') for (const suite of checkPlan.suites) checkCovered.add(suite);
      continue;
    }
    const result = await runStep(name, env);
    results.push(result);
    ran.add(name);
    if (name === 'check' && result.exit === 0) for (const suite of checkPlan.suites) checkCovered.add(suite);
    if (result.exit !== 0) break;
  }
} catch (error) { failure = error instanceof Error ? error.message : String(error); }
finally { await db.stop(); }

const statusAfter = await git(['status', '--porcelain', '-uall']);
const statusReadFailed = statusAfter === null;
// K24: the dirty set is every path seen uncommitted at the start OR the end
// of the run — a file dirtied between the two reads is the gap the union
// closes. Each step records whether none of those paths is one it reads;
// reusableStep re-derives the same answer from this list before trusting it.
const dirtyPaths = statusReadFailed ? null : [...new Set([...dirtyPathsStart, ...porcelainPaths(statusAfter)])];
const dirtyAny = statusReadFailed || dirtyPaths.length > 0;
const finalStatus = statusReadFailed ? 'unreadable' : dirtyAny ? 'dirty' : 'clean';
if (dirtyAny) for (const result of results) result.reusable = dirtyPaths !== null && dirtyPaths.every(path => !stepReadsPath(result.name, path));
const passed = !failure && results.length === steps.length && results.every(result => result.exit === 0);
const verdict = !passed ? 'FAIL' : dirtyAny ? 'UNCOMMITTED' : 'PASS';
const notRun = steps.slice(results.length);
const seconds = Math.round((Date.now() - startedAt.getTime()) / 1000);
const stepCell = result => `${result.name}=${result.reused ? `reused@${result.reused}${result.ancestor === undefined ? '' : `(ancestor ${result.ancestor.slice(0, 7)}, only inert paths changed)`}` : result.exit}`;
const line = `verify ${sha.slice(0, 7)}${dirtyAny ? '+dirty' : ''} ${verdict} ${results.map(stepCell).join(' ')}${notRun.length ? ` not-run=${notRun.join(',')}` : ''} db=${db.kind} ${seconds}s${failure ? ` (${failure})` : ''}`;
writeFileSync(join(runDirectory, 'summary.json'), JSON.stringify({ schemaVersion: 1, sha, dirty: dirtyAny, verdict, startedAt: startedAt.toISOString(), seconds, database: db.kind, profile: full ? `verify --full ${suites.join(' ')}` : null, checkSuites: checkPlan ? [...checkCovered] : null, steps: results, notRun, failure: failure ?? null, finalStatus, dirtyPaths, line }, null, 2) + '\n');
console.log(`\n${line}\nLogs: ${runDirectory}`);
if (statusReadFailed) console.error('verify: final Git status could not be read (git status --porcelain failed) — the run is dirty/unreadable and not reusable.');
else if (dirtyAny) {
  console.error('verify: the run saw uncommitted paths (filenames only):');
  for (const path of dirtyPaths.slice(0, 50)) console.error(`  ${path}`);
  if (dirtyPaths.length > 50) console.error(`  … and ${dirtyPaths.length - 50} more`);
  const counted = results.filter(result => result.reusable === false).map(result => result.name);
  if (counted.length) console.error(`verify: these steps read a dirty path — their PASSes count for nothing (${counted.join(', ')})`);
}

// Stall guard (advisory only): when this branch keeps producing non-PASS runs,
// print a STALL line telling the agent to park the wave. It never changes the
// verdict text or the exit code. Keying: a run counts when its summary sha — or
// its dir-name sha when no summary was written — is a commit unique to this
// branch (merge-base..HEAD) or the branch point itself, so dirty runs made
// before the first commit lands still count; only a clean PASS breaks the streak.
try {
  const { readRuns, stallCheck } = await import('./kitchen-stats.mjs');
  const stallRuns = Number(args.find(arg => arg.startsWith('--stall-runs='))?.slice(13)) || 6;
  const stallMinutes = Number(args.find(arg => arg.startsWith('--stall-minutes='))?.slice(16)) || 90;
  const branch = ((await git(['rev-parse', '--abbrev-ref', 'HEAD'])) ?? '').trim() || 'HEAD';
  const base = branch !== 'master' && branch !== 'HEAD' ? ((await git(['merge-base', 'HEAD', 'master'])) ?? '').trim() : null;
  const listed = (await git(base ? ['rev-list', `${base}..HEAD`] : ['rev-list', 'HEAD'])) ?? '';
  const stall = stallCheck(readRuns(join(root, '.kitchen', 'runs')), new Set([...listed.split('\n').map(item => item.trim()).filter(Boolean), sha, base].filter(Boolean)), { maxRuns: stallRuns, maxMinutes: stallMinutes });
  if (stall) console.log(`STALL ${branch === 'HEAD' ? 'on detached HEAD' : `on branch ${branch}`}: ${stall.triggers.join('; ')} — park the wave and report what was tried instead of re-running verify`);
} catch { /* advisory only: a broken stall check must not change the verdict */ }
process.exit(verdict === 'PASS' ? 0 : verdict === 'UNCOMMITTED' ? 3 : 1);
