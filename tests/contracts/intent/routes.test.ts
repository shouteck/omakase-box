import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createPrivateApi } from '../../../services/private-api/src/bootstrap/server.js';
import { safeIntentError, reviewProjection, IntentInvalid, ProviderUnavailable } from '../../../services/private-api/intents/types.js';
import type { IntentOrchestration, IntentRead } from '../../../services/private-api/intents/orchestrator.js';
import { provenanceLine } from '../../../services/private-api/intents/orchestrator.js';
import { AuthDenied } from '../../../packages/contracts/auth/store.js';
import type { SessionActor, SessionStore } from '../../../packages/contracts/auth/store.js';
import { WorkflowError } from '../../../packages/contracts/workflow/index.js';
import { contentHash } from '../../../packages/contracts/hash.js';
import type { InternalIntent } from '../../../packages/contracts/private/index.js';
import type { FastifyReply } from '../../../services/private-api/node_modules/fastify/fastify.js';
import { RequestInputSchema } from '../../../services/private-api/requests/types.js';
import type { PrivateIntakeStore } from '../../../services/private-api/requests/store.js';

const id = randomUUID();
const requestId = randomUUID();
const snapshotHash = 'a'.repeat(64);
const headers = { host: 'private.localhost:4000', origin: 'http://private.localhost:3000', cookie: 'private_session=synthetic', 'x-csrf-token': 'c'.repeat(64) };
let zodError: Error = new Error('no-zod-error');
try { RequestInputSchema.parse({ snapshotId: 'malformed' }); } catch (error) { zodError = error as Error; }

function sessions(role: 'owner' | 'requester' | 'operator') {
  const actor: SessionActor = { id, role, sessionHash: 'a'.repeat(64), csrfHash: 'b'.repeat(64) };
  return { authenticate: async () => actor, authenticateMutation: async (_cookie: string, csrf: string) => { if (csrf !== 'c'.repeat(64)) throw new AuthDenied(); return actor; } } as unknown as SessionStore;
}
function intentFixture(state: 'draft' | 'ready_for_approval' = 'draft'): InternalIntent {
  return { schemaVersion: 1, intentId: id, version: 1, goal: 'Synthetic composed outcome.', snapshotHash, state, facts: [], evidence: [{ evidenceId: requestId, snapshotHash, location: 'src/example.ts' }], decisions: [{ id: 'outcome_confirmation', question: 'Confirm the outcome.', required: true, answer: null }], assumptions: [], unknowns: ['Owner confirmation required.'], acceptanceExamples: [], scope: { included: [provenanceLine(requestId)], excluded: [] } };
}
function readFixture(state = 'draft'): IntentRead {
  const intent = intentFixture(state === 'approved' ? 'ready_for_approval' : 'draft');
  return { id, version: 1, state, contentHash: contentHash(intent), intent, approval: state === 'approved' ? { approvedBy: id, approvedHash: contentHash(intent), approvedAt: '2026-10-03T00:00:00.000Z' } : null, supersededApproval: false };
}
function orchestrationFixture(): { orchestration: IntentOrchestration; calls: Record<string, ReturnType<typeof vi.fn>> } {
  const review = vi.fn(async () => readFixture());
  const creation = vi.fn(async () => ({ id, version: 1, state: 'draft', contentHash: 'c'.repeat(64), provider: { mode: 'demo', inputHash: 'e'.repeat(64), proposalHash: 'f'.repeat(64), repairAttempts: 0, modelVerification: 'not_applicable' } }));
  const mutation = vi.fn(async () => ({ id, version: 2, state: 'draft', contentHash: 'd'.repeat(64) }));
  const approval = vi.fn(async () => ({ id, version: 1, state: 'approved', contentHash: 'c'.repeat(64), approvedHash: 'c'.repeat(64) }));
  const calls = { createDraft: creation, currentForRequest: review, review, resolveDecision: mutation, revise: vi.fn(async () => ({ id, version: 2, state: 'draft', contentHash: 'd'.repeat(64), approvalInvalidated: true })), ready: mutation, approve: approval };
  return { orchestration: calls as unknown as IntentOrchestration, calls };
}

