import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createPrivateApi } from '../../../services/private-api/src/bootstrap/server.js';
import { AuthDenied } from '../../../packages/contracts/auth/store.js';
import type { SessionActor, SessionStore } from '../../../packages/contracts/auth/store.js';
import { ReadinessInvalid } from '../../../services/private-api/readiness/model.js';

const id = randomUUID();
const taskId = randomUUID();
const hex = 'a'.repeat(64);
const headers = (csrf = true) => ({ host: 'private.localhost:4000', origin: 'http://private.localhost:3000', cookie: 'private_session=synthetic', ...(csrf ? { 'x-csrf-token': 'c'.repeat(64) } : {}) });

function sessions(role: 'owner' | 'requester' | 'operator' | 'denied') {
  if (role === 'denied') return { authenticate: async () => { throw new AuthDenied(); }, authenticateMutation: async () => { throw new AuthDenied(); } } as unknown as SessionStore;
  const actor: SessionActor = { id, role, sessionHash: 'a'.repeat(64), csrfHash: 'b'.repeat(64) };
  return { authenticate: async () => actor, authenticateMutation: async (_cookie: string, csrf: string) => { if (csrf !== 'c'.repeat(64)) throw new AuthDenied(); return actor; } } as unknown as SessionStore;
}

const api = (role: 'owner' | 'requester' | 'operator' | 'denied', store: object) => createPrivateApi({ store: sessions(role), mode: 'localhost_demo', readiness: store as never });

const recordStub = { recordId: randomUUID(), taskId, taskVersion: 1, packageDigest: hex, kind: 'fresh_build', status: 'passed', reasonCode: null, classifiedOutcome: null, detailsDigest: null, assurance: 'tested', recordedBy: id, recordedAt: '2026-10-04T00:00:00.000Z' };

describe('readiness record routes — role-gated evidence writes', () => {
  it('owner records a human review; operator records machine evidence', async () => {
    const record = vi.fn(async (input: unknown, by: string) => ({ ...(input as object), recordId: randomUUID(), recordedBy: by }));
    for (const [role, kind] of [['owner', 'human_review'], ['operator', 'fresh_build']] as const) {
      const app = api(role, { record, list: vi.fn(), decide: vi.fn() });
      const response = await app.inject({ method: 'POST', url: '/v1/readiness/records', headers: headers(), payload: { kind, status: 'passed', taskId, taskVersion: 1, packageDigest: hex, assurance: 'tested', recordedAt: '2026-10-04T00:00:00.000Z' } });
      expect(response.statusCode).toBe(201);
      expect(response.json().record.recordedBy).toBe(id);
      await app.close();
    }
  });
  it('a non-owner cannot write a human review; a non-operator cannot write machine evidence', async () => {
    const record = vi.fn();
    for (const [role, kind] of [['operator', 'human_review'], ['requester', 'fresh_build']] as const) {
      const app = api(role, { record, list: vi.fn(), decide: vi.fn() });
      const response = await app.inject({ method: 'POST', url: '/v1/readiness/records', headers: headers(), payload: { kind, status: 'passed', taskId, taskVersion: 1, packageDigest: hex, assurance: 'tested', recordedAt: '2026-10-04T00:00:00.000Z' } });
      expect(response.statusCode).toBe(403);
      expect(record).not.toHaveBeenCalled();
      await app.close();
    }
  });
  it('unauthenticated and wrong-CSRF requests never reach the store', async () => {
    const record = vi.fn();
    const app = api('denied', { record, list: vi.fn(), decide: vi.fn() });
    expect((await app.inject({ method: 'POST', url: '/v1/readiness/records', headers: headers(), payload: {} })).statusCode).toBe(401);
    const app2 = api('operator', { record, list: vi.fn(), decide: vi.fn() });
    expect((await app2.inject({ method: 'POST', url: '/v1/readiness/records', headers: headers(false), payload: { kind: 'fresh_build' } })).statusCode).toBe(401);
    expect(record).not.toHaveBeenCalled();
    await app.close(); await app2.close();
  });
  it('invalid record payloads return bounded 422, never private internals', async () => {
    const record = vi.fn(async () => { throw new ReadinessInvalid('invalid_record'); });
    const app = api('operator', { record, list: vi.fn(), decide: vi.fn() });
    const response = await app.inject({ method: 'POST', url: '/v1/readiness/records', headers: headers(), payload: { kind: 'fresh_build' } });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({ error: 'invalid_record' });
    await app.close();
  });
});

