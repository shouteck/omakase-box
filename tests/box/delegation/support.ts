import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { signSession, tokenHash } from '../../../packages/contracts/auth/crypto.js';
import { SessionStore } from '../../../packages/contracts/auth/store.js';
import { PrivateIntakeStore } from '../../../services/private-api/requests/store.js';
import { PrivateIntentStore } from '../../../services/private-api/db/intent-store.js';
import { IntentOrchestrator } from '../../../services/private-api/intents/orchestrator.js';
import { BoxStore } from '../../../services/private-api/boxes/store/store.js';
import { boxPreparationOrchestration } from '../../../services/private-api/boxes/preparation/orchestrator.js';
import { createPrivateApi } from '../../../services/private-api/src/bootstrap/server.js';
import { PRIVATE_SHOP_FILE_ROLES } from '../../../services/private-api/boxes/preparation/types.js';

const requireService = createRequire(fileURLToPath(new URL('../../../services/private-api/package.json', import.meta.url)));
const { Pool } = requireService('pg') as { Pool: new (config: Record<string, unknown>) => PgPool };
const { drizzle } = requireService('drizzle-orm/node-postgres') as { drizzle: (pool: PgPool) => unknown };
const { migrate } = requireService('drizzle-orm/node-postgres/migrator') as { migrate: (db: unknown, options: { migrationsFolder: string }) => Promise<void> };

