import Fastify from '../../../services/external-api/node_modules/fastify/fastify.js';
import { expect, it } from 'vitest';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { installContributorSubmissionRoutes, installSubmissionExportRoutes } from '../../../services/external-api/submissions/routes.js';
import { SubmissionRejected } from '../../../services/external-api/submissions/store.js';
import type { SqlSubmissionStore } from '../../../services/external-api/submissions/store.js';
import { SubmissionExportReceiver } from '../../../services/external-api/submissions/export-receiver.js';
import { signPayload } from '../../../services/external-api/submissions/protocol.js';

const RESERVATION = '55555555-5555-4555-8555-555555555555';
const CONTRIBUTOR = '66666666-6666-4666-8666-666666666666';
const TASK = '11111111-1111-4111-8111-111111111111';

function envelope(patch = 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-a\n+b\n') {
  return { taskId: TASK, taskVersion: 1, packageHash: 'a'.repeat(64), idempotencyKey: randomUUID(), patchBase64: Buffer.from(patch).toString('base64') };
}

function appWith(store: Partial<SqlSubmissionStore>, actor: { id: string; role: string } | null = { id: CONTRIBUTOR, role: 'contributor' }) {
  const app = Fastify({ logger: false });
  installContributorSubmissionRoutes(app, store as SqlSubmissionStore, { requirePermission: () => actor });
  return app;
}

it('rejects submissions without an authenticated contributor', async () => {
  const app = appWith({ submit: async () => { throw new Error('unreachable'); } }, null);
  const response = await app.inject({ method: 'POST', url: `/v1/reservations/${RESERVATION}/submissions`, payload: envelope() });
  expect(response.statusCode).toBe(401);
  expect(response.json()).toEqual({ error: 'authentication_denied' });
  await app.close();
});

it('rejects submissions from non-contributor actors', async () => {
  const app = appWith({ submit: async () => { throw new Error('unreachable'); } }, { id: CONTRIBUTOR, role: 'owner' });
  const response = await app.inject({ method: 'POST', url: `/v1/reservations/${RESERVATION}/submissions`, payload: envelope() });
  expect(response.statusCode).toBe(403);
  await app.close();
});

it('rejects malformed envelopes and non-strict base64 before any store call', async () => {
  let calls = 0;
  const app = appWith({ submit: async () => { calls += 1; throw new Error('unreachable'); } });
  const cases = [
    { method: 'POST', url: `/v1/reservations/not-a-uuid/submissions`, payload: envelope() },
    { method: 'POST', url: `/v1/reservations/${RESERVATION}/submissions`, payload: { ...envelope(), taskVersion: 0 } },
    { method: 'POST', url: `/v1/reservations/${RESERVATION}/submissions`, payload: { ...envelope(), packageHash: 'xyz' } },
    { method: 'POST', url: `/v1/reservations/${RESERVATION}/submissions`, payload: { ...envelope(), idempotencyKey: 'short' } },
    { method: 'POST', url: `/v1/reservations/${RESERVATION}/submissions`, payload: { ...envelope(), patchBase64: '!!!invalid base64!!!' } },
  ] as const;
  for (const request of cases) {
    const response = await app.inject({ method: request.method, url: request.url, payload: request.payload });
    expect(response.statusCode, request.url).toBe(422);
    expect(response.json()).toEqual({ error: 'invalid_envelope' });
  }
  expect(calls).toBe(0);
  await app.close();
});

it('returns the authoritative attempt on duplicate and safe codes on rejection', async () => {
  const submission = { id: randomUUID(), reservationId: RESERVATION, taskId: TASK, taskVersion: 1, packageHash: 'a'.repeat(64), submissionHash: 'b'.repeat(64), state: 'received' as const, version: 1 };
  const [dup, full, gone] = [randomUUID(), randomUUID(), randomUUID()];
  const store = {
    async submit(input: { idempotencyKey: string }) {
      if (input.idempotencyKey === dup) return { status: 'duplicate' as const, submission, permit: {} as never };
      if (input.idempotencyKey === full) throw new SubmissionRejected('attempt_budget_exceeded');
      if (input.idempotencyKey === gone) throw new SubmissionRejected('reservation_unavailable');
      return { status: 'created' as const, submission, permit: {} as never };
    },
  };
  const app = appWith(store as Partial<SqlSubmissionStore>);
  const created = await app.inject({ method: 'POST', url: `/v1/reservations/${RESERVATION}/submissions`, payload: envelope() });
  expect(created.statusCode).toBe(201);
  expect(created.json().status).toBe('created');
  const duplicate = await app.inject({ method: 'POST', url: `/v1/reservations/${RESERVATION}/submissions`, payload: { ...envelope(), idempotencyKey: dup } });
  expect(duplicate.statusCode).toBe(200);
  expect(duplicate.json().status).toBe('duplicate');
  const exhausted = await app.inject({ method: 'POST', url: `/v1/reservations/${RESERVATION}/submissions`, payload: { ...envelope(), idempotencyKey: full } });
  expect(exhausted.statusCode).toBe(409);
  expect(exhausted.json()).toEqual({ error: 'attempt_budget_exceeded' });
  const unavailable = await app.inject({ method: 'POST', url: `/v1/reservations/${RESERVATION}/submissions`, payload: { ...envelope(), idempotencyKey: gone } });
  expect(unavailable.statusCode).toBe(409);
  await app.close();
});

it('export ingest verifies signed pull and ack envelopes only', async () => {
  const importKeys = generateKeyPairSync('ed25519');
  const otherKeys = generateKeyPairSync('ed25519');
  const pulls: string[] = [];
  const store = {
    async pullNext() {
      pulls.push('pull');
      return null;
    },
    async acknowledge(permitId: string) {
      return 'delivered' as const;
    },
  };
  const app = Fastify({ logger: false });
  installSubmissionExportRoutes(app, new SubmissionExportReceiver(store as unknown as SqlSubmissionStore, importKeys.publicKey));
  const pull = (key: object) => signPayload({ schemaVersion: 1, audience: 'external-submission-export/v1', eventId: randomUUID(), nonce: randomUUID(), issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString() }, key as never);
  const ok = await app.inject({ method: 'POST', url: '/v1/submission-exports', payload: pull(importKeys.privateKey) });
  expect(ok.statusCode).toBe(200);
  expect(ok.json().status).toBe('empty');
  const forged = await app.inject({ method: 'POST', url: '/v1/submission-exports', payload: pull(otherKeys.privateKey) });
  expect(forged.statusCode).toBe(422);
  expect(forged.json()).toEqual({ error: 'invalid_request' });
  const unsigned = await app.inject({ method: 'POST', url: '/v1/submission-exports', payload: { junk: true } });
  expect(unsigned.statusCode).toBe(422);
  expect(pulls.length).toBe(1);
  await app.close();
});
