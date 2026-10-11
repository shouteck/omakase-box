/**
 * Guest-side bounded record framing for the sole trusted control channel
 * (/dev/virtio-ports/org.private-task.control). The operator broker owns the
 * host end of the channel; the candidate container never sees a device node.
 * Every record is a 4-byte little-endian length prefix followed by one UTF-8
 * JSON object. Anything outside the fixed shapes below is rejected, not
 * parsed leniently.
 */
export const PROTOCOL_VERSION = 1;
export const MAX_JOB_RECORD_BYTES = 262144;
export const MAX_ARTIFACT_BYTES = 16777216;
export const MAX_RESULT_RECORD_BYTES = 1048576;
export const MAX_WORKER_FRAME_BYTES = 262144;
export const MAX_CHECK_REQUEST_BYTES = 65536;
export const MAX_CHECK_RESPONSE_BYTES = 262144;

const HEX_64 = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const CHECK_ID = /^[a-zA-Z0-9_.-]{1,80}$/;

export class RecordRejected extends Error {
  constructor(code) {
    super(code);
    this.name = 'RecordRejected';
    this.code = code;
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function ownKeys(value, expected) {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function u32(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff;
}

/** Exact-length-observed encode: record bytes the broker can bound. */
export function encodeRecord(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const frame = Buffer.alloc(4 + body.length);
  frame.writeUInt32LE(body.length, 0);
  body.copy(frame, 4);
  return frame;
}

/**
 * Incremental frame reader over an arbitrary byte source. Pull only framed
 * records whose declared length stays inside `maxBytes`; a single oversized
 * declaration is rejected before that many bytes are ever buffered.
 */
export function createFrameReader(maxBytes) {
  let buffer = Buffer.alloc(0);
  return {
    push(chunk) {
      if (!(chunk instanceof Uint8Array) || chunk.length === 0) throw new RecordRejected('invalid_chunk');
      buffer = Buffer.concat([buffer, chunk]);
      const records = [];
      while (buffer.length >= 4) {
        const declared = buffer.readUInt32LE(0);
        if (declared === 0 || declared > maxBytes) throw new RecordRejected('frame_too_large');
        if (buffer.length < 4 + declared) break;
        const body = buffer.subarray(4, 4 + declared);
        buffer = buffer.subarray(4 + declared);
        let parsed;
        try { parsed = JSON.parse(body.toString('utf8')); } catch { throw new RecordRejected('invalid_json'); }
        if (!isObject(parsed)) throw new RecordRejected('invalid_record');
        records.push(parsed);
      }
      if (buffer.length > 4 + maxBytes) throw new RecordRejected('frame_too_large');
      return records;
    },
    get pending() { return buffer.length; },
  };
}

/** The broker writes exactly this before any artifact bytes. */
export function validateJobEnvelope(input) {
  if (!isObject(input)) throw new RecordRejected('invalid_envelope');
  const expected = ['artifactBytes', 'artifactHash', 'deadline', 'job', 'leaseId'];
  if (!ownKeys(input, expected)) throw new RecordRejected('invalid_envelope');
  const { job, leaseId, artifactHash, artifactBytes, deadline } = input;
  if (!isObject(job)) throw new RecordRejected('invalid_envelope');
  const jobKeys = ['artifactHash', 'attemptId', 'deadline', 'harnessDigest', 'harnessId', 'imageDigest', 'jobId', 'jobKind', 'limits', 'packageHash', 'profile', 'protocolVersion', 'requiredCheckIds', 'submissionHash'];
  if (!ownKeys(job, jobKeys)) throw new RecordRejected('invalid_envelope');
  if (job.protocolVersion !== PROTOCOL_VERSION) throw new RecordRejected('unsupported_protocol');
  for (const key of ['jobId', 'attemptId']) if (!UUID.test(job[key])) throw new RecordRejected('invalid_envelope');
  for (const key of ['packageHash', 'submissionHash', 'artifactHash', 'harnessDigest']) if (!HEX_64.test(job[key])) throw new RecordRejected('invalid_envelope');
  if (!/^sha256:[a-f0-9]{64}$/.test(job.imageDigest)) throw new RecordRejected('invalid_envelope');
  if (!['public', 'private'].includes(job.jobKind)) throw new RecordRejected('invalid_envelope');
  if (job.profile !== 'dedicated-linux-kvm-fresh-vm') throw new RecordRejected('invalid_envelope');
  if (!Array.isArray(job.requiredCheckIds) || job.requiredCheckIds.length < 1 || job.requiredCheckIds.length > 1024 || new Set(job.requiredCheckIds).size !== job.requiredCheckIds.length || job.requiredCheckIds.some(id => !CHECK_ID.test(id))) throw new RecordRejected('invalid_envelope');
  const limits = job.limits;
  if (!isObject(limits) || !ownKeys(limits, ['cpus', 'logBytes', 'memoryMiB', 'pids', 'seconds', 'writableMiB'])) throw new RecordRejected('invalid_envelope');
  if (limits.cpus !== 2 || limits.memoryMiB !== 512 || limits.pids !== 128 || limits.seconds !== 120 || limits.logBytes !== 1048576 || limits.writableMiB !== 256) throw new RecordRejected('limit_mismatch');
  if (!UUID.test(leaseId)) throw new RecordRejected('invalid_envelope');
  if (!HEX_64.test(artifactHash) || artifactHash !== job.artifactHash) throw new RecordRejected('binding_mismatch');
  if (!u32(artifactBytes) || artifactBytes === 0 || artifactBytes > MAX_ARTIFACT_BYTES) throw new RecordRejected('invalid_envelope');
  if (!Number.isSafeInteger(deadline) || deadline <= 0 || deadline !== job.deadline) throw new RecordRejected('binding_mismatch');
  return Object.freeze({ job: Object.freeze(job), leaseId, artifactHash, artifactBytes, deadline });
}

/**
 * The sealed check contract travels inside the hash-bound artifact bundle
 * (evaluator-authored, supervisor-side only — never staged into the
 * candidate tree). Validated against the job's own requiredCheckIds.
 */
export function validateCheckContract(input, job) {
  if (!isObject(input) || !Array.isArray(input.checks)) throw new RecordRejected('invalid_check_contract');
  for (const check of input.checks) {
    if (!isObject(check) || !ownKeys(check, ['arguments', 'checkId', 'expected', 'exportName'])) throw new RecordRejected('invalid_check_contract');
    if (!CHECK_ID.test(check.checkId) || !job.requiredCheckIds.includes(check.checkId)) throw new RecordRejected('invalid_check_contract');
    if (typeof check.exportName !== 'string' || !/^[a-zA-Z_$][a-zA-Z0-9_$]{0,127}$/.test(check.exportName)) throw new RecordRejected('invalid_check_contract');
    if (!Array.isArray(check.arguments) || check.arguments.length > 16) throw new RecordRejected('invalid_check_contract');
  }
  const ids = new Set(input.checks.map(check => check.checkId));
  if (ids.size !== input.checks.length || job.requiredCheckIds.some(id => !ids.has(id))) throw new RecordRejected('invalid_check_contract');
  return Object.freeze(input);
}

/** Worker channel frame (driver → worker). Output only; verdicts never travel. */
export function encodeWorkerRequest(request) {
  if (!isObject(request) || !ownKeys(request, ['arguments', 'checkId', 'exportName', 'type']) || request.type !== 'call' || !CHECK_ID.test(request.checkId) || typeof request.exportName !== 'string' || !Array.isArray(request.arguments)) throw new RecordRejected('invalid_request');
  const frame = encodeRecord(request);
  if (frame.length > MAX_CHECK_REQUEST_BYTES) throw new RecordRejected('frame_too_large');
  return frame;
}

/** Worker channel frame (worker → driver). Raw output data only. */
export function validateWorkerResponse(input) {
  if (!isObject(input)) throw new RecordRejected('invalid_response');
  if (input.type === 'result') {
    if (!ownKeys(input, ['checkId', 'type', 'value'])) throw new RecordRejected('invalid_response');
  } else if (input.type === 'error') {
    if (!ownKeys(input, ['checkId', 'error', 'type']) || typeof input.error !== 'string' || input.error.length > 256) throw new RecordRejected('invalid_response');
  } else {
    throw new RecordRejected('invalid_response');
  }
  if (!CHECK_ID.test(input.checkId)) throw new RecordRejected('invalid_response');
  return input;
}

/**
 * The only record the supervisor ever writes back: the signed trusted result.
 * Nothing a candidate emitted can appear here except bounded observation
 * counts; every verdict was computed by the trusted driver.
 */
export function validateResultRecord(input) {
  if (!isObject(input)) throw new RecordRejected('invalid_result_record');
  const keys = Object.keys(input).sort();
  const valid = (keys.length === 2 && keys[0] === 'result' && keys[1] === 'signature')
    || (keys.length === 3 && keys[0] === 'observations' && keys[1] === 'result' && keys[2] === 'signature');
  if (!valid) throw new RecordRejected('invalid_result_record');
  if (!isObject(input.result) || typeof input.signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(input.signature)) throw new RecordRejected('invalid_result_record');
  return input;
}
