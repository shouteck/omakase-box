import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { IntentOrchestrator, intentOrchestrationForIntake, provenanceLine, provenanceRequest } from '../../../services/private-api/intents/orchestrator.js';
import { ProviderUnavailable } from '../../../services/private-api/intents/types.js';
import type { IntentPersistence, IntentRead } from '../../../services/private-api/intents/orchestrator.js';
import { PrivateIntentStore } from '../../../services/private-api/db/intent-store.js';
import { WorkflowError } from '../../../packages/contracts/workflow/index.js';
import { contentHash } from '../../../packages/contracts/hash.js';
import type { InternalIntent } from '../../../packages/contracts/private/index.js';
import type { PlannerProvider, PrivatePlanningInput, ProviderResult } from '../../../packages/planner/providers/contracts.js';
import type { SessionActor } from '../../../packages/contracts/auth/store.js';

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);

const actor: SessionActor = { id: randomUUID(), role: 'requester', sessionHash: 'a'.repeat(64), csrfHash: 'b'.repeat(64) };
const ownerActor: SessionActor = { ...actor, role: 'owner' };
const requestId = randomUUID();
const snapshotId = randomUUID();
const snapshotHash = 'a'.repeat(64);
const reference = { evidenceId: snapshotId, snapshotHash, location: 'src/example.ts' };

function planningInput(goal = 'Synthetic outcome in ordinary language.'): PrivatePlanningInput {
  return { assurance: 'bounded', request: { requestId, snapshotId, goal, currentBehaviour: '', desiredBehaviour: '', constraints: [], exclusions: [] }, snapshotHash, sources: [{ reference, sha256: 'b'.repeat(64), text: 'Synthetic captured source text.', truncated: false }], attachments: [], imageUnderstanding: false, textByteLimit: 65536 };
}
function intentFixture(state: 'draft' | 'ready_for_approval' = 'draft', version = 1): InternalIntent {
  return { schemaVersion: 1, intentId: randomUUID(), version, goal: planningInput().request.goal, snapshotHash, state, facts: [{ statement: 'Captured private source text is available as untrusted evidence for review.', evidence: [reference], assurance: 'unverified' }], evidence: [reference], decisions: [{ id: 'outcome_confirmation', question: 'Confirm the intended before/after outcome and observable examples.', required: true, answer: null }], assumptions: [{ statement: 'Demo aid only.', assurance: 'unverified' }], unknowns: ['An internal owner must resolve consequential choices before approval.'], acceptanceExamples: [], scope: { included: [provenanceLine(requestId), 'Synthetic only'], excluded: ['Real customer data'] } };
}
function readFixture(intent: InternalIntent, state = intent.state, approval: IntentRead['approval'] = null): IntentRead {
  return { id: intent.intentId, version: intent.version, state, contentHash: contentHash(intent), intent, approval, supersededApproval: false };
}
function persistence(overrides: Partial<IntentPersistence> = {}) {
  const create = vi.fn(async (_actor: unknown, _input: unknown, _binding?: { requestId: string }) => ({ version: 1, contentHash: 'c'.repeat(64) }));
  const revise = vi.fn(async (_actor: unknown, _input: unknown, expectedVersion: number) => ({ version: expectedVersion + 1, contentHash: 'd'.repeat(64) }));
  const transition = vi.fn(async (_actor: unknown, _id: string, expectedVersion: number, to: string) => ({ version: expectedVersion, contentHash: 'd'.repeat(64), state: to }));
  const read = vi.fn(async (_a: unknown, _intentId: string) => readFixture(intentFixture()));
  const store: IntentPersistence = { create, revise, transition, read, readForRequest: vi.fn(async () => { throw new WorkflowError('forbidden_role'); }), ...overrides };
  return { store, create, revise, transition, read };
}
function source(input = planningInput()) {
  return { planningInput: vi.fn(async () => input) };
}
function providerResult(result: unknown): PlannerProvider {
  const value = result && typeof result === 'object' && 'status' in result ? result : { status: 'proposal', mode: 'demo', assurance: 'unverified', proposal: result, provenance: { inputHash: 'e'.repeat(64), proposalHash: 'f'.repeat(64), repairAttempts: 0, modelVerification: 'not_applicable' } };
  return { mode: 'demo', proposeIntent: vi.fn(async () => value) as PlannerProvider['proposeIntent'], proposePartition: vi.fn() as PlannerProvider['proposePartition'] };
}

