import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authHandlers } from '../../../packages/contracts/auth/http.js';
import { AuthDenied } from '../../../packages/contracts/auth/store.js';
import type { SessionStore } from '../../../packages/contracts/auth/store.js';
import { privateSessionCookie } from '../bootstrap/cookie-policy.js';
import type { PrivateResourceAccess } from './resources.js';

export function installPrivateAuth(app: FastifyInstance, store: SessionStore, mode: 'localhost_demo' | 'production', resources?: PrivateResourceAccess) {
  const handlers = authHandlers(store, 'private', 'http://private.localhost:3000', mode, privateSessionCookie);
  app.addHook('onRequest', handlers.guard);
  app.post('/v1/auth/login', handlers.login);
  app.post('/v1/auth/redeem', handlers.redeem);
  app.get('/v1/auth/session', handlers.session);
  app.post('/v1/auth/logout', handlers.logout);
  if (resources) app.get('/v1/intents/:id', async (request, reply) => {
    const current = handlers.requirePermission(request, reply, 'intent.read');
    if (!current) return;
    try { return reply.send(await resources.intent(current, (request.params as { id: string }).id)); }
    catch (error) { return reply.code(error instanceof AuthDenied ? 404 : 503).send({ error: error instanceof AuthDenied ? 'not_found' : 'resource_unavailable' }); }
  });
  app.post('/v1/auth/invitations', async (request, reply) => {
    const parsed = z.strictObject({ role: z.enum(['requester','operator']) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_input' });
    const actor = handlers.requirePermission(request, reply, 'invitation.create');
    if (!actor) return;
    try { return reply.code(201).send(await store.createPrivateInvitation(actor, parsed.data.role)); }
    catch (error) { return reply.code(error instanceof AuthDenied ? 403 : 503).send({ error: 'invitation_denied' }); }
  });
  return handlers;
}
