import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { PUBLIC_FILES } from '../../../templates/workspaces/catalogue.js';

it('every fixed public JavaScript entry parses without executing generated task code', () => {
  for (const [path, source] of Object.entries(PUBLIC_FILES).filter(([path]) => path.endsWith('.mjs'))) {
    const parsed = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: source, encoding: 'utf8', timeout: 10000, windowsHide: true });
    expect(parsed.status, `${path}: ${parsed.stderr}`).toBe(0);
  }
});
it('trusted public data-only policy validation rejects duplicate keys, unknown/executable fields and invalid bounds', async () => {
  const module = await import('data:text/javascript;base64,' + Buffer.from(PUBLIC_FILES['tooling/policy.mjs']!).toString('base64')) as { parsePolicy(source: string): unknown; applyPolicy(headers: Record<string,string>, policy: unknown, ingress: { https: boolean; localhost: boolean; route: string }): Record<string,string> };
  const policy = { schemaVersion: 1, frameAncestors: 'none', noSniff: true, referrerPolicy: 'no-referrer', hsts: { enabled: true, maxAgeSeconds: 86400, includeSubDomains: false } };
  expect(module.parsePolicy(JSON.stringify(policy))).toEqual(policy);
  expect(() => module.parsePolicy(JSON.stringify(policy).replace('"noSniff":true', '"noSniff":true,"noSniff":false'))).toThrow();
  expect(() => module.parsePolicy(JSON.stringify(policy).replace('"noSniff":true', '"noSniff":true,"no\\u0053niff":false'))).toThrow();
  expect(() => module.parsePolicy(JSON.stringify({ ...policy, command: 'eval' }))).toThrow();
  expect(() => module.parsePolicy(JSON.stringify({ ...policy, hsts: { ...policy.hsts, maxAgeSeconds: 31536001 } }))).toThrow();
  const base = { 'Content-Type': 'application/json', 'Strict-Transport-Security': 'forged', 'Content-Security-Policy': 'forged' };
  expect(module.applyPolicy(base, policy, { https: true, localhost: false, route: '/selection' })).toMatchObject({ 'Content-Security-Policy': "frame-ancestors 'none'", 'Strict-Transport-Security': 'max-age=86400' });
  expect(module.applyPolicy(base, policy, { https: true, localhost: true, route: '/selection' })).not.toHaveProperty('Strict-Transport-Security');
  expect(module.applyPolicy(base, policy, { https: true, localhost: false, route: '/health' })).toEqual(base);
});
