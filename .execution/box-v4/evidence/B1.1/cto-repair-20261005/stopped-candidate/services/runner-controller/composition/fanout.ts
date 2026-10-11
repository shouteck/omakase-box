import { JobSchema, PROFILE, DEFAULT_LIMITS } from '../../../packages/runner-protocol/index.js';
import type { Job } from '../../../packages/runner-protocol/index.js';
import type { buildAttemptDescriptor } from '../../../packages/evaluation/composition/descriptor.js';

type Descriptor = ReturnType<typeof buildAttemptDescriptor>;

export class FanoutRejected extends Error {
  constructor(readonly code: string) { super(`Composed fan-out rejected: ${code}.`); }
}

/**
 * Materialize the bounded child Job records for one authorized attempt.
 * Every job shares the attempt's package/submission binding and exactly one
 * unit's artifact scope; jobIds are descriptor-derived (deterministic), so a
 * replayed fan-out yields the identical job set — the attempt is still one
 * spend. `harnessDigests` pins the trusted harness image per harness id.
 */
export function buildChildJobs(descriptor: Descriptor, harnessDigests: Readonly<Record<string, string>>, deadline: number): readonly Job[] {
  if (!Number.isInteger(deadline) || deadline <= Date.now()) throw new FanoutRejected('deadline_elapsed');
  const jobs = descriptor.children.map(child => {
    const harnessDigest = harnessDigests[child.harnessId];
    if (typeof harnessDigest !== 'string' || !/^[a-f0-9]{64}$/.test(harnessDigest)) throw new FanoutRejected('harness_digest_missing');
    const parsed = JobSchema.safeParse({
      protocolVersion: 1,
      jobId: child.jobId,
      attemptId: descriptor.attemptId,
      jobKind: descriptor.jobKind,
      profile: PROFILE,
      packageHash: descriptor.packageHash,
      submissionHash: descriptor.submissionHash,
      artifactHash: child.artifactHash,
      imageDigest: child.imageDigest,
      harnessId: child.harnessId,
      harnessDigest,
      requiredCheckIds: child.requiredCheckIds,
      deadline,
      limits: DEFAULT_LIMITS,
    });
    if (!parsed.success) throw new FanoutRejected('job_invalid');
    return parsed.data;
  });
  return Object.freeze(jobs);
}
