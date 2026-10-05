/**
 * Trusted application-policy wrapper (COMPOSITION.md §6).
 * Policy files are pure data — never scripts — and are applied by the
 * supervisor-side proxy AFTER the candidate API emits a response. Candidate
 * headers can never override the trusted policy; ingress context is supplied
 * by the supervisor from its own observation, never from request headers.
 */

const CONTROLLED = new Set(['content-security-policy', 'x-content-type-options', 'referrer-policy', 'strict-transport-security', 'x-frame-options']);
const REFERRER = new Set(['no-referrer', 'same-origin', 'strict-origin-when-cross-origin']);
const ANCESTORS = new Set(['none', 'self']);
const HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

const invalid = code => Object.assign(new Error(code), { code });

/** Strict data-only validation of a candidate policy file. No hooks, no expressions. */
export function validatePolicyData(source, allowedPolicies, expectedSpecHash, digest) {
  if (typeof source !== 'string' || source.length === 0 || source.length > 65536) throw invalid('invalid_policy_data');
  let policy;
  try { policy = JSON.parse(source); } catch { throw invalid('invalid_policy_data'); }
  if (typeof policy !== 'object' || policy === null || Array.isArray(policy)) throw invalid('invalid_policy_data');
  const keys = Object.keys(policy).sort();
  const expected = ['frameAncestors', 'hsts', 'noSniff', 'referrerPolicy', 'schemaVersion'];
  if (keys.length !== expected.length || keys.some((key, i) => key !== expected[i])) throw invalid('invalid_policy_data');
  if (policy.schemaVersion !== 1 || !ANCESTORS.has(policy.frameAncestors) || typeof policy.noSniff !== 'boolean' || !REFERRER.has(policy.referrerPolicy)) throw invalid('invalid_policy_data');
  const hsts = policy.hsts;
  if (typeof hsts !== 'object' || hsts === null || Array.isArray(hsts)) throw invalid('invalid_policy_data');
  const hstsKeys = Object.keys(hsts).sort();
  if (hstsKeys.length !== 3 || hstsKeys[0] !== 'enabled' || hstsKeys[1] !== 'includeSubDomains' || hstsKeys[2] !== 'maxAgeSeconds') throw invalid('invalid_policy_data');
  if (typeof hsts.enabled !== 'boolean' || typeof hsts.includeSubDomains !== 'boolean' || !Number.isInteger(hsts.maxAgeSeconds) || hsts.maxAgeSeconds < 0 || hsts.maxAgeSeconds > 31536000) throw invalid('invalid_policy_data');
  const policyHash = digest(canonicalJson(policy));
  const allowed = (allowedPolicies ?? []).some(candidate => digest(canonicalJson(candidate)) === policyHash);
  if (!allowed) throw invalid('policy_constraint_failure');
  return Object.freeze({ policy: Object.freeze(policy), policyHash, specificationHash: expectedSpecHash });
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
}

function cleanHeaders(headers) {
  const out = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    const lowered = name.toLowerCase();
    if (HOP.has(lowered)) continue;
    if (typeof value !== 'string' || /[\r\n\x00]/.test(value)) continue;
    out[name] = value;
  }
  return out;
}

/**
 * Apply the trusted policy to a candidate response.
 * `ingress` is supervisor-observed transport context ({https, localhost,
 * route}) — forged X-Forwarded-* values can never reach this function.
 * Excluded routes pass through candidate headers (minus hop-by-hop) with no
 * policy injection, matching the declared contract semantics.
 */
export function applyPolicyToResponse({ policy, ingress, excludedRoutes, statusCode, headers }) {
  if (typeof policy !== 'object' || policy === null) throw invalid('invalid_policy');
  if (typeof ingress !== 'object' || ingress === null || typeof ingress.https !== 'boolean' || typeof ingress.localhost !== 'boolean' || typeof ingress.route !== 'string') throw invalid('invalid_ingress');
  if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) throw invalid('invalid_response');
  const result = cleanHeaders(headers);
  if ((excludedRoutes ?? []).includes(ingress.route)) return Object.freeze({ statusCode, headers: Object.freeze(result) });
  for (const name of Object.keys(result)) if (CONTROLLED.has(name.toLowerCase())) delete result[name];
  result['Content-Security-Policy'] = `frame-ancestors '${policy.frameAncestors}'`;
  result['Referrer-Policy'] = policy.referrerPolicy;
  if (policy.noSniff) result['X-Content-Type-Options'] = 'nosniff';
  if (policy.hsts.enabled && ingress.https && !ingress.localhost) {
    result['Strict-Transport-Security'] = `max-age=${policy.hsts.maxAgeSeconds}${policy.hsts.includeSubDomains ? '; includeSubDomains' : ''}`;
  }
  return Object.freeze({ statusCode, headers: Object.freeze(result) });
}
