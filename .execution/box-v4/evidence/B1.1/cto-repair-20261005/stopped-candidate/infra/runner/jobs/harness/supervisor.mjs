#!/usr/bin/env node
/**
 * Trusted in-guest supervisor. Runs once per fresh dedicated VM, outside the
 * candidate container, as the only writer to the virtio-serial control
 * channel and the only reader of the result signing key.
 *
 * Flow: read bounded job envelope + artifact records from the channel →
 * verify every binding → stage candidate bytes (build.mjs, no script
 * execution) → create the cgroup v2 budget → spawn the constrained worker
 * via the fixed sandbox launch spec → exchange check frames with the worker
 * → evaluate every check against the sealed contract → attach authoritative
 * observations → sign the result → write one result record back.
 *
 * A crash, timeout, flood or binding failure on any step yields either a
 * signed 'unverified'/'failed' result or no result — never a pass.
 */
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, openSync, readSync, mkdirSync, writeSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import {
  PROTOCOL_VERSION, MAX_JOB_RECORD_BYTES, MAX_ARTIFACT_BYTES, MAX_RESULT_RECORD_BYTES,
  createFrameReader, encodeRecord, validateJobEnvelope, validateCheckContract, encodeWorkerRequest, validateWorkerResponse,
} from './records.mjs';
import { buildSandboxSpec, CGROUP_ROOT, RESULT_KEY_PATH } from './sandbox-spec.mjs';
import { planCheckRequest, evaluateCheck, summarizeJob } from './driver-pure-module.mjs';
import { emptyContainment, processObservation, CHECK_OUTCOME } from './observations.mjs';
import { validateComposedContract } from '../../composition/driver-composed.mjs';
import { runComposedJob, loopbackHttpClient } from '../../composition/composed-supervisor.mjs';

const COMPOSED_HARNESSES = new Set(['frontend/v1', 'backend-api/v1', 'application-policy/v1', 'composed/v1']);

const CONTROL_PORT = '/dev/virtio-ports/org.private-task.control';
const STAGING_DIR = '/var/private-task/staging';
const CHANNEL_READ_SLICE = 65536;

function fatal(code, details = {}) {
  const result = { protocolVersion: 1, status: 'unverified', code, ...details };
  try { return encodeRecord(result); } catch { return encodeRecord({ protocolVersion: 1, status: 'unverified', code: 'internal' }); }
}

const canonical = value => (value === null || typeof value !== 'object') ? JSON.stringify(value) : Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';

function signResult(publicResult, observations) {
  const key = readFileSync(RESULT_KEY_PATH);
  const signature = sign(null, Buffer.from(canonical(publicResult)), createPrivateKey(key)).toString('base64url');
  const record = encodeRecord({ result: publicResult, signature, ...(observations === undefined ? {} : { observations }) });
  if (record.length > MAX_RESULT_RECORD_BYTES) return fatal('result_too_large');
  return record;
}

/**
 * A fault attributable to the submitted artifact or its contract produces a
 * SIGNED unverified result — the controller can verify it and record an
 * honest 'unverified' rather than a transport failure. Infrastructure
 * faults (missing cgroup, channel, key) stay unsigned → broker quarantine.
 */
function signedUnverified(job, leaseId, code, requiredChecks) {
  const publicResult = {
    protocolVersion: PROTOCOL_VERSION,
    jobId: job.jobId,
    leaseId,
    jobKind: job.jobKind,
    profile: job.profile,
    packageHash: job.packageHash,
    submissionHash: job.submissionHash,
    artifactHash: job.artifactHash,
    imageDigest: job.imageDigest,
    harnessId: job.harnessId,
    harnessDigest: job.harnessDigest,
    outcome: 'unverified',
    checks: requiredChecks.map(checkId => ({ checkId, outcome: 'unverified' })),
    expiresAt: Math.min(Date.now() + 60000, job.deadline),
    logDigest: createHash('sha256').update(code).digest('hex'),
  };
  return signResult(publicResult, { supervisor: { kind: 'supervisor', reason: code } });
}

