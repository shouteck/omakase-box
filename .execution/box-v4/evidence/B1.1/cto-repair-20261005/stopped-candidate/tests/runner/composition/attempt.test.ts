import { describe, expect, it } from 'vitest';
import { buildAttemptDescriptor, ADAPTER_HARNESS } from '../../../packages/evaluation/composition/index.js';
import { buildChildJobs, aggregateAttemptVerdict } from '../../../services/runner-controller/composition/index.js';
import { DEFAULT_LIMITS } from '../../../packages/runner-protocol/index.js';
import type { TrustedResult } from '../../../packages/runner-protocol/index.js';

const hex = (seed: number) => seed.toString(16).padStart(64, '0').slice(0, 64);
const uuid = (seed: number) => `00000000-0000-4000-8000-${seed.toString(16).padStart(12, '0')}`;

const attemptInput = () => ({
  attemptId: uuid(1),
  taskId: uuid(2),
  taskVersion: 3,
  packageHash: hex(10),
  submissionHash: hex(11),
  jobKind: 'public',
  units: [
    { unitId: 'frontend', adapterKind: 'frontend_component', artifactHash: hex(20), imageDigest: `sha256:${hex(30)}`, checkIds: ['ui.renders'] },
    { unitId: 'api', adapterKind: 'backend_api', artifactHash: hex(21), imageDigest: `sha256:${hex(31)}`, checkIds: ['api.contract'] },
  ],
  interfaces: [{ interfaceId: 'orders-api', schemaHash: hex(40), producerUnitId: 'api', consumerUnitId: 'frontend' }],
  endToEndCheckIds: ['e2e.purchase'],
  limits: DEFAULT_LIMITS,
});

const harnessDigests = { 'frontend/v1': hex(50), 'pure-module/v1': hex(51), 'backend-api/v1': hex(52), 'application-policy/v1': hex(53), 'composed/v1': hex(54) };

const resultFor = (job: any, outcome: 'passed' | 'failed' | 'unverified', checks: { checkId: string; outcome: string }[]): TrustedResult => ({
  protocolVersion: 1, jobId: job.jobId, leaseId: uuid(9), jobKind: job.jobKind, profile: job.profile,
  packageHash: job.packageHash, submissionHash: job.submissionHash, artifactHash: job.artifactHash,
  imageDigest: job.imageDigest, harnessId: job.harnessId, harnessDigest: job.harnessDigest,
  outcome, checks: checks as any, expiresAt: Date.now() + 60000, logDigest: hex(60),
});

