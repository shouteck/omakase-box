import type { Locator, Page } from '@playwright/test';
import { createServer, request as httpRequest, type IncomingMessage, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { build as viteBuild } from 'vite';
import { chromium } from '@playwright/test';
import Fastify from '../../../services/external-api/node_modules/fastify/fastify.js';
import { SessionStore } from '../../../packages/contracts/auth/store.js';
import { hashPassword, tokenHash } from '../../../packages/contracts/auth/crypto.js';
import type { AuthClient, AuthDatabase } from '../../../packages/contracts/auth/store.js';
import { contributorSessionCookie } from '../../../services/external-api/bootstrap/cookie-policy.js';
import { privateSessionCookie } from '../../../services/private-api/bootstrap/cookie-policy.js';
import { installContributorAuth } from '../../../services/external-api/auth/routes.js';
import { installContributorReservationRoutes } from '../../../services/external-api/reservations/routes.js';
import { MemoryAssignmentStore } from '../../../services/external-api/reservations/assignments.js';
import { MemoryReservationStore } from '../../../services/external-api/reservations/reservation-store.js';
import { MemoryDefectReportStore } from '../../../services/external-api/reservations/defect-reports.js';
import { MemoryPublishedTaskPersistence } from '../../../services/external-api/tasks/persistence.js';
import { PublishedTaskBoard } from '../../../services/external-api/tasks/board.js';
import type { PublishedReleaseRecord } from '../../../services/external-api/tasks/persistence.js';
import { receive } from '../../../services/external-api/bridge/release.js';
import { compiledFixture, receiverOptions, now as releaseFixtureTime } from '../../portal/publication/fixture.js';
import type { AuthAction } from '../../../packages/contracts/auth/policy.js';

export const root = process.cwd();
export const privateCanaryToken = 'private' + 'x'.repeat(25);
export const syntheticPassword = 'contributor-portal-synthetic-password';

export const portalPort = 3001;
const DIST = join(root, '.runtime', 'e2e-contributor-dist');

const expectedAuthStatements = [
  /^BEGIN$/,
  /^COMMIT$/,
  /^ROLLBACK$/,
  /^SELECT id,password_hash,disabled,'contributor' AS role FROM external_accounts WHERE username=\$1 FOR UPDATE$/,
  /^INSERT INTO external_sessions \(token_hash,account_id,csrf_hash,expires_at\) VALUES \(\$1,\$2,\$3,now\(\)\+interval '1 hour'\)$/,
  /^SELECT account\.id,'contributor' AS role,session\.csrf_hash FROM external_sessions AS session JOIN external_accounts AS account ON account\.id=session\.account_id WHERE session\.token_hash=\$1 AND session\.expires_at>now\(\) AND NOT account\.disabled$/,
  /^DELETE FROM external_sessions WHERE token_hash=\$1 AND account_id=\$2$/,
  /^SELECT \* FROM external_invitations WHERE token_hash=\$1 AND NOT revoked AND redeemed_at IS NULL AND expires_at>now\(\) FOR UPDATE$/,
  /^INSERT INTO external_accounts \(id,username,password_hash\) VALUES \(\$1,\$2,\$3\)$/,
  /^UPDATE external_invitations SET redeemed_at=now\(\) WHERE token_hash=\$1$/
];

/**
 * Test-only fail-closed in-memory authentication database. It implements the
 * exact persisted statements the accepted M1.3 SessionStore issues for the
 * external scope; any unrecognized statement fails instead of guessing.
 */
class MemoryAuthDatabase implements AuthDatabase {
  readonly accounts = new Map<string, { id: string; username: string; passwordHash: string; disabled: boolean }>();
  readonly sessions = new Map<string, { tokenHash: string; accountId: string; csrfHash: string; expiresAtMs: number }>();
  readonly invitations = new Map<string, { tokenHash: string; expiresAtMs: number; revoked: boolean; redeemedAtMs: number | null }>();

  async connect(): Promise<AuthClient> {
    const database = this;
    return {
      release() { /* in-memory placeholder client */ },
      async query(sql: string, parameters: unknown[] = []): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }> {
        if (!expectedAuthStatements.some(pattern => pattern.test(sql))) throw new Error(`Unrecognized synthetic auth statement: ${sql.slice(0, 80)}`);
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: null };
        if (sql.startsWith('SELECT id,password_hash')) {
          const account = database.accounts.get(String(parameters[0]));
          return account ? { rows: [{ id: account.id, password_hash: account.passwordHash, disabled: account.disabled, role: 'contributor' }], rowCount: 1 } : { rows: [], rowCount: 0 };
        }
        if (sql.startsWith('INSERT INTO external_sessions')) {
          database.sessions.set(String(parameters[0]), { tokenHash: String(parameters[0]), accountId: String(parameters[1]), csrfHash: String(parameters[2]), expiresAtMs: Date.now() + 3600_000 });
          return { rows: [], rowCount: 1 };
        }
        if (sql.startsWith('SELECT account.id,')) {
          const session = database.sessions.get(String(parameters[0]));
          if (!session || session.expiresAtMs <= Date.now()) return { rows: [], rowCount: 0 };
          const account = [...database.accounts.values()].find(item => item.id === session.accountId);
          if (!account || account.disabled) return { rows: [], rowCount: 0 };
          return { rows: [{ id: account.id, role: 'contributor', csrf_hash: session.csrfHash }], rowCount: 1 };
        }
        if (sql.startsWith('DELETE FROM external_sessions')) {
          const session = database.sessions.get(String(parameters[0]));
          if (!session || session.accountId !== parameters[1]) return { rows: [], rowCount: 0 };
          database.sessions.delete(String(parameters[0]));
          return { rows: [], rowCount: 1 };
        }
        if (sql.startsWith('SELECT * FROM external_invitations')) {
          const invitation = database.invitations.get(String(parameters[0]));
          if (!invitation || invitation.revoked || invitation.redeemedAtMs !== null || invitation.expiresAtMs <= Date.now()) return { rows: [], rowCount: 0 };
          return { rows: [{ token_hash: invitation.tokenHash, expires_at: new Date(invitation.expiresAtMs), revoked: false, redeemed_at: null }], rowCount: 1 };
        }
        if (sql.startsWith('INSERT INTO external_accounts')) {
          const id = String(parameters[0]);
          database.accounts.set(String(parameters[1]), { id, username: String(parameters[1]), passwordHash: String(parameters[2]), disabled: false });
          return { rows: [], rowCount: 1 };
        }
        const invitation = database.invitations.get(String(parameters[0]));
        if (invitation) invitation.redeemedAtMs = Date.now();
        return { rows: [], rowCount: invitation ? 1 : 0 };
      }
    };
  }
}

