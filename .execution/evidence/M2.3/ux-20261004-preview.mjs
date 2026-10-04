import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(root, '.runtime/browsers');
const { chromium } = await import('@playwright/test');
const demo = JSON.parse(await readFile(resolve(root, '.execution/evidence/M5.2/trusted-demo-20261004.json'), 'utf8'));
const browser = await chromium.launch({ headless: true, args: ['--host-resolver-rules=MAP private.localhost 127.0.0.1'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  let errors = 0;
  page.on('pageerror', () => { errors += 1; });
  await page.goto('http://private.localhost:3000');
  await page.getByLabel('Username', { exact: true }).fill(demo.ownerUsername);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-auth-password-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByText('Signed in as owner').waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: 'Intent review', exact: true }).click();
  await page.getByLabel('Intent ID', { exact: true }).fill(demo.intentId);
  await page.getByRole('button', { name: 'Open review', exact: true }).click();
  await page.getByRole('heading', { name: 'Your goal', exact: true }).waitFor({ timeout: 20000 });
  assert.equal(await page.getByLabel('Your answer', { exact: true }).count(), 1);
  assert.equal(await page.getByRole('heading', { name: 'Private provenance', exact: true }).isVisible(), false);
  assert.equal(await page.locator('.intent-details[open]').count(), 0);
  const screenshot = '.execution/evidence/M2.3/ux-20261004-private.png';
  await page.screenshot({ path: resolve(root, screenshot), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.equal(errors, 0);
  console.log(JSON.stringify({ assurance: 'tested', scope: 'Real Chromium against the running trusted Vite UI and synthetic private API.', screenshot, defaultTechnicalDetails: 'collapsed', questionCount: 1, mobileOverflow: false, browserErrors: errors, candidateExecution: false, independentReview: 'unverified' }));
} finally { await browser.close(); }
