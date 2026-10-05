// W002/B1.1 r4 supervised fixture-exec relay host.
// Finite reviewed lifecycle: reviewed -> starting -> ready -> draining -> stopped,
// with failed/unavailable terminal outcomes. One lease owner, one run/environment
// binding, one request at a time, durable started/result records, fail-closed on
// stale/replay/oversize, old mailbox never consumed. Does not stop containers and
// never claims remote termination from killing the host Docker CLI alone.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dockerContext, dockerExecutable } from '../docker.mjs';

export const REQUEST_MAX_BYTES = 16384;
export const INPUT_MAX = 65536;
export const OUTPUT_MAX = 262144;
export const SEEN_MAX = 8192;
export const READY_COMMAND_DEADLINE_MS = 20000;
export const DRAIN_DEADLINE_MS = 10000;
export const LEASE_TTL_MS = 180 * 60 * 1000;
export const LIFECYCLE = ['reviewed', 'starting', 'ready', 'draining', 'stopped'];

export function validateRequest(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > REQUEST_MAX_BYTES) throw new Error('request_size');
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error('request_malformed'); }
  if (parsed?.schemaVersion !== 1) throw new Error('request_schema');
  if (typeof parsed.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.requestId)) throw new Error('request_id');
  if (typeof parsed.commandId !== 'string' || parsed.commandId.length > 128 || !/^[A-Za-z0-9_.-]+$/.test(parsed.commandId)) throw new Error('command_id');
  // runId is optional at the parser boundary (legacy unit compatibility); any
  // real dispatch additionally requires it to match the active lease exactly.
  if (parsed.runId !== undefined && parsed.runId !== null && (typeof parsed.runId !== 'string' || parsed.runId.length > 128 || !/^[A-Za-z0-9_.-]+$/.test(parsed.runId))) throw new Error('run_id');
  if (parsed.input !== null && typeof parsed.input !== 'string') throw new Error('input_type');
  if (typeof parsed.input === 'string' && parsed.input.length > INPUT_MAX) throw new Error('input_size');
  if (parsed.source !== null && parsed.source !== undefined && typeof parsed.source !== 'string') throw new Error('source_type');
  if (typeof parsed.source === 'string' && parsed.source.length > INPUT_MAX) throw new Error('source_size');
  return parsed;
}

export function assertSafeEntry(entry) {
  if (typeof entry?.id !== 'string' || entry.id.length > 128 || !/^[A-Za-z0-9_.-]+$/.test(entry.id)) throw new Error('entry_id');
  if (!['private-api', 'external-api'].includes(entry.service)) throw new Error('entry_service');
  if (entry.workdir !== `/workspace/services/${entry.service}`) throw new Error('entry_workdir');
  for (const pair of entry.env ?? []) if (!/^[A-Z_]+=[A-Za-z0-9_-]+$/.test(pair)) throw new Error('entry_env');
  if (!Array.isArray(entry.argv) || entry.argv.length === 0 || entry.argv.length > 8 || entry.argv[0] !== 'node') throw new Error('entry_argv');
  if (entry.argv.includes('@SOURCE@') && !/^[a-f0-9]{64}$/.test(entry.sourceSha256 ?? '')) throw new Error('entry_source');
  if (!['json', 'none', 'bounded'].includes(entry.input)) throw new Error('entry_input');
  if (entry.requiresSpecificConfirmation === true) throw new Error('entry_unconfirmed');
  // Parser-level bound: when a deadline is declared it must respect the ready cap.
  if (entry.timeoutMs !== undefined && (typeof entry.timeoutMs !== 'number' || entry.timeoutMs <= 0 || entry.timeoutMs > READY_COMMAND_DEADLINE_MS)) throw new Error('entry_deadline');
}

