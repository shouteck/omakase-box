// Runs one test suite under vitest: node scripts/suite.mjs <suite> [--suite <sub>].
// It also owns the small maps that let verify stop repeating work (K5):
// which of `check`'s suites a branch's diff can reach, which kitchen test
// files it can reach (K45), and when an earlier recorded PASS may stand in
// for a step. Importable — the script body is
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
  'docs/box-v4/DECISIONS.md',
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

// --- which kitchen test files a diff can reach (K45) --------------------------

// Every tests/kitchen/*.test.ts declares what it reads in a header line,
// `// reads: <entry>, <entry>` (more than one such line is allowed). An entry
// is an exact path, a `dir/` prefix, or a glob (`*` within one segment, `**`
// across segments); `@rulebook` stands for the files kitchen-stats'
// checkLimits reads. A file always reads itself. The declarations are read
// from the files on every call — never restated here — so a new test file is
// covered the moment it exists, and one that declares nothing is selected for
// every change (and fails tests/kitchen/k45-kitchen-reach.test.ts).
const KITCHEN_DIR = 'tests/kitchen';
const RULEBOOK = ['AGENTS.md', 'docs/box-v4/KITCHEN.md', 'kitchen/INBOX.md', 'STATUS.md', ...LIVE_RULE_FILES, 'kitchen/roles/', 'kitchen/stations/'];
// What the suite runner itself reads — the install, the vitest config and the
// launchers verify and suite.mjs go through. A change here can alter every
// file's run, so it selects every file.
export const KITCHEN_RUNNER_READS = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.node-version', 'tsconfig.json', 'scripts/vitest.config.mjs', 'scripts/process.mjs', 'scripts/pnpm.mjs', 'scripts/toolchain.json', 'scripts/tooling/'];
const entryPattern = entry => new RegExp(`^${entry.replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/\*\*|\*/g, token => (token === '**' ? '.*' : '[^/]*'))}${entry.endsWith('/') ? '.*' : ''}$`);

// The kitchen test files under rootDir with their declared entries, sorted by
// name. `reads` is [] when the file declares nothing.
export function kitchenDeclarations(rootDir = root) {
  const directory = join(rootDir, ...KITCHEN_DIR.split('/'));
  const found = [];
  const walk = (dir, prefix) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path, `${prefix}${name}/`);
      else if (name.endsWith('.test.ts')) {
        const text = readFileSync(path, 'utf8');
        const reads = [...text.matchAll(/^\/\/ reads:(.*)$/gm)].flatMap(match => match[1].split(',').map(entry => entry.trim()).filter(Boolean));
        found.push({ file: `${prefix}${name}`, reads });
      }
    }
  };
  if (existsSync(directory)) walk(directory, '');
  return found;
}

