import type { KeyObject } from 'node:crypto';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { SessionActor } from '../../../packages/contracts/auth/store.js';
import { HashSchema, OpaqueIdSchema, VersionSchema } from '../../../packages/contracts/common.js';
import { canonicalize, byteHash, contentHash } from '../../../packages/contracts/hash.js';
import { WorkflowError } from '../../../packages/contracts/workflow/index.js';
import { compileApprovedWorkspace } from '../../../packages/compiler/approved-workspace.js';
import { stageReleaseCandidate } from './staging.js';

const RequestSchema = z.strictObject({ expectedVersion: VersionSchema, manifestHash: HashSchema });
export class ApprovedReleaseCompiler {
  constructor(private readonly pool: Pool, private readonly verificationKey: KeyObject) {}
  async compile(actor: SessionActor, id: string, body: unknown) {
    const request = RequestSchema.parse(JSON.parse(canonicalize(body)));
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (actor.role !== 'owner' || !OpaqueIdSchema.safeParse(actor.id).success || !HashSchema.safeParse(actor.sessionHash).success || !HashSchema.safeParse(actor.csrfHash).success) throw new WorkflowError('forbidden_role');
      const authority = await client.query(`SELECT account.id FROM private_accounts AS account JOIN private_sessions AS session ON session.account_id=account.id
        WHERE account.id=$1 AND account.role='owner' AND NOT account.disabled AND session.token_hash=$2 AND session.csrf_hash=$3 AND session.expires_at>now() FOR SHARE OF account,session`, [actor.id,actor.sessionHash,actor.csrfHash]);
      if (!authority.rows[0]) throw new WorkflowError('forbidden_role');
      const row = (await client.query(`SELECT candidate.version,candidate.state,candidate.manifest_hash,candidate.candidate,approval.manifest,signature.signature
        FROM private_release_candidates AS candidate JOIN private_release_approvals AS approval ON approval.id=candidate.id
        JOIN private_release_signatures AS signature ON signature.approval_id=approval.id
        JOIN private_intent_heads AS head ON head.id=candidate.intent_id
        JOIN private_intent_revisions AS intent ON intent.id=head.id AND intent.version=head.current_version
        WHERE candidate.id=$1 AND intent.state='approved' AND intent.version=candidate.intent_version
        AND intent.content_hash=candidate.approved_intent_hash AND intent.approved_hash=candidate.approved_intent_hash
        FOR SHARE OF candidate,approval,signature,head,intent`, [OpaqueIdSchema.parse(id)])).rows[0] as { version: number; state: string; manifest_hash: string; candidate: unknown; manifest: unknown; signature: string } | undefined;
      if (!row) throw new WorkflowError('missing_evidence');
      if (row.state !== 'approved' || row.version !== request.expectedVersion || row.manifest_hash !== request.manifestHash) throw new WorkflowError('stale_version');
      const contents = stageReleaseCandidate(row.candidate);
      if (contents.manifestHash !== row.manifest_hash || contentHash(row.manifest) !== row.manifest_hash) throw new WorkflowError('missing_evidence');
      const objects = (await client.query(`SELECT link.path,link.sha256,link.byte_count,object.payload FROM private_release_asset_links AS link
        JOIN private_release_objects AS object ON object.sha256=link.sha256 AND object.byte_count=link.byte_count WHERE link.approval_id=$1 ORDER BY link.path`, [id])).rows as { path: string; sha256: string; byte_count: number; payload: Buffer }[];
      if (objects.length !== contents.manifest.assets.length || objects.some(object => !Buffer.isBuffer(object.payload) || object.payload.length !== object.byte_count || byteHash(object.payload) !== object.sha256)) throw new WorkflowError('missing_evidence');
      const artifact = compileApprovedWorkspace({ manifest: row.manifest, manifestHash: row.manifest_hash, signature: row.signature, contract: contents.contract, listing: contents.listing, feedbackPolicy: contents.feedbackPolicy, paymentTerms: contents.paymentTerms, assets: objects.map(object => ({ path: object.path, contentBase64: object.payload.toString('base64') })) }, this.verificationKey);
      await client.query('COMMIT');
      return { ...artifact, taskId: contents.contract.taskId, taskVersion: contents.contract.version };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}
