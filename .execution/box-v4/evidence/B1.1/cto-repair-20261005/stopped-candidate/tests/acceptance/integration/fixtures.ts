import { randomUUID } from 'node:crypto';
import { buildAttemptDescriptor } from '../../../packages/evaluation/composition/descriptor.js';
import { verifiedResultEvidence, infrastructureEvidence } from '../../../packages/evaluation/runner-results/index.js';
import type { EvidenceRecord, JobBinding, ResultRecord } from '../../../packages/evaluation/runner-results/index.js';
import type { FrozenJob } from '../../../packages/evaluation/pipeline/jobs.js';

const hex = (seed: number) => seed.toString(16).padStart(64, '0').slice(0, 64);
const image = (seed: number) => `sha256:${hex(seed)}`;
export const DIGESTS = {
  package: hex(1), submission: hex(2), base: hex(3), patch: hex(4), harness: hex(5), log: hex(6), payload: hex(7),
};

export const IDS = {
  evaluationId: randomUUID(), permitId: randomUUID(), attemptId: randomUUID(),
  taskId: randomUUID(), submissionId: randomUUID(),
};

const LIMITS = { cpus: 2, memoryMiB: 512, pids: 128, seconds: 120, logBytes: 1048576, writableMiB: 256 } as const;

export function descriptor(jobKind: 'public' | 'private', seed = 0) {
  return buildAttemptDescriptor({
    attemptId: IDS.attemptId, taskId: IDS.taskId, taskVersion: 1,
    packageHash: DIGESTS.package, submissionHash: DIGESTS.submission, jobKind,
    units: [
      { unitId: 'selection_ui', adapterKind: 'frontend_component', artifactHash: hex(10 + seed), imageDigest: image(10 + seed), checkIds: ['selection_ui_check'] },
      { unitId: 'selection_api', adapterKind: 'backend_api', artifactHash: hex(20 + seed), imageDigest: image(20 + seed), checkIds: ['selection_api_check', 'selection_http_check'] },
    ],
    interfaces: [{ interfaceId: 'selection_http', schemaHash: hex(30 + seed), producerUnitId: 'selection_api', consumerUnitId: 'selection_ui' }],
    endToEndCheckIds: ['selection_journey_check'],
    limits: LIMITS,
  });
}

export function bindingFor(job: FrozenJob): JobBinding {
  return {
    jobId: job.jobId, jobKind: job.jobKind, packageHash: DIGESTS.package, submissionHash: DIGESTS.submission,
    artifactHash: job.artifactHash, imageDigest: job.imageDigest, harnessId: job.harnessId, harnessDigest: job.harnessDigest,
    revision: { taskId: IDS.taskId, taskVersion: 1, privateBaseRevision: DIGESTS.base },
  };
}

export function passedEvidence(job: FrozenJob, checkIds?: readonly string[]): EvidenceRecord {
  const ids = checkIds ?? job.requiredCheckIds;
  const record: ResultRecord = {
    jobId: job.jobId, jobKind: job.jobKind, packageHash: DIGESTS.package, submissionHash: DIGESTS.submission,
    artifactHash: job.artifactHash, imageDigest: job.imageDigest, harnessId: job.harnessId, harnessDigest: job.harnessDigest,
    outcome: 'passed', checks: ids.map(checkId => ({ checkId, outcome: 'passed' as const })), logDigest: DIGESTS.log,
  };
  return verifiedResultEvidence(bindingFor(job), record);
}

export function failedEvidence(job: FrozenJob, checkId = job.requiredCheckIds[0]!): EvidenceRecord {
  const record: ResultRecord = {
    jobId: job.jobId, jobKind: job.jobKind, packageHash: DIGESTS.package, submissionHash: DIGESTS.submission,
    artifactHash: job.artifactHash, imageDigest: job.imageDigest, harnessId: job.harnessId, harnessDigest: job.harnessDigest,
    outcome: 'failed', checks: job.requiredCheckIds.map(id => ({ checkId: id, outcome: id === checkId ? 'failed' as const : 'passed' as const })), logDigest: DIGESTS.log,
  };
  return verifiedResultEvidence(bindingFor(job), record);
}

export function infraEvidence(job: FrozenJob): EvidenceRecord {
  return infrastructureEvidence(bindingFor(job), 'runner_unavailable', DIGESTS.log);
}
