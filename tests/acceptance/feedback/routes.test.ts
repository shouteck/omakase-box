import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createPrivateApi } from '../../../services/private-api/src/bootstrap/server.js';
import { createExternalApi } from '../../../services/external-api/src/bootstrap/server.js';
import { AuthDenied } from '../../../packages/contracts/auth/store.js';
import type { SessionActor, SessionStore } from '../../../packages/contracts/auth/store.js';
import { WorkflowError } from '../../../packages/contracts/workflow/index.js';
import { AcceptanceRejected } from '../../../services/private-api/ledger/acceptance-transaction/record.js';

const ownerId = randomUUID();
const evaluationId = randomUUID();
const submissionId = randomUUID();

function sessions(role: 'owner' | 'requester' | 'operator' | 'contributor' | 'denied') {
  if (role === 'denied') return { authenticate: async () => { throw new AuthDenied(); }, authenticateMutation: async () => { throw new AuthDenied(); } } as unknown as SessionStore;
  const actor: SessionActor = { id: ownerId, role, sessionHash: 'a'.repeat(64), csrfHash: 'b'.repeat(64) };
  return { authenticate: async () => actor, authenticateMutation: async (_cookie: string, csrf: string) => { if (csrf !== 'c'.repeat(64)) throw new AuthDenied(); return actor; } } as unknown as SessionStore;
}

const privateHeaders = (csrf = true) => ({ host: 'private.localhost:4000', origin: 'http://private.localhost:3000', cookie: 'private_session=synthetic', ...(csrf ? { 'x-csrf-token': 'c'.repeat(64) } : {}) });
const externalHeaders = () => ({ host: 'contributor.localhost:4001', origin: 'http://contributor.localhost:3001', cookie: 'contributor_session=synthetic' });
const internalHeaders = { host: 'external-api:4001' };

describe('acceptance routes — owner-only decisions', () => {
  const api = (role: 'owner' | 'requester' | 'operator' | 'denied', store: object) => createPrivateApi({ store: sessions(role), mode: 'localhost_demo', acceptance: store as never });

  it('owner accept/reject/compensate reach the store with the exact bound version', async () => {
    for (const action of ['accept', 'reject', 'compensate'] as const) {
      const decide = vi.fn(async () => ({ created: true, eventId: randomUUID(), state: 'accepted' }));
      const store = { accept: decide, reject: decide, compensate: decide, pending: vi.fn(async () => []) };
      const app = api('owner', store);
      const response = await app.inject({ method: 'POST', url: `/v1/acceptance/evaluations/${evaluationId}/${action}`, headers: privateHeaders(), payload: { expectedVersion: 7 } });
      expect(response.statusCode).toBe(201);
      expect(decide).toHaveBeenCalledWith(expect.objectContaining({ role: 'owner' }), { evaluationId, expectedVersion: 7 });
      await app.close();
    }
  });

  it('non-owner roles and unauthenticated requests never reach the store', async () => {
    for (const role of ['requester', 'operator', 'denied'] as const) {
      const decide = vi.fn();
      const app = api(role, { accept: decide, reject: decide, compensate: decide, pending: vi.fn() });
      const response = await app.inject({ method: 'POST', url: `/v1/acceptance/evaluations/${evaluationId}/accept`, headers: privateHeaders(), payload: { expectedVersion: 1 } });
      expect([401, 403]).toContain(response.statusCode);
      expect(decide).not.toHaveBeenCalled();
      await app.close();
    }
  });

  it('malformed inputs return bounded errors, never private internals', async () => {
    const app = api('owner', { accept: vi.fn(), reject: vi.fn(), compensate: vi.fn(), pending: vi.fn() });
    expect((await app.inject({ method: 'POST', url: '/v1/acceptance/evaluations/not-a-uuid/accept', headers: privateHeaders(), payload: { expectedVersion: 1 } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: `/v1/acceptance/evaluations/${evaluationId}/accept`, headers: privateHeaders(), payload: {} })).statusCode).toBe(400);
    await app.close();
  });

  it('stale versions and store rejections surface as bounded codes', async () => {
    const stale = vi.fn(async () => { throw new WorkflowError('stale_version'); });
    const app = api('owner', { accept: stale, reject: stale, compensate: stale, pending: vi.fn() });
    expect((await app.inject({ method: 'POST', url: `/v1/acceptance/evaluations/${evaluationId}/accept`, headers: privateHeaders(), payload: { expectedVersion: 2 } })).statusCode).toBe(409);
    const forbidden = vi.fn(async () => { throw new WorkflowError('forbidden_role'); });
    const app2 = api('owner', { accept: forbidden, reject: forbidden, compensate: forbidden, pending: vi.fn() });
    expect((await app2.inject({ method: 'POST', url: `/v1/acceptance/evaluations/${evaluationId}/accept`, headers: privateHeaders(), payload: { expectedVersion: 2 } })).statusCode).toBe(403);
    const conflict = vi.fn(async () => { throw new AcceptanceRejected('duplicate_event'); });
    const app3 = api('owner', { accept: conflict, reject: conflict, compensate: conflict, pending: vi.fn() });
    expect((await app3.inject({ method: 'POST', url: `/v1/acceptance/evaluations/${evaluationId}/accept`, headers: privateHeaders(), payload: { expectedVersion: 2 } })).statusCode).toBe(409);
    await app.close(); await app2.close(); await app3.close();
  });

  it('the pending queue is owner-readable and bounded', async () => {
    const pending = vi.fn(async () => [{ evaluationId, taskId: randomUUID(), taskVersion: 1, version: 3, outcome: 'passed' }]);
    const app = api('owner', { accept: vi.fn(), reject: vi.fn(), compensate: vi.fn(), pending });
    const response = await app.inject({ method: 'GET', url: '/v1/acceptance/pending', headers: privateHeaders() });
    expect(response.statusCode).toBe(200);
    expect(response.json().evaluations[0].evaluationId).toBe(evaluationId);
    await app.close();
  });
});

