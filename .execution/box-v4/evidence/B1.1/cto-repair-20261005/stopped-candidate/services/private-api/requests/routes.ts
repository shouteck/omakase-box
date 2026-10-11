import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { authHandlers } from '../../../packages/contracts/auth/http.js';
import type { AuthAction } from '../../../packages/contracts/auth/policy.js';
import { AuthDenied } from '../../../packages/contracts/auth/store.js';
import type { SessionActor } from '../../../packages/contracts/auth/store.js';
import { EvidenceLimit, IntakeInvalid } from './types.js';
import type { PrivateIntakeStore } from './store.js';

export function installIntakeRoutes(app: FastifyInstance, handlers: ReturnType<typeof authHandlers>, store: PrivateIntakeStore) {
  async function handle(request: FastifyRequest, reply: FastifyReply, action: AuthAction, operation: (actor: SessionActor) => Promise<unknown>) {
    const actor = handlers.requirePermission(request, reply, action);
    if (!actor) return;
    try { return await operation(actor); }
    catch (error) {
      const status = error instanceof AuthDenied ? 404 : error instanceof z.ZodError || error instanceof IntakeInvalid ? 400 : error instanceof EvidenceLimit ? 429 : 503;
      const code = status === 404 ? 'not_found' : status === 400 ? 'invalid_input' : status === 429 ? 'evidence_limit' : 'resource_unavailable';
      return reply.code(status).send({ error: code });
    }
  }
  app.get('/v1/snapshots', async (request, reply) => handle(request, reply, 'snapshot.read', actor => store.listSnapshots(actor)));
  app.post('/v1/snapshots', async (request, reply) => handle(request, reply, 'snapshot.import', async actor => {
    const input = z.strictObject({ sourceId: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/) }).parse(request.body);
    const result = await store.registerSnapshot(actor, input.sourceId); return reply.code(201).send(result);
  }));
  app.post('/v1/requests', async (request, reply) => handle(request, reply, 'request.write', async actor => reply.code(201).send(await store.createRequest(actor, request.body))));
  app.get('/v1/requests/:id', async (request, reply) => handle(request, reply, 'request.read', actor => store.request(actor, (request.params as { id: string }).id)));
  app.post('/v1/requests/:id/evidence', { bodyLimit: 1400000 }, async (request, reply) => handle(request, reply, 'request.write', async actor => reply.code(201).send(await store.upload(actor, (request.params as { id: string }).id, request.body))));
  app.get('/v1/requests/:id/evidence/:evidenceId', async (request, reply) => handle(request, reply, 'request.read', async actor => {
    const params = request.params as { id: string; evidenceId: string };
    const result = await store.evidence(actor, params.id, params.evidenceId);
    const extension = result.mediaType === 'image/png' ? 'png' : result.mediaType === 'image/jpeg' ? 'jpg' : 'txt';
    return reply.header('Content-Type', 'application/octet-stream').header('Content-Disposition', `attachment; filename="${z.uuid().parse(result.id)}.${extension}"`).header('Content-Security-Policy', "sandbox; default-src 'none'").header('X-Content-Type-Options', 'nosniff').send(result.bytes);
  }));
  app.get('/v1/requests/:id/planning-input', async (request, reply) => handle(request, reply, 'request.read', actor => store.planningInput(actor, (request.params as { id: string }).id)));
}