// Ready-profile enforcement for live dispatch: an explicit bounded deadline and a
// reviewed container-side wrapper argv are mandatory; parser-level checks alone
// never authorize execution.
export function assertReadyProfileEntry(entry) {
  assertSafeEntry(entry);
  if (typeof entry.timeoutMs !== 'number' || entry.timeoutMs <= 0 || entry.timeoutMs > READY_COMMAND_DEADLINE_MS) throw new Error('entry_deadline');
  if (!Array.isArray(entry.runnerArgv) || entry.runnerArgv.length === 0) throw new Error('runner_argv_missing');
  for (const part of entry.runnerArgv) if (typeof part !== 'string' || part.length === 0 || /[\0]/.test(part)) throw new Error('runner_argv_invalid');
}

export function assertWrapperBinding(manifest) {
  const wrapper = manifest?.wrapper;
  if (typeof wrapper?.path !== 'string' || !/^\/[A-Za-z0-9_\/.\-]+$/.test(wrapper.path)) throw new Error('wrapper_path');
  if (!wrapper.path.endsWith('fixture-exec-runner.mjs')) throw new Error('wrapper_path');
  if (typeof wrapper.manifestPath !== 'string' || !/^\/[A-Za-z0-9_\/.\-]+\.json$/.test(wrapper.manifestPath)) throw new Error('wrapper_manifest');
  if (!/^[a-f0-9]{64}$/.test(wrapper.sha256 ?? '')) throw new Error('wrapper_digest');
  return wrapper;
}

export function buildExecArgv(manifest, request) {
  const entry = manifest.entries.find(candidate => candidate.id === request.commandId);
  if (!entry) throw new Error('unlisted_command');
  assertSafeEntry(entry);
  const container = manifest.containers[entry.service];
  if (typeof container !== 'string' || !/^w002-b11-svc-(private-api|external-api)$/.test(container)) throw new Error('container_map');
  const argv = ['--context', dockerContext, 'exec', '-i', '--workdir', entry.workdir];
  for (const pair of entry.env ?? []) argv.push('--env', pair);
  const sourceIndex = entry.argv.indexOf('@SOURCE@');
  argv.push(container, ...entry.argv);
  if (sourceIndex !== -1) {
    if (typeof request.source !== 'string' || request.source.length > INPUT_MAX || createHash('sha256').update(request.source).digest('hex') !== entry.sourceSha256) throw new Error('source_digest');
    argv[argv.indexOf('@SOURCE@')] = request.source;
  } else if (request.source !== null && request.source !== undefined) throw new Error('source_unexpected');
  return { argv, entry };
}

// Live dispatch argv routes through the reviewed container-side wrapper, never a
// direct fixture command. The wrapper binds @SOURCE@ by digest inside the
// container; the host re-verifies the digest before passing the source in the
// bounded stdin envelope.
export function buildLiveArgv(manifest, request) {
  const { entry } = buildExecArgv(manifest, request);
  assertReadyProfileEntry(entry);
  const wrapper = assertWrapperBinding(manifest);
  const container = manifest.containers[entry.service];
  const argv = ['--context', dockerContext, 'exec', '-i', '--workdir', entry.workdir];
  for (const pair of entry.env ?? []) argv.push('--env', pair);
  argv.push(container, 'node', wrapper.path, wrapper.manifestPath, entry.id);
  const envelope = JSON.stringify({ schemaVersion: 1, source: request.source ?? null, input: request.input ?? null });
  if (envelope.length > INPUT_MAX) throw new Error('envelope_size');
  return { argv, entry, envelope };
}

export async function acquireLease(mailbox, { runId, environmentId, ttlMs = LEASE_TTL_MS, now = () => new Date() } = {}) {
  if (typeof runId !== 'string' || !/^[A-Za-z0-9_.-]{4,128}$/.test(runId)) throw new Error('run_id_invalid');
  if (typeof environmentId !== 'string' || environmentId.length === 0) throw new Error('environment_id_invalid');
  if (ttlMs <= 0 || ttlMs > LEASE_TTL_MS) throw new Error('lease_ttl_invalid');
  await mkdir(join(mailbox, 'state'), { recursive: true });
  const existing = await readFile(join(mailbox, 'state', 'lease.json'), 'utf8').catch(() => null);
  if (existing !== null) throw new Error('lease_collision');
  const lease = {
    schemaVersion: 1,
    runId,
    environmentId,
    issuedAt: now().toISOString(),
    expiresAt: new Date(now().getTime() + ttlMs).toISOString(),
    owner: 'fixture-exec-host'
  };
  await writeFile(join(mailbox, 'state', 'lease.json'), JSON.stringify(lease, null, 2), { flag: 'wx' });
  return lease;
}

