import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  aggregateAuthoritativeOutcome,
  anomalyEvidence,
  buildInternalEvaluationResult,
  EvaluationNotPassedError,
  infrastructureEvidence,
  LOG_BYTE_LIMIT,
  projectPublicFeedback,
  verifiedResultEvidence
} from '../../../packages/evaluation/runner-results/index.js';
import type { EvaluationState, JobBinding, JobKind } from '../../../packages/evaluation/runner-results/index.js';
import { PublicFeedbackSchema } from '../../../packages/contracts/public/index.js';
import { InternalEvaluationResultSchema } from '../../../packages/contracts/private/index.js';
import { byteHash } from '../../../packages/contracts/hash.js';
import { trustedHarness } from '../../../packages/runner-protocol/index.js';
import { EvaluationJobStore } from '../../../services/private-api/jobs/store.js';
import { JobInvalid, JobBindingConflict, projectJobError } from '../../../services/private-api/jobs/types.js';
import { WorkflowError } from '../../../packages/contracts/workflow/index.js';
import type { SessionActor } from '../../../packages/contracts/auth/store.js';
import type { Pool as PgPool } from '../../../services/private-api/node_modules/@types/pg/index.js';

const PRIVATE_LOG_TEXT = 'confidential private integration log content with an internal path and synthetic score details';

function binding(kind: JobKind, overrides: Partial<JobBinding> = {}): JobBinding {
  return {
    jobId: '0d1f2b3c-4a5e-4c11-9c21-' + `${kind === 'public' ? 'aaaa' : 'bbbb'}`.padEnd(12, '0'),
    jobKind: kind,
    packageHash: 'aa'.repeat(32),
    submissionHash: 'bb'.repeat(32),
    artifactHash: kind === 'public' ? 'cc'.repeat(32) : 'cd'.repeat(32),
    imageDigest: 'sha256:' + 'dd'.repeat(32),
    harnessId: 'pure-module/v1',
    harnessDigest: trustedHarness('pure-module/v1').digest,
    revision: { taskId: '33333333-3333-4333-8333-333333333333', taskVersion: 1, privateBaseRevision: 'ee'.repeat(32) },
    ...overrides
  };
}

function passingRecord(jobBinding: JobBinding) {
  return verifiedResultEvidence(jobBinding, {
    jobId: jobBinding.jobId, jobKind: jobBinding.jobKind, packageHash: jobBinding.packageHash, submissionHash: jobBinding.submissionHash,
    artifactHash: jobBinding.artifactHash, imageDigest: jobBinding.imageDigest, harnessId: jobBinding.harnessId, harnessDigest: jobBinding.harnessDigest,
    outcome: 'passed', checks: [{ checkId: jobBinding.jobKind === 'public' ? 'public_check' : 'private_progress_check', outcome: 'passed' }],
    logDigest: 'ff'.repeat(32)
  });
}

