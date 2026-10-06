// Experiment request-to-check/02. Tries to export the R1 request as a Box whose guard is the
// test the repository already had, using the real box CLI, then runs the checks in the exported
// folder on the base and after the accepted change. Everything happens in a temp directory named
// lab-exp02-*, removed at the end. Writes results.json beside this file and nothing else.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const lab = join(here, '..', '..', '..', '..', '..');
const git = (cwd, ...args) => execFileSync('git', ['-c', 'safe.directory=*', '-c', 'user.name=lab', '-c', 'user.email=lab@localhost', ...args], { cwd, encoding: 'utf8', maxBuffer: 1 << 26 });
const tail = (text, n = 1500) => (text || '').replace(/\u001b\[[0-9;]*m/g, '').trim().slice(-n);

const tsxDir = readdirSync(join(lab, 'node_modules', '.pnpm')).find(name => /^tsx@/.test(name));
const tsx = join(lab, 'node_modules', '.pnpm', tsxDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const cli = join(lab, 'packages', 'box-cli', 'src', 'cli.ts');
const pnpm = join(lab, 'scripts', 'tooling', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs');

const temp = mkdtempSync(join(tmpdir(), 'lab-exp02-'));
const out = { node: process.version, labHead: git(lab, 'rev-parse', 'HEAD').trim(), attempts: [], box: null, states: [] };
try {
  // The base: today's repository with R1's nine-line change reversed.
  const owner = join(temp, 'owner');
  git(lab, 'clone', '--local', '--quiet', lab, owner);
  git(owner, 'checkout', '--quiet', '--detach', out.labHead);
  // R1's change is put back by text (the lines it removed, from `git diff e412e08 ddeb3ab`);
  // the recorded patch no longer applies because K6 edited the lines next to it.
  const swap = (text, from, to) => { if (!text.includes(from)) throw new Error('could not restore: ' + from.slice(0, 50)); return text.replace(from, to); };
  const scriptPath = join(owner, 'scripts', 'kitchen-stats.mjs');
  let script = readFileSync(scriptPath, 'utf8');
  script = swap(script, '    waves.push({ id: file.slice(0, -3), commits, merge, branches });',
    "    const usage = (text.match(/Usage:[ \\t]*(\\S[^\\n]*)/) || [])[1] || null;\n    waves.push({ id: file.slice(0, -3), commits, merge, branches, usage });");
  script = swap(script, "  if (!steps.size) out.push('  missing — no run data');\n  out.push('');\n",
    "  if (!steps.size) out.push('  missing — no run data');\n  out.push('');\n\n  out.push('Usage per wave (agent usage as recorded in each wave file Result)');\n  const usage = readWaves(root);\n  if (usage.every(wave => !wave.usage)) out.push('  missing — no wave file records a Usage value; nothing to report, not zero');\n  else for (const wave of usage) out.push('  ' + wave.id + ': ' + (wave.usage || 'missing'));\n  out.push('');\n");
  writeFileSync(scriptPath, script);
  git(owner, 'commit', '--quiet', '-am', 'lab exp02 base: Usage section restored');
  const base = git(owner, 'rev-parse', 'HEAD').trim();
  out.base = base;

  const r1 = JSON.parse(readFileSync(join(lab, 'research', 'box-delegation', 'r1', 'agreement.json'), 'utf8'));
  const TEST = 'tests/kitchen/kitchen-stats.test.ts';
  const common = {
    ...r1,
    box: { id: 'lab-exp02', name: 'R1 request with the existing test as guard', version: 1 },
    baseCommit: base,
    entrypoints: ['scripts/kitchen-stats.mjs', TEST],
    checks: ['pnpm exec tsc --noEmit', `pnpm exec vitest run src/${TEST}`, 'node src/scripts/kitchen-stats.mjs  # fails if the output contains "Usage per wave"']
  };
  const variants = {
    'A no evaluator': { ...common, evaluator: [] },
    'B registered generator only to satisfy the format': common,
    'C as B plus vitest declared': { ...common, declaredDependencies: { ...r1.declaredDependencies, vitest: r1.toolchain.vitest } }
  };

  let boxDir = null;
  for (const [name, agreement] of Object.entries(variants)) {
    const key = name[0];
    const agreementPath = join(temp, `agreement-${key}.json`);
    const target = join(temp, `box-${key}`);
    writeFileSync(agreementPath, JSON.stringify(agreement, null, 2) + '\n');
    const run = spawnSync(process.execPath, [tsx, cli, 'export', agreementPath, '--repo', owner, '--out', target], { cwd: lab, encoding: 'utf8', timeout: 600000 });
    const attempt = { name, exit: run.status, stderr: tail(run.stderr) };
    if (run.status === 0) {
      const report = JSON.parse(run.stdout);
      attempt.files = report.files;
      attempt.disclosure = report.disclosure;
      boxDir = target;
    }
    out.attempts.push(attempt);
    console.log(`${name}: exit ${run.status}${run.status === 0 ? '' : ' | ' + tail(run.stderr, 300).split('\n').join(' / ')}`);
    if (boxDir) break;
  }

  if (boxDir) {
    const manifest = JSON.parse(readFileSync(join(boxDir, 'box.json'), 'utf8'));
    out.box = { ownerFiles: manifest.files.map(file => `${file.origin}: ${file.owner} -> ${file.box}`), checks: manifest.checks, evaluator: manifest.evaluator };
    const inBox = (label, command, args) => {
      const run = spawnSync(command, args, { cwd: boxDir, encoding: 'utf8', timeout: 600000 });
      return { label, exit: run.status, stdout: run.stdout || '', tail: tail((run.stdout || '') + '\n' + (run.stderr || ''), 2500) };
    };
    const install = inBox('install', process.execPath, [pnpm, 'install', '--frozen-lockfile']);
    out.install = { exit: install.exit, tail: install.tail.slice(-600) };
    console.log('install: exit ' + install.exit);
    const measure = state => {
      const tsc = inBox('tsc', process.execPath, [pnpm, 'exec', 'tsc', '--noEmit']);
      const guard = inBox('existing test', process.execPath, [pnpm, 'exec', 'vitest', 'run', `src/${TEST}`]);
      const page = inBox('page', process.execPath, ['src/scripts/kitchen-stats.mjs']);
      const row = {
        state,
        tsc: { exit: tsc.exit, tail: tsc.tail.slice(-1200) },
        guard: { exit: guard.exit, tally: (guard.tail.match(/Tests\s+.*$/m) || ['no tally'])[0].trim(), tail: guard.tail },
        command: { pageExit: page.exit, pageChars: page.stdout.length, containsUsagePerWave: page.stdout.includes('Usage per wave'), verdict: page.stdout.includes('Usage per wave') ? 'red' : 'green' }
      };
      out.states.push(row);
      console.log(`${state}: tsc exit ${row.tsc.exit} | guard exit ${row.guard.exit} (${row.guard.tally}) | command ${row.command.verdict} (page exit ${row.command.pageExit}, ${row.command.pageChars} chars)`);
    };
    if (install.exit === 0) {
      measure('base');
      copyFileSync(join(lab, 'scripts', 'kitchen-stats.mjs'), join(boxDir, 'src', 'scripts', 'kitchen-stats.mjs'));
      measure('after the accepted change');
      // Added after the first result was seen (see README): is the guard green in the folder
      // because it works there, or because it no longer tests anything? Two wrong candidates
      // from experiment 01 that the guard rejected in the repository.
      const accepted = readFileSync(join(lab, 'scripts', 'kitchen-stats.mjs'), 'utf8');
      const target = join(boxDir, 'src', 'scripts', 'kitchen-stats.mjs');
      writeFileSync(target, '');
      measure('post-hoc: empty file (wrong)');
      writeFileSync(target, swap(accepted, 'export function checkLimits(', 'function checkLimits('));
      measure('post-hoc: checkLimits no longer exported (wrong)');
    }
  }
} finally {
  rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  out.tempRemoved = !existsSync(temp);
}
writeFileSync(join(here, 'results.json'), JSON.stringify(out, null, 2) + '\n');
