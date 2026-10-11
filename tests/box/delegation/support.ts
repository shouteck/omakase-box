import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { signSession, tokenHash } from '../../../packages/contracts/auth/crypto.js';
import { SessionStore } from '../../../packages/contracts/auth/store.js';
import { PrivateIntakeStore } from '../../../services/private-api/requests/store.js';
import { PrivateIntentStore } from '../../../services/private-api/db/intent-store.js';
import { IntentOrchestrator } from '../../../services/private-api/intents/orchestrator.js';
import { BoxStore } from '../../../services/private-api/boxes/store/store.js';
import { boxPreparationOrchestration } from '../../../services/private-api/boxes/preparation/orchestrator.js';
import { createPrivateApi } from '../../../services/private-api/src/bootstrap/server.js';
import { PRIVATE_SHOP_FILE_ROLES } from '../../../services/private-api/boxes/preparation/types.js';
import { migratedPool } from '../auth/support.js';

const run = promisify(execFile);
const REGISTER_FIXTURE = fileURLToPath(new URL('./register-fixture.mjs', import.meta.url));
const FIXTURE_MANIFEST = fileURLToPath(new URL('./fixture-manifest.json', import.meta.url));
const PRIVATE_SHOP_ROOT = fileURLToPath(new URL('../../../examples/private-shop', import.meta.url));

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

// The suite gets a disposable Postgres URL from scripts/verify.mjs in BOX_DELEGATION_DATABASE_URL. All database
// lifecycle rules live in migratedPool in tests/box/auth/support.ts (loopback-only, no query or fragment, pools
// built from the validated fields, database dropped when the pool ends); this wrapper hands it the delegation
// variable so the suite does not depend on the auth suite's variable.
export async function delegationPool(): Promise<{ pool: PgPool; database: string }> {
  const adminUrl = process.env.BOX_DELEGATION_DATABASE_URL;
  if (typeof adminUrl !== 'string' || !adminUrl.startsWith('postgres://')) throw new Error('BOX_DELEGATION_DATABASE_URL is not configured.');
  process.env.BOX_TEST_DATABASE_URL = adminUrl;
  const migrated = await migratedPool();
  const end = migrated.pool.end.bind(migrated.pool);
  let ended: Promise<void> | undefined;
  migrated.pool.end = () => ended ??= end().finally(() => removeRunDirectory());
  return migrated;
}

// Every run materializes the fixture git baseline in its own directory under the OS temp directory. The
// directory is removed when the suite's pool ends and, as a backstop, when the process exits; nothing is
// shared or left behind between runs.
let runDirectory: string | undefined;
function removeRunDirectory(): void {
  if (runDirectory !== undefined) rmSync(runDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
}
function runRoot(): string {
  if (runDirectory === undefined) {
    runDirectory = mkdtempSync(join(tmpdir(), 'box-d12-delegation-'));
    process.once('exit', removeRunDirectory);
  }
  return runDirectory;
}

export function baselineWorkdir(): string {
  return join(runRoot(), 'fixture-baseline');
}

export function baselineOut(): string {
  return join(runRoot(), 'baseline-out', 'baseline.json');
}

let runManifest: Promise<string> | undefined;
function manifestPath(): Promise<string> {
  return runManifest ??= (async () => {
    const template = JSON.parse(await readFile(FIXTURE_MANIFEST, 'utf8')) as Record<string, unknown>;
    const path = join(runRoot(), 'fixture-manifest.json');
    await writeFile(path, JSON.stringify({ ...template, sourceRoot: PRIVATE_SHOP_ROOT, baselineWorkdir: baselineWorkdir(), baselineOut: baselineOut() }, null, 2) + '\n');
    return path;
  })();
}

export interface FixtureBaseline { baseCommit: string; fileCount: number }

export async function materializeFixtureBaseline(): Promise<FixtureBaseline> {
  await run('node', [REGISTER_FIXTURE, '--manifest', await manifestPath(), '--out', baselineOut()], { timeout: 60000 });
  const baseline = JSON.parse(await readFile(baselineOut(), 'utf8')) as { baseCommit?: unknown; fileCount?: unknown };
  if (typeof baseline.baseCommit !== 'string' || !/^[a-f0-9]{40}$/.test(baseline.baseCommit) || typeof baseline.fileCount !== 'number') throw new Error('baseline_invalid');
  return { baseCommit: baseline.baseCommit, fileCount: baseline.fileCount };
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
  return baselineWorkdir();
}

export async function baselineCommit(): Promise<string> {
  return (await materializeFixtureBaseline()).baseCommit;
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

export function delegationApi(pool: PgPool): { app: ReturnType<typeof createPrivateApi>; sources: ReturnType<typeof delegationSources> } {
  const sources = delegationSources();
  const app = createPrivateApi({ store: new SessionStore(pool as never, 'private', SESSION_KEY), mode: 'localhost_demo', intake: new PrivateIntakeStore(pool as never, sources), boxes: new BoxStore(pool as never), boxSources: sources });
  return { app, sources };
}

export function http(accountValue: DelegationAccount, method: 'GET' | 'POST', path: string, body?: Record<string, unknown>) {
  const headers = { host: 'private.localhost:4000', origin: 'http://private.localhost:3000', cookie: 'private_session=' + accountValue.cookie, 'x-csrf-token': accountValue.csrf, 'content-type': 'application/json' };
  return body === undefined ? { method, url: path, headers } : { method, url: path, headers, payload: body };
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
