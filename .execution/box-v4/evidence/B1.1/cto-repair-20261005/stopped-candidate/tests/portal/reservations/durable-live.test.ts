import { expect, it } from 'vitest';
import { build } from 'vite';
import { docker } from '../../../scripts/docker.mjs';
import { composeArguments } from '../../../scripts/synthetic-runtime.mjs';
import { singleUnitContract } from '../../contracts/fixtures.js';
import { projectPublicListing } from '../../../packages/contracts/public/task.js';

it('real PostgreSQL enforces one reservation, frozen terms, invitation binding and own idempotent defects', async () => {
  const contract = singleUnitContract();
  const bundle = await build({ configFile: false, logLevel: 'silent', build: { ssr: 'services/external-api/reservations/live-fixture.ts', write: false, minify: false, sourcemap: false, rollupOptions: { output: { inlineDynamicImports: true } } } });
  const chunks = (Array.isArray(bundle) ? bundle : 'output' in bundle ? bundle.output : []) as Array<{ type?: string; code?: string }>;
  const chunk = chunks.find(item => item.type === 'chunk' && typeof item.code === 'string');
  expect(chunk?.code).toBeTruthy();
  const script = `${chunk!.code}\ntry { console.log(JSON.stringify(await runReservationPersistenceFixture(${JSON.stringify({ contract, listing: projectPublicListing(contract, 30) })}))); } catch { console.log(JSON.stringify({ failure: 'fixture_failure' })); process.exitCode = 1; }\n`;
  const result = await docker([...composeArguments, 'exec', '-T', '--workdir', '/workspace/services/external-api', 'external-api', 'node', '--input-type=module'], { input: script, timeout: 120000 });
  expect(result.code, result.stderr.slice(-4000)).toBe(0);
  const report = JSON.parse(result.stdout.trim().split('\n').at(-1)!) as Record<string, unknown>;
  expect(report).toEqual(expect.objectContaining({ assurance: 'tested', migrationReplay: true, requestedDdlApplied: true, assignmentBound: true, invitationIssued: true, redemptionBound: true, concurrentOneWinner: true, liveReservations: 1, uploadToInReview: true, expiryFrozen: true, reactivationReactivates: true, reactivationPreservesExpiry: true, resubmissionSupersedes: true, staleAttemptRejected: true, latestAttemptAccepted: true, acceptancePreservesExpiry: true, defectAccepted: true, defectIdempotent: true, guessedSafe: true, immutableGuards: true, attemptRows: 2, termsFrozen: true, redemptionDeadlineNotReservationDeadline: true, reissueDenied: true, foreignReservationDenied: true, defectConflictDenied: true, foreignDefectsDenied: true, defectExpiredWithoutSweep: true }));
  expect(report.failure).toBeUndefined();
  expect(report.database).toMatch(/^synthetic_reservations_[a-f0-9]{32}$/);
}, 180000);
