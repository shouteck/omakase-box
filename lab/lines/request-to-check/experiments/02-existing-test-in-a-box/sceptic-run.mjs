// Sceptic's runner for request-to-check/02. Does not touch run.mjs, README.md or results.json.
// Part 1 rebuilds the experiment's Box C the same way run.mjs does and probes the measurement.
// Part 2 tries the same route with other tests the repository already has.
// Everything happens in a temp directory named lab-sceptic02-*, removed at the end.
// Writes sceptic-results.json beside this file and nothing else.
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const lab = join(here, '..', '..', '..', '..', '..');
const git = (cwd, ...args) => execFileSync('git', ['-c', 'safe.directory=*', '-c', 'user.name=lab', '-c', 'user.email=lab@localhost', ...args], { cwd, encoding: 'utf8', maxBuffer: 1 << 26 });
const clean = text => (text || '').replace(/\u001b\[[0-9;]*m/g, '');
const tail = (text, n = 1500) => clean(text).trim().slice(-n);

const tsxDir = readdirSync(join(lab, 'node_modules', '.pnpm')).find(name => /^tsx@/.test(name));
const tsx = join(lab, 'node_modules', '.pnpm', tsxDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const cli = join(lab, 'packages', 'box-cli', 'src', 'cli.ts');
const pnpm = join(lab, 'scripts', 'tooling', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs');
// The version a requester would copy for a named missing dependency: the one the repository
// already pins, in the root manifest or in a workspace package's manifest.
const manifests = [join(lab, 'package.json')];
for (const group of ['packages', 'services', 'examples', 'apps']) {
  if (!existsSync(join(lab, group))) continue;
  for (const name of readdirSync(join(lab, group))) if (existsSync(join(lab, group, name, 'package.json'))) manifests.push(join(lab, group, name, 'package.json'));
}
const pinned = manifests.map(path => JSON.parse(readFileSync(path, 'utf8')));
const versionOf = name => pinned.map(manifest => manifest.dependencies?.[name] ?? manifest.devDependencies?.[name]).find(Boolean) ?? null;

const temp = mkdtempSync(join(tmpdir(), 'lab-sceptic02-'));
const out = { node: process.version, labHead: git(lab, 'rev-parse', 'HEAD').trim(), temp, part1: {}, part2: [] };
const say = line => console.log(line);

const exportBox = (agreement, owner, name) => {
  const agreementPath = join(temp, `agreement-${name}.json`);
  const target = join(temp, `box-${name}`);
  writeFileSync(agreementPath, JSON.stringify(agreement, null, 2) + '\n');
  const run = spawnSync(process.execPath, [tsx, cli, 'export', agreementPath, '--repo', owner, '--out', target], { cwd: lab, encoding: 'utf8', timeout: 600000 });
  return { exit: run.status, stderr: tail(run.stderr), report: run.status === 0 ? JSON.parse(run.stdout) : null, target };
};
const inDir = (cwd, args, command = process.execPath) => {
  const run = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 600000 });
  return { exit: run.status, stdout: run.stdout || '', all: clean((run.stdout || '') + '\n' + (run.stderr || '')) };
};
const vitestSummary = all => ({
  files: (all.match(/Test Files\s+.*$/m) || ['no file tally'])[0].trim(),
  tests: (all.match(/^\s*Tests\s+.*$/m) || ['no test tally'])[0].trim(),
  failed: [...all.matchAll(/^\s*(?:FAIL|×)\s+(.*)$/gm)].map(match => match[1].trim()).slice(0, 30)
});

try {
  // ---------- Part 1: the experiment's own Box, rebuilt as run.mjs builds it ----------
  const owner = join(temp, 'owner');
  git(lab, 'clone', '--local', '--quiet', lab, owner);
  git(owner, 'checkout', '--quiet', '--detach', out.labHead);
  const swap = (text, from, to) => { if (!text.includes(from)) throw new Error('could not restore: ' + from.slice(0, 50)); return text.replace(from, to); };
  const scriptPath = join(owner, 'scripts', 'kitchen-stats.mjs');
  let script = readFileSync(scriptPath, 'utf8');
  script = swap(script, '    waves.push({ id: file.slice(0, -3), commits, merge, branches });',
    "    const usage = (text.match(/Usage:[ \\t]*(\\S[^\\n]*)/) || [])[1] || null;\n    waves.push({ id: file.slice(0, -3), commits, merge, branches, usage });");
  script = swap(script, "  if (!steps.size) out.push('  missing — no run data');\n  out.push('');\n",
    "  if (!steps.size) out.push('  missing — no run data');\n  out.push('');\n\n  out.push('Usage per wave (agent usage as recorded in each wave file Result)');\n  const usage = readWaves(root);\n  if (usage.every(wave => !wave.usage)) out.push('  missing — no wave file records a Usage value; nothing to report, not zero');\n  else for (const wave of usage) out.push('  ' + wave.id + ': ' + (wave.usage || 'missing'));\n  out.push('');\n");
  writeFileSync(scriptPath, script);
  git(owner, 'commit', '--quiet', '-am', 'sceptic02 base: Usage section restored');
  const base = git(owner, 'rev-parse', 'HEAD').trim();

  // 1a. Base fidelity: the lines the reconstruction adds over today's script must be exactly
  // the lines R1 removed (git diff e412e08 ddeb3ab), nothing more and nothing less.
  const changed = (diff, sign) => diff.split('\n').filter(line => line.startsWith(sign) && !line.startsWith(sign.repeat(3))).map(line => line.slice(1));
  const r1Diff = git(lab, 'diff', 'e412e08', 'ddeb3ab', '--', 'scripts/kitchen-stats.mjs');
  const baseDiff = git(owner, 'diff', 'HEAD', out.labHead, '--', 'scripts/kitchen-stats.mjs'); // base -> today, same direction as R1
  out.part1.baseFidelity = {
    r1Removed: changed(r1Diff, '-'), r1Added: changed(r1Diff, '+'),
    reconstructionRemoved: changed(baseDiff, '-'), reconstructionAdded: changed(baseDiff, '+'),
    identical: JSON.stringify([changed(r1Diff, '-'), changed(r1Diff, '+')]) === JSON.stringify([changed(baseDiff, '-'), changed(baseDiff, '+')])
  };
  say('1a base fidelity: reconstruction diff equals R1 diff line for line: ' + out.part1.baseFidelity.identical);

  const r1 = JSON.parse(readFileSync(join(lab, 'research', 'box-delegation', 'r1', 'agreement.json'), 'utf8'));
  const TEST = 'tests/kitchen/kitchen-stats.test.ts';
  const agreementC = {
    ...r1,
    box: { id: 'lab-sceptic02', name: 'R1 request with the existing test as guard', version: 1 },
    baseCommit: base,
    entrypoints: ['scripts/kitchen-stats.mjs', TEST],
    checks: ['pnpm exec tsc --noEmit', `pnpm exec vitest run src/${TEST}`, 'node src/scripts/kitchen-stats.mjs  # fails if the output contains "Usage per wave"'],
    declaredDependencies: { ...r1.declaredDependencies, vitest: r1.toolchain.vitest }
  };
  const c = exportBox(agreementC, owner, 'C');
  if (c.exit !== 0) throw new Error('Box C did not export: ' + c.stderr);
  const boxDir = c.target;
  const manifest = JSON.parse(readFileSync(join(boxDir, 'box.json'), 'utf8'));
  out.part1.disclosure = { report: c.report.disclosure, boxJson: manifest.disclosure, ownerFilesInBoxJson: manifest.files.filter(file => file.origin !== 'generated').map(file => file.owner) };
  say(`1b box.json disclosure: ${manifest.disclosure.shippedOwnerFiles} of ${manifest.disclosure.inventoryFiles}`);

  const install = inDir(boxDir, [pnpm, 'install', '--frozen-lockfile']);
  out.part1.install = { exit: install.exit, tail: tail(install.all, 500) };
  if (install.exit !== 0) throw new Error('install failed in Box C');

  // 1c. Isolation: is anything above the folder able to supply modules or settings?
  const ancestors = [];
  for (let dir = dirname(boxDir); ; dir = dirname(dir)) {
    const found = ['node_modules', 'package.json', 'pnpm-workspace.yaml', 'tsconfig.json', '.git', 'vitest.config.mjs', 'vitest.config.ts', 'vite.config.ts'].filter(name => existsSync(join(dir, name)));
    ancestors.push({ dir, found });
    if (dir === parse(dir).root) break;
  }
  const resolved = inDir(boxDir, ['-e', "const r=require('node:module').createRequire(process.cwd()+'/x.js'); console.log(r.resolve('vitest/package.json')); console.log(r.resolve('typescript/package.json'));"]);
  out.part1.isolation = { ancestorsWithAnything: ancestors.filter(entry => entry.found.length), vitestAndTypescriptResolveTo: resolved.stdout.trim().split(/\r?\n/), insideBox: resolved.stdout.trim().split(/\r?\n/).every(line => line.toLowerCase().startsWith(boxDir.toLowerCase())) };
  say('1c isolation: ancestors holding node_modules/config: ' + out.part1.isolation.ancestorsWithAnything.length + '; vitest and typescript resolve inside the Box: ' + out.part1.isolation.insideBox);

  // 1d. Does tsc in the folder really typecheck the shipped test? Add a type error to it.
  const shippedTest = join(boxDir, 'src', TEST);
  const original = readFileSync(shippedTest, 'utf8');
  const tscClean = inDir(boxDir, [pnpm, 'exec', 'tsc', '--noEmit']);
  appendFileSync(shippedTest, "\nexport const scepticTypeError: number = 'not a number';\n");
  const tscBroken = inDir(boxDir, [pnpm, 'exec', 'tsc', '--noEmit']);
  writeFileSync(shippedTest, original);
  out.part1.tscReachesTheTest = { cleanExit: tscClean.exit, withTypeErrorExit: tscBroken.exit, message: tail(tscBroken.all, 300) };
  say(`1d tsc: clean exit ${tscClean.exit}; with a type error added to the shipped test exit ${tscBroken.exit}`);
  // And does tsc see the script the request is about? Put a syntax error in the .mjs.
  const boxScript = join(boxDir, 'src', 'scripts', 'kitchen-stats.mjs');
  const baseScript = readFileSync(boxScript, 'utf8');
  writeFileSync(boxScript, baseScript + '\nthis is not javascript (\n');
  const tscScript = inDir(boxDir, [pnpm, 'exec', 'tsc', '--noEmit']);
  writeFileSync(boxScript, baseScript);
  out.part1.tscReachesTheScript = { withSyntaxErrorInScriptExit: tscScript.exit };
  say(`1d tsc: with a syntax error in the .mjs script exit ${tscScript.exit}`);

  // 1e. The three declared checks, taken literally (exit codes), on the unchanged base.
  // A recipient who changes nothing: what do the Box's own checks say?
  const literal = state => {
    const tsc = inDir(boxDir, [pnpm, 'exec', 'tsc', '--noEmit']);
    const guard = inDir(boxDir, [pnpm, 'exec', 'vitest', 'run', `src/${TEST}`]);
    const third = spawnSync(manifest.checks[2], { cwd: boxDir, shell: true, encoding: 'utf8', timeout: 120000 });
    const row = { state, check1TscExit: tsc.exit, check2GuardExit: guard.exit, check3AsWrittenExit: third.status, check3StdoutHasUsagePerWave: (third.stdout || '').includes('Usage per wave') };
    say(`1e literal checks, ${state}: tsc ${row.check1TscExit} | guard ${row.check2GuardExit} | third check as written exit ${row.check3AsWrittenExit} (output contains "Usage per wave": ${row.check3StdoutHasUsagePerWave})`);
    return row;
  };
  // 1f. Plain `pnpm exec vitest run` in the folder: what a recipient sees with no file named.
  const plain = state => {
    const run = inDir(boxDir, [pnpm, 'exec', 'vitest', 'run']);
    const row = { state, exit: run.exit, ...vitestSummary(run.all), filesMentioned: [...new Set([...run.all.matchAll(/(?:evaluator|src)\/[\w./-]+\.test\.ts/g)].map(match => match[0]))], tail: tail(run.all, 1800) };
    say(`1f plain vitest run, ${state}: exit ${row.exit} | ${row.files} | ${row.tests}`);
    return row;
  };
  const evaluatorOnly = state => {
    const run = inDir(boxDir, [pnpm, 'exec', 'vitest', 'run', 'evaluator/kitchen-stats-no-usage.test.ts']);
    const row = { state, exit: run.exit, ...vitestSummary(run.all) };
    say(`1f listed evaluator alone, ${state}: exit ${row.exit} | ${row.tests}`);
    return row;
  };
  out.part1.literalChecks = [literal('base, nothing changed')];
  out.part1.plainVitest = [plain('base')];
  out.part1.evaluatorAlone = [evaluatorOnly('base')];
  copyFileSync(join(lab, 'scripts', 'kitchen-stats.mjs'), boxScript);
  out.part1.literalChecks.push(literal('after the accepted change'));
  out.part1.plainVitest.push(plain('after the accepted change'));
  out.part1.evaluatorAlone.push(evaluatorOnly('after the accepted change'));
  // A wrong candidate the README's third check was meant to catch only by its comment:
  // the heading reworded, section otherwise kept.
  writeFileSync(boxScript, baseScript.replace('Usage per wave (agent usage', 'Agent usage by wave (agent usage'));
  const renamed = literal('wrong: section kept, heading reworded');
  const renamedPage = inDir(boxDir, ['src/scripts/kitchen-stats.mjs']);
  renamed.runnerRuleVerdict = renamedPage.stdout.includes('Usage per wave') ? 'red' : 'green';
  renamed.evaluator = evaluatorOnly('wrong: section kept, heading reworded');
  say(`1e wrong candidate (heading reworded): the runner's "contains Usage per wave" rule says ${renamed.runnerRuleVerdict}`);
  out.part1.literalChecks.push(renamed);
  writeFileSync(boxScript, baseScript);

  // ---------- Part 2: other tests the repository already has, same route ----------
  // Base is today's tree unchanged: the question is only whether the test travels and is
  // green in the folder before anyone changes anything.
  const plainOwner = join(temp, 'owner2');
  git(lab, 'clone', '--local', '--quiet', lab, plainOwner);
  git(plainOwner, 'checkout', '--quiet', '--detach', out.labHead);
  const cases = [
    { id: 'T1', test: 'tests/kitchen/verify-reuse.test.ts', target: 'scripts/suite.mjs', why: 'same shape as the experiment test: node -e probes from a root computed relative to the test' },
    { id: 'T2', test: 'tests/kitchen/k6-scope-budget.test.ts', target: 'scripts/kitchen-stats.mjs', why: 'same script; builds paths to other repository files at run time' },
    { id: 'T3', test: 'tests/kitchen/k6-corrections.test.ts', target: 'scripts/kitchen-stats.mjs', why: 'same script; needs suite.mjs, a pnpm shim and the pinned pnpm by path' },
    { id: 'T4', test: 'tests/contracts/paths.test.ts', target: 'packages/contracts/paths.ts', why: 'imports repository helpers and a third-party package' },
    { id: 'T5', test: 'tests/contracts/composition.test.ts', target: 'packages/contracts/public/index.ts', why: 'imports repository helpers and a fixtures module' },
    { id: 'T6', test: 'tests/contracts/boundaries.test.ts', target: 'scripts/boundaries.mjs', why: 'reads repository files by paths relative to the working directory' }
  ];
  for (const item of cases) {
    const row = { ...item, attempts: [], exported: false };
    // The guard in the owner's own tree first, so a failure in the folder is about travelling.
    const vitestOwner = join(lab, 'node_modules', 'vitest', 'vitest.mjs');
    const ownerRun = inDir(lab, [vitestOwner, 'run', item.test, '--config', 'scripts/vitest.config.mjs']);
    row.inRepository = { exit: ownerRun.exit, ...vitestSummary(ownerRun.all) };
    let declared = { vitest: r1.toolchain.vitest };
    let box = null;
    for (let round = 0; round < 4 && !box; round += 1) {
      const agreement = {
        ...r1,
        box: { id: `lab-sceptic02-${item.id.toLowerCase()}`, name: `existing test ${item.test} as guard`, version: 1 },
        outcome: `Sceptic case ${item.id}: change ${item.target} with ${item.test} as the guard.`,
        baseCommit: out.labHead,
        entrypoints: [item.target, item.test],
        editable: [{ kind: 'copy', owner: item.target, box: `src/${item.target}` }],
        declaredDependencies: declared,
        checks: ['pnpm exec tsc --noEmit', `pnpm exec vitest run src/${item.test}`],
        // No generator exists for these requests. R1's is listed only because the format demands one.
        evaluator: r1.evaluator
      };
      const result = exportBox(agreement, plainOwner, `${item.id}-${round}`);
      row.attempts.push({ declared: { ...declared }, exit: result.exit, stderr: result.stderr });
      if (result.exit === 0) { box = result; break; }
      const missing = [...result.stderr.matchAll(/undeclared dependency '([^']+)'/g)].map(match => match[1].startsWith('@') ? match[1].split('/').slice(0, 2).join('/') : match[1].split('/')[0]);
      const addable = [...new Set(missing)].filter(name => versionOf(name) && !(name in declared));
      if (!addable.length) break;
      for (const name of addable) declared[name] = versionOf(name);
    }
    if (box) {
      row.exported = true;
      const boxManifest = JSON.parse(readFileSync(join(box.target, 'box.json'), 'utf8'));
      row.ownerFiles = boxManifest.files.filter(file => file.origin !== 'generated').map(file => `${file.origin}: ${file.owner}`);
      row.disclosure = boxManifest.disclosure;
      const installed = inDir(box.target, [pnpm, 'install', '--frozen-lockfile']);
      row.install = { exit: installed.exit, tail: tail(installed.all, 300) };
      if (installed.exit === 0) {
        const tsc = inDir(box.target, [pnpm, 'exec', 'tsc', '--noEmit']);
        row.tsc = { exit: tsc.exit, tail: tail(tsc.all, 900) };
        const guard = inDir(box.target, [pnpm, 'exec', 'vitest', 'run', `src/${item.test}`]);
        row.guardInFolder = { exit: guard.exit, ...vitestSummary(guard.all), tail: tail(guard.all, 2500) };
        const evaluator = inDir(box.target, [pnpm, 'exec', 'vitest', 'run', 'evaluator']);
        row.listedEvaluatorInFolder = { exit: evaluator.exit, ...vitestSummary(evaluator.all), tail: tail(evaluator.all, 700) };
      }
    }
    out.part2.push(row);
    say(`2 ${item.id} ${item.test} -> ${item.target}: in repository exit ${row.inRepository.exit} (${row.inRepository.tests}) | export ${row.exported ? 'ok after ' + row.attempts.length + ' attempt(s), ' + row.ownerFiles.length + ' owner files' : 'REFUSED: ' + row.attempts.at(-1).stderr.split('\n').slice(0, 4).join(' / ')}`
      + (row.exported && row.tsc ? ` | tsc exit ${row.tsc.exit} | guard in folder exit ${row.guardInFolder.exit} (${row.guardInFolder.tests}) | listed R1 evaluator exit ${row.listedEvaluatorInFolder.exit}` : ''));
  }
} catch (error) {
  out.error = String(error && error.stack || error);
  console.error(out.error);
} finally {
  rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  out.tempRemoved = !existsSync(temp);
}
writeFileSync(join(here, 'sceptic-results.json'), JSON.stringify(out, null, 2) + '\n');