export async function loadLease(mailbox, { runId, environmentId, now = () => Date.now() } = {}) {
  const raw = await readFile(join(mailbox, 'state', 'lease.json'), 'utf8').catch(() => null);
  if (raw === null) throw new Error('lease_missing');
  let lease;
  try { lease = JSON.parse(raw); } catch { throw new Error('lease_malformed'); }
  if (runId !== undefined && lease.runId !== runId) throw new Error('lease_binding_mismatch');
  if (environmentId !== undefined && lease.environmentId !== environmentId) throw new Error('lease_binding_mismatch');
  const expiresAt = Date.parse(lease.expiresAt ?? '');
  if (!Number.isFinite(expiresAt)) throw new Error('lease_malformed');
  if (expiresAt <= now()) throw new Error('lease_expired');
  return lease;
}

export async function setLifecycle(mailbox, state) {
  if (![...LIFECYCLE, 'failed', 'unavailable'].includes(state)) throw new Error('lifecycle_state_invalid');
  await mkdir(join(mailbox, 'state'), { recursive: true });
  const path = join(mailbox, 'state', 'lifecycle.json');
  const tmp = path + '.tmp';
  await writeFile(tmp, JSON.stringify({ schemaVersion: 1, state, at: new Date().toISOString() }));
  await rename(tmp, path);
}

export async function getLifecycle(mailbox) {
  let raw;
  try { raw = await readFile(join(mailbox, 'state', 'lifecycle.json'), 'utf8'); }
  catch (error) { if (error?.code === 'ENOENT') return null; throw new Error('lifecycle_unreadable:' + String(error?.code ?? error?.message ?? error)); }
  let record;
  try { record = JSON.parse(raw); } catch { throw new Error('lifecycle_malformed'); }
  if (![...LIFECYCLE, 'failed', 'unavailable'].includes(record?.state)) throw new Error('lifecycle_malformed');
  return record.state;
}

// Executes one mailbox request. Denial ordering is preserved: malformed,
// run-binding (when a lease context is bound), replay, unlisted/stdin and
// execution-context checks happen in that order. Live dispatch additionally
// requires: a reviewed lease bound to this run/environment, the immutable
// manifest digest bound by run(), lifecycle 'ready', and a successfully
// persisted durable started record BEFORE any child is spawned.
// Returns an outcome object; callers must stop admission on 'unavailable'.
export async function executeRequest(manifest, mailbox, fileName, seen, context = undefined) {
  const requestId = fileName.replace(/\.json$/, '');
  const deny = async (id, error) => {
    try { await writeResult(mailbox, id, { schemaVersion: 1, requestId: id, error: 'denied:' + error }); }
    catch (persistError) { return { status: 'unavailable', reason: 'denial_persist_failed:' + String(persistError?.message ?? persistError) }; }
    return { status: 'denied' };
  };
  let request;
  try { request = validateRequest(await readFile(join(mailbox, 'requests', fileName), 'utf8')); } catch (error) {
    return deny(requestId, error.message);
  }
  const lease = context?.lease;
  if (lease !== undefined && request.runId !== lease.runId) return deny(request.requestId, 'run_binding');
  if (seen.has(request.requestId)) return deny(request.requestId, 'replay');
  let built;
  try { built = buildLiveArgv(manifest, request); } catch (error) {
    // Parser-level denials still route through buildExecArgv-compatible errors.
    return deny(request.requestId, error.message);
  }
  if (built.entry.input === 'none' && request.input !== null) return deny(request.requestId, 'stdin');
  let lifecycle;
  try { lifecycle = await getLifecycle(mailbox); } catch (error) {
    return { status: 'unavailable', reason: 'lifecycle_' + String(error?.message ?? error) };
  }
  // Fail closed: no live execution without a fully bound reviewed context.
  if (lease === undefined || context?.manifestDigest !== manifestDigest(manifest) || lifecycle !== 'ready') {
    return deny(request.requestId, 'execution_context');
  }
  try {
    await loadLease(mailbox, { runId: lease.runId, environmentId: lease.environmentId });
  } catch (error) {
    const outcome = await deny(request.requestId, 'execution_context');
    return outcome.status === 'unavailable' ? outcome : { status: 'unavailable', reason: 'lease_' + String(error?.message ?? error) };
  }
  try {
    seen.add(request.requestId);
    try {
      await writeRecord(mailbox, 'started', request.requestId, { commandId: built.entry.id, at: new Date().toISOString() });
    } catch (persistError) {
      return { status: 'unavailable', reason: 'started_record_persist_failed:' + String(persistError?.message ?? persistError) };
    }
    const result = await runDocker(built.argv, built.envelope, Math.min(built.entry.timeoutMs, READY_COMMAND_DEADLINE_MS));
    await writeResult(mailbox, request.requestId, { schemaVersion: 1, requestId: request.requestId, ...result });
    // Unconfirmed remote state blocks all further admission.
    return result.remoteState === 'unconfirmed' ? { status: 'unavailable', reason: 'termination_unconfirmed' } : { status: 'done' };
  } catch (error) {
    await writeResult(mailbox, request.requestId, { schemaVersion: 1, requestId: request.requestId, error: 'unavailable:' + String(error?.message ?? error) }).catch(() => undefined);
    return { status: 'unavailable', reason: String(error?.message ?? error) };
  }
}

