import { expect, it } from 'vitest';
import { http, launchConsole, reviewIntent, seedAccounts, serveConsole, signIn, asHeaders, registerSnapshot, createRequest, createIntent, ensureRuntime, consoleSignIn, type Session } from './support.js';

const componentGoal = 'Let a person select an available plan using keyboard or pointer, with clear loading, empty and error states.';
const journeyGoal = 'Choose an available plan through one UI-to-API flow, reject invalid/unavailable choices on the server, and recover visibly from server errors.';
const composedGoal = 'Deliver the selection journey and its response policy together as one task with interface and end-to-end obligations.';
const hostileGoal = '<script>window.__syntheticXssCanary="executed"</script><img src=x onerror="window.__syntheticXssCanaryImg=1"><svg onload="window.__syntheticXssCanarySvg=1"></svg><a href="javascript:window.__syntheticXssCanaryLink=1">link</a>';
const canaries = () => ({ script: (window as unknown as Record<string, unknown>).__syntheticXssCanary, img: (window as unknown as Record<string, unknown>).__syntheticXssCanaryImg, svg: (window as unknown as Record<string, unknown>).__syntheticXssCanarySvg, link: (window as unknown as Record<string, unknown>).__syntheticXssCanaryLink });

interface Snapshot { id: string; snapshotHash: string; fileCount: number }
async function withConsole(action: (page: import('@playwright/test').Page, snapshot: Snapshot) => Promise<void>) {
  await ensureRuntime();
  const seed = await seedAccounts();
  const operator = seed.accounts.find(account => account.role === 'operator')!;
  const requester = seed.accounts.find(account => account.role === 'requester')!;
  const operatorSession = await signIn('private', operator);
  const snapshot = await registerSnapshot(operatorSession);
  const consoleHandle = await serveConsole();
  const { browser, context, page } = await launchConsole();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  try {
    await page.goto('http://private.localhost:3000/');
    await consoleSignIn(page, requester);
    await action(page, snapshot);
    return { seed, snapshot, errors };
  } finally {
    await browser.close();
    await consoleHandle.close();
  }
}

it('a goal entered without technical detail produces a reviewable draft in demo mode with plain-language facts and provenance', { timeout: 300000 }, async () => {
  const result = await withConsole(async (page, snapshot) => {
    await page.getByLabel('Pinned snapshot').selectOption({ value: snapshot.id });
    await page.getByLabel('Desired outcome (goal)').fill(componentGoal);
    await page.getByRole('button', { name: 'Create private request' }).click();
    await page.getByText('captures 0 evidence item(s)').waitFor({ timeout: 30000 });
    await page.getByLabel('Evidence text').fill('Synthetic requester evidence: the plan list currently shows every option regardless of availability.');
    await page.getByLabel('Evidence label').fill('synthetic observation');
    await page.getByRole('button', { name: 'Attach text evidence' }).click();
    await page.getByText('1 evidence item(s)').waitFor({ timeout: 30000 });
    await page.getByRole('radio', { name: /Deterministic demo planning/ }).check();
    await page.getByRole('button', { name: 'Generate intent draft' }).click();
    await page.getByRole('heading', { name: 'Intent review' }).waitFor({ timeout: 30000 });
    await page.getByText(componentGoal).first().waitFor({ timeout: 30000 });
    const body = await page.textContent('body');
    expect(body).toContain('State: draft — version 1');
    expect(body).toContain('This is a reviewable draft');
    expect(body).toContain('Observed facts');
    expect(body).toContain('Captured private source text is available as untrusted evidence for review.');
    expect(body).toContain('Assumptions');
    expect(body).toContain('Unknowns');
    expect(body).toContain('An internal owner must resolve consequential choices before approval.');
    expect(body).toContain('Preparation is blocked: 1 required decision(s) are unresolved.');
    expect(body).toContain('outcome_confirmation');
    expect(body).toContain('Plain-language before/after preview');
    expect(body).toContain('Before: The approved synthetic scenario. — when: The stated action occurs. — after: The stated requirement is observed.');
    expect(body).toContain('Private provenance');
    expect(body).toContain('no image-understanding claim');
    expect(await page.evaluate(canaries)).toEqual({ script: undefined, img: undefined, svg: undefined, link: undefined });
    expect(await page.locator('img[src="x"]').count()).toBe(0);
    expect(await page.locator('svg').count()).toBe(0);
  });
  expect(result.errors).toEqual([]);
});

