import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { authHandlers } from '../../../packages/contracts/auth/http.js';
import { WorkflowError } from '../../../packages/contracts/workflow/index.js';
import type { PrivateReleaseStore } from './store.js';

function safeReleaseError(reply: FastifyReply, error: unknown) {
  if (error instanceof WorkflowError) return reply.code(error.code === 'forbidden_role' ? 403 : error.code === 'stale_version' ? 409 : 422).send({ error: error.code });
  if (error instanceof z.ZodError || error instanceof Error && error.message === 'invalid_release_candidate') return reply.code(400).send({ error: 'invalid_input' });
  if (error instanceof Error && 'code' in error && error.code === '23505') return reply.code(409).send({ error: 'stale_version' });
  return reply.code(503).send({ error: 'release_unavailable' });
}
export function installReleaseRoutes(app: FastifyInstance, handlers: Pick<ReturnType<typeof authHandlers>, 'requirePermission'>, store: PrivateReleaseStore) {
  app.post('/v1/release-candidates', { bodyLimit: 16777216 }, async (request, reply) => {
    const actor = handlers.requirePermission(request, reply, 'release.approve');
    if (!actor) return;
    try { return reply.code(201).send(await store.stage(actor, request.body)); }
    catch (error) { return safeReleaseError(reply, error); }
  });
  app.get('/v1/release-candidates/:id', async (request, reply) => {
    const actor = handlers.requirePermission(request, reply, 'release.approve');
    if (!actor) return;
    try { return await store.review(actor, z.uuid().parse((request.params as { id: string }).id)); }
    catch (error) { return safeReleaseError(reply, error); }
  });
  app.post('/v1/release-candidates/:id/approval', async (request, reply) => {
    const actor = handlers.requirePermission(request, reply, 'release.approve');
    if (!actor) return;
    try { return await store.approve(actor, z.uuid().parse((request.params as { id: string }).id), request.body); }
    catch (error) { return safeReleaseError(reply, error); }
  });
}
