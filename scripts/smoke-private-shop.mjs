import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createPrivateShopApi } from '../examples/private-shop/dist/server.js';
import { developmentEnvironment, root } from './process.mjs';

process.env.PLAYWRIGHT_BROWSERS_PATH = fileURLToPath(new URL('../.runtime/browsers/', import.meta.url));
const app = createPrivateShopApi();
await app.listen({ host: '127.0.0.1', port: 4100 });
const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const child = spawn(process.execPath, [vite, 'examples/private-shop'], { cwd: root, stdio: 'ignore', env: developmentEnvironment() });
let failed = false; child.on('error', () => { failed = true; }); child.on('exit', () => { failed = true; });
try {
  let ready = false;
  for (let i = 0; i < 50; i++) {
    if (failed) throw new Error('Fixture UI failed to start.');
    try { const response = await fetch('http://127.0.0.1:3100'); if (response.ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready);
  const browser = await chromium.launch({ headless: true, args: ['--host-resolver-rules=MAP private-shop.localhost 127.0.0.1'] });
  try {
    const page = await browser.newPage();
    await page.goto('http://private-shop.localhost:3100');
    await page.getByRole('heading', { name: 'Synthetic plan selection' }).waitFor();
    const response = page.waitForResponse(reply => reply.url().endsWith('/selection') && reply.request().method() === 'POST');
    await page.getByRole('button', { name: /^Basic:/ }).click();
    const result = await response;
    assert.equal(result.status(), 200); assert.deepEqual(await result.json(), { selectedId: 'basic' });
    assert.equal(await page.getByRole('status').textContent(), 'Selection saved.');
    assert.equal(result.headers()['content-security-policy'], "frame-ancestors 'self'");
    console.log(JSON.stringify({ assurance: 'tested', kind: 'synthetic_pre_change_fixture', actualBrowserToApi: 'tested', baselineResponsePolicy: 'tested', taskAcceptance: 'unverified' }));
  } finally { await browser.close(); }
} finally { child.kill(); await app.close(); }
