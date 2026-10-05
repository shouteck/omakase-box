// The kitchen's single acceptance command: node scripts/verify.mjs [--only] [--db=auto|embedded|docker|none] [suite...]
// Runs check, build and the named package scripts on the host against a disposable Postgres (embedded by default;
// KITCHEN_PG_URL under auto uses a provided server, --db=docker a throwaway container),
// writes one log per step plus summary.json under .kitchen/runs/, and exits 0 only when every step passed
// on a committed tree.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createWriteStream, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { docker } from './docker.mjs';
import { root } from './process.mjs';

const args = process.argv.slice(2);
const only = args.includes('--only');
const dbMode = (args.find(arg => arg.startsWith('--db=')) ?? '--db=auto').slice(5);
const suites = args.filter(arg => !arg.startsWith('--'));
const { scripts } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const unknown = suites.filter(name => !Object.hasOwn(scripts, name));
if (unknown.length || !['auto', 'embedded', 'docker', 'none'].includes(dbMode)) {
  console.error(unknown.length ? `Unknown package script: ${unknown.join(', ')}` : `Unknown --db mode: ${dbMode}`);
  process.exit(2);
}
const steps = [...(only ? [] : ['check', 'build']), ...suites];
if (!steps.length) { console.error('Nothing to run.'); process.exit(2); }

const checkout = root.replace(/[\\/]+$/, '').replaceAll('\\', '/');
function capture(command, commandArgs) {
  return new Promise(resolve => {
    const child = spawn(command, commandArgs, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.on('error', () => resolve(null));
    child.on('exit', code => resolve(code === 0 ? output : null));
  });
}
const git = gitArgs => capture('git', ['-c', `safe.directory=${checkout}`, ...gitArgs]);
const sha = (await git(['rev-parse', 'HEAD']))?.trim();
const status = await git(['status', '--porcelain']);
if (!sha || status === null) { console.error('Cannot read the Git revision.'); process.exit(2); }
const dirty = status.trim().length > 0;

async function dockerDatabase() {
  const name = 'kitchen-verify-' + randomBytes(4).toString('hex');
  const password = randomBytes(16).toString('hex');
  const image = JSON.parse(readFileSync(new URL('./toolchain.json', import.meta.url), 'utf8')).images.trustedPostgres;
  const started = await docker(['run', '-d', '--rm', '--pull=never', '--name', name, '-e', `POSTGRES_PASSWORD=${password}`, '--tmpfs', '/var/lib/postgresql/data', '--memory', '512m', '-p', '127.0.0.1::5432', image]);
  if (started.code !== 0) throw new Error(`Disposable Postgres did not start: ${started.stderr.trim()}`);
  const stop = () => docker(['rm', '-f', name]).catch(() => undefined);
  try {
    const port = (await docker(['port', name, '5432/tcp'])).stdout.trim().split(':').pop();
    if (!/^\d+$/.test(port ?? '')) throw new Error('Disposable Postgres published no port.');
    for (let attempt = 0; ; attempt += 1) {
      if ((await docker(['exec', name, 'pg_isready', '-q', '-h', '127.0.0.1', '-U', 'postgres'])).code === 0) break;
      if (attempt >= 60) throw new Error('Disposable Postgres was not ready within 30 seconds.');
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    return { kind: 'docker', url: `postgres://postgres:${password}@127.0.0.1:${port}/postgres`, stop };
  } catch (error) { await stop(); throw error; }
}
const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer().once('error', reject).listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});
// embedded-postgres only carries the PostgreSQL binaries here. pg_ctl starts the server because postgres.exe refuses an
// elevated Windows account, which pg_ctl handles by dropping privileges itself.
const tool = (command, commandArgs) => new Promise(resolve => {
  const child = spawn(command, commandArgs, { stdio: 'ignore', windowsHide: true });
  child.on('error', () => resolve(127));
  child.on('exit', code => resolve(code ?? 1));
});
async function embeddedDatabase() {
  const binaries = `@embedded-postgres/${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`;
  const { initdb, pg_ctl: pgCtl } = await import(pathToFileURL(createRequire(import.meta.resolve('embedded-postgres')).resolve(binaries)).href);
  const directory = mkdtempSync(join(tmpdir(), 'kitchen-verify-pg-'));
  const data = join(directory, 'data');
  const serverLog = join(directory, 'server.log');
  const password = randomBytes(16).toString('hex');
  let started = false;
  let stopped;
  const stop = () => stopped ??= (async () => {
    if (started && await tool(pgCtl, ['stop', '-D', data, '-m', 'fast', '-w', '-t', '30']) !== 0) await tool(pgCtl, ['stop', '-D', data, '-m', 'immediate', '-w', '-t', '30']);
    rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  })();
  db = { kind: 'embedded', stop }; // registered before startup so a signal during initdb still cleans up
  try {
    const passwordFile = join(directory, 'pwfile');
    writeFileSync(passwordFile, password + '\n', { mode: 0o600 });
    const initialised = await tool(initdb, ['-D', data, '-U', 'postgres', '--auth=scram-sha-256', `--pwfile=${passwordFile}`, '--encoding=UTF8', '--locale=C']);
    rmSync(passwordFile, { force: true });
    if (initialised !== 0) throw new Error(`initdb exited ${initialised}.`);
    const port = await freePort();
    started = true;
    if (await tool(pgCtl, ['start', '-D', data, '-l', serverLog, '-w', '-t', '60', '-o', `-p ${port} -c listen_addresses=127.0.0.1`]) !== 0) {
      let tail = '';
      try { tail = readFileSync(serverLog, 'utf8').trim().split('\n').slice(-3).join(' | '); } catch { /* no server log */ }
      throw new Error(`pg_ctl start failed${tail ? `: ${tail}` : '.'}`);
    }
    return { kind: 'embedded', url: `postgres://postgres:${password}@127.0.0.1:${port}/postgres`, stop };
  } catch (error) { await stop(); throw new Error(`Embedded Postgres did not start: ${error instanceof Error ? error.message : String(error)}`); }
}
async function database() {
  if (dbMode === 'none') return { kind: 'none', stop: async () => undefined };
  if (dbMode === 'auto' && process.env.KITCHEN_PG_URL) return { kind: 'provided', url: process.env.KITCHEN_PG_URL, stop: async () => undefined };
  return dbMode === 'docker' ? dockerDatabase() : embeddedDatabase();
}

