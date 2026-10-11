import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { byteHash, canonicalize, contentHash } from '../../../packages/contracts/hash.js';
import { deterministicZip } from '../../../packages/compiler/zip.js';
import { BridgeRejected } from '../../../services/external-api/bridge/types.js';
import { receive } from '../../../services/external-api/bridge/release.js';
import { decodeDeterministicPackage } from '../../../services/external-api/bridge/packaging.js';
import { projectBoardEntry, projectBoardScope } from '../../../services/external-api/tasks/projections.js';
import { MemoryPublishedTaskPersistence } from '../../../services/external-api/tasks/persistence.js';
import { bridgeKeys, compiledFixture, now, receiverOptions, resign } from '../../portal/publication/fixture.js';

type FixturePacket = ReturnType<typeof compiledFixture>['packet'];
type FixtureRecord = ReturnType<typeof compiledFixture>['input'];

function freshContext() {
  const options = receiverOptions();
  const persistence = new MemoryPublishedTaskPersistence();
  return { releaseKey: options.releaseKey, bridgeKey: options.bridgeKey, claimReplay: options.claimReplay, persistence, now: now + 1_000 };
}

function resignPacketOnly(packet: FixturePacket) {
  const { signature: ignoredPacket, ...payload } = packet;
  packet.signature = sign(null, Buffer.from(canonicalize(payload), 'utf8'), bridgeKeys.privateKey).toString('base64');
  return packet;
}

function repackagedWith(entries: Map<string, Uint8Array>) {
  const bytes = deterministicZip([...entries].map(([path, value]) => ({ path, bytes: Buffer.from(value) })));
  const forged = structuredClone(base.packet) as FixturePacket;
  forged.package = { sha256: byteHash(bytes), byteSize: bytes.length };
  resign(forged);
  return { packet: forged, bytes };
}

async function rejectCode(receiving: Promise<unknown>, expected: 'invalid_envelope' | 'invalid_signature' | 'invalid_approval' | 'invalid_manifest' | 'invalid_contract' | 'invalid_context' | 'expired' | 'replay' | 'package_mismatch' | 'asset_mismatch' | 'package_integrity' | 'task_conflict' | 'persistence_unavailable' | 'not_published') {
  const caught = await receiving.then(() => null, (error: unknown) => error);
  expect(caught).toBeInstanceOf(BridgeRejected);
  const rejected = caught as BridgeRejected;
  expect(rejected.code).toBe(expected);
  expect(rejected.message).toBe(expected);
  const serialized = JSON.stringify(rejected);
  expect(serialized).toBe(JSON.stringify({ code: expected }));
  expect(serialized.includes('src/')).toBe(false);
  expect(serialized.includes('assets')).toBe(false);
}

const base = compiledFixture(false);
const withPolicyBaseline = compiledFixture(true);

function publishedRecordFor(input: FixtureRecord, packageBytes: Uint8Array) {
  return { eventId: '00000000-0000-4000-8000-000000000000', publishedAt: new Date(now).toISOString(), manifestHash: input.manifestHash, manifest: input.manifest, contract: input.contract, listing: input.listing, packageSha256: byteHash(packageBytes), packageBytes };
}

