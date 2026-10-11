import { execFileSync } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { afterAll } from 'vitest';
import { chromium } from '@playwright/test';
import { acquireHostRuntime, type HostRuntime } from '../../../scripts/host-test-runtime.mjs';

export const root = process.cwd();
const DIST = join(root, 'apps', 'private-console', 'dist');
const BROWSERS = join(root, '.runtime', 'browsers');

// Both APIs run as host children on 127.0.0.2: Docker Desktop can hold 127.0.0.1:4000 and the
// whole 127/8 block is loopback, so the private.localhost:4000/3000 contract headers are kept.
export const API_HOST = '127.0.0.2';

let runtime: HostRuntime | undefined;
export async function ensureRuntime(): Promise<void> {
  if (runtime) return;
  const acquired = await acquireHostRuntime();
  try {
    await acquired.startServices({ host: API_HOST });
  } catch (error) {
    await acquired.cleanup();
    throw error;
  }
  runtime = acquired;
}

afterAll(async () => {
  const acquired = runtime;
  runtime = undefined;
  await acquired?.cleanup();
});

export interface Account { id: string; username: string; role: string }
export async function seedAccounts(): Promise<{ accounts: Account[]; intentId?: string }> {
  return await runtime!.runFixture('private-api', 'auth/fixture', { action: 'seed' }) as { accounts: Account[] };
}
export async function fixtureAction(command: Record<string, unknown>): Promise<void> {
  await runtime!.runFixture('private-api', 'auth/fixture', command);
}
export async function externalSeed(): Promise<{ accounts: Account[] }> {
  return await runtime!.runFixture('external-api', 'auth/fixture', { action: 'seed' }) as { accounts: Account[] };
}

export interface HttpResponse { status: number; body: unknown; text: string; headers: Record<string, string | string[] | undefined> }
export function http(scope: 'private' | 'external', method: 'GET' | 'POST', path: string, body?: unknown, headers: Record<string, string> = {}): Promise<HttpResponse> {
  const port = scope === 'private' ? 4000 : 4001;
  const host = scope === 'private' ? 'private.localhost' : 'contributor.localhost';
  const origin = scope === 'private' ? 'http://private.localhost:3000' : 'http://contributor.localhost:3001';
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: API_HOST, port, path, method, headers: { Host: `${host}:${port}`, Origin: origin, 'Content-Type': 'application/json', ...headers }, timeout: 30000 }, response => {
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 2097152) { response.destroy(new Error('Bounded e2e response exceeded.')); return; } chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => { const text = Buffer.concat(chunks).toString(); resolve({ status: response.statusCode ?? 0, body: text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null, text, headers: response.headers }); });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Bounded e2e request timeout.')));
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
export interface Session { Cookie: string; 'X-CSRF-Token': string }
export async function signIn(scope: 'private' | 'external', account: Account, password = 'synthetic-auth-password-only'): Promise<Session> {
  const response = await http(scope, 'POST', '/v1/auth/login', { username: account.username, password });
  if (response.status !== 200) throw new Error(`Synthetic sign-in failed with ${response.status}.`);
  const cookie = response.headers['set-cookie'];
  const raw = Array.isArray(cookie) ? cookie[0] : cookie;
  if (typeof raw !== 'string') throw new Error('Synthetic sign-in produced no session cookie.');
  return { Cookie: raw.split(';')[0]!, 'X-CSRF-Token': String((response.body as { csrfToken?: string }).csrfToken) };
}
export const asHeaders = (session: Session) => ({ Cookie: session.Cookie, 'X-CSRF-Token': session['X-CSRF-Token'] });

export async function registerSnapshot(operator: Session): Promise<{ id: string; snapshotHash: string; fileCount: number }> {
  const response = await http('private', 'POST', '/v1/snapshots', { sourceId: 'synthetic-shop' }, asHeaders(operator));
  if (response.status !== 201) throw new Error(`Synthetic snapshot registration failed with ${response.status}.`);
  return response.body as { id: string; snapshotHash: string; fileCount: number };
}
export async function createRequest(requester: Session, snapshotId: string, goal: string, extra: Record<string, unknown> = {}): Promise<{ id: string }> {
  const response = await http('private', 'POST', '/v1/requests', { snapshotId, goal, ...extra }, asHeaders(requester));
  if (response.status !== 201) throw new Error(`Synthetic request creation failed with ${response.status}.`);
  return response.body as { id: string };
}
export async function createIntent(requester: Session, requestId: string, mode: 'demo' | 'ollama' = 'demo'): Promise<HttpResponse> {
  return await http('private', 'POST', `/v1/requests/${requestId}/intents`, { mode }, asHeaders(requester));
}
export async function reviewIntent(session: Session, intentId: string): Promise<HttpResponse> {
  return await http('private', 'GET', `/v1/intents/${intentId}/review`, undefined, asHeaders(session));
}

export async function buildConsole(): Promise<void> {
  const cache = globalThis as { __syntheticIntentConsoleBuilt?: boolean };
  if (cache.__syntheticIntentConsoleBuilt === true) return;
  const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  execFileSync(process.execPath, [vite, 'build', 'apps/private-console', '--base', './'], { cwd: root, stdio: 'ignore', timeout: 240000, env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: BROWSERS } });
  cache.__syntheticIntentConsoleBuilt = true;
}

export interface ConsoleHandle { server: import('node:http').Server; close(): Promise<void> }
export async function serveConsole(): Promise<ConsoleHandle> {
  await buildConsole();
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://private.localhost:3000');
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/') pathname = '/index.html';
      const safe = normalize(pathname).replaceAll('\\', '/');
      if (safe !== '/index.html' && !safe.startsWith('/assets/')) { response.writeHead(404, { 'Content-Type': 'application/json' }); response.end('{"error":"not_found"}'); return; }
      const file = join(DIST, safe);
      if (!file.startsWith(DIST)) { response.writeHead(404, { 'Content-Type': 'application/json' }); response.end('{"error":"not_found"}'); return; }
      const bytes = await readFile(file);
      const type = safe.endsWith('.js') ? 'text/javascript' : safe.endsWith('.css') ? 'text/css' : safe.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(bytes);
    } catch { response.writeHead(404, { 'Content-Type': 'application/json' }); response.end('{"error":"not_found"}'); }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(3000, API_HOST, () => resolve()); });
  return { server, close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}

export async function launchConsole() {
  const browser = await chromium.launch({ headless: true, args: [`--host-resolver-rules=MAP private.localhost ${API_HOST}`] });
  const context = await browser.newContext();
  const page = await context.newPage();
  return { browser, context, page };
}
export async function consoleSignIn(page: import('@playwright/test').Page, account: Account) {
  await page.getByLabel('Username').fill(account.username);
  await page.getByLabel('Password').fill('synthetic-auth-password-only');
  await page.getByRole('button', { name: 'Sign in' }).click();
  const outcome = await Promise.race([
    page.getByText('Signed in as').waitFor({ timeout: 20000 }).then(() => 'ok' as const),
    page.getByText('Sign-in failed:').waitFor({ timeout: 20000 }).then(() => 'failed' as const)
  ]).catch(() => 'timeout' as const);
  if (outcome === 'ok') return;
  const status = await page.getByRole('status').first().textContent().catch(() => null);
  throw new Error(`Synthetic console sign-in failed (${outcome}): ${status ?? 'no status shown'}.`);
}
