import { byteHash, canonicalize } from '../../contracts/hash.js';
import { ResponsePolicySchema, PolicySpecificationSchema, PolicyCandidateSchema, PolicyCapabilityCandidatesSchema } from '../../contracts/public/response-policy.js';
import type { ResponsePolicy, PolicySpecification } from '../../contracts/public/response-policy.js';
import { parsePolicyJson } from './strict-json.js';

export { ResponsePolicySchema, PolicySpecificationSchema };
export type { ResponsePolicy, PolicySpecification };

export const POLICY_PATH = 'config/response-security.json' as const;
export const POLICY_CHECK_IDS = ['policy_schema_v1', 'policy_constraints_v1', 'policy_transfer_v1', 'policy_preservation_v1', 'policy_ingress_v1', 'policy_override_v1'] as const;
export function policyJsonCopy(input: unknown): unknown {
  const encoded = canonicalize(input);
  if (Buffer.byteLength(encoded) > 16384) throw new Error('invalid_policy_declaration');
  return JSON.parse(encoded) as unknown;
}
export function parseResponsePolicy(source: string): ResponsePolicy {
  try { return ResponsePolicySchema.parse(parsePolicyJson(source)); }
  catch { throw new Error('invalid_policy'); }
}
export function parsePolicySpecification(input: unknown): PolicySpecification {
  try { return PolicySpecificationSchema.parse(policyJsonCopy(input)); }
  catch { throw new Error('invalid_policy_specification'); }
}
export function analyzePolicyCandidate(input: unknown) {
  const base = { assurance: 'bounded' as const, runtimeTransfer: 'pending_real_runner' as const, acceptanceEligible: false as const };
  try {
    const candidate = PolicyCandidateSchema.parse(policyJsonCopyCandidate(input));
    const sourceSha256 = byteHash(Buffer.from(candidate.source, 'utf8'));
    if (candidate.sha256 !== sourceSha256) return { ...base, status: 'rejected' as const, reason: 'source_hash_mismatch' as const, sourceSha256: null, policy: null };
    const policy = parseResponsePolicy(candidate.source);
    return { ...base, status: 'checked' as const, reason: null, sourceSha256, policy };
  } catch { return { ...base, status: 'rejected' as const, reason: 'invalid_policy_candidate' as const, sourceSha256: null, policy: null }; }
}
function policyJsonCopyCandidate(input: unknown): unknown {
  const encoded = canonicalize(input);
  if (Buffer.byteLength(encoded) > 131072) throw new Error('invalid_policy_candidate');
  return JSON.parse(encoded) as unknown;
}
export function assessPolicyCapabilities(input: unknown) {
  const candidates = PolicyCapabilityCandidatesSchema.parse(policyJsonCopy(input));
  if (new Set(candidates.map(candidate => candidate.id)).size !== candidates.length) throw new Error('duplicate_capability_candidate');
  return candidates.map(candidate => ({ ...candidate, assurance: 'bounded' as const, status: candidate.capability === 'response_security_v1' ? 'supported' as const : 'needs_adapter' as const, reason: candidate.capability === 'response_security_v1' ? 'Version 1 data-only response-policy feasibility; owner disclosure and real-runner transfer are still required.' : 'No registered adapter for this capability; retain the complete requirement for private work or a reviewed boundary revision.' }));
}
