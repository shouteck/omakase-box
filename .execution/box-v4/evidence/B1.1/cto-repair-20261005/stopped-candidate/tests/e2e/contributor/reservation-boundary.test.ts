import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { buildWorld, seedContributorViaInvitation, serveHarness, startReservationApi, launchBrowser, portalUrl, portalSignIn, startPrivateCookieProbe, privateCanaryToken } from './support.js';

it('the trusted portal reveals exact instructions only after own reservation and verifies downloaded bytes', { timeout: 180000 }, async () => {
  const world = await buildWorld();
  const contributorId = await seedContributorViaInvitation(world);
  const assignment = await world.assignments.chooseExecutor({ taskId: world.taskId, taskVersion: world.taskVersion, executor: { kind: 'human', label: world.customerLabel, contributorId }, chosenBy: 'synthetic-customer-owner' }, Date.now());
  const invitation = await world.assignments.issueInvitation(assignment.id, { role: 'owner' }, Date.now());
  await world.assignments.recordRedemption(invitation.token, contributorId, Date.now());
  const harness = await serveHarness(), api = await startReservationApi(world), probe = await startPrivateCookieProbe();
  const { browser, page } = await launchBrowser();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`http://private.localhost:${probe.port}/seed`);
    await page.goto(portalUrl(api.url));
    await portalSignIn(page);
    await page.getByRole('heading', { name: 'Accessible plan selection', exact: true }).waitFor();
    await page.getByRole('button', { name: 'View task', exact: true }).click();
    expect(await page.locator('section[aria-label="Released task detail"]').innerText()).not.toContain('src/PlanSelector.tsx');
    expect(await page.locator('section[aria-label="Package instructions"]').count()).toBe(0);
    await page.getByRole('button', { name: 'Reserve this task', exact: true }).click();
    await page.getByText('State: active', { exact: true }).waitFor();
    await page.locator('section[aria-label="Package instructions"]').waitFor();
    expect(await page.locator('section[aria-label="Package instructions"]').innerText()).toContain('Allowed edit paths: src/PlanSelector.tsx');
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download approved package', exact: true }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe(`task-${world.taskId}-v1.zip`);
    const bytes = await readFile((await download.path())!);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(world.record.packageSha256);
    expect(bytes).toEqual(Buffer.from(world.record.packageBytes));
    const hostile = '<script>window.__syntheticDefectCanary="executed"</script>Required public example is missing.';
    await page.getByLabel('Describe the package problem', { exact: true }).fill(hostile);
    await page.getByRole('button', { name: 'File defect report', exact: true }).click();
    await page.locator('section[aria-label="Package defect report"]').getByText('Defect report recorded', { exact: true }).waitFor();
    expect(await page.locator('section[aria-label="Package defect report"]').innerText()).toContain(hostile);
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__syntheticDefectCanary)).toBeUndefined();
    expect(api.cookies.some(cookie => cookie.includes('contributor_session='))).toBe(true);
    expect(api.cookies.some(cookie => cookie.includes('private_session=') || cookie.includes(privateCanaryToken))).toBe(false);
    expect(errors).toEqual([]);
  } finally { await browser.close(); await harness.close(); await api.close(); await probe.close(); }
});
