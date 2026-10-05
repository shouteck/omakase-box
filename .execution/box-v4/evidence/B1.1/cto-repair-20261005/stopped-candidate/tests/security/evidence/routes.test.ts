import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createPrivateApi } from '../../../services/private-api/src/bootstrap/server.js';
import { createExternalApi } from '../../../services/external-api/src/bootstrap/server.js';
import type { SessionStore } from '../../../packages/contracts/auth/store.js';
import { AuthDenied } from '../../../packages/contracts/auth/store.js';
import type { PrivateIntakeStore } from '../../../services/private-api/requests/store.js';

const id = randomUUID();
const headers = { host: 'private.localhost:4000', origin: 'http://private.localhost:3000', cookie: 'private_session=synthetic', 'x-csrf-token': 'c'.repeat(64) };
function sessions(role: 'owner' | 'requester' | 'operator') {
  const actor = { id, role, sessionHash: 'a'.repeat(64), csrfHash: 'b'.repeat(64) };
  return { authenticate: async () => actor, authenticateMutation: async (_cookie: string, csrf: string) => { if (csrf !== headers['x-csrf-token']) throw new AuthDenied(); return actor; } } as unknown as SessionStore;
}
it('a requester cannot import arbitrary host paths or impersonate an operator', async () => {
  const registerSnapshot = vi.fn();
  const app = createPrivateApi({ store: sessions('requester'), mode: 'localhost_demo', intake: { registerSnapshot } as unknown as PrivateIntakeStore });
  try {
    const response = await app.inject({ method: 'POST', url: '/v1/snapshots', headers, payload: { sourceId: 'synthetic-shop', root: 'C:/synthetic-private-canary', role: 'operator' } });
    expect(response.statusCode).toBe(403); expect(registerSnapshot).not.toHaveBeenCalled();
  } finally { await app.close(); }
});
it('operator imports accept only configured source IDs and reject extra path fields', async () => {
  const registerSnapshot = vi.fn();
  const app = createPrivateApi({ store: sessions('operator'), mode: 'localhost_demo', intake: { registerSnapshot } as unknown as PrivateIntakeStore });
  try {
    const response = await app.inject({ method: 'POST', url: '/v1/snapshots', headers, payload: { sourceId: 'synthetic-shop', root: 'C:/canary' } });
    expect(response.statusCode).toBe(400); expect(registerSnapshot).not.toHaveBeenCalled();
    expect((await app.inject({ method: 'POST', url: '/v1/requests', headers, payload: { snapshotId: id, goal: 'Synthetic' } })).statusCode).toBe(403);
  } finally { await app.close(); }
});
it('evidence downloads are opaque attachments with no HTML execution or host-path headers', async () => {
  const evidence = vi.fn().mockResolvedValue({ id, mediaType: 'text/plain', bytes: Buffer.from('<script>syntheticCanary()</script>') });
  const app = createPrivateApi({ store: sessions('requester'), mode: 'localhost_demo', intake: { evidence } as unknown as PrivateIntakeStore });
  try {
    const response = await app.inject({ url: `/v1/requests/${id}/evidence/${id}`, headers });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/octet-stream');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-disposition']).toBe(`attachment; filename="${id}.txt"`);
    expect(response.headers['content-security-policy']).toContain('sandbox');
    expect(response.body).toBe('<script>syntheticCanary()</script>');
  } finally { await app.close(); }
});
it('private storage failures project fixed errors, and contributor API has no evidence routes', async () => {
  const intake = { request: vi.fn().mockRejectedValue(new Error('synthetic-private-root-canary')) } as unknown as PrivateIntakeStore;
  const app = createPrivateApi({ store: sessions('requester'), mode: 'localhost_demo', intake });
  const external = createExternalApi();
  try {
    const failure = await app.inject({ url: `/v1/requests/${id}`, headers });
    expect(failure.statusCode).toBe(503); expect(failure.json()).toEqual({ error: 'resource_unavailable' }); expect(failure.body).not.toContain('canary');
    const denied = await external.inject({ url: `/v1/requests/${id}/evidence/${id}`, headers: { host: 'contributor.localhost:4001' } });
    expect(denied.statusCode).toBe(404); expect(denied.json()).toEqual({ error: 'not_found' });
  } finally { await app.close(); await external.close(); }
});
