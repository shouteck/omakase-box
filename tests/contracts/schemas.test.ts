import { describe, expect, it } from 'vitest';
import { ApprovedReleaseManifestSchema, AttemptPermitSchema, PublicFeedbackSchema, SignedReleasedEnvelopeSchema, SubmissionEnvelopeSchema, projectPublicListing } from '../../packages/contracts/public/index.js';
import { EvaluationAttemptSchema, InternalEvaluationResultSchema, InternalIntentSchema, PrivateIntegrationPlanSchema } from '../../packages/contracts/private/index.js';
import { contentHash } from '../../packages/contracts/hash.js';
import { fullStackContract, hash, ids } from './fixtures.js';

const task = fullStackContract(true);
const manifest = { schemaVersion: 1, canonicalizationVersion: 'json-sorted-utf8/v1', taskId: ids.task, version: 1, assets: [{ path: 'src/PlanSelector.tsx', sha256: hash, byteSize: 100, mediaType: 'application/typescript', sourceAssetId: ids.asset }], contractHash: contentHash(task), listingHash: hash, feedbackPolicyHash: hash, paymentTermsHash: contentHash(task.terms), templateHash: hash, executionImageDigest: `sha256:${hash}` };
const signature = 'A'.repeat(86) + '==';
const envelope = { schemaVersion: 1, eventId: ids.event, nonce: ids.asset, expiresAt: '2026-10-02T12:00:00Z', manifest, manifestHash: contentHash(manifest), contract: task, listing: projectPublicListing(task, null), signature };
const submission = { schemaVersion: 1, taskId: ids.task, lineageId: ids.lineage, taskVersion: 1, packageDigest: hash, reservationId: ids.reservation, patch: '--- a/src/PlanSelector.tsx\n+++ b/src/PlanSelector.tsx\n@@ -1 +1 @@\n-old\n+new\n', patchHash: hash, idempotencyKey: ids.submission };
const permit = { schemaVersion: 1, permitId: ids.event, taskId: ids.task, lineageId: ids.lineage, taskVersion: 1, reservationId: ids.reservation, submissionId: ids.submission, packageDigest: hash, submissionHash: hash, sequence: 1, issuedAt: '2026-10-02T12:00:00Z', signature };
const feedback = { schemaVersion: 1, publicId: ids.event, category: 'changes_required', releasePolicyVersion: 1, publicCheckDetails: [{ checkId: 'ui_check', jobKind: 'public', outcome: 'failed', messageCode: 'requirement_not_met' }] };
const reference = { evidenceId: ids.asset, snapshotHash: hash, location: 'synthetic/private/source.ts:1' };
const intent = { schemaVersion: 1, intentId: ids.event, version: 1, goal: 'Choose an available plan using keyboard or pointer.', snapshotHash: hash, state: 'draft', facts: [{ statement: 'The current fixture couples selection to private eligibility.', evidence: [reference], assurance: 'tested' }], evidence: [reference], decisions: [{ id: 'currency', question: 'Which approved display currency?', required: true, answer: null }], assumptions: [{ statement: 'Synthetic options represent the approved examples.', assurance: 'unverified' }], unknowns: ['Display currency is not resolved.'], acceptanceExamples: task.requirements, scope: { included: ['Selection flow'], excluded: ['Private billing'] } };
const plan = { schemaVersion: 1, planId: ids.event, taskId: ids.task, taskVersion: 1, privateRevision: hash, approvedIntentHash: hash, templateVersion: 1, workUnitMappings: [{ unitId: 'ui', publicPath: 'src/PlanSelector.tsx', privateDestinationPath: 'src/selection/PlanSelector.tsx', retainedAdapterPath: 'src/private/eligibility.ts' }], interfaceMappings: [{ interfaceId: 'selection_http', privateAdapterPath: 'src/private/context.ts' }], retainedWork: ['Private eligibility remains private.'], preservationRequirementIds: ['unaffected_route'], privateTraceability: [{ publicRequirementId: 'select_ui', intentRequirementId: 'outcome_selection' }] };
const attempt = { schemaVersion: 1, attemptId: ids.event, permitId: ids.asset, taskId: ids.task, taskVersion: 1, submissionId: ids.submission, submissionHash: hash, packageHash: hash, privateBaseRevision: hash, runnerProfile: 'dedicated-linux-kvm-fresh-vm', imageDigest: `sha256:${hash}`, harnessDigest: hash, state: 'private_evaluating', createdAt: '2026-10-02T12:00:00Z' };
const result = { schemaVersion: 1, evaluationId: ids.event, attemptId: ids.submission, submissionHash: hash, packageHash: hash, privateBaseRevision: hash, outcome: 'unverified', evidence: [{ checkId: 'private_check', jobId: ids.event, jobKind: 'private', artifactHash: hash, harnessDigest: hash, outcome: 'unverified' }], privateLogs: 'synthetic-private-log-canary', limitations: ['No authenticated real VM evidence exists.'] };

