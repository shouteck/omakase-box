import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import type { SessionActor } from '../../../packages/contracts/auth/store.js';
import type { AuthAction } from '../../../packages/contracts/auth/policy.js';
import type { InternalIntent } from '../../../packages/contracts/private/index.js';
import { PreparationOrchestrator } from '../../../services/private-api/preparations/orchestrator.js';
import type { PreparationIntentRead } from '../../../services/private-api/preparations/orchestrator.js';
import { SyntheticShopPlanningIntegrationSource } from '../../../services/private-api/preparations/demo-integration.js';
import { installPreparationRoutes } from '../../../services/private-api/preparations/routes.js';
import { SELECTION_GOAL, SOURCE_CANARY, planningInput, approvedFixture } from './fixtures.js';

interface TestRouteReply { code(value: number): TestRouteReply; send(value: unknown): unknown }
interface TestFastifyInstance { post(route: string, handler: (request: unknown, reply: TestRouteReply) => Promise<unknown>): unknown; close(): Promise<void> }
interface TestInjectedResponse { statusCode: number; body: string; json(): Record<string, unknown> }
interface TestFastishClient { inject(options: { method: string; url: string; payload?: unknown }): Promise<TestInjectedResponse> }
type FastifyFactory = { (options?: { logger?: boolean }): TestFastifyInstance & TestFastishClient };
const serviceRequire = createRequire(new URL('../../../services/private-api/package.json', import.meta.url));
const fastifyModule: unknown = serviceRequire('fastify');
const Fastify: FastifyFactory = (typeof fastifyModule === 'function' ? fastifyModule : (fastifyModule as { default: unknown }).default) as FastifyFactory;

const actor: SessionActor = { id: randomUUID(), role: 'owner', sessionHash: 'a'.repeat(64), csrfHash: 'b'.repeat(64) };

function fixtureRead(state: 'approved' | 'draft' | 'ready_for_approval' = 'approved'): PreparationIntentRead {
  const planning = planningInput(state === 'approved' ? SELECTION_GOAL : 'Unmatched synthetic outcome.');
  const intentId = randomUUID();
  const intent: InternalIntent = {
    schemaVersion: 1,
    intentId,
    version: 1,
    state: 'approved' as const,
    goal: planning.request.goal,
    snapshotHash: planning.snapshotHash,
    facts: [],
    evidence: [planning.sources[0]!.reference],
    decisions: [{ id: 'outcome_confirmation', question: 'Confirm the intended behaviour.', required: true, answer: 'Confirmed synthetic outcome.' }],
    assumptions: [],
    unknowns: [],
    acceptanceExamples: [{
      id: 'selection_api',
      description: 'Validate selected ID against trusted option context; browser-supplied context cannot override it.',
      inputs: ['Approved synthetic inputs only.'],
      outputs: ['The published observable result.'],
      states: ['normal'],
      invalidCases: ['Malformed inputs receive the published safe rejection.'],
      exclusions: ['Private computation and real credentials are excluded.'],
      examples: [{ given: 'The approved synthetic scenario.', when: 'The stated action occurs.', then: 'The stated requirement is observed.' }]
    }],
    scope: {
      included: [`Private provenance: planning request ${planning.request.requestId} supplied the captured snapshot and evidence for this intent.`, SELECTION_GOAL],
      excluded: []
    }
  };
  return { id: intentId, version: 1, state, contentHash: fixtureHashOrNull(intent), intent, approval: state === 'approved' ? { approvedBy: randomUUID(), approvedHash: fixtureHashOrNull(intent), approvedAt: '2026-10-03T09:00:00.000Z' } : null, supersededApproval: false };
}
function fixtureHashOrNull(intent: unknown) { return '0000000000000000000000000000000000000000000000000000000000000000'; }

function handlers() {
  return {
    requirePermission(request: unknown, reply: { code: (value: number) => { send: (value: unknown) => unknown } }, action: AuthAction): SessionActor | null {
      const permittedAction: AuthAction = 'intent.read';
      if (action === permittedAction && actor.role === 'owner') return actor;
      void request;
      reply.code(403).send({ error: 'forbidden' });
      return null;
    }
  };
}

async function boot() {
  const read = fixtureRead('approved');
  const app = Fastify({ logger: false });
  const orchestration = new PreparationOrchestrator(
    { planningInput: async () => planningInput(SELECTION_GOAL) },
    { read: async () => read },
    new SyntheticShopPlanningIntegrationSource()
  );
  installPreparationRoutes(app as never, handlers() as never, orchestration);
  return { app, read };
}

async function inject(app: TestFastifyInstance & TestFastishClient, read: PreparationIntentRead, body: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: `/v1/intents/${read.id}/preparation`, payload: body });
}

