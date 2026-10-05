import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BoxStore } from '../../../services/private-api/boxes/store/store.js';
import { account, artifact, boxContentHash, boxVersion, hex, migratedPool, uuid } from './support.js';
import type { FixtureAccount } from './support.js';

type Fixture = Awaited<ReturnType<typeof migratedPool>>;
let pool: Fixture['pool'];
beforeAll(async () => { pool = (await migratedPool()).pool; }, 120000);
afterAll(async () => { await pool.end(); });

async function openBox(owner: FixtureAccount) {
  const store = new BoxStore(pool as unknown as ConstructorParameters<typeof BoxStore>[0]);
  const author = await account(pool, 'requester');
  const art = artifact();
  await store.createArtifact(author, art);
  const version = boxVersion({ artifact: art });
  version.behaviorArtifact.contentHash = boxContentHash(art);
  const created = await store.create(author, version);
  await store.approveBehavior(owner, version.boxId, 1, created.contentHash, uuid());
  await store.transition(author, version.boxId, 1, 'open');
  return { store, author, version, created };
}

describe('scoped agent tokens', () => {
  it('executes an attempt only inside its Box/capability scope', async () => {
    const owner = await account(pool, 'owner');
    const { store, version, created } = await openBox(owner);
    const assigned = await store.assign(owner, {
      schemaVersion: 1, assignmentId: uuid(), boxId: version.boxId, boxVersion: 1,
      boxVersionHash: created.contentHash, executor: { kind: 'agent', actorId: 'agent-scoped-1' },
      capability: 'attempt.execute', assignedBy: owner.id, createdAt: new Date().toISOString()
    }, true);
    const token = String(assigned.token);
    const attemptId = uuid();
    await store.openAttempt({ agentToken: token }, version.boxId, 1, { attemptId, environmentDigest: version.environmentRef.digest, evaluatorDigest: version.evaluatorRef.digest });
    const other = await openBox(await account(pool, 'owner'));
    await expect(other.store.openAttempt({ agentToken: token }, other.version.boxId, 1, { attemptId: uuid(), environmentDigest: other.version.environmentRef.digest, evaluatorDigest: other.version.evaluatorRef.digest })).rejects.toMatchObject({ code: 'forbidden_role' });
    await expect(store.recordEvaluation({ agentToken: token }, {
      schemaVersion: 1, receiptId: uuid(), attemptId, boxVersionHash: created.contentHash,
      environmentDigest: version.environmentRef.digest, evaluatorDigest: version.evaluatorRef.digest,
      outcome: 'passed', summary: 'synthetic', outputHash: hex(), durationMs: 1,
      assurance: 'tested', recordedBy: 'agent-scoped-1', createdAt: new Date().toISOString()
    })).rejects.toMatchObject({ code: 'forbidden_role' });
  }, 30000);
});

describe('idempotent operations', () => {
  it('replays identical keys and rejects same-key different requests', async () => {
    const owner = await account(pool, 'owner');
    const { store, author, version } = await openBox(owner);
    const art = artifact();
    await store.createArtifact(author, art);
    const otherVersion = boxVersion({ artifact: art });
    otherVersion.behaviorArtifact.contentHash = boxContentHash(art);
    const first = await store.create(author, otherVersion, 'synthetic-key-1');
    const replay = await store.create(author, otherVersion, 'synthetic-key-1');
    expect(replay.replayed).toBe(true);
    expect(replay.contentHash).toBe(first.contentHash);
    const different = boxVersion({ artifact: art });
    different.behaviorArtifact.contentHash = boxContentHash(art);
    different.repoId = 'synthetic-repo-changed';
    await expect(store.create(author, different, 'synthetic-key-1')).rejects.toMatchObject({ code: 'missing_evidence' });
    expect(version.boxId).not.toBe(otherVersion.boxId);
  }, 30000);
});
