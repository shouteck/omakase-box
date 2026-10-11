import { createPrivateKey, randomBytes, randomUUID, sign, type KeyObject } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { SessionActor } from '../../../packages/contracts/auth/store.js';
import { HashSchema, OpaqueIdSchema } from '../../../packages/contracts/common.js';
import { canonicalize, contentHash } from '../../../packages/contracts/hash.js';
import { WorkflowError } from '../../../packages/contracts/workflow/index.js';
import { z } from 'zod';
import { AssignmentChoiceSchema, AssignmentCommandSchema, InvitationRevocationSchema, type SignedCommandPacket } from '../../external-api/reservations/assignment-protocol.js';
import { tokenHash } from '../../external-api/reservations/assignments.js';

export const PRIVATE_ASSIGNMENT_DDL = `
CREATE TABLE private_assignments (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES private_accounts(id),
  idempotency_key uuid NOT NULL,
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  task_id uuid NOT NULL,
  task_version integer NOT NULL CHECK (task_version > 0),
  package_digest char(64) NOT NULL CHECK (package_digest ~ '^[a-f0-9]{64}$'),
  executor jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id,idempotency_key),
  UNIQUE (task_id,task_version)
);
CREATE TABLE private_assignment_invitations (
  assignment_id uuid PRIMARY KEY REFERENCES private_assignments(id),
  contributor_id uuid NOT NULL,
  token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  token char(64) NOT NULL CHECK (token ~ '^[a-f0-9]{64}$'),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE TABLE private_assignment_outbox (
  event_id uuid PRIMARY KEY,
  assignment_id uuid NOT NULL REFERENCES private_assignments(id),
  kind varchar(32) NOT NULL DEFAULT 'choice' CHECK (kind IN ('choice','invitation_revocation')),
  packet jsonb NOT NULL,
  payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id,kind)
);
CREATE FUNCTION private_assignment_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'assignment_record_immutable';
END;
$$;
CREATE TRIGGER private_assignment_choice_immutable BEFORE UPDATE OR DELETE ON private_assignments FOR EACH ROW EXECUTE FUNCTION private_assignment_immutable();
CREATE FUNCTION private_assignment_invitation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'invitation_records_preserved'; END IF;
  IF ROW(OLD.assignment_id,OLD.contributor_id,OLD.token_hash,OLD.token,OLD.issued_at,OLD.expires_at) IS DISTINCT FROM ROW(NEW.assignment_id,NEW.contributor_id,NEW.token_hash,NEW.token,NEW.issued_at,NEW.expires_at)
    OR OLD.revoked_at IS NOT NULL AND OLD.revoked_at IS DISTINCT FROM NEW.revoked_at THEN
    RAISE EXCEPTION 'invitation_binding_immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER private_assignment_invitation_preserved BEFORE UPDATE OR DELETE ON private_assignment_invitations FOR EACH ROW EXECUTE FUNCTION private_assignment_invitation_guard();
CREATE FUNCTION private_assignment_outbox_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'assignment_outbox_preserved'; END IF;
  IF ROW(OLD.event_id,OLD.assignment_id,OLD.kind,OLD.packet,OLD.payload_hash,OLD.created_at) IS DISTINCT FROM ROW(NEW.event_id,NEW.assignment_id,NEW.kind,NEW.packet,NEW.payload_hash,NEW.created_at)
    OR OLD.delivered_at IS NOT NULL AND OLD.delivered_at IS DISTINCT FROM NEW.delivered_at THEN
    RAISE EXCEPTION 'assignment_outbox_immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER private_assignment_outbox_preserved BEFORE UPDATE OR DELETE ON private_assignment_outbox FOR EACH ROW EXECUTE FUNCTION private_assignment_outbox_guard();
`;