export interface ContributorWorld {
  database: MemoryAuthDatabase;
  store: SessionStore;
  persistence: MemoryPublishedTaskPersistence;
  board: PublishedTaskBoard;
  record: PublishedReleaseRecord;
  assignments: MemoryAssignmentStore;
  reservations: MemoryReservationStore;
  defects: MemoryDefectReportStore;
  taskId: string;
  taskVersion: number;
  invitationToken: string;
  customerLabel: string;
}

export async function buildWorld(): Promise<ContributorWorld> {
  const { packet, packageBytes, input } = compiledFixture();
  const persistence = new MemoryPublishedTaskPersistence();
  const options = receiverOptions();
  await receive(packet, packageBytes, { releaseKey: options.releaseKey, bridgeKey: options.bridgeKey, claimReplay: options.claimReplay, persistence, now: releaseFixtureTime + 1_000 });
  const record = await persistence.publishedVersion(input.contract.taskId, input.contract.version);
  if (!record) throw new Error('Synthetic publication fixture failed.');
  const database = new MemoryAuthDatabase();
  const store = new SessionStore(database, 'external', Buffer.alloc(32, 7));
  const assignments = new MemoryAssignmentStore();
  const reservations = new MemoryReservationStore({ published: persistence, assignments });
  const defects = new MemoryDefectReportStore({ reservation: (caller, reservationId, nowMs) => reservations.reservation(caller, reservationId, nowMs) });
  return { database, store, persistence, board: new PublishedTaskBoard(persistence), record, assignments, reservations, defects, taskId: input.contract.taskId, taskVersion: input.contract.version, invitationToken: '', customerLabel: 'Synthetic senior React contributor (component demo)' };
}

export function buildEmptyWorld() {
  const persistence = new MemoryPublishedTaskPersistence(), database = new MemoryAuthDatabase();
  const store = new SessionStore(database, 'external', Buffer.alloc(32, 7)), assignments = new MemoryAssignmentStore();
  const reservations = new MemoryReservationStore({ published: persistence, assignments }), defects = new MemoryDefectReportStore(reservations);
  return { persistence, database, store, assignments, reservations, defects, board: new PublishedTaskBoard(persistence) };
}

export async function seedContributorViaInvitation(world: Pick<ContributorWorld, 'database'>): Promise<string> {
  const passwordHash = await hashPassword(syntheticPassword);
  const token = 'b'.repeat(64);
  world.database.invitations.set(tokenHash(token), { tokenHash: tokenHash(token), expiresAtMs: Date.now() + 3600_000, revoked: false, redeemedAtMs: null });
  const client = await world.database.connect();
  try {
    const id = crypto.randomUUID();
    await client.query('BEGIN');
    const row = (await client.query('SELECT * FROM external_invitations WHERE token_hash=$1 AND NOT revoked AND redeemed_at IS NULL AND expires_at>now() FOR UPDATE', [tokenHash(token)])).rows[0];
    if (!row) throw new Error('Synthetic invitation missing.');
    await client.query('INSERT INTO external_accounts (id,username,password_hash) VALUES ($1,$2,$3)', [id, 'synthetic.portal.contributor', passwordHash]);
    await client.query('UPDATE external_invitations SET redeemed_at=now() WHERE token_hash=$1', [tokenHash(token)]);
    await client.query('COMMIT');
    return id;
  } finally { client.release(); }
}

export interface ReservationApi {
  url: string;
  close(): Promise<void>;
  cookies: string[];
  paths: string[];
}

