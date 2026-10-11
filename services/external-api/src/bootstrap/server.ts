import Fastify from 'fastify';
import { installContributorAuth } from '../../auth/routes.js';
import type { SessionStore } from '../../../../packages/contracts/auth/store.js';
import type { ExternalResourceAccess } from '../../auth/resources.js';
import type { AuthAction } from '../../../../packages/contracts/auth/policy.js';
import { installAssignmentCommandRoutes, installContributorReservationRoutes, type ReservationRouteContext } from '../../reservations/routes.js';
import type { SqlAssignmentCommandReceiver } from '../../reservations/assignment-receiver.js';
import { installContributorSubmissionRoutes, installSubmissionExportRoutes } from '../../submissions/routes.js';
import type { SubmissionExportReceiver } from '../../submissions/export-receiver.js';
import type { SqlSubmissionStore } from '../../submissions/store.js';
import { installContributorStatusRoutes, installFeedbackIngestRoutes } from '../../status/routes.js';
import type { FeedbackIngestReceiver } from '../../status/receiver.js';
import type { SqlExternalStatusStore } from '../../status/store.js';

export function createExternalApi(auth?: { store: SessionStore; mode: 'localhost_demo' | 'production'; resources?: Partial<Pick<ExternalResourceAccess, 'reservation' | 'submission'>>; reservations?: ReservationRouteContext; commands?: SqlAssignmentCommandReceiver; submissions?: SqlSubmissionStore; exports?: SubmissionExportReceiver; status?: SqlExternalStatusStore; feedbackIngest?: FeedbackIngestReceiver }) {
  const app = Fastify({ logger: false, bodyLimit: 2_097_152, trustProxy: false });
  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    const commandIngest = request.method === 'POST' && request.url === '/v1/assignment-commands';
    const exportIngest = request.method === 'POST' && request.url === '/v1/submission-exports';
    const feedbackIngest = request.method === 'POST' && request.url === '/v1/feedback-ingest';
    const internalIngest = commandIngest || exportIngest || feedbackIngest;
    const allowedHost = internalIngest
      ? request.headers.host === 'external-api:4001'
      : request.headers.host === 'contributor.localhost:4001';
    if (!allowedHost || (!internalIngest && origin !== undefined && origin !== 'http://contributor.localhost:3001')) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cache-Control', 'no-store');
    if (origin) reply.header('Access-Control-Allow-Origin', origin).header('Vary', 'Origin');
  });
  if (auth) {
    const handlers = installContributorAuth(app, auth.store, auth.mode, auth.resources);
    if (auth.reservations) installContributorReservationRoutes(app, auth.reservations, { requirePermission: (request, reply, action) => handlers.requirePermission(request, reply, action as AuthAction) });
    if (auth.commands) installAssignmentCommandRoutes(app, auth.commands);
    if (auth.exports) installSubmissionExportRoutes(app, auth.exports);
    if (auth.feedbackIngest) installFeedbackIngestRoutes(app, auth.feedbackIngest);
    if (auth.submissions) installContributorSubmissionRoutes(app, auth.submissions, { requirePermission: (request, reply, action) => handlers.requirePermission(request, reply, action as AuthAction) });
    if (auth.status) installContributorStatusRoutes(app, auth.status, { requirePermission: (request, reply, action) => handlers.requirePermission(request, reply, action as AuthAction) });
  }
  else app.addHook('onRequest', async (request, reply) => { if (request.url !== '/health' || request.method !== 'GET') return reply.code(404).send({ error: 'not_found' }); });
  app.get('/health', async () => ({ service: 'external-api', status: 'bootstrap', assurance: 'tested', productReady: false }));
  app.setNotFoundHandler(async (_request, reply) => reply.code(404).send({ error: 'not_found' }));
  app.setErrorHandler(async (_error, _request, reply) => reply.code(500).send({ error: 'internal_error' }));
  return app;
}
