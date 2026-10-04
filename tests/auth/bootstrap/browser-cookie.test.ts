import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { chromium } from '@playwright/test';
import { expect, it } from 'vitest';
import { privateSessionCookie } from '../../../services/private-api/bootstrap/cookie-policy.js';
import { contributorSessionCookie } from '../../../services/external-api/bootstrap/cookie-policy.js';

const privateToken = 'synthetic_private_session_canary_32_chars';
const externalToken = 'synthetic_contributor_session_canary_32_chars';
async function listen(server: Server): Promise<number> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test listener.');
  return address.port;
}
async function close(server: Server) {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
it('real browser sends synthetic private cookies only to the private hostname (bootstrap policy, not DB authentication)', async () => {
  const privateRequests: string[] = [];
  const externalRequests: string[] = [];
  const privateServer = createServer((request, response) => {
    privateRequests.push(request.headers.cookie ?? '');
    if (request.url === '/seed') response.setHeader('Set-Cookie', privateSessionCookie(privateToken, 'localhost_demo'));
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><title>Synthetic private cookie probe</title>');
  });
  const externalServer = createServer((request, response) => {
    externalRequests.push(request.headers.cookie ?? '');
    if (request.url === '/seed') response.setHeader('Set-Cookie', contributorSessionCookie(externalToken, 'localhost_demo'));
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><title>Synthetic contributor cookie probe</title>');
  });
  const privatePort = await listen(privateServer);
  const externalPort = await listen(externalServer);
  try {
    const browser = await chromium.launch({ headless: true, args: ['--host-resolver-rules=MAP private.localhost 127.0.0.1,MAP contributor.localhost 127.0.0.1'] });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`http://private.localhost:${privatePort}/seed`);
      await page.goto(`http://private.localhost:${privatePort}/observe`);
      expect(privateRequests.some(cookie => cookie.includes(`private_session=${privateToken}`))).toBe(true);
      await page.goto(`http://contributor.localhost:${externalPort}/seed`);
      await page.goto(`http://contributor.localhost:${externalPort}/observe`);
      expect(externalRequests.length).toBeGreaterThan(0);
      expect(externalRequests.some(cookie => cookie.includes(`contributor_session=${externalToken}`))).toBe(true);
      expect(externalRequests.every(cookie => !cookie.includes(privateToken) && !cookie.includes('private_session'))).toBe(true);
      expect(privateRequests.every(cookie => !cookie.includes(externalToken))).toBe(true);
      const cookies = await context.cookies();
      expect(cookies.find(cookie => cookie.name === 'private_session')).toMatchObject({ domain: 'private.localhost', httpOnly: true, sameSite: 'Strict' });
      expect(cookies.find(cookie => cookie.name === 'contributor_session')).toMatchObject({ domain: 'contributor.localhost', httpOnly: true, sameSite: 'Strict' });
      await context.close();
    } finally { await browser.close(); }
  } finally { await close(privateServer); await close(externalServer); }
}, 30000);
