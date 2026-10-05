import { verify } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { z } from 'zod';
import { ExternalTaskContractSchema, PublicListingSchema, SignedReleasedEnvelopeSchema, projectPublicListing } from '../../../packages/contracts/public/index.js';
import { HashSchema } from '../../../packages/contracts/common.js';
import { byteHash, canonicalize, contentHash } from '../../../packages/contracts/hash.js';
import type { ApprovedReleaseManifest, ExternalTaskContract, PublicListing } from '../../../packages/contracts/public/index.js';
import { BridgeRejected } from './types.js';
import { decodeDeterministicPackage, validateReleasedPackage } from './packaging.js';
import type { BridgeClaim, PublishResult, PublishedReleaseRecord, PublishedTaskPersistence, ReleaseClaimStore } from '../tasks/persistence.js';

export const DEFAULT_PACKAGE_MAX_BYTES = 134217728;
export const DEFAULT_MAX_TTL_MS = 900_000;

const SignatureSchema = z.string().regex(/^[A-Za-z0-9+/]{86}==$/);

const BridgePacketSchema = z.strictObject({
  schemaVersion: z.literal(1),
  envelope: SignedReleasedEnvelopeSchema,
  approvalSignature: SignatureSchema,
  package: z.strictObject({ sha256: HashSchema, byteSize: z.number().int().positive().max(DEFAULT_PACKAGE_MAX_BYTES) }),
  signature: SignatureSchema
});

export type BridgePacket = z.infer<typeof BridgePacketSchema>;

export interface ReleaseReceipt {
  outcome: 'published' | 'duplicate';
  eventId: string;
  taskId: string;
  version: number;
  manifestHash: string;
  listing: PublicListing;
  package: { sha256: string; byteSize: number };
}

/** Receiver context: only public verification keys, a claim store and the release persistence. */
export interface BridgeReceiverContext extends ReleaseClaimStore {
  releaseKey: KeyObject;
  bridgeKey: KeyObject;
  persistence: PublishedTaskPersistence;
  /** Receiver clock in milliseconds since epoch; defaults to the real clock. */
  now?: number;
  maxTtlMs?: number;
}

interface PacketModel {
  parsed: BridgePacket;
  contract: ExternalTaskContract;
  listing: PublicListing;
  manifest: ApprovedReleaseManifest;
  manifestHash: string;
  packageBytes: Uint8Array;
  payloadHash: string;
}

function parsePacket(packet: unknown): BridgePacket {
  try {
    return BridgePacketSchema.parse(packet);
  } catch {
    throw new BridgeRejected('invalid_envelope');
  }
}

function parseReleaseEnvelope(envelope: BridgePacket['envelope'], manifestHash: string): { contract: ExternalTaskContract; listing: PublicListing; manifest: ApprovedReleaseManifest } {
  try {
    const manifest = envelope.manifest;
    const contract = ExternalTaskContractSchema.parse(envelope.contract);
    const listing = PublicListingSchema.parse(envelope.listing);
    if (manifestHash !== contentHash(manifest)) throw new BridgeRejected('invalid_manifest');
    if (contentHash(contract) !== manifest.contractHash || contentHash(listing) !== manifest.listingHash || manifest.listingHash !== contentHash(projectPublicListing(contract, listing.estimatedEffortMinutes))) throw new BridgeRejected('invalid_contract');
    return { contract, listing, manifest };
  } catch (error) {
    if (error instanceof BridgeRejected) throw error;
    throw new BridgeRejected('invalid_envelope');
  }
}

function isPublicKey(key: unknown): key is KeyObject {
  return key instanceof Object && (key as KeyObject).type === 'public' && (key as KeyObject).asymmetricKeyType === 'ed25519';
}

function requirePublicKey(key: unknown): KeyObject {
  if (!isPublicKey(key)) throw new BridgeRejected('invalid_context');
  return key;
}

function canonicalWithout(value: object, stripped: string): unknown {
  const subset: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) if (key !== stripped) subset[key] = item;
  return subset;
}

function verifyPacketSignature(parsed: BridgePacket, key: KeyObject): void {
  let accepted = false;
  try {
    accepted = verify(null, Buffer.from(canonicalize(canonicalWithout(parsed, 'signature')), 'utf8'), key, Buffer.from(parsed.signature, 'base64'));
  } catch {
    accepted = false;
  }
  if (!accepted) throw new BridgeRejected('invalid_signature');
}

function verifyEnvelopeSignature(envelope: BridgePacket['envelope'], key: KeyObject): void {
  let accepted = false;
  try {
    accepted = verify(null, Buffer.from(canonicalize(canonicalWithout(envelope, 'signature')), 'utf8'), key, Buffer.from(envelope.signature, 'base64'));
  } catch {
    accepted = false;
  }
  if (!accepted) throw new BridgeRejected('invalid_signature');
}