export const WRAPPER_RESULT_MAX = OUTPUT_MAX;
export function transformWrapperResult(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > WRAPPER_RESULT_MAX) return { code: 1, stdout: '', stderr: 'wrapper_result_malformed', remoteState: 'unconfirmed' };
  let outcome;
  try { outcome = JSON.parse(raw); } catch { return { code: 1, stdout: '', stderr: 'wrapper_result_malformed', remoteState: 'unconfirmed' }; }
  if (outcome === null || typeof outcome !== 'object' || !['exited', 'terminated', 'unavailable'].includes(outcome.status)) return { code: 1, stdout: '', stderr: 'wrapper_result_malformed', remoteState: 'unconfirmed' };
  if (typeof outcome.stdout !== 'string' || outcome.stdout.length > WRAPPER_RESULT_MAX) return { code: 1, stdout: '', stderr: 'wrapper_result_malformed', remoteState: 'unconfirmed' };
  const stdout = outcome.stdout;
  const stderr = typeof outcome.stderr === 'string' ? outcome.stderr.slice(0, WRAPPER_RESULT_MAX) : '';
  if (outcome.status === 'unavailable') return { code: 1, stdout, stderr: stderr || ('wrapper_unavailable:' + String(outcome.reason ?? 'unknown')).slice(0, 1024), remoteState: 'unconfirmed' };
  if (outcome.status === 'terminated') return { code: 124, stdout, stderr, remoteState: 'terminated' };
  if (typeof outcome.code !== 'number' || !Number.isInteger(outcome.code) || outcome.code < 0 || outcome.code > 255) return { code: 1, stdout, stderr: (stderr + ' wrapper_result_malformed').slice(0, WRAPPER_RESULT_MAX), remoteState: 'unconfirmed' };
  return { code: outcome.code, stdout, stderr, remoteState: 'exited' };
}

