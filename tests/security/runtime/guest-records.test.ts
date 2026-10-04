import { describe, expect, it } from 'vitest';
import {
  createFrameReader, encodeRecord, validateJobEnvelope, validateCheckContract,
  encodeWorkerRequest, validateWorkerResponse, validateResultRecord, RecordRejected,
  MAX_JOB_RECORD_BYTES, MAX_ARTIFACT_BYTES,
// @ts-expect-error guest-side ESM module without type declarations
} from '../../../infra/runner/jobs/harness/records.mjs';

const HASH = 'a'.repeat(64);
const UUIDS = { jobId: '11111111-1111-4111-8111-111111111111', attemptId: '22222222-2222-4222-8222-222222222222', leaseId: '33333333-3333-4333-8333-333333333333' };
const LIMITS = { cpus: 2, memoryMiB: 512, pids: 128, seconds: 120, logBytes: 1048576, writableMiB: 256 };
function job(over: Record<string, unknown> = {}) {
  return {
    protocolVersion: 1, jobId: UUIDS.jobId, attemptId: UUIDS.attemptId, jobKind: 'public', profile: 'dedicated-linux-kvm-fresh-vm',
    packageHash: HASH, submissionHash: 'b'.repeat(64), artifactHash: 'c'.repeat(64),
    imageDigest: 'sha256:' + 'd'.repeat(64), harnessId: 'pure-module/v1', harnessDigest: 'e'.repeat(64),
    requiredCheckIds: ['rank.order', 'rank.immutability'], deadline: 1800000120000, limits: LIMITS, ...over,
  };
}
function envelope(over: Record<string, unknown> = {}) {
  return { artifactBytes: 128, artifactHash: 'c'.repeat(64), deadline: 1800000120000, job: job(), leaseId: UUIDS.leaseId, ...over };
}
function rejected(fn: () => unknown, code?: string) {
  let caught: unknown;
  try { fn(); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(RecordRejected);
  if (code !== undefined) expect((caught as RecordRejected).code).toBe(code);
}

describe('guest job envelope validation', () => {
  it('accepts the exact canonical envelope and freezes it', () => {
    const parsed = validateJobEnvelope(envelope());
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.job)).toBe(true);
    expect(parsed.artifactHash).toBe('c'.repeat(64));
  });
  it.each(['artifactBytes', 'artifactHash', 'deadline', 'job', 'leaseId'])('rejects a missing %s', key => {
    const value = envelope();
    delete (value as Record<string, unknown>)[key];
    rejected(() => validateJobEnvelope(value), 'invalid_envelope');
  });
  it.each(['checkContract', 'command', 'supervisorKey', 'signature'])('rejects extra authority field %s', field => {
    rejected(() => validateJobEnvelope(envelope({ [field]: 'x' })), 'invalid_envelope');
  });
  it('rejects artifact hash, lease, deadline and job-id binding drift', () => {
    rejected(() => validateJobEnvelope(envelope({ artifactHash: 'f'.repeat(64) })), 'binding_mismatch');
    rejected(() => validateJobEnvelope(envelope({ leaseId: 'not-a-uuid' })), 'invalid_envelope');
    rejected(() => validateJobEnvelope(envelope({ deadline: 1800000120001 })), 'binding_mismatch');
    rejected(() => validateJobEnvelope(envelope({ job: job({ jobId: 'not-a-uuid' }) })));
  });
  it('rejects every limit deviation and profile/kind drift', () => {
    for (const [key, value] of Object.entries({ cpus: 3, memoryMiB: 513, pids: 129, seconds: 121, logBytes: 1048577, writableMiB: 257 })) {
      rejected(() => validateJobEnvelope(envelope({ job: job({ limits: { ...LIMITS, [key]: value } }) })), 'limit_mismatch');
    }
    rejected(() => validateJobEnvelope(envelope({ job: job({ limits: { ...LIMITS, extra: 1 } }) })));
    rejected(() => validateJobEnvelope(envelope({ job: job({ profile: 'host-docker' }) })));
    rejected(() => validateJobEnvelope(envelope({ job: job({ jobKind: 'internal' }) })));
    rejected(() => validateJobEnvelope(envelope({ job: job({ protocolVersion: 2 }) })), 'unsupported_protocol');
  });
  it('rejects malformed check ids, duplicates and oversized artifact declarations', () => {
    rejected(() => validateJobEnvelope(envelope({ job: job({ requiredCheckIds: ['a', 'a'] }) })));
    rejected(() => validateJobEnvelope(envelope({ job: job({ requiredCheckIds: [] }) })));
    rejected(() => validateJobEnvelope(envelope({ job: job({ requiredCheckIds: ['bad id!'] }) })));
    rejected(() => validateJobEnvelope(envelope({ artifactBytes: MAX_ARTIFACT_BYTES + 1 })));
    rejected(() => validateJobEnvelope(envelope({ artifactBytes: 0 })));
  });
});

