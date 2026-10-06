import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [real, ...args] = process.argv.slice(2);
const statsPath = join(tmpdir(), 'box-k6-stats.jsonl');
const record = op => { try { appendFileSync(statsPath, JSON.stringify({ op }) + '\n'); } catch { } };
const passthrough = () => {
  const run = spawnSync(process.execPath, [real, ...args], { stdio: 'inherit' });
  process.exit(run.status === null ? 1 : run.status);
};

if (args.length === 2 && args[0] === 'install' && args[1] === '--lockfile-only' && existsSync(join(process.cwd(), 'package.json'))) {
  const dir = process.env.BOX_K6_LOCKFILE_CACHE || null;
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
