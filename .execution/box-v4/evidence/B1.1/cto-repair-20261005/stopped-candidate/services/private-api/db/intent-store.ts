import type { Pool, PoolClient } from 'pg';
import { InternalIntentSchema } from '../../../packages/contracts/private/index.js';
import type { InternalIntent } from '../../../packages/contracts/private/index.js';
import { contentHash } from '../../../packages/contracts/hash.js';
import { assertTransition, WorkflowError } from '../../../packages/contracts/workflow/index.js';
import type { ActorRole } from '../../../packages/contracts/workflow/index.js';
import type { SessionActor } from '../../../packages/contracts/auth/store.js';
import { OpaqueIdSchema } from '../../../packages/contracts/common.js';

type IntentActor = string | SessionActor;
const actorIdOf = (actor: IntentActor) => typeof actor === 'string' ? actor : actor.id;

export interface IntentRead {
  id: string; version: number; state: string; contentHash: string; intent: InternalIntent;
  approval: { approvedBy: string; approvedHash: string; approvedAt: string } | null;
  supersededApproval: boolean;
}
interface IntentRow { id: string; version: number; state: string; payload: InternalIntent; content_hash: string; approved_by?: string | null; approved_hash?: string | null; created_at?: unknown }

export class PrivateIntentStore {
  constructor(private readonly pool: Pool) {}
  private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); const result = await operation(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  private async actor(client: PoolClient, actor: IntentActor): Promise<ActorRole> {
    let row: { role: ActorRole } | undefined;
    if (typeof actor === 'string') row = (await client.query('SELECT role FROM private_accounts WHERE id = $1 AND NOT disabled', [actor])).rows[0];
    else {
      if (!OpaqueIdSchema.safeParse(actor.id).success || !['owner','requester'].includes(actor.role) || !/^[a-f0-9]{64}$/.test(actor.sessionHash) || !/^[a-f0-9]{64}$/.test(actor.csrfHash)) throw new WorkflowError('forbidden_role');
      row = (await client.query(`SELECT account.role FROM private_accounts AS account
        JOIN private_sessions AS session ON session.account_id=account.id
        WHERE account.id=$1 AND account.role=$2 AND NOT account.disabled
        AND session.token_hash=$3 AND session.csrf_hash=$4 AND session.expires_at>now()
        FOR SHARE OF account, session`, [actor.id,actor.role,actor.sessionHash,actor.csrfHash])).rows[0];
    }
    if (!row || !['owner', 'requester'].includes(row.role)) throw new WorkflowError('forbidden_role');
    return row.role;
  }
  private async current(client: PoolClient, id: string, expectedVersion: number) {
    const row = (await client.query('SELECT revision.* FROM private_intent_heads AS head JOIN private_intent_revisions AS revision ON revision.id = head.id AND revision.version = head.current_version WHERE head.id = $1 FOR UPDATE OF head', [id])).rows[0] as { id: string; version: number; state: string; payload: InternalIntent; content_hash: string; requester_id: string } | undefined;
    if (!row || row.version !== expectedVersion) throw new WorkflowError('stale_version');
    return row;
  }
  private binding(row: IntentRow): IntentRead {
    const intent = InternalIntentSchema.parse(row.payload);
    if (intent.intentId !== row.id || intent.version !== row.version || contentHash(intent) !== row.content_hash || (row.state === 'approved' && row.approved_hash !== row.content_hash)) throw new WorkflowError('missing_evidence');
    const approval = row.state === 'approved' && row.approved_by && row.approved_hash ? { approvedBy: String(row.approved_by), approvedHash: String(row.approved_hash), approvedAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at) } : null;
    return { id: intent.intentId, version: intent.version, state: String(row.state), contentHash: String(row.content_hash), intent, approval, supersededApproval: false };
  }
  private async superseded(client: PoolClient, id: string, version: number): Promise<boolean> {
    const row = (await client.query("SELECT EXISTS(SELECT 1 FROM private_intent_revisions WHERE id=$1 AND state='approved' AND version<$2) AS superseded", [id, version])).rows[0] as { superseded: boolean } | undefined;
    return Boolean(row?.superseded);
  }
  private async decorated(client: PoolClient, row: IntentRow): Promise<IntentRead> {
    const bound = this.binding(row);
    return { ...bound, supersededApproval: bound.approval === null && await this.superseded(client, bound.id, bound.version) };
  }
  private readColumns = 'revision.id,revision.version,revision.state,revision.payload,revision.content_hash,revision.approved_by,revision.approved_hash,revision.created_at';
  async read(actor: SessionActor, intentId: string) {
    if (!OpaqueIdSchema.safeParse(intentId).success) throw new WorkflowError('forbidden_role');
    return this.transaction(async client => {
      const role = await this.actor(client, actor);
      const row = (await client.query(`SELECT ${this.readColumns}
        FROM private_intent_heads AS head JOIN private_intent_revisions AS revision ON revision.id=head.id AND revision.version=head.current_version
        WHERE head.id=$1 AND (revision.requester_id=$2 OR $3='owner')`, [intentId,actor.id,role])).rows[0] as IntentRow | undefined;
      if (!row) throw new WorkflowError('forbidden_role');
      return this.decorated(client, row);
    });
  }
  async readForRequest(actor: SessionActor, requestId: string, provenance: string) {
    if (!OpaqueIdSchema.safeParse(requestId).success) throw new WorkflowError('forbidden_role');
    return this.transaction(async client => {
      const role = await this.actor(client, actor);
      const rows = (await client.query(`SELECT ${this.readColumns}
        FROM private_intent_heads AS head JOIN private_intent_revisions AS revision ON revision.id=head.id AND revision.version=head.current_version
        WHERE revision.payload->'scope'->'included' @> to_jsonb($1::text) AND (revision.requester_id=$2 OR $3='owner')
        ORDER BY revision.created_at DESC, revision.id DESC LIMIT 2`, [provenance,actor.id,role])).rows as IntentRow[];
      if (!rows[0]) throw new WorkflowError('forbidden_role');
      return this.decorated(client, rows[0]);
    });
  }
  async create(actor: IntentActor, input: unknown, binding?: { requestId: string }) {
    const actorId = actorIdOf(actor);
    const intent = InternalIntentSchema.parse(input);
    if (intent.version !== 1 || intent.state !== 'draft') throw new WorkflowError('invalid_transition');
    const hash = contentHash(intent);
    return this.transaction(async client => {
      await this.actor(client, actor);
      if (binding) {
        if (!OpaqueIdSchema.safeParse(binding.requestId).success) throw new WorkflowError('missing_evidence');
        const bound = (await client.query('SELECT 1 AS bound FROM private_requests WHERE id=$1 AND requester_id=$2 AND snapshot_id=(SELECT id FROM private_snapshots WHERE snapshot_hash=$3)', [binding.requestId, actorId, intent.snapshotHash])).rows[0];
        if (!bound) throw new WorkflowError('missing_evidence');
      }
      await client.query('INSERT INTO private_intent_revisions (id, version, state, payload, content_hash, snapshot_hash, requester_id) VALUES ($1, $2, $3, $4, $5, $6, $7)', [intent.intentId, intent.version, intent.state, intent, hash, intent.snapshotHash, actorId]);
      await client.query('INSERT INTO private_intent_heads (id, current_version) VALUES ($1, 1)', [intent.intentId]);
      return { version: 1, contentHash: hash };
    });
  }
  async revise(actor: IntentActor, input: unknown, expectedVersion: number) {
    const actorId = actorIdOf(actor);
    const intent = InternalIntentSchema.parse(input);
    if (intent.state !== 'draft' || intent.version !== expectedVersion + 1) throw new WorkflowError('invalid_transition');
    return this.transaction(async client => {
      const role = await this.actor(client, actor);
      const current = await this.current(client, intent.intentId, expectedVersion);
      if (role === 'requester' && current.requester_id !== actorId) throw new WorkflowError('forbidden_role');
      const hash = contentHash(intent);
      await client.query('INSERT INTO private_intent_revisions (id, version, state, payload, content_hash, snapshot_hash, requester_id) VALUES ($1, $2, $3, $4, $5, $6, $7)', [intent.intentId, intent.version, intent.state, intent, hash, intent.snapshotHash, current.requester_id]);
      await client.query('UPDATE private_intent_heads SET current_version = $2 WHERE id = $1 AND current_version = $3', [intent.intentId, intent.version, expectedVersion]);
      return { version: intent.version, contentHash: hash };
    });
  }
  async transition(actor: IntentActor, id: string, expectedVersion: number, to: 'needs_decision' | 'ready_for_approval' | 'approved', expectedHash?: string) {
    const actorId = actorIdOf(actor);
    return this.transaction(async client => {
      const role = await this.actor(client, actor);
      const current = await this.current(client, id, expectedVersion);
      if (role === 'requester' && current.requester_id !== actorId) throw new WorkflowError('forbidden_role');
      assertTransition({ kind: 'intent', from: current.state, to, actor: role, expectedVersion, currentVersion: current.version }, { requiredDecisionsResolved: current.payload.decisions.every(decision => !decision.required || decision.answer !== null), exactHashConfirmed: expectedHash === current.content_hash });
      if (to === 'approved') {
        await client.query("UPDATE private_intent_revisions SET state = 'approved', approved_by = $3, approved_hash = content_hash WHERE id = $1 AND version = $2", [id, expectedVersion, actorId]);
        return { version: expectedVersion, contentHash: current.content_hash, state: to };
      }
      const payload = InternalIntentSchema.parse({ ...current.payload, state: to });
      const hash = contentHash(payload);
      await client.query('UPDATE private_intent_revisions SET state = $3, payload = $4, content_hash = $5 WHERE id = $1 AND version = $2', [id, expectedVersion, to, payload, hash]);
      return { version: expectedVersion, contentHash: hash, state: to };
    });
  }
}
