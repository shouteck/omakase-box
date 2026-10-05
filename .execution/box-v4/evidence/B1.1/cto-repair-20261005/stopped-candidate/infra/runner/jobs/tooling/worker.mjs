/**
 * Candidate-side worker shim. This is the ONLY code that runs inside the
 * constrained container alongside candidate bytes. It reads bounded call
 * frames on stdin, invokes the requested export of the staged candidate
 * module, and writes raw output frames on stdout. It carries no verdict
 * authority: whatever it reports is data for the trusted driver, and a
 * crash, hang, flood or forged message only becomes a containment
 * observation for the supervisor.
 */
import { createFrameReader, encodeRecord, validateWorkerResponse, MAX_CHECK_RESPONSE_BYTES } from '/opt/private-task/harness/records.mjs';

const CANDIDATE_ENTRY = process.env.CANDIDATE_ENTRY ?? '/work/candidate/index.mjs';
const reader = createFrameReader(65536);
let module_;

async function loadModule() {
  if (module_ === undefined) {
    try { module_ = await import(`file://${CANDIDATE_ENTRY}`); }
    catch { module_ = null; }
  }
  return module_;
}

function respond(frame) {
  const record = { type: frame.type, checkId: frame.checkId, ...(frame.type === 'result' ? { value: frame.value } : { error: frame.error }) };
  validateWorkerResponse(record);
  const bytes = encodeRecord(record);
  if (bytes.length > MAX_CHECK_RESPONSE_BYTES) {
    const fallback = encodeRecord({ type: 'error', checkId: frame.checkId, error: 'response_too_large' });
    process.stdout.write(fallback);
    return;
  }
  process.stdout.write(bytes);
}

function errorFor(checkId, message) {
  respond({ type: 'error', checkId, error: message.slice(0, 256) });
}

async function handle(request) {
  const checkId = typeof request?.checkId === 'string' ? request.checkId.slice(0, 80) : 'unknown';
  if (request?.type !== 'call' || typeof request.exportName !== 'string' || !Array.isArray(request.arguments)) {
    errorFor(checkId, 'malformed_request');
    return;
  }
  const loaded = await loadModule();
  if (loaded === null) { errorFor(checkId, 'module_unavailable'); return; }
  const fn = loaded[request.exportName];
  if (typeof fn !== 'function') { errorFor(checkId, 'export_missing'); return; }
  try {
    const value = await fn(...request.arguments);
    respond({ type: 'result', checkId, value: value === undefined ? null : value });
  } catch (error) {
    errorFor(checkId, `candidate_threw:${error instanceof Error ? error.name : 'unknown'}`);
  }
}

let pending = Promise.resolve();
process.stdin.on('data', chunk => {
  let frames;
  try { frames = reader.push(chunk); }
  catch { process.exit(24); }
  for (const frame of frames) {
    pending = pending.then(() => handle(frame)).catch(() => errorFor(typeof frame?.checkId === 'string' ? frame.checkId.slice(0, 80) : 'unknown', 'worker_fault'));
  }
});
process.stdin.on('end', () => { pending.finally(() => process.exit(0)); });
process.on('uncaughtException', () => process.exit(23));
process.on('unhandledRejection', () => process.exit(23));