describe('sealed check contract validation', () => {
  const contract = (over: Record<string, unknown> = {}) => ({
    checks: [
      { checkId: 'rank.order', exportName: 'rank', arguments: [[3, 1, 2]], expected: [1, 2, 3] },
      { checkId: 'rank.immutability', exportName: 'rank', arguments: [[]], expected: [] },
    ],
    ...over,
  });
  it('accepts a contract exactly covering requiredCheckIds', () => {
    expect(Object.isFrozen(validateCheckContract(contract(), job()))).toBe(true);
  });
  it('rejects missing, extra, duplicate or mistyped checks', () => {
    rejected(() => validateCheckContract({ checks: [{ checkId: 'rank.order', exportName: 'rank', arguments: [], expected: 0 }] }, job()), 'invalid_check_contract');
    rejected(() => validateCheckContract(contract({ checks: [...contract().checks, { checkId: 'extra', exportName: 'rank', arguments: [], expected: 0 }] }), job()), 'invalid_check_contract');
    rejected(() => validateCheckContract(contract({ checks: [contract().checks[0], contract().checks[0]] }), job()), 'invalid_check_contract');
    rejected(() => validateCheckContract(contract({ checks: [{ ...contract().checks[0], exportName: 'not an ident!' }, contract().checks[1]] }), job()), 'invalid_check_contract');
    rejected(() => validateCheckContract(contract({ checks: [{ ...contract().checks[0], arguments: new Array(17).fill(0) }, contract().checks[1]] }), job()), 'invalid_check_contract');
  });
  it('rejects verdict authority fields on checks', () => {
    rejected(() => validateCheckContract({ checks: [{ ...contract().checks[0], outcome: 'passed' }, contract().checks[1]] }, job()), 'invalid_check_contract');
    rejected(() => validateCheckContract({ checks: [{ ...contract().checks[0], verdict: 'passed' }, contract().checks[1]] }, job()), 'invalid_check_contract');
  });
});

describe('frame reader bounds', () => {
  it('reassembles records across chunk boundaries', () => {
    const reader = createFrameReader(1024);
    const frame = encodeRecord({ a: 1 });
    const parts = [frame.subarray(0, 3), frame.subarray(3, 7), frame.subarray(7)];
    expect(reader.push(parts[0]!)).toEqual([]);
    expect(reader.push(parts[1]!)).toEqual([]);
    expect(reader.push(parts[2]!)).toEqual([{ a: 1 }]);
  });
  it('rejects an oversized declaration before buffering that much', () => {
    const reader = createFrameReader(64);
    const head = Buffer.alloc(4);
    head.writeUInt32LE(1024, 0);
    expect(() => reader.push(head)).toThrow(RecordRejected);
    try { reader.push(head); } catch (error) { expect((error as RecordRejected).code).toBe('frame_too_large'); }
  });
  it('rejects malformed json and non-object records', () => {
    const reader = createFrameReader(1024);
    const malformed = Buffer.alloc(4 + 5);
    malformed.writeUInt32LE(5, 0);
    malformed.write('xxxxx', 4);
    expect(() => reader.push(malformed)).toThrow(RecordRejected);
    const array = Buffer.alloc(4 + 3);
    array.writeUInt32LE(3, 0);
    array.write('[1]', 4);
    expect(() => reader.push(array)).toThrow(RecordRejected);
  });
  it('bounds the job record at the protocol maximum', () => {
    const reader = createFrameReader(MAX_JOB_RECORD_BYTES);
    const head = Buffer.alloc(4);
    head.writeUInt32LE(MAX_JOB_RECORD_BYTES + 1, 0);
    expect(() => reader.push(head)).toThrow(RecordRejected);
  });
});

describe('worker channel protocol', () => {
  it('encodes only exact call frames', () => {
    const frame = encodeWorkerRequest({ type: 'call', checkId: 'rank.order', exportName: 'rank', arguments: [[2, 1]] });
    expect(() => encodeWorkerRequest({ type: 'call', checkId: 'x', exportName: 'f', arguments: [], verdict: 'passed' })).toThrow(RecordRejected);
    expect(() => encodeWorkerRequest({ type: 'result', checkId: 'x', exportName: 'f', arguments: [] })).toThrow(RecordRejected);
    expect(frame.readUInt32LE(0)).toBe(frame.length - 4);
  });
  it('accepts only result/error shapes from the worker', () => {
    expect(validateWorkerResponse({ type: 'result', checkId: 'a', value: 42 })).toEqual({ type: 'result', checkId: 'a', value: 42 });
    expect(validateWorkerResponse({ type: 'error', checkId: 'a', error: 'boom' })).toEqual({ type: 'error', checkId: 'a', error: 'boom' });
    for (const bad of [
      { type: 'result', checkId: 'a', value: 1, outcome: 'passed' },
      { type: 'verdict', checkId: 'a', verdict: 'passed' },
      { type: 'result', checkId: 'a' },
      { type: 'result', checkId: 'a', value: 1, extra: 1 },
      { type: 'error', checkId: 'a', error: 42 },
      'passed',
      { type: 'result', checkId: 'a b!', value: 1 },
    ]) rejected(() => validateWorkerResponse(bad));
  });
});

describe('result record shape', () => {
  it('accepts the signed pair and the aux-observation variant only', () => {
    const signature = 'A'.repeat(86);
    expect(validateResultRecord({ result: {}, signature })).toEqual({ result: {}, signature });
    expect(validateResultRecord({ result: {}, signature, observations: {} })).toBeTruthy();
    for (const bad of [
      { result: {} },
      { signature },
      { result: {}, signature: 'short' },
      { result: {}, signature, extra: 1 },
      { result: 'x', signature },
    ]) rejected(() => validateResultRecord(bad), 'invalid_result_record');
  });
});
