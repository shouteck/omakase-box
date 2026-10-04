import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { canonical, SignedResultSchema } from '../../../packages/runner-protocol/index.js';
import type { Job } from '../../../packages/runner-protocol/index.js';
import { buildIsolationPlan, IsolationPlanError } from '../../../services/runner-controller/isolation/plan.js';

const now = 1800000000000;
const imageDigest = 'sha256:eb4a84ec3e2948cd47e414fa66054730f10d0c20e5001b895fd58070c81c53f8';
const artifact = Buffer.from('invented approved artifact; never executed');
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const harnessArgs = { 'pure-module/v1': 'supervise-pure-module', 'frontend/v1': 'supervise-browser', 'backend-api/v1': 'supervise-api', 'application-policy/v1': 'validate-policy', 'composed/v1': 'supervise-composed' } as const;
function fixture(kind: 'public' | 'private' = 'public', harnessId: Job['harnessId'] = 'pure-module/v1') {
  const job: Job = {
    protocolVersion: 1, jobId: '11111111-1111-4111-8111-111111111111', attemptId: '22222222-2222-4222-8222-222222222222',
    jobKind: kind, profile: 'dedicated-linux-kvm-fresh-vm', packageHash: 'a'.repeat(64), submissionHash: 'b'.repeat(64), artifactHash: hash(artifact),
    imageDigest, harnessId, harnessDigest: hash(canonical({ harnessId, executable: '/opt/private-task/harness/supervisor', args: [harnessArgs[harnessId]], version: 1 })),
    requiredCheckIds: ['rank.order', 'rank.immutability'], deadline: now + 120000,
    limits: { cpus: 2, memoryMiB: 512, pids: 128, seconds: 120, logBytes: 1048576, writableMiB: 256 }
  };
  const lease = { leaseId: '33333333-3333-4333-8333-333333333333', jobId: job.jobId, baselineDigest: 'c'.repeat(64), profile: 'dedicated-linux-kvm-fresh-vm' as const, status: 'fresh' as const };
  const context = { approvedJob: structuredClone(job), leaseId: lease.leaseId, baselineDigest: 'c'.repeat(64), artifactKind: kind === 'public' ? 'public_release' as const : 'private_integration' as const };
  return { input: { job, lease }, context };
}
function planned(kind: 'public' | 'private' = 'public') {
  const { input, context } = fixture(kind);
  const result = buildIsolationPlan(input, context, artifact, now);
  if (result.status !== 'planned') throw new Error('Expected a supported static plan.');
  return result;
}
function reject(input: unknown, context: unknown, bytes: Uint8Array = artifact, clock = now) {
  let caught: unknown;
  try { buildIsolationPlan(input, context, bytes, clock); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(IsolationPlanError);
  expect((caught as Error).message).not.toContain('synthetic-private-canary');
}

describe('static pure-module isolation plans, not executed containment', () => {
  it('declares non-root, network-none, read-only, no-privilege and no-host-access constraints independently of builder constants', () => {
    const { plan } = planned();
    expect(plan.sandbox).toMatchObject({
      imageDigest, user: 'pwuser', network: 'none', readOnlyRoot: true, noNewPrivileges: true,
      capDrop: ['ALL'], capAdd: [], namespaces: { pid: 'private', ipc: 'private', uts: 'private' }, bindMounts: [], devices: [], ports: [], environment: []
    });
    expect(plan.sandbox.writableAreas).toEqual([
      { path: '/work', kind: 'tmpfs', maxBytes: 234881024, nodev: true, nosuid: true, noexec: true },
      { path: '/tmp', kind: 'tmpfs', maxBytes: 33554432, nodev: true, nosuid: true, noexec: true }
    ]);
    expect(plan.budgets).toEqual({ scope: 'whole_job', cpus: 2, memoryBytes: 536870912, pids: 128, deadlineMs: now + 120000, timeoutMs: 120000, logBytes: 1048576, totalWritableBytes: 268435456 });
    expect(plan.sandbox.writableAreas.reduce((sum, area) => sum + area.maxBytes, 0)).toBe(plan.budgets.totalWritableBytes);
  });
  it('declares a fixed working directory, private writable ownership, no privilege mode and no swap', () => {
    const { plan } = planned();
    expect(plan.sandbox).toMatchObject({ workingDirectory: '/work', privileged: false, swapAllowed: false, writableOwnership: { user: 'pwuser', mode: 448 } });
  });
  it('uses fixed trusted build/worker descriptors and keeps expectations/signing outside the candidate', () => {
    const { plan } = planned();
    expect(plan.commands).toEqual({
      build: { executable: '/usr/local/bin/node', args: ['/work/tooling/build.mjs'] },
      candidate: { executable: '/usr/local/bin/node', args: ['/work/tooling/worker.mjs'] }
    });
    expect(plan.supervisor).toMatchObject({ executable: '/opt/private-task/harness/supervisor', args: ['supervise-pure-module'], scope: 'outside_candidate', installed: false, provenance: 'descriptor_only', verdictSource: 'trusted_observations_only' });
    expect(plan.lifecycle).toEqual({ freshGuestRequired: true, separatePublicPrivateGuests: true, destroyOnCompletion: true, destroyOnCancellation: true, quarantineOnCleanupFailure: true });
  });
  it.each(['public', 'private'] as const)('binds the entire trusted %s job, fresh lease and exact artifact without returning source bytes', kind => {
    const { input, context } = fixture(kind);
    const { plan } = planned(kind);
    expect(plan.bindings).toEqual({ ...input.job, leaseId: input.lease.leaseId, baselineDigest: context.baselineDigest, artifactKind: context.artifactKind, artifactBytes: artifact.length });
    expect(JSON.stringify(plan)).not.toContain(artifact.toString());
  });
  it('does not authorize execution, verify owner approval, certify a harness installation or masquerade as a signed result', () => {
    const result = planned();
    expect(result).toMatchObject({ assurance: 'bounded', executionAvailable: false, hostExecutionAllowed: false, realValidation: 'unverified' });
    expect(result.plan.approvalVerification).toBe('required_upstream');
    expect(result.plan.limitations).toContain('Plan construction is not runtime isolation or approval evidence.');
    expect(SignedResultSchema.safeParse(result).success).toBe(false);
  });
  it('has a reproducible digest binding every declared constraint at the same trusted clock', () => {
    const { input, context } = fixture();
    const first = buildIsolationPlan(input, context, artifact, now);
    const second = buildIsolationPlan(structuredClone(input), structuredClone(context), Buffer.from(artifact), now);
    expect(first).toEqual(second);
    if (first.status !== 'planned') throw new Error('Expected a plan.');
    expect(first.planHash).toBe(hash(canonical(first.plan)));
    const altered = structuredClone(first.plan) as unknown as { sandbox: { network: string } };
    altered.sandbox.network = 'host';
    expect(hash(canonical(altered))).not.toBe(first.planHash);
  });
  it('deep-freezes all returned policy data and snapshots mutable caller inputs', () => {
    const { input, context } = fixture();
    const original = structuredClone(input);
    const result = buildIsolationPlan(input, context, artifact, now);
    const frozen = (value: unknown): void => {
      if (value === null || typeof value !== 'object') return;
      expect(Object.isFrozen(value)).toBe(true);
      Object.values(value).forEach(frozen);
    };
    frozen(result);
    expect(input).toEqual(original);
    input.job.requiredCheckIds.push('changed');
    context.approvedJob.packageHash = 'd'.repeat(64);
    if (result.status !== 'planned') throw new Error('Expected a plan.');
    expect(result.plan.bindings.requiredCheckIds).toEqual(['rank.order', 'rank.immutability']);
    expect(result.plan.bindings.packageHash).toBe('a'.repeat(64));
    expect(Reflect.set(result.plan.sandbox, 'network', 'host')).toBe(false);
  });
  it('uses the remaining absolute deadline as one shared build/candidate budget', () => {
    const { input, context } = fixture();
    input.job.deadline = now + 1;
    context.approvedJob = structuredClone(input.job);
    const result = buildIsolationPlan(input, context, artifact, now);
    if (result.status !== 'planned') throw new Error('Expected a plan.');
    expect(result.plan.budgets.timeoutMs).toBe(1);
    expect(result.plan.budgets.scope).toBe('whole_job');
  });
  it.each(['frontend/v1', 'backend-api/v1', 'application-policy/v1', 'composed/v1'] as const)('explicitly reports %s as unsupported rather than shrinking or pretending to execute it', harnessId => {
    const { input, context } = fixture('public', harnessId);
    const result = buildIsolationPlan(input, context, artifact, now);
    expect(result).toMatchObject({ status: 'not_supported', reason: 'unsupported_harness', requestedHarness: harnessId, executionAvailable: false, hostExecutionAllowed: false });
    expect('plan' in result).toBe(false);
  });
  it('rejects an unregistered image even when its supplied authority and digest agree', () => {
    const { input, context } = fixture();
    input.job.imageDigest = 'sha256:' + 'd'.repeat(64);
    context.approvedJob = structuredClone(input.job);
    expect(buildIsolationPlan(input, context, artifact, now)).toMatchObject({ status: 'not_supported', reason: 'unsupported_image' });
  });
  it.each(['command', 'shell', 'environment', 'mounts', 'ports', 'devices', 'capabilities', 'signingKey', 'supervisorInstalled'])('rejects extra privileged %s fields in input and trusted context', field => {
    const { input, context } = fixture();
    const value = 'synthetic-private-canary';
    reject({ ...input, [field]: value }, context);
    reject({ ...input, job: { ...input.job, [field]: value } }, context);
    reject(input, { ...context, [field]: value });
    reject(input, { ...context, approvedJob: { ...context.approvedJob, [field]: value } });
  });
  it.each([
    ['cpus', 3], ['memoryMiB', 1024], ['pids', 129], ['seconds', 121], ['logBytes', 1048577], ['writableMiB', 257]
  ])('rejects changed resource limit %s', (field, value) => {
    const { input, context } = fixture();
    const job = { ...input.job, limits: { ...input.job.limits, [field as string]: value } };
    reject({ ...input, job }, { ...context, approvedJob: job });
  });
  it.each(['jobId', 'attemptId', 'jobKind', 'packageHash', 'submissionHash', 'artifactHash', 'imageDigest', 'harnessId', 'harnessDigest', 'deadline', 'requiredCheckIds'])('rejects a %s change not matching the upstream authority', field => {
    const { input, context } = fixture();
    const alternative = fixture('private', 'frontend/v1').input.job;
    const values: Record<string, unknown> = {
      jobId: input.job.attemptId, attemptId: input.job.jobId, jobKind: alternative.jobKind,
      packageHash: 'd'.repeat(64), submissionHash: 'd'.repeat(64), artifactHash: 'd'.repeat(64), imageDigest: 'sha256:' + 'd'.repeat(64),
      harnessId: alternative.harnessId, harnessDigest: alternative.harnessDigest, deadline: now + 119999, requiredCheckIds: ['rank.other']
    };
    reject({ ...input, job: { ...input.job, [field]: values[field] } }, context);
  });
  it('rejects non-dedicated profiles, malformed identifiers, duplicate checks and forged harness mappings', () => {
    for (const change of [{ profile: 'host-docker' }, { jobId: '../other' }, { jobId: '11111111-1111-4111-8111-11111111111Z' }, { requiredCheckIds: ['check', 'check'] }, { harnessId: 'sh -c evil' }, { harnessDigest: 'f'.repeat(64) }]) {
      const { input, context } = fixture();
      const job = { ...input.job, ...change };
      reject({ ...input, job }, { ...context, approvedJob: job });
    }
  });
  it('rejects a changed valid lease ID rather than binding an arbitrary receipt for the same job', () => {
    const { input, context } = fixture();
    reject({ ...input, lease: { ...input.lease, leaseId: '44444444-4444-4444-8444-444444444444' } }, context);
  });
  it('rejects destroyed, quarantined, mismatched and privileged leases', () => {
    for (const change of [{ status: 'destroyed' }, { status: 'quarantined' }, { jobId: '22222222-2222-4222-8222-222222222222' }, { baselineDigest: 'd'.repeat(64) }, { profile: 'host-docker' }, { command: 'synthetic-private-canary' }]) {
      const { input, context } = fixture();
      reject({ ...input, lease: { ...input.lease, ...change } }, context);
    }
  });
  it.each(['public', 'private'] as const)('rejects a %s job with the other artifact provenance label', kind => {
    const { input, context } = fixture(kind);
    reject(input, { ...context, artifactKind: kind === 'public' ? 'private_integration' : 'public_release' });
  });
  it.each([NaN, Infinity, -Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid clock %s', clock => {
    const { input, context } = fixture();
    reject(input, context, artifact, clock);
  });
  it.each([now - 1, now, now + 120001])('rejects invalid approved deadline %s', deadline => {
    const { input, context } = fixture();
    input.job.deadline = deadline;
    context.approvedJob = structuredClone(input.job);
    reject(input, context);
  });
  it('rejects missing authority, incorrect/empty/oversized bytes and accepts the exact 16 MiB transport boundary', () => {
    const { input, context } = fixture();
    reject(input, undefined);
    reject(input, context, Buffer.from('different bytes'));
    reject(input, context, new Uint8Array(0));
    reject(input, context, new Uint8Array(16777217));
    const bytes = new Uint8Array(16777216);
    input.job.artifactHash = hash(bytes);
    context.approvedJob = structuredClone(input.job);
    expect(buildIsolationPlan(input, context, bytes, now).status).toBe('planned');
  });
  it.each([{ label: 'null', bytes: null }, { label: 'text', bytes: 'synthetic-private-canary' }, { label: 'object', bytes: {} }, { label: 'array', bytes: [] }])('rejects non-byte artifact input $label without raw diagnostics', ({ bytes }) => {
    const { input, context } = fixture();
    reject(input, context, bytes as unknown as Uint8Array);
  });
  it('contains no process, filesystem, evaluator or dynamic-code execution imports in the plan builder', async () => {
    const source = await readFile('services/runner-controller/isolation/plan.ts', 'utf8');
    const imports = [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map(match => match[1]);
    expect(imports.sort()).toEqual(['../../../packages/runner-protocol/index.js', '../../../templates/workspaces/public-image-profile.js', 'node:crypto', 'zod'].sort());
    expect(source).not.toMatch(/\b(?:import\s*\(|eval\s*\(|spawn\s*\(|exec(?:File|Sync)?\s*\(|new\s+Function\b)/);
  });
});
