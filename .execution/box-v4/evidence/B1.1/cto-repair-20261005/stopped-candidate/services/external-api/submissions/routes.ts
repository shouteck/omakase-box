import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { PatchRejected } from './patch-validation.js';
import { SubmissionEnvelopeSchema } from './envelope.js';
import { SubmissionProtocolRejected } from './protocol.js';
import { SubmissionRejected, type SqlSubmissionStore } from './store.js';

const STRICT_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

interface RouteActorSource {
  requirePermission(request: FastifyRequest, reply: FastifyReply, action: string): { id: string; role: string } | null;
}

function callerOf(source: RouteActorSource, request: FastifyRequest, reply: FastifyReply, action: string): { id: string } | null {
  const actor = source.requirePermission(request, reply, action);
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

function safeStatus(code: string): number {
  if (code === 'not_found' || code === 'permit_missing') return 404;
  if (code === 'invalid_identity' || code === 'forbidden' || code === 'invitation_denied') return 403;
  if (code === 'reservation_unavailable' || code === 'reservation_expired' || code === 'task_unavailable' || code === 'idempotency_conflict' || code === 'attempt_budget_exceeded') return 409;
  if (code === 'invalid_envelope' || code === 'invalid_permit' || code === 'task_version_mismatch' || code === 'package_hash_mismatch' || code === 'invalid_request' || code === 'request_expired' || code === 'replay') return 422;
  if (code === 'persistence_unavailable' || code === 'resource_unavailable') return 503;
  return 400;
}

function safeFailure(reply: FastifyReply, error: unknown): FastifyReply {
  const code = error instanceof SubmissionRejected || error instanceof SubmissionProtocolRejected || error instanceof PatchRejected
    ? (error as { code: string }).code
    : 'persistence_unavailable';
  const mapped = code.startsWith('patch_') || code.startsWith('path_') || code.startsWith('too_') ? 'invalid_envelope' : code;
  return reply.code(safeStatus(mapped)).send({ error: mapped });
}

/**
 * Contributor submission intake (M6.3). Every fault is one fixed safe code; the
 * permit transaction performs all binding/budget checks atomically inside the
 * external store. No candidate byte executes on this host.
 */
export function installContributorSubmissionRoutes(app: FastifyInstance, store: SqlSubmissionStore, actorSource?: RouteActorSource): void {
  const source = actorSource ?? { requirePermission: () => null };
  app.post('/v1/reservations/:id/submissions', async (request, reply) => {
    const caller = callerOf(source, request, reply, 'submission.write');
    if (!caller) return reply;
    const reservationId = z.uuid().safeParse((request.params as { id?: string }).id);
    const envelope = SubmissionEnvelopeSchema.safeParse(request.body);
    if (!reservationId.success || !envelope.success) return reply.code(422).send({ error: 'invalid_envelope' });
    const body = envelope.data;
    if (!STRICT_BASE64.test(body.patchBase64)) return reply.code(422).send({ error: 'invalid_envelope' });
    const patchBytes = Buffer.from(body.patchBase64, 'base64');
    try {
      const result = await store.submit({
        contributorId: caller.id,
        reservationId: reservationId.data,
        taskId: body.taskId,
        taskVersion: body.taskVersion,
        packageHash: body.packageHash,
        idempotencyKey: body.idempotencyKey,
        patchBytes,
      });
      return reply.code(result.status === 'created' ? 201 : 200).send({ schemaVersion: 1, status: result.status, submission: result.submission });
    } catch (error) {
      return safeFailure(reply, error);
    }
  });
}

/**
 * Signed submission-export ingest (M6.3). No contributor session: authority is
 * the Ed25519 pull/ack envelope from the private importer. Mounted only on the
 * internal assignment-delivery network by the bootstrap exemption.
 */
export function installSubmissionExportRoutes(app: FastifyInstance, receiver: { receive(input: unknown): Promise<unknown> }): void {
  app.post('/v1/submission-exports', async (request, reply) => {
    try {
      return reply.send(await receiver.receive(request.body));
    } catch (error) {
      const code = error instanceof SubmissionRejected || error instanceof SubmissionProtocolRejected ? error.code : 'persistence_unavailable';
      return reply.code(safeStatus(code)).send({ error: code });
    }
  });
}