it('review projection is a positive private allowlist with decision blockage and approval distinction', () => {
  const review = reviewProjection(readFixture(), requestId);
  expect(Object.keys(review).sort()).toEqual(['acceptanceExamples','approval','assumptions','blockage','contentHash','decisions','evidence','facts','goal','id','provenance','reviewedPayloadState','scope','state','supersededApproval','unknowns','version']);
  expect(review).toMatchObject({ id, version: 1, state: 'draft', reviewedPayloadState: 'draft', blockage: { requiredUnresolved: 1 }, provenance: { requestId, snapshotHash }, approval: null });
  const approved = reviewProjection(readFixture('approved'), requestId);
  expect(approved).toMatchObject({ state: 'approved', reviewedPayloadState: 'ready_for_approval', approval: { approvedBy: id, approvedHash: approved.contentHash, approvedAt: '2026-10-03T00:00:00.000Z' } });
  expect(JSON.stringify(review)).not.toContain('/workspace/');
  const hostile = reviewProjection({ ...readFixture(), intent: { ...intentFixture(), goal: '<script>window.__syntheticXssCanary="executed"</script><img src=x onerror="x()">' } }, requestId);
  expect(typeof hostile.goal).toBe('string');
  expect(hostile.goal).toContain('<script>window.__syntheticXssCanary="executed"</script>');
  expect(JSON.stringify(hostile)).not.toContain('executor');
});

it('superseded approvals and legacy provenance are projected honestly', () => {
  const read = { ...readFixture(), supersededApproval: true };
  expect(reviewProjection(read, null).supersededApproval).toBe(true);
  expect(reviewProjection(read, null).provenance.requestId).toBeNull();
});

function fakeReply() {
  const calls: { code?: number; body?: unknown } = {};
  const reply = { code(code: number) { calls.code = code; return reply; }, header() { return reply; }, send(body: unknown) { calls.body = body; return reply; } } as unknown as FastifyReply;
  return { reply, calls };
}
it('safe error mapping never leaks private messages and uses fixed status families', () => {
  const canary = 'synthetic-private-path-and-provenance-canary';
  for (const [error, status, body] of [
    [zodError, 400, { error: 'invalid_input' }],
    [new IntentInvalid(), 400, { error: 'invalid_input' }],
    [new AuthDenied(), 404, { error: 'not_found' }],
    [new WorkflowError('stale_version'), 409, { error: 'stale_version' }],
    [new WorkflowError('invalid_transition'), 409, { error: 'invalid_transition' }],
    [new WorkflowError('forbidden_role'), 403, { error: 'forbidden_role' }],
    [new WorkflowError('missing_evidence'), 422, { error: 'missing_evidence' }],
    [new ProviderUnavailable('needs_configuration', 'ollama_live'), 503, { error: 'provider_unavailable', reason: 'needs_configuration', mode: 'ollama_live' }],
    [new Error(canary), 503, { error: 'resource_unavailable' }]
  ] as const) {
    const { reply, calls } = fakeReply();
    safeIntentError(reply, error);
    expect(calls.code).toBe(status);
    expect(calls.body).toEqual(body);
    expect(JSON.stringify(calls.body)).not.toContain(canary);
  }
});

