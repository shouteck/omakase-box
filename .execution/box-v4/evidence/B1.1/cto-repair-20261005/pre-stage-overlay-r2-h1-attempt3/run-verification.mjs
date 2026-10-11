// W002/B1.1 r4 finite reviewed supervisor for the seven unchanged acceptance
// commands. Requires the exact original ordered sequence, serialized with <=8m
// deadlines, digest-bound review/environment gates, and honest terminal states.
// A timed-out command is terminated with bounded signals; if its exit cannot be
// confirmed it is recorded unavailable (descendants unaccounted), never a pass.

import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { finished as streamFinished } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvironmentManifest } from './environment-host.mjs';

export const PER_COMMAND_DEADLINE_MS = 8 * 60 * 1000;
export const SIGKILL_GRACE_MS = 5000;
export const EXIT_CONFIRM_MS = 10000;

export const REQUIRED_SEQUENCE = [
  'node scripts/pnpm.mjs test:box-contracts',
  'node scripts/pnpm.mjs test:box-auth',
  'node scripts/pnpm.mjs check',
  'node scripts/pnpm.mjs build',
  'node scripts/pnpm.mjs test:auth',
  'node scripts/pnpm.mjs test:contracts',
  'node scripts/pnpm.mjs test:planner'
];

export function validateSequence(manifest) {
  const sequence = manifest?.commands?.sequence;
  if (!Array.isArray(sequence)) throw new Error('verification_sequence_invalid');
  // Exact ordered seven: no missing, duplicate, reordered or extra commands.
  if (sequence.length !== REQUIRED_SEQUENCE.length) throw new Error('verification_sequence_invalid');
  for (let i = 0; i < REQUIRED_SEQUENCE.length; i += 1) {
    if (sequence[i] !== REQUIRED_SEQUENCE[i]) throw new Error('verification_sequence_mismatch:' + String(sequence[i]));
  }
  return REQUIRED_SEQUENCE.slice();
}

// Gate binds exact bytes/environment, not loose strings: the reviewer PASS must
// carry the manifest digest actually loaded plus matching environment identity.
export function gateStart({ review, environmentReceipt, manifestDigest, environmentId }) {
  if (typeof manifestDigest !== 'string' || !/^[a-f0-9]{64}$/.test(manifestDigest)) return { status: 'unavailable', reason: 'manifest_digest_missing' };
  if (review?.verdict !== 'pass') return { status: 'unavailable', reason: 'review_not_pass' };
  if (review.manifestDigest !== manifestDigest) return { status: 'unavailable', reason: 'review_digest_mismatch' };
  if (review.environmentId !== environmentId) return { status: 'unavailable', reason: 'review_environment_mismatch' };
  if (environmentReceipt?.status !== 'ready') return { status: 'unavailable', reason: 'environment_not_ready' };
  if (environmentReceipt.environmentId !== environmentId) return { status: 'unavailable', reason: 'receipt_environment_mismatch' };
  return { status: 'ok' };
}

export async function recomputeDigestMap(rootDir, paths, readFileImpl = readFile) {
  const map = {};
  for (const rel of paths) {
    if (typeof rel !== 'string' || rel.length === 0 || rel.includes('..') || rel.includes('\\') || rel.startsWith('/') || /^[A-Za-z]:/.test(rel)) throw new Error('digest_path:' + String(rel));
    map[rel] = createHash('sha256').update(await readFileImpl(join(rootDir, rel))).digest('hex');
  }
  return map;
}

// Binds the review record to actual current bytes: every path the independent
// verdict lists is re-read and rehashed at invocation. Identical supplied
// strings alone never release execution.
export async function verifyReviewDigests(review, { rootDir = '.', readFileImpl } = {}) {
  const declared = review?.candidateFiles;
  if (declared === null || typeof declared !== 'object' || Array.isArray(declared) || Object.keys(declared).length === 0) return { status: 'unavailable', reason: 'review_digest_map_missing' };
  let recomputed;
  try { recomputed = await recomputeDigestMap(rootDir, Object.keys(declared), readFileImpl); }
  catch (error) { return { status: 'unavailable', reason: 'digest_recompute_failed:' + String(error?.message ?? error) }; }
  const mismatches = Object.keys(declared).filter(rel => declared[rel] !== recomputed[rel]);
  if (mismatches.length !== 0) return { status: 'unavailable', reason: 'candidate_drift', mismatches };
  return { status: 'ok', compared: Object.keys(declared).length };
}