describe('adversarial release bridge attacks', () => {
  it('rejects structurally valid packets whose packet signature is forged or malformed', async () => {
    await rejectCode(receive({ ...base.packet, signature: 'A'.repeat(86) + '==' }, base.packageBytes, freshContext()), 'invalid_signature');
    await rejectCode(receive({ ...base.packet, signature: 'short' }, base.packageBytes, freshContext()), 'invalid_envelope');
  });

  it('catches envelope tamper with and without a re-signed packet', async () => {
    const tampered = structuredClone(base.packet);
    tampered.envelope.listing = { ...tampered.envelope.listing, title: 'Injected rewrite' };
    await rejectCode(receive(resignPacketOnly(tampered), base.packageBytes, freshContext()), 'invalid_signature');
    const rewritten = resign(structuredClone(tampered));
    await rejectCode(receive(rewritten, base.packageBytes, freshContext()), 'invalid_contract');
  });

  it('rejects signatures produced by any key other than the configured bridge key', async () => {
    const wrongKeys = generateKeyPairSync('ed25519');
    const { signature, ...payload } = structuredClone(base.packet),
      forged = { ...payload, signature: sign(null, Buffer.from(canonicalize(payload), 'utf8'), wrongKeys.privateKey).toString('base64') };
    await rejectCode(receive(forged, base.packageBytes, freshContext()), 'invalid_signature');
    await rejectCode(receive({ ...structuredClone(base.packet), signature: null }, base.packageBytes, freshContext()), 'invalid_envelope');
  });

  it('rejects approval signatures that are not from the release key over the canonical manifest', async () => {
    const wrongKeys = generateKeyPairSync('ed25519');
    const forged = { ...structuredClone(base.packet), approvalSignature: sign(null, Buffer.from(canonicalize(base.packet.envelope.manifest), 'utf8'), wrongKeys.privateKey).toString('base64') };
    await rejectCode(receive(resignPacketOnly(forged), base.packageBytes, freshContext()), 'invalid_approval');
    const plausible = { ...structuredClone(base.packet), approvalSignature: withPolicyBaseline.input.signature };
    await rejectCode(receive(resignPacketOnly(plausible), base.packageBytes, freshContext()), 'invalid_approval');
  });

  it('rejects a manifest hash that is not the canonical digest of the attached manifest', async () => {
    const packet = structuredClone(base.packet);
    packet.envelope.manifestHash = 'f'.repeat(64);
    resign(packet);
    await rejectCode(receive(packet, base.packageBytes, freshContext()), 'invalid_manifest');
  });

  it('rejects contract and listing content drifting from approved manifest hashes', async () => {
    const contractDrift = structuredClone(base.packet);
    contractDrift.envelope.contract = { ...contractDrift.envelope.contract, title: 'Rewritten outcome' };
    resign(contractDrift);
    await rejectCode(receive(contractDrift, base.packageBytes, freshContext()), 'invalid_contract');
    const listingDrift = structuredClone(base.packet);
    listingDrift.envelope.listing = { ...listingDrift.envelope.listing, estimatedEffortMinutes: 95 };
    resign(listingDrift);
    await rejectCode(receive(listingDrift, base.packageBytes, freshContext()), 'invalid_contract');
  });

  it('rejects stale transports and overlong windows before touching the claim store', async () => {
    const stale = structuredClone(base.packet);
    stale.envelope.expiresAt = new Date(now - 1_000).toISOString();
    resign(stale);
    const idle = receiverOptions();
    await rejectCode(receive(stale, base.packageBytes, { ...freshContext(), claimReplay: idle.claimReplay }), 'expired');
    expect(idle.claims).toHaveLength(0);
    const farFuture = structuredClone(base.packet);
    farFuture.envelope.expiresAt = new Date(now + 1_000_000).toISOString();
    resign(farFuture);
    await rejectCode(receive(farFuture, base.packageBytes, { ...freshContext(), claimReplay: idle.claimReplay }), 'invalid_envelope');
    expect(idle.claims).toHaveLength(0);
  });

  it('rejects a key configuration error without treating it as a packet fault', async () => {
    const privateKeys = generateKeyPairSync('ed25519');
    await rejectCode(receive(base.packet, base.packageBytes, { ...freshContext(), bridgeKey: privateKeys.privateKey }), 'invalid_context');
    await rejectCode(receive(base.packet, base.packageBytes, { ...freshContext(), releaseKey: privateKeys.privateKey }), 'invalid_context');
  });

  it('rejects replayed event ids carrying conflicting payloads and stores nothing new', async () => {
    const context = freshContext();
    await receive(base.packet, base.packageBytes, context);
    expect(await context.persistence.allPublished()).toHaveLength(1);
    const sameEvent = structuredClone(base.packet);
    sameEvent.envelope.nonce = randomUUID();
    resign(sameEvent);
    await rejectCode(receive(sameEvent, base.packageBytes, context), 'replay');
    expect(await context.persistence.allPublished()).toHaveLength(1);
  });

  it('rejects a replayed nonce with a fresh event id and an unknown-published conflict', async () => {
    const context = freshContext();
    await receive(base.packet, base.packageBytes, context);
    const nonceReplay = structuredClone(withPolicyBaseline.packet);
    nonceReplay.envelope.nonce = base.packet.envelope.nonce;
    resign(nonceReplay);
    await rejectCode(receive(nonceReplay, withPolicyBaseline.packageBytes, context), 'replay');
    const fresh = structuredClone(withPolicyBaseline.packet);
    resign(fresh);
    await rejectCode(receive(fresh, withPolicyBaseline.packageBytes, context), 'task_conflict');
    expect(await context.persistence.allPublished()).toHaveLength(1);
  });

  it('rejects bytes or sizes differing from the signed package description', async () => {
    const flipped = Buffer.from(base.packageBytes);
    const lastByte = flipped.length - 1;
    flipped[lastByte] = flipped[lastByte]! ^ 0x55;
    await rejectCode(receive(base.packet, flipped, freshContext()), 'package_mismatch');
    const sizeForged = structuredClone(base.packet);
    sizeForged.package = { ...sizeForged.package, byteSize: sizeForged.package.byteSize + 1 };
    resign(sizeForged);
    await rejectCode(receive(sizeForged, base.packageBytes, freshContext()), 'package_mismatch');
    await rejectCode(receive(base.packet, new Uint8Array(0), freshContext()), 'package_mismatch');
  });

  it('rejects released package bytes whose asset content hashes or sizes differ from the approved manifest', async () => {
    const entries = decodeDeterministicPackage(base.packageBytes);
    const drifted = new Map(entries);
    const editable = base.input.contract.editablePaths[0]!;
    expect(drifted.get(editable)).toBeDefined();
    drifted.set(editable, Buffer.from('export const synthetic = true; // forged tail\n'));
    const { packet, bytes } = repackagedWith(drifted);
    await rejectCode(receive(packet, bytes, freshContext()), 'asset_mismatch');
    const shortened = new Map(entries);
    expect(shortened.get(editable)).toBeDefined();
    shortened.set(editable, Buffer.from('short'));
    const shrunk = repackagedWith(shortened);
    await rejectCode(receive(shrunk.packet, shrunk.bytes, freshContext()), 'asset_mismatch');
  });

  it('rejects packages holding missing, extra or duplicate release entries', async () => {
    const entries = decodeDeterministicPackage(base.packageBytes);
    const missing = new Map(entries);
    const editable = base.input.contract.editablePaths[0]!;
    expect(missing.get(editable)).toBeDefined();
    missing.delete(editable);
    const gone = repackagedWith(missing);
    await rejectCode(receive(gone.packet, gone.bytes, freshContext()), 'asset_mismatch');
    const extra = new Map(entries);
    extra.set('synthetic-hidden.txt', Buffer.from('unapproved extra release byte'));
    const spurious = repackagedWith(extra);
    await rejectCode(receive(spurious.packet, spurious.bytes, freshContext()), 'asset_mismatch');
  });

  it('rejects structurally corrupted packages after the digest rebind is satisfied', async () => {
    const corrupted = Buffer.from(base.packageBytes);
    const corruptedByte = corrupted.length - 23;
    corrupted[corruptedByte] = corrupted[corruptedByte]! ^ 0x01;
    const forged = structuredClone(base.packet) as FixturePacket;
    forged.package = { sha256: byteHash(corrupted), byteSize: corrupted.length };
    resign(forged);
    await rejectCode(receive(forged, corrupted, freshContext()), 'package_integrity');
  });

  it('rejects injected private provenance fields in the envelope, payload and projections', async () => {
    const envelopeInjected = structuredClone(base.packet);
    envelopeInjected.envelope = { ...envelopeInjected.envelope, privateApprovalId: randomUUID(), internalIntentRef: randomUUID(), approvalNotes: 'internal' } as typeof envelopeInjected.envelope;
    resign(envelopeInjected);
    await rejectCode(receive(envelopeInjected, base.packageBytes, freshContext()), 'invalid_envelope');
    const payloadInjected = { ...structuredClone(base.packet), approvedIntentId: randomUUID(), privateRevision: 'f'.repeat(64) } as FixturePacket;
    resignPacketOnly(payloadInjected);
    await rejectCode(receive(payloadInjected, base.packageBytes, freshContext()), 'invalid_envelope');
    const pollutedRecord = publishedRecordFor(base.input, base.packageBytes) as unknown as Record<string, unknown>;
    let boardCode = '';
    try { projectBoardEntry({ ...publishedRecordFor(base.input, base.packageBytes), listing: { ...((base.input as unknown as Record<string, unknown>).listing as Record<string, unknown>), injectedPrivate: 'leak' } } as never); } catch (error) { boardCode = error instanceof BridgeRejected ? error.code : error instanceof Error ? error.message : String(error); }
    expect(boardCode).toBe('record_invalid');
    let scopeCode = '';
    try { projectBoardScope({ ...publishedRecordFor(base.input, base.packageBytes), contract: { ...(base.input as unknown as Record<string, unknown>).contract as Record<string, unknown>, privateDrift: 'leak' } } as never); } catch (error) { scopeCode = error instanceof BridgeRejected ? error.code : error instanceof Error ? error.message : String(error); }
    expect(scopeCode).toBe('record_invalid');
    void pollutedRecord;
    let manifestCode = '';
    const tamperedManifest = { ...(base.input as unknown as Record<string, unknown>).manifest as Record<string, unknown>, contractHash: 'f'.repeat(64) };
    try { projectBoardEntry({ ...publishedRecordFor(base.input, base.packageBytes), manifest: tamperedManifest, manifestHash: contentHash(tamperedManifest) } as never); } catch (error) { manifestCode = error instanceof BridgeRejected ? error.code : error instanceof Error ? error.message : String(error); }
    expect(manifestCode).toBe('record_invalid');
  });
});
