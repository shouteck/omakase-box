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

const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];
const RUN_DB_PREFIX = 'box_test_';
const CONNECTION_DEADLINE_MS = 10000;

interface Server { host: string; port: number; user: string; password: string; database: string }

async function dropDatabase(server: Server, database: string): Promise<void> {
  const admin = new Pool({ ...server, max: 1, connectionTimeoutMillis: CONNECTION_DEADLINE_MS });
  try { await admin.query('DROP DATABASE IF EXISTS ' + database + ' WITH (FORCE)'); }
  finally { await admin.end().catch(() => undefined); }
}

// The database is disposable: it is created per call on a loopback server and dropped when the returned pool ends.
// pg never sees the URL: its parser lets query parameters such as host override the validated hostname, so the
// URL may carry none and every pool is built from the explicit fields validated here.
export async function migratedPool(): Promise<{ pool: PgPool; database: string }> {
  const adminUrl = process.env.BOX_TEST_DATABASE_URL;
  if (typeof adminUrl !== 'string' || !adminUrl.startsWith('postgres://')) throw new Error('BOX_TEST_DATABASE_URL is not configured.');
  const runId = process.env.BOX_TEST_RUN_ID;
  if (typeof runId !== 'string' || !/^[A-Za-z0-9_.-]{4,64}$/.test(runId)) throw new Error('BOX_TEST_RUN_ID is not configured.');
  if (/[?#]/.test(adminUrl)) throw new Error('BOX_TEST_DATABASE_URL must not carry a query or fragment.');
  const url = new URL(adminUrl);
  if (!LOOPBACK_HOSTS.includes(url.hostname)) throw new Error('BOX_TEST_DATABASE_URL is not a loopback database.');
  const server: Server = { host: url.hostname.replace(/^\[|\]$/g, ''), port: url.port === '' ? 5432 : Number(url.port), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: decodeURIComponent(url.pathname.slice(1)) || 'postgres' };
  const database = RUN_DB_PREFIX + runId.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 24) + '_' + hex(8);
  const admin = new Pool({ ...server, max: 1, connectionTimeoutMillis: CONNECTION_DEADLINE_MS });
  let pool: PgPool | undefined;
  let created = false;
  try {
    let ready = false;
    let lastReadinessError: unknown;
    for (let attempt = 0; attempt < 2 && !ready; attempt += 1) {
      try { await admin.query('SELECT 1'); ready = true; }
      catch (error) { lastReadinessError = error; await new Promise(resolve => setTimeout(resolve, 500)); }
    }
    if (!ready) throw lastReadinessError;
    await admin.query('CREATE DATABASE ' + database);
    created = true;
    pool = new Pool({ ...server, database, max: 4, connectionTimeoutMillis: CONNECTION_DEADLINE_MS });
    await migrate(drizzle(pool), { migrationsFolder: fileURLToPath(new URL('../../../services/private-api/db/migrations/', import.meta.url)) });
    const end = pool.end.bind(pool);
    let ended: Promise<void> | undefined;
    pool.end = () => ended ??= end().finally(() => dropDatabase(server, database));
    return { pool, database };
  } catch (error) {
    if (pool !== undefined) await pool.end().catch(() => undefined);
    if (created) await dropDatabase(server, database).catch(() => undefined);
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
