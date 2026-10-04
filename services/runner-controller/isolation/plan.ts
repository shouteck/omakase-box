import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonical, JobSchema, LeaseSchema, parseJob, trustedHarness } from '../../../packages/runner-protocol/index.js';
import { PUBLIC_IMAGE_PROFILE } from '../../../templates/workspaces/public-image-profile.js';

const InputSchema = z.strictObject({ job: JobSchema, lease: LeaseSchema });
const ContextSchema = z.strictObject({ approvedJob: JobSchema, leaseId: z.uuid(), baselineDigest: z.string().regex(/^[a-f0-9]{64}$/), artifactKind: z.enum(['public_release', 'private_integration']) });
type Rejection = 'invalid_clock' | 'invalid_input' | 'invalid_context' | 'invalid_job' | 'binding_mismatch' | 'invalid_lease' | 'artifact_scope_mismatch' | 'invalid_artifact' | 'artifact_mismatch';
type Immutable<T> = T extends object ? { readonly [K in keyof T]: Immutable<T[K]> } : T;

export class IsolationPlanError extends Error {
  constructor(readonly code: Rejection) { super(`Isolation plan rejected: ${code}.`); }
}
function parsed<T>(schema: z.ZodType<T>, input: unknown, code: Rejection): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new IsolationPlanError(code);
  return result.data;
}
function immutable<T>(value: T): Immutable<T> {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(child => immutable(child));
    Object.freeze(value);
  }
  return value as Immutable<T>;
}
const availability = { assurance: 'bounded', executionAvailable: false, hostExecutionAllowed: false, realValidation: 'unverified' } as const;

export function buildIsolationPlan(input: unknown, trustedContext: unknown, approvedArtifact: Uint8Array, now = Date.now()) {
  if (!Number.isSafeInteger(now) || now < 0 || now > Number.MAX_SAFE_INTEGER - 120000) throw new IsolationPlanError('invalid_clock');
  const envelope = parsed(InputSchema, input, 'invalid_input');
  const context = parsed(ContextSchema, trustedContext, 'invalid_context');
  let job;
  try { job = parseJob(envelope.job, now); } catch { throw new IsolationPlanError('invalid_job'); }
  const lease = envelope.lease;
  if (canonical(job) !== canonical(context.approvedJob)) throw new IsolationPlanError('binding_mismatch');
  if (lease.status !== 'fresh' || lease.leaseId !== context.leaseId || lease.jobId !== job.jobId || lease.baselineDigest !== context.baselineDigest) throw new IsolationPlanError('invalid_lease');
  if (context.artifactKind !== (job.jobKind === 'public' ? 'public_release' : 'private_integration')) throw new IsolationPlanError('artifact_scope_mismatch');
  if (!(approvedArtifact instanceof Uint8Array) || approvedArtifact.length === 0 || approvedArtifact.length > 16777216) throw new IsolationPlanError('invalid_artifact');
  const artifact = Buffer.from(approvedArtifact);
  if (createHash('sha256').update(artifact).digest('hex') !== job.artifactHash) throw new IsolationPlanError('artifact_mismatch');
  if (job.harnessId !== 'pure-module/v1') return immutable({ ...availability, status: 'not_supported' as const, reason: 'unsupported_harness' as const, requestedHarness: job.harnessId });
  if (job.imageDigest !== PUBLIC_IMAGE_PROFILE.imageDigest) return immutable({ ...availability, status: 'not_supported' as const, reason: 'unsupported_image' as const, requestedHarness: job.harnessId });
  const harness = trustedHarness(job.harnessId);
  const plan = {
    schemaVersion: 1,
    executionEnvironment: 'dedicated_guest_only',
    approvalVerification: 'required_upstream',
    bindings: { ...job, leaseId: lease.leaseId, baselineDigest: lease.baselineDigest, artifactKind: context.artifactKind, artifactBytes: artifact.length },
    sandbox: {
      imageDigest: job.imageDigest, user: 'pwuser', workingDirectory: '/work', network: 'none', readOnlyRoot: true, noNewPrivileges: true,
      privileged: false, swapAllowed: false, writableOwnership: { user: 'pwuser', mode: 0o700 },
      capDrop: ['ALL'], capAdd: [], namespaces: { pid: 'private', ipc: 'private', uts: 'private' },
      bindMounts: [], devices: [], ports: [], environment: [],
      writableAreas: [
        { path: '/work', kind: 'tmpfs', maxBytes: 224 * 1048576, nodev: true, nosuid: true, noexec: true },
        { path: '/tmp', kind: 'tmpfs', maxBytes: 32 * 1048576, nodev: true, nosuid: true, noexec: true }
      ]
    },
    budgets: {
      scope: 'whole_job', cpus: job.limits.cpus, memoryBytes: job.limits.memoryMiB * 1048576, pids: job.limits.pids,
      deadlineMs: job.deadline, timeoutMs: job.deadline - now, logBytes: job.limits.logBytes, totalWritableBytes: job.limits.writableMiB * 1048576
    },
    commands: {
      build: { executable: '/usr/local/bin/node', args: ['/work/tooling/build.mjs'] },
      candidate: { executable: '/usr/local/bin/node', args: ['/work/tooling/worker.mjs'] }
    },
    supervisor: {
      executable: harness.executable, args: [...harness.args], descriptorDigest: harness.digest, installed: harness.installed,
      scope: 'outside_candidate', provenance: 'descriptor_only', verdictSource: 'trusted_observations_only'
    },
    lifecycle: { freshGuestRequired: true, separatePublicPrivateGuests: true, destroyOnCompletion: true, destroyOnCancellation: true, quarantineOnCleanupFailure: true },
    limitations: [
      'Plan construction is not runtime isolation or approval evidence.',
      'The caller must verify owner approval, attempt permits, fresh lease authority and minimal artifact provenance upstream.',
      'Guest bootstrap, immutable harness validation, resource enforcement and disposal remain unverified.'
    ]
  } as const;
  return immutable({ ...availability, status: 'planned' as const, plan, planHash: createHash('sha256').update(canonical(plan)).digest('hex') });
}
export type IsolationPlanResult = ReturnType<typeof buildIsolationPlan>;
