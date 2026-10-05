import { expect, it } from 'vitest';
import { build } from 'vite';
import { docker } from '../../../scripts/docker.mjs';
import { composeArguments } from '../../../scripts/synthetic-runtime.mjs';

it('durable assignment delivery keeps unknown outcomes pending and rejects stale leases, receipts and changed approvals', async () => {
  const bundle = await build({ configFile: false, logLevel: 'silent', build: { ssr: 'services/private-api/assignments/delivery-live-fixture.ts', write: false, minify: false, sourcemap: false, rollupOptions: { output: { inlineDynamicImports: true } } } });
  const chunks = (Array.isArray(bundle) ? bundle : 'output' in bundle ? bundle.output : []) as Array<{ type?: string; code?: string }>;
  const source = chunks.find(chunk => chunk.type === 'chunk')?.code;
  expect(source).toBeTruthy();
  const result = await docker([...composeArguments, 'exec', '-T', '--workdir', '/workspace/services/private-api', 'private-api', 'node', '--input-type=module'], { input: `${source}\ntry { console.log(JSON.stringify(await runAssignmentDeliveryFixture())); } catch { console.log(JSON.stringify({ failure: 'fixture_failure' })); process.exitCode=1; }`, timeout: 120000 });
  expect(result.code, result.stderr.slice(-4000)).toBe(0);
  const report = JSON.parse(result.stdout.trim().split('\n').at(-1)!) as Record<string, unknown>;
  expect(report).toEqual(expect.objectContaining({ assurance: 'tested', externalReceiptMocked: true, realReadinessVerified: false, concurrentOneLease: true, crashReusesPacket: true, staleLeaseDenied: true, unsignedReceiptDenied: true, pendingBeforeAck: true, acknowledgedOnce: true, duplicateAckIdempotent: true, expiredFrameRenewed: true, originalChoiceUnchanged: true, wrongReceiptDenied: true, missingReadinessDenied: true, changedReadinessDenied: true, disabledOwnerSkipped: true, transportFailurePending: true, transportTimeoutPending: true, cancellationPending: true, staleReleaseDenied: true }));
  expect(report.failure).toBeUndefined();
  expect(report).toMatchObject({ attemptHistoryImmutable: true, receiptHistoryImmutable: true, outboxHistoryImmutable: true, preCancelledNotSent: true });
}, 180000);
