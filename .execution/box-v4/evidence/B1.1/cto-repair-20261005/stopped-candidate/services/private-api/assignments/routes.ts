import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { authHandlers } from '../../../packages/contracts/auth/http.js';
import { WorkflowError } from '../../../packages/contracts/workflow/index.js';
import type { PrivateAssignmentStore } from './store.js';
import { AssignmentNotFound } from './store.js';

function safeFailure(reply: FastifyReply, error: unknown) {
  if (error instanceof AssignmentNotFound) return reply.code(404).send({ error: 'not_found' });
  if (error instanceof WorkflowError) return reply.code(error.code === 'forbidden_role' ? 403 : error.code === 'stale_version' ? 409 : 422).send({ error: error.code });
  if (error instanceof z.ZodError) return reply.code(400).send({ error: 'invalid_input' });
  return reply.code(503).send({ error: 'assignment_unavailable' });
}

export function installOwnerAssignmentRoutes(app: FastifyInstance, handlers: Pick<ReturnType<typeof authHandlers>, 'requirePermission'>, store: Pick<PrivateAssignmentStore, 'choose' | 'revokeInvitation'>) {
  app.post('/v1/assignments', async (request, reply) => {
    const actor = handlers.requirePermission(request, reply, 'assignment.approve');
    if (!actor) {
      if (!reply.sent) return reply.code(401).send({ error: 'authentication_denied' });
      return;
    }
    try { return reply.code(201).send(await store.choose(actor, request.body)); }
    catch (error) { return safeFailure(reply, error); }
  });
  app.post('/v1/assignments/:assignmentId/invitation-revocation', async (request, reply) => {
    const actor = handlers.requirePermission(request, reply, 'assignment.approve');
    if (!actor) {
      if (!reply.sent) return reply.code(401).send({ error: 'authentication_denied' });
      return;
    }
    try { return reply.code(201).send(await store.revokeInvitation(actor, { assignmentId: (request.params as { assignmentId?: string }).assignmentId })); }
    catch (error) { return safeFailure(reply, error); }
  });
}
