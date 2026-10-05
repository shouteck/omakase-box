import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BoxStore } from '../../../services/private-api/boxes/store/store.js';
import { tokenHash } from '../../../packages/contracts/auth/crypto.js';
import { account, artifact, boxContentHash, boxVersion, hex, migratedPool, uuid } from './support.js';
import type { FixtureAccount } from './support.js';

type Fixture = Awaited<ReturnType<typeof migratedPool>>;
type Pool = Fixture['pool'];
let pool: Pool;
beforeAll(async () => { pool = (await migratedPool()).pool; }, 120000);
afterAll(async () => { await pool.end(); });

const store = () => new BoxStore(pool as unknown as ConstructorParameters<typeof BoxStore>[0]);

async function openBox(owner: FixtureAccount) {
  const api = store();
  const author = await account(pool, 'requester');
  const art = artifact();
  await api.createArtifact(author, art);
  const version = boxVersion({ artifact: art });
  version.behaviorArtifact.contentHash = boxContentHash(art);
  const created = await api.create(author, version);
  await api.approveBehavior(owner, version.boxId, 1, created.contentHash, uuid());
  await api.transition(author, version.boxId, 1, 'open');
  return { api, author, version, created };
}

async function assignedAttempt(owner: FixtureAccount, capability = 'attempt.execute') {
  const fixture = await openBox(owner);
  const assignment = await fixture.api.assign(owner, {
    schemaVersion: 1, assignmentId: uuid(), boxId: fixture.version.boxId, boxVersion: 1,
    boxVersionHash: fixture.created.contentHash, executor: { kind: 'agent', actorId: 'agent-' + capability },
    capability, assignedBy: owner.id, createdAt: new Date().toISOString()
  }, true);
  const attemptId = uuid();
  await fixture.api.openAttempt({ agentToken: String(assignment.token) }, fixture.version.boxId, 1, { attemptId, environmentDigest: fixture.version.environmentRef.digest, evaluatorDigest: fixture.version.evaluatorRef.digest });
  const patch = hex();
  await fixture.api.submitAttempt({ agentToken: String(assignment.token) }, attemptId, 1, patch);
  return { ...fixture, assignment, attemptId, patch, token: String(assignment.token) };
}

describe('expired and mis-scoped agent tokens', () => {
  it('refuses an expired scoped token server-side', async () => {
    const owner = await account(pool, 'owner');
    const fixture = await assignedAttempt(owner);
    await expect(pool.query("UPDATE box_scoped_tokens SET expires_at=now()-interval '1 second' WHERE actor_label=$1", ['agent-attempt.execute'])).rejects.toThrow(/box_record_immutable/);
    const expired = hex();
    await pool.query("INSERT INTO box_scoped_tokens (token_hash,box_id,attempt_id,capability,actor_label,expires_at,created_by) VALUES ($1,$2,$3,$4,$5,now()-interval '1 second',$6)", [tokenHash(expired), fixture.version.boxId, null, 'attempt.execute', 'agent-expired-1', owner.id]);
    await expect(fixture.api.openAttempt({ agentToken: expired }, fixture.version.boxId, 1, { attemptId: uuid(), environmentDigest: fixture.version.environmentRef.digest, evaluatorDigest: fixture.version.evaluatorRef.digest })).rejects.toMatchObject({ code: 'forbidden_role' });
    await expect(fixture.api.submitAttempt({ agentToken: expired }, fixture.attemptId, 2, hex())).rejects.toMatchObject({ code: 'forbidden_role' });
  }, 30000);
  it('refuses a token minted for evaluation to execute, and vice versa', async () => {
    const owner = await account(pool, 'owner');
    const fixture = await openBox(owner);
    const evalAssignment = await fixture.api.assign(owner, {
      schemaVersion: 1, assignmentId: uuid(), boxId: fixture.version.boxId, boxVersion: 1,
      boxVersionHash: fixture.created.contentHash, executor: { kind: 'agent', actorId: 'agent-eval-1' },
      capability: 'attempt.evaluate', assignedBy: owner.id, createdAt: new Date().toISOString()
    }, true);
    await expect(fixture.api.openAttempt({ agentToken: String(evalAssignment.token) }, fixture.version.boxId, 1, { attemptId: uuid(), environmentDigest: fixture.version.environmentRef.digest, evaluatorDigest: fixture.version.evaluatorRef.digest })).rejects.toMatchObject({ code: 'forbidden_role' });
  }, 30000);
});

