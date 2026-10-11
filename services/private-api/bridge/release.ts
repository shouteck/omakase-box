import { sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { z } from 'zod';
import { ApprovedReleaseManifestSchema, ExternalTaskContractSchema, PublicListingSchema, SignedReleasedEnvelopeSchema } from '../../../packages/contracts/public/index.js';
import { compileApprovedRelease } from '../../../packages/compiler/index.js';
import { OpaqueIdSchema } from '../../../packages/contracts/common.js';
import { canonicalize } from '../../../packages/contracts/hash.js';

export const PUBLISHED_ENVELOPE_TTL_SECONDS = 300;
export const MIN_TTL_SECONDS = 15;
export const MAX_TTL_SECONDS = 900;

const TTLSecondsSchema = z.number().int().min(MIN_TTL_SECONDS).max(MAX_TTL_SECONDS);

const TransportSpecSchema = z.strictObject({
  eventId: OpaqueIdSchema,
  nonce: OpaqueIdSchema,
  ttlSeconds: TTLSecondsSchema.optional()
});

/** Reconstructable verifier: public release key. Signer: private release/bridge key. */
const ReleaseTransportInputSchema = z.strictObject({
  release: z.unknown(),
  transport: TransportSpecSchema,
  verificationKey: z.custom<KeyObject | string | Buffer>(key => isVerificationKey(key)),
  bridgeSigningKey: z.custom<KeyObject | string | Buffer>(key => isSigningKey(key))
});

export interface ReleaseTransportOutput {
  packet: {
    schemaVersion: 1;
    envelope: {
      schemaVersion: 1;
      eventId: string;
      nonce: string;
      expiresAt: string;
      manifest: unknown;
      manifestHash: string;
      contract: unknown;
      listing: unknown;
      signature: string;
    };
    approvalSignature: string;
    package: { sha256: string; byteSize: number };
    signature: string;
  };
  packageBytes: Uint8Array;
  sha256: string;
  manifestHash: string;
  eventId: string;
  nonce: string;
  expiresAt: string;
}

export class ReleaseTransportInvalid extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ReleaseTransportInvalid';
  }
}

function isKeyObject(value: unknown): value is KeyObject {
  return value instanceof Object && typeof (value as KeyObject).type === 'string' && typeof (value as KeyObject).asymmetricKeyType === 'string';
}

function isVerificationKey(key: unknown): boolean {
  if (typeof key === 'string' || Buffer.isBuffer(key)) return true;
  return isKeyObject(key) && (key as KeyObject).type === 'public' && (key as KeyObject).asymmetricKeyType === 'ed25519';
}

function isSigningKey(key: unknown): boolean {
  if (typeof key === 'string' || Buffer.isBuffer(key)) return true;
  return isKeyObject(key) && (key as KeyObject).type === 'private' && (key as KeyObject).asymmetricKeyType === 'ed25519';
}

function approvedReleaseSetObject(input: unknown): Record<string, unknown> {
  const keys = ['manifest', 'manifestHash', 'signature', 'contract', 'listing', 'feedbackPolicy', 'paymentTerms', 'assets'];
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new ReleaseTransportInvalid('invalid_release_set');
  const candidate = input as Record<string, unknown>;
  if (Object.keys(candidate).length !== keys.length || keys.some(key => !Object.hasOwn(candidate, key))) throw new ReleaseTransportInvalid('invalid_release_set');
  return candidate;
}

/**
 * Constructs the signed bridge transport for an approved release set. The
 * approved-only deterministic compiler revalidates every schema, hash and
 * approval-signature binding, and the returned packet carries exactly the
 * released public envelope fields; surplus private release fields never pass
 * the strict schemas, neither on the private nor on the receiving side.
 */
export function buildSignedReleaseTransport(input: unknown): ReleaseTransportOutput {
  try {
    const request = ReleaseTransportInputSchema.parse(input);
    approvedReleaseSetObject(request.release);
    const artifact = compileApprovedRelease(request.release, request.verificationKey);
    if (request.transport.eventId === request.transport.nonce) throw new ReleaseTransportInvalid('invalid_release_set');
    const ttlSeconds = request.transport.ttlSeconds ?? PUBLISHED_ENVELOPE_TTL_SECONDS;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const envelopeCore = { schemaVersion: 1, eventId: request.transport.eventId, nonce: request.transport.nonce, expiresAt, manifest: (request.release as Record<string, unknown>).manifest, manifestHash: (request.release as Record<string, unknown>).manifestHash, contract: (request.release as Record<string, unknown>).contract, listing: (request.release as Record<string, unknown>).listing };
    const envelopeSignature = sign(null, Buffer.from(canonicalize(envelopeCore), 'utf8'), request.bridgeSigningKey).toString('base64');
    const envelope = { ...envelopeCore, signature: envelopeSignature };
    SignedReleasedEnvelopeSchema.parse(envelope);
    ExternalTaskContractSchema.parse(envelope.contract);
    PublicListingSchema.parse(envelope.listing);
    ApprovedReleaseManifestSchema.parse(envelope.manifest);
    const payload = { schemaVersion: 1, envelope, approvalSignature: (request.release as Record<string, unknown>).signature, package: { sha256: artifact.sha256, byteSize: artifact.bytes.length } };
    const packetSignature = sign(null, Buffer.from(canonicalize(payload), 'utf8'), request.bridgeSigningKey).toString('base64');
    return {
      packet: { ...payload, signature: packetSignature } as ReleaseTransportOutput['packet'],
      packageBytes: artifact.bytes,
      sha256: artifact.sha256,
      manifestHash: (request.release as Record<string, unknown>).manifestHash as string,
      eventId: request.transport.eventId,
      nonce: request.transport.nonce,
      expiresAt
    };
  } catch (error) {
    if (error instanceof ReleaseTransportInvalid) throw error;
    throw new ReleaseTransportInvalid('invalid_release_set');
  }
}
