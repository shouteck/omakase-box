import { generateKeyPairSync, randomUUID, verify } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import Fastify from '../../../services/private-api/node_modules/fastify/fastify.js';
import { canonicalize, contentHash } from '../../../packages/contracts/hash.js';
import { PrivateAssignmentStore } from '../../../services/private-api/assignments/store.js';
import { installOwnerAssignmentRoutes } from '../../../services/private-api/assignments/routes.js';
import { verifyAssignmentCommand, verifyRevocationCommand } from '../../../services/external-api/reservations/assignment-protocol.js';
import { tokenHash } from '../../../services/external-api/reservations/assignments.js';

const keys = generateKeyPairSync('ed25519');
const actor = { id: randomUUID(), role: 'owner' as const, sessionHash: 'a'.repeat(64), csrfHash: 'b'.repeat(64) };
const input = () => ({ taskId: randomUUID(), taskVersion: 1, packageDigest: 'c'.repeat(64), idempotencyKey: randomUUID(), executor: { kind: 'human' as const, label: 'Synthetic invited contributor', contributorId: randomUUID() } });
function fixture(authority = true, ready = true) {
  const commands: unknown[] = [], rows: Record<string, unknown>[] = [], invitations: Record<string, unknown>[] = [];
  const query = vi.fn(async (sql: string, args: unknown[] = []) => {
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [], rowCount: null };
    if (sql.includes('JOIN private_sessions')) return { rows: authority ? [{ id: actor.id }] : [], rowCount: authority ? 1 : 0 };
    if (sql.startsWith('INSERT INTO private_assignment_invitations')) { invitations.push({ assignment_id: args[0], contributor_id: args[1], token_hash: args[2], token: args[3], issued_at: args[4], expires_at: args[5], revoked_at: null }); return { rows: [], rowCount: 1 }; }
    if (sql.startsWith('SELECT') && sql.includes('private_assignment_invitations')) return { rows: invitations.filter(row => row.assignment_id === args[0]), rowCount: 1 };
    if (sql.startsWith('UPDATE private_assignment_invitations')) { const found = invitations.find(row => row.assignment_id === args[0]); if (found) found.revoked_at = new Date(); return { rows: [], rowCount: found ? 1 : 0 }; }
    if (sql.startsWith('SELECT') && sql.includes('private_assignments')) {
      const found = sql.includes('idempotency_key') ? rows.filter(row => row.owner_id === args[0] && row.idempotency_key === args[1]) : rows.filter(row => row.id === args[0] && row.owner_id === args[1]);
      return { rows: found, rowCount: found.length };
    }
    if (sql.startsWith('INSERT INTO private_assignments')) {
      const row = { id: args[0], owner_id: args[1], idempotency_key: args[2], request_hash: args[3], task_id: args[4], task_version: args[5], package_digest: args[6], executor: args[7], created_at: new Date() };
      rows.push(row); return { rows: [row], rowCount: 1 };
    }
    if (sql.startsWith('INSERT INTO private_assignment_outbox')) { commands.push(args[2]); return { rows: [], rowCount: 1 }; }
    throw new Error('Unexpected synthetic assignment SQL');
  });
  const release = vi.fn(), pool = { connect: async () => ({ query, release }) } as unknown as ConstructorParameters<typeof PrivateAssignmentStore>[0];
  const gate = vi.fn(async (_client: unknown, taskId: string, taskVersion: number) => ({ taskId, taskVersion, packageDigest: 'c'.repeat(64), ready }));
  return { store: new PrivateAssignmentStore(pool, keys.privateKey, gate), pool, query, release, gate, commands };
}

it('requires an active owner session in the same transaction and queues only the exact signed public choice', async () => {
  const world = fixture(), request = input();
  const result = await world.store.choose(actor, request);
  expect(result.executor).toEqual({ kind: 'human', label: request.executor.label });
  expect(result.status).toBe('queued');
  expect(result.publicationEnabled).toBe(false);
  const [sql, parameters] = world.query.mock.calls[1]!;
  expect(sql).toContain('session.expires_at>now()');
  expect(sql).toContain('NOT account.disabled');
  expect(sql).toContain('FOR SHARE OF account, session');
  expect(parameters).toEqual([actor.id, actor.sessionHash, actor.csrfHash]);
  const packet = world.commands[0] as { payload: Record<string, unknown>; signature: string };
  expect(verify(null, Buffer.from(canonicalize(packet.payload)), keys.publicKey, Buffer.from(packet.signature, 'base64'))).toBe(true);
  expect(verifyAssignmentCommand(packet, keys.publicKey, Date.now()).packageDigest).toBe(request.packageDigest);
  expect(JSON.stringify(packet)).not.toMatch(/owner_id|sessionHash|csrfHash|privateRevision|chosenBy/);
  expect(world.query.mock.calls.at(-1)![0]).toBe('COMMIT');
  expect(world.release).toHaveBeenCalledOnce();
});

