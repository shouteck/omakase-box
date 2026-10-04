import type { Pool, PoolClient } from 'pg';
import { PublicFeedbackSchema } from '../../../packages/contracts/public/submission.js';
import type { PublicFeedback } from '../../../packages/contracts/public/submission.js';
import { FeedbackRejected } from './policy.js';

/**
 * Private feedback outbox (M7.2). The row is written inside the caller's
 * transaction (acceptance/rejection/compensation all share one atomic
 * commit), so a payable or state-changing event can never exist without
 * its feedback event or vice versa. Payloads are re-validated against the
 * strict public schema at both write and read — a non-conforming payload
 * cannot enter or leave the outbox.
 */

export interface OutboxEvent {
  readonly eventId: string;
  readonly submissionId: string;
  readonly payload: PublicFeedback;
}

function parsePayload(raw: unknown): PublicFeedback {
  const parsed = PublicFeedbackSchema.safeParse(raw);
  if (!parsed.success) throw new FeedbackRejected('outbox_payload_damaged');
  return parsed.data;
}

export class PrivateFeedbackStore {
  constructor(private readonly pool: Pool) {}

  /** Insert the outbox event inside the caller's atomic transaction. */
  async enqueueEvent(client: PoolClient, event: { eventId: string; submissionId: string; payload: unknown }): Promise<void> {
    const payload = parsePayload(event.payload);
    await client.query(
      `INSERT INTO private_feedback_outbox (event_id,submission_id,payload) VALUES ($1,$2,$3::jsonb)`,
      [event.eventId, event.submissionId, JSON.stringify(payload)],
    );
  }

  /** Oldest undelivered event for the delivery loop. */
  async pullNext(): Promise<OutboxEvent | null> {
    const { rows } = await this.pool.query(
      `SELECT event_id,submission_id,payload FROM private_feedback_outbox WHERE delivered_at IS NULL ORDER BY created_at LIMIT 1`,
    );
    const row = rows[0];
    if (!row) return null;
    return { eventId: row.event_id as string, submissionId: row.submission_id as string, payload: parsePayload(row.payload) };
  }

  /** First delivery marks the event; later deliveries cannot move it (outbox_delivery_immutable). */
  async acknowledge(eventId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE private_feedback_outbox SET delivered_at=now() WHERE event_id=$1 AND delivered_at IS NULL`,
      [eventId],
    );
    return rowCount === 1;
  }
}