describe('evaluation actor binding', () => {
  it('refuses a receipt whose recordedBy does not match the authenticated actor', async () => {
    const owner = await account(pool, 'owner');
    const fixture = await assignedAttempt(owner);
    const operator = await account(pool, 'operator');
    const receipt = (recordedBy: string) => ({
      schemaVersion: 1, receiptId: uuid(), attemptId: fixture.attemptId, boxVersionHash: fixture.created.contentHash,
      environmentDigest: fixture.version.environmentRef.digest, evaluatorDigest: fixture.version.evaluatorRef.digest,
      outcome: 'passed' as const, summary: 'synthetic', outputHash: hex(), durationMs: 1,
      assurance: 'tested' as const, recordedBy, createdAt: new Date().toISOString()
    });
    await expect(fixture.api.recordEvaluation(operator, receipt(uuid()))).rejects.toMatchObject({ code: 'missing_evidence' });
    const recorded = await fixture.api.recordEvaluation(operator, receipt(operator.id));
    expect(recorded.receiptId).toBeTruthy();
  }, 30000);
});

describe('non-owner role refusals', () => {
  it('refuses approveBehavior, assign and applyMerge from non-owner sessions', async () => {
    const owner = await account(pool, 'owner');
    const fixture = await assignedAttempt(owner);
    const requester = await account(pool, 'requester');
    const outsider = await account(pool, 'owner');
    await expect(fixture.api.approveBehavior(requester, fixture.version.boxId, 1, fixture.created.contentHash, uuid())).rejects.toMatchObject({ code: 'forbidden_role' });
    await expect(fixture.api.assign(requester, {
      schemaVersion: 1, assignmentId: uuid(), boxId: fixture.version.boxId, boxVersion: 1,
      boxVersionHash: fixture.created.contentHash, executor: { kind: 'human', actorId: requester.id },
      capability: 'attempt.execute', assignedBy: requester.id, createdAt: new Date().toISOString()
    }, false)).rejects.toMatchObject({ code: 'forbidden_role' });
    const reviewer = await account(pool, 'owner');
    const reviewId = uuid();
    await fixture.api.review(reviewer, {
      schemaVersion: 1, reviewId, boxId: fixture.version.boxId, attemptId: fixture.attemptId,
      boxVersionHash: fixture.created.contentHash, candidateHash: fixture.patch,
      verdict: 'approved', reviewerId: reviewer.id, rationale: 'synthetic review', decidedAt: new Date().toISOString()
    });
    const approvalId = uuid();
    await fixture.api.approveMerge(owner, { approvalId, boxId: fixture.version.boxId, attemptId: fixture.attemptId, reviewId, expectedTargetCommit: fixture.version.mergeTarget.expectedCommit });
    await expect(fixture.api.applyMerge(outsider, {
      schemaVersion: 1, mergeId: uuid(), approvalId, boxId: fixture.version.boxId, attemptId: fixture.attemptId,
      sourceCandidateHash: fixture.patch, targetRef: fixture.version.mergeTarget.branch,
      resultCommit: 'b'.repeat(40), state: 'applied', mergeOwnerId: outsider.id, createdAt: new Date().toISOString()
    })).rejects.toMatchObject({ code: 'forbidden_role' });
    const applied = await fixture.api.applyMerge(owner, {
      schemaVersion: 1, mergeId: uuid(), approvalId, boxId: fixture.version.boxId, attemptId: fixture.attemptId,
      sourceCandidateHash: fixture.patch, targetRef: fixture.version.mergeTarget.branch,
      resultCommit: 'b'.repeat(40), state: 'applied', mergeOwnerId: owner.id, createdAt: new Date().toISOString()
    });
    expect(applied.mergeId).toBeTruthy();
  }, 30000);
});
