import { expect, it } from 'vitest';
import { build } from 'vite';
import { acquireHostRuntime } from '../../../scripts/host-test-runtime.mjs';
import { singleUnitContract } from '../../contracts/fixtures.js';
import { projectPublicListing } from '../../../packages/contracts/public/index.js';

it('atomic patch intake enforces binding, patch policy, idempotency and all budget counters on real PostgreSQL', async () => {
  const bundle = await build({ configFile: false, logLevel: 'silent', build: { ssr: 'services/external-api/submissions/live-fixture.ts', write: false, minify: false, sourcemap: false, rollupOptions: { output: { inlineDynamicImports: true } } } });
  const chunks = (Array.isArray(bundle) ? bundle : 'output' in bundle ? bundle.output : []) as Array<{ type?: string; code?: string }>;
  const source = chunks.find(chunk => chunk.type === 'chunk')?.code;
  expect(source).toBeTruthy();
  const contract = singleUnitContract();
  const listing = projectPublicListing(contract, null);
  const input = `const input = ${JSON.stringify({ contract, listing })};\ntry { console.log(JSON.stringify(await runSubmissionIntakeFixture(input))); } catch { console.log(JSON.stringify({ failure: 'fixture_failure' })); process.exitCode=1; }`;
  const runtime = await acquireHostRuntime();
  try {
    const result = await runtime.exec('external-api', ['--input-type=module'], { input: `${source}\n${input}`, timeout: 180000 });
    expect(result.code, result.stderr.slice(-4000)).toBe(0);
    const report = JSON.parse(result.stdout.trim().split('\n').at(-1)!) as Record<string, unknown>;
    expect(report).toEqual(expect.objectContaining({
      assurance: 'tested', candidateExecution: false, realCustomerData: false,
      migrationReplay: true, requestedDdlApplied: true,
      created: true, permitSigned: true, atomicSpend: true, lineageSpent: true, workspaceSpent: true, outboxCommitted: true,
      idempotentDuplicate: true, singleAttemptForKey: true, crossReservationKeyDenied: true,
      forgedBaseDenied: 'package_hash_mismatch', wrongVersionDenied: 'task_version_mismatch', foreignReservationDenied: 'reservation_unavailable',
      traversalDenied: 'invalid_envelope', evaluatorPathDenied: 'invalid_envelope', outsideAllowlistDenied: 'invalid_envelope', malformedDenied: 'invalid_envelope', oversizeDenied: 'invalid_envelope',
      rejectionUnspent: true, reservationBudgetDenied: 'attempt_budget_exceeded', lineageBudgetEnforced: true,
      concurrentSameKeyOneAttempt: true, concurrentAttemptsCount: true, concurrentDistinctKeysSerialized: true,
      expiredDenied: 'reservation_expired',
      exportsDrained: true, pullEmptyAfterAcks: true, forgedPullDenied: 'invalid_request', exportBinding: true,
    }));
    expect(report.failure).toBeUndefined();
  } finally { await runtime.cleanup(); }
}, 240000);

it('private import requires a signed permit, binds the approved release revision and replays idempotently', async () => {
  const bundle = await build({ configFile: false, logLevel: 'silent', build: { ssr: 'services/private-api/submission-import/live-fixture.ts', write: false, minify: false, sourcemap: false, rollupOptions: { output: { inlineDynamicImports: true } } } });
  const chunks = (Array.isArray(bundle) ? bundle : 'output' in bundle ? bundle.output : []) as Array<{ type?: string; code?: string }>;
  const source = chunks.find(chunk => chunk.type === 'chunk')?.code;
  expect(source).toBeTruthy();
  const input = `try { console.log(JSON.stringify(await runSubmissionImportFixture())); } catch { console.log(JSON.stringify({ failure: 'fixture_failure' })); process.exitCode=1; }`;
  const runtime = await acquireHostRuntime();
  try {
    const result = await runtime.exec('private-api', ['--input-type=module'], { input: `${source}\n${input}`, timeout: 180000 });
    expect(result.code, result.stderr.slice(-4000)).toBe(0);
    const report = JSON.parse(result.stdout.trim().split('\n').at(-1)!) as Record<string, unknown>;
    expect(report).toEqual(expect.objectContaining({
      assurance: 'tested', candidateExecution: false, realCustomerData: false,
      migrationReplay: true, requestedDdlApplied: true,
      missingReleaseDenied: 'missing_release', noEvaluationWithoutPermit: true,
      imported: true, evaluationBound: true, importRowCommitted: true, patchStored: true,
      replayIdempotent: true, singleEvaluation: true,
      forgedPermitDenied: true, bindingMismatchDenied: 'invalid_export',
      pollImported: true, crashReplayIdempotent: true, noDuplicateAuthoritativeAttempt: true,
      importImmutable: true,
    }));
    expect(report.failure).toBeUndefined();
  } finally { await runtime.cleanup(); }
}, 240000);
