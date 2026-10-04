import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AssignmentRejected } from './assignments.js';
import { AssignmentCommandRejected } from './assignment-protocol.js';
import { BridgeRejected } from '../bridge/types.js';
import { ReservationRejected } from './reservation-store.js';
import { DefectRejected } from './defect-reports.js';
import { projectReservationDownload, DownloadRejected } from './download.js';
import type { MemoryReservationStore, Caller, ReservationState } from './reservation-store.js';
import type { MemoryDefectReportStore } from './defect-reports.js';
import type { PublishedTaskBoard } from '../tasks/board.js';

export const RESERVATION_ROUTES = [
  { method: 'GET', path: '/v1/tasks' },
  { method: 'GET', path: '/v1/tasks/:taskId' },
  { method: 'POST', path: '/v1/tasks/:taskId/reservations' },
  { method: 'POST', path: '/v1/invitations/redeem' },
  { method: 'GET', path: '/v1/reservations/:id' },
  { method: 'GET', path: '/v1/reservations/:id/package' },
  { method: 'GET', path: '/v1/reservations/:id/instructions' },
  { method: 'GET', path: '/v1/reservations/:id/package-defects' },
  { method: 'POST', path: '/v1/reservations/:id/package-defects' }
] as const;

export const ASSIGNMENT_ROUTES = [
  { method: 'GET', path: '/v1/assignments' },
  { method: 'POST', path: '/v1/assignments' },
  { method: 'GET', path: '/v1/assignments/:id' },
  { method: 'POST', path: '/v1/assignments/:id/invitation' }
] as const;

export interface ReservationRouteContext {
  board: Pick<PublishedTaskBoard, 'entries' | 'entry' | 'package' | 'publishedRecord'>;
  reservations: Pick<MemoryReservationStore, 'reserve' | 'reservation'>;
  assignments?: { recordRedemption(token: string, contributorId: string, nowMs: number): Promise<void> };
  defects: Pick<MemoryDefectReportStore, 'file' | 'listOwn'>;
}

export interface RouteActorSource {
  requirePermission(request: FastifyRequest, reply: FastifyReply, action: string): { id: string; role: string } | null;
}

interface ServedReservation {
  id: string;
  taskId: string;
  taskVersion: number;
  state: ReservationState;
  expiresAt: string;
  version: number;
}

function scopeOf(view: unknown): ServedReservation | null {
  if (view === null || typeof view !== 'object') return null;
  const candidate = view as Partial<ServedReservation> & { state?: unknown };
  return typeof candidate.id === 'string' && typeof candidate.taskId === 'string' && typeof candidate.taskVersion === 'number' && typeof candidate.state === 'string' && typeof candidate.expiresAt === 'string' && typeof candidate.version === 'number'
    ? { id: candidate.id, taskId: candidate.taskId, taskVersion: candidate.taskVersion, state: candidate.state as ReservationState, expiresAt: candidate.expiresAt, version: candidate.version }
    : null;
}

function callerOf(source: { requirePermission(request: FastifyRequest, reply: FastifyReply, action: string): { id: string; role: string } | null }, request: FastifyRequest, reply: FastifyReply, action: string): { id: string; role: 'contributor' | 'owner' } | null {
  const actor = source.requirePermission(request, reply, action);
  if (!actor) {
    if (!reply.sent) reply.code(401).send({ error: 'authentication_denied' });
    return null;
  }
  if (actor.role !== 'contributor') {
    reply.code(403).send({ error: 'forbidden' });
    return null;
  }
  return { id: actor.id, role: actor.role as 'contributor' | 'owner' };
}

function safeFailure(reply: FastifyReply, error: unknown): FastifyReply {
  const code = error instanceof ReservationRejected || error instanceof DefectRejected || error instanceof DownloadRejected || error instanceof AssignmentRejected || error instanceof BridgeRejected
    ? (error as { code: string }).code
    : 'resource_unavailable';
  return reply.code(safeStatus(code)).send({ error: code });
}

function safeStatus(code: string): number {
  if (code === 'stale_version') return 409;
  if (['invalid_input', 'in_review_conflict', 'stale_submission'].includes(code)) return 422;
  if (['already_reserved', 'invalid_transition', 'reservation_expired', 'reservation_closed', 'task_unavailable', 'assignment_required', 'invitation_required'].includes(code)) return 409;
  if (['forbidden', 'invitation_denied', 'executor_not_contributor'].includes(code)) return 403;
  if (code === 'not_found' || code === 'not_published') return 404;
  if (code === 'resource_unavailable' || code === 'persistence_unavailable') return 503;
  return 400;
}

/**
 * Reservation route wiring (M6.2). Installed next to the accepted M1.3
 * contributor guard; the service bootstrap supplies the real actor source.
 * Every fault is one fixed safe code with no stored context. No chat, AI or
 * private-repository route exists in this family.
 */
/**
 * Signed assignment-command ingest (M6.2). No contributor session: authority is
 * the Ed25519 envelope itself. Only the fixed rejection codes reach the wire;
 * receipts are produced only after a committed claim.
 */
export function installAssignmentCommandRoutes(app: FastifyInstance, receiver: { receiveSigned(input: unknown): Promise<unknown> }): void {
  app.post('/v1/assignment-commands', async (request, reply) => {
    try { return reply.send(await receiver.receiveSigned(request.body)); }
    catch (error) {
      const code = error instanceof AssignmentCommandRejected ? error.code : 'persistence_unavailable';
      return reply.code(code === 'invalid_command' || code === 'replay' || code === 'expired' ? 422 : code === 'assignment_conflict' ? 409 : code === 'task_unavailable' ? 409 : 503).send({ error: code });
    }
  });
}

