import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { build } from 'vite';
import { acquireHostRuntime } from '../../../scripts/host-test-runtime.mjs';
import { buildSignedReleaseTransport } from '../../../services/private-api/bridge/release.js';
import { compilerInput, releaseKeys, bridgeKeys } from '../publication/fixture.js';
import { verifyAssignmentReceipt } from '../../../services/external-api/reservations/assignment-receipt.js';
import { SignedAssignmentCommandSchema, SignedCommandPacketSchema } from '../../../services/external-api/reservations/assignment-protocol.js';

async function runIn(runtime: Awaited<ReturnType<typeof acquireHostRuntime>>, service: 'private-api' | 'external-api', entry: string, expression: string) {
  const bundle = await build({ configFile: false, logLevel: 'silent', build: { ssr: entry, write: false, minify: false, sourcemap: false, rollupOptions: { output: { inlineDynamicImports: true } } } });
  const chunks = (Array.isArray(bundle) ? bundle : 'output' in bundle ? bundle.output : []) as Array<{ type?: string; code?: string }>;
  const source = chunks.find(chunk => chunk.type === 'chunk')?.code;
  expect(source).toBeTruthy();
  const result = await runtime.exec(service, ['--input-type=module'], { input: `${source}\ntry { console.log(JSON.stringify(await ${expression})); } catch { console.log(JSON.stringify({ failure: 'fixture_failure' })); process.exitCode=1; }`, timeout: 120000 });
  expect(result.code, result.stderr.slice(-4000)).toBe(0);
  return JSON.parse(result.stdout.trim().split('\n').at(-1)!) as Record<string, unknown>;
}

it('real separate private/external databases bind owner authority, signed choice, replay and authenticated durable reservation routes', async () => {
  const runtime = await acquireHostRuntime();
  try {
  const release = compilerInput(), transport = buildSignedReleaseTransport({ release, transport: { eventId: randomUUID(), nonce: randomUUID() }, verificationKey: releaseKeys.publicKey, bridgeSigningKey: bridgeKeys.privateKey });
  const contributorId = randomUUID();
  const privateReport = await runIn(runtime, 'private-api', 'services/private-api/assignments/live-fixture.ts', `runOwnerAssignmentFixture(${JSON.stringify({ taskId: release.contract.taskId, taskVersion: release.contract.version, packageDigest: transport.sha256, contributorId })})`);
  expect(privateReport).toEqual(expect.objectContaining({ assurance: 'tested', ownerSessionBound: true, concurrentIdempotent: true, outboxRows: 1, choiceRows: 1, disabledOwnerDenied: true, expiredSessionDenied: true, missingReadinessDenied: true, changedChoiceDenied: true, choiceImmutable: true, readinessInjected: true, ownerHttpAuthority: true, ownerCsrfDenied: true, clientAuthorityDenied: true, operatorHttpDenied: true, invitationIssued: true, invitationBound: true, revocationBound: true, revocationQueued: true, revocationIdempotent: true, revocationMissingDenied: true, revocationCsrfDenied: true }));
  expect(privateReport.failure).toBeUndefined();
  const externalInput = { assignment: { packet: privateReport.packet, verificationKeyPem: privateReport.verificationKeyPem, replayPacket: privateReport.replayPacket, stalePackagePacket: privateReport.stalePackagePacket, conflictPacket: privateReport.conflictPacket, revocationPacket: privateReport.revocationPacket, invitationToken: privateReport.invitationToken }, release: { packet: transport.packet, packageBytesBase64: Buffer.from(transport.packageBytes).toString('base64'), releaseKeyPem: releaseKeys.publicKey.export({ format: 'pem', type: 'spki' }).toString(), bridgeKeyPem: bridgeKeys.publicKey.export({ format: 'pem', type: 'spki' }).toString() } };
  expect(JSON.stringify(externalInput)).not.toMatch(/synthetic_owner_assignment_|ownerSessionBound|owner_id|sessionHash|csrfHash/);
  const externalReport = await runIn(runtime, 'external-api', 'services/external-api/reservations/assignment-live-fixture.ts', `runSignedAssignmentFixture(${JSON.stringify(externalInput)})`);
  expect(externalReport).toEqual(expect.objectContaining({ assurance: 'tested', assignmentRecorded: true, concurrentDuplicate: true, claimRows: 1, replayDenied: true, stalePackageDenied: true, changedAssignmentDenied: true, tamperedDenied: true, invitationApplied: true, strangerRedemptionDenied: true, invitationRedeemed: true, duplicateRedemptionDenied: true, malformedRedemptionDenied: true, reservationCreated: true, packageBytesExact: true, instructionsReleasedOnly: true, defectRecorded: true, foreignReservationDenied: true, csrfDenied: true, disabledContributorDenied: true, revocationRecorded: true, revocationClaimRows: 2, revocationReplayDuplicate: true, privateKeyPresent: false }));
  expect(externalReport.failure).toBeUndefined();
  expect(externalReport.receiptAfterCommit).toBe(true);
  expect(verifyAssignmentReceipt(externalReport.revocationReceipt, externalReport.receiptVerificationKeyPem as string, SignedCommandPacketSchema.parse(privateReport.revocationPacket).payload as never)).toMatchObject({ status: 'recorded', duplicate: false });
  expect(verifyAssignmentReceipt(externalReport.receipt, externalReport.receiptVerificationKeyPem as string, SignedAssignmentCommandSchema.parse(privateReport.packet).payload)).toMatchObject({ status: 'recorded', duplicate: true });
  expect(JSON.stringify(externalReport)).not.toContain('BEGIN PRIVATE KEY');
  } finally { await runtime.cleanup(); }
}, 300000);