it('review starts with a concise goal, before/after and one question while audit details and editing stay expandable', { timeout: 300000 }, async () => {
  const result = await withConsole(async (page, snapshot) => {
    await page.getByLabel('Pinned snapshot').selectOption(snapshot.id);
    await page.getByLabel('Desired outcome (goal)').fill(componentGoal);
    await page.getByRole('button', { name: 'Create private request' }).click();
    await page.getByRole('button', { name: 'Generate intent draft' }).waitFor({ timeout: 30000 });
    await page.getByRole('button', { name: 'Generate intent draft' }).click();
    await page.getByRole('heading', { name: 'Intent review', exact: true }).waitFor({ timeout: 30000 });
    await page.getByRole('heading', { name: 'Your goal', exact: true }).waitFor({ timeout: 10000 });
    expect(await page.getByRole('heading', { name: 'What will change', exact: true }).isVisible()).toBe(true);
    expect(await page.getByRole('heading', { name: 'What needs your decision', exact: true }).isVisible()).toBe(true);
    expect(await page.getByLabel('Your answer', { exact: true }).count()).toBe(1);
    expect(await page.getByRole('button', { name: 'Save answer', exact: true }).isDisabled()).toBe(true);
    expect(await page.getByRole('heading', { name: 'Observed facts', exact: true }).isVisible()).toBe(false);
    expect(await page.getByRole('heading', { name: 'Private provenance', exact: true }).isVisible()).toBe(false);
    expect(await page.getByRole('button', { name: 'Create new revision from edit' }).isVisible()).toBe(false);
    const visible = await page.locator('article[aria-label="Intent review"]').innerText();
    expect(visible).not.toContain('outcome_confirmation');
    expect(visible).not.toContain('reviewed revision hash');
    expect(visible).not.toContain('Private provenance');
    const details = page.getByText('View details', { exact: true });
    await details.focus();
    await page.keyboard.press('Enter');
    expect(await page.getByRole('heading', { name: 'Observed facts', exact: true }).isVisible()).toBe(true);
    expect(await page.getByRole('heading', { name: 'Private provenance', exact: true }).isVisible()).toBe(true);
    expect(await page.locator('article[aria-label="Intent review"]').innerText()).toContain('reviewed revision hash');
    await page.getByText('Edit outcome', { exact: true }).click();
    expect(await page.getByRole('button', { name: 'Create new revision from edit' }).isVisible()).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
  expect(result.errors).toEqual([]);
});

it('mocked presentation prioritizes required questions and advances one answer at a time without dropping other decisions', { timeout: 300000 }, async () => {
  const result = await withConsole(async (page, snapshot) => {
    const decisions = [
      { id: 'optional_note', question: 'Would you like an optional note?', required: false, answer: null as string | null },
      { id: 'first_required', question: 'Which plan should be selected initially?', required: true, answer: null as string | null },
      { id: 'second_required', question: 'What should happen when selection fails?', required: true, answer: null as string | null }
    ];
    let version = 1;
    await page.route('**/v1/intents/*/review', async route => {
      const response = await route.fetch();
      const original = await response.json();
      await route.fulfill({ response, json: { ...original, version, decisions, blockage: { requiredUnresolved: decisions.filter(item => item.required && item.answer === null).length } } });
    });
    await page.route('**/v1/intents/*/decisions', async route => {
      const input = route.request().postDataJSON() as { decisionId: string; answer: string; expectedVersion: number };
      expect(input.expectedVersion).toBe(version);
      expect(input.decisionId).toBe('first_required');
      decisions[1]!.answer = input.answer;
      version += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version, state: 'draft', contentHash: 'a'.repeat(64) }) });
    });
    await page.getByLabel('Pinned snapshot').selectOption(snapshot.id);
    await page.getByLabel('Desired outcome (goal)').fill(componentGoal);
    await page.getByRole('button', { name: 'Create private request' }).click();
    await page.getByRole('button', { name: 'Generate intent draft' }).waitFor({ timeout: 30000 });
    await page.getByRole('button', { name: 'Generate intent draft' }).click();
    await page.getByText('Which plan should be selected initially?', { exact: true }).waitFor({ timeout: 30000 });
    expect(await page.getByLabel('Your answer', { exact: true }).count()).toBe(1);
    expect(await page.getByText('What should happen when selection fails?', { exact: true }).isVisible()).toBe(false);
    await page.getByLabel('Your answer', { exact: true }).fill('No plan is selected initially.');
    await page.getByRole('button', { name: 'Save answer', exact: true }).click();
    await page.getByText('What should happen when selection fails?', { exact: true }).waitFor({ timeout: 30000 });
    expect(await page.getByLabel('Your answer', { exact: true }).inputValue()).toBe('');
    expect(await page.getByRole('button', { name: 'Mark ready for owner approval' }).isDisabled()).toBe(true);
    await page.getByText('View details', { exact: true }).click();
    const visible = await page.locator('article[aria-label="Intent review"]').innerText();
    expect(visible).toContain('optional_note');
    expect(visible).toContain('first_required');
    expect(visible).toContain('second_required');
    expect(visible).toContain('No plan is selected initially.');
  });
  expect(result.errors).toEqual([]);
});

