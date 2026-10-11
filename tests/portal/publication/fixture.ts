import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { byteHash, canonicalize, contentHash } from '../../../packages/contracts/hash.js';
import { compileApprovedRelease } from '../../../packages/compiler/index.js';
import { projectPublicListing } from '../../../packages/contracts/public/task.js';
import { fullStackContract, singleUnitContract } from '../../contracts/fixtures.js';

export const now = Date.parse('2026-10-04T12:00:00Z');
export const releaseKeys = generateKeyPairSync('ed25519');
export const bridgeKeys = generateKeyPairSync('ed25519');
export function approvedRelease(combined = false) {
  const contract = combined ? fullStackContract(true) : singleUnitContract();
  const assets = contract.editablePaths.map(path => ({ path, contentBase64: Buffer.from(path.endsWith('.json') ? '{"schemaVersion":1}' : 'export const synthetic = true;\n').toString('base64') }));
  for (const item of contract.interfaces) {
    const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, id: item.schema.id }));
    item.schema.sha256 = byteHash(bytes);
    assets.push({ path: item.schema.path, contentBase64: bytes.toString('base64') });
  }
  const listing = projectPublicListing(contract, 30);
  const feedbackPolicy = { schemaVersion: 1, id: contract.feedbackPolicyId, categories: ['received', 'processing', 'owner_review', 'accepted', 'changes_required', 'package_defect', 'infrastructure_issue', 'expired'], messageCodes: ['requirement_not_met', 'invalid_input', 'check_unavailable', 'passed'], privateDiagnostics: 'none', publicDetails: 'approved_public_checks_only' };
  const paymentTerms = { schemaVersion: 1, terminology: 'payment obligation', settlementLabel: 'settlement recorded', reward: contract.reward, terms: contract.terms };
  const manifest = { schemaVersion: 1, canonicalizationVersion: 'json-sorted-utf8/v1', taskId: contract.taskId, version: contract.version, assets: assets.map(asset => ({ path: asset.path, sha256: byteHash(Buffer.from(asset.contentBase64, 'base64')), byteSize: Buffer.from(asset.contentBase64, 'base64').length, mediaType: asset.path.endsWith('.json') ? 'application/json' : 'application/typescript', sourceAssetId: randomUUID() })), contractHash: contentHash(contract), listingHash: contentHash(listing), feedbackPolicyHash: contentHash(feedbackPolicy), paymentTermsHash: contentHash(paymentTerms), templateHash: contract.template.sha256, executionImageDigest: contract.imageDigest };
  return { manifest, manifestHash: contentHash(manifest), signature: sign(null, Buffer.from(canonicalize(manifest)), releaseKeys.privateKey).toString('base64'), contract, listing, feedbackPolicy, paymentTerms, assets };
}
export function metadata() {
  return { eventId: randomUUID(), nonce: randomUUID(), expiresAt: new Date(now + 300000).toISOString() };
}
export function signedFixture(combined = false) {
  const release = approvedRelease(combined);
  const packageBytes = Buffer.from('synthetic opaque compiled package transport bytes; never executed');
  const unsigned = { schemaVersion: 1, ...metadata(), manifest: release.manifest, manifestHash: release.manifestHash, contract: release.contract, listing: release.listing };
  const envelope = { ...unsigned, signature: sign(null, Buffer.from(canonicalize(unsigned)), bridgeKeys.privateKey).toString('base64') };
  const payload = { schemaVersion: 1, envelope, approvalSignature: release.signature, package: { sha256: byteHash(packageBytes), byteSize: packageBytes.length } };
  const packet = { ...payload, signature: sign(null, Buffer.from(canonicalize(payload)), bridgeKeys.privateKey).toString('base64') };
  return { packet, packageBytes };
}
export function resign(packet: ReturnType<typeof signedFixture>['packet']) {
  const { signature: ignoredEnvelope, ...unsigned } = packet.envelope;
  packet.envelope.signature = sign(null, Buffer.from(canonicalize(unsigned)), bridgeKeys.privateKey).toString('base64');
  const { signature: ignoredPacket, ...payload } = packet;
  packet.signature = sign(null, Buffer.from(canonicalize(payload)), bridgeKeys.privateKey).toString('base64');
  return packet;
}
export function receiverOptions() {
  const events = new Set<string>(), nonces = new Set<string>();
  const claims: Array<{ eventId: string; nonce: string; payloadHash: string; expiresAt: string }> = [];
  return {
    releaseKey: releaseKeys.publicKey, bridgeKey: bridgeKeys.publicKey, claims,
    claimReplay: async (claim: typeof claims[number]) => {
      if (events.has(claim.eventId) || nonces.has(claim.nonce)) return false;
      events.add(claim.eventId); nonces.add(claim.nonce); claims.push(claim);
      return true;
    }
  };
}
export function compilerInput(combined = false) {
  const release = approvedRelease(combined);
  return { manifest: release.manifest, manifestHash: release.manifestHash, signature: release.signature, contract: release.contract, listing: release.listing, feedbackPolicy: release.feedbackPolicy, paymentTerms: release.paymentTerms, assets: release.assets };
}
export function compiledFixture(combined = false) {
  const input = compilerInput(combined);
  const artifact = compileApprovedRelease(input, releaseKeys.publicKey);
  const unsigned = { schemaVersion: 1, ...metadata(), manifest: input.manifest, manifestHash: input.manifestHash, contract: input.contract, listing: input.listing };
  const envelope = { ...unsigned, signature: sign(null, Buffer.from(canonicalize(unsigned)), bridgeKeys.privateKey).toString('base64') };
  const payload = { schemaVersion: 1, envelope, approvalSignature: input.signature, package: { sha256: artifact.sha256, byteSize: artifact.bytes.length } };
  const packet = { ...payload, signature: sign(null, Buffer.from(canonicalize(payload)), bridgeKeys.privateKey).toString('base64') };
  return { packet, packageBytes: Buffer.from(artifact.bytes), input };
}
