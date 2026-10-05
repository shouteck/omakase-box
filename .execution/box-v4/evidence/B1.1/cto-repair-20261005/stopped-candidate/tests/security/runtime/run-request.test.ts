import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildRunRequest, RunRequestError } from '../../../services/runner-controller/isolation/run-request.js';
import { classifyGuestRecord, verdictAuthority, observationSummary } from '../../../services/runner-controller/isolation/observations.js';
import { adversarialArtifact, adversarialCatalog } from '../../../services/runner-controller/isolation/adversarial.js';
// @ts-expect-error guest-side ESM module without type declarations
import { validateJobEnvelope, encodeRecord } from '../../../infra/runner/jobs/harness/records.mjs';

const now = 1800000000000;
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const artifact = Buffer.from(JSON.stringify({ files: { 'index.mjs': Buffer.from('export const x = 1;').toString('base64') } }));
const job = {
  protocolVersion: 1, jobId: '11111111-1111-4111-8111-111111111111', attemptId: '22222222-2222-4222-8222-222222222222',
  jobKind: 'public' as const, profile: 'dedicated-linux-kvm-fresh-vm' as const, packageHash: 'a'.repeat(64), submissionHash: 'b'.repeat(64),
  artifactHash: hash(artifact), imageDigest: 'sha256:' + 'd'.repeat(64), harnessId: 'pure-module/v1' as const,
  harnessDigest: hash('{"args":["supervise-pure-module"],"executable":"/opt/private-task/harness/supervisor","harnessId":"pure-module/v1","version":1}'),
  requiredCheckIds: ['rank.order'], deadline: now + 120000,
  limits: { cpus: 2, memoryMiB: 512, pids: 128, seconds: 120, logBytes: 1048576, writableMiB: 256 },
};
const lease = { leaseId: '33333333-3333-4333-8333-333333333333', jobId: job.jobId, baselineDigest: 'c'.repeat(64), profile: 'dedicated-linux-kvm-fresh-vm' as const, status: 'fresh' as const };
const context = { leaseId: lease.leaseId, baselineDigest: 'c'.repeat(64), artifactKind: 'public_release' as const };
const built = () => buildRunRequest({ job, lease }, context, artifact, now);
function rejected(fn: () => unknown, code?: string) {
  let caught: unknown;
  try { fn(); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(RunRequestError);
  if (code !== undefined) expect((caught as RunRequestError).code).toBe(code);
}

describe('run-request builder', () => {
  it('produces the exact broker request and a guest envelope the supervisor validates', () => {
    const result = built();
    expect(result.request).toEqual({ version: 1, operation: 'run', leaseId: lease.leaseId, job });
    const frameBody = result.frame.subarray(4);
    expect(result.frame.readUInt32LE(0)).toBe(frameBody.length);
    expect(() => validateJobEnvelope(JSON.parse(frameBody.toString('utf8')))).not.toThrow();
    expect(result.envelopeDigest).toBe(hash(result.frame));
    expect(result.stagedPath).toBe(`/var/lib/private-task/staging/${job.jobId}.bin`);
    expect(result).toMatchObject({ assurance: 'bounded', executionAvailable: false, hostExecutionAllowed: false, realValidation: 'unverified', status: 'planned' });
  });
  it('envelope bytes are identical to the records.mjs framing', () => {
    const result = built();
    expect(result.frame).toEqual(encodeRecord(result.envelope));
  });
  it('rejects every binding drift', () => {
    rejected(() => buildRunRequest({ job, lease: { ...lease, status: 'destroyed' } }, context, artifact, now), 'invalid_lease');
    rejected(() => buildRunRequest({ job, lease: { ...lease, leaseId: '44444444-4444-4444-8444-444444444444' } }, context, artifact, now), 'invalid_lease');
    rejected(() => buildRunRequest({ job, lease }, { ...context, artifactKind: 'private_integration' }, artifact, now), 'binding_mismatch');
    rejected(() => buildRunRequest({ job, lease }, { ...context, baselineDigest: 'f'.repeat(64) }, artifact, now), 'invalid_lease');
    rejected(() => buildRunRequest({ job, lease }, context, Buffer.from('other bytes'), now), 'artifact_mismatch');
    rejected(() => buildRunRequest({ job, lease }, context, new Uint8Array(0), now), 'invalid_artifact');
    rejected(() => buildRunRequest({ job: { ...job, deadline: now - 1 }, lease }, context, artifact, now), 'invalid_job');
  });
});

describe('guest record classifier', () => {
  const signature = 'A'.repeat(86);
  const result = { protocolVersion: 1, jobId: job.jobId, leaseId: lease.leaseId, jobKind: 'public', profile: 'dedicated-linux-kvm-fresh-vm', packageHash: 'a'.repeat(64), submissionHash: 'b'.repeat(64), artifactHash: job.artifactHash, imageDigest: job.imageDigest, harnessId: 'pure-module/v1', harnessDigest: job.harnessDigest, outcome: 'failed', checks: [{ checkId: 'rank.order', outcome: 'failed' }], expiresAt: now + 60000, logDigest: 'f'.repeat(64) };
  it('only strict signed pairs classify as verifiable', () => {
    expect(classifyGuestRecord({ result, signature })).toMatchObject({ kind: 'signed_result' });
    expect(classifyGuestRecord({ result, signature, observations: { x: 1 } })).toMatchObject({ kind: 'signed_result_aux' });
    expect(verdictAuthority(classifyGuestRecord({ result, signature }))).toBe('verifiable');
  });
  it('unsigned supervisor faults classify as unverified evidence', () => {
    const fault = { protocolVersion: 1, status: 'unverified', code: 'stage_rejected' };
    expect(classifyGuestRecord(fault)).toMatchObject({ kind: 'supervisor_fault', fault: 'stage_rejected' });
    expect(verdictAuthority(classifyGuestRecord(fault))).toBe('unverified');
  });
  it('forged, malformed and unexpected records classify as unrecognized', () => {
    for (const bad of [
      { result, signature: 'forged' },
      { result, signature, extra: 'x' },
      { result },
      'passed',
      { outcome: 'passed' },
      { result: 'passed', signature },
      null,
      [{ result, signature }],
    ]) {
      const classification = classifyGuestRecord(bad);
      expect(classification.kind).toBe('unrecognized');
      expect(verdictAuthority(classification)).toBe('unverified');
    }
  });
  it('observation summaries project structure, never raw payloads', () => {
    expect(observationSummary(undefined)).toEqual({ present: false });
    expect(observationSummary({ containment: {}, process: {} })).toEqual({ present: true, fields: ['containment', 'process'] });
    expect(observationSummary('raw')).toEqual({ present: true });
  });
});

describe('adversarial catalog', () => {
  it('covers every required M5.2 case kind', () => {
    const kinds = adversarialCatalog().map(entry => entry.kind).sort();
    expect(kinds).toEqual(['assertion_monkeypatch', 'cross_job_persistence', 'file_read_probe', 'forced_exit_zero', 'forged_stdout_verdict', 'good', 'infinite_loop', 'memory_exhaustion', 'network_egress', 'output_flood', 'process_explosion', 'signing_key_probe'].sort());
  });
  it('every case honestly declares unverified assurance', () => {
    for (const entry of adversarialCatalog()) expect(entry.assurance).toBe('unverified');
  });
  it('artifact bundles hash-bind candidate bytes plus a sealed contract', () => {
    const contract = { checks: [{ checkId: 'rank.order', exportName: 'rank', arguments: [[3, 1, 2]], expected: [1, 2, 3] }] };
    const artifact = adversarialArtifact('adv.good', contract);
    const bundle = JSON.parse(artifact.artifactBytes.toString('utf8'));
    expect(Buffer.from(bundle.files['index.mjs'], 'base64').toString('utf8')).toContain('export async function rank');
    expect(bundle.contract).toEqual(contract);
    expect(artifact.artifactHash).toBe(hash(artifact.artifactBytes));
    expect(() => adversarialArtifact('adv.nonexistent', contract)).toThrow();
  });
});
