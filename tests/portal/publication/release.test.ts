import { createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { byteHash, canonicalize, contentHash } from '../../../packages/contracts/hash.js';
import { buildSignedReleaseTransport } from '../../../services/private-api/bridge/release.js';
import { BridgeRejected } from '../../../services/external-api/bridge/types.js';
import { receive } from '../../../services/external-api/bridge/release.js';
import { MemoryPublishedTaskPersistence } from '../../../services/external-api/tasks/persistence.js';
import { PublishedTaskBoard } from '../../../services/external-api/tasks/board.js';
import { compiledFixture, now, releaseKeys, receiverOptions } from './fixture.js';

function contextFor() {
  const options = receiverOptions();
  const persistence = new MemoryPublishedTaskPersistence();
  return {
    releaseKey: options.releaseKey, bridgeKey: options.bridgeKey,
    claimReplay: options.claimReplay, persistence, claims: options.claims
  };
}

describe('signed release bridge and local task board', () => {
  it.each([false, true])('accepts a complete signed transport (combined=%s) and binds the approved package bytes', async combined => {
    const { packet, packageBytes, input } = compiledFixture(combined);
    const persistence = new MemoryPublishedTaskPersistence();
    const options = receiverOptions();
    const receipt = await receive(packet, packageBytes, { releaseKey: options.releaseKey, bridgeKey: options.bridgeKey, claimReplay: options.claimReplay, persistence, now: now + 1_000 });
    expect(receipt.outcome).toBe('published');
    expect(receipt.listing.taskId).toBe(input.contract.taskId);
    expect(receipt.manifestHash).toBe(contentHash(input.manifest));
    expect(receipt.package.sha256).toBe(byteHash(packageBytes));
    expect(receipt.package.byteSize).toBe(packageBytes.length);
    expect((await persistence.publishedVersion(input.contract.taskId, input.contract.version))!.packageSha256).toBe(receipt.package.sha256);
  });

  it('round-trips the private publisher output through the acceptance receiver', async () => {
    const fixture = compiledFixture(false);
    const bridgeKeys = generateKeyPairSync('ed25519');
    const transport = buildSignedReleaseTransport({
      release: fixture.input,
      transport: { eventId: randomUUID(), nonce: randomUUID(), ttlSeconds: 30 },
      verificationKey: releaseKeys.publicKey,
      bridgeSigningKey: bridgeKeys.privateKey
    });
    const { signature: envelopeSignature, ...envelopeCore } = transport.packet.envelope;
    expect(verify(null, Buffer.from(canonicalize(envelopeCore), 'utf8'), bridgeKeys.publicKey, Buffer.from(envelopeSignature, 'base64'))).toBe(true);
    const { signature: packetSignature, ...payloadCore } = transport.packet;
    expect(verify(null, Buffer.from(canonicalize(payloadCore), 'utf8'), bridgeKeys.publicKey, Buffer.from(packetSignature, 'base64'))).toBe(true);
    expect(Date.parse(transport.packet.envelope.expiresAt) - Date.now()).toBeGreaterThan(1000);
    expect(transport.packageBytes).toEqual(fixture.packageBytes);
    expect(transport.sha256).toBe(byteHash(fixture.packageBytes));
    expect(transport.packet.package.sha256).toBe(transport.sha256);
    expect(JSON.stringify(transport.packet)).not.toMatch(/intent|privateRevision|approvalActor|semanticDisclosure|privatePrompt/i);
    const persistence = new MemoryPublishedTaskPersistence();
    const receipt = await receive(transport.packet, transport.packageBytes, {
      releaseKey: createPublicKey(releaseKeys.publicKey.export({ format: 'pem', type: 'spki' })),
      bridgeKey: createPublicKey(bridgeKeys.publicKey.export({ format: 'pem', type: 'spki' })),
      claimReplay: async () => true,
      persistence, now: Date.now()
    });
    expect(receipt.outcome).toBe('published');
    expect(receipt.listing.taskId).toBe(fixture.input.contract.taskId);
    expect(receipt.manifestHash).toBe(fixture.input.manifestHash);
  });

  it('board entries derive positive projections from projectPublicListing with no extra fields', async () => {
    const { packet, packageBytes, input } = compiledFixture(true);
    const persistence = new MemoryPublishedTaskPersistence();
    const options = receiverOptions();
    await receive(packet, packageBytes, { releaseKey: options.releaseKey, bridgeKey: options.bridgeKey, claimReplay: options.claimReplay, persistence, now: now + 1_000 });
    const board = new PublishedTaskBoard(persistence);
    const entries = await board.entries();
    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry.taskId).toBe(input.contract.taskId);
    expect(entry.version).toBe(input.contract.version);
    expect(entry.disciplines).toEqual(['frontend', 'backend', 'security']);
    expect(entry.reward).toEqual({ currency: 'USD', amountMinor: 10000 });
    expect(entry.estimatedEffortMinutes).toBe(30);
    expect(entry.terms.reservationDurationSeconds).toBe(3600);
    expect(Object.keys(entry).sort()).toEqual(['disciplines', 'estimatedEffortMinutes', 'publishedAt', 'purpose', 'reward', 'schemaVersion', 'taskId', 'terms', 'title', 'version']);
  });

  it('scope shows the whole composed outcome, all nonexclusive tags and one fixed reward', async () => {
    const { packet, packageBytes, input } = compiledFixture(true);
    const persistence = new MemoryPublishedTaskPersistence();
    const options = receiverOptions();
    const receipt = await receive(packet, packageBytes, { releaseKey: options.releaseKey, bridgeKey: options.bridgeKey, claimReplay: options.claimReplay, persistence, now: now + 1_000 });
    const board = new PublishedTaskBoard(persistence);
    const scope = await board.scope(input.contract.taskId, input.contract.version);
    expect(scope.workUnits.map(unit => unit.id).sort()).toEqual(['api', 'policy', 'ui']);
    expect(scope.interfaces.map(item => item.id).sort()).toEqual(['response_policy', 'selection_http']);
    expect(scope.endToEndRequirements.map(item => item.id)).toEqual(['selection_journey']);
    expect(scope.disciplines).toEqual(['frontend', 'backend', 'security']);
    expect(scope.publicChecks.length).toBeGreaterThanOrEqual(6);
    expect(scope.reward).toEqual({ currency: 'USD', amountMinor: 10000 });
    expect(scope.terms.packageDefectCompensation.currency).toBe(scope.reward.currency);
    expect(Object.keys(scope).includes('privateRevision')).toBe(false);
    expect(Object.keys(scope).includes('intentId')).toBe(false);
    expect(receipt.listing.reward).toEqual(scope.reward);
  });

  it('serves the exact package whose bytes match every approved manifest hash on retrieval', async () => {
    const { packet, packageBytes, input } = compiledFixture(true);
    const persistence = new MemoryPublishedTaskPersistence();
    const options = receiverOptions();
    await receive(packet, packageBytes, { releaseKey: options.releaseKey, bridgeKey: options.bridgeKey, claimReplay: options.claimReplay, persistence, now: now + 1_000 });
    const board = new PublishedTaskBoard(persistence);
    const served = await board.package(input.contract.taskId, input.contract.version);
    expect(served.sha256).toBe(byteHash(packageBytes));
    expect(Buffer.from(served.bytes)).toEqual(packageBytes);
    expect(served.manifestHash).toBe(contentHash(input.manifest));
    expect(served.taskId).toBe(input.contract.taskId);
  });

  it('replaying the identical packet is idempotent and one publication stays stored', async () => {
    const { packet, packageBytes, input } = compiledFixture(false);
    const persistence = new MemoryPublishedTaskPersistence();
    const options = receiverOptions();
    const context = { releaseKey: options.releaseKey, bridgeKey: options.bridgeKey, claimReplay: options.claimReplay, persistence, now: now + 1_000 };
    const first = await receive(packet, packageBytes, context);
    const second = await receive(packet, packageBytes, context);
    expect(second.outcome).toBe('duplicate');
    expect(second.listing.taskId).toBe(first.listing.taskId);
    const board = await new PublishedTaskBoard(persistence).entries();
    expect(board).toHaveLength(1);
    expect(await persistence.allPublished()).toHaveLength(1);
    expect(options.claims).toHaveLength(1);
  });

  it('guessed board ids return the same fixed error with no stored context', async () => {
    const { packet, packageBytes, input } = compiledFixture(false);
    const persistence = new MemoryPublishedTaskPersistence();
    const options = receiverOptions();
    await receive(packet, packageBytes, { releaseKey: options.releaseKey, bridgeKey: options.bridgeKey, claimReplay: options.claimReplay, persistence, now: now + 1_000 });
    const board = new PublishedTaskBoard(persistence);
    for (const attempt of [randomUUID(), randomUUID(), randomUUID()]) {
      let thrown = null as BridgeRejected | null;
      try { await board.scope(attempt, 1); } catch (error) { thrown = error as BridgeRejected; }
      expect(thrown).toBeInstanceOf(BridgeRejected);
      expect(thrown!.code).toBe('not_published');
      expect(thrown!.message).toBe('not_published');
      expect(JSON.stringify({ code: thrown!.code })).toBe(JSON.stringify({ code: 'not_published' }));
      try { await board.package(attempt, 9); throw new Error('must reject'); } catch (error) { expect((error as BridgeRejected).code).toBe('not_published'); }
    }
    expect((await board.entries()).every(entry => entry.taskId === input.contract.taskId)).toBe(true);
  });
});