/** Exact-length channel reads — no reader buffering, so artifact bytes can never be swallowed by frame logic. */
async function readExact(fd, bytes, deadline) {
  const chunks = [];
  let total = 0;
  const scratch = Buffer.alloc(Math.min(CHANNEL_READ_SLICE, Math.max(1, bytes)));
  while (total < bytes) {
    if (Date.now() > deadline) throw new Error('channel_deadline');
    const read = readSync(fd, scratch, 0, Math.min(scratch.length, bytes - total), null);
    if (read === 0) { await new Promise(r => setTimeout(r, 25)); continue; }
    chunks.push(Buffer.from(scratch.subarray(0, read)));
    total += read;
  }
  return Buffer.concat(chunks);
}

async function readArtifact(fd, expectedBytes, expectedHash, deadline) {
  if (expectedBytes > MAX_ARTIFACT_BYTES) throw new Error('artifact_too_large');
  const bytes = await readExact(fd, expectedBytes, deadline);
  if (createHash('sha256').update(bytes).digest('hex') !== expectedHash) throw new Error('artifact_mismatch');
  return bytes;
}

function cgroupWrite(name, file, value) {
  writeFileSync(`${CGROUP_ROOT}/${name}/${file}`, value);
}

function cgroupRead(name, file) {
  try { return readFileSync(`${CGROUP_ROOT}/${name}/${file}`, 'utf8').trim(); } catch { return null; }
}

