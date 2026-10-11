import { expect, it } from 'vitest';
import { asHeaders, createIntent, createRequest, ensureRuntime, externalSeed, fixtureAction, http, registerSnapshot, reviewIntent, seedAccounts, signIn } from './support.js';

it('intent authority is server-side: roles, ownership, revoked/expired sessions, safe projections and explicit provider choice', { timeout: 300000 }, async () => {
  await ensureRuntime();
  const seed = await seedAccounts(), other = await seedAccounts(), external = await externalSeed();
  const requester = seed.accounts.find(account => account.role === 'requester')!;
  const owner = seed.accounts.find(account => account.role === 'owner')!;
  const operator = seed.accounts.find(account => account.role === 'operator')!;
  const stranger = other.accounts.find(account => account.role === 'requester')!;
  const requesterSession = await signIn('private', requester);
  const ownerSession = await signIn('private', owner);
  const operatorSession = await signIn('private', operator);
  const strangerSession = await signIn('private', stranger);
  const contributor = external.accounts[0]!;
  const contributorSession = await signIn('external', contributor);

  const snapshot = await registerSnapshot(operatorSession);
  const request = await createRequest(requesterSession, snapshot.id, 'Synthetic authorization intent journey');
  const created = await createIntent(requesterSession, request.id);
  expect(created.status).toBe(201);
  const creationBody = created.body as { id: string; version: number; state: string; contentHash: string };
  const intentId = creationBody.id;
  expect(Object.keys(creationBody).sort()).toEqual(['contentHash', 'id', 'provider', 'state', 'version']);
  expect(creationBody).toMatchObject({ version: 1, state: 'draft' });
  expect(creationBody.contentHash).toMatch(/^[a-f0-9]{64}$/);

  expect(await http('private', 'POST', `/v1/requests/${request.id}/intents`, { mode: 'demo' }, asHeaders(operatorSession))).toMatchObject({ status: 403, body: { error: 'forbidden' } });
  expect(await http('private', 'GET', `/v1/intents/${intentId}/review`, undefined, asHeaders(operatorSession))).toMatchObject({ status: 403 });
  expect(await http('private', 'POST', `/v1/requests/${request.id}/intents`, { mode: 'demo' }, asHeaders(strangerSession))).toMatchObject({ status: 404, body: { error: 'not_found' } });
  expect(await http('private', 'GET', `/v1/intents/${intentId}/review`, undefined, asHeaders(strangerSession))).toMatchObject({ status: 403 });
  expect(await http('private', 'POST', `/v1/intents/${intentId}/decisions`, { expectedVersion: 1, decisionId: 'outcome_confirmation', answer: 'Forged.' }, asHeaders(strangerSession))).toMatchObject({ status: 403 });
  expect(await http('private', 'POST', `/v1/intents/${intentId}/revisions`, { expectedVersion: 1, mode: 'demo' }, asHeaders(strangerSession))).toMatchObject({ status: 403 });
  expect(await http('private', 'POST', `/v1/intents/${intentId}/readiness`, { expectedVersion: 1, expectedHash: creationBody.contentHash }, asHeaders(strangerSession))).toMatchObject({ status: 403 });
  expect(await http('private', 'POST', `/v1/intents/${intentId}/approval`, { expectedVersion: 1, expectedHash: creationBody.contentHash }, asHeaders(strangerSession))).toMatchObject({ status: 403 });
  const review = await reviewIntent(requesterSession, intentId);
  expect(review.status).toBe(200);
  const reviewBody = review.body as Record<string, unknown>;
  expect(Object.keys(reviewBody).sort()).toEqual(['acceptanceExamples', 'approval', 'assumptions', 'blockage', 'contentHash', 'decisions', 'evidence', 'facts', 'goal', 'id', 'provenance', 'reviewedPayloadState', 'scope', 'state', 'supersededApproval', 'unknowns', 'version']);
  const reviewText = JSON.stringify(reviewBody);
  expect(reviewText).not.toContain('/workspace/');
  expect(reviewText).not.toContain('synthetic-private-canary');
  expect((reviewBody.evidence as { snapshotHash: string }[]).every(reference => reference.snapshotHash === snapshot.snapshotHash)).toBe(true);
  expect((reviewBody.blockage as { requiredUnresolved: number }).requiredUnresolved).toBeGreaterThan(0);
  expect(await http('private', 'GET', `/v1/requests/${request.id}/intent`, undefined, asHeaders(requesterSession))).toMatchObject({ status: 200, body: { id: intentId } });
  expect(await http('private', 'GET', `/v1/requests/${request.id}/intent`, undefined, asHeaders(strangerSession))).toMatchObject({ status: 403 });

  expect(await http('private', 'GET', `/v1/intents/${intentId}/review`, undefined, { Cookie: contributorSession.Cookie })).toMatchObject({ status: 401, body: { error: 'authentication_denied' } });
  expect(await http('external', 'GET', `/v1/intents/${intentId}/review`, undefined, asHeaders(contributorSession))).toMatchObject({ status: 404, body: { error: 'not_found' } });
  expect(await http('external', 'GET', `/v1/requests/${request.id}/intent`, undefined, asHeaders(contributorSession))).toMatchObject({ status: 404, body: { error: 'not_found' } });

  const ollama = await http('private', 'POST', `/v1/requests/${request.id}/intents`, { mode: 'ollama' }, asHeaders(requesterSession));
  expect(ollama.status).toBe(503);
  expect(ollama.body).toEqual({ error: 'provider_unavailable', reason: 'needs_configuration', mode: 'ollama_live' });
  const explicit = await http('private', 'POST', `/v1/requests/${request.id}/intents`, { mode: 'demo' }, asHeaders(requesterSession));
  expect(explicit.status).toBe(201);

  await http('private', 'POST', '/v1/auth/logout', {}, asHeaders(requesterSession));
  expect(await http('private', 'POST', `/v1/requests/${request.id}/intents`, { mode: 'demo' }, asHeaders(requesterSession))).toMatchObject({ status: 401 });
  expect(await http('private', 'GET', `/v1/intents/${intentId}/review`, undefined, asHeaders(requesterSession))).toMatchObject({ status: 401 });
  await fixtureAction({ action: 'expire', id: stranger.id });
  expect(await http('private', 'GET', `/v1/intents/${intentId}/review`, undefined, asHeaders(strangerSession))).toMatchObject({ status: 401 });
  await fixtureAction({ action: 'disable', id: operator.id });
  expect(await http('private', 'GET', '/v1/auth/session', undefined, asHeaders(operatorSession))).toMatchObject({ status: 401 });
  console.log(JSON.stringify({ assurance: 'tested', scope: 'synthetic private intent authorization and projections', serverAllocatedIdentity: 'tested', operatorAndStrangerDenials: 'tested', contributorIsolation: 'no_private_route', providerChoice: 'explicit_no_fallback', revokedExpiredDisabledSessions: 'denied', positiveProjection: 'allowlist', publicProductFlow: 'not_implemented', realCustomerData: false }));
});
