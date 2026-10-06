// Sceptic's additional cases for experiment request-to-check/01. Same approach as run.mjs: each
// candidate version of scripts/kitchen-stats.mjs is judged by R1's custom check (A) and by the
// cheap check (B = pre-R1 test + one command). Writes sceptic-results.json beside this file.
// Works only inside the lab worktree; restores the script and removes everything it creates.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..', '..', '..');
const BASE = 'e412e08', ACCEPTED = 'ddeb3ab';
const git = (...args) => execFileSync('git', ['-c', 'safe.directory=*', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
const show = spec => git('show', spec);

const base = show(`${BASE}:scripts/kitchen-stats.mjs`);
const accepted = show(`${ACCEPTED}:scripts/kitchen-stats.mjs`);
function swap(text, from, to) {
  if (!text.includes(from)) throw new Error('mutation did not apply: ' + from.slice(0, 60));
  return text.replace(from, to);
}
// Replaces every occurrence and insists on an exact count, so a drifted source cannot pass silently.
function swapAll(text, from, to, count) {
  const found = text.split(from).length - 1;
  if (found !== count) throw new Error('expected ' + count + ' occurrences, found ' + found + ': ' + from.slice(0, 60));
  return text.replaceAll(from, to);
}

const usageSection = [
  "  out.push('Usage per wave (agent usage as recorded in each wave file Result)');",
  '  const usage = readWaves(root);',
  "  if (usage.every(wave => !wave.usage)) out.push('  missing — no wave file records a Usage value; nothing to report, not zero');",
  "  else for (const wave of usage) out.push('  ' + wave.id + ': ' + (wave.usage || 'missing'));",
  "  out.push('');",
  ''
].join('\n');
const conditionalSection = [
  '  const usage = readWaves(root);',
  '  if (usage.some(wave => wave.usage)) {',
  "    out.push('Usage per wave (agent usage as recorded in each wave file Result)');",
  "    for (const wave of usage) out.push('  ' + wave.id + ': ' + (wave.usage || 'missing'));",
  "    out.push('');",
  '  }',
  ''
].join('\n');

// Every "missing" label the page prints, turned into 0 or n/a. The ok:'missing' field that the
// existing test reads through checkLimits() is left alone on purpose.
let noMissing = swapAll(accepted, "'  missing — ", "'  0 — ", 2);
noMissing = swap(noMissing, "actual: bytes === null ? 'missing' : bytes + ' B'", "actual: bytes === null ? 'n/a' : bytes + ' B'");
noMissing = swap(noMissing, "actual: 'missing', limit: '10'", "actual: 'n/a', limit: '10'");
noMissing = swap(noMissing, "actual: status === null ? 'missing' : String(lineCount(status))", "actual: status === null ? 'n/a' : String(lineCount(status))");

// A correct solution written differently from the accepted one: same removal, starting from the
// base, with the wave id computed another way and a source comment that mentions the removed word.
let alternative = swap(base, usageSection, '');
alternative = swap(alternative,
  "    const usage = (text.match(/Usage:[ \\t]*(\\S[^\\n]*)/) || [])[1] || null;\n    waves.push({ id: file.slice(0, -3), commits, merge, branches, usage });",
  "    // The Usage value is no longer read: nothing prints it.\n    const id = file.replace(/\\.md$/, '');\n    waves.push({ id, commits, merge, branches });");

const usageTemp = join(tmpdir(), 'lab-usage-tmp');
const probeWave = join(root, 'waves', 'lab-usage-probe.md');

const candidates = {
  'K0 accepted change (control)': { right: true, text: accepted },
  'S1 "Verify runs" heading deleted': { right: false, text: swap(accepted, "  out.push('Verify runs');\n", '') },
  'S2 every missing label printed as 0 or n/a': { right: false, text: noMissing },
  'S3 section kept, shown only when a wave records usage': { right: false, text: swap(base, usageSection, conditionalSection) },
  'S4 unattributed runs no longer listed': { right: false, text: swap(accepted, '  if (leftovers.length) {', '  if (false) {') },
  'S5 stall guard counts a dirty PASS as a PASS': { right: false, text: swap(accepted, "if (run.verdict === 'PASS' && run.dirty === false) break;", "if (run.verdict === 'PASS') break;") },
  'S6 inbox limit loosened from 10 to 100': { right: false, text: swap(accepted, 'const over = entries > 10 ||', 'const over = entries > 100 ||') },
  'R1 correct, written differently': { right: true, text: alternative },
  'R2 accepted change, temp directory named lab-usage-tmp': { right: true, text: accepted, env: { TEMP: usageTemp, TMP: usageTemp, TMPDIR: usageTemp } },
  'R3 accepted change, repository has a wave file named lab-usage-probe': { right: true, text: accepted, wave: true }
};

const script = join(root, 'scripts', 'kitchen-stats.mjs');
const testDir = join(root, 'tests', 'kitchen');
const testA = join(testDir, 'lab-sceptic-custom.test.ts');
const testB = join(testDir, 'lab-sceptic-existing.test.ts');
const vitest = join(root, 'node_modules', 'vitest', 'vitest.mjs');
const clean = text => text.replace(/\u001b\[[0-9;]*m/g, '');
const runTest = (file, env) => spawnSync(process.execPath, [vitest, 'run', file, '--config', 'scripts/vitest.config.mjs'], { cwd: root, encoding: 'utf8', timeout: 300000, env: { ...process.env, ...env } });
const tally = out => (clean(out).match(/Tests\s+.*$/m) || ['no tally'])[0].trim();
const failed = out => [...new Set(clean(out).split('\n').filter(line => /^\s*(×|FAIL)\s/.test(line)).map(line => line.trim().replace(/\s+\d+ms$/, '')))].slice(0, 12);

const results = [];
try {
  mkdirSync(testDir, { recursive: true });
  mkdirSync(usageTemp, { recursive: true });
  writeFileSync(testA, show(`${ACCEPTED}:tests/kitchen/kitchen-stats-no-usage.test.ts`));
  writeFileSync(testB, show(`${BASE}:tests/kitchen/kitchen-stats.test.ts`));
  for (const [name, { right, text, env = {}, wave = false }] of Object.entries(candidates)) {
    writeFileSync(script, text);
    if (wave) writeFileSync(probeWave, '# lab-usage-probe\n\nTemporary file written by sceptic-run.mjs; removed when it ends.\n');
    try {
      const a = runTest('tests/kitchen/lab-sceptic-custom.test.ts', env);
      const b1 = runTest('tests/kitchen/lab-sceptic-existing.test.ts', env);
      const page = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8', timeout: 60000, env: { ...process.env, ...env } });
      const hits = (page.stdout || '').split('\n').filter(line => /usage/i.test(line));
      const b2 = hits.length === 0;
      const row = {
        candidate: name, right,
        A: a.status === 0 ? 'accept' : 'reject', A_tally: tally(a.stdout + a.stderr), A_failed: failed(a.stdout + a.stderr),
        B1_existing_test: b1.status === 0 ? 'pass' : 'fail', B1_tally: tally(b1.stdout + b1.stderr), B1_failed: failed(b1.stdout + b1.stderr),
        B2_no_usage_in_output: b2 ? 'pass' : 'fail', B2_matching_lines: hits.length, B2_first_match: (hits[0] || '').trim().slice(0, 100),
        page_exit: page.status, page_chars: (page.stdout || '').length,
        B: b1.status === 0 && b2 ? 'accept' : 'reject'
      };
      results.push(row);
      console.log(`${name.padEnd(68)} right=${String(right).padEnd(5)} A=${row.A.padEnd(6)} B=${row.B.padEnd(6)} (B1 ${row.B1_existing_test}, B2 ${row.B2_no_usage_in_output})`);
    } finally {
      rmSync(probeWave, { force: true });
    }
  }
} finally {
  rmSync(testA, { force: true });
  rmSync(testB, { force: true });
  rmSync(probeWave, { force: true });
  rmSync(usageTemp, { recursive: true, force: true });
  git('checkout', '--', 'scripts/kitchen-stats.mjs');
}
writeFileSync(join(here, 'sceptic-results.json'), JSON.stringify({ base: BASE, accepted: ACCEPTED, node: process.version, results }, null, 2) + '\n');
