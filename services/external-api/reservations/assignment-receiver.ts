import { createPrivateKey, randomUUID, type KeyObject } from 'node:crypto';
import { signAssignmentReceipt } from './assignment-receipt.js';
import type { Pool, PoolClient } from 'pg';
import { ExternalTaskContractSchema } from '../../../packages/contracts/public/index.js';
import { contentHash } from '../../../packages/contracts/hash.js';
import { AssignmentCommandRejected, SignedCommandPacketSchema, verifyAssignmentCommand, verifyRevocationCommand, type AssignmentCommand, type InvitationRevocationCommand } from './assignment-protocol.js';

export const ASSIGNMENT_COMMAND_DDL = `
CREATE TABLE external_assignment_command_claims (
  event_id uuid PRIMARY KEY,
  nonce uuid NOT NULL UNIQUE,
  assignment_id uuid NOT NULL,
  task_id uuid NOT NULL,
  task_version integer NOT NULL CHECK (task_version > 0),
  package_digest char(64) NOT NULL CHECK (package_digest ~ '^[a-f0-9]{64}$'),
  payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$')
);
CREATE FUNCTION external_assignment_claim_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'assignment_claim_immutable';
END;
$$;
CREATE TRIGGER external_assignment_claim_preserved BEFORE UPDATE OR DELETE ON external_assignment_command_claims FOR EACH ROW EXECUTE FUNCTION external_assignment_claim_immutable();
`;

function parsePacket(input: unknown) {
  try {
    return SignedCommandPacketSchema.parse(input);
  } catch {
    throw new AssignmentCommandRejected('invalid_command');
  }
}

interface CommandBinding { assignmentId: string; taskId: string; taskVersion: number; packageDigest: string; eventId: string; nonce: string }
interface ReceiveResult { schemaVersion: 1; assignmentId: string; taskId: string; taskVersion: number; status: 'recorded'; duplicate: boolean }

export class SqlAssignmentCommandReceiver {
  private readonly receiptKey: KeyObject | undefined;
  constructor(private readonly pool: Pool, private readonly verificationKey: KeyObject | string | Buffer, receiptSigningKey?: KeyObject | string | Buffer) {
    this.receiptKey = typeof receiptSigningKey === 'string' || Buffer.isBuffer(receiptSigningKey) ? createPrivateKey(receiptSigningKey) : receiptSigningKey;
    if (this.receiptKey && (this.receiptKey.type !== 'private' || this.receiptKey.asymmetricKeyType !== 'ed25519')) throw new Error('invalid_assignment_receipt_key');
  }
  async receiveSigned(input: unknown, nowMs?: number) {
    if (!this.receiptKey) throw new AssignmentCommandRejected('persistence_unavailable');
    const now = nowMs ?? Date.now(), packet = parsePacket(input);
    const command = packet.payload.audience === 'external-assignment-invitation-revocation/v1' ? verifyRevocationCommand(packet, this.verificationKey, now) : verifyAssignmentCommand(packet, this.verificationKey, now);
    const result = await this.receive(packet, now);
    return signAssignmentReceipt(command, result, this.receiptKey, now);
  }
  async receive(input: unknown, nowMs = Date.now()): Promise<ReceiveResult> {
    const packet = parsePacket(input);
    const audience = packet.payload.audience;
    if (audience === 'external-assignment/v1') return this.applyAssignment(verifyAssignmentCommand(packet, this.verificationKey, nowMs), nowMs);
    if (audience === 'external-assignment-invitation-revocation/v1') return this.applyRevocation(verifyRevocationCommand(packet, this.verificationKey, nowMs), nowMs);
    throw new AssignmentCommandRejected('invalid_command');
  }