it('server allocates intent identity and state; the request body cannot supply authority fields', async () => {
  const { store, create } = persistence(), orchestrator = new IntentOrchestrator(store, source());
  const created = await orchestrator.createDraft(actor, requestId, { mode: 'demo' });
  expect(created).toMatchObject({ version: 1, state: 'draft' });
  const [createActor, payload, binding] = create.mock.calls[0]!;
  expect(createActor).toEqual(actor);
  expect(binding).toEqual({ requestId });
  const intent = payload as InternalIntent;
  expect(isUuid(intent.intentId)).toBe(true);
  expect(intent.intentId).not.toBe(requestId);
  expect(intent.version).toBe(1);
  expect(intent.state).toBe('draft');
  expect(intent.goal).toBe(planningInput().request.goal);
  expect(intent.snapshotHash).toBe(snapshotHash);
  expect(intent.scope.included[0]).toBe(provenanceLine(requestId));
  expect(intent.decisions[0]).toMatchObject({ id: 'outcome_confirmation', required: true, answer: null });
  expect(provenanceRequest(intent)).toBe(requestId);
  const rejected = await orchestrator.createDraft(actor, requestId, { mode: 'demo', intentId: randomUUID(), version: 9, state: 'approved', approvedHash: 'a'.repeat(64), endpoint: 'http://127.0.0.1:9999/api/chat', model: 'injected-model', executor: 'ai' }).catch((error: unknown) => error);
  expect((rejected as Error).name).toBe('ZodError');
  expect(create).toHaveBeenCalledTimes(1);
});

it('demo mode produces a reviewable non-authorizing draft with visible provenance', async () => {
  const { create } = persistence(), orchestrator = new IntentOrchestrator({ create } as unknown as IntentPersistence, source(planningInput('A goal-only synthetic outcome.')));
  const created = await orchestrator.createDraft(actor, requestId, { mode: 'demo' });
  expect(created.provider).toMatchObject({ mode: 'demo', repairAttempts: 0, modelVerification: 'not_applicable' });
  expect(created.provider.inputHash).toMatch(/^[a-f0-9]{64}$/);
  expect(created.provider.proposalHash).toMatch(/^[a-f0-9]{64}$/);
  const intent = create.mock.calls[0]![1] as InternalIntent;
  expect(intent.facts[0]!.assurance).toBe('unverified');
  expect(intent.assumptions[0]!.assurance).toBe('unverified');
});

it('an unconfigured private-model choice fails safely with no fallback and no persistence', async () => {
  const { store, create } = persistence(), orchestrator = new IntentOrchestrator(store, source());
  await expect(orchestrator.createDraft(actor, requestId, { mode: 'ollama' })).rejects.toMatchObject({ reason: 'needs_configuration' });
  await expect(orchestrator.createDraft(actor, requestId, { mode: 'ollama' })).rejects.toBeInstanceOf(ProviderUnavailable);
  expect(create).not.toHaveBeenCalled();
});

it('model output is revalidated: invented evidence, answered decisions and failed status never persist', async () => {
  const invented = intentFixture(); invented.evidence = [{ ...reference, evidenceId: randomUUID() }];
  const answered = intentFixture(); answered.decisions = [{ id: 'outcome_confirmation', question: 'Confirm the outcome.', required: true, answer: 'The model decided.' }];
  for (const [proposal, reason] of [[invented, 'invalid_response'], [answered, 'invalid_response'], [{ status: 'failed', mode: 'demo', assurance: 'unverified', reason: 'timeout' }, 'timeout']] as const) {
    const { store, create } = persistence(), orchestrator = new IntentOrchestrator(store, source(), undefined, { demo: providerResult(proposal) });
    await expect(orchestrator.createDraft(actor, requestId, { mode: 'demo' })).rejects.toMatchObject({ reason });
    expect(create).not.toHaveBeenCalled();
  }
});

