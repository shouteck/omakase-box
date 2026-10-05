import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { account, approvedIntentFor, baselineCommit, delegationPool, delegationServices, REQUEST_A_CASE, REQUEST_B_CASE, REQUEST_A_TEXT, REQUEST_B_TEXT } from './support.js';
import type { BoxAgreementProjection } from '../../../services/private-api/boxes/preparation/types.js';

let pool: Awaited<ReturnType<typeof delegationPool>>['pool'];

async function preparedCase(caseId: string, text: typeof REQUEST_A_TEXT) {
  const base = await baselineCommit();
  const owner = await account(pool, 'owner');
  const { preparation } = delegationServices(pool);
  const registration = await preparation.registerRepository(owner, { sourceId: 'private-shop', baseCommit: base }) as { repoId: string; snapshotId: string };
  const { request } = await approvedIntentFor(pool, owner, text, registration.snapshotId);
  const prepared = await preparation.prepare(owner, { requestId: request.id, repositoryId: registration.repoId, supportedCaseId: caseId }) as { boxId: string; agreement: BoxAgreementProjection };
  return { owner, registration, prepared };
}

describe('delegation agreement card projection', () => {
  beforeAll(async () => { pool = (await delegationPool()).pool; });
  afterAll(async () => { await pool.end(); });

  it('projects request A with HSTS/non-localhost vs live-localhost truths', async () => {
    const { prepared } = await preparedCase(REQUEST_A_CASE, REQUEST_A_TEXT);
    {
      const agreement = prepared.agreement;
      expect(agreement.supportedCaseId).toBe(REQUEST_A_CASE);
      expect(agreement.editableSurface).toEqual(['config/response-security.json']);
      expect(agreement.runnable).toEqual(['src/policy/loader.ts', 'src/policy/strict-json.ts', 'src/config/response-security.json']);
      expect(agreement.explanatory).toEqual(['src/server.ts', 'src/selection/api.ts']);
      expect(agreement.packageMap['src/config/response-security.json']).toBe('config/response-security.json');
      expect(agreement.dependencyVersions.zod).toBe('4.6.5');
      const truths = agreement.truths.join(' ');
      expect(truths).toContain('https:true and localhost:false');
      expect(truths).toContain('no Strict-Transport-Security');
      expect(truths).toContain('/health');
      expect(agreement.environmentRef.reference).toBe('private-shop-preparation-env');
      expect(agreement.environmentRef.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(agreement.evaluatorRef.reference).toBe('private-shop-preparation-evaluator');
      expect(agreement.mergeTarget.reference).toBe('owner-private-shop');
      expect(agreement.mergeTarget.expectedCommit).toBe(agreement.baseCommit);
      expect(agreement.manifestLabel).toBe('private-shop-before-v1');
      expect(agreement.scope.excluded.join(' ')).toContain('src/private/eligibility.ts');
      expect(agreement.facts.length).toBe(agreement.truths.length);
    }
  });

  it('projects request B with new-file mapping and no privateScore coupling', async () => {
    const { prepared } = await preparedCase(REQUEST_B_CASE, REQUEST_B_TEXT);
    {
      const agreement = prepared.agreement;
      expect(agreement.supportedCaseId).toBe(REQUEST_B_CASE);
      expect(agreement.editableSurface).toEqual(['src/ranking/rankItems.ts']);
      expect(agreement.packageMap['src/ranking/rankItems.ts']).toBe('src/ranking/rankItems.ts');
      expect(agreement.runnable).not.toContain('src/private/scoring.ts');
      expect(agreement.scope.excluded.join(' ')).toContain('protected src/private');
      const requirement = agreement.acceptanceExamples.find(item => item.id === 'public-deterministic-ranking');
      expect(requirement).toBeDefined();
      expect(requirement?.exclusions.join(' ')).toContain('privateScore');
    }
  });

  it('clears blocking reasons only after exact owner approval and keeps superseded visible after amendment', async () => {
    const { owner, prepared } = await preparedCase(REQUEST_A_CASE, REQUEST_A_TEXT);
    {
      const { preparation } = delegationServices(pool);
      const before = prepared.agreement;
      expect(before.approval).toBeNull();
      expect(before.blockingReasons.join(' ')).toContain('approval');
      const artifactHash = before.artifactHashes.agreement;
      const approvalId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
      await preparation.approve(owner, prepared.boxId, { expectedVersion: 1, expectedHash: before.contentHash, approvalId });
      const after = await preparation.agreement(owner, prepared.boxId) as BoxAgreementProjection;
      expect(after.approval?.approvalId).toBe(approvalId);
      expect(after.approval?.artifactHash).toBe(artifactHash);
      expect(after.blockingReasons).toEqual([]);
      const amendment = { schemaVersion: 1 as const, artifactId: '3f6b0e0c-8f7a-4c1d-9e2a-1b2c3d4e5f60', profile: 'open_trusted' as const, intent: after.intent, goal: after.goal, acceptanceExamples: after.acceptanceExamples, assumptions: after.assumptions, unknowns: ['a new consequential unknown'], scope: after.scope };
      await preparation.revise(owner, prepared.boxId, { expectedVersion: 1, artifact: amendment });
      const amended = await preparation.agreement(owner, prepared.boxId) as BoxAgreementProjection;
      expect(amended.version).toBe(2);
      expect(amended.approval).toBeNull();
      expect(amended.supersededApproval).toBe(true);
      expect(amended.unknowns).toEqual(['a new consequential unknown']);
      expect(amended.blockingReasons.length).toBeGreaterThan(0);
      await expect(preparation.readiness(owner, prepared.boxId, { expectedVersion: 2 })).rejects.toThrow('missing_evidence');
    }
  });
});