  private async transaction(operation: (client: PoolClient) => Promise<ReceiveResult>): Promise<ReceiveResult> {
    let client: PoolClient;
    try { client = await this.pool.connect(); }
    catch { throw new AssignmentCommandRejected('persistence_unavailable'); }
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error instanceof AssignmentCommandRejected ? error : new AssignmentCommandRejected('persistence_unavailable');
    } finally { client.release(); }
  }

  private async claim(client: PoolClient, binding: CommandBinding, payloadHash: string) {
    const claimed = await client.query('INSERT INTO external_assignment_command_claims (event_id,nonce,assignment_id,task_id,task_version,package_digest,payload_hash) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING event_id', [binding.eventId,binding.nonce,binding.assignmentId,binding.taskId,binding.taskVersion,binding.packageDigest,payloadHash]);
    if (claimed.rowCount) return true;
    const existing = (await client.query('SELECT payload_hash FROM external_assignment_command_claims WHERE event_id=$1 AND nonce=$2', [binding.eventId,binding.nonce])).rows[0];
    if (!existing || existing.payload_hash !== payloadHash) throw new AssignmentCommandRejected('replay');
    return false;
  }

  private async releasedBinding(client: PoolClient, binding: CommandBinding) {
    const task = (await client.query('SELECT released.contract,released.package_sha256 FROM external_published_tasks AS released JOIN external_task_versions AS binding ON binding.id=released.task_id AND binding.version=released.version AND binding.package_hash=released.package_sha256 AND NOT binding.withdrawn WHERE released.task_id=$1 AND released.version=$2 FOR SHARE OF released,binding', [binding.taskId,binding.taskVersion])).rows[0];
    if (!task || task.package_sha256 !== binding.packageDigest) throw new AssignmentCommandRejected('task_unavailable');
    const contract = ExternalTaskContractSchema.parse(task.contract);
    if (contract.taskId !== binding.taskId || contract.version !== binding.taskVersion) throw new AssignmentCommandRejected('task_unavailable');
  }

  private async applyAssignment(command: AssignmentCommand, nowMs: number): Promise<ReceiveResult> {
    return this.transaction(async client => {
      await this.releasedBinding(client, command);
      if (command.executor.contributorId && !(await client.query('SELECT 1 FROM external_accounts WHERE id=$1 AND NOT disabled FOR SHARE', [command.executor.contributorId])).rowCount) throw new AssignmentCommandRejected('task_unavailable');
      await this.claim(client, command, contentHash(command));
      const inserted = await client.query("INSERT INTO external_task_assignments (id,task_id,task_version,executor_kind,executor_label,contributor_id,status,chosen_by,created_at) VALUES ($1,$2,$3,$4,$5,$6,'open','owner-approved',to_timestamp($7/1000.0)) ON CONFLICT DO NOTHING RETURNING id", [command.assignmentId,command.taskId,command.taskVersion,command.executor.kind,command.executor.label,command.executor.contributorId ?? null,nowMs]);
      const assignment = (await client.query('SELECT id,executor_kind,executor_label,contributor_id FROM external_task_assignments WHERE task_id=$1 AND task_version=$2 FOR SHARE', [command.taskId,command.taskVersion])).rows[0];
      if (!assignment || assignment.id !== command.assignmentId || assignment.executor_kind !== command.executor.kind || assignment.executor_label !== command.executor.label || assignment.contributor_id !== (command.executor.contributorId ?? null)) throw new AssignmentCommandRejected('assignment_conflict');
      if (command.invitation) {
        await client.query('INSERT INTO external_task_invitations (id,assignment_id,token_hash,contributor_id,expires_at,revoked,redeemed_at) VALUES ($1,$2,$3,$4,$5,false,NULL) ON CONFLICT (assignment_id) DO NOTHING', [randomUUID(),command.assignmentId,command.invitation.tokenHash,command.invitation.contributorId,command.invitation.expiresAt]);
        const invitation = (await client.query('SELECT contributor_id,token_hash,expires_at FROM external_task_invitations WHERE assignment_id=$1 FOR SHARE', [command.assignmentId])).rows[0];
        if (!invitation || invitation.contributor_id !== command.invitation.contributorId || invitation.token_hash !== command.invitation.tokenHash || new Date(invitation.expires_at).getTime() !== Date.parse(command.invitation.expiresAt)) throw new AssignmentCommandRejected('assignment_conflict');
      }
      return { schemaVersion: 1 as const, assignmentId: command.assignmentId, taskId: command.taskId, taskVersion: command.taskVersion, status: 'recorded' as const, duplicate: !inserted.rowCount };
    });
  }

  private async applyRevocation(command: InvitationRevocationCommand, nowMs: number): Promise<ReceiveResult> {
    return this.transaction(async client => {
      await this.releasedBinding(client, command);
      const assignment = (await client.query('SELECT id,contributor_id FROM external_task_assignments WHERE id=$1 AND task_id=$2 AND task_version=$3 FOR SHARE', [command.assignmentId,command.taskId,command.taskVersion])).rows[0];
      if (!assignment || assignment.contributor_id !== command.contributorId) throw new AssignmentCommandRejected('task_unavailable');
      const invitation = (await client.query('SELECT id,contributor_id,token_hash,redeemed_at FROM external_task_invitations WHERE assignment_id=$1 FOR UPDATE', [command.assignmentId])).rows[0];
      if (!invitation || invitation.contributor_id !== command.contributorId || invitation.token_hash !== command.tokenHash) throw new AssignmentCommandRejected('task_unavailable');
      const fresh = await this.claim(client, command, contentHash(command));
      if (invitation.redeemed_at === null) await client.query('UPDATE external_task_invitations SET revoked=true WHERE assignment_id=$1 AND redeemed_at IS NULL', [command.assignmentId]);
      return { schemaVersion: 1 as const, assignmentId: command.assignmentId, taskId: command.taskId, taskVersion: command.taskVersion, status: 'recorded' as const, duplicate: !fresh };
    });
  }
}
