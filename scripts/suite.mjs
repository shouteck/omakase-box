// Runs one test suite under vitest: node scripts/suite.mjs <suite> [--suite <sub>].
// It also owns the two small maps that let verify stop repeating work (K5):
// which of `check`'s suites a branch's diff can reach, and when an earlier
// recorded PASS may stand in for a step. Importable — the script body is
// guarded, so verify.mjs and tests/kitchen can use the exported functions.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readRuns, LIVE_RULE_FILES } from './kitchen-stats.mjs';
import { root, runNode } from './process.mjs';

// --- which suites `check` owes a diff ----------------------------------------

// The fast gate's suites, in run order. `check` always runs typecheck on top
// of these. K29: the check suites belonged to the older platform — the set is
// empty and `check` is the typecheck alone. The selection machinery below
// stays: an unmapped path still means "every check suite" (none today), and
// the kitchen-suite rule is unaffected.
export const CHECK_SUITES = [];

// Path prefix -> the check suites whose tests can reach it (by what they
// import). Anything not listed here and not obviously inert runs every check
// suite — an unmapped path always means "more", never "less".
const CHECK_PATH_SUITES = [
  ['tests/box/', []],
  ['packages/box-bounty/', []],
  ['packages/box-cli/', []]
];
// K22 — files a kitchen test reads are never inert, however doc-shaped:
// scripts/kitchen-stats.mjs reads the four limit files and every waves/*.md
// (its "Runs per wave branch" section), and tests/kitchen drives the demo
// scripts directly. The hosted workflow's `paths` list mirrors this —
// isInert plus these exemptions is exactly what it encodes.
export const KITCHEN_TEST_READS = [
  'AGENTS.md',
  'STATUS.md',
  'kitchen/INBOX.md',
  'docs/box-v4/KITCHEN.md',
  'kitchen/demo/bt11b-replay.mjs',
  'kitchen/demo/gh-standin.cjs',
  'kitchen/demo/record.mjs',
];
// K35: the K35 rulebook guard (kitchen-stats checkLimits) reads every live
// rule, role, station-card and host-adapter file — LIVE_RULE_FILES is the
// same list it scans, and the role/station directories it enumerates are the
// two prefixes here, so reach and coverage cannot drift apart.
const isKitchenRead = path => KITCHEN_TEST_READS.includes(path) || LIVE_RULE_FILES.includes(path)
  || /^waves\/[^/]+\.md$/.test(path) || /^kitchen\/(roles|stations)\/[^/]+\.md$/.test(path);
