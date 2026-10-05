import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  aggregateAuthoritativeOutcome,
  anomalyEvidence,
  buildInternalEvaluationResult,
  EvaluationNotPassedError,
  EvidenceClassificationError,
  infrastructureEvidence,
  LOG_BYTE_LIMIT,
  projectPublicFeedback,
  trimCapture,
  verifiedResultEvidence,
  verifyEvidenceBinding
} from '../../../packages/evaluation/runner-results/index.js';
import type { AnomalyCause, EvidenceRecord, EvaluationState, InfrastructureCause, JobBinding, JobKind } from '../../../packages/evaluation/runner-results/index.js';
import { InternalEvaluationResultSchema } from '../../../packages/contracts/private/index.js';
import { PublicFeedbackSchema } from '../../../packages/contracts/public/index.js';
import { byteHash } from '../../../packages/contracts/hash.js';
import { trustedHarness, signTrustedResult, verifyTrustedResult } from '../../../packages/runner-protocol/index.js';

const TRUSTED_HARNESS_DIGEST = trustedHarness('pure-module/v1').digest;
const PUBLIC_ID = randomUUID();
const ATTEMPT_ID = randomUUID();
const EVALUATION_ID = randomUUID();

function hash64(prefix: 'aa' | 'bb' | 'cc' | 'cd' | 'dd' | 'ee' | 'a0' | '9c' | '98' | 'ff'): string {
  return prefix.repeat(32);
}

function binding(seed: { jobId?: string; jobKind?: JobKind; artifactHash?: string } = {}, kind: JobKind = 'public'): JobBinding {
  return {
    jobId: seed.jobId ?? randomUUID(),
    jobKind: seed.jobKind ?? kind,
    packageHash: hash64('aa'),
    submissionHash: hash64('bb'),
    artifactHash: seed.artifactHash ?? hash64('cc'),
    imageDigest: 'sha256:' + hash64('dd'),
    harnessId: 'pure-module/v1',
    harnessDigest: TRUSTED_HARNESS_DIGEST,
    revision: { taskId: randomUUID(), taskVersion: 1, privateBaseRevision: hash64('ee') }
  };
}

function trustedRecord(bindingValue: JobBinding, options: { outcome?: 'passed' | 'failed' | 'unverified'; checks?: Array<{ checkId: string; outcome: 'passed' | 'failed' | 'unverified' }>; logDigest: string }) {
  return {
    jobId: bindingValue.jobId,
    jobKind: bindingValue.jobKind,
    packageHash: bindingValue.packageHash,
    submissionHash: bindingValue.submissionHash,
    artifactHash: bindingValue.artifactHash,
    imageDigest: bindingValue.imageDigest,
    harnessId: bindingValue.harnessId,
    harnessDigest: bindingValue.harnessDigest,
    outcome: options.outcome ?? 'passed',
    checks: options.checks ?? (options.outcome === 'failed'
      ? [{ checkId: bindingValue.jobKind === 'public' ? 'public_check' : 'private_check', outcome: 'failed' as const }]
      : [{ checkId: bindingValue.jobKind === 'public' ? 'public_check' : 'private_check', outcome: 'passed' as const }]),
    logDigest: options.logDigest
  };
}

const PUBLIC_PASS = () => { const b = binding({}, 'public'); return verifiedResultEvidence(b, trustedRecord(b, { logDigest: hash64('98') })); };
const PRIVATE_PASS = () => { const b = binding({}, 'private'); return verifiedResultEvidence(b, trustedRecord(b, { logDigest: hash64('9c') })); };
const PUBLIC_FAIL = () => { const b = binding({}, 'public'); return verifiedResultEvidence(b, trustedRecord(b, { outcome: 'failed', logDigest: hash64('98') })); };
const PRIVATE_FAIL = () => { const b = binding({}, 'private'); return verifiedResultEvidence(b, trustedRecord(b, { outcome: 'failed', logDigest: hash64('9c') })); };

const UNVERIFIED_CAUSES: readonly AnomalyCause[] = ['unauthenticated_result', 'binding_mismatch', 'stale_result', 'late_result', 'replayed_result', 'malformed_result', 'incomplete_result', 'contradictory_result', 'log_mismatch', 'lease_missing', 'runner_reported_unverified'];
const INFRASTRUCTURE_CAUSES: readonly InfrastructureCause[] = ['timeout', 'interrupted', 'lease_lost', 'runner_unavailable'];

