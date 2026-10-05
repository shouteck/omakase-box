import { describe, expect, it } from 'vitest';
import { byteHash } from '../../../packages/contracts/hash.js';
import { analyzePolicyCandidate, assessPolicyCapabilities, parseResponsePolicy } from '../../../packages/analyzer/policy/index.js';

export const goodPolicy = { schemaVersion: 1, frameAncestors: 'none', noSniff: true, referrerPolicy: 'no-referrer', hsts: { enabled: true, maxAgeSeconds: 86400, includeSubDomains: false } };

describe('bounded data-only policy adapter', () => {
  it('checks captured bytes and exact edit scope without reading or running source', () => {
    const source = JSON.stringify(goodPolicy), sha256 = byteHash(Buffer.from(source));
    expect(analyzePolicyCandidate({ path: 'config/response-security.json', source, sha256 })).toMatchObject({ status: 'checked', assurance: 'bounded', sourceSha256: sha256, runtimeTransfer: 'pending_real_runner' });
    expect(analyzePolicyCandidate({ path: 'config/response-security.json', source: source + ' ', sha256 }).status).toBe('rejected');
  });
  it.each(['../config/response-security.json', 'config/other.json', 'C:/config/response-security.json', 'infra/policy.json', 'config/response-security.json:stream', 'config/Response-Security.json'])('rejects path %s', path => {
    expect(analyzePolicyCandidate({ path, source: JSON.stringify(goodPolicy), sha256: 'a'.repeat(64) }).status).toBe('rejected');
  });
  it('preserves all candidate responsibilities instead of using discipline as a support switch', () => {
    const result = assessPolicyCapabilities([
      { id: 'policy', disciplines: ['security', 'backend'], capability: 'response_security_v1' },
      { id: 'cloud', disciplines: ['security'], capability: 'cloud_network' },
      { id: 'data', disciplines: ['data'], capability: 'database_migration' },
      { id: 'ci', disciplines: ['tooling'], capability: 'ci_workflow' }
    ]);
    expect(result.map(item => item.status)).toEqual(['supported', 'needs_adapter', 'needs_adapter', 'needs_adapter']);
    expect(result.map(item => item.id)).toEqual(['policy', 'cloud', 'data', 'ci']);
    expect(result.every(item => item.assurance === 'bounded' && item.reason.length > 0)).toBe(true);
  });
  it('parses versioned policy values and permits declared schema alternatives', () => {
    expect(parseResponsePolicy(JSON.stringify(goodPolicy))).toEqual(goodPolicy);
    expect(parseResponsePolicy(JSON.stringify({ ...goodPolicy, frameAncestors: 'self', noSniff: false }))).toMatchObject({ frameAncestors: 'self', noSniff: false });
  });
});
