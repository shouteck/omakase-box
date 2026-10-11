import type { FastifyReply } from 'fastify';
import { WorkflowError } from '../../../packages/contracts/workflow/index.js';
import { permits } from '../../../packages/contracts/auth/policy.js';
import type { SessionActor } from '../../../packages/contracts/auth/store.js';

/** Bounded shared vocabulary for the private evaluation job lifecycle. */

export const PROFILE = 'dedicated-linux-kvm-fresh-vm' as const;
export const LOG_BYTE_LIMIT = 1048576;
export const RESULT_RECORD_LIMIT = 64;
export const DEADLINE_WINDOW_MS = 120000;
export const ANOMALY_PAYLOAD_LIMIT = 65536;

export type JobKind = 'public' | 'private';
export type JobState = 'queued' | 'running' | 'completed' | 'cancelled';
export type EvidenceClass = 'verified' | 'unverified' | 'infrastructure';
export type ResultOutcome = 'passed' | 'failed' | 'unverified' | 'infrastructure';
export type InterruptionCause = 'interrupted' | 'lease_lost' | 'runner_unavailable';

export const INTERRUPTION_CAUSES: readonly InterruptionCause[] = Object.freeze(['interrupted', 'lease_lost', 'runner_unavailable']);

export class JobInvalid extends Error {
  constructor(readonly code: string) { super(code); }
}
export class JobBindingConflict extends Error {
  constructor(readonly code = 'job_binding_conflict') { super(code); }
}
export class JobStoreUnavailable extends Error {
  constructor() { super('resource_unavailable'); }
}

/** Safe allowlisted projection error mapping; never leaks private detail. */
export type ProjectedJobError = { status: number; error: string };
export function projectJobError(error: unknown): ProjectedJobError {
  if (error instanceof WorkflowError) {
    if (error.code === 'forbidden_role') return { status: 403, error: 'forbidden_role' };
    if (error.code === 'stale_version') return { status: 409, error: 'stale_version' };
    if (error.code === 'missing_evidence') return { status: 422, error: 'missing_evidence' };
    return { status: 409, error: error.code };
  }
  if (error instanceof JobInvalid) return { status: 422, error: 'invalid_job_input' };
  if (error instanceof JobBindingConflict) return { status: 409, error: 'job_binding_conflict' };
  if (error instanceof Error && 'code' in error && typeof (error as { code?: unknown }).code === 'string' && ['23505'].includes(String((error as { code?: unknown }).code))) return { status: 409, error: 'stale_version' };
  return { status: 503, error: 'resource_unavailable' };
}
export function sendSafeJobError(reply: FastifyReply, error: unknown) { reply.code(projectJobError(error).status).send({ error: projectJobError(error).error }); }

/** Job operations follow the application permission policy; only evaluation operators act. */
export function assertJobOperator(actor: unknown): asserts actor is SessionActor {
  const candidate = actor as Partial<SessionActor> | null | undefined;
  const shaped = candidate !== null && typeof candidate === 'object' && typeof candidate.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate.id) && typeof candidate.sessionHash === 'string' && /^[a-f0-9]{64}$/.test(candidate.sessionHash) && typeof candidate.csrfHash === 'string' && /^[a-f0-9]{64}$/.test(candidate.csrfHash) && typeof candidate.role === 'string';
  if (!shaped || !permits('private', candidate!.role, 'evaluation.operate')) throw new WorkflowError('forbidden_role');
}
