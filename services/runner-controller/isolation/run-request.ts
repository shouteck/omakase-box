import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonical, JobSchema, LeaseSchema, parseJob } from '../../../packages/runner-protocol/index.js';

/**
 * Builder for the exact two artifacts exchanged with the dedicated runner:
 * the broker 'run' request (SSH stdin) and the guest job envelope written
 * onto the virtio-serial control channel before artifact bytes. Both are
 * pure functions of an already-approved job, fresh lease and verified
 * artifact — nothing here executes, grants or widens anything.
 */

const MAX_JOB_RECORD_BYTES = 262144;
const MAX_ARTIFACT_BYTES = 16777216;

type Rejection = 'invalid_clock' | 'invalid_job' | 'invalid_lease' | 'binding_mismatch' | 'invalid_artifact' | 'artifact_mismatch' | 'envelope_too_large';

export class RunRequestError extends Error {
  constructor(readonly code: Rejection) { super(`Run request rejected: ${code}.`); }
}

const uuid = z.uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/);

const ContextSchema = z.strictObject({
  leaseId: uuid,
  baselineDigest: hash,
  artifactKind: z.enum(['public_release', 'private_integration']),
});

const JobEnvelopeSchema = z.strictObject({
  artifactBytes: z.number().int().positive().max(MAX_ARTIFACT_BYTES),
  artifactHash: hash,
  deadline: z.number().int().positive(),
  job: JobSchema,
  leaseId: uuid,
});

const BrokerRunRequestSchema = z.strictObject({
  version: z.literal(1),
  operation: z.literal('run'),
  leaseId: uuid,
  job: JobSchema,
});

export type JobEnvelope = z.infer<typeof JobEnvelopeSchema>;
export type BrokerRunRequest = z.infer<typeof BrokerRunRequestSchema>;

function immutable<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !(value instanceof Uint8Array)) {
    Object.values(value).forEach(child => immutable(child));
    Object.freeze(value);
  }
  return value;
}

/**
 * The exact record the broker writes to the guest channel ahead of the
 * artifact stream, plus the broker request itself. Rejects every binding
 * drift — the envelope never carries authority of its own.
 */
export function buildRunRequest(input: unknown, trustedContext: unknown, approvedArtifact: Uint8Array, now = Date.now()) {
  if (!Number.isSafeInteger(now) || now < 0 || now > Number.MAX_SAFE_INTEGER - 120000) throw new RunRequestError('invalid_clock');
  const parsedInput = z.strictObject({ job: JobSchema, lease: LeaseSchema }).safeParse(input);
  if (!parsedInput.success) throw new RunRequestError('invalid_job');
  let job;
  try { job = parseJob(parsedInput.data.job, now); } catch { throw new RunRequestError('invalid_job'); }
  const lease = parsedInput.data.lease;
  if (lease.status !== 'fresh' || lease.jobId !== job.jobId) throw new RunRequestError('invalid_lease');
  const context = ContextSchema.safeParse(trustedContext);
  if (!context.success) throw new RunRequestError('binding_mismatch');
  if (lease.leaseId !== context.data.leaseId || lease.baselineDigest !== context.data.baselineDigest) throw new RunRequestError('invalid_lease');
  if (context.data.artifactKind !== (job.jobKind === 'public' ? 'public_release' : 'private_integration')) throw new RunRequestError('binding_mismatch');
  if (!(approvedArtifact instanceof Uint8Array) || approvedArtifact.length === 0 || approvedArtifact.length > MAX_ARTIFACT_BYTES) throw new RunRequestError('invalid_artifact');
  const artifact = Buffer.from(approvedArtifact);
  const artifactHash = createHash('sha256').update(artifact).digest('hex');
  if (artifactHash !== job.artifactHash) throw new RunRequestError('artifact_mismatch');

  const envelope = JobEnvelopeSchema.parse({
    artifactBytes: artifact.length,
    artifactHash,
    deadline: job.deadline,
    job,
    leaseId: lease.leaseId,
  });
  const request = BrokerRunRequestSchema.parse({ version: 1, operation: 'run', leaseId: lease.leaseId, job });
  const body = Buffer.from(JSON.stringify(envelope), 'utf8');
  if (body.length > MAX_JOB_RECORD_BYTES) throw new RunRequestError('envelope_too_large');
  const frame = Buffer.alloc(4 + body.length);
  frame.writeUInt32LE(body.length, 0);
  body.copy(frame, 4);

  return immutable({
    assurance: 'bounded',
    executionAvailable: false,
    hostExecutionAllowed: false,
    realValidation: 'unverified',
    status: 'planned' as const,
    request,
    envelope,
    /** The exact frame bytes the broker must write before artifact bytes. */
    frame,
    /** Envelope digest so the private side can audit what was dispatched. */
    envelopeDigest: createHash('sha256').update(frame).digest('hex'),
    stagedPath: `/var/lib/private-task/staging/${job.jobId}.bin`,
    limitations: [
      'A built request is not execution evidence; the signed result is.',
      'Artifact bytes travel once on the control channel after this frame.',
    ],
  });
}

export type RunRequestResult = ReturnType<typeof buildRunRequest>;
