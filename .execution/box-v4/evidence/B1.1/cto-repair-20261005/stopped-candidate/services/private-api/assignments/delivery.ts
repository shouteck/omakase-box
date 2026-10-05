import { createPrivateKey, createPublicKey, randomBytes, randomUUID, sign, verify, type KeyObject } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { canonicalize, contentHash } from '../../../packages/contracts/hash.js';
import { COMMAND_PAYLOAD_SCHEMAS, SignedCommandPacketSchema, verifyCommandEnvelope, type AssignmentCommand, type InvitationRevocationCommand, type SignedCommandPacket } from '../../external-api/reservations/assignment-protocol.js';
import { SignedAssignmentReceiptSchema, verifyAssignmentReceipt, type ReceiptCommand } from '../../external-api/reservations/assignment-receipt.js';
import type { AssignmentReadinessGate } from './store.js';

export const ASSIGNMENT_DELIVERY_DDL = `
CREATE TABLE private_assignment_delivery_attempts (
  event_id uuid PRIMARY KEY,
  outbox_event_id uuid NOT NULL REFERENCES private_assignment_outbox(event_id),
  sequence integer NOT NULL CHECK (sequence > 0),
  nonce uuid NOT NULL UNIQUE,
  packet jsonb NOT NULL,
  payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  receipt jsonb,
  acknowledged_at timestamptz,
  UNIQUE (outbox_event_id,sequence),
  UNIQUE (event_id,outbox_event_id),
  CHECK ((receipt IS NULL) = (acknowledged_at IS NULL))
);
CREATE TABLE private_assignment_delivery_leases (
  outbox_event_id uuid PRIMARY KEY REFERENCES private_assignment_outbox(event_id),
  event_id uuid NOT NULL,
  token_hash char(64) NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  leased_until timestamptz NOT NULL,
  FOREIGN KEY (event_id,outbox_event_id) REFERENCES private_assignment_delivery_attempts(event_id,outbox_event_id)
);
CREATE FUNCTION private_assignment_delivery_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'delivery_history_preserved'; END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT packet->'payload' INTO original FROM private_assignment_outbox WHERE event_id=NEW.outbox_event_id;
    IF original IS NULL OR ((NEW.packet->'payload') - ARRAY['eventId','nonce','issuedAt','expiresAt']) IS DISTINCT FROM (original - ARRAY['eventId','nonce','issuedAt','expiresAt'])
      OR NEW.packet->'payload'->>'eventId' IS DISTINCT FROM NEW.event_id::text
      OR NEW.packet->'payload'->>'nonce' IS DISTINCT FROM NEW.nonce::text
      OR (NEW.packet->'payload'->>'expiresAt')::timestamptz IS DISTINCT FROM NEW.expires_at THEN
      RAISE EXCEPTION 'delivery_choice_binding';
    END IF;
  ELSE
    IF ROW(OLD.event_id,OLD.outbox_event_id,OLD.sequence,OLD.nonce,OLD.packet,OLD.payload_hash,OLD.expires_at) IS DISTINCT FROM ROW(NEW.event_id,NEW.outbox_event_id,NEW.sequence,NEW.nonce,NEW.packet,NEW.payload_hash,NEW.expires_at)
      OR OLD.receipt IS NOT NULL AND ROW(OLD.receipt,OLD.acknowledged_at) IS DISTINCT FROM ROW(NEW.receipt,NEW.acknowledged_at) THEN
      RAISE EXCEPTION 'delivery_attempt_immutable';
    END IF;
  END IF;
  IF NEW.receipt IS NOT NULL AND (NEW.receipt->'payload'->>'eventId' IS DISTINCT FROM NEW.event_id::text OR NEW.receipt->'payload'->>'commandHash' IS DISTINCT FROM NEW.payload_hash::text) THEN
    RAISE EXCEPTION 'delivery_receipt_binding';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER private_assignment_delivery_preserved BEFORE INSERT OR UPDATE OR DELETE ON private_assignment_delivery_attempts FOR EACH ROW EXECUTE FUNCTION private_assignment_delivery_guard();
`;

