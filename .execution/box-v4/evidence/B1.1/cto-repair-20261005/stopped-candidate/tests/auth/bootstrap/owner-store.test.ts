import { describe, expect, it, vi } from 'vitest';
import { PostgresOwnerBootstrapStore } from '../../../services/private-api/bootstrap/owner-store.js';

function fixture() {
  const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] });
  const release = vi.fn();
  const connect = vi.fn().mockResolvedValue({ query, release });
  const store = new PostgresOwnerBootstrapStore({ connect } as unknown as ConstructorParameters<typeof PostgresOwnerBootstrapStore>[0]);
  return { store, query, release, connect };
}
describe('PostgreSQL bootstrap transaction protocol (not real DB evidence)', () => {
  it('commits consumption and fixed owner insertion on the same client', async () => {
    const { store, query, release, connect } = fixture();
    const account = { id: '11111111-1111-4111-8111-111111111111', username: 'synthetic.owner', passwordHash: 'synthetic-hash', role: 'owner' as const };
    await store.transaction(async tx => { expect(await tx.consumeUnusedBootstrap('a'.repeat(64))).toBe(true); await tx.insertOwner(account); });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.map(call => call[0])).toEqual(['BEGIN', expect.stringContaining('UPDATE bootstrap_owner_authority'), expect.stringContaining('INSERT INTO bootstrap_owner_accounts'), 'COMMIT']);
    expect(query.mock.calls[2]![1]).toEqual([account.id, account.username, account.passwordHash, 'owner']);
    expect(release).toHaveBeenCalledTimes(1);
  });
  it('rolls back consumption when owner insertion fails', async () => {
    const { store, query, release } = fixture();
    query.mockResolvedValueOnce({ rowCount: 0 }).mockResolvedValueOnce({ rowCount: 1 }).mockRejectedValueOnce(new Error('synthetic-insert-failure'));
    await expect(store.transaction(async tx => {
      await tx.consumeUnusedBootstrap('a'.repeat(64));
      await tx.insertOwner({ id: 'invalid-id', username: 'synthetic.owner', passwordHash: 'synthetic-hash', role: 'owner' });
    })).rejects.toThrow('synthetic-insert-failure');
    expect(query.mock.calls.at(-1)![0]).toBe('ROLLBACK');
    expect(query.mock.calls.some(call => call[0] === 'COMMIT')).toBe(false);
    expect(release).toHaveBeenCalledTimes(1);
  });
  it('does not treat a missing/consumed token as available', async () => {
    const { store, query } = fixture();
    query.mockResolvedValue({ rowCount: 0, rows: [] });
    await store.transaction(async tx => { expect(await tx.consumeUnusedBootstrap('b'.repeat(64))).toBe(false); });
  });
  it('never rotates or restores consumed authority during initialization', async () => {
    const { store, query } = fixture();
    await store.initialize('a'.repeat(64));
    expect(query.mock.calls.find(call => String(call[0]).startsWith('INSERT INTO bootstrap_owner_authority'))).toEqual([expect.stringContaining('ON CONFLICT (singleton) DO NOTHING'), ['a'.repeat(64)]]);
    expect(query.mock.calls.some(call => String(call[0]).includes('SET consumed = false'))).toBe(false);
  });
});
