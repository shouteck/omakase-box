import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { authHandlers } from '../../../packages/contracts/auth/http.js';
import type { AuthAction } from '../../../packages/contracts/auth/policy.js';
import type { SessionActor } from '../../../packages/contracts/auth/store.js';
import { safeIntentError } from './types.js';
import type { IntentOrchestration } from './orchestrator.js';

type Handlers = Pick<ReturnType<typeof authHandlers>, 'requirePermission'>;

export function installIntentRoutes(app: FastifyInstance, handlers: Handlers, orchestration: IntentOrchestration) {
  async function act(request: FastifyRequest, reply: FastifyReply, action: AuthAction, operation: (actor: SessionActor) => Promise<unknown>) {
    const actor = handlers.requirePermission(request, reply, action);
    if (!actor) return;
    try { return await operation(actor); }
    catch (error) { return safeIntentError(reply, error); }
  }
  const param = (request: FastifyRequest) => z.uuid().parse((request.params as { id: string }).id);
  app.post('/v1/requests/:id/intents', async (request, reply) => act(request, reply, 'intent.write', async actor => reply.code(201).send(await orchestration.createDraft(actor, param(request), request.body))));
  app.get('/v1/requests/:id/intent', async (request, reply) => act(request, reply, 'intent.read', async actor => reply.send(await orchestration.currentForRequest(actor, param(request)))));
  app.get('/v1/intents/:id/review', async (request, reply) => act(request, reply, 'intent.read', async actor => reply.send(await orchestration.review(actor, param(request)))));
  app.post('/v1/intents/:id/decisions', async (request, reply) => act(request, reply, 'intent.write', async actor => reply.send(await orchestration.resolveDecision(actor, param(request), request.body))));
  app.post('/v1/intents/:id/revisions', async (request, reply) => act(request, reply, 'intent.write', async actor => reply.code(201).send(await orchestration.revise(actor, param(request), request.body))));
  app.post('/v1/intents/:id/readiness', async (request, reply) => act(request, reply, 'intent.write', async actor => reply.send(await orchestration.ready(actor, param(request), request.body))));
  app.post('/v1/intents/:id/approval', async (request, reply) => act(request, reply, 'intent.approve', async actor => reply.send(await orchestration.approve(actor, param(request), request.body))));
}
