import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { authHandlers } from '../../../packages/contracts/auth/http.js';
import type { AuthAction } from '../../../packages/contracts/auth/policy.js';
import type { SessionActor } from '../../../packages/contracts/auth/store.js';
import { safePreparationError } from './types.js';
import type { PreparationOrchestration } from './orchestrator.js';

type Handlers = Pick<ReturnType<typeof authHandlers>, 'requirePermission'>;

export function installPreparationRoutes(app: FastifyInstance, handlers: Handlers, orchestration: PreparationOrchestration) {
  async function act(request: FastifyRequest, reply: FastifyReply, action: AuthAction, operation: (actor: SessionActor) => Promise<unknown>) {
    const actor = handlers.requirePermission(request, reply, action);
    if (!actor) return;
    try { return await operation(actor); }
    catch (error) { return safePreparationError(reply, error); }
  }
  const param = (request: FastifyRequest) => z.uuid().parse((request.params as { id: string }).id);
  app.post('/v1/intents/:id/preparation', async (request, reply) => act(request, reply, 'intent.read', async actor => reply.code(201).send(await orchestration.propose(actor, param(request), request.body))));
}
