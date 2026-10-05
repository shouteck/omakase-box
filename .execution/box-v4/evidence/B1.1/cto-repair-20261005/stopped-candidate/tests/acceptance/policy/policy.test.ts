import { describe, expect, it } from 'vitest';
import { contentHash, byteHash } from '../../../packages/contracts/hash.js';
import { freezePolicyProposal } from '../../../packages/planner/partition/policy/index.js';
import { checkPolicyData, expectedPolicyHeaders } from '../../../packages/evaluation/policy/index.js';
import { preparePolicyCheck } from '../../../services/private-api/preparations/policy/index.js';
import { demoFixtures } from '../../../packages/planner/providers/demo-fixtures.js';

const policy = { schemaVersion: 1, frameAncestors: 'none', noSniff: true, referrerPolicy: 'no-referrer', hsts: { enabled: true, maxAgeSeconds: 86400, includeSubDomains: false } };
const alternate = { ...policy, frameAncestors: 'self' };
const specification = { schemaVersion: 1, editablePath: 'config/response-security.json', allowedPolicies: [policy, alternate], excludedRoutes: ['/health'], ingressPolicy: 'trusted_https_non_localhost', overridePolicy: 'strip_candidate_controlled_headers' };
const baseline = { 'Content-Type': 'application/json', 'Content-Security-Policy': 'unsafe', 'STRICT-TRANSPORT-SECURITY': 'bad', 'x-content-type-options': 'bad', 'Referrer-Policy': 'bad' };
const source = JSON.stringify(policy);
const binding = { privateRevision: 'a'.repeat(64), privateDestinationPath: 'config/response-security.json', retainedLoaderPath: 'src/private/response-policy-wrapper.ts', retainedLoaderSha256: 'b'.repeat(64), preservationRequirementIds: ['response_policy'] };

function proposal(id: string) { return structuredClone(demoFixtures.find(fixture => fixture.id === id)!.partition); }

