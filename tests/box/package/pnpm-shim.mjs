import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [real, ...args] = process.argv.slice(2);
// Invocation-local op log, named for the spawning process: a measurement reads
// only the lines its own run wrote, and no environment variable can point this
// file at a caller's bytes.
const statsPath = join(tmpdir(), `box-k6-stats-${process.ppid ?? process.pid}.jsonl`);
const record = op => { try { appendFileSync(statsPath, JSON.stringify({ op }) + '\n'); } catch { } };
const passthrough = () => {
  const run = spawnSync(process.execPath, [real, ...args], { stdio: 'inherit' });
  process.exit(run.status === null ? 1 : run.status);
};

// The whole cache trust decision: a sibling `pnpm-shim.cachedir` file naming a
// directory. The committed copy of this shim has none, so invoking it directly
// — with any environment, planted or inherited — always resolves for real.
// The test harness writes the file only beside its own fresh per-invocation
// copy of this script, pointing at a directory that invocation just created
// inside its own temp root; K6_LOCKFILE_MODE=uncached ignores it entirely.
const invocationCache = () => {
  if (process.env.K6_LOCKFILE_MODE === 'uncached') return null;
  try {
    const configured = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'pnpm-shim.cachedir'), 'utf8').trim();
    return isAbsolute(configured) ? configured : null;
  } catch { return null; }
};

if (args.length === 2 && args[0] === 'install' && args[1] === '--lockfile-only' && existsSync(join(process.cwd(), 'package.json'))) {
  const dir = invocationCache();
  if (!dir) {
    record('lockfile-real');
    passthrough();
  }
  const key = createHash('sha256').update(readFileSync(join(process.cwd(), 'package.json'))).digest('hex');
  const cached = join(dir, key + '.yaml');
  const produced = join(process.cwd(), 'pnpm-lock.yaml');
  if (existsSync(cached)) {
    copyFileSync(cached, produced);
    record('lockfile-hit');
    process.exit(0);
  }
  const run = spawnSync(process.execPath, [real, ...args], { stdio: 'inherit' });
  const code = run.status === null ? 1 : run.status;
  if (code === 0 && existsSync(produced)) {
    mkdirSync(dir, { recursive: true });
    copyFileSync(produced, cached);
  }
  record('lockfile-miss');
  process.exit(code);
}

record('other');
passthrough();
