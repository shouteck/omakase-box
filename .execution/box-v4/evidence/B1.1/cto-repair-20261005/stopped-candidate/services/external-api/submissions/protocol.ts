import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';
import { z } from 'zod';
import { HashSchema, OpaqueIdSchema, TimestampSchema } from '../../../packages/contracts/common.js';
import { canonicalize } from '../../../packages/contracts/hash.js';
import { AttemptPermitPayloadSchema, type AttemptPermitPayload } from './envelope.js';

const SignatureSchema = z.string().min(1).max(4096);

export const SignedPermitSchema = AttemptPermitPayloadSchema.extend({ signature: SignatureSchema });
export type SignedPermit = z.infer<typeof SignedPermitSchema>;

export function signAttemptPermit(payload: AttemptPermitPayload, signingKey: KeyObject | string | Buffer): SignedPermit {
  return { ...payload, signature: signPayload(payload, signingKey).signature };
}

export const ExportPullSchema = z.strictObject({ schemaVersion: z.literal(1), audience: z.literal('external-submission-export/v1'), eventId: OpaqueIdSchema, nonce: OpaqueIdSchema, issuedAt: TimestampSchema, expiresAt: TimestampSchema });
export const ExportAckSchema = z.strictObject({ schemaVersion: z.literal(1), audience: z.literal('external-submission-export-ack/v1'), eventId: OpaqueIdSchema, nonce: OpaqueIdSchema, permitId: OpaqueIdSchema, payloadHash: HashSchema, issuedAt: TimestampSchema, expiresAt: TimestampSchema });
export type ExportPull = z.infer<typeof ExportPullSchema>;
export type ExportAck = z.infer<typeof ExportAckSchema>;

export const SignedRequestSchema = z.strictObject({
  payload: z.looseObject({ schemaVersion: z.literal(1), audience: z.string(), eventId: OpaqueIdSchema, nonce: OpaqueIdSchema, issuedAt: TimestampSchema, expiresAt: TimestampSchema }),
  signature: SignatureSchema,
});
export type SignedRequest = z.infer<typeof SignedRequestSchema>;

export const REQUEST_PAYLOAD_SCHEMAS = {
  'external-submission-export/v1': ExportPullSchema,
  'external-submission-export-ack/v1': ExportAckSchema,
} as const;

export class SubmissionProtocolRejected extends Error {
  constructor(readonly code: 'invalid_permit' | 'invalid_request' | 'request_expired' | 'replay') {
    super(code);
    this.name = 'SubmissionProtocolRejected';
  }
}

export function submissionPublicKey(verificationKey: KeyObject | string | Buffer): KeyObject {
  const key = typeof verificationKey === 'string' || Buffer.isBuffer(verificationKey) ? createPublicKey(verificationKey) : verificationKey;
  if (key.type !== 'public' || key.asymmetricKeyType !== 'ed25519') throw new SubmissionProtocolRejected('invalid_request');
  return key;
}

export function signPayload(payload: object, signingKey: KeyObject | string | Buffer): { payload: object; signature: string } {
  const key = typeof signingKey === 'string' || Buffer.isBuffer(signingKey) ? createPrivateKey(signingKey) : signingKey;
  if (key.type !== 'private' || key.asymmetricKeyType !== 'ed25519') throw new SubmissionProtocolRejected('invalid_request');
  return { payload, signature: sign(null, Buffer.from(canonicalize(payload)), key).toString('base64') };
}

function verifySigned(input: unknown, verificationKey: KeyObject | string | Buffer, nowMs: number): Record<string, unknown> {
  const packet = SignedRequestSchema.safeParse(input);
  if (!packet.success) throw new SubmissionProtocolRejected('invalid_request');
  const payload = packet.data.payload as Record<string, unknown>;
  if (!verify(null, Buffer.from(canonicalize(payload)), submissionPublicKey(verificationKey), Buffer.from(packet.data.signature, 'base64'))) {
    throw new SubmissionProtocolRejected('invalid_request');
  }
  if (payload['eventId'] === payload['nonce']) throw new SubmissionProtocolRejected('invalid_request');
  if (!Number.isFinite(nowMs) || nowMs < Date.parse(payload['issuedAt'] as string) - 5000 || nowMs > Date.parse(payload['expiresAt'] as string)) {
    throw new SubmissionProtocolRejected('request_expired');
  }
  return payload;
}

export function verifyExportRequest(input: unknown, verificationKey: KeyObject | string | Buffer, nowMs = Date.now()): ExportPull | ExportAck {
  const payload = verifySigned(input, verificationKey, nowMs);
  const audience = payload['audience'] as keyof typeof REQUEST_PAYLOAD_SCHEMAS;
  const schema = REQUEST_PAYLOAD_SCHEMAS[audience];
  if (!schema) throw new SubmissionProtocolRejected('invalid_request');
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new SubmissionProtocolRejected('invalid_request');
  return parsed.data;
}

export function verifyAttemptPermit(input: unknown, verificationKey: KeyObject | string | Buffer, nowMs = Date.now()): AttemptPermitPayload {
  const packet = SignedPermitSchema.safeParse(input);
  if (!packet.success) throw new SubmissionProtocolRejected('invalid_permit');
  const { signature, ...payload } = packet.data;
  if (!verify(null, Buffer.from(canonicalize(payload)), submissionPublicKey(verificationKey), Buffer.from(signature, 'base64'))) {
    throw new SubmissionProtocolRejected('invalid_permit');
  }
  if (payload.eventId === payload.nonce) throw new SubmissionProtocolRejected('invalid_permit');
  if (nowMs < Date.parse(payload.issuedAt) - 5000 || nowMs > Date.parse(payload.expiresAt)) throw new SubmissionProtocolRejected('request_expired');
  return payload;
}
