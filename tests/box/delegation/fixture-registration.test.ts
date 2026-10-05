import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { account, commit, delegationPool, delegationServices, materializeFixtureBaseline, sourceRoot } from './support.js';

interface Baseline { baseCommit: string; fileCount: number }

async function materializeBaseline(): Promise<Baseline> {
  const baseline = await materializeFixtureBaseline();
  if (!/^[a-f0-9]{40}$/.test(baseline.baseCommit) || baseline.fileCount !== 19) throw new Error('baseline_invalid');
  return baseline;
}

describe('delegation fixture registration', () => {
  let pool: Awaited<ReturnType<typeof delegationPool>>['pool'];
  beforeAll(async () => { pool = (await delegationPool()).pool; });
  afterAll(async () => { await pool.end(); });

  it('materializes a deterministic git baseline inside the isolated workdir', async () => {
    const first = await materializeBaseline();
    const second = await materializeBaseline();
    expect(first.baseCommit).toMatch(/^[a-f0-9]{40}$/);
    expect(first.baseCommit).toBe(second.baseCommit);
    expect(first.fileCount).toBe(19);
  });

  it('registers the repository once per snapshot/base-commit/manifest binding and replays the same key', async () => {
    const baseline = await materializeBaseline();
    const owner = await account(pool, 'owner');
    const { preparation } = delegationServices(pool);
    const key = 'w005-registration-' + Date.now();
    const first = await preparation.registerRepository(owner, { sourceId: 'private-shop', baseCommit: baseline.baseCommit, operationKey: key }) as { repoId: string; snapshotId: string; snapshotHash: string; fileCount: number; baseCommit: string; contextManifestHash: string };
    expect(first.repoId).toMatch(/^repo-[0-9a-f-]{36}$/);
    expect(first.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.fileCount).toBe(10);
    expect(first.baseCommit).toBe(baseline.baseCommit);
    expect(first.contextManifestHash).toMatch(/^[a-f0-9]{64}$/);
    const replay = await preparation.registerRepository(owner, { sourceId: 'private-shop', baseCommit: baseline.baseCommit, operationKey: key }) as { repoId: string };
    expect(replay.repoId).toBe(first.repoId);
    const dataLevel = await preparation.registerRepository(owner, { sourceId: 'private-shop', baseCommit: baseline.baseCommit }) as { repoId: string };
    expect(dataLevel.repoId).toBe(first.repoId);
  });

  it('fails a different request on the same operation key', async () => {
    const baseline = await materializeBaseline();
    const owner = await account(pool, 'owner');
    const { preparation } = delegationServices(pool);
    const key = 'w005-registration-conflict-' + Date.now();
    await preparation.registerRepository(owner, { sourceId: 'private-shop', baseCommit: baseline.baseCommit, operationKey: key });
    await expect(preparation.registerRepository(owner, { sourceId: 'private-shop', baseCommit: commit(), operationKey: key })).rejects.toThrow();
  });

  it('denies registration to roles without snapshot.import', async () => {
    const baseline = await materializeBaseline();
    const requester = await account(pool, 'requester');
    const { preparation } = delegationServices(pool);
    await expect(preparation.registerRepository(requester, { sourceId: 'private-shop', baseCommit: baseline.baseCommit })).rejects.toThrow('forbidden_role');
  });

  it('rejects an unconfigured source id and a malformed commit', async () => {
    const baseline = await materializeBaseline();
    const owner = await account(pool, 'owner');
    const { preparation } = delegationServices(pool);
    await expect(preparation.registerRepository(owner, { sourceId: 'unknown-source', baseCommit: baseline.baseCommit })).rejects.toThrow('invalid_input');
    await expect(preparation.registerRepository(owner, { sourceId: 'private-shop', baseCommit: 'not-a-commit' })).rejects.toThrow();
    void sourceRoot;
  });

  it('rejects a fabricated 40-hex commit that is not the real baseline HEAD', async () => {
    await materializeBaseline();
    const owner = await account(pool, 'owner');
    const { preparation } = delegationServices(pool);
    await expect(preparation.registerRepository(owner, { sourceId: 'private-shop', baseCommit: commit() })).rejects.toThrow('missing_evidence');
    await expect(preparation.registerRepository(owner, { sourceId: 'private-shop', baseCommit: 'f'.repeat(40) })).rejects.toThrow('missing_evidence');
  });
});