it('decision resolution is a user-only draft action carried into a new immutable revision', async () => {
  const current = intentFixture('draft', 1);
  const { store, revise } = persistence({ read: vi.fn(async () => readFixture(current)) });
  const orchestrator = new IntentOrchestrator(store, source());
  const outcome = await orchestrator.resolveDecision(actor, current.intentId, { expectedVersion: 1, decisionId: 'outcome_confirmation', answer: 'Confirmed by the synthetic requester.' });
  expect(outcome).toMatchObject({ version: 2, state: 'draft' });
  expect('approvalInvalidated' in outcome).toBe(false);
  const payload = revise.mock.calls[0]![1] as InternalIntent;
  expect(payload.version).toBe(2);
  expect(payload.state).toBe('draft');
  expect(payload.decisions[0]!.answer).toBe('Confirmed by the synthetic requester.');
  expect(payload.facts).toEqual(current.facts);
  expect(payload.scope.included[0]).toBe(provenanceLine(requestId));
  await expect(orchestrator.resolveDecision(actor, current.intentId, { expectedVersion: 7, decisionId: 'outcome_confirmation', answer: 'Late' })).rejects.toMatchObject({ code: 'stale_version' });
  await expect(orchestrator.resolveDecision(actor, current.intentId, { expectedVersion: 1, decisionId: 'unknown_choice', answer: 'Late' })).rejects.toMatchObject({ code: 'missing_evidence' });
});

it('edits after approval create a new draft revision and flag the invalidated approval', async () => {
  const approved = intentFixture('ready_for_approval', 2);
  const { store, revise } = persistence({ read: vi.fn(async () => readFixture(approved, 'approved', { approvedBy: ownerActor.id, approvedHash: contentHash(approved), approvedAt: '2026-10-03T00:00:00.000Z' })) });
  const orchestrator = new IntentOrchestrator(store, source(planningInput('Edited synthetic outcome.')));
  const outcome = await orchestrator.revise(actor, approved.intentId, { expectedVersion: 2, mode: 'demo', desiredBehaviour: 'Edited synthetic desired behaviour.' });
  expect(outcome).toMatchObject({ version: 3, state: 'draft', approvalInvalidated: true });
  const payload = revise.mock.calls[0]![1] as InternalIntent;
  expect(payload.intentId).toBe(approved.intentId);
  expect(payload.goal).toBe('Edited synthetic outcome.');
  expect(payload.decisions[0]!.answer).toBeNull();
  expect(payload.scope.included[0]).toBe(provenanceLine(requestId));
});

it('a legacy intent without provenance cannot be revised through HTTP', async () => {
  const legacy = intentFixture(); legacy.scope = { included: ['Synthetic only'], excluded: [] };
  const { store } = persistence({ read: vi.fn(async () => readFixture(legacy)) });
  const orchestrator = new IntentOrchestrator(store, source());
  await expect(orchestrator.revise(actor, legacy.intentId, { expectedVersion: 1, mode: 'demo' })).rejects.toMatchObject({ code: 'missing_evidence' });
});

it('readiness requires the exact reviewed hash; approval passes the exact version and hash to the store', async () => {
  const current = intentFixture('draft', 1);
  const { store, transition } = persistence({ read: vi.fn(async () => readFixture(current)) });
  const orchestrator = new IntentOrchestrator(store, source());
  await expect(orchestrator.ready(actor, current.intentId, { expectedVersion: 1, expectedHash: 'f'.repeat(64) })).rejects.toMatchObject({ code: 'missing_evidence' });
  expect(transition).not.toHaveBeenCalled();
  await expect(orchestrator.ready(actor, current.intentId, { expectedVersion: 3, expectedHash: contentHash(current) })).rejects.toMatchObject({ code: 'stale_version' });
  await orchestrator.ready(actor, current.intentId, { expectedVersion: 1, expectedHash: contentHash(current) });
  expect(transition).toHaveBeenCalledWith(actor, current.intentId, 1, 'ready_for_approval');
  const approval = await orchestrator.approve(ownerActor, current.intentId, { expectedVersion: 1, expectedHash: contentHash(current) });
  expect(approval).toMatchObject({ id: current.intentId, version: 1, state: 'approved', approvedHash: 'd'.repeat(64) });
  expect(transition).toHaveBeenLastCalledWith(ownerActor, current.intentId, 1, 'approved', contentHash(current));
});