describe('buildAttemptDescriptor — one authorized attempt binds all digests', () => {
  it('derives deterministic child jobs per unit plus one end-to-end job', () => {
    const descriptor = buildAttemptDescriptor(attemptInput());
    expect(descriptor.attemptsConsumed).toBe(1);
    expect(descriptor.children).toHaveLength(3);
    expect(descriptor.children.map(child => child.harnessId)).toEqual(['frontend/v1', 'backend-api/v1', 'composed/v1']);
    expect(descriptor.descriptorDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(buildAttemptDescriptor(attemptInput()).children.map(child => child.jobId)).toEqual(descriptor.children.map(child => child.jobId));
    expect(descriptor.realValidation).toBe('unverified');
  });
  it('maps each adapter kind to its fixed harness id', () => {
    expect(ADAPTER_HARNESS).toEqual({ frontend_component: 'frontend/v1', backend_pure_module: 'pure-module/v1', backend_api: 'backend-api/v1', application_policy: 'application-policy/v1' });
  });
  it('rejects duplicate units, dangling interfaces and composition without interfaces', () => {
    const input = attemptInput();
    expect(() => buildAttemptDescriptor({ ...input, units: [...input.units, input.units[0]] })).toThrowError(/duplicate_unit/);
    expect(() => buildAttemptDescriptor({ ...input, interfaces: [{ interfaceId: 'x', schemaHash: hex(40), producerUnitId: 'api', consumerUnitId: 'ghost' }] })).toThrowError(/dangling_interface/);
    expect(() => buildAttemptDescriptor({ ...input, interfaces: [] })).toThrowError(/composition_without_interfaces/);
  });
  it('rejects e2e checks on a single unit and unbound policy specs', () => {
    const single = { ...attemptInput(), units: attemptInput().units.slice(0, 1), interfaces: [] };
    expect(() => buildAttemptDescriptor(single)).toThrowError(/composition_without_interfaces|e2e_without_composition/);
    const withPolicy = { ...attemptInput(), policySpecHash: hex(70) };
    expect(() => buildAttemptDescriptor(withPolicy)).toThrowError(/unbound_policy_spec/);
    const policyUnit = { ...attemptInput(), units: [...attemptInput().units, { unitId: 'policy', adapterKind: 'application_policy', artifactHash: hex(22), imageDigest: `sha256:${hex(32)}`, checkIds: ['policy.data'] }] };
    expect(() => buildAttemptDescriptor(policyUnit)).toThrowError(/missing_policy_spec/);
  });
});

describe('buildChildJobs — protocol Job records share the attempt binding', () => {
  it('produces schema-valid jobs pinned to one attemptId and package/submission', () => {
    const descriptor = buildAttemptDescriptor(attemptInput());
    const jobs = buildChildJobs(descriptor, harnessDigests, Date.now() + 60000);
    expect(jobs).toHaveLength(3);
    for (const job of jobs) {
      expect(job.attemptId).toBe(descriptor.attemptId);
      expect(job.packageHash).toBe(descriptor.packageHash);
      expect(job.submissionHash).toBe(descriptor.submissionHash);
      expect(job.limits).toEqual(DEFAULT_LIMITS);
    }
  });
  it('rejects elapsed deadlines and missing harness digests', () => {
    const descriptor = buildAttemptDescriptor(attemptInput());
    expect(() => buildChildJobs(descriptor, harnessDigests, Date.now() - 1)).toThrowError(/deadline_elapsed/);
    expect(() => buildChildJobs(descriptor, {}, Date.now() + 60000)).toThrowError(/harness_digest_missing/);
  });
});

describe('aggregateAttemptVerdict — missing or forged evidence never passes', () => {
  const pass = (job: any) => resultFor(job, 'passed', job.requiredCheckIds.map((checkId: string) => ({ checkId, outcome: 'passed' })));
  it('passes only when every required child yields verified passing evidence', () => {
    const jobs = buildChildJobs(buildAttemptDescriptor(attemptInput()), harnessDigests, Date.now() + 60000);
    const verdict = aggregateAttemptVerdict(buildAttemptDescriptor(attemptInput()), jobs.map(job => ({ jobId: job.jobId, result: pass(job) })));
    expect(verdict.outcome).toBe('passed');
    expect(verdict.attemptsConsumed).toBe(1);
  });
  it('a missing unit result is unverified — never a pass', () => {
    const descriptor = buildAttemptDescriptor(attemptInput());
    const jobs = buildChildJobs(descriptor, harnessDigests, Date.now() + 60000);
    const verdict = aggregateAttemptVerdict(descriptor, jobs.slice(0, 2).map(job => ({ jobId: job.jobId, result: pass(job) })));
    expect(verdict.outcome).toBe('unverified');
    expect(verdict.cause).toBe('missing_unit_result');
    expect(verdict.missingJobIds).toEqual([jobs[2]!.jobId]);
  });
  it('unit success plus a failed e2e is a failed aggregate, not a pass', () => {
    const descriptor = buildAttemptDescriptor(attemptInput());
    const jobs = buildChildJobs(descriptor, harnessDigests, Date.now() + 60000);
    const evidence = jobs.map(job => ({ jobId: job.jobId, result: pass(job) }));
    evidence[2] = { jobId: jobs[2]!.jobId, result: resultFor(jobs[2]!, 'failed', [{ checkId: 'e2e.purchase', outcome: 'failed' }]) };
    const verdict = aggregateAttemptVerdict(descriptor, evidence);
    expect(verdict.outcome).toBe('failed');
    expect(verdict.cause).toBe('candidate_failure');
  });
  it('one attempt is counted once regardless of fan-out width', () => {
    const descriptor = buildAttemptDescriptor(attemptInput());
    const jobs = buildChildJobs(descriptor, harnessDigests, Date.now() + 60000);
    const verdict = aggregateAttemptVerdict(descriptor, jobs.map(job => ({ jobId: job.jobId, result: pass(job) })));
    expect(verdict.attemptsConsumed).toBe(1);
    expect(descriptor.children.length).toBeGreaterThan(1);
  });
});
