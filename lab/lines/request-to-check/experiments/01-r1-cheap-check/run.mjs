// Experiment request-to-check/01. Judges eight candidate versions of scripts/kitchen-stats.mjs with
// R1's custom check (A) and with a cheap check (B = the pre-R1 test + one command), and writes
// results.json beside this file. Works only inside the lab worktree and restores what it swaps.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..', '..', '..');
const BASE = 'e412e08', ACCEPTED = 'ddeb3ab';
const git = (...args) => execFileSync('git', ['-c', 'safe.directory=*', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
const show = spec => git('show', spec);

const base = show(`${BASE}:scripts/kitchen-stats.mjs`);
const accepted = show(`${ACCEPTED}:scripts/kitchen-stats.mjs`);
// A mutation that does not apply would silently test the wrong thing, so it throws.
function swap(text, from, to) {
  if (!text.includes(from)) throw new Error('mutation did not apply: ' + from.slice(0, 60));
  return text.replace(from, to);
}

const candidates = {
  'C0 no change': { right: false, text: base },
  'C1 accepted change': { right: true, text: accepted },
  'C2 empty file': { right: false, text: '' },
  'C3 section reworded': {
    right: false,
    text: swap(swap(base, "'Usage per wave (agent usage as recorded in each wave file Result)'", "'Tokens per wave (agent spend as recorded in each wave file Result)'"),
      'no wave file records a Usage value', 'no wave file records a token value')
  },
  'C4 helper no longer exported': { right: false, text: swap(accepted, 'export function checkLimits(', 'function checkLimits(') },
  'C5 dead parsing left in': {
    right: false,
    text: swap(accepted, 'waves.push({ id: file.slice(0, -3), commits, merge, branches });',
      "const usage = (text.match(/Usage:[ \\t]*(\\S[^\\n]*)/) || [])[1] || null;\n    waves.push({ id: file.slice(0, -3), commits, merge, branches, usage });")
  },
  'C6 another heading deleted': { right: false, text: swap(accepted, "  out.push('Largest costs');\n", '') },
  'C7 a missing label became 0': { right: false, text: swap(accepted, "'  missing — no run summaries found'", "'  0'") }
};

const script = join(root, 'scripts', 'kitchen-stats.mjs');
const testDir = join(root, 'tests', 'kitchen');
const testA = join(testDir, 'lab-r1-custom.test.ts');
const testB = join(testDir, 'lab-r1-existing.test.ts');
const vitest = join(root, 'node_modules', 'vitest', 'vitest.mjs');
const runTest = file => spawnSync(process.execPath, [vitest, 'run', file, '--config', 'scripts/vitest.config.mjs'], { cwd: root, encoding: 'utf8', timeout: 300000 });
const tally = out => (out.match(/Tests\s+.*$/m) || ['no tally'])[0].replace(/\u001b\[[0-9;]*m/g, '').trim();

const results = [];
try {
  mkdirSync(testDir, { recursive: true });
  writeFileSync(testA, show(`${ACCEPTED}:tests/kitchen/kitchen-stats-no-usage.test.ts`));
  writeFileSync(testB, show(`${BASE}:tests/kitchen/kitchen-stats.test.ts`));
  for (const [name, { right, text }] of Object.entries(candidates)) {
    writeFileSync(script, text);
    const a = runTest('tests/kitchen/lab-r1-custom.test.ts');
    const b1 = runTest('tests/kitchen/lab-r1-existing.test.ts');
    const page = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8', timeout: 60000 });
    const b2 = !/usage/i.test(page.stdout || '');
    const row = {
      candidate: name, right,
      A: a.status === 0 ? 'accept' : 'reject', A_tally: tally(a.stdout + a.stderr),
      B1_existing_test: b1.status === 0 ? 'pass' : 'fail', B1_tally: tally(b1.stdout + b1.stderr),
      B2_no_usage_in_output: b2 ? 'pass' : 'fail', page_exit: page.status, page_chars: (page.stdout || '').length,
      B: b1.status === 0 && b2 ? 'accept' : 'reject'
    };
    results.push(row);
    console.log(`${name.padEnd(30)} right=${String(right).padEnd(5)} A=${row.A.padEnd(6)} B=${row.B.padEnd(6)} (B1 ${row.B1_existing_test}, B2 ${row.B2_no_usage_in_output})`);
  }
} finally {
  rmSync(testA, { force: true });
  rmSync(testB, { force: true });
  git('checkout', '--', 'scripts/kitchen-stats.mjs');
}
writeFileSync(join(here, 'results.json'), JSON.stringify({ base: BASE, accepted: ACCEPTED, node: process.version, results }, null, 2) + '\n');
