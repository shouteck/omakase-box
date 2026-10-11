import { describe, expect, it } from 'vitest';
import { parseResponsePolicy, analyzePolicyCandidate } from '../../../packages/analyzer/policy/index.js';
import { freezePolicyProposal } from '../../../packages/planner/partition/policy/index.js';
import { checkPolicyData } from '../../../packages/evaluation/policy/index.js';
import { demoFixtures } from '../../../packages/planner/providers/demo-fixtures.js';

const policy = { schemaVersion: 1, frameAncestors: 'none', noSniff: true, referrerPolicy: 'no-referrer', hsts: { enabled: true, maxAgeSeconds: 86400, includeSubDomains: false } };
const source = JSON.stringify(policy);
const specification = { schemaVersion: 1, editablePath: 'config/response-security.json', allowedPolicies: [policy], excludedRoutes: ['/health'], ingressPolicy: 'trusted_https_non_localhost', overridePolicy: 'strip_candidate_controlled_headers' };

describe('application policy cannot control evaluator authority', () => {
  it.each([
    source.replace('"noSniff":true', '"noSniff":true,"noSniff":false'),
    source.replace('"noSniff":true', '"noSniff":true,"no\\u0053niff":false'),
    source.replace('"enabled":true', '"enabled":true,"enabled":false'),
    JSON.stringify({ ...policy, command: 'run something' }),
    JSON.stringify({ ...policy, $ref: 'https://example.invalid/policy' }),
    JSON.stringify({ ...policy, frameAncestors: '${SECRET}' }),
    JSON.stringify({ ...policy, hsts: { ...policy.hsts, maxAgeSeconds: 31536001 } }),
    JSON.stringify({ ...policy, hsts: { ...policy.hsts, maxAgeSeconds: 1.5 } }),
    JSON.stringify({ ...policy, schemaVersion: 2 }),
    source + '{}',
    '{"__proto__":{"polluted":true}}',
    ' '.repeat(65537) + source,
    '['.repeat(40) + '0' + ']'.repeat(40)
  ])('rejects hostile or invalid policy case %#', hostile => {
    expect(() => parseResponsePolicy(hostile)).toThrow('invalid_policy');
    const result = analyzePolicyCandidate({ path: 'config/response-security.json', source: hostile, sha256: 'a'.repeat(64) });
    expect(JSON.stringify(result)).not.toContain(hostile);
    expect(result.status).toBe('rejected');
  });
  it.each(['commands', 'ports', 'dependencies', 'network', 'privileges', 'harness', 'approvedBy'])('rejects evaluator/authority field %s in policy declarations', field => {
    const proposal = demoFixtures.find(fixture => fixture.id === 'response_policy')!.partition;
    expect(() => freezePolicyProposal(proposal, { ...specification, [field]: 'forged' })).toThrow('invalid_policy_specification');
  });
  it('does not invoke accessor code or disclose supplied private diagnostics', () => {
    let touched = false;
    const hostile = { ...specification, get command() { touched = true; return 'PRIVATE_CANARY'; } };
    expect(() => freezePolicyProposal(demoFixtures.find(fixture => fixture.id === 'response_policy')!.partition, hostile)).toThrow();
    expect(touched).toBe(false);
    expect(checkPolicyData('PRIVATE_CANARY', specification, 'a'.repeat(64))).toMatchObject({ status: 'rejected', acceptanceEligible: false });
    expect(JSON.stringify(checkPolicyData('PRIVATE_CANARY', specification, 'a'.repeat(64)))).not.toContain('PRIVATE_CANARY');
  });
});
