// Harmless generic stand-in for a package manager invocation. It never resolves
// a real dependency tree; it records every invocation's argv to
// $FAKE_PNPM_DIR/calls.jsonl (or ./pnpm-calls.jsonl), and if an install-like
// call arrives WITHOUT --ignore-scripts it drops a `lifecycle-ran.sentinel`
// file — the canary a real lifecycle script would have produced. A
// `install --lockfile-only` call also emits a minimal pnpm-lock.yaml so the
// lockfile path can proceed. Safe on any host: it executes nothing but writes.
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const dir = process.env.FAKE_PNPM_DIR || process.cwd();
mkdirSync(dir, { recursive: true });
appendFileSync(join(dir, 'calls.jsonl'), JSON.stringify({ cwd: process.cwd(), argv: args }) + '\n');

const INSTALL_LIKE = new Set(['install', 'i', 'add', 'update', 'up', 'remove', 'rm', 'uninstall', 'rebuild', 'import', 'fetch', 'create', 'dlx']);
const verb = args.find(arg => !arg.startsWith('-'));
if (verb !== undefined && INSTALL_LIKE.has(verb)) {
  if (!args.includes('--ignore-scripts')) writeFileSync(join(dir, 'lifecycle-ran.sentinel'), `scripts would have run: ${args.join(' ')}\n`);
  if (args.includes('--lockfile-only')) writeFileSync(join(process.cwd(), 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\nsettings: {}\n');
}
process.exit(0);
