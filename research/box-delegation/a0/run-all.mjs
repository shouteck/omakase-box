// THROWAWAY (wave A0 prototype). Plays the owner: writes each declaration, runs the neutral
// loop twice per declaration (known-good edit, do nothing) and prints the result table.
// All knowledge of npm, pnpm and Python lives here, in the declarations, never in neutral-box.mjs.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neutralLoop } from './neutral-box.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures');
const details = process.argv.includes('--details');

// Owner-machine facts. A declared program must be a real executable because nothing is run
// through a shell; on Windows `npm` is `npm.cmd`, so the owner names node plus the tool's script.
const NPM_CLI = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const PNPM_CLI = join(here, '..', '..', '..', 'scripts', 'tooling', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs');
for (const tool of [NPM_CLI, PNPM_CLI]) if (!existsSync(tool)) throw new Error(`tool script not found: ${tool}`);

const nodeTest = (name, role, file, cwd = '.') => ({ name, role, program: 'node', args: ['--test', file], cwd });
const npmCi = ['ci', '--ignore-scripts', '--offline', '--no-audit', '--no-fund'];
const pnpmFrozen = ['install', '--frozen-lockfile', '--ignore-scripts', '--offline'];

// ---- npm-single -------------------------------------------------------------------------
const single = {
  sourceRoot: join(fixtures, 'npm-single'),
  files: ['package.json', 'package-lock.json', 'src/slug.js', 'test/guard.test.js', 'test/outcome.test.js'],
  checks: [nodeTest('guard', 'guard', 'test/guard.test.js'), nodeTest('outcome', 'outcome', 'test/outcome.test.js')]
};
const singlePatch = join(fixtures, 'npm-single.known-good.patch');

// ---- python-plain -----------------------------------------------------------------------
const python = {
  sourceRoot: join(fixtures, 'python-plain'),
  files: ['textstats/__init__.py', 'tests/__init__.py', 'tests/test_guard.py', 'tests/test_outcome.py'],
  setup: [],
  checks: [
    { name: 'guard', role: 'guard', program: 'python', args: ['-m', 'unittest', 'tests.test_guard'], cwd: '.' },
    { name: 'outcome', role: 'outcome', program: 'python', args: ['-m', 'unittest', 'tests.test_outcome'], cwd: '.' }
  ]
};

// ---- multi-package ----------------------------------------------------------------------
const aFiles = ['packages/a/package.json', 'packages/a/src/index.js', 'packages/a/test/guard.test.js', 'packages/a/test/outcome.test.js'];
const bFiles = ['packages/b/package.json', 'packages/b/src/index.js'];
const cManifest = ['packages/c/package.json'];
const multiChecks = [
  nodeTest('guard', 'guard', 'test/guard.test.js', 'packages/a'),
  nodeTest('outcome', 'outcome', 'test/outcome.test.js', 'packages/a')
];
const multiPatch = join(fixtures, 'multi-package', 'known-good.patch');
const npmRoot = ['package.json', 'package-lock.json'];
const pnpmRoot = ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml'];
const multi = (variant, files, setup) => ({ sourceRoot: join(fixtures, 'multi-package', variant), files, setup, checks: multiChecks });
const npmLoose = [{ program: 'node', args: [NPM_CLI, 'install', '--ignore-scripts', '--offline', '--no-audit', '--no-fund'], cwd: '.' }];
const pnpmLoose = [{ program: 'node', args: [PNPM_CLI, 'install', '--no-frozen-lockfile', '--ignore-scripts', '--offline'], cwd: '.' }];
const npmSetup = [{ program: 'node', args: [NPM_CLI, ...npmCi], cwd: '.' }];
const pnpmSetup = [{ program: 'node', args: [PNPM_CLI, ...pnpmFrozen], cwd: '.' }];

const trials = [
  // The same fixture, three ways of declaring the same setup command.
  ['npm-single', 'cmd-bare-npm', { ...single, setup: [{ program: 'npm', args: npmCi, cwd: '.' }] }, singlePatch],
  ['npm-single', 'cmd-npm-dot-cmd', { ...single, setup: [{ program: 'npm.cmd', args: npmCi, cwd: '.' }] }, singlePatch],
  ['npm-single', 'cmd-via-cmd-exe', { ...single, setup: [{ program: 'cmd.exe', args: ['/d', '/s', '/c', 'npm', ...npmCi], cwd: '.' }] }, singlePatch],
  ['npm-single', 'cmd-node-plus-cli', { ...single, setup: [{ program: 'node', args: [NPM_CLI, ...npmCi], cwd: '.' }] }, singlePatch],
  ['npm-single', 'no-setup', { ...single, setup: [] }, singlePatch],
  ['python-plain', 'whole-package', python, join(fixtures, 'python-plain.known-good.patch')],
  ['multi-npm', 'i-a-only', multi('npm', [...npmRoot, ...aFiles], npmSetup), multiPatch],
  ['multi-npm', 'ii-a-b', multi('npm', [...npmRoot, ...aFiles, ...bFiles], npmSetup), multiPatch],
  ['multi-npm', 'iii-a-b-cmanifest', multi('npm', [...npmRoot, ...aFiles, ...bFiles, ...cManifest], npmSetup), multiPatch],
  ['multi-npm', 'iv-a-no-install', multi('npm', [...aFiles, ...bFiles], []), multiPatch],
  ['multi-npm', 'iv-b-no-lockfile-loose-install', multi('npm', ['package.json', ...aFiles, ...bFiles], npmLoose), multiPatch],
  ['multi-npm', 'iv-c-b-manifest-only', multi('npm', [...npmRoot, ...aFiles, 'packages/b/package.json'], npmSetup), multiPatch],
  ['multi-pnpm', 'i-a-only', multi('pnpm', [...pnpmRoot, ...aFiles], pnpmSetup), multiPatch],
  ['multi-pnpm', 'ii-a-b', multi('pnpm', [...pnpmRoot, ...aFiles, ...bFiles], pnpmSetup), multiPatch],
  ['multi-pnpm', 'iii-a-b-cmanifest', multi('pnpm', [...pnpmRoot, ...aFiles, ...bFiles, ...cManifest], pnpmSetup), multiPatch],
  ['multi-pnpm', 'iv-a-no-install', multi('pnpm', [...aFiles, ...bFiles], []), multiPatch],
  ['multi-pnpm', 'iv-b-no-lockfile-loose-install', multi('pnpm', ['package.json', 'pnpm-workspace.yaml', ...aFiles, ...bFiles], pnpmLoose), multiPatch],
  ['multi-pnpm', 'iv-c-b-manifest-only', multi('pnpm', [...pnpmRoot, ...aFiles, 'packages/b/package.json'], pnpmSetup), multiPatch]
];

function inventory(root) {
  let files = 0, bytes = 0;
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name));
      else { files += 1; bytes += statSync(join(dir, entry.name)).size; }
    }
  };
  walk(root);
  return { files, bytes };
}

