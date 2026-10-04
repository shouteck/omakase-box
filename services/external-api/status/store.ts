import type { Pool, PoolClient } from 'pg';
import { PublicFeedbackSchema } from '../../../packages/contracts/public/submission.js';
import type { PublicFeedback } from '../../../packages/contracts/public/submission.js';

/**
 * Contributor-facing status store (M7.2). Feedback payloads are validated
 * against the strict public schema at ingest AND at read — a corrupted or
 * non-conforming row yields `feedback: null` rather than leaking private
 * detail. The submission's own state machine (`external_submission_integrity`)
 * owns the lifecycle; this store only records delivered feedback and serves
 * the bounded projection to the owning contributor.
 */

export class StatusRejected extends Error {
  constructor(readonly code: string) { super(code); this.name = 'StatusRejected'; }
}

function parsePayload(raw: unknown): PublicFeedback {
  const parsed = PublicFeedbackSchema.safeParse(raw);
  if (!parsed.success) throw new StatusRejected('invalid_feedback');
  return parsed.data;
}

export class SqlExternalStatusStore {
  constructor(private readonly pool: Pool) {}

  /**
   * Record a verified delivered feedback event. Bound to an existing
   * submission owned row; replay on the same publicId is idempotent.
   */
  async ingest(input: { publicId: string; submissionId: string; payload: unknown }): Promise<'stored' | 'duplicate'> {
    const payload = parsePayload(input.payload);
    const client = await this.pool.connect();
    try {
      const { rows } = await client.query<{ id: string }>(`SELECT id FROM external_submissions WHERE id=$1`, [input.submissionId]);
      if (!rows[0]) throw new StatusRejected('unknown_submission');
      const { rowCount } = await client.query(
        `INSERT INTO external_feedback (public_id,submission_id,payload) VALUES ($1,$2,$3::jsonb) ON CONFLICT (public_id) DO NOTHING`,
        [input.publicId, input.submissionId, JSON.stringify(payload)],
      );
      return rowCount === 1 ? 'stored' : 'duplicate';
    } finally { client.release(); }
  }

  /**
   * Bounded status projection for the owning contributor: the submission's
   * lifecycle state plus the delivered feedback payload, re-validated
   * before serving so a damaged row degrades to absent, never to leakage.
   */
  async status(submissionId: string, contributorId: string): Promise<{ state: string; version: number; reservationId: string; feedback: PublicFeedback | null } | null> {
    const { rows } = await this.pool.query<{ state: string; version: number; reservation_id: string }>(
      `SELECT state,version,reservation_id FROM external_submissions WHERE id=$1 AND contributor_id=$2`,
      [submissionId, contributorId],
    );
    const submission = rows[0];
    if (!submission) return null;
    const { rows: feedbackRows } = await this.pool.query<{ payload: unknown }>(
      `SELECT payload FROM external_feedback WHERE submission_id=$1 ORDER BY public_id DESC LIMIT 1`,
      [submissionId],
    );
    let feedback: PublicFeedback | null = null;
    if (feedbackRows[0]) {
      const parsed = PublicFeedbackSchema.safeParse(feedbackRows[0].payload);
      feedback = parsed.success ? parsed.data : null;
    }
    return { state: submission.state, version: submission.version, reservationId: submission.reservation_id, feedback };
  }
}
