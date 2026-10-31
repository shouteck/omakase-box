#!/usr/bin/env node
// The one command: node packages/box-platform/local.mjs [port]. Builds what is
// missing, starts a GitHub stand-in, and serves the board on localhost.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] ?? 4320);
if (!existsSync(join(here, 'out', 'index.html'))) {
  console.log('Building the pages (once).');
  const next = join(here, 'node_modules', 'next', 'dist', 'bin', 'next');
  const built = spawnSync(process.execPath, [next, 'build'], { cwd: here, stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
  if (built.status !== 0) { console.error('The pages did not build. Next: read the output above.'); process.exit(1); }
}
await build({ root: here, logLevel: 'warn', build: { ssr: 'src/local.ts', outDir: 'dist', emptyOutDir: true, sourcemap: false } });
const { startLocal } = await import(pathToFileURL(join(here, 'dist', 'local.js')).href);
const board = await startLocal({ schema: join(here, 'schema.sql'), out: join(here, 'out'), port });
// The stand-in is local: read it until every bounty's details are in, a real board's budget aside.
let result;
do { result = await board.refresh(); await board.env.DB.prepare("DELETE FROM meta WHERE key LIKE 'budget_%'").run(); } while (result.state === 'budget-spent' && (await board.env.DB.prepare('SELECT COUNT(*) AS n FROM bounties WHERE details_read_at = 0').first()).n > 0);
console.log(`The board, with a GitHub stand-in and sample data: ${board.url}/  (Ctrl+C to stop)`);
