import { z } from 'zod';
import { AuthDenied } from '../../../packages/contracts/auth/store.js';
import type { AuthDatabase, SessionActor } from '../../../packages/contracts/auth/store.js';
import { permits } from '../../../packages/contracts/auth/policy.js';

const Id = z.uuid();
const ReservationProjection = z.object({ id: Id, task_id: Id, task_version: z.number().int().positive(), state: z.enum(['active','in_review','accepted','expired','cancelled']), expires_at: z.date(), version: z.number().int().positive() });
const SubmissionProjection = z.object({ id: Id, reservation_id: Id, state: z.enum(['received','public_evaluating','private_evaluating','owner_review','accepted','changes_required','package_defect','infrastructure_failure']), version: z.number().int().positive() });
export class ExternalResourceAccess {
  constructor(private readonly database: AuthDatabase) {}
  async reservation(actor: SessionActor, resourceId: unknown) {
    if (!Id.safeParse(resourceId).success || !Id.safeParse(actor.id).success || !permits('external', actor.role, 'reservation.read')) throw new AuthDenied();
    const client = await this.database.connect();
    try {
      const row = (await client.query(`SELECT resource.id,resource.task_id,resource.task_version,resource.state,resource.expires_at,resource.version FROM external_reservations AS resource
        JOIN external_accounts AS actor ON actor.id=$2 AND NOT actor.disabled
        JOIN external_sessions AS session ON session.account_id=actor.id AND session.token_hash=$3 AND session.expires_at>now()
        WHERE resource.id=$1 AND resource.contributor_id=actor.id`, [resourceId, actor.id, actor.sessionHash])).rows[0];
      if (!row) throw new AuthDenied();
      const checked = ReservationProjection.parse(row);
      return { id: checked.id, taskId: checked.task_id, taskVersion: checked.task_version, state: checked.state, expiresAt: checked.expires_at.toISOString(), version: checked.version };
    } finally { client.release(); }
  }
  async submission(actor: SessionActor, resourceId: unknown) {
    if (!Id.safeParse(resourceId).success || !Id.safeParse(actor.id).success || !permits('external', actor.role, 'submission.read')) throw new AuthDenied();
    const client = await this.database.connect();
    try {
      const row = (await client.query(`SELECT resource.id,resource.reservation_id,resource.state,resource.version FROM external_submissions AS resource
        JOIN external_reservations AS reservation ON reservation.id=resource.reservation_id AND reservation.contributor_id=resource.contributor_id
        JOIN external_accounts AS actor ON actor.id=$2 AND NOT actor.disabled
        JOIN external_sessions AS session ON session.account_id=actor.id AND session.token_hash=$3 AND session.expires_at>now()
        WHERE resource.id=$1 AND resource.contributor_id=actor.id`, [resourceId, actor.id, actor.sessionHash])).rows[0];
      if (!row) throw new AuthDenied();
      const checked = SubmissionProjection.parse(row);
      // Evaluation categories require the later owner-approved feedback bridge.
      return { id: checked.id, reservationId: checked.reservation_id, version: checked.version };
    } finally { client.release(); }
  }
}