describe('public projections never carry private evaluation data', () => {
  it('private-only evidence produces zero public check details in every vocabulary category', () => {
    const states: EvaluationState[] = ['received', 'public_evaluating', 'private_evaluating', 'owner_review', 'accepted', 'changes_required', 'package_defect', 'infrastructure_failure', 'expired'];
    for (const state of states) {
      const feedback = projectPublicFeedback({
        publicId: '55555555-5555-4555-8555-555555555555', releasePolicyVersion: 1, evaluationState: state,
        evidence: [passingRecord(binding('private')), anomalyEvidence(binding('private'), 'replayed_result', null, 'aa'.repeat(32)), infrastructureEvidence(binding('private'), 'timeout', null)]
      });
      expect(PublicFeedbackSchema.safeParse(feedback).success).toBe(true);
      expect(feedback.publicCheckDetails).toEqual([]);
      const serialized = JSON.stringify(feedback);
      expect(serialized).not.toContain('cd'.repeat(32));
      expect(serialized).not.toContain('private_progress_check');
      expect(serialized).not.toContain('replayed_result');
      expect(serialized).not.toContain('timeout');
    }
  });

  it('mixed evidence projects only public check outcomes and bounded message codes', () => {
    const publicRecord = passingRecord(binding('public'));
    const privateRecord = passingRecord(binding('private'));
    const feedback = projectPublicFeedback({ publicId: '55555555-5555-4555-8555-555555555555', releasePolicyVersion: 1, evaluationState: 'owner_review', evidence: [publicRecord, privateRecord] });
    expect(feedback.publicCheckDetails.map(detail => detail.checkId)).toEqual(['public_check']);
    expect(feedback.publicCheckDetails.map(detail => detail.jobKind)).toEqual(['public']);
    expect(feedback.publicCheckDetails.map(detail => detail.messageCode)).toEqual(['passed']);
    expect(JSON.stringify(feedback)).not.toContain('private_progress_check');
  });

  it('rejects categories outside the approved bounded vocabulary and invalid ids', () => {
    expect(() => projectPublicFeedback({ publicId: '55555555-5555-4555-8555-555555555555', releasePolicyVersion: 1, evaluationState: 'forged_state' as EvaluationState, evidence: [] })).toThrow();
    expect(() => projectPublicFeedback({ publicId: 'not-a-uuid', releasePolicyVersion: 1, evaluationState: 'accepted', evidence: [] })).toThrow();
    expect(() => projectPublicFeedback({ publicId: '55555555-5555-4555-8555-555555555555', releasePolicyVersion: 0, evaluationState: 'accepted', evidence: [] })).toThrow();
  });

  it('public details never include raw log bytes, scores or cause strings', () => {
    const feedback = projectPublicFeedback({
      publicId: '55555555-5555-4555-8555-555555555555', releasePolicyVersion: 1, evaluationState: 'infrastructure_failure',
      evidence: [
        passingRecord(binding('public')),
        infrastructureEvidence(binding('public'), 'interrupted', 'ee'.repeat(32)),
        anomalyEvidence(binding('public'), 'unauthenticated_result', null, '9a'.repeat(32))
      ]
    });
    expect(feedback.publicCheckDetails.map(detail => detail.checkId)).toEqual(['public_check']);
    expect(JSON.stringify(feedback)).not.toContain('unauthenticated_result');
    expect(JSON.stringify(feedback)).not.toContain(PRIVATE_LOG_TEXT);
  });
});