describe('contributor status + feedback ingest routes', () => {
  it('contributor reads own submission status with delivered feedback', async () => {
    const status = vi.fn(async (submission: string, contributor: string) => ({ state: 'accepted', version: 4, reservationId: randomUUID(), feedback: { schemaVersion: 1, publicId: randomUUID(), category: 'accepted', releasePolicyVersion: 1, publicCheckDetails: [] } }));
    const app = createExternalApi({ store: sessions('contributor'), mode: 'localhost_demo', status: { status } as never });
    const response = await app.inject({ method: 'GET', url: `/v1/submissions/${submissionId}/status`, headers: externalHeaders() });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ schemaVersion: 1, id: submissionId, state: 'accepted', version: 4 });
    expect(status).toHaveBeenCalledWith(submissionId, ownerId);
    await app.close();
  });

  it('foreign submissions are indistinguishable from absent ones', async () => {
    const app = createExternalApi({ store: sessions('contributor'), mode: 'localhost_demo', status: { status: vi.fn(async () => null) } as never });
    expect((await app.inject({ method: 'GET', url: `/v1/submissions/${submissionId}/status`, headers: externalHeaders() })).statusCode).toBe(404);
    await app.close();
  });

  it('the ingest route is reachable only on the internal host', async () => {
    const receive = vi.fn(async () => ({ status: 'stored', ack: {} }));
    const app = createExternalApi({ store: sessions('contributor'), mode: 'localhost_demo', feedbackIngest: { receive } as never });
    expect((await app.inject({ method: 'POST', url: '/v1/feedback-ingest', headers: internalHeaders, payload: {} })).statusCode).toBe(200);
    const denied = await app.inject({ method: 'POST', url: '/v1/feedback-ingest', headers: externalHeaders(), payload: {} });
    expect(denied.statusCode).toBe(403);
    expect(receive).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