export async function runSequence(manifest, { stateDir, spawnImpl = spawn, clock = () => Date.now(), deadlineMs = PER_COMMAND_DEADLINE_MS, drainMs = EXIT_CONFIRM_MS } = {}) {
  const sequence = validateSequence(manifest);
  await mkdir(stateDir, { recursive: true });
  const record = {
    schemaVersion: 1,
    kind: 'verification_run',
    environmentId: manifest.environmentId,
    startedAt: new Date().toISOString(),
    commands: [],
    status: 'running'
  };
  const persist = () => writeFile(join(stateDir, 'verification-run.json'), JSON.stringify(record, null, 2));

  for (const command of sequence) {
    const entry = { command, status: 'running', startedAt: new Date().toISOString() };
    record.commands.push(entry);
    await persist();
    const result = await runOne(command, deadlineMs, spawnImpl, clock, join(stateDir, 'command-' + record.commands.length), drainMs);
    const status = result.unconfirmed ? 'unavailable' : (result.code === 0 && !result.timedOut ? 'pass' : 'failed');
    Object.assign(entry, result, { status, endedAt: new Date().toISOString() });
    await persist();
    if (entry.status !== 'pass') {
      record.status = entry.status;
      await persist();
      return record; // strict sequence: a non-pass stops the batch
    }
  }
  record.status = 'pass';
  await persist();
  return record;
}