// scripts/*.mjs import one another; a file that runs scripts/verify.mjs also
// runs everything verify imports. For each script, the scripts that reach it
// through static or dynamic './x.mjs' imports (itself included).
function scriptImporters(rootDir) {
  const directory = join(rootDir, 'scripts');
  const imports = new Map();
  if (existsSync(directory)) for (const name of readdirSync(directory).filter(name => name.endsWith('.mjs'))) {
    const text = readFileSync(join(directory, name), 'utf8');
    imports.set(name, [...text.matchAll(/\b(?:from\s+|import\s*\(\s*|import\s+)['"]\.\/([\w.-]+\.mjs)['"]/g)].map(match => match[1]));
  }
  const reachedBy = name => {
    const seen = new Set([name]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const [importer, targets] of imports) if (!seen.has(importer) && targets.some(target => seen.has(target))) { seen.add(importer); grew = true; }
    }
    return [...seen].map(script => `scripts/${script}`);
  };
  return path => (/^scripts\/[^/]+\.mjs$/.test(path) && imports.has(path.slice(8)) ? reachedBy(path.slice(8)) : [path]);
}

// The kitchen files whose declarations reach each path. Built once per call
// site; kitchenTestFilesForPaths is the one consumer verify uses.
export function kitchenReach(rootDir = root) {
  const declared = kitchenDeclarations(rootDir).map(({ file, reads }) => ({
    file,
    declares: reads.length > 0,
    patterns: [`${KITCHEN_DIR}/${file}`, ...reads.flatMap(entry => (entry === '@rulebook' ? RULEBOOK : [entry]))].map(entryPattern),
  }));
  const reach = scriptImporters(rootDir);
  return {
    files: declared.map(item => item.file),
    undeclared: declared.filter(item => !item.declares).map(item => item.file),
    // Only files that declare something; undeclared ones are added by the caller.
    readersOf: path => {
      const paths = reach(path);
      return declared.filter(item => item.declares && item.patterns.some(pattern => paths.some(candidate => pattern.test(candidate)))).map(item => item.file);
    },
  };
}

// The kitchen test files a set of changed paths needs: { files, total, reason }
// with files sorted and named relative to tests/kitchen. Order of rules, first
// match wins for each path:
//   1. a path the suite runner reads (KITCHEN_RUNNER_READS) -> every file;
//   2. an inert path (isInert — the same answer kitchenSuiteReason and the
//      ancestor reuse give) -> no file;
//   3. a path some file declares -> those files;
//   4. anything else is unmapped -> every file (fail closed).
// An unreadable diff (null) selects every file. An empty `files` with
// total > 0 means the diff reaches no kitchen file; verify refuses to call
// that a pass. total 0 means no kitchen test file exists to select from.
export function kitchenTestFilesForPaths(paths, rootDir = root) {
  const reach = kitchenReach(rootDir);
  const total = reach.files.length;
  const every = reason => ({ files: [...reach.files], total, reason });
  if (paths === null) return every('the diff cannot be read, so every file runs');
  const unique = [...new Set(paths)].sort();
  // A file that declares nothing runs for every change — never silently skipped.
  const selected = new Set(reach.undeclared);
  const mapped = [];
  for (const path of unique) {
    if (KITCHEN_RUNNER_READS.some(entry => entryPattern(entry).test(path))) return every(`${path} is read by the suite runner itself, so every file runs`);
    if (isInert(path)) continue;
    const readers = reach.readersOf(path);
    if (!readers.length) return every(`${path} is declared by no kitchen file (unmapped), so every file runs`);
    for (const file of readers) selected.add(file);
    mapped.push(path);
  }
  const named = list => `${list.slice(0, 3).join(', ')}${list.length > 3 ? ` and ${list.length - 3} more` : ''}`;
  if (!selected.size) return { files: [], total, reason: unique.length ? `no kitchen file declares a changed path (${named(unique)})` : 'the diff is empty' };
  const why = [
    mapped.length ? `these files declare the changed paths (${named(mapped)})` : null,
    reach.undeclared.length ? `${named(reach.undeclared)} declare no inputs, so they run for every change` : null,
  ].filter(Boolean).join('; ');
  return { files: [...selected].sort(), total, reason: why };
}

// What test:kitchen runs this invocation. `--full` means every file.
export function selectKitchenFiles(rootDir = root, { full = false, paths } = {}) {
  if (full) { const files = kitchenReach(rootDir).files; return { files, total: files.length, reason: '--full' }; }
  return kitchenTestFilesForPaths(paths === undefined ? changedPaths(rootDir) : paths, rootDir);
}
export const kitchenSelectionLabel = ({ files, total, reason }) => `selected: ${files.length} of ${total} kitchen files, ${reason}`;

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
// existed ran all check suites. K45: a reused `test:kitchen` likewise must
// have covered every kitchen file this invocation selects (pass
// `kitchenFiles`): the summary's kitchenSelected must include each one, so a
// narrow PASS never stands in for a wider selection while a wider one (a
// --full run, or any superset) stands in for a narrower one. Summaries from
// before the field existed ran the whole kitchen directory. Anything that
// doesn't parse or match means a real run.
export function reusableStep(runsDir, sha, stepName, { suites = null, kitchenFiles = null } = {}) {
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
    if (kitchenFiles && Object.hasOwn(parsed, 'kitchenSelected')) {
      if (!Array.isArray(parsed.kitchenSelected) || !kitchenFiles.every(file => parsed.kitchenSelected.includes(file))) continue;
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
  // K45: verify passes its kitchen selection as file targets and says so in
  // KITCHEN_SELECTION; that run is acceptance for the files it names, so it
  // does not carry the inner-loop wording a hand-scoped run gets. The variable
  // is not passed on to the tests (they spawn suite.mjs themselves).
  const { KITCHEN_SELECTION: selection, ...env } = process.env;
  if (files.length) console.log(selection ? `verify ${selection}` : `scoped run: ${targets.length} file(s) under ${relative(root, directory)} — this is an inner loop, never suite acceptance`);
  const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
  process.exit(await runNode(vitest, ['run', `--maxWorkers=${suiteWorkers(suite, subgroup)}`, ...(targets.length ? targets : [directory]), '--config', 'scripts/vitest.config.mjs'], { env: { ...env, PLAYWRIGHT_BROWSERS_PATH: join(root, '.runtime', 'browsers') } }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