export async function startReservationApi(world: Pick<ContributorWorld, 'store' | 'board' | 'reservations' | 'assignments' | 'defects'>): Promise<ReservationApi> {
  const app = Fastify({ logger: false, bodyLimit: 262144, trustProxy: false });
  const cookies: string[] = [];
  const paths: string[] = [];
  app.addHook('onRequest', async (request, reply) => {
    cookies.push(String(request.headers.cookie ?? ''));
    paths.push(String(request.url));
    const origin = request.headers.origin;
    if (origin !== undefined && origin !== 'http://contributor.localhost:3001') return reply.code(403).send({ error: 'forbidden' });
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cache-Control', 'no-store');
    if (origin === 'http://contributor.localhost:3001') reply.header('Access-Control-Allow-Origin', origin).header('Vary', 'Origin').header('Access-Control-Expose-Headers', 'X-Package-SHA256');
  });
  const handlers = installContributorAuth(app, world.store, 'localhost_demo');
  installContributorReservationRoutes(app, { board: world.board, reservations: world.reservations, assignments: world.assignments, defects: world.defects }, { requirePermission: (request, reply, action) => handlers.requirePermission(request, reply, action as AuthAction) });
  app.setErrorHandler(async (_error, _request, reply) => reply.code(500).send({ error: 'internal_error' }));
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('Synthetic reservation API listener missing.');
  return { url: `http://contributor.localhost:${address.port}`, cookies, paths, close: () => app.close() };
}

export async function buildHarness(): Promise<void> {
  const cache = globalThis as { __contributorE2eHarnessBuilt?: boolean };
  if (cache.__contributorE2eHarnessBuilt === true) return;
  await viteBuild({
    configFile: false,
    logLevel: 'silent',
    root,
    resolve: { alias: { react: join(root, 'apps/contributor-portal/node_modules/react'), 'react-dom': join(root, 'apps/contributor-portal/node_modules/react-dom') } },
    base: './',
    build: { outDir: '.runtime/e2e-contributor-dist', emptyOutDir: true, sourcemap: false, rollupOptions: { input: { harness: join(root, 'tests', 'e2e', 'contributor', 'harness', 'index.html') } } }
  });
  cache.__contributorE2eHarnessBuilt = true;
}

export interface HarnessServer { close(): Promise<void> }

export async function serveHarness(): Promise<HarnessServer> {
  await buildHarness();
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://contributor.localhost:${portalPort}`);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/') pathname = '/tests/e2e/contributor/harness/index.html';
      const safe = normalize(pathname).replaceAll('\\', '/');
      if (safe !== '/tests/e2e/contributor/harness/index.html' && !safe.startsWith('/assets/')) { response.writeHead(404, { 'Content-Type': 'application/json' }); response.end('{"error":"not_found"}'); return; }
      const file = join(DIST, safe);
      if (!file.startsWith(DIST)) { response.writeHead(404, { 'Content-Type': 'application/json' }); response.end('{"error":"not_found"}'); return; }
      const bytes = await readFile(file);
      const type = safe.endsWith('.js') ? 'text/javascript' : safe.endsWith('.css') ? 'text/css' : safe.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(bytes);
    } catch { response.writeHead(404, { 'Content-Type': 'application/json' }); response.end('{"error":"not_found"}'); }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', error => reject(new Error(`Harness UI port ${portalPort} could not be bound (${(error as Error).message}); do not terminate unknown processes to free it.`)));
    server.listen(portalPort, '127.0.0.1', () => resolve());
  });
  return { close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}

export interface ProbeServer { port: number; requests: string[]; close(): Promise<void> }

/** Plants the synthetic private session cookie exactly like the accepted M0.2 bootstrap probe. */
export async function startPrivateCookieProbe(): Promise<ProbeServer> {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.headers.cookie ?? '');
    const incoming = request as IncomingMessage;
    if (incoming.url === '/seed') response.setHeader('Set-Cookie', privateSessionCookie(privateCanaryToken, 'localhost_demo'));
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><title>Synthetic private cookie probe</title>');
  });
  await new Promise<void>((resolve, reject) => server.listen(0, '127.0.0.1', () => resolve()).once('error', reject));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Private cookie probe listener missing.');
  return { port: address.port, requests, close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}

export async function launchBrowser() {
  const browser = await chromium.launch({ headless: true, args: ['--host-resolver-rules=MAP contributor.localhost 127.0.0.1,MAP private.localhost 127.0.0.1'] });
  const context = await browser.newContext();
  const page = await context.newPage();
  return { browser, context, page };
}

export function portalUrl(apiUrl: string, screen: 'portal' | 'assignments' = 'portal'): string {
  return `http://contributor.localhost:${portalPort}/?api=${encodeURIComponent(apiUrl)}&screen=${screen}`;
}

export async function portalSignIn(page: Page): Promise<Locator> {
  await page.getByLabel('Username', { exact: true }).fill('synthetic.portal.contributor');
  await page.getByLabel('Password', { exact: true }).fill(syntheticPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const signedIn = page.getByText('Signed in as', { exact: false });
  await signedIn.waitFor({ timeout: 20000 });
  return signedIn;
}
