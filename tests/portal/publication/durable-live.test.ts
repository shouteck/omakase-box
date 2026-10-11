import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { expect, it } from 'vitest';
import { build } from 'vite';
import { acquireHostRuntime } from '../../../scripts/host-test-runtime.mjs';
import { byteHash, canonicalize, contentHash } from '../../../packages/contracts/hash.js';
import { projectPublicListing } from '../../../packages/contracts/public/task.js';
import { deterministicZip } from '../../../packages/compiler/zip.js';
import { fullStackContract, singleUnitContract } from '../../contracts/fixtures.js';

interface ApprovedFixture {
  manifest: Record<string, unknown>;
  manifestHash: string;
  signature: string;
  contract: unknown;
  listing: unknown;
  feedbackPolicy: unknown;
  paymentTerms: unknown;
  assets: Array<{ path: string; contentBase64: string }>;
}

function approvedRelease(combined: boolean, keys: ReturnType<typeof generateKeyPairSync>): ApprovedFixture {
  const contract = combined ? fullStackContract(true) : singleUnitContract();
  const assets: Array<{ path: string; contentBase64: string }> = contract.editablePaths.map(path => ({ path, contentBase64: Buffer.from(path.endsWith('.json') ? '{"schemaVersion":1}' : 'export const synthetic = true;\n').toString('base64') }));
  for (const item of contract.interfaces) {
    const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, id: item.schema.id }));
    item.schema.sha256 = byteHash(bytes);
    assets.push({ path: item.schema.path, contentBase64: bytes.toString('base64') });
  }
  const listing = projectPublicListing(contract, 30);
  const feedbackPolicy = { schemaVersion: 1, id: contract.feedbackPolicyId, categories: ['received', 'processing', 'owner_review', 'accepted', 'changes_required', 'package_defect', 'infrastructure_issue', 'expired'], messageCodes: ['requirement_not_met', 'invalid_input', 'check_unavailable', 'passed'], privateDiagnostics: 'none', publicDetails: 'approved_public_checks_only' };
  const paymentTerms = { schemaVersion: 1, terminology: 'payment obligation', settlementLabel: 'settlement recorded', reward: contract.reward, terms: contract.terms };
  const manifest = { schemaVersion: 1, canonicalizationVersion: 'json-sorted-utf8/v1', taskId: contract.taskId, version: contract.version, assets: assets.map(asset => ({ path: asset.path, sha256: byteHash(Buffer.from(asset.contentBase64, 'base64')), byteSize: Buffer.from(asset.contentBase64, 'base64').length, mediaType: asset.path.endsWith('.json') ? 'application/json' : 'application/typescript', sourceAssetId: randomUUID() })), contractHash: contentHash(contract), listingHash: contentHash(listing), feedbackPolicyHash: contentHash(feedbackPolicy), paymentTermsHash: contentHash(paymentTerms), templateHash: contract.template.sha256, executionImageDigest: contract.imageDigest };
  return { manifest, manifestHash: contentHash(manifest), signature: sign(null, Buffer.from(canonicalize(manifest), 'utf8'), keys.privateKey).toString('base64'), contract, listing, feedbackPolicy, paymentTerms, assets };
}

function hostPacket(keys: ReturnType<typeof generateKeyPairSync>, release: ApprovedFixture, eventId: string, nonce: string): { packet: unknown; packageBytes: Buffer } {
  const metadata = { 'release/manifest.json': release.manifest, 'release/contract.json': release.contract, 'release/listing.json': release.listing, 'release/feedback-policy.json': release.feedbackPolicy, 'release/payment-terms.json': release.paymentTerms };
  const content = deterministicZip([...release.assets.map(entry => ({ path: entry.path, bytes: Buffer.from(entry.contentBase64, 'base64') })), ...Object.entries(metadata).map(([path, value]) => ({ path, bytes: Buffer.from(canonicalize(value), 'utf8') }))]);
  const unsignedEnvelope = { schemaVersion: 1, eventId, nonce, expiresAt: new Date(Date.now() + 300000).toISOString(), manifest: release.manifest, manifestHash: release.manifestHash, contract: release.contract, listing: release.listing };
  const envelope = { ...unsignedEnvelope, signature: sign(null, Buffer.from(canonicalize(unsignedEnvelope), 'utf8'), keys.privateKey).toString('base64') };
  const payload = { schemaVersion: 1, envelope, approvalSignature: release.signature, package: { sha256: byteHash(content), byteSize: content.length } };
  const packet = { ...payload, signature: sign(null, Buffer.from(canonicalize(payload), 'utf8'), keys.privateKey).toString('base64') };
  return { packet, packageBytes: content };
}

