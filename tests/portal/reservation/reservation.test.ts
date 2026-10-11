import Fastify from '../../../services/external-api/node_modules/fastify/fastify.js';
import { expect, it } from 'vitest';
import { MemoryAssignmentStore } from '../../../services/external-api/reservations/assignments.js';
import { MemoryReservationStore } from '../../../services/external-api/reservations/reservation-store.js';
import { MemoryDefectReportStore } from '../../../services/external-api/reservations/defect-reports.js';
import { installContributorReservationRoutes } from '../../../services/external-api/reservations/routes.js';
import { publishedContext } from '../reservations/fixture.js';

it('reservation writes and package reads fail closed if no authenticated actor source is installed', async () => {
  const world = await publishedContext(), assignments = new MemoryAssignmentStore();
  const reservations = new MemoryReservationStore({ published: world.persistence, assignments });
  const defects = new MemoryDefectReportStore(reservations);
  const app = Fastify({ logger: false });
  installContributorReservationRoutes(app, { board: world.board, reservations, assignments, defects });
  try {
    const write = await app.inject({ method: 'POST', url: `/v1/tasks/${world.taskId}/reservations`, payload: { taskVersion: world.taskVersion } });
    expect(write.statusCode).toBe(401);
    expect(write.json()).toEqual({ error: 'authentication_denied' });
    const read = await app.inject({ method: 'GET', url: '/v1/reservations/44444444-4444-4444-8444-444444444444/package' });
    expect(read.statusCode).toBe(401);
    expect(read.json()).toEqual({ error: 'authentication_denied' });
  } finally { await app.close(); }
});
