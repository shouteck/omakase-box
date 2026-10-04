import { describe, expect, it } from 'vitest';
// @ts-expect-error guest-side ESM module without type declarations
import { buildProxyProfile, classifyProxyRequest } from '../../../infra/runner/composition/proxy-profile.mjs';

const profile = () => buildProxyProfile({ authority: 'job', staticPort: 18080, apiPort: 18081, apiRoutes: ['/api', '/health'] });
const headers = (extra: Record<string, string> = {}) => ({ host: 'job', ...extra });

describe('proxy tunneling and route escape — every attempt fails closed', () => {
  it('rejects CONNECT outright — no tunnels', () => {
    for (const target of ['evil.example:443', '10.0.0.1:22', 'job:443']) {
      expect(classifyProxyRequest(profile(), { method: 'CONNECT', target, headers: headers() }).reason).toBe('connect_forbidden');
    }
  });
  it('rejects absolute-form targets naming a foreign authority — no open proxy', () => {
    for (const target of ['http://evil.example/steal', 'https://169.254.169.254/latest/meta-data', 'http://job.evil.example/x']) {
      expect(classifyProxyRequest(profile(), { method: 'GET', target, headers: headers() }).reason).toBe('upstream_escape');
    }
  });
  it('accepts absolute form only for the proxy authority itself', () => {
    expect(classifyProxyRequest(profile(), { method: 'GET', target: 'http://job/api/x', headers: headers() })).toMatchObject({ action: 'forward', upstream: 'api' });
  });
  it('rejects path traversal and encoded escapes', () => {
    for (const target of ['/api/../admin', '/api/%2e%2e/admin', '/%2e%2e/%2e%2e/etc/passwd', '/api/../../mgmt', '/a/./../b']) {
      expect(classifyProxyRequest(profile(), { method: 'GET', target, headers: headers() }).reason).toBe('path_escape');
    }
  });
  it('rejects double-encoded traversal', () => {
    expect(classifyProxyRequest(profile(), { method: 'GET', target: '/api/%252e%252e/admin', headers: headers() }).reason).toBe('path_escape');
  });
  it('rejects forged Host headers — authority is fixed', () => {
    for (const host of ['evil.example', 'job.evil.example', 'localhost', 'internal-mgmt:22']) {
      expect(classifyProxyRequest(profile(), { method: 'GET', target: '/x', headers: { host } }).reason).toBe('forged_host');
    }
  });
  it('candidate-controlled forwarding headers are stripped, never trusted', () => {
    const result = classifyProxyRequest(profile(), {
      method: 'GET', target: '/api/x',
      headers: { host: 'job', 'x-forwarded-for': '10.0.0.1', 'x-real-ip': '10.0.0.2', 'forwarded': 'for=1.2.3.4', 'via': 'attacker', 'proxy-authorization': 'Basic x' },
    });
    expect(result.action).toBe('forward');
    expect(result.headers['x-forwarded-for']).toBeUndefined();
    expect(result.headers['forwarded']).toBeUndefined();
    expect(result.headers['proxy-authorization']).toBeUndefined();
  });
  it('rejects malformed request lines', () => {
    expect(classifyProxyRequest(profile(), { method: 'GET', target: '*', headers: headers() }).reason).toBe('target_invalid');
    expect(classifyProxyRequest(profile(), { method: 'GET', target: '', headers: headers() }).reason).toBe('target_invalid');
    expect(classifyProxyRequest(profile(), { method: 'GET', target: '/x y', headers: headers() }).reason).toBe('target_invalid');
  });
  it('bounds request line and header sizes', () => {
    expect(classifyProxyRequest(profile(), { method: 'GET', target: '/' + 'a'.repeat(5000), headers: headers() }).reason).toBe('target_invalid');
    const huge = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`x-pad-${i}`, 'b'.repeat(400)]));
    expect(classifyProxyRequest(profile(), { method: 'GET', target: '/x', headers: headers(huge) }).reason).toBe('headers_too_large');
  });
  it('rejects CR/LF header injection', () => {
    expect(classifyProxyRequest(profile(), { method: 'GET', target: '/x', headers: headers({ 'x-a': 'ok\r\nHost: evil' }) }).reason).toBe('headers_invalid');
  });
  it('upgrade header never reaches upstream even when the request forwards', () => {
    const result = classifyProxyRequest(profile(), { method: 'GET', target: '/x', headers: headers({ connection: 'upgrade', upgrade: 'websocket' }) });
    expect(result.action).toBe('forward');
    expect(result.headers['upgrade']).toBeUndefined();
    expect(result.headers['connection']).toBeUndefined();
  });
});