it('required unresolved decisions block preparation, then a decision, readiness, exact-hash owner approval and edit-after-approval invalidation flow correctly', { timeout: 300000 }, async () => {
  await ensureRuntime();
  const seed = await seedAccounts();
  const requester = seed.accounts.find(account => account.role === 'requester')!;
  const owner = seed.accounts.find(account => account.role === 'owner')!;
  const operator = seed.accounts.find(account => account.role === 'operator')!;
  const requesterSession = await signIn('private', requester);
  const ownerSession = await signIn('private', owner);
  const snapshot = await registerSnapshot(await signIn('private', operator));
  const request = await createRequest(requesterSession, snapshot.id, journeyGoal);
  const draft = await createIntent(requesterSession, request.id);
  expect(draft.status).toBe(201);
  const intentId = (draft.body as { id: string }).id;
  const firstReview = await reviewIntent(requesterSession, intentId);
  expect(firstReview.status).toBe(200);
  const firstHash = String((firstReview.body as { contentHash: string }).contentHash);
  expect(await http('private', 'POST', `/v1/intents/${intentId}/readiness`, { expectedVersion: 1, expectedHash: firstHash }, asHeaders(requesterSession))).toMatchObject({ status: 422, body: { error: 'missing_evidence' } });
  expect(await http('private', 'POST', `/v1/intents/${intentId}/readiness`, { expectedVersion: 1, expectedHash: 'f'.repeat(64) }, asHeaders(requesterSession))).toMatchObject({ status: 422, body: { error: 'missing_evidence' } });

  const consoleHandle = await serveConsole();
  const { browser, context, page } = await launchConsole();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  try {
    await page.goto('http://private.localhost:3000/');
    await consoleSignIn(page, requester);
    await page.getByRole('button', { name: 'Intent review' }).click();
    await page.getByLabel('Intent ID').fill(intentId);
    await page.getByRole('button', { name: 'Open review' }).click();
    await page.getByText('Preparation is blocked: 1 required decision(s) are unresolved.').waitFor({ timeout: 30000 });
    expect(await page.getByRole('button', { name: 'Mark ready for owner approval' }).isDisabled()).toBe(true);
    await page.getByLabel('Your answer', { exact: true }).fill('Confirmed against the synthetic before/after examples by the requester.');
    await page.getByRole('button', { name: 'Save answer', exact: true }).click();
    await page.getByText('Answer saved. Your review has been updated.').waitFor({ timeout: 30000 });
    await page.getByText('Draft · Revision 2', { exact: true }).waitFor({ timeout: 30000 });
    expect(await page.getByRole('button', { name: 'Mark ready for owner approval' }).isDisabled()).toBe(false);
    expect(await page.getByRole('button', { name: 'Approve this exact revision' }).count()).toBe(0);

    const readyResponse = await reviewIntent(requesterSession, intentId);
    const ready = await http('private', 'POST', `/v1/intents/${intentId}/readiness`, { expectedVersion: 2, expectedHash: String((readyResponse.body as { contentHash: string }).contentHash) }, asHeaders(requesterSession));
    expect(ready.status).toBe(200);
    const readyHash = String((ready.body as { contentHash: string }).contentHash);
    expect(await http('private', 'POST', `/v1/intents/${intentId}/approval`, { expectedVersion: 2, expectedHash: readyHash }, asHeaders(requesterSession))).toMatchObject({ status: 403 });
    expect(await http('private', 'POST', `/v1/intents/${intentId}/approval`, { expectedVersion: 2, expectedHash: 'f'.repeat(64) }, asHeaders(ownerSession))).toMatchObject({ status: 422, body: { error: 'missing_evidence' } });

    await page.getByRole('button', { name: 'Sign out' }).click();
    await consoleSignIn(page, owner);
    await page.getByLabel('Intent ID').fill(intentId);
    await page.getByRole('button', { name: 'Open review' }).click();
    await page.getByText('Ready for approval · Revision 2', { exact: true }).waitFor({ timeout: 30000 });
    const boundHash = String((ready.body as { contentHash: string }).contentHash);
    expect(await page.locator('.intent-binding').innerText()).toContain(boundHash);
    await page.getByRole('button', { name: 'Approve this exact revision' }).click();
    await page.getByText('This revision is approved.', { exact: true }).waitFor({ timeout: 30000 });
    await page.getByText('Approved · Revision 2', { exact: true }).waitFor({ timeout: 30000 });
    const body = await page.textContent('body');
    expect(body).toContain('the reviewed payload retains its ready-for-approval bytes');
    const approved = await reviewIntent(ownerSession, intentId);
    expect((approved.body as Record<string, unknown>)).toMatchObject({ state: 'approved', reviewedPayloadState: 'ready_for_approval', version: 2, contentHash: readyHash });
    expect((approved.body as { approval?: { approvedHash: string } }).approval?.approvedHash).toBe(readyHash);

    const revised = await http('private', 'POST', `/v1/intents/${intentId}/revisions`, { expectedVersion: 2, mode: 'demo', desiredBehaviour: 'Edited synthetic desired behaviour after approval.' }, asHeaders(requesterSession));
    expect(revised.status).toBe(201);
    expect(revised.body as Record<string, unknown>).toMatchObject({ version: 3, state: 'draft', approvalInvalidated: true });
    expect(await http('private', 'POST', `/v1/intents/${intentId}/approval`, { expectedVersion: 2, expectedHash: readyHash }, asHeaders(ownerSession))).toMatchObject({ status: 409, body: { error: 'stale_version' } });
    const after = await reviewIntent(ownerSession, intentId);
    expect(after.body as Record<string, unknown>).toMatchObject({ version: 3, state: 'draft', supersededApproval: true });

    await page.getByRole('button', { name: 'Open review' }).click();
    await page.getByText('A previous owner approval no longer binds this revision').waitFor({ timeout: 30000 });
    expect(await page.textContent('body')).toContain('State: draft — version 3');
  } finally {
    await browser.close();
    await consoleHandle.close();
  }
  expect(errors).toEqual([]);
});