export function installContributorReservationRoutes(app: FastifyInstance, context: ReservationRouteContext, actorSource?: RouteActorSource): void {
  const source = actorSource ?? { requirePermission: () => null };

  app.get('/v1/tasks', async (_request, reply) => {
    try { return reply.send({ schemaVersion: 1, tasks: await context.board.entries() }); }
    catch (error) { return safeFailure(reply, error); }
  });

  app.get('/v1/tasks/:taskId', async (request, reply) => {
    const params = request.params as { taskId?: string };
    const versionRaw = (request.query as Record<string, unknown> | null)?.version;
    const version = typeof versionRaw === 'string' && /^\d+$/.test(versionRaw) ? Number(versionRaw) : 1;
    try {
      const scope = await context.board.entry(String(params.taskId), version);
      return reply.send({ schemaVersion: 1, task: scope });
    } catch (error) {
      return safeFailure(reply, error);
    }
  });

  app.post('/v1/tasks/:taskId/reservations', async (request, reply) => {
    const caller = callerOf(source, request, reply, 'reservation.write');
    if (!caller) return;
    const params = request.params as { taskId?: string };
    const body = (request.body ?? {}) as { taskVersion?: unknown };
    try {
      const view = await context.reservations.reserve({ id: caller.id, role: 'contributor' }, { taskId: String(params.taskId), taskVersion: body.taskVersion }, Date.now());
      return reply.code(201).send(view);
    } catch (error) {
      return safeFailure(reply, error);
    }
  });

  app.post('/v1/invitations/redeem', async (request, reply) => {
    const caller = callerOf(source, request, reply, 'reservation.write');
    if (!caller) return;
    if (!context.assignments) return reply.code(503).send({ error: 'resource_unavailable' });
    const body = (request.body ?? {}) as { token?: unknown };
    try {
      await context.assignments.recordRedemption(typeof body.token === 'string' ? body.token : '', caller.id, Date.now());
      return reply.code(201).send({ schemaVersion: 1, status: 'redeemed' });
    } catch (error) {
      return safeFailure(reply, error);
    }
  });

  app.get('/v1/reservations/:id', async (request, reply) => {
    const caller = callerOf(source, request, reply, 'reservation.read');
    if (!caller) return;
    try {
      const view = scopeOf(await context.reservations.reservation(caller, (request.params as { id?: string }).id, Date.now()));
      return reply.send(view);
    } catch (error) {
      return safeFailure(reply, error);
    }
  });

  app.get('/v1/reservations/:id/package', async (request, reply) => {
    const caller = callerOf(source, request, reply, 'reservation.read');
    if (!caller) return;
    try {
      const view = scopeOf(await context.reservations.reservation({ id: caller.id, role: 'contributor' }, (request.params as { id?: string }).id, Date.now()));
      if (view === null) return reply.code(404).send({ error: 'not_found' });
      const download = await projectReservationDownload(context, view, Date.now());
      reply.header('Content-Type', 'application/zip');
      reply.header('X-Package-SHA256', download.package.sha256);
      reply.header('Content-Disposition', `attachment; filename="${download.package.fileName}"`);
      return reply.send(Buffer.from(download.package.bytes));
    } catch (error) {
      return safeFailure(reply, error);
    }
  });

  app.get('/v1/reservations/:id/instructions', async (request, reply) => {
    const caller = callerOf(source, request, reply, 'reservation.read');
    if (!caller) return;
    try {
      const view = scopeOf(await context.reservations.reservation({ id: caller.id, role: 'contributor' }, (request.params as { id?: string }).id, Date.now()));
      if (view === null) return reply.code(404).send({ error: 'not_found' });
      const download = await projectReservationDownload(context, view, Date.now());
      return reply.send({ schemaVersion: 1, reservationId: download.reservationId, taskId: download.taskId, taskVersion: download.taskVersion, instructions: download.instructions });
    } catch (error) {
      return safeFailure(reply, error);
    }
  });

  app.get('/v1/reservations/:id/package-defects', async (request, reply) => {
    const caller = callerOf(source, request, reply, 'reservation.read');
    if (!caller) return;
    try {
      const reports = await context.defects.listOwn({ id: caller.id, role: 'contributor' }, (request.params as { id?: string }).id, Date.now());
      return reply.send({ schemaVersion: 1, reports });
    } catch (error) {
      return safeFailure(reply, error);
    }
  });

  app.post('/v1/reservations/:id/package-defects', async (request, reply) => {
    const caller = callerOf(source, request, reply, 'reservation.write');
    if (!caller) return;
    try {
      const body = (request.body ?? {}) as { taskId?: unknown; taskVersion?: unknown; category?: unknown; description?: unknown; idempotencyKey?: unknown };
      const report = await context.defects.file({ id: caller.id, role: 'contributor' }, {
        taskId: body.taskId,
        taskVersion: body.taskVersion,
        reservationId: (request.params as { id?: string }).id,
        category: body.category,
        description: body.description,
        idempotencyKey: body.idempotencyKey
      }, Date.now());
      return reply.code(201).send(report);
    } catch (error) {
      return safeFailure(reply, error);
    }
  });
}