const startedAt = new Date();
const runDirectory = join(root, '.kitchen', 'runs', `${startedAt.toISOString().replace(/[:.]/g, '-')}-${sha.slice(0, 7)}`);
mkdirSync(runDirectory, { recursive: true });
const pnpm = fileURLToPath(new URL('./pnpm.mjs', import.meta.url));
function runStep(name, env) {
  return new Promise(resolve => {
    const log = `${name.replace(/[^a-z0-9-]/gi, '_')}.log`;
    const sink = createWriteStream(join(runDirectory, log));
    const began = Date.now();
    const child = spawn(process.execPath, [pnpm, name], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { sink.write(chunk); process.stdout.write(chunk); });
    const finish = exit => sink.end(() => resolve({ name, exit, seconds: Math.round((Date.now() - began) / 1000), log }));
    child.on('error', () => finish(127));
    child.on('exit', code => finish(code ?? 1));
  });
}

let db = { kind: 'none', stop: async () => undefined };
const results = [];
let failure;
const stopAndExit = () => db.stop().finally(() => process.exit(130));
process.on('SIGINT', stopAndExit);
process.on('SIGTERM', stopAndExit);
try {
  db = await database();
  const env = { ...process.env, ...(db.url ? { BOX_TEST_DATABASE_URL: db.url, BOX_DELEGATION_DATABASE_URL: db.url, BOX_TEST_RUN_ID: `v${sha.slice(0, 12)}` } : {}) };
  for (const name of steps) {
    const result = await runStep(name, env);
    results.push(result);
    if (result.exit !== 0) break;
  }
} catch (error) { failure = error instanceof Error ? error.message : String(error); }
finally { await db.stop(); }

const passed = !failure && results.length === steps.length && results.every(result => result.exit === 0);
const verdict = !passed ? 'FAIL' : dirty ? 'UNCOMMITTED' : 'PASS';
const notRun = steps.slice(results.length);
const seconds = Math.round((Date.now() - startedAt.getTime()) / 1000);
const line = `verify ${sha.slice(0, 7)}${dirty ? '+dirty' : ''} ${verdict} ${results.map(result => `${result.name}=${result.exit}`).join(' ')}${notRun.length ? ` not-run=${notRun.join(',')}` : ''} db=${db.kind} ${seconds}s${failure ? ` (${failure})` : ''}`;
writeFileSync(join(runDirectory, 'summary.json'), JSON.stringify({ schemaVersion: 1, sha, dirty, verdict, startedAt: startedAt.toISOString(), seconds, database: db.kind, steps: results, notRun, failure: failure ?? null, line }, null, 2) + '\n');
console.log(`\n${line}\nLogs: ${runDirectory}`);

// Stall guard (advisory only): when this branch keeps producing non-PASS runs,
// print a STALL line telling the agent to park the wave. It never changes the
// verdict text or the exit code. Keying: a run counts when its summary sha — or
// its dir-name sha when no summary was written — is a commit unique to this
// branch (merge-base..HEAD) or the branch point itself, so dirty runs made
// before the first commit lands still count; only a clean PASS breaks the streak.
try {
  const { readRuns, stallCheck } = await import('./kitchen-stats.mjs');
  const stallRuns = Number(args.find(arg => arg.startsWith('--stall-runs='))?.slice(13)) || 6;
  const stallMinutes = Number(args.find(arg => arg.startsWith('--stall-minutes='))?.slice(16)) || 90;
  const branch = ((await git(['rev-parse', '--abbrev-ref', 'HEAD'])) ?? '').trim() || 'HEAD';
  const base = branch !== 'master' && branch !== 'HEAD' ? ((await git(['merge-base', 'HEAD', 'master'])) ?? '').trim() : null;
  const listed = (await git(base ? ['rev-list', `${base}..HEAD`] : ['rev-list', 'HEAD'])) ?? '';
  const stall = stallCheck(readRuns(join(root, '.kitchen', 'runs')), new Set([...listed.split('\n').map(item => item.trim()).filter(Boolean), sha, base].filter(Boolean)), { maxRuns: stallRuns, maxMinutes: stallMinutes });
  if (stall) console.log(`STALL ${branch === 'HEAD' ? 'on detached HEAD' : `on branch ${branch}`}: ${stall.triggers.join('; ')} — park the wave and report what was tried instead of re-running verify`);
} catch { /* advisory only: a broken stall check must not change the verdict */ }
process.exit(verdict === 'PASS' ? 0 : verdict === 'UNCOMMITTED' ? 3 : 1);
