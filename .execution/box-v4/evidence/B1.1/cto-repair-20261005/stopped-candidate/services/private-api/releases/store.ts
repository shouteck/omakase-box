import { createPrivateKey, randomUUID, sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import type { SessionActor } from '../../../packages/contracts/auth/store.js';
import { HashSchema, OpaqueIdSchema, VersionSchema } from '../../../packages/contracts/common.js';
import { canonicalize } from '../../../packages/contracts/hash.js';
import { WorkflowError } from '../../../packages/contracts/workflow/index.js';
import { stageReleaseCandidate } from './staging.js';

const StageSchema = z.strictObject({ intentId: OpaqueIdSchema, intentVersion: VersionSchema, approvedIntentHash: HashSchema, privateRevision: HashSchema, candidate: z.unknown() });
const ApprovalSchema = z.strictObject({ expectedVersion: VersionSchema, manifestHash: HashSchema, combinedDisclosureReviewed: z.literal(true), semanticDisclosureRationale: z.string().trim().min(1).max(4096) });
interface CandidateRow { id: string; task_id: string; task_version: number; intent_id: string; intent_version: number; approved_intent_hash: string; private_revision: string; candidate: unknown; manifest_hash: string; version: number; state: 'release_review' | 'approved' }
interface IntentRow { version: number; state: string; approved_hash: string; content_hash: string }
export class PrivateReleaseStore {
  private readonly key: KeyObject;
  constructor(private readonly pool: Pool, key: KeyObject | string | Buffer) {
    this.key = typeof key === 'string' || Buffer.isBuffer(key) ? createPrivateKey(key) : key;
    if (this.key.type !== 'private' || this.key.asymmetricKeyType !== 'ed25519') throw new Error('invalid_release_key');
  }
  private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); const result = await operation(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  private async owner(client: PoolClient, actor: SessionActor) {
    if (!actor || actor.role !== 'owner' || !OpaqueIdSchema.safeParse(actor.id).success || !HashSchema.safeParse(actor.sessionHash).success || !HashSchema.safeParse(actor.csrfHash).success) throw new WorkflowError('forbidden_role');
    const authority = await client.query(`SELECT account.role FROM private_accounts AS account
      JOIN private_sessions AS session ON session.account_id=account.id
      WHERE account.id=$1 AND account.role='owner' AND NOT account.disabled
      AND session.token_hash=$2 AND session.csrf_hash=$3 AND session.expires_at>now()
      FOR SHARE OF account, session`, [actor.id, actor.sessionHash, actor.csrfHash]);
    if (!authority.rows[0]) throw new WorkflowError('forbidden_role');
  }
  private async approvedIntent(client: PoolClient, id: string, version: number, hash: string) {
    const row = (await client.query(`SELECT revision.version,revision.state,revision.approved_hash,revision.content_hash
      FROM private_intent_heads AS head JOIN private_intent_revisions AS revision ON revision.id=head.id AND revision.version=head.current_version
      WHERE head.id=$1 FOR SHARE OF head, revision`, [id])).rows[0] as IntentRow | undefined;
    if (!row || row.state !== 'approved' || row.version !== version || row.approved_hash !== hash || row.content_hash !== hash) throw new WorkflowError('missing_evidence');
  }
  private async current(client: PoolClient, id: string) {
    const row = (await client.query('SELECT * FROM private_release_candidates WHERE id=$1 FOR UPDATE', [OpaqueIdSchema.parse(id)])).rows[0] as CandidateRow | undefined;
    if (!row) throw new WorkflowError('missing_evidence');
    const contents = stageReleaseCandidate(row.candidate);
    if (contents.manifestHash !== row.manifest_hash || contents.contract.taskId !== row.task_id || contents.contract.version !== row.task_version) throw new WorkflowError('missing_evidence');
    return { row, contents };
  }
  async stage(actor: SessionActor, input: unknown) {
    const parsed = StageSchema.parse(JSON.parse(canonicalize(input)));
    const contents = stageReleaseCandidate(parsed.candidate);
    return this.transaction(async client => {
      await this.owner(client, actor);
      await this.approvedIntent(client, parsed.intentId, parsed.intentVersion, parsed.approvedIntentHash);
      const id = randomUUID();
      const candidate = JSON.parse(canonicalize(parsed.candidate)) as unknown;
      await client.query(`INSERT INTO private_release_candidates
        (id,task_id,task_version,intent_id,intent_version,approved_intent_hash,private_revision,candidate,manifest_hash,staged_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [id,contents.contract.taskId,contents.contract.version,parsed.intentId,parsed.intentVersion,parsed.approvedIntentHash,parsed.privateRevision,candidate,contents.manifestHash,actor.id]);
      return { id, version: 1, ...contents };
    });
  }
  async review(actor: SessionActor, id: string) {
    return this.transaction(async client => {
      await this.owner(client, actor);
      const { row, contents } = await this.current(client, id);
      await this.approvedIntent(client, row.intent_id, row.intent_version, row.approved_intent_hash);
      return { ...contents, id: row.id, version: row.version, state: row.state, approval: row.state === 'approved' ? { manifestHash: row.manifest_hash } : null };
    });
  }
  async approve(actor: SessionActor, id: string, input: unknown) {
    const request = ApprovalSchema.parse(JSON.parse(canonicalize(input)));
    return this.transaction(async client => {
      await this.owner(client, actor);
      const { row, contents } = await this.current(client, id);
      if (row.version !== request.expectedVersion || row.manifest_hash !== request.manifestHash || row.state !== 'release_review') throw new WorkflowError('stale_version');
      await this.approvedIntent(client, row.intent_id, row.intent_version, row.approved_intent_hash);
      const signature = sign(null, Buffer.from(canonicalize(contents.manifest), 'utf8'), this.key).toString('base64');
      await client.query(`INSERT INTO private_release_approvals (id,task_id,task_version,manifest_hash,manifest,private_revision,owner_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`, [row.id,row.task_id,row.task_version,row.manifest_hash,contents.manifest,row.private_revision,actor.id]);
      for (const asset of contents.assets) {
        const bytes = Buffer.from(asset.contentBase64, 'base64');
        await client.query('INSERT INTO private_release_objects (sha256,byte_count,payload) VALUES ($1,$2,$3) ON CONFLICT (sha256) DO NOTHING', [asset.sha256,asset.byteSize,bytes]);
        const object = (await client.query('SELECT byte_count,payload FROM private_release_objects WHERE sha256=$1', [asset.sha256])).rows[0] as { byte_count: number; payload: Buffer } | undefined;
        if (!object || object.byte_count !== asset.byteSize || !Buffer.isBuffer(object.payload) || !object.payload.equals(bytes)) throw new WorkflowError('missing_evidence');
        await client.query('INSERT INTO private_release_asset_links (approval_id,path,sha256,byte_count) VALUES ($1,$2,$3,$4)', [row.id,asset.path,asset.sha256,asset.byteSize]);
      }
      await client.query('INSERT INTO private_release_signatures (approval_id,signature,semantic_rationale) VALUES ($1,$2,$3)', [row.id,signature,request.semanticDisclosureRationale]);
      await client.query("UPDATE private_release_candidates SET state='approved',version=version+1 WHERE id=$1 AND version=$2", [row.id,request.expectedVersion]);
      return { assurance: 'tested' as const, id: row.id, version: row.version + 1, state: 'approved' as const, manifestHash: row.manifest_hash, signature, packageReady: false as const };
    });
  }
}