function verifyApprovalSignature(manifest: BridgePacket['envelope']['manifest'], signature: string, key: KeyObject): void {
  let accepted = false;
  try {
    accepted = verify(null, Buffer.from(canonicalize(manifest), 'utf8'), key, Buffer.from(signature, 'base64'));
  } catch {
    accepted = false;
  }
  if (!accepted) throw new BridgeRejected('invalid_approval');
}

function buildPackageModel(parsed: BridgePacket, parsedEnvelope: { contract: ExternalTaskContract; listing: PublicListing; manifest: ApprovedReleaseManifest }, packageBytes: unknown): PacketModel {
  if (!(packageBytes instanceof Uint8Array) || packageBytes.length !== parsed.package.byteSize || byteHash(packageBytes) !== parsed.package.sha256) throw new BridgeRejected('package_mismatch');
  try {
    const entries = decodeDeterministicPackage(packageBytes);
    validateReleasedPackage(entries, parsedEnvelope);
    return { parsed, contract: parsedEnvelope.contract, listing: parsedEnvelope.listing, manifest: parsedEnvelope.manifest, manifestHash: parsed.envelope.manifestHash, packageBytes, payloadHash: byteHash(Buffer.from(canonicalize(parsed), 'utf8')) };
  } catch (error) {
    if (error instanceof BridgeRejected) throw error;
    throw new BridgeRejected('package_integrity');
  }
}

export async function receive(packet: unknown, packageBytes: unknown, context: BridgeReceiverContext): Promise<ReleaseReceipt> {
  const parsed = parsePacket(packet);
  const bridgeKey = requirePublicKey(context.bridgeKey);
  const releaseKey = requirePublicKey(context.releaseKey);
  verifyPacketSignature(parsed, bridgeKey);
  verifyEnvelopeSignature(parsed.envelope, bridgeKey);
  verifyApprovalSignature(parsed.envelope.manifest, parsed.approvalSignature, releaseKey);
  const parsedEnvelope = parseReleaseEnvelope(parsed.envelope, parsed.envelope.manifestHash);
  const now = context.now ?? Date.now();
  const expiresAt = Date.parse(parsed.envelope.expiresAt);
  if (!(Number.isFinite(expiresAt) && expiresAt > now)) throw new BridgeRejected('expired');
  if (expiresAt - now > (context.maxTtlMs ?? DEFAULT_MAX_TTL_MS)) throw new BridgeRejected('invalid_envelope');
  const prepared = buildPackageModel(parsed, parsedEnvelope, packageBytes ?? new Uint8Array(0));
  const claim: BridgeClaim = { eventId: parsed.envelope.eventId, nonce: parsed.envelope.nonce, payloadHash: prepared.payloadHash, expiresAt: parsed.envelope.expiresAt };
  const prior = await readPublished(context, claim.eventId);
  if (prior && prior.payloadHash === prepared.payloadHash && prior.manifestHash === prepared.manifestHash && prior.manifest.taskId === prepared.manifest.taskId && prior.manifest.version === prepared.manifest.version) {
    return receipt('duplicate', prior);
  }
  let fresh: boolean = false;
  try {
    fresh = await context.claimReplay(claim);
  } catch {
    throw new BridgeRejected('persistence_unavailable');
  }
  if (!fresh) {
    const rechecked = await readPublished(context, claim.eventId);
    if (rechecked && rechecked.payloadHash === prepared.payloadHash && rechecked.manifestHash === prepared.manifestHash) return receipt('duplicate', rechecked);
    throw new BridgeRejected('replay');
  }
  let result: PublishResult;
  try {
    result = await context.persistence.publish({
      eventId: claim.eventId,
      nonce: claim.nonce,
      payloadHash: claim.payloadHash,
      expiresAt: claim.expiresAt,
      manifestHash: parsed.envelope.manifestHash,
      manifest: prepared.manifest,
      contract: prepared.contract,
      listing: prepared.listing,
      packageSha256: parsed.package.sha256,
      packageBytes: prepared.packageBytes
    });
  } catch (error) {
    if (error instanceof BridgeRejected) throw error;
    throw new BridgeRejected('persistence_unavailable');
  }
  return receipt(result.outcome, result.record);
}

async function readPublished(context: BridgeReceiverContext, eventId: string): Promise<PublishedReleaseRecord | null> {
  try {
    return await context.persistence.published(eventId);
  } catch {
    throw new BridgeRejected('persistence_unavailable');
  }
}

function receipt(outcome: 'published' | 'duplicate', record: PublishedReleaseRecord): ReleaseReceipt {
  return {
    outcome,
    eventId: record.eventId,
    taskId: record.manifest.taskId,
    version: record.manifest.version,
    manifestHash: record.manifestHash,
    listing: record.listing,
    package: { sha256: record.packageSha256, byteSize: record.packageByteSize }
  };
}