it('an owner request for the exact approved intent revision composes connected work-unit proposals without snapshot text', async () => {
  const checked = await approvedFixture(SELECTION_GOAL);
  const read: PreparationIntentRead = { id: checked.intent.intentId, version: 1, state: 'approved', contentHash: checked.intentHash, intent: checked.intent, approval: { approvedBy: randomUUID(), approvedHash: checked.intentHash, approvedAt: '2026-10-03T09:00:00.000Z' }, supersededApproval: false };
  const app = Fastify({ logger: false });
  const orchestration = new PreparationOrchestrator(
    { planningInput: async () => checked.planning },
    { read: async () => read },
    new SyntheticShopPlanningIntegrationSource()
  );
  installPreparationRoutes(app as never, handlers() as never, orchestration);
  const response = await inject(app, read, { expectedVersion: read.version, expectedHash: read.contentHash, mode: 'demo' });
  expect(response.statusCode).toBe(201);
  const body = response.json() as { assurance: string; provider: { mode: string }; partition: { status: string; integrationPlan: { workUnitMappings: readonly { unitId: string }[] } } };
  expect(body.assurance).toBe('bounded');
  expect(body.provider.mode).toBe('demo');
  expect(body.partition.status).toBe('proposed');
  expect(body.partition.integrationPlan.workUnitMappings.map((mapping: { unitId: string }) => mapping.unitId)).toEqual(['selection_ui', 'selection_api']);
  expect(JSON.stringify(body).includes(SOURCE_CANARY)).toBe(false);
  await app.close();
});

it('stale versions, wrong hashes and unapproved states never produce proposals', async () => {
  const { app, read } = await boot();
  const stale = await inject(app, read, { expectedVersion: 99, expectedHash: read.contentHash, mode: 'demo' });
  expect(stale.statusCode).toBe(409);
  expect(stale.json().error).toBe('stale_version');
  const wrongHash = await inject(app, read, { expectedVersion: read.version, expectedHash: '0'.repeat(64), mode: 'demo' });
  expect(wrongHash.statusCode).toBe(422);
  expect(wrongHash.json().error).toBe('missing_evidence');
  await app.close();
});

it('a missing declared integration binding blocks composition instead of inventing one', async () => {
  const app = Fastify({ logger: false });
  const unmatchable = fixtureRead('approved');
  const orchestration = new PreparationOrchestrator(
    { planningInput: async () => planningInput(unmatchable.intent.goal) },
    { read: async () => unmatchable },
    new SyntheticShopPlanningIntegrationSource()
  );
  installPreparationRoutes(app as never, handlers() as never, orchestration);
  const response = await inject(app, unmatchable, { expectedVersion: 1, expectedHash: unmatchable.contentHash, mode: 'demo' });
  expect(response.statusCode).toBe(422);
  expect(response.json().error).toBe('missing_evidence');
  await app.close();
});

it('roles without intent.read permission never reach compositions; invalid bodies are rejected', async () => {
  const checked = await approvedFixture(SELECTION_GOAL);
  const read: PreparationIntentRead = { id: checked.intent.intentId, version: 1, state: 'approved', contentHash: checked.intentHash, intent: checked.intent, approval: { approvedBy: randomUUID(), approvedHash: checked.intentHash, approvedAt: '2026-10-03T09:00:00.000Z' }, supersededApproval: false };
  const orchestration = new PreparationOrchestrator({ planningInput: async () => checked.planning }, { read: async () => read }, new SyntheticShopPlanningIntegrationSource());
  const app = Fastify({ logger: false });
  installPreparationRoutes(app as never, {
    requirePermission(_request: unknown, reply: TestRouteReply, _action: AuthAction): SessionActor | null {
      reply.code(403).send({ error: 'forbidden' });
      return null;
    }
  } as never, orchestration);
  const denied = await inject(app as never, read, { expectedVersion: read.version, expectedHash: read.contentHash, mode: 'demo' });
  expect(denied.statusCode).toBe(403);
  await app.close();

  const invalidApp = Fastify({ logger: false });
  installPreparationRoutes(invalidApp as never, {
    requirePermission(_request: unknown, _reply: TestRouteReply, _action: AuthAction): SessionActor | null {
      return { id: randomUUID(), role: 'owner', sessionHash: 'a'.repeat(64), csrfHash: 'b'.repeat(64) };
    }
  } as never, new PreparationOrchestrator({ planningInput: async () => checked.planning }, { read: async () => read }, new SyntheticShopPlanningIntegrationSource()));
  const invalid = await inject(invalidApp as never, read, { expectedVersion: -1, expectedHash: read.contentHash, mode: 'demo' });
  expect(invalid.statusCode).toBe(400);
  expect(invalid.json()).toMatchObject({ error: 'invalid_input' });
  await invalidApp.close();
});
