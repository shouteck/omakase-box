import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { derivePrivateOptions } from '../../../examples/private-shop/src/private/eligibility.js';
import { selectPlan } from '../../../examples/private-shop/src/selection/api.js';
import { createPrivateShopApi } from '../../../examples/private-shop/src/server.js';
import { applyResponsePolicy, loadResponsePolicy } from '../../../examples/private-shop/src/policy/loader.js';
import { parseStrictJson } from '../../../examples/private-shop/src/policy/strict-json.js';
import { rankItems } from '../../../examples/private-shop/reference-solutions/rankItems.js';

const root = 'examples/private-shop';
const policy = loadResponsePolicy(readFileSync(`${root}/config/response-security.json`, 'utf8'));
const subject = { id: 'synthetic-basic-subject', tier: 'basic' as const, region: 'north' as const };
describe('synthetic pre-change fixture and independently authored goals', () => {
  it('starts genuinely coupled to protected eligibility/scoring, not already isolated', () => {
    expect(readFileSync(`${root}/src/selection/SelectionPanel.tsx`, 'utf8')).toContain('../private/eligibility');
    expect(readFileSync(`${root}/src/selection/api.ts`, 'utf8')).toContain('../private/eligibility');
    expect(readFileSync(`${root}/src/ranking/rankPrivateItems.ts`, 'utf8')).toContain('../private/scoring');
    expect(derivePrivateOptions(subject).find(option => option.id === 'pro')?.available).toBe(false);
  });
  it('labels initial missing behaviour without claiming completed task acceptance', () => {
    const fixture = JSON.parse(readFileSync(`${root}/fixture.json`, 'utf8'));
    expect(fixture.kind).toBe('synthetic-private-shop');
    expect(fixture.preChangeRevision).toBe('private-shop-before-v1');
    expect(fixture.knownMissingBehaviour).toContain('API rejects unavailable choices');
    expect(selectPlan({ selectedId: 'pro' }, subject).status).toBe(200);
    expect(fixture.snapshotPaths.every((path: string) => !path.includes('reference-solutions'))).toBe(true);
  });
  it('keeps browser-provided private option context out of the server wrapper', () => {
    expect(selectPlan({ selectedId: 'pro', available: true }, subject).status).toBe(400);
    expect(selectPlan({ selectedId: 'missing' }, subject).status).toBe(404);
  });
  it('has an actual synthetic selection HTTP route and safe origin enforcement', async () => {
    const app = createPrivateShopApi();
    try {
      const result = await app.inject({ method: 'POST', url: '/selection', headers: { host: 'private-shop.localhost:4100' }, payload: { selectedId: 'basic' } });
      expect(result.statusCode).toBe(200); expect(result.json()).toEqual({ selectedId: 'basic' });
      expect((await app.inject({ url: '/health', headers: { host: 'private-shop.localhost:4100', origin: 'https://attacker.invalid' } })).statusCode).toBe(403);
    } finally { await app.close(); }
  });
  it('includes single-unit, coherent full-stack, policy and three-discipline candidates plus capability-specific gaps', () => {
    const candidates = JSON.parse(readFileSync('research/fixtures/candidates.json', 'utf8')).candidates;
    expect(candidates.find((candidate: { id: string }) => candidate.id === 'selection_with_policy').disciplines).toEqual(['frontend', 'backend', 'security']);
    for (const id of ['component_selection', 'ranking', 'selection_journey', 'response_policy', 'selection_with_policy']) expect(candidates.some((candidate: { id: string }) => candidate.id === id)).toBe(true);
    for (const id of ['cloud_deployment', 'data_migration', 'ci_workflow']) expect(candidates.find((candidate: { id: string }) => candidate.id === id)).toMatchObject({ status: 'requires_new_adapter' });
  });
  it('keeps a private reference ranker distinct from planner inputs', () => {
    const input = [{ id: 'b', score: 1 }, { id: 'a', score: 1 }];
    expect(rankItems(input).map(item => item.id)).toEqual(['a', 'b']); expect(input[0]!.id).toBe('b');
    expect(() => rankItems([{ id: 'a', score: NaN }])).toThrow();
  });
});
describe('data-only response policy fixture', () => {
  it.each(['{"x":1,"x":2}', '{"hsts":{"enabled":true,"enabled":false}}', '{"noSniff":true,"no\\u0053niff":false}', '{"x":1,}', '{"x":NaN}', '{"x":1e999}', '[1,]', '{} trailing'])('rejects malformed/duplicate JSON %s', source => { expect(() => parseStrictJson(source)).toThrow(); });
  it('accepts JSON escapes/arrays without executing strings', () => {
    expect(parseStrictJson('{"a":[true,false,null,-1,1.5,"text\\nvalue"]}')).toEqual({ a: [true, false, null, -1, 1.5, 'text\nvalue'] });
  });
  it('rejects unknown executable and remote fields', () => {
    expect(() => loadResponsePolicy(JSON.stringify({ ...policy, script: 'process.exit(0)' }))).toThrow();
    expect(() => loadResponsePolicy(JSON.stringify({ ...policy, remote: 'https://attacker.invalid' }))).toThrow();
  });
  it('uses only trusted ingress, strips conflicting candidate headers and preserves excluded routes', () => {
    const desired = loadResponsePolicy(readFileSync(`${root}/reference-solutions/response-security.json`, 'utf8'));
    const headers = { 'content-security-policy': 'unsafe', 'X-Forwarded-Proto': 'https', 'Host': 'forged.example', 'X-Preserved': 'yes' };
    const https = applyResponsePolicy(headers, desired, { https: true, localhost: false, route: '/selection' });
    expect(https['Content-Security-Policy']).toBe("frame-ancestors 'none'");
    expect(https['Strict-Transport-Security']).toBe('max-age=31536000');
    expect(https['X-Content-Type-Options']).toBe('nosniff');
    expect(https['content-security-policy']).toBeUndefined();
    expect(applyResponsePolicy(headers, desired, { https: false, localhost: true, route: '/selection' })['Strict-Transport-Security']).toBeUndefined();
    expect(applyResponsePolicy(headers, desired, { https: true, localhost: false, route: '/health' })).toEqual(headers);
  });
});