it('a full-stack plus codebase-policy outcome is described, generated and reviewed as ONE composed task draft', { timeout: 300000 }, async () => {
  const result = await withConsole(async (page, snapshot) => {
    await page.getByLabel('Pinned snapshot').selectOption({ value: snapshot.id });
    await page.getByLabel('Desired outcome (goal)').fill(composedGoal);
    await page.getByRole('button', { name: 'Create private request' }).click();
    await page.getByText('captures 0 evidence item(s)').waitFor({ timeout: 30000 });
    await page.getByRole('radio', { name: /Deterministic demo planning/ }).check();
    await page.getByRole('button', { name: 'Generate intent draft' }).click();
    await page.getByRole('heading', { name: 'Intent review' }).waitFor({ timeout: 30000 });
    await page.getByText(composedGoal).first().waitFor({ timeout: 30000 });
    const body = await page.textContent('body');
    expect(body).toContain('State: draft — version 1');
    for (const requirementId of ['selection_ui', 'selection_api', 'response_policy', 'selection_journey']) expect(body).toContain(requirementId);
    expect(body).toContain('Accessible keyboard/pointer selection handles loading, empty, disabled and error states.');
    expect(body).toContain('Apply owner-agreed HTTPS headers, preserve excluded routes');
    expect(body).toContain('One composed outcome');
    expect(await page.locator('article[aria-label="Intent review"]').count()).toBe(1);
  });
  const requester = result.seed.accounts.find(account => account.role === 'requester')!;
  expect(result.errors).toEqual([]);
  expect(result.snapshot.fileCount).toBe(10);
  expect(requester.role).toBe('requester');
});