it('intent routes exist only through authorized wiring and enforce role policy on every route', async () => {
  const bare = createPrivateApi();
  try { expect((await bare.inject({ method: 'POST', url: `/v1/requests/${requestId}/intents`, headers, payload: { mode: 'demo' } })).statusCode).toBe(404); } finally { await bare.close(); }
  const { orchestration, calls } = orchestrationFixture();
  const app = createPrivateApi({ store: sessions('requester'), mode: 'localhost_demo', intake: { planningInput: vi.fn() } as unknown as PrivateIntakeStore, intents: orchestration });
  try {
    expect((await app.inject({ method: 'POST', url: `/v1/requests/${requestId}/intents`, headers, payload: { mode: 'demo' } })).statusCode).toBe(201);
    expect(calls.createDraft).toHaveBeenCalledWith(expect.anything(), requestId, { mode: 'demo' });
    expect((await app.inject({ url: `/v1/intents/${id}/review`, headers })).statusCode).toBe(200);
    expect((await app.inject({ url: `/v1/requests/${requestId}/intent`, headers })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/v1/intents/${id}/decisions`, headers, payload: { expectedVersion: 1, decisionId: 'outcome_confirmation', answer: 'Confirmed.' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/v1/intents/${id}/revisions`, headers, payload: { expectedVersion: 1, mode: 'demo' } })).statusCode).toBe(201);
    expect((await app.inject({ method: 'POST', url: `/v1/intents/${id}/readiness`, headers, payload: { expectedVersion: 1, expectedHash: 'a'.repeat(64) } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/v1/intents/${id}/approval`, headers, payload: { expectedVersion: 1, expectedHash: 'a'.repeat(64) } })).statusCode).toBe(403);
    expect(calls.approve).not.toHaveBeenCalled();
    const operatorApp = createPrivateApi({ store: sessions('operator'), mode: 'localhost_demo', intake: { planningInput: vi.fn() } as unknown as PrivateIntakeStore, intents: orchestration });
    try {
      for (const [method, url] of [['POST', `/v1/requests/${requestId}/intents`], ['GET', `/v1/intents/${id}/review`], ['POST', `/v1/intents/${id}/decisions`], ['POST', `/v1/intents/${id}/revisions`], ['POST', `/v1/intents/${id}/readiness`], ['POST', `/v1/intents/${id}/approval`]] as const) {
        const response = await operatorApp.inject({ method, url, headers, ...(method === 'POST' ? { payload: { mode: 'demo' } } : {}) });
        expect(response.statusCode).toBe(403);
      }
      expect(calls.createDraft).toHaveBeenCalledTimes(1);
    } finally { await operatorApp.close(); }
  } finally { await app.close(); }
});

it('intent request bodies are strict: no endpoint, model, approval-tuple or executor authority is accepted', async () => {
  const create = vi.fn(async () => ({ version: 1, contentHash: 'c'.repeat(64) }));
  const revise = vi.fn(async () => ({ version: 2, contentHash: 'd'.repeat(64) }));
  const transition = vi.fn(async () => ({ version: 2, contentHash: 'd'.repeat(64), state: 'ready_for_approval' }));
  const read = vi.fn(async () => readFixture());
  const orchestration = new (await import('../../../services/private-api/intents/orchestrator.js')).IntentOrchestrator({ create, revise, transition, read, readForRequest: vi.fn(async () => readFixture()) }, { planningInput: vi.fn(async () => ({ assurance: 'bounded' as const, request: { requestId, snapshotId: requestId, goal: 'Synthetic composed outcome.', currentBehaviour: '', desiredBehaviour: '', constraints: [], exclusions: [] }, snapshotHash, sources: [], attachments: [], imageUnderstanding: false as const, textByteLimit: 65536 as const })) });
  const app = createPrivateApi({ store: sessions('owner'), mode: 'localhost_demo', intake: { planningInput: vi.fn() } as unknown as PrivateIntakeStore, intents: orchestration });
  try {
    for (const payload of [{ mode: 'demo', endpoint: 'http://127.0.0.1:9999/api/chat' }, { mode: 'demo', model: 'injected' }, { mode: 'demo', executor: 'ai' }, { mode: 'demo', approvedHash: 'a'.repeat(64) }, { mode: 'demo', approval: { intentId: id, version: 1, contentHash: 'a'.repeat(64), state: 'approved' } }]) {
      expect((await app.inject({ method: 'POST', url: `/v1/requests/${requestId}/intents`, headers, payload })).statusCode).toBe(400);
    }
    for (const payload of [{ expectedVersion: 1, decisionId: 'outcome_confirmation', answer: 'Confirmed.', endpoint: 'http://127.0.0.1:9999/api/chat' }, { expectedVersion: 1, decisionId: 'outcome_confirmation', answer: 'Confirmed.', approval: { state: 'approved' } }]) {
      expect((await app.inject({ method: 'POST', url: `/v1/intents/${id}/decisions`, headers, payload })).statusCode).toBe(400);
    }
    for (const payload of [{ expectedVersion: 1, expectedHash: 'a'.repeat(64), approval: { state: 'approved', contentHash: 'a'.repeat(64), intentId: id, version: 1 } }, { expectedVersion: 1, expectedHash: 'a'.repeat(64), actorRole: 'owner' }]) {
      expect((await app.inject({ method: 'POST', url: `/v1/intents/${id}/approval`, headers, payload })).statusCode).toBe(400);
    }
    expect(create).not.toHaveBeenCalled();
    expect(revise).not.toHaveBeenCalled();
    expect((await app.inject({ url: '/v1/intents/not-a-uuid/review', headers })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/v1/requests/not-a-uuid/intents', headers, payload: { mode: 'demo' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: `/v1/requests/${requestId}/intents`, headers, payload: { mode: 'demo' } })).statusCode).toBe(201);
    expect(create).toHaveBeenCalledTimes(1);
    expect((await app.inject({ method: 'POST', url: `/v1/intents/${id}/revisions`, headers, payload: { expectedVersion: 1, mode: 'demo' } })).statusCode).toBe(201);
    expect(revise).toHaveBeenCalledTimes(1);
  } finally { await app.close(); }
});

it('failures project fixed safe codes without private messages', async () => {
  const failing: IntentOrchestration = { createDraft: vi.fn(async () => { throw new Error('synthetic-private-canary'); }), currentForRequest: vi.fn(async () => { throw new AuthDenied(); }), review: vi.fn(async () => { throw new WorkflowError('stale_version'); }), resolveDecision: vi.fn(async () => { throw new ProviderUnavailable('needs_configuration', 'ollama_live'); }), revise: vi.fn(async () => { throw new WorkflowError('forbidden_role'); }), ready: vi.fn(async () => { throw new WorkflowError('missing_evidence'); }), approve: vi.fn(async () => { throw new WorkflowError('missing_evidence'); }) } as unknown as IntentOrchestration;
  const app = createPrivateApi({ store: sessions('owner'), mode: 'localhost_demo', intake: { planningInput: vi.fn() } as unknown as PrivateIntakeStore, intents: failing });
  try {
    const created = await app.inject({ method: 'POST', url: `/v1/requests/${requestId}/intents`, headers, payload: { mode: 'demo' } });
    expect(created.statusCode).toBe(503); expect(created.json()).toEqual({ error: 'resource_unavailable' }); expect(created.body).not.toContain('canary');
    expect((await app.inject({ url: `/v1/requests/${requestId}/intent`, headers })).json()).toEqual({ error: 'not_found' });
    expect((await app.inject({ url: `/v1/intents/${id}/review`, headers })).json()).toEqual({ error: 'stale_version' });
    const decided = await app.inject({ method: 'POST', url: `/v1/intents/${id}/decisions`, headers, payload: { expectedVersion: 1, decisionId: 'outcome_confirmation', answer: 'Confirmed.' } });
    expect(decided.statusCode).toBe(503); expect(decided.json()).toEqual({ error: 'provider_unavailable', reason: 'needs_configuration', mode: 'ollama_live' });
    expect((await app.inject({ method: 'POST', url: `/v1/intents/${id}/revisions`, headers, payload: { expectedVersion: 1, mode: 'demo' } })).json()).toEqual({ error: 'forbidden_role' });
    expect((await app.inject({ method: 'POST', url: `/v1/intents/${id}/readiness`, headers, payload: { expectedVersion: 1, expectedHash: 'a'.repeat(64) } })).json()).toEqual({ error: 'missing_evidence' });
  } finally { await app.close(); }
});
