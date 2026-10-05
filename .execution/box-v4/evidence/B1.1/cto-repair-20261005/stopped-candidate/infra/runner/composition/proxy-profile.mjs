/**
 * Fixed per-job data-plane proxy profile (COMPOSITION.md §3).
 * The job's declared upstreams and routes are evaluator-authored constants.
 * The proxy is transport plumbing only: no CONNECT, no tunnels, no candidate
 * upstream selection, no redirect following, no forwarding-header trust.
 */

const STATIC_METHODS = Object.freeze(['GET', 'HEAD']);
const API_METHODS = Object.freeze(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);
const FORWARDING = new Set(['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-port', 'x-real-ip', 'via']);
export const PROXY_LIMITS = Object.freeze({ requestLineBytes: 4096, headerBytes: 16384, bodyBytes: 1048576, responseBytes: 4194304, upstreamTimeoutMs: 15000 });

/**
 * Build the immutable proxy profile for one job. `authority` is the sole Host
 * the data plane answers on (e.g. "job"); `apiRoutes` are the evaluator-declared
 * route prefixes the candidate API may serve. Ports are loopback ports chosen
 * by the supervisor — never by the candidate.
 */
export function buildProxyProfile({ authority, staticPort, apiPort, apiRoutes }) {
  if (typeof authority !== 'string' || !/^[a-z0-9.-]{1,128}$/.test(authority) || authority.includes('..')) throw Object.assign(new Error('authority_invalid'), { code: 'authority_invalid' });
  for (const [name, port] of [['static', staticPort], ['api', apiPort]]) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw Object.assign(new Error(`${name}_port_invalid`), { code: `${name}_port_invalid` });
  }
  if (!Array.isArray(apiRoutes) || apiRoutes.length === 0 || apiRoutes.length > 64) throw Object.assign(new Error('api_routes_invalid'), { code: 'api_routes_invalid' });
  const routes = apiRoutes.map(route => {
    if (typeof route !== 'string' || route.length > 256 || !route.startsWith('/') || /[\x00-\x20"<>\\^`|{}]/.test(route) || route.includes('..')) throw Object.assign(new Error('api_route_invalid'), { code: 'api_route_invalid' });
    return route.endsWith('/') && route.length > 1 ? route.slice(0, -1) : route;
  });
  if (new Set(routes).size !== routes.length) throw Object.assign(new Error('api_routes_duplicate'), { code: 'api_routes_duplicate' });
  return Object.freeze({
    schemaVersion: 1,
    authority,
    upstreams: Object.freeze({
      static: Object.freeze({ host: '127.0.0.1', port: staticPort, methods: STATIC_METHODS, pathPrefix: '/' }),
      api: Object.freeze({ host: '127.0.0.1', port: apiPort, methods: API_METHODS, routes: Object.freeze(routes) }),
    }),
    followRedirects: false,
    limits: PROXY_LIMITS,
  });
}

function normalizePath(raw) {
  // Decode once; reject double-encoding and traversal before any prefix match.
  let decoded;
  try { decoded = decodeURIComponent(raw); } catch { return null; }
  if (decoded.includes('%')) return null;
  const segments = decoded.split('/');
  const out = [];
  for (const segment of segments) {
    if (segment === '..') return null;
    if (segment === '' || segment === '.') continue;
    out.push(segment);
  }
  return '/' + out.join('/');
}

/**
 * Classify one parsed HTTP request against the fixed profile. Returns
 * {action:'forward', upstream, host, port, method, path, headers} or
 * {action:'reject', reason}. `target` is the origin-form or absolute-form
 * request target; `headers` is a lower-cased name → value map.
 */
export function classifyProxyRequest(profile, { method, target, headers }) {
  const reject = reason => Object.freeze({ action: 'reject', reason });
  if (typeof method !== 'string' || !/^[A-Z]{1,16}$/.test(method)) return reject('method_invalid');
  if (method === 'CONNECT') return reject('connect_forbidden');
  if (typeof target !== 'string' || target.length === 0 || target.length > profile.limits.requestLineBytes || /[\x00-\x20]/.test(target)) return reject('target_invalid');
  if (target === '*') return reject('target_invalid');
  let path;
  if (target.startsWith('http://') || target.startsWith('https://')) {
    // Absolute form is legal only when the authority is this proxy exactly —
    // a foreign absolute URI would be an open-proxy / route-escape attempt.
    let url;
    try { url = new URL(target); } catch { return reject('target_invalid'); }
    if (url.host !== profile.authority && url.hostname !== profile.authority) return reject('upstream_escape');
    path = url.pathname + url.search;
  } else if (target.startsWith('/')) {
    path = target;
  } else {
    return reject('target_invalid');
  }
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return reject('headers_invalid');
  const names = Object.keys(headers);
  if (names.length > 128) return reject('headers_invalid');
  let headerBytes = 0;
  const clean = {};
  for (const name of names) {
    if (!/^[a-z0-9-]{1,128}$/.test(name)) return reject('headers_invalid');
    const value = headers[name];
    if (typeof value !== 'string' || value.length > 8192 || /[\r\n\x00]/.test(value)) return reject('headers_invalid');
    headerBytes += name.length + value.length + 4;
    if (headerBytes > profile.limits.headerBytes) return reject('headers_too_large');
    if (HOP_BY_HOP.has(name) || FORWARDING.has(name) || name.startsWith('proxy-')) continue;
    clean[name] = value;
  }
  const host = clean['host'];
  if (host !== undefined && host !== profile.authority) return reject('forged_host');
  clean['host'] = profile.authority;
  // Trusted forwarding context is stamped by the proxy itself.
  clean['x-forwarded-proto'] = 'https';
  clean['x-forwarded-host'] = profile.authority;
  const query = path.indexOf('?');
  const normalized = normalizePath(query === -1 ? path : path.slice(0, query));
  if (normalized === null) return reject('path_escape');
  const suffix = query === -1 ? '' : path.slice(query);
  const upstreamName = profile.upstreams.api.routes.some(route => normalized === route || normalized.startsWith(route + '/')) ? 'api' : 'static';
  const upstream = profile.upstreams[upstreamName];
  if (!upstream.methods.includes(method)) return reject('method_not_allowed');
  return Object.freeze({ action: 'forward', upstream: upstreamName, host: upstream.host, port: upstream.port, method, path: normalized + suffix, headers: Object.freeze(clean) });
}

/** Strip hop-by-hop/forwarding response headers; 3xx is returned verbatim — never followed. */
export function sanitizeProxyResponse(statusCode, headers) {
  if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) throw Object.assign(new Error('upstream_status_invalid'), { code: 'upstream_status_invalid' });
  const clean = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    const lowered = name.toLowerCase();
    if (HOP_BY_HOP.has(lowered) || FORWARDING.has(lowered)) continue;
    if (typeof value !== 'string' || /[\r\n\x00]/.test(value)) continue;
    clean[name] = value;
  }
  return Object.freeze({ statusCode, headers: Object.freeze(clean) });
}