async function bundleFor(entry: string): Promise<string> {
  const bundle = await build({ configFile: false, logLevel: 'silent', build: { ssr: entry, write: false, minify: false, sourcemap: false, rollupOptions: { output: { inlineDynamicImports: true } } } });
  const chunks = (Array.isArray(bundle) ? bundle : 'output' in bundle ? bundle.output : []) as Array<{ type?: string; code?: string }>;
  const chunk = chunks.find(item => item.type === 'chunk' && typeof item.code === 'string');
  if (!chunk?.code) throw new Error(`${entry} bundle did not produce a chunk`);
  return chunk.code;
}

async function runInService(runtime: Awaited<ReturnType<typeof acquireHostRuntime>>, service: 'private-api' | 'external-api', chunkSource: string, call: string, timeout: number): Promise<string> {
  const script = `${chunkSource}\ntry { console.log(JSON.stringify(await ${call})); } catch (error) { console.log(JSON.stringify({ failure: error instanceof Error ? error.message : 'fixture_failure' })); process.exitCode = 1; }\n`;
  const result = await runtime.exec(service, ['--input-type=module'], { input: script, timeout });
  const last = result.stdout.trim().split('\n').at(-1) ?? '';
  expect(result.code, result.stderr.slice(-4000)).toBe(0);
  return last;
}

it('the signed bridge publishes released data into the external store over real container separation', async () => {
  const runtime = await acquireHostRuntime();
  try {
  const releaseKeys = generateKeyPairSync('ed25519');
  const bridgeKeys = generateKeyPairSync('ed25519');
  const release = approvedRelease(true, releaseKeys);
  const transportInput = {
    keys: { releaseVerificationKeyPem: releaseKeys.publicKey.export({ format: 'pem', type: 'spki' }).toString(), bridgeSigningKeyPem: createPrivateKey(bridgeKeys.privateKey.export({ format: 'pem', type: 'pkcs8' })).export({ format: 'pem', type: 'pkcs8' }).toString() },
    release: { manifest: release.manifest, manifestHash: release.manifestHash, signature: release.signature, contract: release.contract, listing: release.listing, feedbackPolicy: release.feedbackPolicy, paymentTerms: release.paymentTerms, assets: release.assets },
    transport: { eventId: randomUUID(), nonce: randomUUID(), ttlSeconds: 120 }
  };
  const privateSource = await bundleFor('services/private-api/bridge/live-fixture.ts');
  const packetJson = await runInService(runtime, 'private-api', privateSource, `runBridgePacketFixture(${JSON.stringify(transportInput)})`, 60000);
  const packetFixture = JSON.parse(packetJson) as { packet: unknown; packageBytesBase64: string; sha256: string; manifestHash: string; failure?: string };
  expect(packetFixture.failure).toBeUndefined();
  expect(packetFixture.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(packetFixture.manifestHash).toBe(release.manifestHash);
  expect(createHash('sha256').update(Buffer.from(packetFixture.packageBytesBase64, 'base64')).digest('hex')).toBe(packetFixture.sha256);
  expect(packetFixture.packageBytesBase64.length).toBeGreaterThan(100);

  const externalSource = await bundleFor('services/external-api/bridge/live-fixture.ts');
  const replay = hostPacket(bridgeKeys, release, (transportInput.transport as { eventId: string }).eventId, randomUUID());
  const conflict = hostPacket(bridgeKeys, approvedRelease(true, releaseKeys), randomUUID(), randomUUID());
  const receiveInput = {
    keys: { releaseVerificationKeyPem: createPublicKey(releaseKeys.publicKey.export({ format: 'pem', type: 'spki' })).export({ format: 'pem', type: 'spki' }).toString(), bridgeVerificationKeyPem: createPublicKey(bridgeKeys.publicKey.export({ format: 'pem', type: 'spki' })).export({ format: 'pem', type: 'spki' }).toString() },
    packet: packetFixture.packet,
    packageBytesBase64: packetFixture.packageBytesBase64,
    replayPacket: replay.packet,
    conflictPacket: conflict.packet,
    conflictPackageBase64: conflict.packageBytes.toString('base64')
  };
  const fixtureJson = await runInService(runtime, 'external-api', externalSource, `runBridgeReceiveFixture(${JSON.stringify(receiveInput)})`, 120000);
  const output = JSON.parse(fixtureJson) as Record<string, unknown>;
  expect(output).toEqual(expect.objectContaining({ assurance: 'tested', published: true, duplicate: true, replay: true, conflict: true, immutableGuards: true, packageValidated: true, retainedAfterGuards: true, boardEntries: 1, claimRows: 1, payloadHashBindsDelivered: true }));
  expect(String(output.database)).toMatch(/^synthetic_bridge_[a-f0-9]{32}$/);
  expect(Array.isArray(output.scopeUnits) && (output.scopeUnits as string[]).length === 3).toBe(true);
  expect(Array.isArray(output.scopeDisciplines) && (output.scopeDisciplines as string[]).length === 3).toBe(true);
  expect(output.scopeReward).toEqual({ currency: 'USD', amountMinor: 10000 });
  } finally { await runtime.cleanup(); }
}, 240000);
