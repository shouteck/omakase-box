import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { SubmissionProtocolRejected } from '../submissions/protocol.js';
import { StatusRejected } from './store.js';
import type { SqlExternalStatusStore } from './store.js';

interface RouteActorSource {
  requirePermission(request: FastifyRequest, reply: FastifyReply, action: string): { id: string; role: string } | null;
}

function contributorOf(source: RouteActorSource, request: FastifyRequest, reply: FastifyReply): { id: string } | null {
  const actor = source.requirePermission(request, reply, 'submission.read');
  if (!actor) {
    if (!reply.sent) reply.code(401).send({ error: 'authentication_denied' });
    return null;
  }
  if (actor.role !== 'contributor') {
    reply.code(403).send({ error: 'forbidden' });
    return null;
  }
  return { id: actor.id };
}

function safeFailure(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof SubmissionProtocolRejected) {
    return reply.code(error.code === 'request_expired' ? 422 : 401).send({ error: error.code });
  }
  if (error instanceof StatusRejected) {
    return reply.code(error.code === 'unknown_submission' ? 404 : 422).send({ error: error.code });
  }
  return reply.code(503).send({ error: 'status_unavailable' });
}

/**
 * Signed feedback ingest (M7.2). No contributor session: authority is the
 * Ed25519 delivery packet from the private bridge. Mounted only on the
 * internal ingest host by the bootstrap exemption — same posture as
 * /v1/submission-exports and /v1/assignment-commands.
 */
export function installFeedbackIngestRoutes(app: FastifyInstance, receiver: { receive(input: unknown): Promise<unknown> }): void {
  app.post('/v1/feedback-ingest', async (request, reply) => {
    try { return reply.send(await receiver.receive(request.body)); }
    catch (error) { return safeFailure(reply, error); }
  });
}

/**
 * Contributor submission status (M7.2). The owning contributor receives the
 * submission lifecycle state and the delivered allowlisted feedback payload —
 * nothing else. Foreign submissions are indistinguishable from absent ones.
 */
export function installContributorStatusRoutes(app: FastifyInstance, store: SqlExternalStatusStore, actorSource?: RouteActorSource): void {
  const source = actorSource ?? { requirePermission: () => null };
  app.get('/v1/submissions/:id/status', async (request, reply) => {
    const caller = contributorOf(source, request, reply);
    if (!caller) return reply;
    const params = z.uuid().safeParse((request.params as { id?: string }).id);
    if (!params.success) return reply.code(422).send({ error: 'invalid_request' });
    try {
      const status = await store.status(params.data, caller.id);
      if (!status) return reply.code(404).send({ error: 'not_found' });
      return reply.send({ schemaVersion: 1, id: params.data, reservationId: status.reservationId, state: status.state, version: status.version, feedback: status.feedback });
    } catch (error) { return safeFailure(reply, error); }
  });
}