describe('readiness read routes — bounded projections only', () => {
  it('owner reads the record list for an exact version', async () => {
    const list = vi.fn(async () => [recordStub]);
    const app = api('owner', { record: vi.fn(), list, decide: vi.fn() });
    const response = await app.inject({ method: 'GET', url: `/v1/readiness/tasks/${taskId}/versions/1`, headers: headers() });
    expect(response.statusCode).toBe(200);
    expect(response.json().records).toHaveLength(1);
    expect(list).toHaveBeenCalledWith(taskId, 1);
    await app.close();
  });
  it('requester and operator roles cannot read readiness records', async () => {
    for (const role of ['requester', 'operator'] as const) {
      const app = api(role, { record: vi.fn(), list: vi.fn(), decide: vi.fn() });
      expect((await app.inject({ method: 'GET', url: `/v1/readiness/tasks/${taskId}/versions/1`, headers: headers() })).statusCode).toBe(403);
      await app.close();
    }
  });
});

describe('publication gate route — decision is a persisted result, not an error', () => {
  it('owner evaluation returns the immutable decision with reasons', async () => {
    const decide = vi.fn(async () => ({ decisionId: randomUUID(), decision: 'blocked', reasons: [{ code: 'missing_readiness', kind: 'fresh_build' }], evaluatedRecordIds: [] }));
    const app = api('owner', { record: vi.fn(), list: vi.fn(), decide });
    const response = await app.inject({ method: 'POST', url: `/v1/readiness/tasks/${taskId}/versions/2/publication`, headers: headers(), payload: { packageDigest: hex } });
    expect(response.statusCode).toBe(201);
    expect(response.json().decision.decision).toBe('blocked');
    expect(decide).toHaveBeenCalledWith(taskId, 2, hex, id, expect.any(String));
    await app.close();
  });
  it('a publishable decision reports publishable — actual publication is still separate', async () => {
    const decide = vi.fn(async () => ({ decisionId: randomUUID(), decision: 'publishable', reasons: [], evaluatedRecordIds: [randomUUID()] }));
    const app = api('owner', { record: vi.fn(), list: vi.fn(), decide });
    const response = await app.inject({ method: 'POST', url: `/v1/readiness/tasks/${taskId}/versions/2/publication`, headers: headers(), payload: { packageDigest: hex } });
    expect(response.json().decision.decision).toBe('publishable');
    await app.close();
  });
  it('non-owners cannot evaluate the gate', async () => {
    const decide = vi.fn();
    for (const role of ['requester', 'operator'] as const) {
      const app = api(role, { record: vi.fn(), list: vi.fn(), decide });
      expect((await app.inject({ method: 'POST', url: `/v1/readiness/tasks/${taskId}/versions/2/publication`, headers: headers(), payload: { packageDigest: hex } })).statusCode).toBe(403);
      expect(decide).not.toHaveBeenCalled();
      await app.close();
    }
  });
  it('malformed digests and params are rejected before the store', async () => {
    const decide = vi.fn();
    const app = api('owner', { record: vi.fn(), list: vi.fn(), decide });
    expect((await app.inject({ method: 'POST', url: `/v1/readiness/tasks/${taskId}/versions/2/publication`, headers: headers(), payload: { packageDigest: 'xyz' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: `/v1/readiness/tasks/not-a-uuid/versions/2/publication`, headers: headers(), payload: { packageDigest: hex } })).statusCode).toBe(400);
    expect(decide).not.toHaveBeenCalled();
    await app.close();
  });
});
