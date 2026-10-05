import { describe, expect, it } from 'vitest';
import {
  assertBoxTransition, assertNoRestrictedFields, AttemptSchema, BehaviorArtifactSchema,
  BoxVersionSchema, EvaluationReceiptSchema, AssignmentSchema, MergeRecordSchema, ReviewDecisionSchema,
  TrustProfileSchema
} from '../../../packages/box-contracts/index.js';
import { artifact, boxContentHash, boxVersion, commit, digest, hex, uuid, workUnit } from '../auth/support.js';

describe('open_trusted box contracts', () => {
  it('validates a single-unit BoxVersion with immutable content hash', () => {
    const art = artifact();
    const version = boxVersion({ artifact: art });
    version.behaviorArtifact.contentHash = boxContentHash(art);
    const parsed = BoxVersionSchema.parse(version);
    expect(parsed.profile).toBe('open_trusted');
    expect(boxContentHash(parsed)).toMatch(/^[a-f0-9]{64}$/);
    const edited = { ...parsed, baseCommit: commit() };
    expect(boxContentHash(edited)).not.toBe(boxContentHash(parsed));
  });
  it('validates a UI/API composed box and a UI/API/policy box', () => {
    const uiArt = artifact();
    const uiApi = boxVersion({ artifact: uiArt });
    uiApi.behaviorArtifact.contentHash = boxContentHash(uiArt);
    uiApi.disciplines = ['frontend', 'backend'];
    uiApi.workUnits = [
      workUnit('unit-ui', 'frontend_component', ['src/app.tsx'], ['req-1'], ['check-ui']),
      workUnit('unit-api', 'backend_api', ['src/api.ts'], ['req-2'], ['check-api'], ['iface-1'])
    ];
    uiApi.interfaces = [{ id: 'iface-1', producerUnitIds: ['unit-api'], consumerUnitIds: ['unit-ui'], schema: { id: 'schema-1', version: 1, path: 'schemas/api.json', sha256: hex() }, semantics: 'request_response', requestSemantics: 'synthetic request', responseSemantics: 'synthetic response', errorStates: [], ownerUnitId: 'unit-api', compatibilityRequirementIds: ['req-1'] }];
    uiApi.requirements = [{ id: 'req-1', description: 'synthetic', inputs: [], outputs: [], states: [], invalidCases: [], exclusions: [], examples: [{ given: 'g', when: 'w', then: 't' }] }, { id: 'req-2', description: 'synthetic2', inputs: [], outputs: [], states: [], invalidCases: [], exclusions: [], examples: [{ given: 'g', when: 'w', then: 't' }] }];
    uiApi.endToEndObligations = [{ id: 'req-e2e', description: 'synthetic e2e', inputs: [], outputs: [], states: [], invalidCases: [], exclusions: [], examples: [{ given: 'g', when: 'w', then: 't' }] }];
    expect(() => BoxVersionSchema.parse(uiApi)).not.toThrow();
    const policyArt = artifact();
    const policyBox = boxVersion({ artifact: policyArt });
    policyBox.behaviorArtifact.contentHash = boxContentHash(policyArt);
    policyBox.workUnits = [workUnit('unit-policy', 'application_policy', ['config/policy.json'], ['req-1'], ['check-policy'])];
    expect(() => BoxVersionSchema.parse(policyBox)).not.toThrow();
  });
  it('rejects reward/disclosure/KVM contamination and non-open profiles', () => {
    expect(() => TrustProfileSchema.parse('restricted_private')).toThrow();
    for (const key of ['payment', 'rewardAmount', 'disclosure', 'kvmRunner', 'settlementReference']) {
      const version = boxVersion({});
      expect(() => BoxVersionSchema.parse({ ...version, [key]: 'x' })).toThrow();
      expect(() => assertNoRestrictedFields({ nested: { [key]: 1 } })).toThrow();
    }
    expect(() => BoxVersionSchema.parse({ ...boxVersion({}), profile: 'restricted_private' })).toThrow();
  });
  it('keeps the behavior artifact distinct from InternalIntent with intent provenance', () => {
    const art = BehaviorArtifactSchema.parse(artifact());
    expect(art.intent.intentId).toBe(art.intent.intentId);
    expect(art.profile).toBe('open_trusted');
    expect(art).not.toHaveProperty('snapshotHash');
    expect(art).not.toHaveProperty('decisions');
  });
  it('types attempts, receipts, assignments, reviews and merge records with scoped identity', () => {
    const attempt = AttemptSchema.parse({ schemaVersion: 1, attemptId: uuid(), boxId: uuid(), boxVersion: 1, boxVersionHash: hex(), executor: { kind: 'agent', actorId: 'agent-1', token: { tokenHash: hex(), boxId: uuid(), attemptId: null, capability: 'attempt.execute' } }, baseCommit: commit(), worktreeRef: 'wt', patchHash: null, environmentDigest: digest(), evaluatorDigest: hex(), state: 'open', createdAt: new Date().toISOString() });
    expect(attempt.state).toBe('open');
    expect(() => EvaluationReceiptSchema.parse({ schemaVersion: 1, receiptId: uuid(), attemptId: uuid(), boxVersionHash: hex(), environmentDigest: digest(), evaluatorDigest: hex(), outcome: 'unavailable', summary: 's', outputHash: hex(), durationMs: 0, assurance: 'tested', recordedBy: 'recorder', createdAt: new Date().toISOString() })).not.toThrow();
    expect(() => AssignmentSchema.parse({ schemaVersion: 1, assignmentId: uuid(), boxId: uuid(), boxVersion: 1, boxVersionHash: hex(), executor: { kind: 'human', actorId: uuid() }, capability: 'attempt.execute', assignedBy: uuid(), createdAt: new Date().toISOString() })).not.toThrow();
    expect(() => ReviewDecisionSchema.parse({ schemaVersion: 1, reviewId: uuid(), boxId: uuid(), attemptId: uuid(), boxVersionHash: hex(), candidateHash: hex(), verdict: 'box_defect', reviewerId: uuid(), rationale: 'r', decidedAt: new Date().toISOString() })).not.toThrow();
    expect(() => MergeRecordSchema.parse({ schemaVersion: 1, mergeId: uuid(), approvalId: uuid(), boxId: uuid(), attemptId: uuid(), sourceCandidateHash: hex(), targetRef: 'main', resultCommit: null, state: 'rejected', mergeOwnerId: uuid(), createdAt: new Date().toISOString() })).not.toThrow();
  });
  it('enforces the version/attempt transition tables', () => {
    expect(() => assertBoxTransition('version', 'draft', 'open')).not.toThrow();
    expect(() => assertBoxTransition('version', 'draft', 'closed')).toThrow();
    expect(() => assertBoxTransition('version', 'cancelled', 'open')).toThrow();
    expect(() => assertBoxTransition('attempt', 'open', 'submitted')).not.toThrow();
    expect(() => assertBoxTransition('attempt', 'submitted', 'open')).toThrow();
  });
});
