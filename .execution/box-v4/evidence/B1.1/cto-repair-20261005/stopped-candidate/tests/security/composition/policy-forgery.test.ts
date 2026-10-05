import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
// @ts-expect-error guest-side ESM module without type declarations
import { validatePolicyData, applyPolicyToResponse } from '../../../infra/runner/composition/policy-apply.mjs';
// @ts-expect-error guest-side ESM module without type declarations
import { evaluateComposedChecks, validateComposedContract } from '../../../infra/runner/composition/driver-composed.mjs';
// @ts-expect-error guest-side ESM module without type declarations
import { buildProxyProfile } from '../../../infra/runner/composition/proxy-profile.mjs';
import { buildAttemptDescriptor } from '../../../packages/evaluation/composition/index.js';
import { buildChildJobs, aggregateAttemptVerdict } from '../../../services/runner-controller/composition/index.js';
import { DEFAULT_LIMITS } from '../../../packages/runner-protocol/index.js';
import type { TrustedResult } from '../../../packages/runner-protocol/index.js';

const digest = (data: string) => createHash('sha256').update(data, 'utf8').digest('hex');
const hex = (seed: number) => seed.toString(16).padStart(64, '0').slice(0, 64);
const uuid = (seed: number) => `00000000-0000-4000-8000-${seed.toString(16).padStart(12, '0')}`;

const ALLOWED = [{ schemaVersion: 1, frameAncestors: 'none', noSniff: true, referrerPolicy: 'no-referrer', hsts: { enabled: true, maxAgeSeconds: 31536000, includeSubDomains: true } }];
const policySource = (over: Record<string, unknown> = {}) => JSON.stringify({ ...ALLOWED[0], ...over });

