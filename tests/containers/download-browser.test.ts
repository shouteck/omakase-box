// Containers suite: covers the frozen M-series public-image approval path; preserved with the
// Docker-dependent tests (see tests/containers/README.md). Not run by check or ordinary verification.
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { preparePublicWorkspace } from '../../packages/compiler/workspace.js';
import { PUBLIC_IMAGE_PROFILE } from '../../templates/workspaces/public-image-profile.js';
import { projectPublicListing } from '../../packages/contracts/public/task.js';
import { singleUnitContract } from '../contracts/fixtures.js';
import { http, reviewIntent, seedAccounts, serveConsole, launchConsole, signIn, asHeaders, registerSnapshot, createRequest, createIntent, ensureRuntime, consoleSignIn } from '../e2e/intent/support.js';

it('owner downloads the exact approved workspace through the real browser/API, without publication or readiness claims', { timeout: 180000 }, async () => {
  await ensureRuntime();
  const seed = await seedAccounts(), account = seed.accounts.find(user => user.role === 'owner')!;
  const owner = await signIn('private', account);
  const snapshot = await registerSnapshot(await signIn('private', seed.accounts.find(user => user.role === 'operator')!));
  const request = await createRequest(owner, snapshot.id, 'Let a person select an available plan using keyboard or pointer, with clear loading, empty and error states.');
  const draft = await createIntent(owner, request.id); expect(draft.status).toBe(201);
  const intentId = (draft.body as { id: string }).id;
  let intent = (await reviewIntent(owner, intentId)).body as { version: number; contentHash: string };
  expect((await http('private','POST',`/v1/intents/${intentId}/decisions`, { expectedVersion: intent.version, decisionId: 'outcome_confirmation', answer: 'Confirmed synthetic accessible selection scope.' }, asHeaders(owner))).status).toBe(200);
  intent = (await reviewIntent(owner,intentId)).body as typeof intent;
  expect((await http('private','POST',`/v1/intents/${intentId}/readiness`, { expectedVersion: intent.version, expectedHash: intent.contentHash }, asHeaders(owner))).status).toBe(200);
  intent = (await reviewIntent(owner,intentId)).body as typeof intent;
  expect((await http('private','POST',`/v1/intents/${intentId}/approval`, { expectedVersion: intent.version, expectedHash: intent.contentHash }, asHeaders(owner))).status).toBe(200);
  const contract = singleUnitContract(); contract.taskId = randomUUID(); contract.lineageId = randomUUID();
  const workspace = preparePublicWorkspace(contract, { imageDigest: PUBLIC_IMAGE_PROFILE.imageDigest });
  const candidate = { contract: workspace.contract, listing: projectPublicListing(workspace.contract,30), assets: workspace.assets.map(asset => ({ ...asset, sourceAssetId: randomUUID() })), feedbackPolicy: { schemaVersion: 1, id: contract.feedbackPolicyId, categories: ['received','processing','owner_review','accepted','changes_required','package_defect','infrastructure_issue','expired'], messageCodes: ['requirement_not_met','invalid_input','check_unavailable','passed'], privateDiagnostics: 'none', publicDetails: 'approved_public_checks_only' } };
  const staged = await http('private','POST','/v1/release-candidates', { intentId, intentVersion: intent.version, approvedIntentHash: intent.contentHash, privateRevision: snapshot.snapshotHash, candidate }, asHeaders(owner));
  expect(staged.status).toBe(201);
  const review = staged.body as { id: string; manifestHash: string };
  expect((await http('private','POST',`/v1/release-candidates/${review.id}/approval`, { expectedVersion: 1, manifestHash: review.manifestHash, combinedDisclosureReviewed: true, semanticDisclosureRationale: 'Synthetic public template bytes reviewed in their complete union.' }, asHeaders(owner))).status).toBe(200);
  const server = await serveConsole(); const { browser, page } = await launchConsole();
  try {
    await page.goto('http://private.localhost:3000/'); await consoleSignIn(page,account);
    await page.getByRole('button', { name: 'Release review', exact: true }).click();
    await page.getByLabel('Release candidate ID').fill(review.id); await page.getByRole('button', { name: 'Open exact release set' }).click();
    await page.getByText('These approved bytes are immutable.').waitFor();
    const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download approved package' }).click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toBe(`task-${workspace.contract.taskId}-v${workspace.contract.version}.zip`);
    await page.getByRole('status').filter({ hasText: 'Approved package SHA-256:' }).waitFor();
    expect(await page.textContent('body')).toContain('Runtime readiness remains unverified; nothing was published.');
  } finally { await browser.close(); await server.close(); }
});
