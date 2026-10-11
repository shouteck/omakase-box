import Fastify from 'fastify';
import { installPrivateAuth } from '../../auth/routes.js';
import type { SessionStore } from '../../../../packages/contracts/auth/store.js';
import type { PrivateResourceAccess } from '../../auth/resources.js';
import { installIntakeRoutes } from '../../requests/routes.js';
import type { PrivateIntakeStore } from '../../requests/store.js';
import { installIntentRoutes } from '../../intents/routes.js';
import { intentOrchestrationForIntake } from '../../intents/orchestrator.js';
import type { IntentOrchestration } from '../../intents/orchestrator.js';
import { installPreparationRoutes } from '../../preparations/routes.js';
import { PreparationOrchestrator } from '../../preparations/orchestrator.js';
import { SyntheticShopPlanningIntegrationSource } from '../../preparations/demo-integration.js';
import type { PreparationOrchestration } from '../../preparations/orchestrator.js';
import { PrivateIntentStore } from '../../db/intent-store.js';
import type { Pool } from 'pg';
import { installReleaseRoutes } from '../../releases/routes.js';
import type { PrivateReleaseStore } from '../../releases/store.js';
import type { ApprovedReleaseCompiler } from '../../releases/compiler.js';
import { installCompilationRoutes } from '../../releases/compiler-routes.js';
import { installOwnerAssignmentRoutes } from '../../assignments/routes.js';
import type { PrivateAssignmentStore } from '../../assignments/store.js';
import { installReadinessRoutes } from '../../readiness/routes.js';
import type { PrivateReadinessStore } from '../../readiness/store.js';
import { installAcceptanceRoutes } from '../../acceptance/routes.js';
import type { PrivateAcceptanceStore } from '../../acceptance/store.js';
import { installBoxPreparationRoutes } from '../../boxes/preparation/routes.js';
import { boxPreparationOrchestration } from '../../boxes/preparation/orchestrator.js';
import type { BoxPreparationOrchestration } from '../../boxes/preparation/types.js';
import type { BoxStore } from '../../boxes/store/store.js';
import type { SnapshotSource } from '../../requests/types.js';

function preparationOrchestrationForIntake(intake: PrivateIntakeStore, modelConfiguration?: unknown): PreparationOrchestration | null {
  const database = (intake as unknown as { database?: unknown }).database;
  if (!database || typeof (database as { connect?: unknown }).connect !== 'function') return null;
  return new PreparationOrchestrator(intake, new PrivateIntentStore(database as Pool), new SyntheticShopPlanningIntegrationSource(), modelConfiguration);
}

export function createPrivateApi(auth?: { store: SessionStore; mode: 'localhost_demo' | 'production'; resources?: PrivateResourceAccess; intake?: PrivateIntakeStore; intents?: IntentOrchestration; preparations?: PreparationOrchestration; releases?: PrivateReleaseStore; releaseCompiler?: ApprovedReleaseCompiler; assignments?: Pick<PrivateAssignmentStore, 'choose' | 'revokeInvitation'>; readiness?: Pick<PrivateReadinessStore, 'record' | 'list' | 'decide'>; acceptance?: Pick<PrivateAcceptanceStore, 'accept' | 'reject' | 'compensate' | 'pending'>; boxes?: BoxStore; boxSources?: readonly SnapshotSource[]; boxPreparation?: BoxPreparationOrchestration }) {
  const app = Fastify({ logger: false, bodyLimit: 65536, trustProxy: false });
  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (request.headers.host !== 'private.localhost:4000' || (origin !== undefined && origin !== 'http://private.localhost:3000')) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cache-Control', 'no-store');
    if (origin) reply.header('Access-Control-Allow-Origin', origin).header('Vary', 'Origin');
  });
  if (auth) {
    const handlers = installPrivateAuth(app, auth.store, auth.mode, auth.resources);
    if (auth.intake) installIntakeRoutes(app, handlers, auth.intake);
    const intents = auth.intents ?? (auth.intake ? intentOrchestrationForIntake(auth.intake) : undefined);
    if (intents) installIntentRoutes(app, handlers, intents);
    const preparations = auth.preparations ?? (auth.mode === 'localhost_demo' && auth.intake ? preparationOrchestrationForIntake(auth.intake) : undefined);
    if (preparations) installPreparationRoutes(app, handlers, preparations);
    if (auth.releases) installReleaseRoutes(app, handlers, auth.releases);
    if (auth.releaseCompiler) installCompilationRoutes(app, handlers, auth.releaseCompiler);
    if (auth.assignments) installOwnerAssignmentRoutes(app, handlers, auth.assignments);
    if (auth.readiness) installReadinessRoutes(app, handlers, auth.readiness);
    if (auth.acceptance) installAcceptanceRoutes(app, handlers, auth.acceptance);
    const boxPreparation = auth.boxPreparation ?? (auth.intake && intents && auth.boxes ? boxPreparationOrchestration(auth.intake, intents, auth.boxes, auth.boxSources ?? []) : undefined);
    if (boxPreparation) installBoxPreparationRoutes(app, handlers, boxPreparation);
  } else app.addHook('onRequest', async (request, reply) => { if (request.url !== '/health' || request.method !== 'GET') return reply.code(404).send({ error: 'not_found' }); });
  app.get('/health', async () => ({ service: 'private-api', status: 'bootstrap', assurance: 'tested', productReady: false }));
  app.setNotFoundHandler(async (_request, reply) => reply.code(404).send({ error: 'not_found' }));
  app.setErrorHandler(async (error, _request, reply) => {
    const code = error instanceof Error && 'statusCode' in error ? error.statusCode : undefined;
    const status = code === 413 ? 413 : code === 400 ? 400 : 500;
    return reply.code(status).send({ error: status === 413 ? 'payload_too_large' : status === 400 ? 'invalid_input' : 'internal_error' });
  });
  return app;
}