it('hostile goal content renders as escaped text only and never executes in the private console origin', { timeout: 300000 }, async () => {
  const result = await withConsole(async (page, snapshot) => {
    await page.getByLabel('Pinned snapshot').selectOption({ value: snapshot.id });
    await page.getByLabel('Desired outcome (goal)').fill(hostileGoal);
    await page.getByRole('button', { name: 'Create private request' }).click();
    await page.getByText('captures 0 evidence item(s)').waitFor({ timeout: 30000 });
    await page.getByRole('radio', { name: /Deterministic demo planning/ }).check();
    await page.getByRole('button', { name: 'Generate intent draft' }).click();
    await page.getByRole('heading', { name: 'Intent review' }).waitFor({ timeout: 30000 });
    await page.getByText('<script>window.__syntheticXssCanary="executed"</script>').first().waitFor({ timeout: 30000 });
    const body = await page.textContent('body');
    expect(body).toContain('<script>window.__syntheticXssCanary="executed"</script>');
    expect(body).toContain('<img src=x onerror="window.__syntheticXssCanaryImg=1">');
    expect(body).toContain('javascript:window.__syntheticXssCanaryLink=1');
    expect(await page.evaluate(canaries)).toEqual({ script: undefined, img: undefined, svg: undefined, link: undefined });
    expect(await page.locator('img[src="x"]').count()).toBe(0);
    expect(await page.locator('svg').count()).toBe(0);
    expect(await page.locator('a[href^="javascript:"]').count()).toBe(0);
    expect(page.url()).toBe('http://private.localhost:3000/');
    expect(await page.evaluate(() => document.querySelectorAll('script').length)).toBe(1);
    const response = await page.evaluate(async (id: string) => { const result = await fetch(`http://private.localhost:4000/v1/intents/${id}/review`, { credentials: 'include' }); return { status: result.status, type: result.headers.get('content-type') }; }, (await page.getByLabel('Intent ID').inputValue()));
    expect(response.status).toBe(200);
    expect(String(response.type)).toContain('application/json');
  });
  expect(result.errors).toEqual([]);
});

it('demo intent drafts remain visible to the owner while private details stay out of unauthenticated views', { timeout: 300000 }, async () => {
  await ensureRuntime();
  const seed = await seedAccounts();
  const requester = seed.accounts.find(account => account.role === 'requester')!;
  const owner = seed.accounts.find(account => account.role === 'owner')!;
  const requesterSession = await signIn('private', requester);
  const ownerSession = await signIn('private', owner);
  const snapshotSession: Session = await signIn('private', seed.accounts.find(account => account.role === 'operator')!);
  const snapshot = await registerSnapshot(snapshotSession);
  const request = await createRequest(requesterSession, snapshot.id, componentGoal);
    const draft = await createIntent(requesterSession, request.id);
    expect(draft.status).toBe(201);
    const intentId = (draft.body as { id: string }).id;
  expect((await reviewIntent(ownerSession, intentId)).status).toBe(200);
  expect((await reviewIntent(requesterSession, intentId)).body).toMatchObject({ state: 'draft', version: 1 });
  const raw = await http('private', 'GET', `/v1/intents/${intentId}/review`, undefined, asHeaders(requesterSession));
  const text = JSON.stringify(raw.body);
  expect(text).not.toContain('/workspace/');
  expect(text).not.toContain('synthetic-private-canary');
  expect(Object.keys(raw.body as Record<string, unknown>).sort()).toEqual(['acceptanceExamples', 'approval', 'assumptions', 'blockage', 'contentHash', 'decisions', 'evidence', 'facts', 'goal', 'id', 'provenance', 'reviewedPayloadState', 'scope', 'state', 'supersededApproval', 'unknowns', 'version']);
  console.log(JSON.stringify({ assurance: 'tested', scope: 'synthetic private console intent journeys', goalOnlyDraft: 'reviewable', decisionsBlockPreparation: 'tested', exactHashApproval: 'tested', editAfterApproval: 'new_revision_invalidated', composedOutcome: 'one_task', previewXss: 'escaped_not_executed', publicProductFlow: 'not_implemented', realCustomerData: false }));
});
