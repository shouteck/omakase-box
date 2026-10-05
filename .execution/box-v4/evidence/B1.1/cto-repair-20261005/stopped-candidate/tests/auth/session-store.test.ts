import { expect, it, vi } from 'vitest';
import { hashPassword, signSession, tokenHash } from '../../packages/contracts/auth/crypto.js';
import { AuthDenied, SessionStore } from '../../packages/contracts/auth/store.js';

const token = 'a'.repeat(64); const key = Buffer.alloc(32, 1);
function fixture(rows: Record<string, unknown>[][]) {
  const query = vi.fn().mockImplementation(async () => ({ rows: rows.shift() ?? [], rowCount: 1 }));
  const release = vi.fn();
  const store = new SessionStore({ connect: async () => ({ query, release }) }, 'private', key);
  return { store, query, release };
}
it('derives authority only from unexpired enabled DB account/session records', async () => {
  const { store, query } = fixture([[{ id: 'synthetic-owner', role: 'owner', csrf_hash: tokenHash('csrf-token') }]]);
  expect((await store.authenticate(signSession(token,key,'private'))).role).toBe('owner');
  expect(query.mock.calls[0]![0]).toContain('session.expires_at>now() AND NOT account.disabled');
  await expect(fixture([[]]).store.authenticate(signSession(token,key,'private'))).rejects.toBeInstanceOf(AuthDenied);
});
it('rejects wrong service signatures, revoked/expired records and forged CSRF', async () => {
  await expect(fixture([]).store.authenticate(signSession(token,key,'external'))).rejects.toBeInstanceOf(AuthDenied);
  await expect(fixture([[{ id:'synthetic-owner',role:'owner',csrf_hash:tokenHash('actual') }]]).store.authenticate(signSession(token,key,'private'),'wrong')).rejects.toBeInstanceOf(AuthDenied);
});
it('requires an actual bounded CSRF token for mutations, not an omitted GET-style argument', async () => {
  await expect(fixture([]).store.authenticateMutation(signSession(token,key,'private'), undefined as unknown as string)).rejects.toBeInstanceOf(AuthDenied);
  await expect(fixture([]).store.authenticateMutation(signSession(token,key,'private'), 'short')).rejects.toBeInstanceOf(AuthDenied);
});
it('rejects stored contributor authority in the private service and revokes only the verified current session', async () => {
  await expect(fixture([[{id:'synthetic-contributor',role:'contributor',csrf_hash:'b'.repeat(64)}]]).store.authenticate(signSession(token,key,'private'))).rejects.toBeInstanceOf(AuthDenied);
  const {store,query}=fixture([]);
  await store.revokeSession({id:'synthetic-owner',role:'owner',sessionHash:'a'.repeat(64),csrfHash:'b'.repeat(64)});
  expect(query).toHaveBeenCalledWith('DELETE FROM private_sessions WHERE token_hash=$1 AND account_id=$2',['a'.repeat(64),'synthetic-owner']);
});
it('refuses disabled account login even with a valid password', async () => {
  const password='synthetic-password-only'; const stored=await hashPassword(password);
  const {store,query}=fixture([[],[{id:'synthetic-disabled',password_hash:stored,disabled:true,role:'owner'}]]);
  await expect(store.login('synthetic.disabled',password)).rejects.toBeInstanceOf(AuthDenied);
  expect(query.mock.calls.at(-1)![0]).toBe('ROLLBACK');
});
it('rechecks and locks current owner session authority inside invitation creation', async () => {
  const actor = { id: '11111111-1111-4111-8111-111111111111', role: 'owner' as const, sessionHash: 'a'.repeat(64), csrfHash: 'b'.repeat(64) };
  const { store, query } = fixture([[], [{ id: actor.id }], [], []]);
  await store.createPrivateInvitation(actor, 'requester');
  const [sql, parameters] = query.mock.calls[1]!;
  expect(sql).toContain('JOIN private_sessions');
  expect(sql).toContain('session.token_hash=$2');
  expect(sql).toContain('session.csrf_hash=$3');
  expect(sql).toContain('session.expires_at>now()');
  expect(sql).toContain('FOR SHARE OF account, session');
  expect(parameters).toEqual([actor.id, actor.sessionHash, actor.csrfHash]);
  const revoked = fixture([[], []]);
  await expect(revoked.store.createPrivateInvitation(actor, 'operator')).rejects.toBeInstanceOf(AuthDenied);
  expect(revoked.query.mock.calls.some(([statement]) => statement.startsWith('INSERT'))).toBe(false);
  expect(revoked.query.mock.calls.at(-1)![0]).toBe('ROLLBACK');
});
it('locks invitation redemption and rolls back revoked/expired/missing tokens', async () => {
  const {store,query,release}=fixture([[],[]]);
  await expect(store.redeemInvitation(token,'synthetic.invited','synthetic-password-only')).rejects.toBeInstanceOf(AuthDenied);
  expect(query.mock.calls[1]![0]).toContain('NOT revoked AND redeemed_at IS NULL AND expires_at>now() FOR UPDATE');
  expect(query.mock.calls.at(-1)![0]).toBe('ROLLBACK'); expect(release).toHaveBeenCalledOnce();
});