// Prose and process only: no test reads these.
export const isInert = path => !isKitchenRead(path) && (path.endsWith('.md') || /^(docs|waves|kitchen|templates|milestones|research|tasks|\.devin|\.cursor)\//.test(path) || path === '.gitignore');
function checkSuitesForPath(path) {
  // Non-inert but read by no check suite — test:kitchen owes them instead
  // (kitchenSuiteReason below), so `check` owes them nothing.
  if (isKitchenRead(path)) return [];
  if (isInert(path)) return [];
  for (const [prefix, suites] of CHECK_PATH_SUITES) if (path.startsWith(prefix)) return suites;
  return CHECK_SUITES;
}

const BACKSLASH = String.fromCharCode(92);
function gitLines(rootDir, gitArgs) {
  const run = spawnSync('git', ['-c', `safe.directory=${rootDir.replace(/[\\/]+$/, '').replaceAll(BACKSLASH, '/')}`, ...gitArgs], { cwd: rootDir, encoding: 'utf8', windowsHide: true });
  return run.status === 0 ? run.stdout : null;
}

// Paths the working tree differs from master by: this branch's commits
// (merge-base..HEAD) plus anything uncommitted, renamed files counting both
// sides. null when git can't answer — callers treat that as "everything could
// have changed".
export function changedPaths(rootDir = root) {
  const diff = gitLines(rootDir, ['diff', '--name-only', 'master...HEAD']);
  const status = gitLines(rootDir, ['status', '--porcelain']);
  if (diff === null || status === null) return null;
  const paths = diff.split('\n').filter(Boolean);
  for (const line of status.split('\n')) {
    if (!line.trim()) continue;
    for (const side of line.slice(3).split(' -> ')) {
      const path = side.trim().replace(/^"|"$/g, '');
      if (path) paths.push(path);
    }
  }
  return paths;
}

// The check suites a set of changed paths needs. Pure: the table above is the
// whole story.
export function checkSuitesForPaths(paths) {
  const needed = new Set();
  for (const path of [...paths].sort()) {
    const suites = checkSuitesForPath(path);
    if (suites === CHECK_SUITES) return { suites: [...CHECK_SUITES], reason: `${path} can reach every check suite` };
    for (const suite of suites) needed.add(suite);
  }
  return { suites: CHECK_SUITES.filter(suite => needed.has(suite)), reason: 'only the suites the diff can reach' };
}

// What `check` must run this invocation. `--full` and an unreadable diff both
// mean everything.
export function selectCheckSuites(rootDir = root, { full = false } = {}) {
  if (full) return { suites: [...CHECK_SUITES], reason: '--full' };
  const paths = changedPaths(rootDir);
  if (paths === null) return { suites: [...CHECK_SUITES], reason: 'cannot diff against master — running everything' };
  return checkSuitesForPaths(paths);
}

// K22 — when a diff owes test:kitchen beyond the check map. `check`'s table
// only covers its own four suites, so a bounty-tool change used to skip the
// kitchen suite entirely: BT16 drifted the GitHub stand-ins under
// packages/box-bounty and only the hosted run noticed. The diff owes the
// suite when it touches the packages the built CLI is assembled from (the
// kitchen demo drives that build) or any file a kitchen test reads. An
// unreadable diff owes it too — the same fail-safe as check's every-suite
// fallback. Returns the reason for verify to print, or null.
const KITCHEN_SUITE_TRIGGERS = ['packages/box-bounty/', 'packages/box-cli/'];
const KITCHEN_READ_REASON = 'the change touches a file a kitchen test reads';
export function kitchenSuiteReason(paths) {
  if (paths === null) return 'the diff cannot be read — run it rather than guess';
  if (paths.some(path => KITCHEN_SUITE_TRIGGERS.some(prefix => path.startsWith(prefix)))) return 'the change reaches the built CLI the kitchen demo drives';
  if (paths.some(isKitchenRead)) return KITCHEN_READ_REASON;
  return null;
}

// Does this step read this path? K23's ancestor reuse and K24's dirty-tree
// reuse share the one answer: the files a kitchen test reads
// (KITCHEN_TEST_READS, waves/*.md — the paths kitchenSuiteReason reports)
// count as read by test:kitchen alone; to every other step they are the docs
// they look like. Any other non-inert path every step reads — an unmapped
// path always means "run it", never "skip it".
export const stepReadsPath = (step, path) =>
  kitchenSuiteReason([path]) === KITCHEN_READ_REASON ? step === 'test:kitchen' : !isInert(path);

// --- when an earlier PASS may stand in ----------------------------------------

// The trust anchor is the summary.json content — never the directory name or
// its mtime. A step may report `reused` only from a run whose summary says:
// this exact commit, verdict PASS on a clean tree, and this step exited 0 —
// or (K24) a run whose tree was dirty only in paths this step does not read:
// the summary's dirtyPaths (start and end of that run) decide, with
// stepReadsPath giving the same answer the ancestor walk gives. A dirty run
// that recorded no path list proves nothing. Consistency checks ride along
// so copied or hand-written records fail safe: the directory name must be
// exactly what verify would have made from that summary's own fields, and
// the step's log must exist. A reused `check` must also have covered at
// least the suites this invocation needs (pass `suites`), so a --full
// request never inherits a partial check; summaries from before this field
// existed ran all check suites. Anything that doesn't parse or match means
// a real run.
export function reusableStep(runsDir, sha, stepName, { suites = null } = {}) {
  for (const run of readRuns(runsDir).reverse()) {
    if (run.summary !== 'ok' || run.sha !== sha) continue;
    let parsed;
    try { parsed = JSON.parse(readFileSync(join(runsDir, run.name, 'summary.json'), 'utf8')); } catch { continue; }
    if (typeof parsed?.startedAt !== 'string' || Number.isNaN(Date.parse(parsed.startedAt))) continue;
    if (run.name !== `${parsed.startedAt.replace(/[:.]/g, '-')}-${sha.slice(0, 7)}`) continue;
    if (run.dirty === true) {
      if (!Array.isArray(parsed.dirtyPaths) || parsed.dirtyPaths.some(path => stepReadsPath(stepName, path))) continue;
    } else if (run.dirty !== false || run.verdict !== 'PASS') continue;
    if (suites) {
      const covered = Array.isArray(parsed.checkSuites) ? parsed.checkSuites : CHECK_SUITES;
      if (!suites.every(suite => covered.includes(suite))) continue;
    }
    const step = (Array.isArray(parsed.steps) ? parsed.steps : []).find(item => item && item.name === stepName && item.exit === 0);
    if (!step) continue;
    if (typeof step.log !== 'string' || /[\\/]/.test(step.log) || !existsSync(join(runsDir, run.name, step.log))) continue;
    return { run: run.name, seconds: typeof step.seconds === 'number' ? step.seconds : null };
  }
  return null;
}

// K7a: the packaging suite's test files run in parallel; every other suite
// keeps one worker. Each packaging file owns its temp folders and its own
// stats id, so workers never share mutable state.
// K12: the bounty suite joins at 3 workers — the audit that says its files
// share no state is pinned in tests/kitchen/k12-bounty-parallel.test.ts
// (mkdtemp roots, env mutations restored in finally, nothing written under
// the checkout, no global config, no sockets). The count is measured, not
// assumed: on this host the five biggest files took 212s at 3 workers and
// 241s at 6 — spawn contention wins past 3 (waves/K12.md).
export function suiteWorkers(suite, subgroup) {
  return suite === 'box' && subgroup === 'bounty' ? 3 : 1;
}

// K29: every suite that consumed the disposable Postgres went with the older
// platform. The set is empty and kept exported so the derivation pin in
// tests/kitchen/k12-db-suites.test.ts still guards it — a future suite that
// reaches a database must land here or that test fails.
export const DB_SUITES = new Set();

// Same for `check`: no check suite remains, so none can need a database.
export const DB_CHECK_SUITES = new Set();

// `test:*` package scripts are `node scripts/suite.mjs <suite> [--suite <sub>]`;
// the key is the suite's argument list, so verify knows `check` already ran it.
export function suiteKey(command) {
  const match = typeof command === 'string' && command.match(/suite\.mjs\s+(.+)$/);
  return match ? match[1].trim() : null;
}

// --- the suite runner itself --------------------------------------------------

async function main() {
  const [suite, ...raw] = process.argv.slice(2);
  const args = raw.filter(arg => arg !== '--');
  const subgroupIndex = args.indexOf('--suite');
  const subgroup = subgroupIndex >= 0 ? args[subgroupIndex + 1] : undefined;
  if (subgroupIndex >= 0 && (!subgroup || !/^[a-z0-9-]+$/.test(subgroup))) process.exit(2);
  const directory = join(root, 'tests', suite ?? '', subgroup ?? '');
  const files = args.filter((arg, index) => arg !== '--suite' && (subgroupIndex < 0 || index !== subgroupIndex + 1));
  function hasTests(path) {
    return existsSync(path) && readdirSync(path).some(name => {
      const item = join(path, name);
      return statSync(item).isDirectory() ? hasTests(item) : name.endsWith('.test.ts');
    });
  }
  if (!suite || !/^[a-z0-9-]+$/.test(suite) || args.includes('--real') || !hasTests(directory)) {
    console.log(JSON.stringify({ assurance: 'unverified', suite, subgroup, status: 'unavailable', reason: args.includes('--real') ? 'Real VM execution is not configured or implemented.' : 'This required suite has not been implemented.' }));
    process.exit(2);
  }
  const targets = [];
  const directoryReal = realpathSync(directory);
  for (const file of files) {
    const resolved = resolve(file);
    const real = existsSync(resolved) ? realpathSync(resolved) : null;
    if (!file.endsWith('.test.ts') || real === null || !real.startsWith(directoryReal + sep)) {
      console.error(`scoped run refuses ${file}: not an existing test file inside ${relative(root, directory)}`);
      process.exit(2);
    }
    targets.push(real.split(sep).join('/'));
  }
  if (files.length) console.log(`scoped run: ${targets.length} file(s) under ${relative(root, directory)} — this is an inner loop, never suite acceptance`);
  const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
  process.exit(await runNode(vitest, ['run', `--maxWorkers=${suiteWorkers(suite, subgroup)}`, ...(targets.length ? targets : [directory]), '--config', 'scripts/vitest.config.mjs'], { env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: join(root, '.runtime', 'browsers') } }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