export const INVITATION_LIFETIME_MS = 3600_000;
export type ReadyAssignmentTask = { taskId: string; taskVersion: number; packageDigest: string; ready: boolean };
export type AssignmentReadinessGate = (client: PoolClient, taskId: string, taskVersion: number) => Promise<ReadyAssignmentTask | null>;
interface AssignmentRow { id: string; owner_id: string; idempotency_key: string; request_hash: string; task_id: string; task_version: number; package_digest: string; executor: { kind: 'human' | 'ai' | 'team'; label: string; contributorId?: string }; created_at: Date }
interface InvitationRow { assignment_id: string; contributor_id: string; token_hash: string; token: string; issued_at: Date; expires_at: Date; revoked_at: Date | null }
const RevocationInputSchema = z.strictObject({ assignmentId: OpaqueIdSchema });

export class AssignmentNotFound extends Error {
  readonly code = 'not_found' as const;
  constructor() { super('not_found'); }
}

export class PrivateAssignmentStore {
  private readonly key: KeyObject;
  constructor(private readonly pool: Pool, signingKey: KeyObject | string | Buffer, private readonly readiness?: AssignmentReadinessGate) {
    this.key = typeof signingKey === 'string' || Buffer.isBuffer(signingKey) ? createPrivateKey(signingKey) : signingKey;
    if (this.key.type !== 'private' || this.key.asymmetricKeyType !== 'ed25519') throw new Error('invalid_assignment_signing_key');
  }

  private async owner(client: PoolClient, actor: SessionActor) {
    if (!actor || actor.role !== 'owner' || !OpaqueIdSchema.safeParse(actor.id).success || !HashSchema.safeParse(actor.sessionHash).success || !HashSchema.safeParse(actor.csrfHash).success) throw new WorkflowError('forbidden_role');
    const current = await client.query(`SELECT account.id FROM private_accounts AS account
      JOIN private_sessions AS session ON session.account_id=account.id
      WHERE account.id=$1 AND account.role='owner' AND NOT account.disabled
      AND session.token_hash=$2 AND session.csrf_hash=$3 AND session.expires_at>now()
      FOR SHARE OF account, session`, [actor.id,actor.sessionHash,actor.csrfHash]);
    if (!current.rows[0]) throw new WorkflowError('forbidden_role');
  }

  private packet(payload: z.infer<typeof AssignmentCommandSchema> | z.infer<typeof InvitationRevocationSchema>): SignedCommandPacket {
    return { payload, signature: sign(null, Buffer.from(canonicalize(payload)), this.key).toString('base64') };
  }

