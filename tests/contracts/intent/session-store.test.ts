import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { PrivateIntentStore } from '../../../services/private-api/db/intent-store.js';
import { WorkflowError } from '../../../packages/contracts/workflow/index.js';

const actor = { id: randomUUID(), role: 'requester' as const, sessionHash: 'a'.repeat(64), csrfHash: 'b'.repeat(64) };
const intent = { schemaVersion: 1, intentId: randomUUID(), version: 1, goal: 'Synthetic desired outcome', snapshotHash: 'c'.repeat(64), state: 'draft', facts: [], evidence: [], decisions: [], assumptions: [], unknowns: [], acceptanceExamples: [], scope: { included: ['Synthetic only'], excluded: ['Real customer data'] } };
function fixture(authority: Record<string, unknown>[]) {
  const query = vi.fn(async (sql: string, _parameters?: unknown[]) => ({ rows: sql.startsWith('SELECT') ? authority : [], rowCount: 1 }));
  const release = vi.fn();
  const pool = { connect: async () => ({ query, release }) } as unknown as ConstructorParameters<typeof PrivateIntentStore>[0];
  return { store: new PrivateIntentStore(pool), query, release };
}
it('create uses stored current session/role inside the mutation transaction, not a request-supplied actor ID', async () => {
  const { store, query, release } = fixture([{ role: 'requester' }]);
  await store.create(actor, intent);
  const [sql,args] = query.mock.calls[1]!;
  expect(sql).toContain('JOIN private_sessions'); expect(sql).toContain('session.expires_at>now()'); expect(sql).toContain('FOR SHARE OF account, session');
  expect(args).toEqual([actor.id,actor.role,actor.sessionHash,actor.csrfHash]);
  expect(query.mock.calls.find(([statement]) => statement.startsWith('INSERT'))![1]!.at(-1)).toBe(actor.id);
  expect(query.mock.calls.at(-1)![0]).toBe('COMMIT'); expect(release).toHaveBeenCalledOnce();
});
it('revoked/expired authority cannot create a draft after a model completes', async () => {
  const { store, query } = fixture([]);
  await expect(store.create(actor,intent)).rejects.toBeInstanceOf(WorkflowError);
  expect(query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
  expect(query.mock.calls.at(-1)![0]).toBe('ROLLBACK');
});
it('operator/contributor intent authority is rejected before any private mutation', async () => {
  const { store, query } = fixture([{ role: 'owner' }]);
  for(const role of ['operator','contributor'] as const) await expect(store.create({...actor,role},intent)).rejects.toBeInstanceOf(WorkflowError);
  expect(query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
});
