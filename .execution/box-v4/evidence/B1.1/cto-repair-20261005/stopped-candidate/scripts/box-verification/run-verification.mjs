// W002/B1.1 r4 finite reviewed supervisor for the seven unchanged acceptance
// commands. Requires the exact original ordered sequence, serialized with <=8m
// deadlines, digest-bound review/environment gates, and honest terminal states.
// A timed-out command is terminated with bounded signals; if its exit cannot be
// confirmed it is recorded unavailable (descendants unaccounted), never a pass.

import { spawn } from 'node:child_process';
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

export async function runSequence(manifest, { stateDir, spawnImpl = spawn, clock = () => Date.now(), deadlineMs = PER_COMMAND_DEADLINE_MS } = {}) {
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
    const result = await runOne(command, deadlineMs, spawnImpl, clock);
    const status = result.code === 0 && !result.timedOut ? 'pass' : (result.unconfirmed ? 'unavailable' : 'failed');
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

function runOne(command, deadlineMs, spawnImpl, clock) {
  return new Promise(resolve => {
    const [bin, ...args] = command.split(' ');
    const started = clock();
    const child = spawnImpl(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    const signal = sig => {
      try { if (process.platform !== 'win32' && typeof child.pid === 'number') process.kill(-child.pid, sig); else child.kill(sig); }
      catch { try { child.kill(sig); } catch { /* noop */ } }
    };
    let stdout = ''; let stderr = ''; let timedOut = false; let finished = false;
    let killTimer; let confirmTimer;
    // On timeout: signal the supervised child only (never arbitrary PIDs), then
    // wait a bounded window for exit confirmation. If exit never arrives the
    // outcome is unavailable with descendants unaccounted, not a silent pass or
    // an indefinite wait.
    const finish = value => { if (!finished) { finished = true; resolve(value); } };
    const timer = setTimeout(() => {
      timedOut = true;
      signal('SIGTERM');
      killTimer = setTimeout(() => signal('SIGKILL'), SIGKILL_GRACE_MS);
      killTimer.unref?.();
      confirmTimer = setTimeout(() => finish({ code: null, timedOut: true, unconfirmed: true, descendants: 'unaccounted', elapsedMs: clock() - started, stdout, stderr: stderr + ' termination_unconfirmed' }), SIGKILL_GRACE_MS + EXIT_CONFIRM_MS);
      confirmTimer.unref?.();
    }, deadlineMs);
    child.stdout?.on('data', chunk => { stdout = (stdout + chunk.toString()).slice(-262144); });
    child.stderr?.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-262144); });
    child.on('error', error => { clearTimeout(timer); clearTimeout(killTimer); clearTimeout(confirmTimer); finish({ code: null, timedOut, unconfirmed: true, elapsedMs: clock() - started, stdout: '', stderr: 'spawn_unavailable:' + String(error?.message ?? error) }); });
    child.on('exit', code => {
      clearTimeout(timer); clearTimeout(killTimer); clearTimeout(confirmTimer);
      let unconfirmed = false;
      let descendants = 'none';
      if (process.platform !== 'win32' && typeof child.pid === 'number') {
        descendants = 'process_group_confirmed_empty';
        try { process.kill(-child.pid, 0); unconfirmed = true; descendants = 'unaccounted'; }
        catch (error) { if (error?.code !== 'ESRCH') { unconfirmed = true; descendants = 'unaccounted'; } }
      }
      finish({ code: code ?? 1, timedOut, unconfirmed, descendants, elapsedMs: clock() - started, stdout, stderr });
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
