import { describe, expect, it } from 'vitest';
// @ts-expect-error guest-side ESM module without type declarations
import { buildProxyProfile, classifyProxyRequest, sanitizeProxyResponse, PROXY_LIMITS } from '../../../infra/runner/composition/proxy-profile.mjs';

const profile = () => buildProxyProfile({ authority: 'job', staticPort: 18080, apiPort: 18081, apiRoutes: ['/api'] });

describe('buildProxyProfile — fixed, evaluator-authored topology', () => {
  it('builds an immutable profile with loopback upstreams only', () => {
    const value = profile();
    expect(Object.isFrozen(value)).toBe(true);
    expect(value.upstreams.static.host).toBe('127.0.0.1');
    expect(value.upstreams.api.routes).toEqual(['/api']);
    expect(value.followRedirects).toBe(false);
  });
  it('rejects invalid authority, ports, empty or traversing routes', () => {
    expect(() => buildProxyProfile({ authority: 'evil..com', staticPort: 1, apiPort: 2, apiRoutes: ['/api'] })).toThrow();
    expect(() => buildProxyProfile({ authority: 'job', staticPort: 0, apiPort: 2, apiRoutes: ['/api'] })).toThrow();
    expect(() => buildProxyProfile({ authority: 'job', staticPort: 1, apiPort: 70000, apiRoutes: ['/api'] })).toThrow();
    expect(() => buildProxyProfile({ authority: 'job', staticPort: 1, apiPort: 2, apiRoutes: [] })).toThrow();
    expect(() => buildProxyProfile({ authority: 'job', staticPort: 1, apiPort: 2, apiRoutes: ['/a/../b'] })).toThrow();
    expect(() => buildProxyProfile({ authority: 'job', staticPort: 1, apiPort: 2, apiRoutes: ['/api', '/api'] })).toThrow();
  });
});

describe('classifyProxyRequest — data-plane allowlist', () => {
  it('routes static assets to the static upstream for GET/HEAD', () => {
    const result = classifyProxyRequest(profile(), { method: 'GET', target: '/app.js', headers: { host: 'job' } });
    expect(result).toMatchObject({ action: 'forward', upstream: 'static', port: 18080, path: '/app.js' });
    expect(classifyProxyRequest(profile(), { method: 'HEAD', target: '/', headers: { host: 'job' } }).action).toBe('forward');
  });
  it('routes declared API prefixes to the candidate-API upstream', () => {
    const result = classifyProxyRequest(profile(), { method: 'POST', target: '/api/orders', headers: { host: 'job', 'content-type': 'application/json' } });
    expect(result).toMatchObject({ action: 'forward', upstream: 'api', port: 18081, method: 'POST', path: '/api/orders' });
  });
  it('denies write methods on static assets', () => {
    expect(classifyProxyRequest(profile(), { method: 'POST', target: '/app.js', headers: { host: 'job' } }).reason).toBe('method_not_allowed');
  });
  it('stamps trusted forwarding context itself — candidate headers cannot inject it', () => {
    const result = classifyProxyRequest(profile(), { method: 'GET', target: '/x', headers: { host: 'job', 'x-forwarded-proto': 'http', 'x-forwarded-host': 'attacker.example' } });
    expect(result.headers['x-forwarded-proto']).toBe('https');
    expect(result.headers['x-forwarded-host']).toBe('job');
  });
});

describe('sanitizeProxyResponse — hop-by-hop stripping, redirects never followed', () => {
  it('drops hop-by-hop and forwarding headers, keeps content headers', () => {
    const result = sanitizeProxyResponse(200, { 'Content-Type': 'text/html', 'Connection': 'close', 'X-Forwarded-For': '1.2.3.4', 'Transfer-Encoding': 'chunked' });
    expect(result.headers['Content-Type']).toBe('text/html');
    expect(Object.keys(result.headers).some(name => /connection|forwarded|encoding/i.test(name))).toBe(false);
  });
  it('returns 3xx verbatim — the proxy never follows Location', () => {
    const result = sanitizeProxyResponse(302, { Location: 'http://evil.example/x' });
    expect(result.statusCode).toBe(302);
    expect(result.headers['Location']).toBe('http://evil.example/x');
  });
  it('rejects out-of-range upstream statuses', () => {
    expect(() => sanitizeProxyResponse(99, {})).toThrow();
    expect(() => sanitizeProxyResponse(600, {})).toThrow();
  });
  it('exposes fixed proxy limits', () => {
    expect(PROXY_LIMITS.bodyBytes).toBe(1048576);
    expect(Object.isFrozen(PROXY_LIMITS)).toBe(true);
  });
});
