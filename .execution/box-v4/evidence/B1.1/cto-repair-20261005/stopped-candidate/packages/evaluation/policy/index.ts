import { PolicyIngressSchema, PolicyHeadersSchema } from '../../contracts/public/response-policy.js';
import { contentHash } from '../../contracts/hash.js';
import { parseResponsePolicy, parsePolicySpecification, policyJsonCopy, ResponsePolicySchema } from '../../analyzer/policy/index.js';

export function checkPolicyData(source: string, rawSpecification: unknown, expectedHash: string) {
  const base = { assurance: 'bounded' as const, runtimeTransfer: 'pending_real_runner' as const, acceptanceEligible: false as const };
  try {
    const specification = parsePolicySpecification(rawSpecification);
    if (contentHash(specification) !== expectedHash) return { ...base, status: 'rejected' as const, reason: 'specification_hash_mismatch' as const };
    const policy = parseResponsePolicy(source);
    if (!specification.allowedPolicies.some(allowed => contentHash(allowed) === contentHash(policy))) return { ...base, status: 'rejected' as const, reason: 'policy_constraint_failure' as const };
    return { ...base, status: 'checked' as const, reason: null, policyHash: contentHash(policy), specificationHash: expectedHash };
  } catch { return { ...base, status: 'rejected' as const, reason: 'invalid_policy_data' as const }; }
}
export function expectedPolicyHeaders(rawPolicy: unknown, rawHeaders: unknown, rawIngress: unknown, rawSpecification: unknown): Record<string, string> {
  const specification = parsePolicySpecification(rawSpecification);
  const policy = ResponsePolicySchema.parse(policyJsonCopy(rawPolicy));
  if (!specification.allowedPolicies.some(allowed => contentHash(allowed) === contentHash(policy))) throw new Error('policy_constraint_failure');
  const ingress = PolicyIngressSchema.parse(policyJsonCopy(rawIngress));
  const headers = PolicyHeadersSchema.parse(policyJsonCopy(rawHeaders));
  if (specification.excludedRoutes.includes(ingress.route as '/health')) return { ...headers };
  const controlled = new Set(['content-security-policy', 'x-content-type-options', 'referrer-policy', 'strict-transport-security']);
  const result = Object.fromEntries(Object.entries(headers).filter(([name]) => !controlled.has(name.toLowerCase())));
  result['Content-Security-Policy'] = `frame-ancestors '${policy.frameAncestors}'`;
  result['Referrer-Policy'] = policy.referrerPolicy;
  if (policy.noSniff) result['X-Content-Type-Options'] = 'nosniff';
  if (policy.hsts.enabled && ingress.https && !ingress.localhost) result['Strict-Transport-Security'] = `max-age=${policy.hsts.maxAgeSeconds}${policy.hsts.includeSubDomains ? '; includeSubDomains' : ''}`;
  return result;
}