function runDocker(argv, input, timeoutMs) {
  return new Promise(resolve => {
    const child = spawn(dockerExecutable(), argv, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = ''; let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      resolve({ code: 124, stdout: '', stderr: 'verification_fixture_timeout', remoteState: 'unconfirmed' });
    }, timeoutMs);
    child.stdout.on('data', chunk => { stdout = (stdout + chunk.toString()).slice(0, OUTPUT_MAX + 1); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(0, OUTPUT_MAX); });
    child.on('error', error => { clearTimeout(timer); resolve({ code: 1, stdout: '', stderr: 'transport_unavailable:' + String(error.code ?? error.message) }); });
    child.on('exit', () => { clearTimeout(timer); resolve(transformWrapperResult(stdout)); });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

export async function findStartedWithoutResult(mailbox) {
  const dir = join(mailbox, 'state', 'records');
  const names = await readdir(dir).catch(error => {
    if (error?.code === 'ENOENT') return [];
    throw new Error('records_unreadable:' + String(error?.code ?? error?.message ?? error));
  });
  const started = new Set(names.filter(name => name.endsWith('.started.json')).map(name => name.slice(0, -'.started.json'.length)));
  const results = new Set(names.filter(name => name.endsWith('.result.json')).map(name => name.slice(0, -'.result.json'.length)));
  return [...started].filter(id => !results.has(id));
}

// Immutable manifest binding: the digest the supervisor binds at run start must
// equal this value or every dispatch is denied.
export function manifestDigest(manifest) {
  return createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
}

async function writeRecord(mailbox, kind, requestId, record) {
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return;
  const dir = join(mailbox, 'state', 'records');
  await mkdir(dir, { recursive: true });
  // Durable records must persist; failures propagate so the caller fails closed.
  await writeFile(join(dir, `${requestId}.${kind}.json`), JSON.stringify({ schemaVersion: 1, kind, requestId, ...record }), { flag: 'wx' });
}

async function writeResult(mailbox, requestId, response) {
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return;
  await writeRecord(mailbox, 'result', requestId, { error: response.error ?? null, code: response.code ?? null, remoteState: response.remoteState ?? null, at: new Date().toISOString() });
  const temporary = join(mailbox, 'responses', requestId + '.tmp');
  await writeFile(temporary, JSON.stringify(response), { flag: 'wx' });
  await rename(temporary, join(mailbox, 'responses', requestId + '.json'));
  await appendLog(mailbox, { at: new Date().toISOString(), requestId, kind: response.error ? 'denied' : 'executed', error: response.error ?? null, code: response.code ?? null });
}

async function appendLog(mailbox, record) {
  const path = join(mailbox, 'state', 'relay.log');
  const existing = await readFile(path, 'utf8').catch(() => '');
  await writeFile(path, (existing + JSON.stringify(record) + '\n').slice(-131072));
}

export async function loadSeen(mailbox) {
  // Ambiguous replay state fails closed: a malformed seen.json is an error, not
  // a silently empty set that would permit replayed mutations.
  const raw = await readFile(join(mailbox, 'state', 'seen.json'), 'utf8').catch(error => {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  });
  if (raw === null) return new Set();
  let list;
  try { list = JSON.parse(raw); } catch { throw new Error('seen_malformed'); }
  if (!Array.isArray(list)) throw new Error('seen_malformed');
  return new Set(list.slice(-SEEN_MAX));
}

async function persistSeen(mailbox, seen) {
  await writeFile(join(mailbox, 'state', 'seen.json'), JSON.stringify([...seen].slice(-SEEN_MAX)));
}

export async function run(manifestPath, mailbox, { runId, environmentId, sessionDeadlineMs = LEASE_TTL_MS, pollMs = 100 } = {}) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.entries)) throw new Error('manifest_invalid');
  if (typeof manifest.runId !== 'string' || manifest.runId !== runId) throw new Error('manifest_run_binding');
  if (typeof manifest.environmentId !== 'string' || manifest.environmentId !== environmentId) throw new Error('manifest_environment_binding');
  assertWrapperBinding(manifest);
  for (const entry of manifest.entries) assertReadyProfileEntry(entry);

  for (const dir of ['requests', 'responses', 'state']) await mkdir(join(mailbox, dir), { recursive: true });
  const lease = await acquireLease(mailbox, { runId, environmentId, ttlMs: sessionDeadlineMs });
  const sessionDeadline = Date.now() + sessionDeadlineMs;
  const seen = await loadSeen(mailbox);
  const unresolved = await findStartedWithoutResult(mailbox);
  if (unresolved.length !== 0) {
    await setLifecycle(mailbox, 'unavailable');
    return { status: 'unavailable', reason: 'started_without_result', requestIds: unresolved };
  }
  const stateNames = await readdir(join(mailbox, 'state'));
  let ambiguous = stateNames.some(name => name !== 'lease.json' && name !== 'records');
  if (!ambiguous && stateNames.includes('records')) {
    ambiguous = (await readdir(join(mailbox, 'state', 'records'))).length !== 0;
  }
  if (!ambiguous) {
    ambiguous = (await readdir(join(mailbox, 'requests'))).length !== 0 || (await readdir(join(mailbox, 'responses'))).length !== 0;
  }
  if (ambiguous) {
    await setLifecycle(mailbox, 'unavailable');
    return { status: 'unavailable', reason: 'ambiguous_prior_state' };
  }
  const handled = new Set();
  await setLifecycle(mailbox, 'starting');
  try {
    await loadLease(mailbox, { runId, environmentId });
    await setLifecycle(mailbox, 'ready');
    while (Date.now() < sessionDeadline) {
      const state = await getLifecycle(mailbox);
      if (state === 'draining' || state === 'stopped') break;
      const names = (await readdir(join(mailbox, 'requests')).catch(error => {
        if (error?.code === 'ENOENT') return [];
        throw new Error('requests_unreadable:' + String(error?.code ?? error?.message ?? error));
      })).filter(name => /^[0-9a-f-]{36}\.json$/i.test(name));
      for (const name of names) {
        if (handled.has(name)) continue;
        if ((await getLifecycle(mailbox)) !== 'ready') break;
        const info = await stat(join(mailbox, 'requests', name)).catch(() => null);
        if (!info || info.size > REQUEST_MAX_BYTES) {
          await writeResult(mailbox, name.replace(/\.json$/, ''), { schemaVersion: 1, requestId: name.replace(/\.json$/, ''), error: 'denied:request_size' });
          handled.add(name);
          continue;
        }
        handled.add(name);
        let outcome;
        try { outcome = await executeRequest(manifest, mailbox, name, seen, { lease, manifestDigest: manifestDigest(manifest) }); }
        catch (error) { await appendLog(mailbox, { at: new Date().toISOString(), requestId: name, kind: 'error', error: String(error.message ?? error) }); outcome = { status: 'unavailable', reason: String(error?.message ?? error) }; }
        await persistSeen(mailbox, seen);
        if (outcome?.status === 'unavailable') {
          // Unconfirmed remote state or durable-record failure: stop admission
          // and finish honestly unavailable rather than continuing.
          await setLifecycle(mailbox, 'draining');
          await setLifecycle(mailbox, 'unavailable');
          return { status: 'unavailable', reason: outcome.reason ?? 'dispatch_unavailable' };
        }
      }
      await new Promise(resolve => setTimeout(resolve, pollMs));
    }
    await setLifecycle(mailbox, 'draining');
    await setLifecycle(mailbox, 'stopped');
    return { status: 'stopped' };
  } catch (error) {
    await setLifecycle(mailbox, 'unavailable');
    return { status: 'unavailable', error: String(error?.message ?? error) };
  }
}

export async function requestDrain(mailbox) {
  const state = await getLifecycle(mailbox);
  if (state !== 'ready' && state !== 'starting') return { status: 'failed', reason: 'not_running' };
  await setLifecycle(mailbox, 'draining');
  const deadline = Date.now() + DRAIN_DEADLINE_MS;
  while (Date.now() < deadline) {
    if ((await getLifecycle(mailbox)) === 'stopped') return { status: 'stopped' };
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return { status: 'unavailable', reason: 'drain_deadline' };
}

if (process.argv[1] && process.argv[1].endsWith('fixture-exec-host.mjs')) {
  const [, , manifestPath, mailbox, runId, environmentId] = process.argv;
  if (!manifestPath || !mailbox || !runId || !environmentId) { console.error('usage: fixture-exec-host.mjs <manifest> <mailbox> <runId> <environmentId>'); process.exit(2); }
  const outcome = await run(manifestPath, mailbox, { runId, environmentId });
  console.log(JSON.stringify(outcome));
  process.exit(outcome.status === 'stopped' ? 0 : 1);
}
