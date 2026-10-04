/**
 * Trusted supervisor-side driver for composed harnesses
 * (frontend/v1, backend-api/v1, application-policy/v1, composed/v1).
 * Check expectations and all verdict computation live here — the candidate's
 * API responses, pages and policy files are only observed data. Requests are
 * the evaluator's fixed declarations; they pass the fixed proxy profile and
 * the trusted policy wrapper before comparison.
 */
import { validatePolicyData, applyPolicyToResponse } from './policy-apply.mjs';
import { classifyProxyRequest, sanitizeProxyResponse } from './proxy-profile.mjs';

const outcome = code => Object.freeze({ checkId: code, outcome: 'failed' });
const unverified = code => Object.freeze({ checkId: code, outcome: 'unverified' });

function compareExpect(result, expect) {
  if (expect.status !== undefined && result.statusCode !== expect.status) return false;
  if (expect.bodyContains !== undefined && (typeof result.body !== 'string' || !result.body.includes(expect.bodyContains))) return false;
  if (expect.headerEquals !== undefined) {
    const wanted = Object.entries(expect.headerEquals);
    const actual = new Map(Object.entries(result.headers).map(([name, value]) => [name.toLowerCase(), value]));
    if (wanted.some(([name, value]) => actual.get(name.toLowerCase()) !== value)) return false;
  }
  return true;
}

function evaluateCheck(check, env) {
  const fail = () => outcome(check.checkId);
  try {
    switch (check.kind) {
      case 'http_request': {
        if (typeof env.httpClient !== 'function') return unverified(check.checkId);
        const request = check.request;
        const classified = classifyProxyRequest(env.profile, { method: request.method, target: request.path, headers: { host: env.profile.authority } });
        if (classified.action !== 'forward' || classified.upstream !== 'api') return fail();
        const raw = env.httpClient({ host: classified.host, port: classified.port, method: classified.method, path: classified.path, headers: classified.headers, body: request.body ?? null });
        if (typeof raw !== 'object' || raw === null) return unverified(check.checkId);
        const sanitized = sanitizeProxyResponse(raw.statusCode, raw.headers);
        const ingress = { https: env.ingress.https, localhost: env.ingress.localhost, route: check.ingressRoute ?? classified.path.split('?')[0] };
        const wrapped = env.policy === null
          ? sanitized
          : applyPolicyToResponse({ policy: env.policy, ingress, excludedRoutes: env.excludedRoutes, statusCode: sanitized.statusCode, headers: sanitized.headers });
        const result = { statusCode: wrapped.statusCode, headers: wrapped.headers, body: raw.body };
        return Object.freeze({ checkId: check.checkId, outcome: compareExpect(result, check.expect ?? {}) ? 'passed' : 'failed' });
      }
      case 'page': {
        if (typeof env.pageClient !== 'function') return unverified(check.checkId);
        const classified = classifyProxyRequest(env.profile, { method: 'GET', target: check.route, headers: { host: env.profile.authority } });
        if (classified.action !== 'forward' || classified.upstream !== 'static') return fail();
        const page = env.pageClient({ host: classified.host, port: classified.port, route: classified.path });
        if (typeof page !== 'object' || page === null) return unverified(check.checkId);
        const result = { statusCode: page.statusCode, headers: page.headers ?? {}, body: page.body };
        return Object.freeze({ checkId: check.checkId, outcome: compareExpect(result, check.expect ?? {}) ? 'passed' : 'failed' });
      }
      case 'policy_data': {
        if (typeof env.policySource !== 'string' || env.policySpec === null) return unverified(check.checkId);
        validatePolicyData(env.policySource, env.policySpec.allowedPolicies, env.policySpec.specificationHash, env.digest);
        return Object.freeze({ checkId: check.checkId, outcome: 'passed' });
      }
      default:
        return unverified(check.checkId);
    }
  } catch {
    // Contract violations (policy_constraint_failure, invalid data) are
    // candidate-visible failures; transport gaps are unverified.
    return fail();
  }
}

const CHECK_ID = /^[a-zA-Z0-9_.-]{1,80}$/;
const API_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);

function ownKeys(value, allowed) {
  const keys = Object.keys(value);
  return keys.every(key => allowed.includes(key));
}

function isObject(value) { return typeof value === 'object' && value !== null && !Array.isArray(value); }