const schemas = [
  ['manifest', ApprovedReleaseManifestSchema, manifest], ['envelope', SignedReleasedEnvelopeSchema, envelope],
  ['submission', SubmissionEnvelopeSchema, submission], ['permit', AttemptPermitSchema, permit],
  ['feedback', PublicFeedbackSchema, feedback], ['intent', InternalIntentSchema, intent],
  ['plan', PrivateIntegrationPlanSchema, plan], ['attempt', EvaluationAttemptSchema, attempt],
  ['result', InternalEvaluationResultSchema, result]
] as const;

describe('versioned public/private architecture schemas', () => {
  for (const [name, schema, value] of schemas) {
    it(`validates the synthetic ${name} example`, () => { expect(schema.safeParse(value).success).toBe(true); });
    it(`rejects unknown fields in ${name}`, () => { expect(schema.safeParse({ ...value, injectedAuthority: true }).success).toBe(false); });
  }
  it('rejects colliding approved asset paths and mixed release versions', () => {
    expect(ApprovedReleaseManifestSchema.safeParse({ ...manifest, assets: [...manifest.assets, { ...manifest.assets[0], path: 'SRC/PLANSELECTOR.TSX' }] }).success).toBe(false);
    expect(SignedReleasedEnvelopeSchema.safeParse({ ...envelope, listing: { ...envelope.listing, version: 2 } }).success).toBe(false);
  });
  it('changes the manifest digest when a byte hash, terms or policy binding changes', () => {
    for (const changed of [{ ...manifest, assets: [{ ...manifest.assets[0], sha256: 'b'.repeat(64) }] }, { ...manifest, paymentTermsHash: 'b'.repeat(64) }, { ...manifest, feedbackPolicyHash: 'b'.repeat(64) }]) expect(contentHash(changed)).not.toBe(contentHash(manifest));
  });
  it('rejects actor impersonation, oversized UTF-8 patches and invalid Unicode', () => {
    expect(SubmissionEnvelopeSchema.safeParse({ ...submission, actorId: ids.asset }).success).toBe(false);
    expect(SubmissionEnvelopeSchema.safeParse({ ...submission, patch: 'é'.repeat(524289) }).success).toBe(false);
    expect(SubmissionEnvelopeSchema.safeParse({ ...submission, patch: '\uD800' }).success).toBe(false);
  });
  it('cannot treat an unresolved decision or unreferenced fact as approval', () => {
    expect(InternalIntentSchema.safeParse({ ...intent, state: 'approved' }).success).toBe(false);
    expect(InternalIntentSchema.safeParse({ ...intent, facts: [{ ...intent.facts[0], evidence: [] }] }).success).toBe(false);
    expect(InternalIntentSchema.safeParse({ ...intent, facts: [{ ...intent.facts[0], evidence: [], assurance: 'unverified' }] }).success).toBe(true);
  });
  it('rejects private log/score fields and private-job diagnostics in public feedback', () => {
    expect(PublicFeedbackSchema.safeParse(result).success).toBe(false);
    expect(PublicFeedbackSchema.safeParse({ ...feedback, privateLogs: result.privateLogs }).success).toBe(false);
    expect(PublicFeedbackSchema.safeParse({ ...feedback, publicCheckDetails: [{ ...feedback.publicCheckDetails[0], jobKind: 'private' }] }).success).toBe(false);
    expect(PublicFeedbackSchema.safeParse({ ...feedback, publicCheckDetails: [{ ...feedback.publicCheckDetails[0], rawMessage: result.privateLogs }] }).success).toBe(false);
  });
  it('does not allow unverified evidence to become passed', () => {
    expect(InternalEvaluationResultSchema.safeParse({ ...result, outcome: 'passed' }).success).toBe(false);
    expect(EvaluationAttemptSchema.safeParse({ ...attempt, runnerProfile: 'fake' }).success).toBe(false);
  });
});