it('the store authorizes with the stored session role and blocks decisions, hash and stale-version mismatches', async () => {
  const unresolved = intentFixture('draft', 1);
  const resolved = { ...unresolved, state: 'ready_for_approval' as const, decisions: [{ ...unresolved.decisions[0]!, answer: 'Confirmed.' }] } as InternalIntent;
  function storeFor(storedRole: 'requester' | 'owner', payload: InternalIntent) {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('private_sessions')) return { rows: [{ role: storedRole }] };
      if (sql.includes('private_intent_heads AS head')) return { rows: [{ id: payload.intentId, version: payload.version, state: payload.state, payload, content_hash: contentHash(payload), requester_id: actor.id }] };
      return { rows: [] };
    });
    return { store: new PrivateIntentStore({ connect: async () => ({ query, release: vi.fn() }) } as unknown as ConstructorParameters<typeof PrivateIntentStore>[0]), query };
  }
  const requesterStore = storeFor('requester', unresolved).store;
  await expect(requesterStore.transition(actor, unresolved.intentId, 1, 'ready_for_approval')).rejects.toMatchObject({ code: 'missing_evidence' });
  await expect(requesterStore.transition(actor, unresolved.intentId, 1, 'approved', contentHash(unresolved))).rejects.toMatchObject({ code: 'invalid_transition' });
  const ownerStore = storeFor('owner', resolved);
  await expect(ownerStore.store.transition(ownerActor, resolved.intentId, 1, 'approved', 'f'.repeat(64))).rejects.toMatchObject({ code: 'missing_evidence' });
  expect(ownerStore.query.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE'))).toBe(false);
  await ownerStore.store.transition(ownerActor, resolved.intentId, 1, 'approved', contentHash(resolved));
  expect(ownerStore.query.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE') && String(sql).includes('approved_hash = content_hash'))).toBe(true);
  await expect(storeFor('requester', resolved).store.transition(ownerActor, resolved.intentId, 1, 'approved', contentHash(resolved))).rejects.toMatchObject({ code: 'forbidden_role' });
  await expect(storeFor('owner', resolved).store.transition(ownerActor, resolved.intentId, 4, 'approved', contentHash(resolved))).rejects.toMatchObject({ code: 'stale_version' });
});

it('request-bound creation rechecks ownership and the exact snapshot binding inside the persistence transaction', async () => {
  const intent = intentFixture();
  const queries: string[] = [];
  function storeWith(bindingRows: Record<string, unknown>[]) {
    const query = vi.fn(async (sql: string) => {
      queries.push(sql);
      if (sql.includes('private_sessions')) return { rows: [{ role: 'requester' }] };
      if (sql.includes('FROM private_requests')) return { rows: bindingRows };
      return { rows: [] };
    });
    return new PrivateIntentStore({ connect: async () => ({ query, release: vi.fn() }) } as unknown as ConstructorParameters<typeof PrivateIntentStore>[0]);
  }
  await storeWith([{ '?column?': 1 }]).create(actor, intent, { requestId });
  const binding = queries.find(sql => sql.includes('FROM private_requests'));
  expect(binding).toContain('requester_id=$2');
  expect(binding).toContain('snapshot_hash=$3');
  await expect(storeWith([]).create(actor, intent, { requestId })).rejects.toMatchObject({ code: 'missing_evidence' });
  expect(queries.filter(sql => sql.startsWith('INSERT')).length).toBe(2);
});

it('provenance helpers round-trip and ignore legacy payloads', () => {
  expect(provenanceRequest(intentFixture())).toBe(requestId);
  const legacy = intentFixture(); legacy.scope = { included: ['Synthetic only'], excluded: [] };
  expect(provenanceRequest(legacy)).toBeNull();
  expect(provenanceLine(randomUUID())).not.toBe(provenanceLine(requestId));
});

it('intake-derived wiring yields a working orchestrator only for a real database handle', async () => {
  expect(intentOrchestrationForIntake({} as unknown as never)).toBeNull();
  expect(intentOrchestrationForIntake({ database: {} } as unknown as never)).toBeNull();
  const handle = intentOrchestrationForIntake({ database: { connect: async () => ({ query: vi.fn(async () => ({ rows: [], rowCount: 0 })), release: vi.fn() }) } } as unknown as never);
  expect(handle).not.toBeNull();
  const read = vi.fn(async () => readFixture(intentFixture()));
  const orchestrator = new IntentOrchestrator({ read } as unknown as IntentPersistence, { planningInput: vi.fn(async () => planningInput()) });
  const review = await orchestrator.review(actor, intentFixture().intentId);
  expect(review).toMatchObject({ state: 'draft', blockage: { requiredUnresolved: 1 } });
  expect(read).toHaveBeenCalledOnce();
});
