// Reusable research run recorder (R3 correction). Two commands:
//
//   node run-recorder.mjs seal <declaration.json>
//   node run-recorder.mjs run --declaration <declaration.json> --out <dir>
//
// A declaration is the sealed pre-run plan:
//   { "runId": "kitchen-r3-fix-<uuid>", "commands": [
//       { "name": "probe", "argv": ["node", "-e", "process.exit(7)"],
//         "cwd": "/work", "timeoutMs": 30000 } ] }
//
// `seal` writes <declaration>.seal.json with the file's sha256, the runId it
// declares and the UTC seal instant. `run` refuses unless the seal exists,
// matches the declaration's current bytes and names the same runId, and the
// output directory is absent or empty (an incomplete run dir is never
// clobbered — its run.json persists with status "unknown" until completed).
// Every command executes directly (no shell) and is recorded with executable,
// verbatim argv, cwd, UTC start/end, exit code, signal, timeout and spawn
// error, and bounded stdout/stderr. Exit 0 is the only pass; a failing command
// followed by a passing one stays failed; timeout/signal/spawn-error never
// pass. Records prove ordering and structure inside one mechanical recipe —
// they do not authenticate the host or the operator.
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const OUTPUT_BOUND = 8192;
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 600_000;

const utc = () => new Date().toISOString();
const fail = message => { const error = new Error(message); error.name = 'RecorderRefused'; throw error; };

function loadDeclaration(path) {
  let parsed;
  try { parsed = JSON.parse(readFileSync(path, 'utf8')); } catch (error) { fail(`declaration unreadable: ${error.message}`); }
  if (typeof parsed?.runId !== 'string' || !/^[a-z0-9][a-z0-9._-]{2,127}$/.test(parsed.runId)) fail('declaration runId missing or not a safe identity');
  if (!Array.isArray(parsed.commands) || parsed.commands.length === 0 || parsed.commands.length > 64) fail('declaration needs 1..64 commands');
  for (const [index, command] of parsed.commands.entries()) {
    if (typeof command?.name !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(command.name)) fail(`command ${index} name missing or unsafe`);
    if (!Array.isArray(command.argv) || command.argv.length === 0 || command.argv.length > 64 || !command.argv.every(arg => typeof arg === 'string' && arg.length > 0 && arg.length <= 4096)) fail(`command '${command.name ?? index}' argv invalid`);
    if (command.cwd !== undefined && typeof command.cwd !== 'string') fail(`command '${command.name}' cwd invalid`);
    if (command.timeoutMs !== undefined && (!Number.isInteger(command.timeoutMs) || command.timeoutMs <= 0 || command.timeoutMs > MAX_TIMEOUT_MS)) fail(`command '${command.name}' timeoutMs out of range`);
  }
  if (new Set(parsed.commands.map(command => command.name)).size !== parsed.commands.length) fail('command names must be unique');
  return parsed;
}

export function sealDeclaration(declarationPath, sealedAt = utc()) {
  const target = resolve(declarationPath);
  const declaration = loadDeclaration(target);
  const sealPath = `${target}.seal.json`;
  if (existsSync(sealPath)) fail(`seal already exists for ${declarationPath} — a sealed declaration is immutable`);
  const sha256 = createHash('sha256').update(readFileSync(target)).digest('hex');
  writeFileSync(sealPath, JSON.stringify({ runId: declaration.runId, sha256, sealedAt }, null, 2) + '\n');
  return { sealPath, runId: declaration.runId, sha256, sealedAt };
}

function checkSeal(declarationPath) {
  const target = resolve(declarationPath);
  const declaration = loadDeclaration(target);
  let seal;
  try { seal = JSON.parse(readFileSync(`${target}.seal.json`, 'utf8')); } catch { fail(`no seal for ${declarationPath} — declare and seal before running`); }
  const sha256 = createHash('sha256').update(readFileSync(target)).digest('hex');
  if (seal.sha256 !== sha256) fail(`declaration changed after sealing (seal ${seal.sha256}, current ${sha256})`);
  if (seal.runId !== declaration.runId) fail(`seal runId ${seal.runId} does not match declaration runId ${declaration.runId}`);
  return { declaration, seal };
}

function runCommand(command, invocationId) {
  const [executable, ...args] = command.argv;
  const startedAt = utc();
  const timeoutMs = command.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const run = spawnSync(executable, args, { cwd: command.cwd, encoding: 'utf8', timeout: timeoutMs, windowsHide: true });
  const endedAt = utc();
  const timedOut = run.error !== undefined && ((run.error).code === 'ETIMEDOUT' || run.signal === 'SIGTERM');
  const record = {
    name: command.name,
    invocationId,
    executable,
    argv: args,
    cwd: command.cwd ?? null,
    startedAt,
    endedAt,
    exit: run.status,
    signal: run.signal,
    timedOut,
    error: run.error !== undefined && !timedOut ? run.error.message : null,
    stdout: (run.stdout ?? '').slice(-OUTPUT_BOUND),
    stderr: (run.stderr ?? '').slice(-OUTPUT_BOUND),
    result: run.error === undefined && run.status === 0 ? 'pass' : timedOut ? 'timeout' : run.error !== undefined ? 'error' : 'fail'
  };
  return record;
}

export function runDeclaration(declarationPath, outDir) {
  const { declaration, seal } = checkSeal(declarationPath);
  const out = resolve(outDir);
  if (existsSync(out) && readdirSync(out).length > 0) fail(`output dir ${out} is not empty — refusing to touch an existing or incomplete run`);
  mkdirSync(out, { recursive: true });
  const runFile = join(out, 'run.json');
  const state = { runId: declaration.runId, seal: { sha256: seal.sha256, sealedAt: seal.sealedAt }, startedAt: utc(), endedAt: null, status: 'unknown', records: [] };
  const persist = () => writeFileSync(runFile, JSON.stringify(state, null, 2) + '\n');
  persist(); // an interrupted run stays on disk as unknown, never deleted
  for (const command of declaration.commands) {
    try {
      state.records.push(runCommand(command, `${declaration.runId}/${command.name}/${randomUUID()}`));
    } catch (error) {
      state.records.push({ name: command.name, result: 'error', error: error instanceof Error ? error.message : String(error) });
    }
    persist();
  }
  state.endedAt = utc();
  state.status = 'complete';
  persist();
  return state;
}

function main(argv) {
  const [mode, ...rest] = argv;
  try {
    if (mode === 'seal' && rest.length === 1) {
      const result = sealDeclaration(rest[0]);
      console.log(JSON.stringify(result));
      return 0;
    }
    if (mode === 'run') {
      const declaration = rest[rest.indexOf('--declaration') + 1];
      const out = rest[rest.indexOf('--out') + 1];
      if (declaration === undefined || out === undefined || rest.indexOf('--declaration') < 0 || rest.indexOf('--out') < 0) return usage();
      const state = runDeclaration(declaration, out);
      console.log(JSON.stringify({ runId: state.runId, status: state.status, results: state.records.map(record => `${record.name}:${record.result}:${record.exit ?? ''}`) }));
      return 0;
    }
    return usage();
  } catch (error) {
    console.error(`recorder refused: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}
function usage() {
  console.error('usage: node run-recorder.mjs seal <declaration.json>');
  console.error('       node run-recorder.mjs run --declaration <declaration.json> --out <dir>');
  return 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exit(main(process.argv.slice(2)));
