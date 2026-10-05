// W002/B1.1 r4 narrow container-side exec wrapper.
// Supervises ONLY manifest-listed exec children: it spawns the fixed argv for a
// manifest command id and accounts for child termination or timeout. It never
// runs arbitrary shell/PID kills, never stops containers, and does NOT claim a
// remote exec terminated just because a local transport process was killed: if
// the child exit cannot be confirmed, it records 'unavailable' and stops.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const RUNNER_OUTPUT_MAX = 262144;
export const DEFAULT_CHILD_TIMEOUT_MS = 20000;
export const SIGKILL_GRACE_MS = 3000;

export function resolveEntry(manifest, commandId) {
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.entries)) throw new Error('manifest_invalid');
  const entry = manifest.entries.find(candidate => candidate.id === commandId);
  if (!entry) throw new Error('unlisted_command');
  if (typeof entry.runnerArgv !== 'object' || !Array.isArray(entry.runnerArgv) || entry.runnerArgv.length === 0) {
    throw new Error('runner_argv_missing');
  }
  for (const part of entry.runnerArgv) {
    if (typeof part !== 'string' || part.length === 0 || part.length > 65536 || /[\0]/.test(part)) throw new Error('runner_argv_invalid');
  }
  return entry;
}

// Bind '@SOURCE@' placeholders to a reviewed literal: the supplied source must
// hash to the manifest-pinned digest, else the command is denied.
export function bindRunnerArgv(entry, { source } = {}) {
  const argv = entry.runnerArgv.slice();
  const index = argv.indexOf('@SOURCE@');
  if (index === -1) {
    if (source !== undefined && source !== null) throw new Error('source_unexpected');
    return argv;
  }
  if (typeof source !== 'string' || source.length > 65536) throw new Error('source_size');
  if (createHash('sha256').update(source).digest('hex') !== entry.sourceSha256) throw new Error('source_digest');
  argv[index] = source;
  return argv;
}

// Runs one manifest-listed child. Returns an honest outcome:
//   'exited'       -> child exit observed (code recorded)
//   'terminated'   -> wrapper killed its own child AND exit was observed
//   'unavailable'  -> child state unconfirmed (stop; do not retry blindly)
export async function runChild(manifest, commandId, { input, timeoutMs, source, spawnImpl = spawn, clock = () => Date.now(), killGraceMs = SIGKILL_GRACE_MS } = {}) {
  const entry = resolveEntry(manifest, commandId);
  const limit = Math.min(timeoutMs ?? entry.timeoutMs ?? DEFAULT_CHILD_TIMEOUT_MS, DEFAULT_CHILD_TIMEOUT_MS);
  const argv = bindRunnerArgv(entry, { source });
  const started = clock();
  return new Promise(resolve => {
    let child;
    try { child = spawnImpl(argv[0], argv.slice(1), { stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' }); }
    catch (error) { resolve({ status: 'unavailable', reason: 'spawn:' + String(error?.message ?? error), elapsedMs: clock() - started }); return; }
    const signal = sig => {
      try { if (process.platform !== 'win32' && typeof child.pid === 'number') process.kill(-child.pid, sig); else child.kill(sig); }
      catch { try { child.kill(sig); } catch { /* noop */ } }
    };
    let stdout = ''; let stderr = ''; let timedOut = false; let exited = false;
    let killTimer; let confirmTimer;
    const timer = setTimeout(() => {
      timedOut = true;
      signal('SIGTERM');
      killTimer = setTimeout(() => signal('SIGKILL'), killGraceMs);
      killTimer.unref?.();
      // If the child never reports exit, final state stays unconfirmed.
      confirmTimer = setTimeout(() => { if (!exited) resolve({ status: 'unavailable', reason: 'termination_unconfirmed', timedOut, elapsedMs: clock() - started, stdout, stderr }); }, killGraceMs * 2 + 500);
      confirmTimer.unref?.();
    }, limit);
    child.stdout?.on('data', chunk => { stdout = (stdout + chunk.toString()).slice(-RUNNER_OUTPUT_MAX); });
    child.stderr?.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-RUNNER_OUTPUT_MAX); });
    child.on('error', error => { exited = true; clearTimeout(timer); clearTimeout(killTimer); clearTimeout(confirmTimer); resolve({ status: 'unavailable', reason: 'child_error:' + String(error?.message ?? error), elapsedMs: clock() - started, stdout, stderr }); });
    child.on('exit', code => {
      exited = true;
      clearTimeout(timer); clearTimeout(killTimer); clearTimeout(confirmTimer);
      let groupEmpty = true;
      if (process.platform !== 'win32' && typeof child.pid === 'number') {
        try { process.kill(-child.pid, 0); groupEmpty = false; }
        catch (error) { if (error?.code !== 'ESRCH') groupEmpty = false; }
      }
      if (!groupEmpty) {
        resolve({ status: 'unavailable', reason: 'descendants_unconfirmed', timedOut, elapsedMs: clock() - started, stdout, stderr });
        return;
      }
      resolve({ status: timedOut ? 'terminated' : 'exited', code: code ?? 1, timedOut, descendants: process.platform !== 'win32' ? 'process_group_confirmed_empty' : 'none', elapsedMs: clock() - started, stdout, stderr });
    });
    child.stdin?.on('error', () => {});
    child.stdin?.end(input ?? null);
  });
}

export async function runChildRecorded(manifestPath, commandId, stateDir, options = {}) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const outcome = await runChild(manifest, commandId, options);
  // stateDir is optional: service containers are read-only, so durable runner
  // records are written only where a writable state dir was reviewed. A failed
  // durable write is surfaced, never swallowed.
  if (typeof stateDir === 'string' && stateDir.length > 0) {
    await mkdir(stateDir, { recursive: true });
    await writeFile(join(stateDir, `runner-${commandId}-${Date.now()}.json`), JSON.stringify({ schemaVersion: 1, kind: 'runner_outcome', commandId, ...outcome }, null, 2));
  }
  // Unconfirmed termination is unavailable and stops further work upstream.
  return outcome;
}

const ENVELOPE_MAX = 131072;

async function readEnvelope() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > ENVELOPE_MAX) throw new Error('envelope_size');
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks).toString('utf8');
  if (body.length === 0) return { source: null, input: null };
  let parsed;
  try { parsed = JSON.parse(body); } catch { throw new Error('envelope_malformed'); }
  if (parsed?.schemaVersion !== 1) throw new Error('envelope_schema');
  if (parsed.source !== null && parsed.source !== undefined && typeof parsed.source !== 'string') throw new Error('envelope_source');
  if (parsed.input !== null && parsed.input !== undefined && typeof parsed.input !== 'string') throw new Error('envelope_input');
  return { source: parsed.source ?? null, input: parsed.input ?? null };
}

if (process.argv[1] && process.argv[1].endsWith('fixture-exec-runner.mjs')) {
  const [, , manifestPath, commandId, stateDir] = process.argv;
  if (!manifestPath || !commandId) { console.error('usage: fixture-exec-runner.mjs <manifest> <commandId> [stateDir]'); process.exit(2); }
  let outcome;
  try {
    const envelope = await readEnvelope();
    outcome = await runChildRecorded(manifestPath, commandId, stateDir, { input: envelope.input, source: envelope.source });
  } catch (error) {
    outcome = { status: 'unavailable', reason: String(error?.message ?? error) };
    console.log(JSON.stringify(outcome));
    process.exit(3);
  }
  console.log(JSON.stringify(outcome));
  process.exit(outcome.status === 'exited' ? outcome.code : (outcome.status === 'terminated' ? 124 : 3));
}
