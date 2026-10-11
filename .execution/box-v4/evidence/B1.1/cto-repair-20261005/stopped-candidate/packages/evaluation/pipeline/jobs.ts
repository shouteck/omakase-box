import { createHash } from 'node:crypto';
import { canonical, trustedHarness } from '../../runner-protocol/index.js';
import type { buildAttemptDescriptor } from '../composition/descriptor.js';

/**
 * Frozen evaluation-job planning (M7.1). Each evaluation yields exactly one
 * public and one private DB-level job row; the row's artifactHash binds the
 * composed attempt descriptor (which itself binds every unit artifact, image,
 * interface and check digest), so the frozen set cannot drift after planning.
 * jobIds are deterministic — replaying planning yields the identical pair.
 */

type Descriptor = ReturnType<typeof buildAttemptDescriptor>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const JOB_HARNESS = 'composed/v1' as const;

export class PlanRejected extends Error {
  constructor(readonly code: string) { super(`Evaluation job plan rejected: ${code}.`); }
}

export interface FrozenJob {
  readonly jobId: string;
  readonly jobKind: 'public' | 'private';
  readonly artifactHash: string;
  readonly imageDigest: string;
  readonly harnessId: typeof JOB_HARNESS;
  readonly harnessDigest: string;
  readonly requiredCheckIds: readonly string[];
  readonly deadlineMs: number;
}

export interface EvaluationJobPlan {
  readonly evaluationId: string;
  readonly attemptId: string;
  readonly jobs: readonly [FrozenJob, FrozenJob];
}

export interface PlanInput {
  readonly evaluationId: string;
  readonly permitId: string;
  readonly attemptId: string;
  readonly taskId: string;
  readonly taskVersion: number;
  readonly submissionId: string;
  readonly submissionHash: string;
  readonly packageHash: string;
  readonly privateBaseRevision: string;
  readonly publicDescriptor: Descriptor;
  readonly privateDescriptor: Descriptor;
  readonly deadlineMs: number;
}

function derivedJobId(evaluationId: string, jobKind: string): string {
  const hex = createHash('sha256').update(canonical({ evaluationId, jobKind, scope: 'evaluation_job' })).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function validateDescriptor(descriptor: Descriptor, input: PlanInput, jobKind: 'public' | 'private'): void {
  if (descriptor.jobKind !== jobKind) throw new PlanRejected('descriptor_kind_mismatch');
  if (descriptor.attemptId !== input.attemptId || descriptor.taskId !== input.taskId || descriptor.taskVersion !== input.taskVersion) throw new PlanRejected('binding_mismatch');
  if (descriptor.packageHash !== input.packageHash || descriptor.submissionHash !== input.submissionHash) throw new PlanRejected('binding_mismatch');
}

/** Freeze the public/private job pair for one evaluation. Pure and deterministic. */
export function planEvaluationJobs(input: PlanInput): EvaluationJobPlan {
  for (const field of ['evaluationId', 'permitId', 'attemptId', 'taskId', 'submissionId'] as const) {
    if (typeof input[field] !== 'string' || !UUID.test(input[field] as string)) throw new PlanRejected('invalid_plan');
  }
  if (!Number.isInteger(input.taskVersion) || input.taskVersion < 1) throw new PlanRejected('invalid_plan');
  for (const field of ['submissionHash', 'packageHash', 'privateBaseRevision'] as const) {
    if (typeof input[field] !== 'string' || !HASH.test(input[field] as string)) throw new PlanRejected('invalid_plan');
  }
  if (!Number.isInteger(input.deadlineMs) || input.deadlineMs < 1 || input.deadlineMs > 9223372036854775807) throw new PlanRejected('invalid_deadline');
  if (input.publicDescriptor.descriptorDigest === input.privateDescriptor.descriptorDigest) throw new PlanRejected('identical_descriptors');
  validateDescriptor(input.publicDescriptor, input, 'public');
  validateDescriptor(input.privateDescriptor, input, 'private');

  const jobs = (['public', 'private'] as const).map(jobKind => {
    const descriptor = jobKind === 'public' ? input.publicDescriptor : input.privateDescriptor;
    const checkIds = [...new Set(descriptor.children.flatMap(child => child.requiredCheckIds))].sort();
    if (checkIds.length === 0 || checkIds.length > 1024) throw new PlanRejected('check_set_unbounded');
    const endToEnd = descriptor.children.find(child => child.scope === 'end_to_end');
    return Object.freeze({
      jobId: derivedJobId(input.evaluationId, jobKind),
      jobKind,
      artifactHash: descriptor.descriptorDigest,
      imageDigest: (endToEnd ?? descriptor.children[0]!).imageDigest,
      harnessId: JOB_HARNESS,
      harnessDigest: trustedHarness(JOB_HARNESS).digest,
      requiredCheckIds: Object.freeze(checkIds),
      deadlineMs: input.deadlineMs,
    });
  });
  return Object.freeze({ evaluationId: input.evaluationId, attemptId: input.attemptId, jobs: Object.freeze(jobs) as readonly [FrozenJob, FrozenJob] });
}
