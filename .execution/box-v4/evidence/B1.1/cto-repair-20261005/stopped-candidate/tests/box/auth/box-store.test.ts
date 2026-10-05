import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BoxStore } from '../../../services/private-api/boxes/store/store.js';
import { WorkflowError } from '../../../packages/box-contracts/index.js';
import { account, artifact, boxContentHash, boxVersion, commit, digest, hex, migratedPool, uuid } from './support.js';
import type { FixtureAccount } from './support.js';

type Fixture = Awaited<ReturnType<typeof migratedPool>>;
let pool: Fixture['pool'];
let database = '';
beforeAll(async () => { const fixture = await migratedPool(); pool = fixture.pool; database = fixture.database; }, 120000);
afterAll(async () => { await pool.end(); });

async function approvedBox(owner: FixtureAccount, author: FixtureAccount) {
  const store = new BoxStore(pool as unknown as ConstructorParameters<typeof BoxStore>[0]);
  const art = artifact();
  await store.createArtifact(author, art);
  const version = boxVersion({ artifact: art });
  version.behaviorArtifact.contentHash = boxContentHash(art);
  const created = await store.create(author, version);
  await store.approveBehavior(owner, version.boxId, 1, created.contentHash, uuid());
  await store.transition(author, version.boxId, 1, 'open');
  return { store, art, version, created };
}

describe('box store happy path', () => {
  it('creates artifact, version, owner approval, opens, assigns and executes an attempt', async () => {
    const owner = await account(pool, 'owner');
    const author = await account(pool, 'requester');
    const worker = await account(pool, 'requester');
    const { store, version, created } = await approvedBox(owner, author);
    const assigned = await store.assign(owner, {
      schemaVersion: 1, assignmentId: uuid(), boxId: version.boxId, boxVersion: 1,
      boxVersionHash: created.contentHash, executor: { kind: 'human', actorId: worker.id },
      capability: 'attempt.execute', assignedBy: owner.id, createdAt: new Date().toISOString()
    }, false);
    expect(assigned.assignmentId).toBeDefined();
    const attemptId = uuid();
    const opened = await store.openAttempt(worker, version.boxId, 1, { attemptId, worktreeRef: 'synthetic-worktree', environmentDigest: version.environmentRef.digest, evaluatorDigest: version.evaluatorRef.digest });
    expect(opened.boxVersionHash).toBe(created.contentHash);
    const patch = hex();
    const submitted = await store.submitAttempt(worker, attemptId, 1, patch, 'synthetic-worktree');
    expect(submitted.state).toBe('submitted');
    const read = await store.read(author, version.boxId);
    expect(read.state).toBe('open');
    expect(read.approval?.artifact_hash).toBe(version.behaviorArtifact.contentHash);
  }, 30000);
});

describe('optimistic, identity and transition guards', () => {
  it('rejects stale versions, foreign ids and illegal transitions', async () => {
    const owner = await account(pool, 'owner');
    const author = await account(pool, 'requester');
    const { store, version, created } = await approvedBox(owner, author);
    await expect(store.transition(author, version.boxId, 2, 'closed')).rejects.toMatchObject({ code: 'stale_version' });
    await expect(store.approveBehavior(owner, version.boxId, 1, hex(), uuid())).rejects.toMatchObject({ code: 'missing_evidence' });
    await expect(store.transition(author, version.boxId, 1, 'open' as never)).rejects.toMatchObject({ code: 'invalid_transition' });
    await expect(store.openAttempt(author, uuid(), 1, { attemptId: uuid(), environmentDigest: version.environmentRef.digest, evaluatorDigest: version.evaluatorRef.digest })).rejects.toMatchObject({ code: 'missing_evidence' });
    await expect(store.submitAttempt(author, uuid(), 1, hex())).rejects.toMatchObject({ code: 'missing_evidence' });
    expect(created.contentHash).toMatch(/^[a-f0-9]{64}$/);
  }, 30000);
  it('rejects edits by a different non-owner author and records approval invalidation on revise', async () => {
    const owner = await account(pool, 'owner');
    const author = await account(pool, 'requester');
    const intruder = await account(pool, 'requester');
    const { store, version } = await approvedBox(owner, author);
    const art2 = artifact();
    await store.createArtifact(author, art2);
    const revised = boxVersion({ artifact: art2, boxId: version.boxId, version: 2 });
    revised.behaviorArtifact.contentHash = boxContentHash(art2);
    await expect(store.revise(intruder, revised, 1)).rejects.toMatchObject({ code: 'forbidden_role' });
    const next = await store.revise(author, revised, 1);
    expect(next.approvalInvalidated).toBe(true);
    const read = await store.read(owner, version.boxId);
    expect(read.version).toBe(2);
    expect(read.supersededApproval).toBe(true);
    await expect(store.transition(author, version.boxId, 2, 'open')).rejects.toMatchObject({ code: 'missing_evidence' });
  }, 30000);
});
