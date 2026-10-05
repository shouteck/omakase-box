import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { tokenHash } from '../../../packages/contracts/auth/crypto.js';
import { contentHash } from '../../../packages/contracts/hash.js';
import type { BehaviorArtifact, BoxVersion } from '../../../packages/box-contracts/index.js';
import type { WorkUnit } from '../../../packages/contracts/public/composition.js';
type AdapterKind = WorkUnit['adapterKind'];
type Capability = WorkUnit['requiredCapabilities'][number];

const requireService = createRequire(fileURLToPath(new URL('../../../services/private-api/package.json', import.meta.url)));
const { Pool } = requireService('pg') as { Pool: new (config: Record<string, unknown>) => PgPool };
const { drizzle } = requireService('drizzle-orm/node-postgres') as { drizzle: (pool: PgPool) => unknown };
const { migrate } = requireService('drizzle-orm/node-postgres/migrator') as { migrate: (db: unknown, options: { migrationsFolder: string }) => Promise<void> };

interface PgClient { query(sql: string, parameters?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>; release(): void }
interface PgPool { query: PgClient['query']; connect(): Promise<PgClient>; end(): Promise<void> }

export const uuid = () => randomUUID();
export const hex = (bytes = 32) => randomBytes(bytes).toString('hex');
export const commit = () => randomBytes(20).toString('hex');
export const digest = () => 'sha256:' + hex();
export const now = () => new Date().toISOString();

export interface FixtureAccount { id: string; role: 'requester' | 'owner' | 'operator'; sessionHash: string; csrfHash: string }

const APPROVED_FIXTURE_DB_HOST = 'w002-b11-box-db-r4-env2';
const RUN_DB_PREFIX = 'w002_b11_r4run_';
const MAX_RUN_DATABASES = 12;
const CONNECTION_DEADLINE_MS = 10000;

export async function migratedPool(): Promise<{ pool: PgPool; database: string }> {
  const adminUrl = process.env.BOX_TEST_DATABASE_URL;
  if (typeof adminUrl !== 'string' || !adminUrl.startsWith('postgres://')) throw new Error('BOX_TEST_DATABASE_URL is not configured.');
  const runId = process.env.BOX_TEST_RUN_ID;
  if (typeof runId !== 'string' || !/^[A-Za-z0-9_.-]{4,64}$/.test(runId)) throw new Error('BOX_TEST_RUN_ID is not configured.');
  const url = new URL(adminUrl);
  if (url.hostname !== APPROVED_FIXTURE_DB_HOST) throw new Error('BOX_TEST_DATABASE_URL is not bound to the approved fresh fixture DB.');
  const database = RUN_DB_PREFIX + runId.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 24) + '_' + hex(8);
  const admin = new Pool({ connectionString: adminUrl, max: 1, connectionTimeoutMillis: CONNECTION_DEADLINE_MS });
  let pool: PgPool | undefined;
  try {
    let ready = false;
    let lastReadinessError: unknown;
    for (let attempt = 0; attempt < 2 && !ready; attempt += 1) {
      try { await admin.query('SELECT 1'); ready = true; }
      catch (error) { lastReadinessError = error; await new Promise(resolve => setTimeout(resolve, 500)); }
    }
    if (!ready) throw lastReadinessError;
    const owned = await admin.query("SELECT count(*)::int AS n FROM pg_database WHERE datname LIKE '" + RUN_DB_PREFIX + "%'");
    if (Number(owned.rows[0]?.n ?? MAX_RUN_DATABASES) >= MAX_RUN_DATABASES) throw new Error('fixture database cap reached.');
    await admin.query('CREATE DATABASE ' + database);
    url.pathname = '/' + database;
    pool = new Pool({ connectionString: url.toString(), max: 4, connectionTimeoutMillis: CONNECTION_DEADLINE_MS });
    await migrate(drizzle(pool), { migrationsFolder: fileURLToPath(new URL('../../../services/private-api/db/migrations/', import.meta.url)) });
    return { pool, database };
  } catch (error) {
    if (pool !== undefined) await pool.end().catch(() => undefined);
    throw error;
  } finally { await admin.end().catch(() => undefined); }
}

