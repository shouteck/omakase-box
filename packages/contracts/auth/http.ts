import { TLSSocket } from 'node:tls';
import type { IncomingHttpHeaders } from 'node:http';
import { z } from 'zod';
import { AuthDenied } from './store.js';
import type { SessionActor, SessionStore } from './store.js';
import { permits, validServiceRole } from './policy.js';
import type { AuthAction } from './policy.js';

export interface Request { method: string; url: string; ip: string; headers: IncomingHttpHeaders; body: unknown; raw: { socket: object } }
export interface Reply { code(code: number): Reply; header(name: string, value: string): Reply; send(body: unknown): unknown }
const LoginSchema = z.strictObject({ username: z.string().regex(/^[A-Za-z0-9_.-]{3,64}$/), password: z.string().min(1).max(128) });
const RedeemSchema = LoginSchema.extend({ token: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export function authHandlers(store: SessionStore, scope: 'private' | 'external', origin: string, mode: 'localhost_demo' | 'production', serialize: (token: string, mode: 'localhost_demo' | 'production') => string) {
  const actors = new WeakMap<object, SessionActor>();
  const rates = new Map<string, { start: number; count: number }>();
  const name = (mode === 'production' ? '__Host-' : '') + (scope === 'private' ? 'private_session' : 'contributor_session');
  function actor(request: Request): SessionActor {
    const result = actors.get(request);
    if (!result) throw new AuthDenied();
    return result;
  }
  function cookie(request: Request): string {
    const matches = (request.headers.cookie ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith(name + '='));
    if (matches.length !== 1) throw new AuthDenied();
    return matches[0]!.slice(name.length + 1);
  }
  async function guard(request: Request, reply: Reply) {
    const path = request.url.split('?')[0];
    if (path === '/health' && request.method === 'GET') return;
    if (mode === 'production' && !(request.raw.socket instanceof TLSSocket && request.raw.socket.encrypted)) return reply.code(403).send({ error: 'tls_required' });
    const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    if (mutating && request.headers.origin !== origin) return reply.code(403).send({ error: 'forbidden' });
    if (request.headers.origin === origin) reply.header('Access-Control-Allow-Credentials', 'true');
    if (request.method === 'OPTIONS') {
      if (request.headers.origin !== origin || !['GET','POST'].includes(String(request.headers['access-control-request-method']))) return reply.code(403).send({ error: 'forbidden' });
      reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
      reply.header('Access-Control-Allow-Credentials', 'true');
      return reply.code(204).send(null);
    }
    if (request.method === 'POST' && ['/v1/auth/login', '/v1/auth/redeem'].includes(path ?? '')) {
      const now = Date.now();
      for (const [key, entry] of rates) if (now - entry.start > 300000) rates.delete(key);
      if (!rates.has(request.ip) && rates.size >= 1024) return reply.code(429).send({ error: 'rate_limited' });
      const entry = rates.get(request.ip) ?? { start: now, count: 0 }; entry.count++; rates.set(request.ip, entry);
      if (entry.count > 20) return reply.code(429).send({ error: 'rate_limited' });
      return;
    }
    try {
      const csrf = request.headers['x-csrf-token'];
      const result = mutating ? await store.authenticateMutation(cookie(request), typeof csrf === 'string' ? csrf : '') : await store.authenticate(cookie(request));
      if (!validServiceRole(scope, result.role)) throw new AuthDenied();
      actors.set(request, result);
      if (request.headers.origin === origin) reply.header('Access-Control-Allow-Credentials', 'true');
    } catch (error) {
      return reply.code(error instanceof AuthDenied ? 401 : 503).send({ error: error instanceof AuthDenied ? 'authentication_denied' : 'authentication_unavailable' });
    }
  }
  async function login(request: Request, reply: Reply) {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_input' });
    try {
      const result = await store.login(parsed.data.username, parsed.data.password);
      reply.header('Set-Cookie', serialize(result.cookie, mode));
      reply.header('Access-Control-Allow-Credentials', 'true');
      return reply.send({ csrfToken: result.csrfToken });
    } catch (error) { return reply.code(error instanceof AuthDenied ? 401 : 503).send({ error: error instanceof AuthDenied ? 'authentication_denied' : 'authentication_unavailable' }); }
  }
  async function redeem(request: Request, reply: Reply) {
    const parsed = RedeemSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_input' });
    try { await store.redeemInvitation(parsed.data.token, parsed.data.username, parsed.data.password); return reply.code(201).send({ status: 'invitation_redeemed' }); }
    catch { return reply.code(403).send({ error: 'invitation_denied' }); }
  }
  async function session(request: Request, reply: Reply) {
    const current = actor(request);
    return reply.send(scope === 'private' ? { id: current.id, role: current.role } : { id: current.id });
  }
  function requirePermission(request: Request, reply: Reply, action: AuthAction): SessionActor | null {
    const current = actors.get(request);
    if (!current) { reply.code(401).send({ error: 'authentication_denied' }); return null; }
    if (!permits(scope, current.role, action)) { reply.code(403).send({ error: 'forbidden' }); return null; }
    return current;
  }
  async function logout(request: Request, reply: Reply) {
    try {
      await store.revokeSession(actor(request));
      reply.header('Set-Cookie', serialize('0'.repeat(64), mode).replace(/Max-Age=\d+/, 'Max-Age=0'));
      return reply.send({ status: 'signed_out' });
    } catch (error) { return reply.code(error instanceof AuthDenied ? 401 : 503).send({ error: error instanceof AuthDenied ? 'authentication_denied' : 'authentication_unavailable' }); }
  }
  return { guard, login, redeem, session, logout, actor, requirePermission };
}
