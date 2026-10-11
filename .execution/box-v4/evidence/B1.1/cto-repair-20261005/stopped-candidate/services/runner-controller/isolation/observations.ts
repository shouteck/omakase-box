import { z } from 'zod';
import { SignedResultSchema } from '../../../packages/runner-protocol/index.js';

/**
 * Classifier for records that arrive back through the broker channel. The
 * ONLY artifact with verdict authority is a record that passes
 * verifyTrustedResult (Ed25519 + full job/lease binding). This module
 * never promotes anything else: unsigned supervisor faults are honest
 * 'unverified' evidence, auxiliary observations are informational metadata
 * that can be logged but must never influence a verdict.
 */

export type GuestRecordKind =
  | 'signed_result'      // {result, signature} — candidate for verifyTrustedResult
  | 'signed_result_aux'  // signed result plus unsigned supervisor observations
  | 'supervisor_fault'   // unsigned {protocolVersion, status:'unverified', code}
  | 'unrecognized';      // anything else — treated as corruption

const FaultSchema = z.strictObject({
  protocolVersion: z.literal(1),
  status: z.literal('unverified'),
  code: z.string().regex(/^[a-z_]{1,64}$/),
}).catchall(z.unknown());

const AuxSchema = z.strictObject({
  result: z.unknown(),
  signature: z.string(),
  observations: z.unknown(),
});

export function classifyGuestRecord(input: unknown): { kind: GuestRecordKind; signed?: unknown; fault?: string; observations?: unknown } {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return { kind: 'unrecognized' };
  const keys = Object.keys(input).sort();
  if (keys.length === 2 && keys[0] === 'result' && keys[1] === 'signature') {
    const signed = SignedResultSchema.safeParse(input);
    return signed.success ? { kind: 'signed_result', signed: signed.data } : { kind: 'unrecognized' };
  }
  if (keys.length === 3 && keys[0] === 'observations' && keys[1] === 'result' && keys[2] === 'signature') {
    const aux = AuxSchema.safeParse(input);
    if (!aux.success) return { kind: 'unrecognized' };
    const signed = SignedResultSchema.safeParse({ result: aux.data.result, signature: aux.data.signature });
    if (!signed.success) return { kind: 'unrecognized' };
    return { kind: 'signed_result_aux', signed: signed.data, observations: aux.data.observations };
  }
  const fault = FaultSchema.safeParse(input);
  if (fault.success) return { kind: 'supervisor_fault', fault: fault.data.code };
  return { kind: 'unrecognized' };
}

/**
 * Verdict semantics: only 'signed_result'/'signed_result_aux' may be handed
 * to verifyTrustedResult; every other kind maps to 'unverified' — the only
 * non-authoritative bucket the private side is allowed to record.
 */
export function verdictAuthority(classification: { kind: GuestRecordKind }): 'verifiable' | 'unverified' {
  return classification.kind === 'signed_result' || classification.kind === 'signed_result_aux' ? 'verifiable' : 'unverified';
}

/** Structured projection safe to attach to private records — never raw bytes. */
export function observationSummary(observations: unknown): Record<string, unknown> {
  if (observations === null || typeof observations !== 'object' || Array.isArray(observations)) return { present: observations !== undefined && observations !== null };
  const entries = Object.keys(observations as Record<string, unknown>).sort();
  return { present: true, fields: entries.slice(0, 16) };
}
