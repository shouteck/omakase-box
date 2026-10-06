// Plain-Node owner/recipient check for the neutral R1 replay (no vitest, no
// toolchain): runs a kitchen-stats.mjs copy against fabricated kitchen roots
// and exits nonzero when the obsolete Usage output appears or any required
// section, missing-data label, limit exit or exported helper is broken.
// Usage: node r1-check.mjs <path-to-kitchen-stats.mjs>
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const script = resolve(process.argv[2] ?? '');
const temps = [];
const temp = () => { const dir = mkdtempSync(join(tmpdir(), 'a3-r1-check-')); temps.push(dir); return dir; };
process.on('exit', () => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }); });
const fail = (message) => { console.error('r1-check failed: ' + message); process.exit(1); };

const NOW = Date.parse('2026-02-01T12:00:00.000Z');
const dirName = (ms, sha) => new Date(ms).toISOString().replace(/[:.]/g, '-') + '-' + sha.slice(0, 7);
const iso = (ms) => new Date(ms).toISOString();

function kitchenRoot(usageLine) {
  const dir = temp();
  mkdirSync(join(dir, 'docs', 'box-v4'), { recursive: true });
  mkdirSync(join(dir, 'kitchen'), { recursive: true });
  mkdirSync(join(dir, 'waves'), { recursive: true });
  writeFileSync(join(dir, 'AGENTS.md'), 'agents\n');
  writeFileSync(join(dir, 'docs', 'box-v4', 'KITCHEN.md'), 'kitchen\n');
  writeFileSync(join(dir, 'kitchen', 'INBOX.md'), '- one\n');
  writeFileSync(join(dir, 'STATUS.md'), 'status\n');
  const sha = 'a'.repeat(40);
  const run = join(dir, '.kitchen', 'runs', dirName(NOW, sha));
  mkdirSync(run, { recursive: true });
  writeFileSync(join(run, 'summary.json'), JSON.stringify({ schemaVersion: 1, sha, dirty: false, verdict: 'PASS', startedAt: iso(NOW), seconds: 61, steps: [{ name: 'check', exit: 0, seconds: 61 }], notRun: [], failure: null }));
  mkdirSync(join(dir, '.kitchen', 'runs', dirName(NOW + 60000, 'b'.repeat(40))), { recursive: true });
  writeFileSync(join(dir, 'waves', 'w1.md'), ['# w1', '', '- Commit: `' + 'a'.repeat(40) + '`', '- Branch: `wave/w1`', ...(usageLine ? ['- Usage: 12k tokens'] : []), ''].join('\n'));
  return dir;
}

const runStats = (root) => spawnSync(process.execPath, [script, '--root=' + root], { encoding: 'utf8', timeout: 60000 });

for (const usageLine of [true, false]) {
  const run = runStats(kitchenRoot(usageLine));
  if (run.status !== 0) fail('script exited ' + run.status + ': ' + (run.stderr || '').slice(-300));
  for (const section of ['Verify runs', 'Verify minutes per step', 'Runs per wave branch', 'Largest costs', 'Kitchen limits'])
    if (!run.stdout.includes(section)) fail('missing section ' + section);
  if (/usage/i.test(run.stdout)) fail('obsolete Usage output is still printed');
  if (!run.stdout.includes('1 runs with summary.json')) fail('run count line missing');
}
const missing = runStats(temp());
if (missing.status !== 0 || !missing.stdout.includes('missing') || /usage/i.test(missing.stdout)) fail('missing-data labels broken');
const limited = kitchenRoot(true);
writeFileSync(join(limited, 'STATUS.md'), Array(61).fill('x').join('\n') + '\n');
const limit = runStats(limited);
if (limit.status !== 1 || !(limit.stderr + limit.stdout).includes('LIMIT FAIL')) fail('nonzero limit exit broken');
const probe = spawnSync(process.execPath, ['--input-type=module', '-e', 'import * as k from ' + JSON.stringify(pathToFileURL(script).href) + '; console.log(JSON.stringify([typeof k.readRuns, typeof k.stallCheck, typeof k.checkLimits]));'], { encoding: 'utf8', timeout: 30000 });
if (probe.status !== 0 || probe.stdout.trim() !== '["function","function","function"]') fail('exported helpers readRuns/stallCheck/checkLimits missing');
console.log('kitchen-stats check passed');