function runOne(command, deadlineMs, spawnImpl, clock, logPrefix, drainMs) {
  return new Promise(resolve => {
    const started = clock();
    const stdoutPath = logPrefix + '.stdout.log';
    const stderrPath = logPrefix + '.stderr.log';
    const stdoutLog = createWriteStream(stdoutPath, { flags: 'wx' });
    const stderrLog = createWriteStream(stderrPath, { flags: 'wx' });
    // Attach failure handlers before spawning. A failed durable sink never passes.
    let captureError = null;
    const sinks = [stdoutLog, stderrLog].map(sink => streamFinished(sink).catch(error => { captureError = String(error?.message ?? error); }));
    let stdout = ''; let stderr = ''; let timedOut = false; let settling = false;
    let code = null; let exitSignal = null; let exitObserved = false;
    let killTimer; let confirmTimer; let drainTimer; let timer;
    let child;
    const signal = sig => {
      try { if (process.platform !== 'win32' && typeof child?.pid === 'number') process.kill(-child.pid, sig); else child?.kill(sig); }
      catch { try { child?.kill(sig); } catch { /* only the owned child */ } }
    };
    const settle = async (drained, reason = null) => {
      if (settling) return;
      settling = true;
      clearTimeout(timer); clearTimeout(killTimer); clearTimeout(confirmTimer); clearTimeout(drainTimer);
      if (!drained) {
        child?.stdout?.unpipe(stdoutLog); child?.stderr?.unpipe(stderrLog);
        child?.stdout?.destroy(); child?.stderr?.destroy();
      }
      // End the sinks even on unavailable completion, retaining all captured bytes.
      stdoutLog.end(); stderrLog.end();
      let captureDrainTimer;
      const captured = await Promise.race([
        Promise.all(sinks).then(() => true),
        new Promise(resolveCapture => { captureDrainTimer = setTimeout(() => resolveCapture(false), drainMs); })
      ]);
      clearTimeout(captureDrainTimer);
      if (!captured) {
        captureError = 'durable_capture_drain_unconfirmed';
        stdoutLog.destroy(); stderrLog.destroy();
        drained = false;
        reason = 'durable_capture_drain_unconfirmed';
      }
      let descendants = 'none'; let unconfirmed = !drained || !exitObserved || captureError !== null;
      if (process.platform !== 'win32' && typeof child?.pid === 'number') {
        descendants = 'process_group_confirmed_empty';
        try { process.kill(-child.pid, 0); unconfirmed = true; descendants = 'unaccounted'; }
        catch (error) { if (error?.code !== 'ESRCH') { unconfirmed = true; descendants = 'unaccounted'; } }
      }
      resolve({ code, exitSignal, exitObserved, timedOut, unconfirmed, descendants,
        outputDrained: drained, captureError, reason, elapsedMs: clock() - started,
        stdout, stderr, stdoutPath, stderrPath });
    };
    try {
      const [bin, ...args] = command.split(' ');
      child = spawnImpl(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    } catch (error) {
      captureError = 'spawn_unavailable:' + String(error?.message ?? error);
      void settle(false, 'spawn_unavailable');
      return;
    }
    // Pipe preserves full raw byte streams with backpressure; JSON retains a bounded
    // convenience summary only. Sink completion is required before recording PASS.
    for (const [input, sink, label] of [[child.stdout, stdoutLog, 'stdout'], [child.stderr, stderrLog, 'stderr']]) {
      if (!input) { captureError = 'missing_' + label; continue; }
      input.on('data', chunk => {
        if (label === 'stdout') stdout = (stdout + chunk.toString()).slice(-262144);
        else stderr = (stderr + chunk.toString()).slice(-262144);
      });
      input.on('error', error => { captureError = String(error?.message ?? error); void settle(false, 'output_error'); });
      input.pipe(sink);
      sink.on('error', () => { signal('SIGTERM'); void settle(false, 'capture_error'); });
    }
    timer = setTimeout(() => {
      timedOut = true;
      signal('SIGTERM');
      killTimer = setTimeout(() => signal('SIGKILL'), SIGKILL_GRACE_MS);
      confirmTimer = setTimeout(() => { void settle(false, 'termination_unconfirmed'); }, SIGKILL_GRACE_MS + drainMs);
    }, deadlineMs);
    child.on('error', error => { captureError = 'spawn_unavailable:' + String(error?.message ?? error); void settle(false, 'spawn_unavailable'); });
    child.on('exit', (literalCode, literalSignal) => {
      code = literalCode; exitSignal = literalSignal ?? null; exitObserved = true;
      clearTimeout(timer);
      // Parent exit does not establish stream drain or descendant completion.
      drainTimer = setTimeout(() => { signal('SIGTERM'); void settle(false, 'output_drain_unconfirmed'); }, drainMs);
    });
    child.on('close', (literalCode, literalSignal) => {
      if (!exitObserved) { code = literalCode; exitSignal = literalSignal ?? null; }
      void settle(true);
    });
  });
}

if (process.argv[1] && process.argv[1].endsWith('run-verification.mjs')) {
  const [, , manifestPath, stateDir, reviewPath, receiptPath] = process.argv;
  if (!manifestPath || !stateDir || !reviewPath || !receiptPath) {
    console.error('usage: run-verification.mjs <environment-manifest> <stateDir> <review-pass.json> <environment-receipt.json>');
    process.exit(2);
  }
  const manifest = await loadEnvironmentManifest(manifestPath);
  const manifestDigest = createHash('sha256').update(await readFile(manifestPath, 'utf8')).digest('hex');
  const review = JSON.parse(await readFile(reviewPath, 'utf8'));
  const environmentReceipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  const gate = gateStart({ review, environmentReceipt, manifestDigest, environmentId: manifest.environmentId });
  if (gate.status !== 'ok') { console.error(JSON.stringify(gate)); process.exit(3); }
  const digestGate = await verifyReviewDigests(review, { rootDir: fileURLToPath(new URL('../..', import.meta.url)) });
  if (digestGate.status !== 'ok') { console.error(JSON.stringify(digestGate)); process.exit(3); }
  const record = await runSequence(manifest, { stateDir });
  console.log(JSON.stringify({ status: record.status }));
  process.exit(record.status === 'pass' ? 0 : 1);
}