describe('frozen policy obligations and private transfer feasibility', () => {
  it.each(['response_policy', 'selection_with_policy'])('freezes the exact policy within %s without splitting a connected task', id => {
    const result = freezePolicyProposal(proposal(id), specification);
    expect(result.status).toBe('proposed');
    expect(result.specificationHash).toBe(contentHash(specification));
    expect(result.approvalRequired).toBe(true);
    expect(result.runtimeTransfer).toBe('pending_real_runner');
    const partition = result.proposal;
    expect(partition.status).toBe('proposed');
    if (partition.status !== 'proposed') throw new Error('Expected proposed composition.');
    expect(partition.composition.workUnits.map(unit => unit.adapterKind)).toEqual(id === 'response_policy' ? ['application_policy'] : ['frontend_component', 'backend_api', 'application_policy']);
    const requirement = partition.composition.requirements.find(item => item.id === 'response_policy')!;
    expect(requirement.outputs.join(' ')).toContain(contentHash(specification));
    expect(requirement.inputs.join(' ')).toContain(JSON.stringify(specification));
    expect(requirement.states).toEqual(expect.arrayContaining(['https', 'http', 'localhost', 'excluded_route']));
    expect(partition.composition.workUnits.find(unit => unit.adapterKind === 'application_policy')!.trustedCheckIds).toEqual(expect.arrayContaining(['policy_schema_v1', 'policy_constraints_v1', 'policy_transfer_v1', 'policy_preservation_v1', 'policy_ingress_v1', 'policy_override_v1']));
  });
  it('binds whole-task content, detects changed policy, and returns independent copies', () => {
    const original = proposal('selection_with_policy');
    const first = freezePolicyProposal(original, specification);
    const changed = freezePolicyProposal(original, { ...specification, allowedPolicies: [alternate] });
    expect(changed.proposalHash).not.toBe(first.proposalHash);
    expect(original).toEqual(proposal('selection_with_policy'));
    first.specification.allowedPolicies[0]!.noSniff = false;
    expect(freezePolicyProposal(original, specification).specification.allowedPolicies[0]!.noSniff).toBe(true);
  });
  it.each([policy, alternate])('accepts declared alternatives as static feasibility only', candidate => {
    const result = checkPolicyData(JSON.stringify(candidate), specification, contentHash(specification));
    expect(result).toMatchObject({ status: 'checked', assurance: 'bounded', runtimeTransfer: 'pending_real_runner', acceptanceEligible: false });
  });
  it('does not accept a schema-valid policy that violates the frozen obligation', () => {
    expect(checkPolicyData(JSON.stringify({ ...policy, noSniff: false }), specification, contentHash(specification))).toMatchObject({ status: 'rejected', reason: 'policy_constraint_failure' });
    expect(checkPolicyData(source, specification, 'f'.repeat(64))).toMatchObject({ status: 'rejected', reason: 'specification_hash_mismatch' });
  });
  it('defines expected headers independently of candidate overrides and forwarding headers', () => {
    expect(expectedPolicyHeaders(policy, baseline, { https: true, localhost: false, route: '/selection' }, specification)).toEqual({ 'Content-Type': 'application/json', 'Content-Security-Policy': "frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Strict-Transport-Security': 'max-age=86400' });
    expect(expectedPolicyHeaders(policy, baseline, { https: false, localhost: false, route: '/selection' }, specification)).not.toHaveProperty('Strict-Transport-Security');
    expect(expectedPolicyHeaders(policy, baseline, { https: true, localhost: true, route: '/selection' }, specification)).not.toHaveProperty('Strict-Transport-Security');
    expect(expectedPolicyHeaders(policy, baseline, { https: true, localhost: false, route: '/health' }, specification)).toEqual(baseline);
    expect(() => expectedPolicyHeaders(policy, baseline, { https: true, localhost: false, route: '/selection', host: 'evil' }, specification)).toThrow();
  });
  it('removes disabled controlled headers and preserves unrelated headers', () => {
    const disabled = { ...policy, noSniff: false, hsts: { ...policy.hsts, enabled: false } };
    const result = expectedPolicyHeaders(disabled, baseline, { https: true, localhost: false, route: '/selection' }, { ...specification, allowedPolicies: [disabled] });
    expect(result).not.toHaveProperty('X-Content-Type-Options');
    expect(result).not.toHaveProperty('Strict-Transport-Security');
    expect(result['Content-Type']).toBe('application/json');
  });
  it('records immutable loader/revision bindings and pending runtime checks without executing the loader', () => {
    const frozen = freezePolicyProposal(proposal('response_policy'), specification);
    const result = preparePolicyCheck({ proposal: frozen, binding, candidate: { path: 'config/response-security.json', source, sha256: byteHash(Buffer.from(source)) } });
    expect(result).toMatchObject({ status: 'checked', runtimeTransfer: 'pending_real_runner', acceptanceEligible: false });
    expect(result.bindingHash).toBe(contentHash(binding));
    expect(result.requiredChecks).toEqual(expect.arrayContaining(['policy_schema_v1', 'policy_constraints_v1', 'policy_transfer_v1', 'policy_preservation_v1', 'policy_ingress_v1', 'policy_override_v1']));
    expect(preparePolicyCheck({ proposal: { ...frozen, proposalHash: 'e'.repeat(64) }, binding, candidate: { path: 'config/response-security.json', source, sha256: byteHash(Buffer.from(source)) } }).status).toBe('rejected');
  });
  it('covers published enum/boundary values with no hidden universal hardening rule', () => {
    for (const referrerPolicy of ['no-referrer', 'same-origin', 'strict-origin-when-cross-origin']) {
      for (const maxAgeSeconds of [0, 31536000]) {
        const choice = { ...policy, referrerPolicy, hsts: { enabled: true, maxAgeSeconds, includeSubDomains: true } };
        const declaration = { ...specification, allowedPolicies: [choice] };
        expect(checkPolicyData(JSON.stringify(choice), declaration, contentHash(declaration)).status).toBe('checked');
        expect(expectedPolicyHeaders(choice, {}, { https: true, localhost: false, route: '/selection' }, declaration)['Strict-Transport-Security']).toBe(`max-age=${maxAgeSeconds}; includeSubDomains`);
      }
    }
  });
  it('blocks an editable loader, unknown preservation link, or a policy path belonging to no unit', () => {
    const frozen = freezePolicyProposal(proposal('response_policy'), specification);
    const candidate = { path: 'config/response-security.json', source, sha256: byteHash(Buffer.from(source)) };
    expect(preparePolicyCheck({ proposal: frozen, binding: { ...binding, retainedLoaderPath: 'config/response-security.json' }, candidate }).status).toBe('rejected');
    expect(preparePolicyCheck({ proposal: frozen, binding: { ...binding, preservationRequirementIds: ['missing'] }, candidate }).status).toBe('rejected');
    expect(() => freezePolicyProposal(proposal('component_selection'), specification)).toThrow();
  });
});
