import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migratedPool } from '../auth/support.js';
import { account, commit, delegationPool, delegationServices, sourceRoot, BASELINE_OUT } from './support.js';

interface EnvironmentHostModule {
  RUN_DB_LIMIT: number;
  RUNNER_RECEIPT_DIR: string;
  superviseBatch(indices: number[], options: { leaseOwner: string; receiptRoot: string; countRunDatabases: () => Promise<unknown> }): Promise<unknown>;
}

const run = promisify(execFile);
const REGISTER_FIXTURE = fileURLToPath(new URL('./register-fixture.mjs', import.meta.url));
const FIXTURE_MANIFEST = fileURLToPath(new URL('./fixture-manifest.json', import.meta.url));

interface Baseline { baseCommit: string; fileCount: number }

async function materializeBaseline(): Promise<Baseline> {
  const result = await run('node', [REGISTER_FIXTURE, '--manifest', FIXTURE_MANIFEST, '--out', BASELINE_OUT], { timeout: 60000 });
  const baseline = JSON.parse(await readFile(BASELINE_OUT, 'utf8')) as Baseline;
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

  it('counts both owned run prefixes toward one shared cap before creation and blocks at the budget gate', async () => {
    const environmentHost: EnvironmentHostModule = await import(new URL('./environment-host.mjs', import.meta.url).href);
    const combinedCount = async () => Number((await pool.query("SELECT count(*)::int AS n FROM pg_database WHERE datname LIKE 'w005\\_d12\\_run\\_%' ESCAPE '\\' OR datname LIKE 'w002\\_b11\\_r4run\\_%' ESCAPE '\\'")).rows[0]?.n);
    const before = await combinedCount();
    const legacy = await migratedPool();
    try {
      expect(legacy.database.startsWith('w002_b11_r4run_')).toBe(true);
      const legacyOnly = Number((await pool.query("SELECT count(*)::int AS n FROM pg_database WHERE datname LIKE 'w002\\_b11\\_r4run\\_%' ESCAPE '\\'")).rows[0]?.n);
      const runOnly = Number((await pool.query("SELECT count(*)::int AS n FROM pg_database WHERE datname LIKE 'w005\\_d12\\_run\\_%' ESCAPE '\\'")).rows[0]?.n);
      const after = await combinedCount();
      expect(legacyOnly).toBeGreaterThanOrEqual(1);
      expect(runOnly).toBeGreaterThanOrEqual(1);
      expect(after).toBe(before + 1);
      expect(after).toBe(legacyOnly + runOnly);
      expect(after).toBeLessThanOrEqual(environmentHost.RUN_DB_LIMIT);
    } finally { await legacy.pool.end(); }
    await expect(environmentHost.superviseBatch([1], { leaseOwner: 'w005-cap-regression', receiptRoot: environmentHost.RUNNER_RECEIPT_DIR, countRunDatabases: () => Promise.resolve(environmentHost.RUN_DB_LIMIT) })).rejects.toMatchObject({ code: 'environment_db_budget' });
    await expect(environmentHost.superviseBatch([1], { leaseOwner: 'w005-cap-regression', receiptRoot: environmentHost.RUNNER_RECEIPT_DIR, countRunDatabases: () => Promise.resolve('unknown') })).rejects.toMatchObject({ code: 'environment_db_budget' });
    const ledger = await readFile(resolve(environmentHost.RUNNER_RECEIPT_DIR, 'ledger.ndjson'), 'utf8').catch(() => '');
    expect(ledger.includes('"index":1')).toBe(false);
  });
});
