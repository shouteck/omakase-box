import { describe, expect, it } from 'vitest';
import { createPrivateApi } from '../../services/private-api/src/bootstrap/server.js';
import { createExternalApi } from '../../services/external-api/src/bootstrap/server.js';
import { runUnavailableJob, runnerCapability } from '../../services/runner-controller/src/bootstrap/index.js';

for (const [name, create, hostname, origin] of [
  ['private-api', createPrivateApi, 'private.localhost:4000', 'http://private.localhost:3000'],
  ['external-api', createExternalApi, 'contributor.localhost:4001', 'http://contributor.localhost:3001']
] as const) {
  describe(name, () => {
    it('returns a fixed positive health projection without credentials', async () => {
      const app = create();
      try {
        const response = await app.inject({ url: '/health', headers: { host: hostname, origin } });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ service: name, status: 'bootstrap', assurance: 'tested', productReady: false });
        expect(response.headers['access-control-allow-origin']).toBe(origin);
        expect(response.headers['set-cookie']).toBeUndefined();
      } finally { await app.close(); }
    });
    it('rejects foreign origins and unrecognized hosts', async () => {
      const app = create();
      try {
        for (const headers of [{ host: hostname, origin: 'https://attacker.invalid' }, { host: 'localhost:4000' }]) {
          const response = await app.inject({ url: '/health', headers });
          expect(response.statusCode).toBe(403);
          expect(response.json()).toEqual({ error: 'forbidden' });
          expect(response.headers['access-control-allow-origin']).toBeUndefined();
        }
      } finally { await app.close(); }
    });
    it('has no approval, submission or private data routes', async () => {
      const app = create();
      try {
        for (const url of ['/v1/release-approvals', '/v1/submissions', '/v1/snapshots', '/arbitrary-secret-path']) {
          const response = await app.inject({ url, headers: { host: hostname } });
          expect(response.statusCode).toBe(404);
          expect(response.json()).toEqual({ error: 'not_found' });
          expect(response.body).not.toContain(url);
        }
      } finally { await app.close(); }
    });
  });
}

describe('unconfigured evaluator', () => {
  it('cannot claim real runner availability', () => {
    expect(runnerCapability()).toEqual({ assurance: 'unverified', status: 'needs_configuration', requiredProfile: 'dedicated-linux-kvm-fresh-vm', hostExecutionAllowed: false });
  });
  it('never falls back to host execution', async () => {
    await expect(runUnavailableJob()).rejects.toThrow('host execution is forbidden');
  });
});
