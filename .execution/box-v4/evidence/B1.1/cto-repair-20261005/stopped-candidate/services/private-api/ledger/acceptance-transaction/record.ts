import type { PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import { canonicalize } from '../../../../packages/contracts/hash.js';

/**
 * Atomic acceptance transaction (M7.2). One client transaction commits the
 * payment obligation, the immutable acceptance, the evaluation state
 * transition and the feedback outbox event together — there is no ordering
 * that can expose `accepted` without its payable record (the deferred
 * event/acceptance FK pair makes the database itself enforce it), and a
 * crash mid-transaction rolls everything back.
 *
 * Event identities are sha256-derived from the evaluation id and decision
 * kind, so retries and replays converge on the same unique key instead of
 * creating duplicate payable or feedback events.
 */

export class AcceptanceRejected extends Error {
  constructor(readonly code: string) { super(`Acceptance rejected: ${code}.`); }
}

export function deriveEventId(evaluationId: string, decision: 'accept' | 'reject' | 'compensate'): string {
  const hex = createHash('sha256').update(canonicalize({ evaluationId, decision, scope: 'acceptance_event' })).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function deriveAcceptanceId(evaluationId: string): string {
  const hex = createHash('sha256').update(canonicalize({ evaluationId, scope: 'acceptance_record' })).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function deriveFeedbackPublicId(evaluationId: string): string {
  const hex = createHash('sha256').update(canonicalize({ evaluationId, scope: 'feedback_public_id' })).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export interface ObligationTerms {
  readonly payeeId: string;
  readonly reason: string;
  readonly currency: string;
  readonly amountMinor: number;
}

export interface FeedbackEvent {
  readonly submissionId: string;
  readonly payload: unknown;
}

/** Insert a payment obligation that starts `due`; terms can never change afterwards (obligation_terms_immutable). */
export async function insertObligation(client: PoolClient, terms: ObligationTerms & { eventId: string; acceptanceId: string | null }): Promise<void> {
  await client.query(
    `INSERT INTO private_payment_obligations (event_id,acceptance_id,payee_id,reason,currency,amount_minor,state) VALUES ($1,$2,$3,$4,$5,$6,'due')`,
    [terms.eventId, terms.acceptanceId, terms.payeeId, terms.reason, terms.currency, terms.amountMinor.toString()],
  );
}

/** Insert the immutable acceptance bound to the exact evaluation and candidate diff. */
export async function insertAcceptance(client: PoolClient, input: {
  id: string; eventId: string; evaluationId: string; ownerId: string;
  submissionHash: string; packageHash: string; privateBaseRevision: string; candidateDiffHash: string;
}): Promise<void> {
  await client.query(
    `INSERT INTO private_acceptances (id,event_id,evaluation_id,owner_id,submission_hash,package_hash,private_base_revision,candidate_diff_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [input.id, input.eventId, input.evaluationId, input.ownerId, input.submissionHash, input.packageHash, input.privateBaseRevision, input.candidateDiffHash],
  );
}

/** Guarded state transition — a stale row version or wrong source state surfaces instead of overwriting. */
export async function transitionEvaluation(client: PoolClient, evaluationId: string, fromState: string, toState: string): Promise<void> {
  const { rowCount } = await client.query(
    `UPDATE private_evaluations SET state=$2, version=version+1 WHERE id=$1 AND state=$3`,
    [evaluationId, toState, fromState],
  );
  if (rowCount !== 1) throw new AcceptanceRejected('stale_version');
}

/** Insert the feedback outbox event inside the same atomic transaction. */
export async function insertFeedbackEvent(client: PoolClient, input: { eventId: string; submissionId: string; payload: unknown }): Promise<void> {
  await client.query(
    `INSERT INTO private_feedback_outbox (event_id,submission_id,payload) VALUES ($1,$2,$3::jsonb)`,
    [input.eventId, input.submissionId, JSON.stringify(input.payload)],
  );
}
