import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { request } from 'node:http';
import { resolve } from 'node:path';
import { docker } from '../../../scripts/docker.mjs';
import { composeArguments } from '../../../scripts/synthetic-runtime.mjs';

const root = resolve(import.meta.dirname, '../../..');
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(root, '.runtime/browsers');
const { chromium } = await import('@playwright/test');
const reportPath = '.execution/evidence/M5.2/trusted-demo-20261004.json';
const accountsPath = resolve(root, '.runtime/trusted-demo-accounts.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function http(scope, method, path, body, headers = {}) {
  const hostname = scope === 'private' ? 'private.localhost' : 'contributor.localhost';
  const port = scope === 'private' ? 4000 : 4001;
  const origin = `http://${hostname}:${scope === 'private' ? 3000 : 3001}`;
  return new Promise((done, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers: { Host: `${hostname}:${port}`, Origin: origin, 'Content-Type': 'application/json', ...headers }, timeout: 10000 }, response => {
      let output = '';
      response.on('data', chunk => { output += chunk; if (output.length > 1048576) response.destroy(new Error('Response exceeded demo bound.')); });
      response.on('error', reject);
      response.on('end', () => { try { done({ status: response.statusCode, body: JSON.parse(output), headers: response.headers }); } catch { reject(new Error('Expected structured demo response.')); } });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Demo request timed out.')));
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
if (process.argv[2] === 'checkpoint') {
  const reportBytes = await readFile(resolve(root, reportPath));
  const report = JSON.parse(reportBytes);
  assert.equal(report.assurance, 'tested');
  assert.equal(report.candidateExecution, false);
  const path = resolve(root, '.execution/state.json');
  const before = await readFile(path);
  const state = JSON.parse(before);
  assert.equal(state.tasks['M5.2'].status, 'blocked');
  const artifacts = [reportPath, '.execution/evidence/M5.2/trusted-demo-20261004-command.json', '.execution/evidence/M5.2/trusted-demo-20261004-command-retry.json'];
  for (const artifact of artifacts) await readFile(resolve(root, artifact));
  state.tasks['M5.2'].evidence = [...new Set([...state.tasks['M5.2'].evidence, ...artifacts])];
  state.lastUpdatedAt = new Date().toISOString();
  state.demoSelection = {
    assurance: 'tested', selectedBy: 'user', mode: 'trusted_synthetic_only',
    evidence: reportPath, evidenceSha256: sha(reportBytes),
    checkpointScriptSha256: sha(await readFile(new URL(import.meta.url))),
    handoff: '.execution/drafts/M5.2.md', handoffSha256: sha(await readFile(resolve(root, '.execution/drafts/M5.2.md'))),
    privateConsole: 'http://private.localhost:3000', contributorPortal: 'http://contributor.localhost:3001',
    accountsRecord: '.runtime/trusted-demo-accounts.json',
    candidateExecution: false, realRunnerGate: 'blocked', targetUnchanged: 'M9',
    limitations: ['Private intent demo verified; contributor portal is a placeholder.', 'No submission evaluation, owner acceptance or payment journey.', 'UI processes must be restarted after this session ends; synthetic API data is preserved.']
  };
  assert.equal(sha(await readFile(path)), sha(before));
  await writeFile(path + '.tmp', JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
  await rename(path + '.tmp', path);
  console.log(JSON.stringify({ assurance: 'tested', mode: state.demoSelection.mode, realRunnerGate: 'blocked', acceptedReviewsPreserved: true }));
} else {
  const startedAt = new Date().toISOString();
  const identity = JSON.parse(await readFile(resolve(root, '.runtime/synthetic-runtime/identity.json'), 'utf8'));
  assert.equal(identity.kind, 'private-task-synthetic-runtime');
  assert.equal(identity.schemaVersion, 1);
  for (const scope of ['private', 'external']) {
    const health = await http(scope, 'GET', '/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.service, scope === 'private' ? 'private-api' : 'external-api');
    assert.equal(health.body.productReady, false);
  }
  let accounts;
  try {
    const stored = JSON.parse(await readFile(accountsPath, 'utf8'));
    assert.equal(stored.kind, 'trusted-synthetic-demo-accounts');
    accounts = stored.accounts;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const seeded = await docker([...composeArguments, 'exec', '-T', '--env', 'SYNTHETIC_AUTH_FIXTURE=private-task-mvp-synthetic', '--workdir', '/workspace/services/private-api', 'private-api', 'node', 'dist/fixture.js'], { input: JSON.stringify({ action: 'seed' }) });
    assert.equal(seeded.code, 0, 'Synthetic account fixture failed.');
    accounts = JSON.parse(seeded.stdout).accounts;
    await writeFile(accountsPath, JSON.stringify({ kind: 'trusted-synthetic-demo-accounts', accounts }, null, 2) + '\n', { flag: 'wx' });
  }
  assert.equal(accounts.length, 3);
  assert.ok(accounts.every(account => /^synthetic\.auth\.(owner|requester|operator)\.[a-f0-9]{8}$/.test(account.username)));
  const owner = accounts.find(account => account.role === 'owner');
  const operator = accounts.find(account => account.role === 'operator');
  assert.ok(owner && operator);
  const login = await http('private', 'POST', '/v1/auth/login', { username: operator.username, password: 'synthetic-auth-password-only' });
  assert.equal(login.status, 200, 'Synthetic operator sign-in failed.');
  const rawCookie = login.headers['set-cookie'];
  assert.ok(Array.isArray(rawCookie) && rawCookie.length > 0);
  const snapshot = await http('private', 'POST', '/v1/snapshots', { sourceId: 'synthetic-shop' }, { Cookie: rawCookie[0].split(';')[0], 'X-CSRF-Token': login.body.csrfToken });
  assert.equal(snapshot.status, 201, 'Synthetic snapshot registration failed.');
  const browser = await chromium.launch({ headless: true, args: ['--host-resolver-rules=MAP private.localhost 127.0.0.1, MAP contributor.localhost 127.0.0.1'] });
  let result;
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', () => errors.push('private_ui_error'));
    await page.goto('http://private.localhost:3000');
    await page.getByText('Private service reachable (tested).', { exact: true }).waitFor({ timeout: 20000 });
    await page.getByLabel('Username', { exact: true }).fill(owner.username);
    await page.getByLabel('Password', { exact: true }).fill('synthetic-auth-password-only');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByText('Signed in as owner').waitFor({ timeout: 20000 });
    await page.getByLabel('Pinned snapshot').selectOption(snapshot.body.id);
    const goal = 'Synthetic demo: let customers choose an available plan, show disabled choices clearly, and display the selected plan.';
    await page.getByLabel('Desired outcome (goal)').fill(goal);
    await page.getByRole('button', { name: 'Create private request', exact: true }).click();
    await page.getByText('captures 0 evidence item(s)').waitFor({ timeout: 20000 });
    await page.getByRole('radio', { name: /Deterministic demo planning/ }).check();
    await page.getByRole('button', { name: 'Generate intent draft', exact: true }).click();
    await page.getByRole('heading', { name: 'Intent review', exact: true }).waitFor({ timeout: 30000 });
    await page.getByText(goal, { exact: true }).first().waitFor({ timeout: 20000 });
    const body = await page.textContent('body');
    assert.ok(body.includes('State: draft — version 1'));
    assert.ok(body.includes('Preparation is blocked: 1 required decision(s) are unresolved.'));
    assert.ok(body.includes('outcome_confirmation'));
    const intentId = await page.getByLabel('Intent ID', { exact: true }).inputValue();
    assert.match(intentId, /^[a-f0-9-]{36}$/);
    await page.screenshot({ path: resolve(root, '.execution/evidence/M5.2/trusted-demo-20261004-private.png'), fullPage: true });
    const contributor = await context.newPage();
    contributor.on('pageerror', () => errors.push('contributor_ui_error'));
    const healthResponse = contributor.waitForResponse(response => response.url() === 'http://contributor.localhost:4001/health');
    await contributor.goto('http://contributor.localhost:3001');
    await contributor.getByText('Contributor bootstrap service reachable (tested).', { exact: true }).waitFor({ timeout: 20000 });
    assert.ok((await contributor.textContent('body')).includes('Reservations, approved package downloads and patch submission are not yet available.'));
    const credentialHeaders = await (await healthResponse).request().allHeaders();
    assert.ok(!(credentialHeaders.cookie ?? '').includes('private_session='));
    assert.equal(errors.length, 0, 'Trusted demo UI raised a browser error.');
    result = {
      schemaVersion: 1, assurance: 'tested', kind: 'trusted_synthetic_demo', startedAt,
      finishedAt: new Date().toISOString(), command: ['node', '.execution/evidence/M5.2/trusted-demo-20261004.mjs'],
      realCustomerData: false, candidateExecution: false, liveModelCalls: false,
      privateConsole: 'http://private.localhost:3000', contributorPortal: 'http://contributor.localhost:3001',
      ownerUsername: owner.username, snapshotId: snapshot.body.id, intentId,
      observed: { apiHealth: 'tested', ownerBrowserSignIn: 'tested', syntheticSnapshot: 'tested', goalOnlyDemoDraft: 'tested', unresolvedDecisionGate: 'tested', contributorPlaceholder: 'tested', privateCookieAbsentFromContributorHealth: 'tested', browserErrors: 0 },
      limitations: ['Hostnames explicitly mapped in Chromium; native contributor DNS remains unverified.', 'No outcome approval, release publication, hostile code evaluation, acceptance or payment exercised.', 'This synthetic workflow does not satisfy M5.2 or M9 delivery gates.']
    };
  } finally { await browser.close(); }
  await writeFile(resolve(root, reportPath), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(result, null, 2));
}