interface PgClient { query(sql: string, parameters?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>; release(): void }
interface PgPool { query: PgClient['query']; connect(): Promise<PgClient>; end(): Promise<void> }

export const uuid = () => randomUUID();
export const hex = (bytes = 32) => randomBytes(bytes).toString('hex');
export const commit = () => randomBytes(20).toString('hex');
export const now = () => new Date().toISOString();

export const SESSION_KEY = randomBytes(32);
export const REQUEST_A_CASE = 'delegation.private-shop.request-a.response-policy';
export const REQUEST_B_CASE = 'delegation.private-shop.request-b.public-ranking';
export const UNSUPPORTED_COUPLING_CASE = 'delegation.private-shop.unsupported-private-ui-coupling';
export const PRIVATE_SHOP_SNAPSHOT_PATHS = Object.keys(PRIVATE_SHOP_FILE_ROLES);

export const REQUEST_A_TEXT = {
  goal: 'Harden the private shop response policy.',
  currentBehaviour: 'config/response-security.json declares a permissive response policy and the live localhost server emits only the current headers.',
  desiredBehaviour: 'Update config/response-security.json to frameAncestors none, noSniff true, referrerPolicy no-referrer, and hsts enabled with maxAgeSeconds 31536000 and includeSubDomains false.',
  constraints: ['Only config/response-security.json may change.', 'No new dependencies.', '/health stays exempt.'],
  exclusions: ['Do not implement the change; only prepare the Box.']
};
export const REQUEST_B_TEXT = {
  goal: 'Add deterministic public ranking.',
  currentBehaviour: 'Private ranking uses protected scoring and there is no public rankItems module.',
  desiredBehaviour: 'Add src/ranking/rankItems.ts exporting PublicItem, InvalidInput and rankItems: rankItems leaves input untouched, orders equal scores by ASCII id ascending, and rejects malformed input.',
  constraints: ['Only src/ranking/rankItems.ts may change.', 'No privateScore or src/private imports.', 'No new production dependencies.'],
  exclusions: ['Do not edit rankPrivateItems.ts or its callers.', 'Do not implement the change; only prepare the Box.']
};

const APPROVED_FIXTURE_DB_ALIAS = 'w002-b11-box-db-r4-env2';
const RUN_DB_PREFIX = 'w005_d12_run_';
const LEGACY_RUN_DB_PREFIX = 'w002_b11_r4run_';
const MAX_RUN_DATABASES = 12;
const CONNECTION_DEADLINE_MS = 10000;
export const BASELINE_WORKDIR = '/tmp/w005-d12-fixture-baseline';
export const BASELINE_OUT = '/tmp/w005-d12-fixture-baseline-out/baseline.json';

export async function delegationPool(): Promise<{ pool: PgPool; database: string }> {
  const adminUrl = process.env.BOX_DELEGATION_DATABASE_URL;
  if (typeof adminUrl !== 'string' || !adminUrl.startsWith('postgresql://')) throw new Error('BOX_DELEGATION_DATABASE_URL is not configured.');
  const runId = process.env.BOX_TEST_RUN_ID;
  if (typeof runId !== 'string' || !/^[A-Za-z0-9_.-]{4,64}$/.test(runId)) throw new Error('BOX_TEST_RUN_ID is not configured.');
  const url = new URL(adminUrl);
  if (url.hostname !== APPROVED_FIXTURE_DB_ALIAS) throw new Error('BOX_DELEGATION_DATABASE_URL is not bound to the approved network-local alias.');
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
    const owned = await admin.query("SELECT count(*)::int AS n FROM pg_database WHERE datname LIKE '" + RUN_DB_PREFIX.replace(/_/g, '\\_') + "%' ESCAPE '\\' OR datname LIKE '" + LEGACY_RUN_DB_PREFIX.replace(/_/g, '\\_') + "%' ESCAPE '\\'");
    const ownedCount = Number(owned.rows[0]?.n);
    if (!Number.isInteger(ownedCount) || ownedCount < 0 || ownedCount >= MAX_RUN_DATABASES) throw new Error('delegation fixture database cap reached or inventory unknown.');
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

export interface DelegationAccount { id: string; role: 'requester' | 'owner' | 'operator'; sessionHash: string; csrfHash: string; cookie: string; csrf: string }

export async function account(pool: PgPool, role: DelegationAccount['role']): Promise<DelegationAccount> {
  const id = uuid();
  const token = hex();
  const csrf = hex();
  const sessionHash = tokenHash(token);
  const csrfHash = tokenHash(csrf);
  await pool.query("INSERT INTO private_accounts (id,username,password_hash,role,disabled) VALUES ($1,$2,$3,$4,false)", [id, 'delegation-test-' + id.slice(0, 12), tokenHash(hex()), role]);
  await pool.query("INSERT INTO private_sessions (token_hash,account_id,csrf_hash,expires_at) VALUES ($1,$2,$3,now()+interval '1 hour')", [sessionHash, id, csrfHash]);
  return { id, role, sessionHash, csrfHash, cookie: signSession(token, SESSION_KEY, 'private'), csrf };
}

export function sourceRoot(): string {
  const root = process.env.BOX_DELEGATION_BASELINE_ROOT;
  if (typeof root !== 'string' || root === '') throw new Error('BOX_DELEGATION_BASELINE_ROOT is not configured.');
  const resolved = new URL('file://' + root).pathname;
  if (resolved !== BASELINE_WORKDIR) throw new Error('BOX_DELEGATION_BASELINE_ROOT must equal the owned baseline workdir.');
  return root;
}

export async function baselineCommit(): Promise<string> {
  const path = process.env.BOX_DELEGATION_BASELINE_JSON ?? BASELINE_OUT;
  const baseline = JSON.parse(await readFile(path, 'utf8')) as { baseCommit?: unknown; fileCount?: unknown };
  if (typeof baseline.baseCommit !== 'string' || !/^[a-f0-9]{40}$/.test(baseline.baseCommit)) throw new Error('baseline_json_commit_missing');
  return baseline.baseCommit;
}

export function delegationSources() {
  return [{ id: 'private-shop', root: sourceRoot(), paths: [...PRIVATE_SHOP_SNAPSHOT_PATHS] }];
}

export function delegationServices(pool: PgPool) {
  const intake = new PrivateIntakeStore(pool as never, delegationSources());
  const intents = new IntentOrchestrator(new PrivateIntentStore(pool as never), intake);
  const boxes = new BoxStore(pool as never);
  const preparation = boxPreparationOrchestration(intake, intents, boxes, delegationSources());
  return { intake, intents, boxes, preparation };
}

export function delegationApi(pool: PgPool) {
  const sources = delegationSources();
  const app = createPrivateApi({ store: new SessionStore(pool as never, 'private', SESSION_KEY), mode: 'localhost_demo', intake: new PrivateIntakeStore(pool as never, sources), boxes: new BoxStore(pool as never), boxSources: sources });
  return { app, sources };
}

export function http(accountValue: DelegationAccount, method: 'GET' | 'POST', path: string, body?: unknown) {
  return { method, url: path, headers: { host: 'private.localhost:4000', origin: 'http://private.localhost:3000', cookie: 'private_session=' + accountValue.cookie, 'x-csrf-token': accountValue.csrf, 'content-type': 'application/json' }, ...(body === undefined ? {} : { payload: body }) };
}

export async function approvedIntentFor(pool: PgPool, actor: DelegationAccount, requestText: typeof REQUEST_A_TEXT, snapshotId: string) {
  const { intake, intents } = delegationServices(pool);
  const request = await intake.createRequest(actor, { snapshotId, ...requestText });
  const draft = await intents.createDraft(actor, request.id, { mode: 'demo' });
  const review = await intents.review(actor, draft.id);
  let version = review.version;
  let contentHashValue = review.contentHash;
  for (const decision of review.decisions.filter(item => item.required && item.answer === null)) {
    const resolved = await intents.resolveDecision(actor, review.id, { decisionId: decision.id, answer: 'Owner-approved delegation answer.', expectedVersion: version });
    version = resolved.version; contentHashValue = resolved.contentHash;
  }
  const ready = await intents.ready(actor, review.id, { expectedVersion: version, expectedHash: contentHashValue });
  await intents.approve(actor, review.id, { expectedVersion: ready.version, expectedHash: ready.contentHash });
  return { request, intentId: review.id };
}
