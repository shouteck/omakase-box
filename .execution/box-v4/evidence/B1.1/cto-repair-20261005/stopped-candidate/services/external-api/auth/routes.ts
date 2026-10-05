import type { FastifyInstance } from 'fastify';
import { authHandlers } from '../../../packages/contracts/auth/http.js';
import type { SessionStore } from '../../../packages/contracts/auth/store.js';
import { contributorSessionCookie } from '../bootstrap/cookie-policy.js';
import { AuthDenied } from '../../../packages/contracts/auth/store.js';
import type { ExternalResourceAccess } from './resources.js';

export function installContributorAuth(app: FastifyInstance, store: SessionStore, mode: 'localhost_demo' | 'production', resources?: Partial<Pick<ExternalResourceAccess, 'reservation' | 'submission'>>) {
  const handlers = authHandlers(store, 'external', 'http://contributor.localhost:3001', mode, contributorSessionCookie);
  app.addHook('onRequest', async (request, reply) => {
    // Signed assignment commands carry their own Ed25519 authority over the
    // internal delivery network; browser origin/session rules do not apply.
    if (request.method === 'POST' && (request.url === '/v1/assignment-commands' || request.url === '/v1/submission-exports' || request.url === '/v1/feedback-ingest')) return;
    return handlers.guard(request, reply);
  });
  app.post('/v1/auth/login', handlers.login);
  app.post('/v1/auth/redeem', handlers.redeem);
  app.get('/v1/auth/session', handlers.session);
  app.post('/v1/auth/logout', handlers.logout);
  if (resources?.reservation) {
    const reservation = resources.reservation;
    app.get('/v1/reservations/:id', async (request, reply) => {
      const current = handlers.requirePermission(request, reply, 'reservation.read');
      if (!current) return;
      try { return reply.send(await reservation(current, (request.params as { id: string }).id)); }
      catch (error) { return reply.code(error instanceof AuthDenied ? 404 : 503).send({ error: error instanceof AuthDenied ? 'not_found' : 'resource_unavailable' }); }
    });
  }
  if (resources?.submission) {
    const submission = resources.submission;
    app.get('/v1/submissions/:id/status', async (request, reply) => {
      const current = handlers.requirePermission(request, reply, 'submission.read');
      if (!current) return;
      try { return reply.send(await submission(current, (request.params as { id: string }).id)); }
      catch (error) { return reply.code(error instanceof AuthDenied ? 404 : 503).send({ error: error instanceof AuthDenied ? 'not_found' : 'resource_unavailable' }); }
    });
  }
  return handlers;
}