const exits = records => records.length === 0 ? 'none' : records.map(record => record.exit ?? (record.spawnError ?? 'null').split(':')[0]).join(',');
const byRole = (records, role) => exits(records.filter(record => record.role === role));
const scrub = text => text.replaceAll(/\d+(\.\d+)?\s?ms/g, 'Nms').replaceAll(/duration_ms [\d.]+/g, 'duration_ms N');

const rows = [];
const failures = [];
for (const [fixture, candidate, body, patch] of trials) {
  const declaration = { name: `${fixture}-${candidate}`, ...body };
  const edit = neutralLoop(declaration, patch);
  const nothing = neutralLoop(declaration, null);
  const total = inventory(declaration.sourceRoot);
  // "Worked" is the whole claim: valid base, known-good edit accepted, do-nothing rejected.
  const worked = edit.verdict === 'done' && nothing.verdict === 'not-done';
  rows.push([
    fixture, candidate, exits(edit.setup), byRole(edit.base, 'guard'), byRole(edit.base, 'outcome'),
    `${byRole(edit.after, 'guard')}/${byRole(edit.after, 'outcome')}`, edit.verdict, nothing.verdict,
    worked ? 'YES' : 'NO', `${edit.files}/${total.files}`, `${edit.bytes}/${total.bytes}`
  ]);
  for (const [phase, records] of [['setup', edit.setup], ['base', edit.base], ['after-edit', edit.after]]) {
    for (const record of records) {
      const expectedRed = phase === 'base' && record.role === 'outcome' && Number.isInteger(record.exit) && record.exit !== 0;
      if (record.exit === 0 || expectedRed) continue;
      const lines = scrub(record.output).split(/\r?\n/).filter(line => /error|ERR_|Cannot find/i.test(line)).slice(0, 4);
      failures.push({ trial: declaration.name, phase, check: record.name ?? 'setup', command: [record.program, ...record.args].join(' '), exit: record.exit, text: [record.spawnError, ...lines].filter(Boolean).join(' || ') });
    }
  }
  if (details) for (const run of [edit, nothing]) for (const record of [...run.setup, ...run.base, ...(run.applied ? [run.applied] : []), ...run.after]) console.log(JSON.stringify({ trial: declaration.name, run: run.candidate, role: record.role, name: record.name, program: record.program, args: record.args, cwd: record.cwd, exit: record.exit, spawnError: record.spawnError, ms: record.ms, output: record.role === 'setup' ? record.output : undefined }));
}

const header = ['fixture', 'candidate', 'setup exit', 'guard base', 'outcome base', 'after edit guard/outcome', 'edit verdict', 'do-nothing verdict', 'loop worked', 'files slice/fixture', 'bytes slice/fixture'];
console.log(`| ${header.join(' | ')} |`);
console.log(`|${header.map(() => '---').join('|')}|`);
for (const row of rows) console.log(`| ${row.join(' | ')} |`);
console.log(`\n${rows.filter(row => row[8] === 'YES').length} of ${rows.length} trials worked (valid base, known-good edit done, do-nothing not done).`);
console.log(`\nCommands that did not exit 0 where 0 was required, from the known-good-edit run of each trial: ${failures.length}`);
for (const failure of failures) console.log(`- ${failure.trial} ${failure.phase}:${failure.check} exit=${failure.exit} :: ${failure.command} :: ${failure.text}`);