describe('public results cannot satisfy private requirements and vice versa', () => {
  it('aggregate passing requires verified passed coverage from both kinds', () => {
    const publicPass = passingRecord(binding('public'));
    const privatePass = passingRecord(binding('private'));
    expect(aggregateAuthoritativeOutcome([publicPass]).outcome).not.toBe('passed');
    expect(aggregateAuthoritativeOutcome([privatePass]).outcome).not.toBe('passed');
    expect(aggregateAuthoritativeOutcome([publicPass, privatePass]).outcome).toBe('passed');
    const forgedCoverage = [publicPass].map(record => ({ ...record, jobKind: 'private' as const }));
    const forgedOutcome = aggregateAuthoritativeOutcome(forgedCoverage as never);
    expect(forgedOutcome.coverage.public).toBe(0);
    expect(forgedOutcome.outcome).not.toBe('passed');
  });

  it('internal evaluation results require every attribution field to bind evaluated bytes', () => {
    const result = buildInternalEvaluationResult(
      { evaluationId: '66666666-6666-4666-8666-666666666666', attemptId: '77777777-7777-4777-8777-777777777777', submissionHash: 'bb'.repeat(32), packageHash: 'aa'.repeat(32), privateBaseRevision: 'ee'.repeat(32) },
      [passingRecord(binding('public')), passingRecord(binding('private'))],
      Buffer.from(PRIVATE_LOG_TEXT, 'utf8')
    );
    expect(InternalEvaluationResultSchema.safeParse(result).success).toBe(true);
    for (const entry of result.evidence) {
      expect(entry.jobId).toBeTruthy();
      expect(entry.artifactHash).toMatch(/^[a-f0-9]{64}$/);
      expect(entry.harnessDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(entry.outcome).toBe('passed');
    }
    expect(result.privateLogs).toBe(PRIVATE_LOG_TEXT);
    expect(result.privateLogs.length).toBeLessThanOrEqual(LOG_BYTE_LIMIT);
  });

  it('refuses internal results without complete coverage and never invents passing authority', () => {
    expect(() => buildInternalEvaluationResult(
      { evaluationId: '66666666-6666-4666-8666-666666666666', attemptId: '77777777-7777-4777-8777-777777777777', submissionHash: 'bb'.repeat(32), packageHash: 'aa'.repeat(32), privateBaseRevision: 'ee'.repeat(32) },
      [passingRecord(binding('public'))],
      Buffer.alloc(0)
    )).toThrow(EvaluationNotPassedError);
    expect(() => buildInternalEvaluationResult(
      { evaluationId: '66666666-6666-4666-8666-666666666666', attemptId: '77777777-7777-4777-8777-777777777777', submissionHash: 'bb'.repeat(32), packageHash: 'aa'.repeat(32), privateBaseRevision: 'ee'.repeat(32) },
      [anomalyEvidence(binding('private'), 'late_result', null, '8a'.repeat(32))],
      Buffer.alloc(0)
    )).toThrow(EvaluationNotPassedError);
  });
});

describe('job read projections and safe errors', () => {
  const operator: SessionActor = { id: '88888888-8884-4888-8888-888888888888', role: 'operator', sessionHash: 'aa'.repeat(32), csrfHash: 'bb'.repeat(32) };
  const requester: SessionActor = { id: '99999999-9994-4999-9999-999999999999', role: 'requester', sessionHash: 'cc'.repeat(32), csrfHash: 'dd'.repeat(32) };

  function fakePool(role: 'owner' | 'operator' | 'requester') {
    const client = {
      async query(sql: string) {
        if (/private_accounts AS account/.test(sql)) return { rows: [{ role }], rowCount: 1 };
        if (/FROM private_evaluation_jobs WHERE id=\$1/.test(sql)) {
          const jobBinding = binding('private');
          const deadline = Date.now() + 60000;
          return {
            rows: [{
              id: '0d1f2b3c-4a5e-4c11-9c21-bbbbbbbbbbb0', evaluation_id: 'aaaa1111-1111-4111-8111-111111111111', evaluation_version: 1, permit_id: 'bbbb2222-2222-4222-8222-222222222222',
              attempt_id: '77777777-7777-4777-8777-777777777777', submission_id: 'cccc3333-3333-4333-8333-333333333333',
              task_id: jobBinding.revision.taskId, task_version: 1, job_kind: 'private', profile: 'dedicated-linux-kvm-fresh-vm',
              job_state: 'completed', version: 2,
              submission_hash: 'bb'.repeat(32), package_hash: 'aa'.repeat(32), private_base_revision: 'ee'.repeat(32),
              artifact_hash: 'cd'.repeat(32), image_digest: 'sha256:' + 'dd'.repeat(32), harness_id: 'pure-module/v1', harness_digest: trustedHarness('pure-module/v1').digest,
              required_check_ids: ['private_progress_check'], deadline_ms: deadline.toString(),
              lease_id: 'eeee4444-4444-4444-8444-444444444444', lease_profile: 'dedicated-linux-kvm-fresh-vm', lease_baseline_digest: 'ef'.repeat(32), lease_bound_at: new Date(),
              authoritative_log_digest: byteHash(Buffer.from(PRIVATE_LOG_TEXT)), authoritative_class: 'verified',
              authoritative_outcome: 'passed', authoritative_cause: 'runner_result', authoritative_result_sequence: 1,
              created_at: new Date(), ended_at: new Date()
            }],
            rowCount: 1
          };
        }
        if (/private_evaluation_job_logs/.test(sql)) return { rows: [{ log_digest: byteHash(Buffer.from(PRIVATE_LOG_TEXT)), byte_count: Buffer.byteLength(PRIVATE_LOG_TEXT), original_byte_count: Buffer.byteLength(PRIVATE_LOG_TEXT), complete: true, bytes: Buffer.from(PRIVATE_LOG_TEXT) }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      },
      release() { }
    };
    return { pool: { connect: async () => client, release: undefined } as unknown as Partial<PgPool> & { connect(): Promise<unknown> } };
  }

  it('read never exposes raw private log bytes; only a bounded digest appears', async () => {
    const fake = fakePool('operator');
    const store = new EvaluationJobStore(fake.pool as PgPool);
    const read = await store.read(operator, '0d1f2b3c-4a5e-4c11-9c21-bbbbbbbbbbb0');
    const serialized = JSON.stringify(read);
    expect(serialized).not.toContain(PRIVATE_LOG_TEXT);
    expect(read.authoritative?.logDigest).toBe(byteHash(Buffer.from(PRIVATE_LOG_TEXT)));
  });

  it('readLogs is operator-only and never reaches a requester', async () => {
    const deniedStore = new EvaluationJobStore(fakePool('requester').pool as PgPool);
    await expect(deniedStore.readLogs(requester, '0d1f2b3c-4a5e-4c11-9c21-bbbbbbbbbbb0')).rejects.toBeInstanceOf(WorkflowError);
    const allowedStore = new EvaluationJobStore(fakePool('operator').pool as PgPool);
    const logs = await allowedStore.readLogs(operator, '0d1f2b3c-4a5e-4c11-9c21-bbbbbbbbbbb0');
    expect(logs.complete).toBe(true);
    expect(logs.bytes.toString('utf8')).toBe(PRIVATE_LOG_TEXT);
  });

  it('projected job errors use fixed safe messages and never leak internal details', () => {
    expect(projectJobError(new WorkflowError('forbidden_role'))).toEqual({ status: 403, error: 'forbidden_role' });
    expect(projectJobError(new WorkflowError('stale_version'))).toEqual({ status: 409, error: 'stale_version' });
    expect(projectJobError(new WorkflowError('missing_evidence'))).toEqual({ status: 422, error: 'missing_evidence' });
    expect(projectJobError(new JobInvalid('image_authority_mismatch'))).toEqual({ status: 422, error: 'invalid_job_input' });
    expect(projectJobError(new JobBindingConflict())).toEqual({ status: 409, error: 'job_binding_conflict' });
    expect(projectJobError(new Error('secret internal database detail'))).toEqual({ status: 503, error: 'resource_unavailable' });
  });
});

describe('source-level layering', () => {
  const baseDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const directories: string[] = [];

  async function specifiersOf(relativeSource: string): Promise<string[]> {
    const path = join(baseDir, relativeSource);
    const source = await readFile(path, 'utf8');
    const script = `import { importSpecifiers } from 'file:///C:/Users/shout/Desktop/Projects/private-task-mvp/scripts/boundaries.mjs'; import { readFileSync } from 'node:fs'; const path = process.argv[2]; console.log(JSON.stringify(importSpecifiers(readFileSync(path, 'utf8'))));`;
    const directory = await mkdtemp(join(tmpdir(), 'output-boundary-probe-'));
    directories.push(directory);
    const scriptPath = join(directory, 'probe.mjs');
    await writeFile(scriptPath, script);
    const output = execFileSync(process.execPath, [scriptPath, path], { encoding: 'utf8', stdio: 'pipe' });
    return JSON.parse(output) as string[];
  }

  afterAll(async () => {
    await Promise.all(directories.map(directory => rm(directory, { recursive: true, force: true })));
  });

  it('runner-results never imports private service internals; only contracts modules', async () => {
    const specifiers = await specifiersOf('packages/evaluation/runner-results/index.ts');
    expect(specifiers.length).toBeGreaterThan(0);
    for (const specifier of specifiers) {
      expect(specifier.startsWith('../../contracts/')).toBe(true);
      expect(/private-api|services\//.test(specifier)).toBe(false);
    }
  });

  it('the job store pulls only its own modules, the published protocol and the evaluation result classes', async () => {
    const specifiers = await specifiersOf('services/private-api/jobs/store.ts');
    expect(specifiers.length).toBeGreaterThan(0);
    for (const specifier of specifiers) {
      expect(['node:crypto', 'pg', 'zod',
        '../../../packages/contracts/hash.js', '../../../packages/contracts/common.js',
        '../../../packages/contracts/workflow/index.js', '../../../packages/contracts/auth/store.js',
        '../../../packages/runner-protocol/index.js', '../../../packages/evaluation/runner-results/index.js',
        './types.js', './ddl.js']).toContain(specifier);
    }
  });
});
