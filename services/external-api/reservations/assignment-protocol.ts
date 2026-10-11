import { createPublicKey, verify, type KeyObject } from 'node:crypto';
import { z } from 'zod';
import { HashSchema, OpaqueIdSchema, VersionSchema } from '../../../packages/contracts/common.js';
import { canonicalize } from '../../../packages/contracts/hash.js';

export const AssignmentExecutorSchema = z.strictObject({ kind: z.enum(['human', 'ai', 'team']), label: z.string().min(3).max(120).refine(value => value === value.trim()), contributorId: OpaqueIdSchema.optional() }).superRefine((value, context) => {
  if ((value.kind === 'human') !== (value.contributorId !== undefined)) context.addIssue({ code: 'custom', message: 'Invalid executor recipient.' });
});
export const AssignmentChoiceSchema = z.strictObject({ taskId: OpaqueIdSchema, taskVersion: VersionSchema, packageDigest: HashSchema, idempotencyKey: OpaqueIdSchema, executor: AssignmentExecutorSchema });
/** Owner-issued one-time invitation binding; the plaintext token never leaves the private service. */
export const AssignmentInvitationSchema = z.strictObject({ contributorId: OpaqueIdSchema, tokenHash: HashSchema, expiresAt: z.iso.datetime() });
export const AssignmentCommandSchema = z.strictObject({ schemaVersion: z.literal(1), audience: z.literal('external-assignment/v1'), eventId: OpaqueIdSchema, nonce: OpaqueIdSchema, assignmentId: OpaqueIdSchema, taskId: OpaqueIdSchema, taskVersion: VersionSchema, packageDigest: HashSchema, executor: AssignmentExecutorSchema, invitation: AssignmentInvitationSchema.optional(), issuedAt: z.iso.datetime(), expiresAt: z.iso.datetime() }).superRefine((value, context) => {
  if ((value.executor.kind === 'human') !== (value.invitation !== undefined)) context.addIssue({ code: 'custom', message: 'Invalid invitation binding.' });
  if (value.invitation && (value.invitation.contributorId !== value.executor.contributorId || Date.parse(value.invitation.expiresAt) <= Date.parse(value.issuedAt))) context.addIssue({ code: 'custom', message: 'Invalid invitation binding.' });
});
export const InvitationRevocationSchema = z.strictObject({ schemaVersion: z.literal(1), audience: z.literal('external-assignment-invitation-revocation/v1'), eventId: OpaqueIdSchema, nonce: OpaqueIdSchema, assignmentId: OpaqueIdSchema, taskId: OpaqueIdSchema, taskVersion: VersionSchema, packageDigest: HashSchema, contributorId: OpaqueIdSchema, tokenHash: HashSchema, issuedAt: z.iso.datetime(), expiresAt: z.iso.datetime() });
const SignatureSchema = z.string().regex(/^[A-Za-z0-9+/]{86}==$/);
export const SignedAssignmentCommandSchema = z.strictObject({ payload: AssignmentCommandSchema, signature: SignatureSchema });
export const SignedRevocationCommandSchema = z.strictObject({ payload: InvitationRevocationSchema, signature: SignatureSchema });
/** Envelope-only packet shape for trusted transport storage; full semantics are verified per audience before use. */
export const SignedCommandPacketSchema = z.strictObject({ payload: z.looseObject({ schemaVersion: z.literal(1), audience: z.string(), eventId: OpaqueIdSchema, nonce: OpaqueIdSchema, issuedAt: z.iso.datetime(), expiresAt: z.iso.datetime() }), signature: SignatureSchema });
export const COMMAND_PAYLOAD_SCHEMAS = { 'external-assignment/v1': AssignmentCommandSchema, 'external-assignment-invitation-revocation/v1': InvitationRevocationSchema } as const;
export type AssignmentCommandAudience = keyof typeof COMMAND_PAYLOAD_SCHEMAS;
export type AssignmentCommand = z.infer<typeof AssignmentCommandSchema>;
export type InvitationRevocationCommand = z.infer<typeof InvitationRevocationSchema>;
export type SignedAssignmentCommand = z.infer<typeof SignedAssignmentCommandSchema>;
export type SignedCommandPacket = z.infer<typeof SignedCommandPacketSchema>;
export class AssignmentCommandRejected extends Error {
  constructor(readonly code: 'invalid_command' | 'expired' | 'replay' | 'task_unavailable' | 'assignment_conflict' | 'persistence_unavailable') { super(code); }
}

export function assignmentPublicKey(verificationKey: KeyObject | string | Buffer): KeyObject {
  const encodedKey = typeof verificationKey === 'string' ? verificationKey : Buffer.isBuffer(verificationKey) ? verificationKey.toString('utf8') : null;
  if (encodedKey !== null && (encodedKey.length > 4096 || !/^-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+-----END PUBLIC KEY-----\s*$/.test(encodedKey.trim()))) throw new AssignmentCommandRejected('invalid_command');
  const key = encodedKey === null ? verificationKey as KeyObject : createPublicKey(encodedKey);
  if (key.type !== 'public' || key.asymmetricKeyType !== 'ed25519') throw new AssignmentCommandRejected('invalid_command');
  return key;
}

/** Shared envelope verification: strict packet shape, fresh IDs, Ed25519 signature and bounded lifetime. No audience semantics. */
export function verifyCommandEnvelope(input: unknown, verificationKey: KeyObject | string | Buffer, nowMs: number): SignedCommandPacket['payload'] {
  const packet = SignedCommandPacketSchema.parse(input);
  const key = assignmentPublicKey(verificationKey);
  if (packet.payload.eventId === packet.payload.nonce) throw new AssignmentCommandRejected('invalid_command');
  const bytes = Buffer.from(canonicalize(packet.payload));
  if (bytes.length > 8192 || !verify(null, bytes, key, Buffer.from(packet.signature, 'base64'))) throw new AssignmentCommandRejected('invalid_command');
  const issuedAt = Date.parse(packet.payload.issuedAt), expiresAt = Date.parse(packet.payload.expiresAt);
  if (!Number.isFinite(nowMs) || issuedAt > nowMs + 5000 || expiresAt <= issuedAt || expiresAt - issuedAt > 300000) throw new AssignmentCommandRejected('invalid_command');
  if (expiresAt <= nowMs) throw new AssignmentCommandRejected('expired');
  return packet.payload;
}

export function verifyAssignmentCommand(input: unknown, verificationKey: KeyObject | string | Buffer, nowMs = Date.now()): AssignmentCommand {
  try {
    const payload = verifyCommandEnvelope(input, verificationKey, nowMs);
    if (payload.audience !== 'external-assignment/v1') throw new AssignmentCommandRejected('invalid_command');
    return AssignmentCommandSchema.parse(payload);
  } catch (error) { throw error instanceof AssignmentCommandRejected ? error : new AssignmentCommandRejected('invalid_command'); }
}

export function verifyRevocationCommand(input: unknown, verificationKey: KeyObject | string | Buffer, nowMs = Date.now()): InvitationRevocationCommand {
  try {
    const payload = verifyCommandEnvelope(input, verificationKey, nowMs);
    if (payload.audience !== 'external-assignment-invitation-revocation/v1') throw new AssignmentCommandRejected('invalid_command');
    return InvitationRevocationSchema.parse(payload);
  } catch (error) { throw error instanceof AssignmentCommandRejected ? error : new AssignmentCommandRejected('invalid_command'); }
}