export async function account(pool: PgPool, role: FixtureAccount['role']): Promise<FixtureAccount> {
  const id = uuid();
  const sessionHash = hex();
  const csrfHash = hex();
  await pool.query("INSERT INTO private_accounts (id,username,password_hash,role,disabled) VALUES ($1,$2,$3,$4,false)", [id, 'box-test-' + id.slice(0, 12), tokenHash(hex()), role]);
  await pool.query("INSERT INTO private_sessions (token_hash,account_id,csrf_hash,expires_at) VALUES ($1,$2,$3,now()+interval '1 hour')", [sessionHash, id, csrfHash]);
  return { id, role, sessionHash, csrfHash };
}

const requirement = (id: string) => ({ id, description: 'synthetic requirement ' + id, inputs: [] as string[], outputs: [] as string[], states: [] as string[], invalidCases: [] as string[], exclusions: [] as string[], examples: [{ given: 'synthetic input', when: 'executed', then: 'synthetic outcome' }] });

export function artifact(): BehaviorArtifact {
  return {
    schemaVersion: 1,
    artifactId: uuid(),
    profile: 'open_trusted',
    intent: { intentId: uuid(), intentVersion: 1, contentHash: hex() },
    goal: 'synthetic open box goal',
    acceptanceExamples: [requirement('acceptance-1')],
    assumptions: ['synthetic trusted repository'],
    unknowns: [],
    scope: { included: ['src/'], excluded: ['.runtime/'] }
  };
}

export function boxContentHash(art: unknown): string {
  return contentHash(art);
}

const REQUIRED_CAPABILITIES: Record<AdapterKind, Capability[]> = {
  frontend_component: ['browser', 'static_assets'],
  backend_pure_module: ['restricted_process'],
  backend_api: ['candidate_api', 'job_proxy'],
  application_policy: ['data_only_policy']
};

export function workUnit(id: string, adapterKind: AdapterKind, editablePaths: string[], requirementIds: string[], trustedCheckIds: string[], interfaceIds: string[] = []): WorkUnit {
  return {
    id, adapterKind, adapterVersion: 1,
    requirementIds, editablePaths, interfaceIds,
    trustedCheckIds, requiredCapabilities: REQUIRED_CAPABILITIES[adapterKind], startAfterUnitIds: []
  };
}

export function boxVersion(options: { artifact?: { artifactId: string }; boxId?: string; version?: number }): BoxVersion {
  return {
    schemaVersion: 1,
    boxId: options.boxId ?? uuid(),
    version: options.version ?? 1,
    profile: 'open_trusted',
    repoId: 'synthetic-repo',
    baseCommit: commit(),
    intent: { intentId: uuid(), intentVersion: 1, contentHash: hex() },
    behaviorArtifact: { artifactId: options.artifact?.artifactId ?? uuid(), contentHash: '0'.repeat(64) },
    contextManifest: { reference: 'synthetic-manifest', contentHash: hex() },
    editableSurface: ['src/candidate.ts'],
    environmentRef: { reference: 'synthetic-env', digest: digest() },
    evaluatorRef: { reference: 'synthetic-evaluator', version: 1, digest: hex() },
    disciplines: ['backend'],
    workUnits: [workUnit('unit-1', 'backend_pure_module', ['src/candidate.ts'], ['acceptance-1'], ['check-1'])],
    interfaces: [],
    requirements: [requirement('acceptance-1')],
    endToEndObligations: [],
    attemptPolicy: { maxAttempts: 8, allowedExecutorKinds: ['human', 'agent'] },
    executorPolicy: { explicitChoiceRequired: true, allowSimulatorLabelled: false },
    mergeTarget: { reference: 'synthetic-target', branch: 'main', expectedCommit: commit() },
    artifactHashes: {}
  };
}
