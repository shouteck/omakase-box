import { createPrivateKey, sign, verify, type KeyObject } from 'node:crypto';
import { z } from 'zod';
import { HashSchema, OpaqueIdSchema, VersionSchema } from '../../../packages/contracts/common.js';
import { canonicalize, contentHash } from '../../../packages/contracts/hash.js';
import { assignmentPublicKey } from './assignment-protocol.js';

/** Common bound fields every deliverable assignment command carries; kind-specific fields are covered by commandHash. */
const ReceiptCommandSchema = z.looseObject({ schemaVersion: z.literal(1), audience: z.string(), eventId: OpaqueIdSchema, nonce: OpaqueIdSchema, assignmentId: OpaqueIdSchema, taskId: OpaqueIdSchema, taskVersion: VersionSchema, packageDigest: HashSchema, issuedAt: z.iso.datetime(), expiresAt: z.iso.datetime() });
export type ReceiptCommand = z.infer<typeof ReceiptCommandSchema>;
const ResultSchema = z.strictObject({ schemaVersion: z.literal(1).optional(), assignmentId: OpaqueIdSchema, taskId: OpaqueIdSchema, taskVersion: VersionSchema, status: z.literal('recorded'), duplicate: z.boolean() });
export const AssignmentReceiptSchema = z.strictObject({ schemaVersion: z.literal(1), audience: z.literal('external-assignment-receipt/v1'), eventId: OpaqueIdSchema, nonce: OpaqueIdSchema, assignmentId: OpaqueIdSchema, taskId: OpaqueIdSchema, taskVersion: VersionSchema, packageDigest: HashSchema, commandHash: HashSchema, status: z.literal('recorded'), duplicate: z.boolean(), recordedAt: z.iso.datetime(), expiresAt: z.iso.datetime() });
export const SignedAssignmentReceiptSchema = z.strictObject({ payload: AssignmentReceiptSchema, signature: z.string().regex(/^[A-Za-z0-9+/]{86}==$/) });
export type SignedAssignmentReceipt = z.infer<typeof SignedAssignmentReceiptSchema>;
export class AssignmentReceiptRejected extends Error { constructor(readonly code: 'invalid_receipt' | 'expired') { super(code); } }

export function signAssignmentReceipt(command: ReceiptCommand, result: z.infer<typeof ResultSchema>, signingKey: KeyObject | string | Buffer, nowMs = Date.now()): SignedAssignmentReceipt {
  try {
    const value = ReceiptCommandSchema.parse(command), recorded = ResultSchema.parse(result);
    const key = typeof signingKey === 'string' || Buffer.isBuffer(signingKey) ? createPrivateKey(signingKey) : signingKey;
    if (key.type !== 'private' || key.asymmetricKeyType !== 'ed25519' || recorded.assignmentId !== value.assignmentId || recorded.taskId !== value.taskId || recorded.taskVersion !== value.taskVersion || !Number.isFinite(nowMs) || nowMs < Date.parse(value.issuedAt) - 5000) throw new AssignmentReceiptRejected('invalid_receipt');
    if (Date.parse(value.expiresAt) <= nowMs) throw new AssignmentReceiptRejected('expired');
    const payload = AssignmentReceiptSchema.parse({ schemaVersion: 1, audience: 'external-assignment-receipt/v1', eventId: value.eventId, nonce: value.nonce, assignmentId: value.assignmentId, taskId: value.taskId, taskVersion: value.taskVersion, packageDigest: value.packageDigest, commandHash: contentHash(value), status: 'recorded', duplicate: recorded.duplicate, recordedAt: new Date(nowMs).toISOString(), expiresAt: new Date(Math.min(nowMs + 300000, Date.parse(value.expiresAt))).toISOString() });
    return { payload, signature: sign(null, Buffer.from(canonicalize(payload)), key).toString('base64') };
  } catch (error) { throw error instanceof AssignmentReceiptRejected ? error : new AssignmentReceiptRejected('invalid_receipt'); }
}

export function verifyAssignmentReceipt(input: unknown, verificationKey: KeyObject | string | Buffer, command: ReceiptCommand, nowMs = Date.now()) {
  try {
    const packet = SignedAssignmentReceiptSchema.parse(input), expected = ReceiptCommandSchema.parse(command);
    const key = assignmentPublicKey(verificationKey);
    if (!verify(null, Buffer.from(canonicalize(packet.payload)), key, Buffer.from(packet.signature, 'base64'))) throw new AssignmentReceiptRejected('invalid_receipt');
    const receipt = packet.payload;
    if (receipt.eventId !== expected.eventId || receipt.nonce !== expected.nonce || receipt.assignmentId !== expected.assignmentId || receipt.taskId !== expected.taskId || receipt.taskVersion !== expected.taskVersion || receipt.packageDigest !== expected.packageDigest || receipt.commandHash !== contentHash(expected)) throw new AssignmentReceiptRejected('invalid_receipt');
    const recorded = Date.parse(receipt.recordedAt), expires = Date.parse(receipt.expiresAt);
    if (!Number.isFinite(nowMs) || recorded > nowMs + 5000 || recorded < Date.parse(expected.issuedAt) - 5000 || expires <= recorded || expires > Date.parse(expected.expiresAt) || expires - recorded > 300000) throw new AssignmentReceiptRejected('invalid_receipt');
    if (expires <= nowMs) throw new AssignmentReceiptRejected('expired');
    return receipt;
  } catch (error) { throw error instanceof AssignmentReceiptRejected ? error : new AssignmentReceiptRejected('invalid_receipt'); }
}
