/**
 * Composed-job orchestrator (supervisor-side). Plans the fixed service stack
 * for one composed child job — static-asset server, candidate-API container,
 * data-plane proxy, browser adapter — under ONE aggregate cgroup budget, runs
 * the evaluator's fixed checks, then destroys every service, net namespace
 * and ephemeral disk in declaration order-reverse. Candidate processes never
 * see the control channel, signing key or management sockets.
 */
import { request as httpRequest } from 'node:http';
import { createHash } from 'node:crypto';
import { buildProxyProfile, PROXY_LIMITS } from './proxy-profile.mjs';
import { evaluateComposedChecks } from './driver-composed.mjs';
import { validatePolicyData } from './policy-apply.mjs';

export const COMPOSED_LIMITS = Object.freeze({ services: 8, browserContexts: 1, apiRequestsPerCheck: 4 });

/** Pure plan: fixed topology and disposal order for one composed job. */
export function planComposedStack(job, contract) {
  const apiRoutes = (contract.apiRoutes ?? []).slice(0, 64);
  if (contract.kind !== 'composed' || apiRoutes.length === 0) throw Object.assign(new Error('contract_invalid'), { code: 'contract_invalid' });
  const profile = buildProxyProfile({ authority: 'job', staticPort: 18080, apiPort: 18081, apiRoutes });
  return Object.freeze({
    cgroup: Object.freeze({ name: `pwjob-${job.jobId}-agg`, 'cpu.max': `${job.limits.cpus * 100000} 100000`, 'memory.max': `${job.limits.memoryMiB}M`, 'memory.swap.max': '0', 'pids.max': `${job.limits.pids}` }),
    profile,
    services: Object.freeze([
      Object.freeze({ name: 'static', kind: 'static_assets', port: 18080 }),
      Object.freeze({ name: 'candidate-api', kind: 'candidate_api', port: 18081 }),
      Object.freeze({ name: 'proxy', kind: 'job_proxy', port: 8080 }),
      Object.freeze({ name: 'browser', kind: 'browser', port: null }),
    ]),
    ingress: Object.freeze({ https: true, localhost: false, route: '/' }),
    cleanup: Object.freeze(['browser', 'proxy', 'candidate-api', 'static', 'netns', 'ephemeral-disk', 'cgroup']),
  });
}

/** Real loopback transport into the job's private network namespace. */
export function loopbackHttpClient(request) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: request.host, port: request.port, method: request.method, path: request.path, headers: request.headers, timeout: PROXY_LIMITS.upstreamTimeoutMs, agent: false }, response => {
      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes <= PROXY_LIMITS.responseBytes) chunks.push(chunk);
      });
      response.on('end', () => resolve({ statusCode: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => { req.destroy(new Error('upstream_timeout')); });
    req.on('error', reject);
    if (request.body !== null && request.body !== undefined) req.write(request.body);
    req.end();
  });
}

/**
 * Run the fixed check set for a composed child job. `env.launch` starts a
 * constrained service and returns a handle with .stop(); `env.httpClient`
 * and `env.pageClient` provide transports (absent ⇒ unverified, never
 * passed). Every started service is stopped on all exits, including
 * cancellation.
 */
export async function runComposedJob(job, contract, env) {
  const plan = planComposedStack(job, contract);
  const started = [];
  try {
    for (const service of plan.services.filter(item => item.kind !== 'browser')) {
      if (typeof env.launch !== 'function') break;
      const handle = await env.launch(service, plan);
      if (handle && typeof handle === 'object') started.push(handle);
    }
    const stackReady = started.length > 0 && typeof env.httpClient === 'function';
    const envForChecks = {
      profile: plan.profile,
      ingress: plan.ingress,
      excludedRoutes: contract.excludedRoutes ?? ['/health'],
      digest: data => createHash('sha256').update(data, 'utf8').digest('hex'),
      httpClient: stackReady ? env.httpClient : undefined,
      pageClient: typeof env.pageClient === 'function' ? env.pageClient : undefined,
      policySource: env.policySource ?? null,
      policySpec: contract.policySpec ?? null,
      policy: env.policy ?? null,
    };
    if (envForChecks.policySpec !== null && envForChecks.policy === null && typeof envForChecks.policySource === 'string') {
      try { envForChecks.policy = validatePolicyData(envForChecks.policySource, envForChecks.policySpec.allowedPolicies, envForChecks.policySpec.specificationHash, envForChecks.digest).policy; }
      catch { envForChecks.policy = null; }
    }
    return evaluateComposedChecks({ ...contract, requiredCheckIds: job.requiredCheckIds }, envForChecks);
  } finally {
    for (const handle of started.reverse()) {
      try { await handle.stop(); } catch { /* disposal continues past faults */ }
    }
  }
}
