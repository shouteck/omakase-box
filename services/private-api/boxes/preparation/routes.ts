import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { authHandlers } from '../../../../packages/contracts/auth/http.js';
import type { AuthAction } from '../../../../packages/contracts/auth/policy.js';
import type { SessionActor } from '../../../../packages/contracts/auth/store.js';
import type { BoxPreparationOrchestration } from './types.js';
import { safeBoxError } from './types.js';

type Handlers = Pick<ReturnType<typeof authHandlers>, 'requirePermission'>;

export function installBoxPreparationRoutes(app: FastifyInstance, handlers: Handlers, preparation: BoxPreparationOrchestration) {
  async function act(request: FastifyRequest, reply: FastifyReply, action: AuthAction, operation: (actor: SessionActor) => Promise<unknown>) {
    const actor = handlers.requirePermission(request, reply, action);
    if (!actor) return;
    try { return await operation(actor); }
    catch (error) { return safeBoxError(reply, error); }
  }
  const param = (request: FastifyRequest) => (request.params as { id: string }).id;
  app.post('/v1/box-repositories', async (request, reply) => act(request, reply, 'snapshot.import', async actor => reply.code(201).send(await preparation.registerRepository(actor, request.body))));
  app.post('/v1/boxes/prepare', async (request, reply) => act(request, reply, 'box.write', async actor => reply.code(201).send(await preparation.prepare(actor, request.body))));
  app.get('/v1/boxes/:id/agreement', async (request, reply) => act(request, reply, 'box.read', async actor => reply.send(await preparation.agreement(actor, param(request)))));
  app.post('/v1/boxes/:id/behavior-approval', async (request, reply) => act(request, reply, 'box.behavior.approve', async actor => reply.send(await preparation.approve(actor, param(request), request.body))));
  app.post('/v1/boxes/:id/readiness', async (request, reply) => act(request, reply, 'box.write', async actor => reply.send(await preparation.readiness(actor, param(request), request.body))));
  app.post('/v1/boxes/:id/revisions', async (request, reply) => act(request, reply, 'box.write', async actor => reply.code(201).send(await preparation.revise(actor, param(request), request.body))));
}
