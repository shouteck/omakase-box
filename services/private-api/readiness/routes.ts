import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { authHandlers } from '../../../packages/contracts/auth/http.js';
import { ReadinessInvalid } from './model.js';
import type { PrivateReadinessStore } from './store.js';

const ParamsSchema = z.strictObject({ taskId: z.uuid(), version: z.coerce.number().int().min(1) });
const PublishSchema = z.strictObject({ packageDigest: z.string().regex(/^[a-f0-9]{64}$/) });

function safeFailure(reply: FastifyReply, error: unknown) {
  if (error instanceof ReadinessInvalid) return reply.code(error.code === 'conflict' ? 409 : 422).send({ error: error.code });
  if (error instanceof z.ZodError) return reply.code(400).send({ error: 'invalid_input' });
  return reply.code(503).send({ error: 'readiness_unavailable' });
}

/**
 * Readiness routes (M4.3). Evidence recording requires operator authority —
 * or owner authority for a human_review record. Gate evaluation and decision
 * persistence require the owner's publication.approve authority. Responses
 * expose only the bounded record/decision vocabulary.
 */
export function installReadinessRoutes(app: FastifyInstance, handlers: Pick<ReturnType<typeof authHandlers>, 'requirePermission'>, store: Pick<PrivateReadinessStore, 'record' | 'list' | 'decide'>) {
  app.post('/v1/readiness/records', async (request, reply) => {
    const body = request.body as { kind?: string } | null;
    const action = body?.kind === 'human_review' ? 'publication.approve' : 'evaluation.operate';
    const actor = handlers.requirePermission(request, reply, action);
    if (!actor) {
      if (!reply.sent) return reply.code(401).send({ error: 'authentication_denied' });
      return;
    }
    try { return reply.code(201).send({ record: await store.record(request.body, actor.id) }); }
    catch (error) { return safeFailure(reply, error); }
  });
  app.get('/v1/readiness/tasks/:taskId/versions/:version', async (request, reply) => {
    const actor = handlers.requirePermission(request, reply, 'release.approve');
    if (!actor) {
      if (!reply.sent) return reply.code(401).send({ error: 'authentication_denied' });
      return;
    }
    try {
      const params = ParamsSchema.parse(request.params);
      return reply.send({ records: await store.list(params.taskId, params.version) });
    } catch (error) { return safeFailure(reply, error); }
  });
  app.post('/v1/readiness/tasks/:taskId/versions/:version/publication', async (request, reply) => {
    const actor = handlers.requirePermission(request, reply, 'publication.approve');
    if (!actor) {
      if (!reply.sent) return reply.code(401).send({ error: 'authentication_denied' });
      return;
    }
    try {
      const params = ParamsSchema.parse(request.params);
      const body = PublishSchema.parse(request.body);
      const decision = await store.decide(params.taskId, params.version, body.packageDigest, actor.id, randomUUID());
      return reply.code(201).send({ decision });
    } catch (error) { return safeFailure(reply, error); }
  });
}
