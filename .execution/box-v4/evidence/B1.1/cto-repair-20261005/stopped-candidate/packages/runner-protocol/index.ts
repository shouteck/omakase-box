import { createHash, createPublicKey, sign, verify } from 'node:crypto';
import { z } from 'zod';

export const PROFILE = 'dedicated-linux-kvm-fresh-vm' as const;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const uuid = z.uuid();
export const HarnessId = z.enum(['pure-module/v1', 'frontend/v1', 'backend-api/v1', 'application-policy/v1', 'composed/v1']);
export const LimitsSchema = z.strictObject({ cpus: z.literal(2), memoryMiB: z.literal(512), pids: z.literal(128), seconds: z.literal(120), logBytes: z.literal(1048576), writableMiB: z.literal(256) });
export const DEFAULT_LIMITS = { cpus: 2, memoryMiB: 512, pids: 128, seconds: 120, logBytes: 1048576, writableMiB: 256 } as const;
export const JobSchema = z.strictObject({ protocolVersion: z.literal(1), jobId: uuid, attemptId: uuid, jobKind: z.enum(['public', 'private']), profile: z.literal(PROFILE), packageHash: hash, submissionHash: hash, artifactHash: hash, imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/), harnessId: HarnessId, harnessDigest: hash, requiredCheckIds: z.array(z.string().regex(/^[a-zA-Z0-9_.-]{1,80}$/)).min(1).max(1024), deadline: z.number().int().positive(), limits: LimitsSchema }).superRefine((job, ctx) => { if (new Set(job.requiredCheckIds).size !== job.requiredCheckIds.length) ctx.addIssue({ code: 'custom', message: 'Duplicate check IDs.' }); });
export type Job = z.infer<typeof JobSchema>;
export const LeaseSchema = z.strictObject({ leaseId: uuid, jobId: uuid, baselineDigest: hash, profile: z.literal(PROFILE), status: z.enum(['fresh', 'destroyed', 'quarantined']) });
export type Lease = z.infer<typeof LeaseSchema>;
export const ResultSchema = z.strictObject({ protocolVersion: z.literal(1), jobId: uuid, leaseId: uuid, jobKind: z.enum(['public', 'private']), profile: z.literal(PROFILE), packageHash: hash, submissionHash: hash, artifactHash: hash, imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/), harnessId: HarnessId, harnessDigest: hash, outcome: z.enum(['passed', 'failed', 'unverified']), checks: z.array(z.strictObject({ checkId: z.string().regex(/^[a-zA-Z0-9_.-]{1,80}$/), outcome: z.enum(['passed', 'failed', 'unverified']) })).max(1024), expiresAt: z.number().int().positive(), logDigest: hash });
export type TrustedResult = z.infer<typeof ResultSchema>;
export const SignedResultSchema = z.strictObject({ result: ResultSchema, signature: z.string().regex(/^[A-Za-z0-9_-]{86}$/) });
export function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (typeof value === 'object' && value !== null) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
  throw new Error('Unsupported protocol value.');
}
const commands = { 'pure-module/v1': ['supervise-pure-module'], 'frontend/v1': ['supervise-browser'], 'backend-api/v1': ['supervise-api'], 'application-policy/v1': ['validate-policy'], 'composed/v1': ['supervise-composed'] } as const;
export function trustedHarness(id: unknown) {
  const harnessId = HarnessId.parse(id);
  const descriptor = Object.freeze({ harnessId, executable: '/opt/private-task/harness/supervisor', args: Object.freeze([...commands[harnessId]]), version: 1 });
  return Object.freeze({ ...descriptor, digest: createHash('sha256').update(canonical(descriptor)).digest('hex'), installed: false as const });
}
export function parseJob(input: unknown, now = Date.now()): Job {
  const job = JobSchema.parse(input);
  if (job.deadline <= now || job.deadline > now + 120000 || job.harnessDigest !== trustedHarness(job.harnessId).digest) throw new Error('Invalid approved job binding.');
  return job;
}
export function signTrustedResult(result: TrustedResult, privateKey: string): z.infer<typeof SignedResultSchema> {
  const parsed = ResultSchema.parse(result);
  return { result: parsed, signature: sign(null, Buffer.from(canonical(parsed)), privateKey).toString('base64url') };
}
export function verifyTrustedResult(input: unknown, job: Job, lease: Lease, publicKey: string, now = Date.now()): TrustedResult {
  const { result, signature } = SignedResultSchema.parse(input);
  if (createPublicKey(publicKey).asymmetricKeyType !== 'ed25519' || !verify(null, Buffer.from(canonical(result)), publicKey, Buffer.from(signature, 'base64url'))) throw new Error('Unauthenticated runner result.');
  for (const key of ['jobId', 'jobKind', 'profile', 'packageHash', 'submissionHash', 'artifactHash', 'imageDigest', 'harnessId', 'harnessDigest'] as const) if (result[key] !== job[key]) throw new Error('Runner result binding mismatch.');
  if (lease.status !== 'fresh' || result.leaseId !== lease.leaseId || lease.jobId !== job.jobId || result.expiresAt <= now || result.expiresAt > job.deadline || now > job.deadline) throw new Error('Stale runner result.');
  const expected = new Set(job.requiredCheckIds);
  if (result.checks.length !== expected.size || new Set(result.checks.map(check => check.checkId)).size !== expected.size || result.checks.some(check => !expected.has(check.checkId))) throw new Error('Incomplete runner result.');
  if (result.outcome === 'passed' && result.checks.some(check => check.outcome !== 'passed')) throw new Error('Contradictory runner verdict.');
  return result;
}