  async choose(actor: SessionActor, input: unknown) {
    const request = AssignmentChoiceSchema.parse(input), requestHash = contentHash(request);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.owner(client, actor);
      if (!this.readiness) throw new WorkflowError('missing_evidence');
      const ready = await this.readiness(client, request.taskId, request.taskVersion);
      if (!ready?.ready) throw new WorkflowError('missing_evidence');
      if (ready.taskId !== request.taskId || ready.taskVersion !== request.taskVersion || ready.packageDigest !== request.packageDigest) throw new WorkflowError('stale_version');
      let row = (await client.query('SELECT * FROM private_assignments WHERE owner_id=$1 AND idempotency_key=$2 FOR SHARE', [actor.id,request.idempotencyKey])).rows[0] as AssignmentRow | undefined;
      if (row && row.request_hash !== requestHash) throw new WorkflowError('stale_version');
      if (!row) {
        const id = randomUUID(), now = Date.now();
        row = (await client.query('INSERT INTO private_assignments (id,owner_id,idempotency_key,request_hash,task_id,task_version,package_digest,executor) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING *', [id,actor.id,request.idempotencyKey,requestHash,request.taskId,request.taskVersion,request.packageDigest,request.executor])).rows[0] as AssignmentRow | undefined;
        if (!row) {
          row = (await client.query('SELECT * FROM private_assignments WHERE owner_id=$1 AND idempotency_key=$2 FOR SHARE', [actor.id,request.idempotencyKey])).rows[0] as AssignmentRow | undefined;
          if (!row || row.request_hash !== requestHash) throw new WorkflowError('stale_version');
        } else {
          let invitation: { contributorId: string; tokenHash: string; expiresAt: string } | undefined;
          if (request.executor.kind === 'human') {
            const token = randomBytes(32).toString('hex'), expiresAt = new Date(now + INVITATION_LIFETIME_MS).toISOString();
            invitation = { contributorId: request.executor.contributorId!, tokenHash: tokenHash(token), expiresAt };
            await client.query('INSERT INTO private_assignment_invitations (assignment_id,contributor_id,token_hash,token,issued_at,expires_at) VALUES ($1,$2,$3,$4,$5,$6)', [id,invitation.contributorId,invitation.tokenHash,token,new Date(now).toISOString(),expiresAt]);
          }
          const payload = AssignmentCommandSchema.parse({ schemaVersion: 1, audience: 'external-assignment/v1', eventId: randomUUID(), nonce: randomUUID(), assignmentId: id, taskId: request.taskId, taskVersion: request.taskVersion, packageDigest: request.packageDigest, executor: request.executor, ...(invitation ? { invitation } : {}), issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 300000).toISOString() });
          await client.query("INSERT INTO private_assignment_outbox (event_id,assignment_id,kind,packet,payload_hash) VALUES ($1,$2,'choice',$3,$4)", [payload.eventId,id,this.packet(payload),contentHash(payload)]);
        }
      }
      const invitation = request.executor.kind === 'human'
        ? (await client.query('SELECT contributor_id,token,expires_at,revoked_at FROM private_assignment_invitations WHERE assignment_id=$1', [row.id])).rows[0] as InvitationRow | undefined
        : undefined;
      await client.query('COMMIT');
      return { schemaVersion: 1 as const, id: row.id, taskId: row.task_id, taskVersion: row.task_version, packageDigest: row.package_digest, executor: { kind: row.executor.kind, label: row.executor.label }, status: 'queued' as const, publicationEnabled: false as const, ...(invitation ? { invitation: { contributorId: invitation.contributor_id, token: invitation.token, expiresAt: new Date(invitation.expires_at).toISOString(), revoked: invitation.revoked_at !== null } } : {}) };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async revokeInvitation(actor: SessionActor, input: unknown) {
    const request = RevocationInputSchema.parse(input);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.owner(client, actor);
      const assignment = (await client.query('SELECT id,owner_id,task_id,task_version,package_digest FROM private_assignments WHERE id=$1 AND owner_id=$2 FOR UPDATE', [request.assignmentId,actor.id])).rows[0] as AssignmentRow | undefined;
      if (!assignment) throw new AssignmentNotFound();
      const invitation = (await client.query('SELECT contributor_id,token_hash,revoked_at FROM private_assignment_invitations WHERE assignment_id=$1 FOR UPDATE', [assignment.id])).rows[0] as InvitationRow | undefined;
      if (!invitation) throw new AssignmentNotFound();
      let duplicate = invitation.revoked_at !== null;
      if (!duplicate) {
        const now = Date.now();
        await client.query('UPDATE private_assignment_invitations SET revoked_at=to_timestamp($2/1000.0) WHERE assignment_id=$1 AND revoked_at IS NULL', [assignment.id,now]);
        const payload = InvitationRevocationSchema.parse({ schemaVersion: 1, audience: 'external-assignment-invitation-revocation/v1', eventId: randomUUID(), nonce: randomUUID(), assignmentId: assignment.id, taskId: assignment.task_id, taskVersion: assignment.task_version, packageDigest: assignment.package_digest, contributorId: invitation.contributor_id, tokenHash: invitation.token_hash, issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 300000).toISOString() });
        const queued = await client.query("INSERT INTO private_assignment_outbox (event_id,assignment_id,kind,packet,payload_hash) VALUES ($1,$2,'invitation_revocation',$3,$4) ON CONFLICT (assignment_id,kind) DO NOTHING", [payload.eventId,assignment.id,this.packet(payload),contentHash(payload)]);
        duplicate = queued.rowCount !== 1;
      }
      await client.query('COMMIT');
      return { schemaVersion: 1 as const, assignmentId: assignment.id, status: 'revocation_queued' as const, duplicate };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}