it.each(['requester', 'operator', 'contributor'])('rejects %s before recording any assignment', async role => {
  const world = fixture();
  await expect(world.store.choose({ ...actor, role } as never, input())).rejects.toThrow('forbidden_role');
  expect(world.query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
});

it('rejects revoked or expired authority even when a caller asserts owner', async () => {
  const world = fixture(false);
  await expect(world.store.choose(actor, input())).rejects.toThrow('forbidden_role');
  expect(world.commands).toEqual([]);
  expect(world.query.mock.calls.at(-1)![0]).toBe('ROLLBACK');
});

it('missing or failed readiness and stale package hashes cannot queue a command', async () => {
  const blocked = fixture(true, false);
  await expect(blocked.store.choose(actor, input())).rejects.toThrow('missing_evidence');
  expect(blocked.commands).toEqual([]);
  const noGate = new PrivateAssignmentStore(blocked.pool, keys.privateKey);
  await expect(noGate.choose(actor, input())).rejects.toThrow('missing_evidence');
  const stale = fixture();
  await expect(stale.store.choose(actor, { ...input(), packageDigest: 'd'.repeat(64) })).rejects.toThrow('stale_version');
  expect(stale.commands).toEqual([]);
});

it('rejects body-supplied authority and readiness assertions instead of silently stripping them', async () => {
  for (const extra of [{ chosenBy: 'forged-owner' }, { role: 'owner' }, { publicationReady: true }, { privateRevision: 'secret' }]) {
    const world = fixture();
    await expect(world.store.choose(actor, { ...input(), ...extra })).rejects.toThrow();
    expect(world.commands).toEqual([]);
  }
});

it('idempotent owner retries preserve the exact choice and never queue a second command', async () => {
  const world = fixture(), request = input();
  const first = await world.store.choose(actor, request), second = await world.store.choose(actor, request);
  expect(second.id).toBe(first.id);
  expect(world.commands).toHaveLength(1);
  await expect(world.store.choose(actor, { ...request, executor: { ...request.executor, label: 'Changed choice' } })).rejects.toThrow('stale_version');
  expect(world.commands).toHaveLength(1);
  expect(contentHash(request)).toMatch(/^[a-f0-9]{64}$/);
});

it('queues exactly one signed revocation bound to the issued invitation and stays idempotent', async () => {
  const world = fixture(), request = input();
  const choice = await world.store.choose(actor, request);
  expect(choice.invitation?.contributorId).toBe(request.executor.contributorId);
  const queued = await world.store.revokeInvitation(actor, { assignmentId: choice.id });
  expect(queued).toEqual({ schemaVersion: 1, assignmentId: choice.id, status: 'revocation_queued', duplicate: false });
  const packet = world.commands.at(-1) as { payload: Record<string, unknown>; signature: string };
  const command = verifyRevocationCommand(packet, keys.publicKey, Date.now());
  expect(command).toMatchObject({ assignmentId: choice.id, taskId: request.taskId, contributorId: request.executor.contributorId });
  expect(command.tokenHash).toBe(tokenHash(choice.invitation!.token));
  const again = await world.store.revokeInvitation(actor, { assignmentId: choice.id });
  expect(again.duplicate).toBe(true);
  expect(world.commands).toHaveLength(2);
  await expect(world.store.revokeInvitation(actor, { assignmentId: randomUUID() })).rejects.toThrow('not_found');
  await expect(world.store.revokeInvitation({ ...actor, role: 'contributor' } as never, { assignmentId: choice.id })).rejects.toThrow('forbidden_role');
  expect(world.commands).toHaveLength(2);
});

it('owner HTTP routes derive authority from the permission source and return only safe failures', async () => {
  const app = Fastify({ logger: false }), world = fixture();
  const denied = { requirePermission: (_request: unknown, reply: { code(code: number): { send(body: unknown): unknown } }) => { reply.code(403).send({ error: 'forbidden' }); return null; } };
  installOwnerAssignmentRoutes(app, denied as never, world.store);
  try {
    const response = await app.inject({ method: 'POST', url: '/v1/assignments', payload: { ...input(), role: 'owner' } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'forbidden' });
    expect(world.commands).toEqual([]);
  } finally { await app.close(); }
});