describe('bounded private log capture', () => {
  it('truncates deterministically at exactly the one mebibyte bound and the digest names exactly the stored bytes', () => {
    const oversized = Buffer.concat([Buffer.alloc(64, 1), Buffer.alloc(LOG_BYTE_LIMIT + 999, 7)]);
    const first = trimCapture(oversized);
    const second = trimCapture(oversized);
    expect(first.complete).toBe(false);
    expect(first.originalByteCount).toBe(oversized.byteLength);
    expect(first.bytes.byteLength).toBe(LOG_BYTE_LIMIT);
    expect(Buffer.compare(Buffer.from(first.bytes), Buffer.from(second.bytes))).toBe(0);
    expect(first.digest).toBe(second.digest);
    expect(first.digest).toBe(createHash('sha256').update(Buffer.from(first.bytes)).digest('hex'));
  });

  it('keeps complete captures intact, including empty captures', () => {
    const exact = Buffer.alloc(LOG_BYTE_LIMIT, 3);
    const prepared = trimCapture(exact);
    expect(prepared.complete).toBe(true);
    expect(prepared.originalByteCount).toBe(prepared.bytes.byteLength);
    expect(prepared.digest).toBe(byteHash(exact));
    const empty = trimCapture(new Uint8Array(0));
    expect(empty.complete).toBe(true);
    expect(empty.bytes.byteLength).toBe(0);
    expect(empty.digest).toBe(byteHash(new Uint8Array(0)));
  });
});

describe('no public-only or private-only result can pass', () => {
  it('requires verified passing evidence for both job kinds', () => {
    const publicOnly = aggregateAuthoritativeOutcome([PUBLIC_PASS()]);
    expect(publicOnly.outcome).toBe('unverified');
    expect(publicOnly.outcome).not.toBe('passed');
    expect(publicOnly.coverage.complete).toBe(false);
    const privateOnly = aggregateAuthoritativeOutcome([PRIVATE_PASS()]);
    expect(privateOnly.outcome).toBe('unverified');
    expect(privateOnly.outcome).not.toBe('passed');
    const both = aggregateAuthoritativeOutcome([PUBLIC_PASS(), PRIVATE_PASS()]);
    expect(both.outcome).toBe('passed');
    expect(both.coverage.complete).toBe(true);
  });

  it('classifies verified failures deterministically', () => {
    expect(aggregateAuthoritativeOutcome([PUBLIC_FAIL(), PRIVATE_PASS()]).outcome).toBe('contract_failure');
    expect(aggregateAuthoritativeOutcome([PUBLIC_PASS(), PRIVATE_FAIL()]).outcome).toBe('integration_failure');
    expect(aggregateAuthoritativeOutcome([PUBLIC_FAIL(), PRIVATE_FAIL()]).outcome).toBe('integration_failure');
  });

  it('timeout, interruption and unavailable infrastructure never becomes passed', () => {
    for (const cause of INFRASTRUCTURE_CAUSES) {
      const record = infrastructureEvidence(binding({}, 'public'), cause, null);
      expect(record.evidenceClass).toBe('infrastructure');
      expect(record.outcome).toBe('infrastructure');
      expect(aggregateAuthoritativeOutcome([record, PRIVATE_PASS()]).outcome).toBe('infrastructure_failure');
      expect(aggregateAuthoritativeOutcome([record, PRIVATE_PASS()]).outcome).not.toBe('passed');
    }
  });

  it('corrupt, replayed, late and unverifiable recordings never become passed or acceptance-eligible', () => {
    for (const cause of UNVERIFIED_CAUSES) {
      const record = anomalyEvidence(binding({}, 'public'), cause, null, hash64('ff'));
      expect(record.evidenceClass).toBe('unverified');
      expect(record.outcome).toBe('unverified');
      expect(aggregateAuthoritativeOutcome([record, PRIVATE_PASS()]).outcome).toBe('unverified');
      expect(aggregateAuthoritativeOutcome([record, PRIVATE_PASS()]).outcome).not.toBe('passed');
      expect(aggregateAuthoritativeOutcome([]).outcome).toBe('unverified');
    }
  });

  it('rejects unbounded causes, outcomes and bindings', () => {
    expect(() => infrastructureEvidence(binding({}, 'public'), 'surprise' as InfrastructureCause, null)).toThrow(EvidenceClassificationError);
    expect(() => anomalyEvidence(binding({}, 'public'), 'forged_cause' as AnomalyCause, null, null)).toThrow(EvidenceClassificationError);
    expect(() => verifiedResultEvidence(binding({}, 'public'), { ...trustedRecord(binding({}, 'public'), { logDigest: hash64('98') }), logDigest: 'not-a-digest' })).toThrow(EvidenceClassificationError);
    expect(() => verifiedResultEvidence(binding({}, 'public'), { jobId: 'bad-id' } as unknown as Parameters<typeof verifiedResultEvidence>[1])).toThrow(EvidenceClassificationError);
  });
});