describe('validatePolicyData — policies are data only, never scripts', () => {
  it('accepts exactly an allow-listed policy document', () => {
    expect(validatePolicyData(policySource(), ALLOWED, hex(70), digest).policyHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it('rejects privilege-changing policies not on the allow list', () => {
    for (const over of [
      { frameAncestors: 'self' },
      { noSniff: false },
      { referrerPolicy: 'unsafe-url' },
      { hsts: { enabled: false, maxAgeSeconds: 0, includeSubDomains: false } },
      { schemaVersion: 2 },
    ]) {
      expect(() => validatePolicyData(policySource(over), ALLOWED, hex(70), digest)).toThrowError(/policy_constraint_failure|invalid_policy_data/);
    }
  });
  it('rejects extra keys, expressions and executable-shaped content', () => {
    for (const source of [
      JSON.stringify({ ...ALLOWED[0], hook: 'require("child_process").exec("id")' }),
      JSON.stringify({ ...ALLOWED[0], eval: 'process.exit(1)' }),
      'process.exit(0)',
      'function(){return 1}',
      '{"schemaVersion":1,"frameAncestors":"none"}',
      'null', '[]', '"passed"',
    ]) {
      expect(() => validatePolicyData(source, ALLOWED, hex(70), digest)).toThrow();
    }
  });
});

describe('applyPolicyToResponse — candidate headers can never override trusted policy', () => {
  const ingress = { https: true, localhost: false, route: '/selection' };
  it('strips candidate-controlled security headers and applies the policy', () => {
    const result = applyPolicyToResponse({
      policy: ALLOWED[0], ingress, excludedRoutes: ['/health'], statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Security-Policy': "frame-ancestors 'self'",
        'X-Frame-Options': 'ALLOWALL',
        'Strict-Transport-Security': 'max-age=0',
        'Referrer-Policy': 'unsafe-url',
      },
    });
    expect(result.headers['Content-Security-Policy']).toBe("frame-ancestors 'none'");
    expect(result.headers['Referrer-Policy']).toBe('no-referrer');
    expect(result.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(result.headers['Strict-Transport-Security']).toBe('max-age=31536000; includeSubDomains');
    expect(result.headers['X-Frame-Options']).toBeUndefined();
    expect(result.headers['Content-Type']).toBe('application/json');
  });
  it('withholds HSTS on forged-ingress shapes — context comes only from the supervisor', () => {
    const result = applyPolicyToResponse({ policy: ALLOWED[0], ingress: { https: false, localhost: true, route: '/x' }, excludedRoutes: ['/health'], statusCode: 200, headers: {} });
    expect(result.headers['Strict-Transport-Security']).toBeUndefined();
    expect(result.headers['Content-Security-Policy']).toBe("frame-ancestors 'none'");
  });
  it('preserves the declared excluded route without policy injection', () => {
    const result = applyPolicyToResponse({ policy: ALLOWED[0], ingress: { ...ingress, route: '/health' }, excludedRoutes: ['/health'], statusCode: 200, headers: { 'Content-Type': 'text/plain' } });
    expect(result.headers['Content-Security-Policy']).toBeUndefined();
  });
  it('drops injection-bearing candidate header values', () => {
    const result = applyPolicyToResponse({ policy: ALLOWED[0], ingress, excludedRoutes: [], statusCode: 200, headers: { 'X-Custom': 'ok\nSet-Cookie: stolen' } });
    expect(result.headers['X-Custom']).toBeUndefined();
  });
});

describe('evaluateComposedChecks — verdicts come from trusted observations only', () => {
  const profile = buildProxyProfile({ authority: 'job', staticPort: 18080, apiPort: 18081, apiRoutes: ['/api'] });
  const contract = {
    kind: 'composed', apiRoutes: ['/api'], requiredCheckIds: ['api.contract', 'policy.data'],
    checks: [
      { checkId: 'api.contract', kind: 'http_request', request: { method: 'GET', path: '/api/orders' }, expect: { status: 200, bodyContains: 'order' } },
      { checkId: 'policy.data', kind: 'policy_data' },
    ],
  };
  const env = (httpClient: any) => ({ profile, httpClient, ingress: { https: true, localhost: false, route: '/' }, excludedRoutes: ['/health'], digest, policySource: policySource(), policySpec: { allowedPolicies: ALLOWED, specificationHash: hex(70) }, policy: ALLOWED[0] });
  it('passes only on observed matching responses through the fixed proxy', () => {
    const result = evaluateComposedChecks(contract, env(() => ({ statusCode: 200, headers: {}, body: '{"order":1}' })));
    expect(result.outcome).toBe('passed');
  });
  it('forged candidate success text cannot pass — observed status/body is compared', () => {
    for (const body of ['passed', '{"outcome":"passed"}', '']) {
      const result = evaluateComposedChecks(contract, env(() => ({ statusCode: 500, headers: {}, body })));
      expect(result.checks.find((entry: any) => entry.checkId === 'api.contract').outcome).toBe('failed');
    }
  });
  it('absent transports are unverified — never silently passed', () => {
    const result = evaluateComposedChecks(contract, { ...env(undefined), httpClient: undefined });
    expect(result.checks.find((entry: any) => entry.checkId === 'api.contract').outcome).toBe('unverified');
    expect(result.outcome).toBe('unverified');
  });
  it('a tampered policy file fails its check as contract violation', () => {
    const result = evaluateComposedChecks(contract, { ...env(() => ({ statusCode: 200, headers: {}, body: '{"order":1}' })), policySource: policySource({ noSniff: false }) });
    expect(result.checks.find((entry: any) => entry.checkId === 'policy.data').outcome).toBe('failed');
  });
});

describe('validateComposedContract — evaluator-authored check contracts are strict', () => {
  const job = { requiredCheckIds: ['api.contract'] };
  it('rejects malformed check kinds, unsafe paths and undeclared ids', () => {
    for (const contract of [
      { kind: 'composed', checks: [{ checkId: 'api.contract', kind: 'exec', command: 'id' }] },
      { kind: 'composed', checks: [{ checkId: 'api.contract', kind: 'http_request', request: { method: 'CONNECT', path: '/api/x' } }] },
      { kind: 'composed', checks: [{ checkId: 'api.contract', kind: 'http_request', request: { method: 'GET', path: 'javascript:alert(1)' } }] },
      { kind: 'composed', checks: [{ checkId: 'other', kind: 'policy_data' }] },
      { kind: 'script', checks: [{ checkId: 'api.contract', kind: 'policy_data' }] },
    ]) {
      expect(() => validateComposedContract(contract, job)).toThrowError(/invalid_composed_contract/);
    }
  });
});

describe('aggregateAttemptVerdict — forged or incomplete evidence fails closed', () => {
  const attemptInput = () => ({
    attemptId: uuid(1), taskId: uuid(2), taskVersion: 3, packageHash: hex(10), submissionHash: hex(11), jobKind: 'public',
    units: [
      { unitId: 'frontend', adapterKind: 'frontend_component', artifactHash: hex(20), imageDigest: `sha256:${hex(30)}`, checkIds: ['ui.renders'] },
      { unitId: 'api', adapterKind: 'backend_api', artifactHash: hex(21), imageDigest: `sha256:${hex(31)}`, checkIds: ['api.contract'] },
    ],
    interfaces: [{ interfaceId: 'orders-api', schemaHash: hex(40), producerUnitId: 'api', consumerUnitId: 'frontend' }],
    endToEndCheckIds: ['e2e.purchase'], limits: DEFAULT_LIMITS,
  });
  const harnessDigests = { 'frontend/v1': hex(50), 'backend-api/v1': hex(52), 'composed/v1': hex(54) };
  const pass = (job: any, over: Record<string, unknown> = {}) => ({
    protocolVersion: 1, jobId: job.jobId, leaseId: uuid(9), jobKind: job.jobKind, profile: job.profile,
    packageHash: job.packageHash, submissionHash: job.submissionHash, artifactHash: job.artifactHash,
    imageDigest: job.imageDigest, harnessId: job.harnessId, harnessDigest: job.harnessDigest,
    outcome: 'passed', checks: job.requiredCheckIds.map((checkId: string) => ({ checkId, outcome: 'passed' })),
    expiresAt: Date.now() + 60000, logDigest: hex(60), ...over,
  } as TrustedResult);
  it('a forged pass with mismatched submission binding is unverified', () => {
    const descriptor = buildAttemptDescriptor(attemptInput());
    const jobs = buildChildJobs(descriptor, harnessDigests, Date.now() + 60000);
    const evidence = jobs.map(job => ({ jobId: job.jobId, result: pass(job) }));
    evidence[0] = { jobId: jobs[0]!.jobId, result: pass(jobs[0], { submissionHash: hex(99) }) };
    expect(aggregateAttemptVerdict(descriptor, evidence)).toMatchObject({ outcome: 'unverified', cause: 'binding_mismatch' });
  });
  it('a result claiming a jobId that is not part of the attempt is unverified', () => {
    const descriptor = buildAttemptDescriptor(attemptInput());
    const jobs = buildChildJobs(descriptor, harnessDigests, Date.now() + 60000);
    const evidence = jobs.map(job => ({ jobId: job.jobId, result: pass(job) }));
    evidence[0] = { jobId: jobs[0]!.jobId, result: pass(jobs[0], { jobId: uuid(77) }) };
    expect(aggregateAttemptVerdict(descriptor, evidence)).toMatchObject({ outcome: 'unverified', cause: 'job_id_mismatch' });
  });
  it('results from foreign jobs are unverified — no cross-attempt grafting', () => {
    const descriptor = buildAttemptDescriptor(attemptInput());
    const jobs = buildChildJobs(descriptor, harnessDigests, Date.now() + 60000);
    const evidence = jobs.map(job => ({ jobId: job.jobId, result: pass(job) }));
    evidence[0] = { jobId: uuid(88), result: pass(jobs[0]) };
    expect(aggregateAttemptVerdict(descriptor, evidence)).toMatchObject({ outcome: 'unverified', cause: 'unexpected_job_result' });
  });
  it('a self-contradictory passed result (failed check inside) is unverified', () => {
    const descriptor = buildAttemptDescriptor(attemptInput());
    const jobs = buildChildJobs(descriptor, harnessDigests, Date.now() + 60000);
    const evidence = jobs.map(job => ({ jobId: job.jobId, result: pass(job) }));
    evidence[0] = { jobId: jobs[0]!.jobId, result: pass(jobs[0], { checks: [{ checkId: 'ui.renders', outcome: 'failed' }] }) };
    expect(aggregateAttemptVerdict(descriptor, evidence)).toMatchObject({ outcome: 'unverified', cause: 'contradictory_result' });
  });
  it('a forged "passed" harness claim is unverified', () => {
    const descriptor = buildAttemptDescriptor(attemptInput());
    const jobs = buildChildJobs(descriptor, harnessDigests, Date.now() + 60000);
    const evidence = jobs.map(job => ({ jobId: job.jobId, result: pass(job) }));
    evidence[0] = { jobId: jobs[0]!.jobId, result: pass(jobs[0], { harnessId: 'pure-module/v1' }) };
    expect(aggregateAttemptVerdict(descriptor, evidence)).toMatchObject({ outcome: 'unverified', cause: 'harness_mismatch' });
  });
});
