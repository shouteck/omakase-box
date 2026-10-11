import { expect, it } from 'vitest';
import { portalSignIn, portalUrl, seedContributorViaInvitation, launchBrowser, privateCanaryToken, serveHarness, startPrivateCookieProbe, startReservationApi, buildWorld, buildEmptyWorld, type ContributorWorld } from './support.js';

async function publishAndPrepare(): Promise<ContributorWorld> {
  const world = await buildWorld();
  const contributorId = await seedContributorViaInvitation(world);
  const assignment = await world.assignments.chooseExecutor({ taskId: world.taskId, taskVersion: world.taskVersion, executor: { kind: 'human', label: world.customerLabel, contributorId }, chosenBy: 'synthetic-customer-owner' }, Date.now());
  const token = (await world.assignments.issueInvitation(assignment.id, { role: 'owner' }, Date.now())).token;
  await world.assignments.recordRedemption(token, contributorId, Date.now());
  world.invitationToken = token;
  return world;
}

it('a contributor lists a released board task, reserves it after the recorded customer choice, downloads the approved package and files a structured defect report in a real browser', { timeout: 300000 }, async () => {
  const world = await publishAndPrepare();
  const harness = await serveHarness();
  const api = await startReservationApi(world);
  const probe = await startPrivateCookieProbe();
  const { browser, context, page } = await launchBrowser();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  try {
    await page.goto(`http://private.localhost:${probe.port}/seed`);
    await page.goto(`http://private.localhost:${probe.port}/observe`);
    const contextCookies = await context.cookies();
    expect(contextCookies.find(cookie => cookie.name === 'private_session')).toBeTruthy();
    expect(contextCookies.find(cookie => cookie.name === 'private_session')).toMatchObject({ domain: 'private.localhost', httpOnly: true, sameSite: 'Strict' });

    await page.goto(portalUrl(api.url));
    expect(await page.getByRole('heading', { name: 'Contributor portal', exact: true }).isVisible()).toBe(true);
    await page.getByText('Sign in to see your reservations.', { exact: true }).waitFor();
    expect(await page.getByRole('button', { name: 'Reserve this task', exact: true }).count()).toBe(0);
    await portalSignIn(page);
    expect(await page.getByText('Signed in as contributor', { exact: false }).count()).toBe(1);
    await page.getByText('Accessible plan selection', { exact: true }).waitFor({ timeout: 30000 });
    const listed = await page.locator('section[aria-label="Released tasks"]').innerText();
    expect(listed).toContain('Choose one available generic plan.');
    expect(listed).toContain('USD 100.00');
    expect(listed).toContain('60 minute reservation');

    await page.getByRole('button', { name: 'View task', exact: true }).click();
    const detail = await page.locator('section[aria-label="Released task detail"]').innerText();
    expect(detail).not.toContain('Selection must be keyboard accessible and disabled options cannot be selected.');
    expect(detail).not.toContain('src/PlanSelector.tsx');
    expect(detail).toContain('60 minute reservation');
    expect(await page.getByRole('button', { name: 'Reserve this task', exact: true }).isDisabled()).toBe(false);
    expect(await page.locator('section[aria-label="Released task detail"]').getByText('Sign in to reserve.', { exact: true }).count()).toBe(0);

    await page.getByRole('button', { name: 'Reserve this task', exact: true }).click();
    const status = page.locator('section[aria-label="Reservation status"]');
    await status.getByText('State: active', { exact: true }).waitFor({ timeout: 30000 });
    await status.getByText(world.customerLabel, { exact: true }).waitFor({ timeout: 30000 });
    expect(await status.getByText('Reservation expires', { exact: false }).count()).toBe(1);

    const downloading = page.waitForEvent('download', { timeout: 30000 });
    await status.getByRole('button', { name: 'Download approved package', exact: true }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe(`task-${world.taskId}-v1.zip`);

    const instructions = await page.locator('section[aria-label="Package instructions"]').innerText();
    expect(instructions).toContain('Selection must be keyboard accessible');
    expect(instructions).toContain('Allowed edit paths: src/PlanSelector.tsx');
    expect(instructions).toContain('Package defect compensation: USD 10.00');
    expect(instructions).toContain('Original expiry is preserved:');

    const hostile = '<script>window.__syntheticDefectCanary="executed"</script>The approved example output refers to a removed private field.';
    await page.locator('section[aria-label="Package defect report"]').getByLabel('Package problem category', { exact: true }).selectOption('missing_context');
    await page.locator('section[aria-label="Package defect report"]').getByLabel('Describe the package problem', { exact: true }).fill(hostile);
    await page.locator('section[aria-label="Package defect report"]').getByRole('button', { name: 'File defect report', exact: true }).click();
    await page.locator('section[aria-label="Package defect report"]').getByText('Defect report recorded', { exact: false }).waitFor({ timeout: 30000 });
    const reported = await page.locator('section[aria-label="Package defect report"]').innerText();
    expect(reported).toContain('<script>window.__syntheticDefectCanary="executed"</script>');
    expect(reported).toContain('missing_context');
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__syntheticDefectCanary)).toBeUndefined();
    expect(await page.locator('script').count()).toBe(1);

    const guessed = await page.evaluate(async () => {
      const result = await fetch(`${new URLSearchParams(window.location.search).get('api')}/v1/reservations/44444444-4444-4444-8444-444444444444`, { credentials: 'include' });
      return { status: result.status, body: await result.text() };
    });
    expect(guessed).toEqual({ status: 404, body: '{"error":"not_found"}' });

    expect(api.paths.length).toBeGreaterThan(0);
    expect(api.paths.every(path => path.startsWith('/health') || path.startsWith('/v1/'))).toBe(true);
    expect(api.cookies.filter(cookie => cookie.includes('private_session=') || cookie.includes(privateCanaryToken))).toEqual([]);
    expect(api.cookies.some(cookie => cookie.includes('contributor_session='))).toBe(true);
    expect(probe.requests.every(cookie => !cookie.includes('contributor_session='))).toBe(true);
    const contributors = await context.cookies();
    expect(contributors.find(cookie => cookie.name === 'contributor_session')).toMatchObject({ domain: 'contributor.localhost', httpOnly: true, sameSite: 'Strict' });
  } finally {
    await browser.close();
    await harness.close();
    await api.close();
    await probe.close();
  }
  expect(errors).toEqual([]);
});

it('the portal shows bounded loading and empty states without inventing released data', { timeout: 180000 }, async () => {
  const world = buildEmptyWorld();
  await seedContributorViaInvitation(world);
  const harness = await serveHarness();
  const api = await startReservationApi(world);
  const { browser, context, page } = await launchBrowser();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  try {
    await page.goto(portalUrl(api.url));
    await page.getByText('Sign in to see your reservations.', { exact: true }).waitFor();
    expect(await page.getByText('Sign in to see your reservations.', { exact: true }).count()).toBe(1);
    const unauthenticated = await page.evaluate(async () => {
      const result = await fetch(`${new URLSearchParams(window.location.search).get('api')}/v1/auth/session`, { credentials: 'include' });
      return result.status;
    });
    expect(unauthenticated).toBe(401);
    await portalSignIn(page);
    await page.getByText('No tasks have been released to the local board yet.', { exact: true }).waitFor();
    expect(await page.getByText('No tasks have been released to the local board yet.', { exact: true }).count()).toBe(1);
    expect(await page.getByRole('button', { name: 'View task', exact: true }).count()).toBe(0);
  } finally {
    await browser.close();
    await harness.close();
    await api.close();
  }
  expect(errors).toEqual([]);
});
