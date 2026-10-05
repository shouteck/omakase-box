import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { authHandlers } from '../../../packages/contracts/auth/http.js';
import { WorkflowError } from '../../../packages/contracts/workflow/index.js';
import { AcceptanceRejected } from '../ledger/acceptance-transaction/record.js';
import type { PrivateAcceptanceStore } from './store.js';

const ParamsSchema = z.strictObject({ evaluationId: z.uuid() });
const DecisionSchema = z.strictObject({ expectedVersion: z.number().int().positive() });

function safeFailure(reply: FastifyReply, error: unknown) {
  if (error instanceof WorkflowError) return reply.code(error.code === 'forbidden_role' ? 403 : error.code === 'stale_version' ? 409 : 422).send({ error: error.code });
  if (error instanceof AcceptanceRejected) {
    const status = error.code === 'stale_version' || error.code === 'stale_state' || error.code === 'duplicate_event' ? 409 : 503;
    return reply.code(status).send({ error: error.code });
  }
  if (error instanceof z.ZodError) return reply.code(400).send({ error: 'invalid_input' });
  return reply.code(503).send({ error: 'acceptance_unavailable' });
}

/**
 * Owner acceptance routes (M7.2). Only `acceptance.approve` (owner) can
 * decide; the store re-verifies owner session, exact bound revision and
 * atomicity inside the transaction. Responses carry the bounded decision
 * vocabulary only — no private detail.
 */
export function installAcceptanceRoutes(app: FastifyInstance, handlers: Pick<ReturnType<typeof authHandlers>, 'requirePermission'>, store: Pick<PrivateAcceptanceStore, 'accept' | 'reject' | 'compensate' | 'pending'>) {
  const owner = (request: Parameters<ReturnType<typeof authHandlers>['requirePermission']>[0], reply: FastifyReply) => {
    const actor = handlers.requirePermission(request, reply, 'acceptance.approve');
    if (!actor) {
      if (!reply.sent) reply.code(401).send({ error: 'authentication_denied' });
      return null;
    }
    return actor;
  };

  app.get('/v1/acceptance/pending', async (request, reply) => {
    if (!owner(request, reply)) return;
    try { return reply.send({ evaluations: await store.pending() }); }
    catch (error) { return safeFailure(reply, error); }
  });

  for (const [action, method] of [['accept', 'accept'], ['reject', 'reject'], ['compensate', 'compensate']] as const) {
    app.post(`/v1/acceptance/evaluations/:evaluationId/${action}`, async (request, reply) => {
      const actor = owner(request, reply);
      if (!actor) return;
      try {
        const params = ParamsSchema.parse(request.params);
        const body = DecisionSchema.parse(request.body);
        const result = await store[method](actor, { evaluationId: params.evaluationId, expectedVersion: body.expectedVersion });
        return reply.code(result.created ? 201 : 200).send(result);
      } catch (error) { return safeFailure(reply, error); }
    });
  }
}