export class AssignmentDeliveryRejected extends Error {
  constructor(readonly code: 'readiness_unavailable' | 'binding_drift' | 'lease_lost' | 'invalid_lease' | 'delivery_unverified' | 'persistence_unavailable') { super(code); }
}
export interface AssignmentDeliveryClaim { outboxEventId: string; token: string; packet: SignedCommandPacket }
export interface AssignmentDeliveryTransport { send(packet: SignedCommandPacket, signal: AbortSignal): Promise<unknown> }
const ClaimSchema = z.strictObject({ outboxEventId: z.uuid(), token: z.string().regex(/^[a-f0-9]{64}$/), packet: SignedCommandPacketSchema });
const KIND_AUDIENCES = { choice: 'external-assignment/v1', invitation_revocation: 'external-assignment-invitation-revocation/v1' } as const;
type OutboxKind = keyof typeof KIND_AUDIENCES;
const facts = ({ eventId: _event, nonce: _nonce, issuedAt: _issued, expiresAt: _expires, ...value }: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
interface PendingRow { event_id: string; assignment_id: string; kind: OutboxKind; packet: unknown; payload_hash: string; task_id: string; task_version: number; package_digest: string; executor: unknown; invitation_contributor_id: string | null; invitation_token_hash: string | null; invitation_expires_at: Date | string | null; invitation_revoked_at: Date | string | null }
interface AttemptRow { event_id: string; sequence: number; packet: unknown; payload_hash: string; expires_at: Date }

export class AssignmentDeliveryStore {
  private readonly key: KeyObject;
  private readonly publicKey: KeyObject;
  constructor(private readonly pool: Pool, signingKey: KeyObject | string | Buffer, private readonly receiptKey: KeyObject | string | Buffer, private readonly readiness?: AssignmentReadinessGate, private readonly clock: () => number = Date.now) {
    this.key = typeof signingKey === 'string' || Buffer.isBuffer(signingKey) ? createPrivateKey(signingKey) : signingKey;
    if (this.key.type !== 'private' || this.key.asymmetricKeyType !== 'ed25519') throw new Error('invalid_assignment_signing_key');
    this.publicKey = createPublicKey(this.key);
  }

  private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    let client: PoolClient;
    try { client = await this.pool.connect(); } catch { throw new AssignmentDeliveryRejected('persistence_unavailable'); }
    try { await client.query('BEGIN'); const value = await operation(client); await client.query('COMMIT'); return value; }
    catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error instanceof AssignmentDeliveryRejected ? error : new AssignmentDeliveryRejected('persistence_unavailable');
    } finally { client.release(); }
  }

  async claim(): Promise<AssignmentDeliveryClaim | null> {
    if (!this.readiness) throw new AssignmentDeliveryRejected('readiness_unavailable');
    return this.transaction(async client => {
      const now = this.clock();
      const row = (await client.query(`SELECT outbox.event_id,outbox.assignment_id,outbox.kind,outbox.packet,outbox.payload_hash,assignment.task_id,assignment.task_version,assignment.package_digest,assignment.executor,invitation.contributor_id AS invitation_contributor_id,invitation.token_hash AS invitation_token_hash,invitation.expires_at AS invitation_expires_at,invitation.revoked_at AS invitation_revoked_at
        FROM private_assignment_outbox AS outbox JOIN private_assignments AS assignment ON assignment.id=outbox.assignment_id
        JOIN private_accounts AS owner ON owner.id=assignment.owner_id AND owner.role='owner' AND NOT owner.disabled
        LEFT JOIN private_assignment_delivery_leases AS lease ON lease.outbox_event_id=outbox.event_id
        LEFT JOIN private_assignment_invitations AS invitation ON invitation.assignment_id=outbox.assignment_id
        WHERE outbox.delivered_at IS NULL AND (lease.outbox_event_id IS NULL OR lease.leased_until<=to_timestamp($1/1000.0))
        ORDER BY outbox.created_at,outbox.event_id LIMIT 1 FOR UPDATE OF outbox SKIP LOCKED FOR SHARE OF owner`, [now])).rows[0] as PendingRow | undefined;
      if (!row) return null;
      const ready = await this.readiness!(client,row.task_id,row.task_version);
      if (!ready?.ready) throw new AssignmentDeliveryRejected('readiness_unavailable');
      if (ready.taskId !== row.task_id || ready.taskVersion !== row.task_version || ready.packageDigest !== row.package_digest) throw new AssignmentDeliveryRejected('binding_drift');
      const audience = KIND_AUDIENCES[row.kind];
      const original = SignedCommandPacketSchema.parse(row.packet);
      const schema = COMMAND_PAYLOAD_SCHEMAS[audience as keyof typeof COMMAND_PAYLOAD_SCHEMAS];
      if (!schema || original.payload.audience !== audience) throw new AssignmentDeliveryRejected('binding_drift');
      const parsed = schema.parse(original.payload) as AssignmentCommand | InvitationRevocationCommand;
      if (contentHash(parsed) !== row.payload_hash || !verify(null,Buffer.from(canonicalize(parsed)),this.publicKey,Buffer.from(original.signature,'base64')) || parsed.assignmentId !== row.assignment_id || parsed.taskId !== row.task_id || parsed.taskVersion !== row.task_version || parsed.packageDigest !== row.package_digest) throw new AssignmentDeliveryRejected('binding_drift');
      if (row.kind === 'choice') {
        const command = parsed as AssignmentCommand;
        if (canonicalize(command.executor) !== canonicalize(row.executor)) throw new AssignmentDeliveryRejected('binding_drift');
        if (command.executor.kind === 'human' && (!row.invitation_token_hash || !command.invitation || command.invitation.contributorId !== row.invitation_contributor_id || command.invitation.tokenHash !== row.invitation_token_hash || Date.parse(command.invitation.expiresAt) !== new Date(row.invitation_expires_at as Date).getTime())) throw new AssignmentDeliveryRejected('binding_drift');
      } else {
        const command = parsed as InvitationRevocationCommand;
        if (!row.invitation_revoked_at || command.contributorId !== row.invitation_contributor_id || command.tokenHash !== row.invitation_token_hash) throw new AssignmentDeliveryRejected('binding_drift');
      }
      const latest = (await client.query('SELECT event_id,sequence,packet,payload_hash,expires_at FROM private_assignment_delivery_attempts WHERE outbox_event_id=$1 ORDER BY sequence DESC LIMIT 1 FOR SHARE', [row.event_id])).rows[0] as AttemptRow | undefined;
      let packet: SignedCommandPacket;
      if (latest && latest.expires_at.getTime() > now) {
        packet = SignedCommandPacketSchema.parse(latest.packet);
        if (packet.payload.audience !== audience || contentHash(packet.payload) !== latest.payload_hash || contentHash(facts(packet.payload)) !== contentHash(facts(parsed as unknown as Record<string, unknown>))) throw new AssignmentDeliveryRejected('binding_drift');
        verifyCommandEnvelope(packet,this.publicKey,now);
      } else {
        const payload = schema.parse({ ...facts(parsed as unknown as Record<string, unknown>), eventId: randomUUID(), nonce: randomUUID(), issuedAt: new Date(now).toISOString(), expiresAt: new Date(now+300000).toISOString() });
        packet = { payload: payload as SignedCommandPacket['payload'], signature: sign(null,Buffer.from(canonicalize(payload)),this.key).toString('base64') };
        await client.query('INSERT INTO private_assignment_delivery_attempts (event_id,outbox_event_id,sequence,nonce,packet,payload_hash,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [payload.eventId,row.event_id,(latest?.sequence ?? 0)+1,payload.nonce,packet,contentHash(payload),payload.expiresAt]);
      }
      const token = randomBytes(32).toString('hex');
      await client.query('INSERT INTO private_assignment_delivery_leases (outbox_event_id,event_id,token_hash,leased_until) VALUES ($1,$2,$3,to_timestamp($4/1000.0)) ON CONFLICT (outbox_event_id) DO UPDATE SET event_id=EXCLUDED.event_id,token_hash=EXCLUDED.token_hash,leased_until=EXCLUDED.leased_until', [row.event_id,packet.payload.eventId,contentHash(token),now+30000]);
      return { outboxEventId: row.event_id, token, packet };
    });
  }

  async acknowledge(input: AssignmentDeliveryClaim, receiptInput: unknown) {
    const claim = ClaimSchema.safeParse(input);
    if (!claim.success) throw new AssignmentDeliveryRejected('invalid_lease');
    let receipt: ReturnType<typeof SignedAssignmentReceiptSchema.parse>;
    try { receipt = SignedAssignmentReceiptSchema.parse(receiptInput); verifyAssignmentReceipt(receipt,this.receiptKey,claim.data.packet.payload as ReceiptCommand,this.clock()); }
    catch { throw new AssignmentDeliveryRejected('delivery_unverified'); }
    return this.transaction(async client => {
      const now = this.clock(), value = claim.data;
      const row = (await client.query(`SELECT outbox.delivered_at,lease.token_hash,lease.leased_until,lease.event_id,attempt.payload_hash
        FROM private_assignment_outbox AS outbox JOIN private_assignment_delivery_leases AS lease ON lease.outbox_event_id=outbox.event_id
        JOIN private_assignment_delivery_attempts AS attempt ON attempt.event_id=lease.event_id AND attempt.outbox_event_id=outbox.event_id
        WHERE outbox.event_id=$1 FOR UPDATE OF outbox,lease,attempt`, [value.outboxEventId])).rows[0];
      if (!row || row.token_hash !== contentHash(value.token) || row.event_id !== value.packet.payload.eventId || row.payload_hash !== contentHash(value.packet.payload)) throw new AssignmentDeliveryRejected('lease_lost');
      if (row.delivered_at) return { assurance: 'tested' as const, status: 'delivered' as const, duplicate: true };
      if (new Date(row.leased_until).getTime() <= now) throw new AssignmentDeliveryRejected('lease_lost');
      await client.query('UPDATE private_assignment_delivery_attempts SET receipt=$2,acknowledged_at=to_timestamp($3/1000.0) WHERE event_id=$1 AND receipt IS NULL', [value.packet.payload.eventId,receipt,now]);
      await client.query('UPDATE private_assignment_outbox SET delivered_at=to_timestamp($2/1000.0) WHERE event_id=$1 AND delivered_at IS NULL', [value.outboxEventId,now]);
      await client.query('UPDATE private_assignment_delivery_leases SET leased_until=to_timestamp($3/1000.0) WHERE outbox_event_id=$1 AND token_hash=$2', [value.outboxEventId,contentHash(value.token),now]);
      return { assurance: 'tested' as const, status: 'delivered' as const, duplicate: false };
    });
  }

  async release(input: AssignmentDeliveryClaim) {
    const parsed = ClaimSchema.safeParse(input);
    if (!parsed.success) throw new AssignmentDeliveryRejected('invalid_lease');
    return this.transaction(async client => {
      const value = parsed.data;
      const result = await client.query('UPDATE private_assignment_delivery_leases SET leased_until=to_timestamp($4/1000.0) WHERE outbox_event_id=$1 AND event_id=$2 AND token_hash=$3', [value.outboxEventId,value.packet.payload.eventId,contentHash(value.token),this.clock()]);
      return result.rowCount === 1;
    });
  }

  async dispatchOne(transport: AssignmentDeliveryTransport, signal?: AbortSignal) {
    let claim: AssignmentDeliveryClaim | null = null;
    try {
      if (signal?.aborted) throw new AssignmentDeliveryRejected('delivery_unverified');
      claim = await this.claim();
      if (!claim) return { assurance: 'bounded' as const, status: 'idle' as const };
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(),10000);
      const boundedSignal = signal ? AbortSignal.any([signal,controller.signal]) : controller.signal;
      let listener: () => void = () => {};
      try {
        const aborted = new Promise<never>((_resolve,reject) => { listener = () => reject(new AssignmentDeliveryRejected('delivery_unverified')); if (boundedSignal.aborted) listener(); else boundedSignal.addEventListener('abort',listener,{ once: true }); });
        const response = await Promise.race([Promise.resolve().then(() => { if (boundedSignal.aborted) throw new AssignmentDeliveryRejected('delivery_unverified'); return transport.send(claim!.packet,boundedSignal); }),aborted]);
        return await this.acknowledge(claim,response);
      } finally { clearTimeout(timer); boundedSignal.removeEventListener('abort',listener); }
    } catch (error) {
      if (claim) { try { await this.release(claim); } catch {} }
      return { assurance: 'unverified' as const, status: 'retryable' as const, reason: error instanceof AssignmentDeliveryRejected ? error.code : 'delivery_unverified' };
    }
  }
}