function validateExpect(input) {
  if (!isObject(input) || !ownKeys(input, ['status', 'bodyContains', 'headerEquals'])) return false;
  if (input.status !== undefined && (!Number.isInteger(input.status) || input.status < 100 || input.status > 599)) return false;
  if (input.bodyContains !== undefined && (typeof input.bodyContains !== 'string' || input.bodyContains.length > 4096)) return false;
  if (input.headerEquals !== undefined) {
    if (!isObject(input.headerEquals)) return false;
    for (const [name, value] of Object.entries(input.headerEquals)) if (!/^[A-Za-z0-9-]{1,128}$/.test(name) || typeof value !== 'string' || value.length > 8192 || /[\r\n\x00]/.test(value)) return false;
  }
  return true;
}

function safePath(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 2048 && value.startsWith('/') && !/[\x00-\x20]/.test(value);
}

/**
 * Validate an evaluator-authored composed check contract (staged
 * supervisor-side inside the artifact bundle). Shapes are fixed per kind;
 * every declared requiredCheckId must be covered.
 */
export function validateComposedContract(input, job) {
  if (!isObject(input) || input.kind !== 'composed' || !Array.isArray(input.checks) || input.checks.length === 0 || input.checks.length > 512) throw new Error('invalid_composed_contract');
  if (input.apiRoutes !== undefined && (!Array.isArray(input.apiRoutes) || input.apiRoutes.length > 64 || input.apiRoutes.some(route => !safePath(route)))) throw new Error('invalid_composed_contract');
  if (input.excludedRoutes !== undefined && (!Array.isArray(input.excludedRoutes) || input.excludedRoutes.length > 16 || input.excludedRoutes.some(route => !safePath(route)))) throw new Error('invalid_composed_contract');
  const ids = new Set();
  for (const check of input.checks) {
    if (!isObject(check) || !CHECK_ID.test(check.checkId) || ids.has(check.checkId)) throw new Error('invalid_composed_contract');
    ids.add(check.checkId);
    if (check.expect !== undefined && !validateExpect(check.expect)) throw new Error('invalid_composed_contract');
    if (check.kind === 'http_request') {
      if (!ownKeys(check, ['checkId', 'kind', 'request', 'expect', 'ingressRoute']) || !isObject(check.request)) throw new Error('invalid_composed_contract');
      if (!ownKeys(check.request, ['method', 'path', 'body']) || !API_METHODS.has(check.request.method) || !safePath(check.request.path)) throw new Error('invalid_composed_contract');
      if (check.request.body !== undefined && (typeof check.request.body !== 'string' || check.request.body.length > 1048576)) throw new Error('invalid_composed_contract');
      if (check.ingressRoute !== undefined && !safePath(check.ingressRoute)) throw new Error('invalid_composed_contract');
    } else if (check.kind === 'page') {
      if (!ownKeys(check, ['checkId', 'kind', 'route', 'expect']) || !safePath(check.route)) throw new Error('invalid_composed_contract');
    } else if (check.kind === 'policy_data') {
      if (!ownKeys(check, ['checkId', 'kind', 'expect'])) throw new Error('invalid_composed_contract');
    } else throw new Error('invalid_composed_contract');
  }
  if (job.requiredCheckIds.some(id => !ids.has(id))) throw new Error('invalid_composed_contract');
  return Object.freeze(input);
}

/**
 * Evaluate the fixed check set for a composed child job. `env` provides
 * supervisor-injected transports (httpClient, pageClient), the validated
 * candidate policy data (policy/policySource), the fixed proxy profile,
 * trusted ingress context and the digest function. Absent transports yield
 * unverified — never passed.
 */
export function evaluateComposedChecks(contract, env) {
  if (typeof contract !== 'object' || contract === null || !Array.isArray(contract.checks)) throw new Error('contract_invalid');
  const required = new Set(contract.requiredCheckIds);
  const declared = new Set(contract.checks.map(check => check.checkId));
  if (required.size !== declared.size || [...required].some(id => !declared.has(id))) throw new Error('contract_check_mismatch');
  const results = contract.checks.map(check => evaluateCheck(check, env));
  const verdict = results.some(result => result.outcome === 'unverified')
    ? 'unverified'
    : results.some(result => result.outcome === 'failed') ? 'failed' : 'passed';
  return Object.freeze({ outcome: verdict, checks: Object.freeze(results) });
}
