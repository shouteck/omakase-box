import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { account, approvedIntentFor, baselineCommit, delegationPool, delegationServices, delegationApi, http, REQUEST_A_CASE, REQUEST_B_CASE, REQUEST_A_TEXT, REQUEST_B_TEXT, UNSUPPORTED_COUPLING_CASE, uuid } from './support.js';
import { contentHash } from '../../../packages/contracts/hash.js';
import type { BoxAgreementProjection } from '../../../services/private-api/boxes/preparation/types.js';

async function registered(pool: Awaited<ReturnType<typeof delegationPool>>['pool'], baseCommit: string) {
  const owner = await account(pool, 'owner');
  const { preparation } = delegationServices(pool);
  const registration = await preparation.registerRepository(owner, { sourceId: 'private-shop', baseCommit }) as { repoId: string; snapshotId: string };
  return { owner, registration };
}

describe('delegation box preparation flow', () => {
  let pool: Awaited<ReturnType<typeof delegationPool>>['pool'];
  beforeAll(async () => { pool = (await delegationPool()).pool; });
  afterAll(async () => { await pool.end(); });

  it('prepares, projects, approves, opens readiness and amends request A end to end', async () => {
    {
      const base = await baselineCommit();
      const { owner, registration } = await registered(pool, base);
      const { preparation } = delegationServices(pool);
      const { request } = await approvedIntentFor(pool, owner, REQUEST_A_TEXT, registration.snapshotId);
      const key = 'w005-prepare-a-' + uuid();
      const prepared = await preparation.prepare(owner, { requestId: request.id, repositoryId: registration.repoId, supportedCaseId: REQUEST_A_CASE, operationKey: key }) as { boxId: string; version: number; state: string; contentHash: string; agreement: BoxAgreementProjection };
      expect(prepared.state).toBe('draft');
      expect(prepared.version).toBe(1);
      expect(prepared.contentHash).toMatch(/^[a-f0-9]{64}$/);
      const agreement = prepared.agreement;
      expect(agreement.repoId).toBe(registration.repoId);
      expect(agreement.baseCommit).toBe(base);
      expect(agreement.editableSurface).toEqual(['config/response-security.json']);
      expect(agreement.approval).toBeNull();
      expect(agreement.supersededApproval).toBe(false);
      expect(agreement.blockingReasons.length).toBeGreaterThan(0);
      const replay = await preparation.prepare(owner, { requestId: request.id, repositoryId: registration.repoId, supportedCaseId: REQUEST_A_CASE, operationKey: key }) as { boxId: string; contentHash: string };
      expect(replay.boxId).toBe(prepared.boxId);
      expect(replay.contentHash).toBe(prepared.contentHash);
      const approved = await preparation.approve(owner, prepared.boxId, { expectedVersion: 1, expectedHash: agreement.contentHash, approvalId: uuid(), operationKey: 'w005-approve-a-' + uuid() }) as { state: string; approvedHash: string };
      expect(approved.state).toBe('draft');
      expect(approved.approvedHash).toBe(agreement.artifactHashes.agreement);
      const opened = await preparation.readiness(owner, prepared.boxId, { expectedVersion: 1 }) as { state: string; version: number };
      expect(opened.state).toBe('open');
      expect(opened.version).toBe(1);
      const reopen = await preparation.readiness(owner, prepared.boxId, { expectedVersion: 1 }) as { state: string };
      expect(reopen.state).toBe('open');
      const projected = await preparation.agreement(owner, prepared.boxId) as BoxAgreementProjection;
      expect(projected.approval).not.toBeNull();
      expect(projected.blockingReasons).toEqual([]);
      const prior = await preparation.agreement(owner, prepared.boxId);
      const amendment = {
        schemaVersion: 1 as const,
        artifactId: uuid(),
        profile: 'open_trusted' as const,
        intent: prior.intent,
        goal: prior.goal + ' Amended wording.',
        acceptanceExamples: prior.acceptanceExamples,
        assumptions: [...prior.assumptions, 'Owner requested one wording amendment.'],
        unknowns: [] as string[],
        scope: prior.scope
      };
      const revised = await preparation.revise(owner, prepared.boxId, { expectedVersion: 1, artifact: amendment, operationKey: 'w005-revise-a-' + uuid() }) as { version: number; approvalInvalidated: boolean };
      expect(revised.version).toBe(2);
      expect(revised.approvalInvalidated).toBe(true);
      const after = await preparation.agreement(owner, prepared.boxId) as BoxAgreementProjection;
      expect(after.version).toBe(2);
      expect(after.approval).toBeNull();
      expect(after.supersededApproval).toBe(true);
    }
  });

  it('prepares request B with the new-file ranking surface and no protected coupling', async () => {
    {
      const base = await baselineCommit();
      const { owner, registration } = await registered(pool, base);
      const { preparation } = delegationServices(pool);
      const { request } = await approvedIntentFor(pool, owner, REQUEST_B_TEXT, registration.snapshotId);
      const prepared = await preparation.prepare(owner, { requestId: request.id, repositoryId: registration.repoId, supportedCaseId: REQUEST_B_CASE }) as { agreement: BoxAgreementProjection };
      expect(prepared.agreement.editableSurface).toEqual(['src/ranking/rankItems.ts']);
      expect(prepared.agreement.runnable).toEqual(['src/ranking/rankItems.ts']);
      expect(prepared.agreement.explanatory).toEqual(['src/ranking/rankPrivateItems.ts', 'src/selection/api.ts']);
      expect(JSON.stringify(prepared.agreement.runnable)).not.toContain('privateScore');
      expect(prepared.agreement.scope.excluded.join(' ')).toContain('rankPrivateItems');
    }
  });

  it('classifies the unsupported private-UI coupling request as a preparation gap', async () => {
    {
      const base = await baselineCommit();
      const { owner, registration } = await registered(pool, base);
      const { preparation } = delegationServices(pool);
      const { request } = await approvedIntentFor(pool, owner, REQUEST_A_TEXT, registration.snapshotId);
      await expect(preparation.prepare(owner, { requestId: request.id, repositoryId: registration.repoId, supportedCaseId: UNSUPPORTED_COUPLING_CASE })).rejects.toThrow('unsupported_case');
      await expect(preparation.prepare(owner, { requestId: request.id, repositoryId: registration.repoId, supportedCaseId: 'delegation.private-shop.unknown' })).rejects.toThrow('unsupported_case');
      await expect(preparation.prepare(owner, { requestId: request.id, repositoryId: registration.repoId, supportedCaseId: REQUEST_B_CASE })).rejects.toThrow('unsupported_case');
      const { request: mismatched } = await approvedIntentFor(pool, owner, REQUEST_B_TEXT, registration.snapshotId);
      await expect(preparation.prepare(owner, { requestId: mismatched.id, repositoryId: registration.repoId, supportedCaseId: REQUEST_A_CASE })).rejects.toThrow('unsupported_case');
    }
  });

  it('enforces owner-only behavior approval, role bounds and binding checks', async () => {
    {
      const base = await baselineCommit();
      const { owner, registration } = await registered(pool, base);
      const { preparation } = delegationServices(pool);
      const { request } = await approvedIntentFor(pool, owner, REQUEST_A_TEXT, registration.snapshotId);
      const prepared = await preparation.prepare(owner, { requestId: request.id, repositoryId: registration.repoId, supportedCaseId: REQUEST_A_CASE }) as { boxId: string; agreement: BoxAgreementProjection };
      const requester = await account(pool, 'requester');
      const operator = await account(pool, 'operator');
      await expect(preparation.approve(requester, prepared.boxId, { expectedVersion: 1, expectedHash: prepared.agreement.contentHash, approvalId: uuid() })).rejects.toThrow('forbidden_role');
      await expect(preparation.prepare(operator, { requestId: request.id, repositoryId: registration.repoId, supportedCaseId: REQUEST_A_CASE })).rejects.toThrow();
      await expect(preparation.readiness(owner, prepared.boxId, { expectedVersion: 7 })).rejects.toThrow();
      await expect(preparation.prepare(owner, { requestId: uuid(), repositoryId: registration.repoId, supportedCaseId: REQUEST_A_CASE })).rejects.toThrow();
      await expect(preparation.prepare(owner, { requestId: request.id, repositoryId: 'repo-' + uuid(), supportedCaseId: REQUEST_A_CASE })).rejects.toThrow('missing_evidence');
    }
  });

  it('fails a different prepare request on the same operation key', async () => {
    {
      const base = await baselineCommit();
      const { owner, registration } = await registered(pool, base);
      const { preparation } = delegationServices(pool);
      const first = await approvedIntentFor(pool, owner, REQUEST_A_TEXT, registration.snapshotId);
      const second = await approvedIntentFor(pool, owner, REQUEST_B_TEXT, registration.snapshotId);
      const key = 'w005-prepare-conflict-' + uuid();
      await preparation.prepare(owner, { requestId: first.request.id, repositoryId: registration.repoId, supportedCaseId: REQUEST_A_CASE, operationKey: key });
      await expect(preparation.prepare(owner, { requestId: second.request.id, repositoryId: registration.repoId, supportedCaseId: REQUEST_B_CASE, operationKey: key })).rejects.toThrow();
    }
  });

  it('serves the same flow over HTTP with the required permissions', async () => {
    const { app } = delegationApi(pool);
    try {
      const base = await baselineCommit();
      const owner = await account(pool, 'owner');
      const registeredResponse = await app.inject(http(owner, 'POST', '/v1/box-repositories', { sourceId: 'private-shop', baseCommit: base }));
      expect(registeredResponse.statusCode).toBe(201);
      const registration = registeredResponse.json() as { repoId: string; snapshotId: string };
      const { request } = await approvedIntentFor(pool, owner, REQUEST_A_TEXT, registration.snapshotId);
      const preparedResponse = await app.inject(http(owner, 'POST', '/v1/boxes/prepare', { requestId: request.id, repositoryId: registration.repoId, supportedCaseId: REQUEST_A_CASE }));
      expect(preparedResponse.statusCode).toBe(201);
      const prepared = preparedResponse.json() as { boxId: string; agreement: BoxAgreementProjection };
      const agreementResponse = await app.inject(http(owner, 'GET', `/v1/boxes/${prepared.boxId}/agreement`));
      expect(agreementResponse.statusCode).toBe(200);
      const approvalResponse = await app.inject(http(owner, 'POST', `/v1/boxes/${prepared.boxId}/behavior-approval`, { expectedVersion: 1, expectedHash: prepared.agreement.contentHash, approvalId: uuid() }));
      expect(approvalResponse.statusCode).toBe(200);
      const requester = await account(pool, 'requester');
      const deniedApproval = await app.inject(http(requester, 'POST', `/v1/boxes/${prepared.boxId}/behavior-approval`, { expectedVersion: 1, expectedHash: prepared.agreement.contentHash, approvalId: uuid() }));
      expect(deniedApproval.statusCode).toBe(403);
      const readinessResponse = await app.inject(http(owner, 'POST', `/v1/boxes/${prepared.boxId}/readiness`, { expectedVersion: 1 }));
      expect(readinessResponse.statusCode).toBe(200);
      const stale = await app.inject(http(owner, 'POST', `/v1/boxes/${prepared.boxId}/readiness`, { expectedVersion: 9 }));
      expect(stale.statusCode).toBe(409);
      const unsupported = await app.inject(http(owner, 'POST', '/v1/boxes/prepare', { requestId: request.id, repositoryId: registration.repoId, supportedCaseId: UNSUPPORTED_COUPLING_CASE }));
      expect(unsupported.statusCode).toBe(422);
      expect((unsupported.json() as { error: string }).error).toBe('unsupported_case');
      const operator = await account(pool, 'operator');
      const deniedPrepare = await app.inject(http(operator, 'POST', '/v1/boxes/prepare', { requestId: request.id, repositoryId: registration.repoId, supportedCaseId: REQUEST_A_CASE }));
      expect(deniedPrepare.statusCode).toBe(403);
      const artifactHash = contentHash({ marker: 'not-the-artifact' });
      const wrongHash = await app.inject(http(owner, 'POST', `/v1/boxes/${prepared.boxId}/behavior-approval`, { expectedVersion: 1, expectedHash: artifactHash, approvalId: uuid() }));
      expect(wrongHash.statusCode).toBeGreaterThanOrEqual(400);
    } finally { await app.close(); }
  });

  it('collects real browser UI evidence: genuine create/approve/amend, owner-only and API negatives, persisted state after reload', async () => {
    const { app } = delegationApi(pool);
    const { createServer } = await import('vite');
    const consoleRoot = fileURLToPath(new URL('../../../apps/private-console', import.meta.url));
    let vite: Awaited<ReturnType<typeof createServer>> | undefined;
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
      const base = await baselineCommit();
      const owner = await account(pool, 'owner');
      const { preparation } = delegationServices(pool);
      const registration = await preparation.registerRepository(owner, { sourceId: 'private-shop', baseCommit: base }) as { repoId: string; snapshotId: string };
      const { request } = await approvedIntentFor(pool, owner, REQUEST_A_TEXT, registration.snapshotId);
      await app.listen({ host: '127.0.0.1', port: 4000 });
      vite = await createServer({ root: consoleRoot, server: { host: '127.0.0.1', port: 3000, strictPort: true }, logLevel: 'silent' });
      await vite.listen();
      browser = await chromium.launch({ headless: true, args: ['--host-resolver-rules=MAP private.localhost 127.0.0.1'] });
      const context = await browser.newContext();
      await context.addCookies([{ name: 'private_session', value: owner.cookie, url: 'http://private.localhost:4000/' }]);
      const page = await context.newPage();
      await page.goto('http://private.localhost:3000/');
      await page.evaluate(csrf => sessionStorage.setItem('private-task-console-csrf', csrf), owner.csrf);
      await page.reload();
      await page.getByRole('button', { name: 'Box preparation' }).click();
      await page.locator('#prep-box').fill('not-a-uuid');
      await page.getByRole('button', { name: 'Open', exact: true }).click();
      await expect(page.locator('.preparation-failure')).toContainText('invalid');
      await page.locator('#prep-request').fill(request.id);
      await page.locator('#prep-repo').fill(registration.repoId);
      await page.locator('form[aria-label="Prepare Box"]').getByRole('button', { name: 'Prepare' }).click();
      const card = page.locator('article[aria-label="Box agreement"]');
      await expect(card).toContainText('Agreement — version 1 (draft)');
      const boxId = (await card.locator('dt:has-text("Box") + dd code').innerText()).trim();
      expect(boxId).toMatch(/^[0-9a-f-]{36}$/);
      const apiDenial = await page.evaluate(async id => {
        const response = await fetch('http://private.localhost:4000/v1/boxes/' + id + '/behavior-approval', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion: 1, expectedHash: '0'.repeat(64), approvalId: crypto.randomUUID() }) });
        return response.status;
      }, boxId);
      expect(apiDenial).toBeGreaterThanOrEqual(400);
      await card.getByRole('button', { name: 'Approve exact version' }).click();
      await expect(page.locator('.preparation-notice')).toContainText('approval');
      await expect(card).toContainText('Approved artifact');
      await page.locator('#prep-assumptions').fill('Owner requested one wording amendment.');
      await card.getByRole('button', { name: 'Amend' }).click();
      await expect(page.locator('.preparation-notice')).toContainText('version 2');
      await expect(card).toContainText('superseded');
      await page.reload();
      await page.getByRole('button', { name: 'Box preparation' }).click();
      await page.locator('#prep-box').fill(boxId);
      await page.getByRole('button', { name: 'Open', exact: true }).click();
      const reloaded = page.locator('article[aria-label="Box agreement"]');
      await expect(reloaded).toContainText('Agreement — version 2 (draft)');
      await expect(reloaded).toContainText('superseded');
      await context.close();
      const requester = await account(pool, 'requester');
      const deniedContext = await browser.newContext();
      await deniedContext.addCookies([{ name: 'private_session', value: requester.cookie, url: 'http://private.localhost:4000/' }]);
      const deniedPage = await deniedContext.newPage();
      await deniedPage.goto('http://private.localhost:3000/');
      await deniedPage.evaluate(csrf => sessionStorage.setItem('private-task-console-csrf', csrf), requester.csrf);
      await deniedPage.reload();
      await deniedPage.getByRole('button', { name: 'Box preparation' }).click();
      await deniedPage.locator('#prep-box').fill(boxId);
      await deniedPage.getByRole('button', { name: 'Open', exact: true }).click();
      await expect(deniedPage.locator('article[aria-label="Box agreement"]')).toContainText('version 2');
      await expect(deniedPage.getByRole('button', { name: 'Approve exact version' })).toHaveCount(0);
      await expect(deniedPage.locator('article[aria-label="Box agreement"]')).toContainText('Only the owner approves');
      await deniedContext.close();
    } finally {
      await browser?.close();
      if (vite !== undefined) await vite.close();
      await app.close();
    }
  }, 120000);
});