describe('evidence must bind the exact evaluated bytes and revisions', () => {
  it('reports every drifted binding field without silently accepting it', () => {
    const expected = binding({}, 'public');
    const evidence = verifiedResultEvidence(expected, trustedRecord(expected, { logDigest: hash64('98') }));
    expect(verifyEvidenceBinding(evidence, expected)).toEqual([]);
    expect(verifyEvidenceBinding(evidence, { ...expected, artifactHash: hash64('cd') })).toEqual(['artifactHash']);
    expect(verifyEvidenceBinding(evidence, { ...expected, jobKind: 'private' })).toEqual(['jobKind']);
    expect(verifyEvidenceBinding(evidence, { ...expected, revision: { ...expected.revision, taskVersion: 2 } })).toEqual(['revision.taskVersion']);
    expect(verifyEvidenceBinding(evidence, { ...expected, revision: { ...expected.revision, privateBaseRevision: hash64('a0') } })).toEqual(['revision.privateBaseRevision']);
    expect(verifyEvidenceBinding(evidence, { ...expected, packageHash: hash64('aa') })).toEqual([]);
  });

  it('rejects a verified record whose binding mismatches the authoritative job', () => {
    const expected = binding({}, 'public');
    expect(() => verifiedResultEvidence({ ...expected, artifactHash: hash64('cd') }, trustedRecord(expected, { logDigest: hash64('98') }))).toThrow(EvidenceClassificationError);
  });

  it('classifies a real runner-protocol signed and verified result as authoritative evidence', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const jobBinding = binding({}, 'public');
    const job = {
      protocolVersion: 1 as const, jobId: jobBinding.jobId, attemptId: ATTEMPT_ID, jobKind: 'public' as const,
      profile: 'dedicated-linux-kvm-fresh-vm' as const, packageHash: jobBinding.packageHash, submissionHash: jobBinding.submissionHash,
      artifactHash: jobBinding.artifactHash, imageDigest: jobBinding.imageDigest, harnessId: 'pure-module/v1' as const,
      harnessDigest: TRUSTED_HARNESS_DIGEST, requiredCheckIds: ['public.check'], deadline: Date.now() + 60000,
      limits: { cpus: 2, memoryMiB: 512, pids: 128, seconds: 120, logBytes: 1048576, writableMiB: 256 } as const
    };
    const lease = { leaseId: randomUUID(), jobId: job.jobId, baselineDigest: hash64('ff') as string, profile: 'dedicated-linux-kvm-fresh-vm' as const, status: 'fresh' as const };
    const logs = Buffer.from('synthetic trusted runner capture', 'utf8');
    const { attemptId: _attemptId, deadline: _deadline, limits: _limits, requiredCheckIds: _checks, ...boundProperties } = job;
    const result = { ...boundProperties, leaseId: lease.leaseId, outcome: 'passed' as const, checks: [{ checkId: 'public.check', outcome: 'passed' as const }], expiresAt: job.deadline, logDigest: byteHash(logs) };
    const signed = signTrustedResult(result, privateKey.export({ format: 'pem', type: 'pkcs8' }).toString());
    const verified = verifyTrustedResult(signed, job, lease, publicKey.export({ format: 'pem', type: 'spki' }).toString());
    expect(verified.outcome).toBe('passed');
    const evidence = verifiedResultEvidence(jobBinding, verified);
    expect(evidence.evidenceClass).toBe('verified');
    expect(evidence.logDigest).toBe(byteHash(logs));
    expect(verifyEvidenceBinding(evidence, jobBinding)).toEqual([]);
  });
});

