// K6 paired measurement route (rerunnable, not a test and never acceptance):
//   node tests/box/package/k6-measure.mjs
// Runs the real package suite twice on the same candidate — once with
// K6_LOCKFILE_MODE=uncached, once cached — and reports wall time plus exact
// operation counts read from the invocation-local op logs each run wrote.
// Stats files are named box-k6-stats-<pid>.jsonl by the process that spawned
// them; a run's counts are the lines in files born inside that run's own time
// window, so stale or foreign probe lines can never enter the count.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const STATS_NAME = /^box-k6-stats-\d+\.jsonl$/;

function opsBetween(start, end) {
  const counts = {};
  for (const name of readdirSync(tmpdir())) {
    if (!STATS_NAME.test(name)) continue;
    const path = join(tmpdir(), name);
    const stat = statSync(path);
    // Only files born inside this run's window: pre-existing bytes and any
    // unrelated later process's log are excluded by construction.
    if (stat.birthtimeMs < start || stat.mtimeMs > end) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }
      if (typeof entry.op !== 'string') continue;
      counts[entry.op] = (counts[entry.op] || 0) + 1;
    }
  }
  return counts;
}

function run(mode) {
  const start = Date.now();
  const result = spawnSync(process.execPath, [join(root, 'scripts', 'suite.mjs'), 'box', '--suite', 'package'], {
    cwd: root,
    env: { ...process.env, K6_LOCKFILE_MODE: mode },
    encoding: 'utf8'
  });
  const end = Date.now();
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.replace(/\x1b\[[0-9;]*m/g, '');
  const files = Number((output.match(/Test Files\s+(\d+)/) ?? [])[1]);
  const tests = Number((output.match(/Tests\s+(\d+)/) ?? [])[1]);
  return {
    mode,
    exit: result.status,
    wallSeconds: Math.round((end - start) / 100) / 10,
    vitestSeconds: Number((output.match(/Duration\s+([\d.]+)s/) ?? [])[1] ?? NaN),
    testFiles: files,
    tests,
    ops: opsBetween(start, end)
  };
}

const uncached = run('uncached');
const cached = run('cached');
const delta = Math.round((uncached.wallSeconds - cached.wallSeconds) * 10) / 10;
console.log(JSON.stringify({ uncached, cached, deltaWallSeconds: delta }, null, 2));
process.exit(uncached.exit === 0 && cached.exit === 0 ? 0 : 1);