async function main() {
  const control = openSync(CONTROL_PORT, 'r+');
  const deadline = Date.now() + 120000;

  const frameLength = (await readExact(control, 4, deadline)).readUInt32LE(0);
  if (frameLength === 0 || frameLength > MAX_JOB_RECORD_BYTES) throw new Error('envelope_too_large');
  const envelopeRaw = JSON.parse((await readExact(control, frameLength, deadline)).toString('utf8'));
  const envelope = validateJobEnvelope(envelopeRaw);
  const { job, leaseId, artifactHash, artifactBytes } = envelope;

  const artifact = await readArtifact(control, artifactBytes, artifactHash, deadline);

  // Stage verified bytes — deterministic, no candidate script executes.
  // The candidate tree lands under the supervisor-side staging dir; the
  // container bind-mounts it read-only at /work/candidate.
  const candidateStage = `${STAGING_DIR}/candidate`;
  await mkdir(candidateStage, { recursive: true });
  await writeFile(`${STAGING_DIR}/artifact.bin`, artifact, { mode: 0o400 });
  const build = spawn('/usr/local/bin/node', ['/opt/private-task/tooling/build.mjs', `${STAGING_DIR}/artifact.bin`, artifactHash, candidateStage, STAGING_DIR], { stdio: ['ignore', 'pipe', 'pipe'] });
  let buildOut = '';
  build.stdout.on('data', chunk => { if (buildOut.length < 65536) buildOut += chunk; });
  const buildCode = await new Promise(resolve => build.on('close', resolve));
  if (buildCode !== 0) {
    writeSync2(control, signedUnverified(job, leaseId, 'stage_rejected', job.requiredCheckIds));
    return;
  }

  // The sealed check contract arrives inside the artifact bundle and is
  // staged supervisor-side at /staging/contract.json — never reachable by
  // candidate code (root-only, outside /work/candidate).
  let checkContract;
  try {
    checkContract = validateCheckContract(JSON.parse(readFileSync(`${STAGING_DIR}/contract.json`, 'utf8')), job);
  } catch {
    writeSync2(control, signedUnverified(job, leaseId, 'invalid_check_contract', job.requiredCheckIds));
    return;
  }
  // Composed harnesses run the fixed service stack and evaluator-declared
  // checks through the composed orchestrator. Until the guest provisions the
  // service launcher/browser adapter the transports are absent and every
  // check is honestly unverified — never a pass.
  if (COMPOSED_HARNESSES.has(job.harnessId)) {
    let composedContract;
    try {
      composedContract = validateComposedContract(JSON.parse(readFileSync(`${STAGING_DIR}/contract.json`, 'utf8')), job);
    } catch {
      writeSync2(control, signedUnverified(job, leaseId, 'invalid_check_contract', job.requiredCheckIds));
      return;
    }
    let policySource = null;
    try { policySource = readFileSync(`${candidateStage}/config/response-security.json`, 'utf8'); } catch { /* no policy file */ }
    const evaluated = await runComposedJob(job, composedContract, { httpClient: loopbackHttpClient, policySource });
    const checks = evaluated.checks;
    const publicResult = {
      protocolVersion: PROTOCOL_VERSION,
      jobId: job.jobId,
      leaseId,
      jobKind: job.jobKind,
      profile: job.profile,
      packageHash: job.packageHash,
      submissionHash: job.submissionHash,
      artifactHash: job.artifactHash,
      imageDigest: job.imageDigest,
      harnessId: job.harnessId,
      harnessDigest: job.harnessDigest,
      outcome: evaluated.outcome,
      checks,
      expiresAt: Math.min(Date.now() + 60000, job.deadline),
      logDigest: createHash('sha256').update(canonical(checks)).digest('hex'),
    };
    writeSync2(control, signResult(publicResult, { composed: { kind: 'composed', harness: job.harnessId, servicesReady: false } }));
    return;
  }
  // Any other harness claim produces a signed unverified record — never a pass.
  if (job.harnessId !== 'pure-module/v1') {
    writeSync2(control, signedUnverified(job, leaseId, 'unsupported_harness', job.requiredCheckIds));
    return;
  }

  const spec = buildSandboxSpec(job);
  const containment = emptyContainment();

  // cgroup v2 budget created by the supervisor before the candidate exists.
  const cg = spec.cgroup;
  try {
    mkdirSync(`${CGROUP_ROOT}/${cg.name}`, { recursive: true });
    cgroupWrite(cg.name, 'cpu.max', cg['cpu.max']);
    cgroupWrite(cg.name, 'memory.max', cg['memory.max']);
    cgroupWrite(cg.name, 'memory.swap.max', cg['memory.swap.max']);
    cgroupWrite(cg.name, 'pids.max', cg['pids.max']);
  } catch {
    writeSync2(control, fatal('budget_unavailable'));
    return;
  }

  const [executable, ...args] = spec.argv;
  const child = spawn(executable, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {},
  });
  // Budget attachment failure means the declared limits are NOT in force —
  // kill and report an unsigned infrastructure fault (broker quarantines).
  try { cgroupWrite(cg.name, 'cgroup.procs', String(child.pid)); }
  catch {
    try { child.kill('SIGKILL'); } catch { /* already gone */ }
    writeSync2(control, fatal('budget_attach_failed'));
    return;
  }

  const observation = processObservation('candidate');
  const start = Date.now();
  const workerReader = createFrameReader(262144);
  const responses = [];
  const logDigestState = createHash('sha256');
  let channelRead = 0;
  let flooded = false;
  let timedOut = false;
  let channelCorrupt = false;

  child.stdout.on('data', chunk => {
    channelRead += chunk.length;
    logDigestState.update(chunk);
    if (channelRead > job.limits.logBytes) {
      flooded = true;
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      return;
    }
    try { for (const frame of workerReader.push(chunk)) responses.push(validateWorkerResponse(frame)); }
    catch { channelCorrupt = true; try { child.kill('SIGKILL'); } catch { /* already gone */ } }
  });
  // stderr is candidate-controlled too: counted toward the same flood bound
  // and hashed into the log digest, never parsed.
  child.stderr.on('data', chunk => {
    channelRead += chunk.length;
    logDigestState.update(chunk);
    if (channelRead > job.limits.logBytes) {
      flooded = true;
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
    }
  });

  const runDeadline = Math.min(deadline, job.deadline);
  const remaining = Math.max(1000, runDeadline - Date.now());
  const killer = setTimeout(() => { timedOut = true; try { child.kill('SIGKILL'); } catch { /* gone */ } }, remaining);

  // Drive each required check sequentially on the worker channel.
  const evaluated = [];
  for (const check of checkContract.checks) {
    if (timedOut || flooded || channelCorrupt) {
      evaluated.push({ checkId: check.checkId, outcome: CHECK_OUTCOME.unverified, observation: { kind: 'check', checkId: check.checkId, reason: 'containment_trip' } });
      continue;
    }
    const before = responses.length;
    try { child.stdin.write(encodeWorkerRequest(planCheckRequest(check))); }
    catch { evaluated.push({ checkId: check.checkId, outcome: CHECK_OUTCOME.unverified, observation: { kind: 'check', checkId: check.checkId, reason: 'channel_write' } }); continue; }
    const perCheck = Date.now() + Math.min(30000, Math.max(1000, runDeadline - Date.now()));
    while (responses.length === before && Date.now() < perCheck && !timedOut && !flooded && child.exitCode === null) {
      await new Promise(r => setTimeout(r, 20));
    }
    const response = responses.length > before ? responses[responses.length - 1] : null;
    evaluated.push(evaluateCheck(check, response, { exitCode: child.exitCode, signal: child.signalCode, wallMs: Date.now() - start, timedOut, flooded, killed: child.killed }));
  }
  try { child.stdin.end(); } catch { /* gone */ }

  const exit = await new Promise(resolve => {
    if (child.exitCode !== null) return resolve({ code: child.exitCode, signal: child.signalCode });
    child.on('close', (code, signal) => resolve({ code, signal }));
    setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } resolve({ code: null, signal: 'SIGKILL' }); }, 3000);
  });
  clearTimeout(killer);

  observation.exitCode = exit.code;
  observation.signal = exit.signal;
  observation.wallMs = Date.now() - start;
  observation.timedOut = timedOut;
  observation.flooded = flooded;
  observation.killed = child.killed;

  containment.timedOut = timedOut;
  containment.outputFlooded = flooded;
  containment.channelCorrupt = channelCorrupt;
  containment.channelBytesRead = channelRead;
  const peak = cgroupRead(cg.name, 'memory.peak');
  if (peak !== null) containment.peakMemoryBytes = Number(peak) || 0;
  const events = cgroupRead(cg.name, 'memory.events');
  if (events) {
    const oom = events.split('\n').find(line => line.startsWith('oom_kill'));
    if (oom) { containment.oomKillCount = Number(oom.split(/\s+/)[1]) || 0; containment.oomKilled = containment.oomKillCount > 0; }
  }
  const pidsPeak = cgroupRead(cg.name, 'pids.peak');
  if (pidsPeak !== null) { containment.pidsPeak = Number(pidsPeak) || 0; containment.pidTripped = containment.pidsPeak >= job.limits.pids; }
  // Writable enforcement is the bounded tmpfs inside the candidate's private
  // mount namespace — the kernel rejects writes past the bound (ENOSPC) but
  // usage is not observable across the namespace boundary. Report the
  // enforced bound honestly; do not fabricate a measurement.
  containment.writableEnforcedBytes = spec.writableBudgetBytes;
  containment.writableBytesUsed = null;
  containment.writableExceeded = false;

  const outcome = summarizeJob(evaluated, containment);
  const result = {
    protocolVersion: PROTOCOL_VERSION,
    jobId: job.jobId,
    leaseId,
    jobKind: job.jobKind,
    profile: job.profile,
    packageHash: job.packageHash,
    submissionHash: job.submissionHash,
    artifactHash: job.artifactHash,
    imageDigest: job.imageDigest,
    harnessId: job.harnessId,
    harnessDigest: job.harnessDigest,
    outcome,
    checks: evaluated.map(entry => ({ checkId: entry.checkId, outcome: entry.outcome })),
    expiresAt: Math.min(Date.now() + 60000, job.deadline),
    logDigest: logDigestState.digest('hex'),
    observations: {
      process: observation,
      containment,
      stageReceiptHash: createHash('sha256').update(buildOut).digest('hex'),
    },
  };

  // The signed result carries exactly the protocol's strict ResultSchema
  // fields — nothing else. Supervisor observations travel as unsigned
  // auxiliary metadata on the record, never inside the signed payload.
  const { observations, ...publicResult } = result;
  writeSync2(control, signResult(publicResult, observations));
}

function writeSync2(fd, bytes) {
  let offset = 0;
  while (offset < bytes.length) offset += writeSync(fd, bytes.subarray(offset, Math.min(offset + 65536, bytes.length)));
}

main().catch(error => {
  try {
    const fd = openSync(CONTROL_PORT, 'r+');
    writeSync2(fd, fatal(error instanceof Error && 'code' in error ? String(error.code) : 'supervisor_fault'));
  } catch { /* channel itself failed; nothing signed, nothing claimed */ }
});