describe('evaluation result creation and bounded public feedback', () => {
  it('builds a schema-valid internal result only from a fully passing aggregate binding exact bytes and revisions', () => {
    const publicEvidence = PUBLIC_PASS();
    const privateEvidence = PRIVATE_PASS();
    const logs = Buffer.from('synthetic private integration logs stay private', 'utf8');
    const result = buildInternalEvaluationResult(
      { evaluationId: EVALUATION_ID, attemptId: ATTEMPT_ID, submissionHash: hash64('bb'), packageHash: hash64('aa'), privateBaseRevision: hash64('ee') },
      [publicEvidence, privateEvidence], logs
    );
    expect(InternalEvaluationResultSchema.safeParse(result).success).toBe(true);
    expect(result.outcome).toBe('passed');
    expect(result.privateLogs).toBe(logs.toString('utf8'));
    expect(result.evidence.map(entry => entry.jobKind).sort()).toEqual(['private', 'public']);
    for (const entry of result.evidence) {
      expect(entry.artifactHash).toBe(entry.jobKind === 'public' ? (publicEvidence.binding.artifactHash) : privateEvidence.binding.artifactHash);
      expect(entry.jobId).toBe(entry.jobKind === 'public' ? publicEvidence.jobId : privateEvidence.jobId);
      expect(entry.harnessDigest).toBe(TRUSTED_HARNESS_DIGEST);
      expect(entry.outcome).toBe('passed');
    }
  });

  it('refuses an internal evaluation result for unverified, infrastructure, incomplete or failed aggregates', () => {
    const cases: EvidenceRecord[][] = [
      [PUBLIC_PASS()],
      [anomalyEvidence(binding({}, 'public'), 'unauthenticated_result', null, hash64('ff')), PRIVATE_PASS()],
      [infrastructureEvidence(binding({}, 'public'), 'timeout', null), PRIVATE_PASS()],
      [PUBLIC_FAIL(), PRIVATE_PASS()],
      [PUBLIC_PASS(), PRIVATE_FAIL()],
      [PUBLIC_PASS(), anomalyEvidence(binding({}, 'private'), 'late_result', null, hash64('ff'))],
      []
    ];
    for (const records of cases) {
      expect(() => buildInternalEvaluationResult(
        { evaluationId: EVALUATION_ID, attemptId: ATTEMPT_ID, submissionHash: hash64('bb'), packageHash: hash64('aa'), privateBaseRevision: hash64('ee') },
        records, Buffer.alloc(0)
      )).toThrow(EvaluationNotPassedError);
    }
  });

  it('bounds the private log payload inside the result to one mebibyte', () => {
    const cappedLogs = Buffer.alloc(LOG_BYTE_LIMIT + 1, 9);
    expect(() => buildInternalEvaluationResult(
      { evaluationId: EVALUATION_ID, attemptId: ATTEMPT_ID, submissionHash: hash64('bb'), packageHash: hash64('aa'), privateBaseRevision: hash64('ee') },
      [PUBLIC_PASS(), PRIVATE_PASS()], cappedLogs
    )).toThrow(EvidenceClassificationError);
  });

  it('projects public feedback that never carries private evidence or raw private detail', () => {
    const b = binding({}, 'private');
    const privateEvidence = verifiedResultEvidence(b, trustedRecord(b, { outcome: 'failed', checks: [{ checkId: 'private_internal_check', outcome: 'failed' }], logDigest: hash64('9c') }));
    const feedback = projectPublicFeedback({ publicId: PUBLIC_ID, releasePolicyVersion: 1, evaluationState: 'changes_required', evidence: [privateEvidence] });
    expect(PublicFeedbackSchema.safeParse(feedback).success).toBe(true);
    expect(feedback.category).toBe('changes_required');
    expect(feedback.publicCheckDetails).toEqual([]);
    expect(JSON.stringify(feedback)).not.toContain('private_internal_check');
  });

  it('maps the bounded evaluation state vocabulary to the published categories only', () => {
    const expectations: Array<[EvaluationState, string]> = [
      ['received', 'received'], ['public_evaluating', 'processing'], ['private_evaluating', 'processing'], ['owner_review', 'owner_review'],
      ['accepted', 'accepted'], ['changes_required', 'changes_required'], ['package_defect', 'package_defect'], ['infrastructure_failure', 'infrastructure_issue'], ['expired', 'expired']
    ];
    for (const [state, category] of expectations) {
      const feedback = projectPublicFeedback({ publicId: PUBLIC_ID, releasePolicyVersion: 1, evaluationState: state, evidence: [PUBLIC_PASS()] });
      expect(feedback.category).toBe(category);
      expect(PublicFeedbackSchema.safeParse(feedback).success).toBe(true);
    }
  });

  it('exposes only public check details with bounded message codes, capped at five hundred twelve', () => {
    const b = binding({}, 'public');
    const evidence = [
      verifiedResultEvidence(b, trustedRecord(b, { checks: [{ checkId: 'public_required_two', outcome: 'failed' }], outcome: 'failed', logDigest: hash64('98') })),
      PRIVATE_PASS()
    ];
    const feedback = projectPublicFeedback({ publicId: PUBLIC_ID, releasePolicyVersion: 1, evaluationState: 'changes_required', evidence });
    expect(feedback.publicCheckDetails.map(detail => detail.checkId)).toEqual(['public_required_two']);
    expect(feedback.publicCheckDetails.every(detail => detail.jobKind === 'public')).toBe(true);
    expect(feedback.publicCheckDetails[0]!.messageCode).toBe('requirement_not_met');
    expect(JSON.stringify(feedback).includes('private_check')).toBe(false);
  });

  it('projects infrastructure results as check_unavailable details without private cause strings', () => {
    const feedback = projectPublicFeedback({
      publicId: PUBLIC_ID, releasePolicyVersion: 1, evaluationState: 'infrastructure_failure',
      evidence: [anomalyEvidence(binding({}, 'public'), 'unauthenticated_result', null, hash64('ff'))]
    });
    expect(feedback.category).toBe('infrastructure_issue');
    expect(feedback.publicCheckDetails).toEqual([]);
    expect(JSON.stringify(feedback).includes('unauthenticated_result')).toBe(false);
  });
});
