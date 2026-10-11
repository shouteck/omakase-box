import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BoxStore } from '../../../services/private-api/boxes/store/store.js';
import { account, artifact, boxContentHash, boxVersion, digest, hex, migratedPool, uuid } from './support.js';
import type { FixtureAccount } from './support.js';

type Fixture = Awaited<ReturnType<typeof migratedPool>>;
let pool: Fixture['pool'];
beforeAll(async () => { pool = (await migratedPool()).pool; }, 120000);
afterAll(async () => { await pool.end(); });

async function submittedAttempt(owner: FixtureAccount, executorKind: 'human' | 'agent') {
  const store = new BoxStore(pool as unknown as ConstructorParameters<typeof BoxStore>[0]);
  const author = await account(pool, 'requester');
  const art = artifact();
  await store.createArtifact(author, art);
  const version = boxVersion({ artifact: art });
  version.behaviorArtifact.contentHash = boxContentHash(art);
  const created = await store.create(author, version);
  await store.approveBehavior(owner, version.boxId, 1, created.contentHash, uuid());
  await store.transition(author, version.boxId, 1, 'open');
  let executor: { id: string };
  let auth: FixtureAccount | { agentToken: string };
  if (executorKind === 'human') {
    const worker = await account(pool, 'requester');
    executor = { id: worker.id };
    auth = worker;
  } else {
    executor = { id: 'agent-synthetic-1' };
    auth = { agentToken: '' };
  }
  const assigned = await store.assign(owner, {
    schemaVersion: 1, assignmentId: uuid(), boxId: version.boxId, boxVersion: 1,
    boxVersionHash: created.contentHash, executor: { kind: executorKind, actorId: executor.id },
    capability: 'attempt.execute', assignedBy: owner.id, createdAt: new Date().toISOString()
  }, executorKind !== 'human');
  if (executorKind === 'agent') auth = { agentToken: String(assigned.token) };
  const attemptId = uuid();
  await store.openAttempt(auth, version.boxId, 1, { attemptId, worktreeRef: 'synthetic-worktree', environmentDigest: version.environmentRef.digest, evaluatorDigest: version.evaluatorRef.digest });
  const patch = hex();
  await store.submitAttempt(auth, attemptId, 1, patch, 'synthetic-worktree');
  return { store, version, created, attemptId, patch, executorId: executor.id, auth };
}

describe('server-side role separation', () => {
  it('refuses executor self-review and requires an independent reviewer bound to exact candidate bytes', async () => {
    const owner = await account(pool, 'owner');
    const fixture = await submittedAttempt(owner, 'human');
    const decision = {
      schemaVersion: 1, reviewId: uuid(), boxId: fixture.version.boxId, attemptId: fixture.attemptId,
      boxVersionHash: fixture.created.contentHash, candidateHash: fixture.patch,
      verdict: 'approved' as const, reviewerId: '', rationale: 'synthetic verdict', decidedAt: new Date().toISOString()
    };
    const executorSession = fixture.auth as FixtureAccount;
    await expect(fixture.store.review(executorSession, { ...decision, reviewerId: executorSession.id })).rejects.toMatchObject({ code: 'forbidden_role' });
    const reviewer = await account(pool, 'requester');
    await expect(fixture.store.review(reviewer, { ...decision, reviewerId: reviewer.id, candidateHash: hex() })).rejects.toMatchObject({ code: 'missing_evidence' });
    const recorded = await fixture.store.review(reviewer, { ...decision, reviewerId: reviewer.id });
    expect(recorded.reviewId).toBe(decision.reviewId);
  }, 30000);
  it('keeps merge approval a separate owner object and refuses the executor to approve its own merge', async () => {
    const owner = await account(pool, 'owner');
    const fixture = await submittedAttempt(owner, 'human');
    const reviewer = await account(pool, 'owner');
    const reviewId = uuid();
    await fixture.store.review(reviewer, {
      schemaVersion: 1, reviewId, boxId: fixture.version.boxId, attemptId: fixture.attemptId,
      boxVersionHash: fixture.created.contentHash, candidateHash: fixture.patch,
      verdict: 'approved', reviewerId: reviewer.id, rationale: 'synthetic independent review', decidedAt: new Date().toISOString()
    });
    const executorSession = fixture.auth as FixtureAccount;
    await expect(fixture.store.approveMerge(executorSession, { approvalId: uuid(), boxId: fixture.version.boxId, attemptId: fixture.attemptId, reviewId, expectedTargetCommit: fixture.version.mergeTarget.expectedCommit })).rejects.toMatchObject({ code: 'forbidden_role' });
    await expect(fixture.store.approveMerge(owner, { approvalId: uuid(), boxId: fixture.version.boxId, attemptId: fixture.attemptId, reviewId, expectedTargetCommit: hex(20) })).rejects.toMatchObject({ code: 'stale_version' });
    const approvalId = uuid();
    const approved = await fixture.store.approveMerge(owner, { approvalId, boxId: fixture.version.boxId, attemptId: fixture.attemptId, reviewId, expectedTargetCommit: fixture.version.mergeTarget.expectedCommit });
    expect(approved.approvalId).toBe(approvalId);
    const mergeId = uuid();
    const applied = await fixture.store.applyMerge(owner, {
      schemaVersion: 1, mergeId, approvalId, boxId: fixture.version.boxId, attemptId: fixture.attemptId,
      sourceCandidateHash: fixture.patch, targetRef: fixture.version.mergeTarget.branch,
      resultCommit: 'a'.repeat(40), state: 'applied', mergeOwnerId: owner.id, createdAt: new Date().toISOString()
    });
    expect(applied.mergeId).toBe(mergeId);
    await expect(pool.query('UPDATE box_merge_approvals SET approved_by=$1 WHERE approval_id=$2', [reviewer.id, approvalId])).rejects.toThrow(/box_record_immutable/);
  }, 30000);
});
