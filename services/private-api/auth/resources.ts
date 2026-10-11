import { z } from 'zod';
import { AuthDenied } from '../../../packages/contracts/auth/store.js';
import type { AuthDatabase, SessionActor } from '../../../packages/contracts/auth/store.js';
import { permits } from '../../../packages/contracts/auth/policy.js';

const Id = z.uuid();
const IntentProjection = z.object({ id: Id, version: z.number().int().positive(), state: z.enum(['draft', 'needs_decision', 'ready_for_approval', 'approved']) });
export class PrivateResourceAccess {
  constructor(private readonly database: AuthDatabase) {}
  async intent(actor: SessionActor, resourceId: unknown) {
    const parsed = Id.safeParse(resourceId);
    if (!parsed.success || !Id.safeParse(actor.id).success || !permits('private', actor.role, 'intent.read')) throw new AuthDenied();
    const client = await this.database.connect();
    try {
      const row = (await client.query(`SELECT revision.id,revision.version,revision.state FROM private_intent_heads AS head
        JOIN private_intent_revisions AS revision ON revision.id=head.id AND revision.version=head.current_version
        JOIN private_accounts AS actor ON actor.id=$2 AND NOT actor.disabled AND actor.role=$3
        JOIN private_sessions AS session ON session.account_id=actor.id AND session.token_hash=$4 AND session.expires_at>now()
        WHERE head.id=$1 AND (actor.role='owner' OR (actor.role='requester' AND revision.requester_id=actor.id))`, [parsed.data, actor.id, actor.role, actor.sessionHash])).rows[0];
      if (!row) throw new AuthDenied();
      return IntentProjection.parse(row);
    } finally { client.release(); }
  }
}
