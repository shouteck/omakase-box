import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { PrivateIntakeStore } from '../../../services/private-api/requests/store.js';
import { AuthDenied } from '../../../packages/contracts/auth/store.js';

it('rejects revoked sessions inside the storage transaction before resource access or mutation', async () => {
  const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }), release = vi.fn();
  const store = new PrivateIntakeStore({ connect: async () => ({ query, release }) });
  const actor = { id: randomUUID(), role: 'requester' as const, sessionHash: 'a'.repeat(64), csrfHash: 'b'.repeat(64) };
  await expect(store.createRequest(actor, { snapshotId: randomUUID(), goal: 'Synthetic' })).rejects.toBeInstanceOf(AuthDenied);
  const [sql, parameters] = query.mock.calls[1]!;
  expect(sql).toContain('session.expires_at>now()'); expect(sql).toContain('NOT account.disabled'); expect(sql).toContain('FOR SHARE OF account, session');
  expect(parameters).toEqual([actor.id, actor.role, actor.sessionHash, actor.csrfHash]);
  expect(query.mock.calls.some(([statement]) => statement.startsWith('INSERT'))).toBe(false);
  expect(query.mock.calls.at(-1)![0]).toBe('ROLLBACK'); expect(release).toHaveBeenCalledOnce();
});
it('rejects contributor/operator request authority before opening a private transaction', async () => {
  const connect = vi.fn(); const store = new PrivateIntakeStore({ connect });
  for (const role of ['operator','contributor'] as const) await expect(store.createRequest({ id: randomUUID(), role, sessionHash: 'a'.repeat(64), csrfHash: 'b'.repeat(64) }, { snapshotId: randomUUID(), goal: 'Synthetic' })).rejects.toBeInstanceOf(AuthDenied);
  expect(connect).not.toHaveBeenCalled();
});
