import { createPublicKey, type KeyObject } from 'node:crypto';
import type { PoolClient } from 'pg';
import { contentHash, byteHash } from '../../../packages/contracts/hash.js';
import { WorkflowError } from '../../../packages/contracts/workflow/index.js';
import { compileApprovedWorkspace } from '../../../packages/compiler/approved-workspace.js';
import { stageReleaseCandidate } from '../releases/staging.js';
import type { AssignmentReadinessGate } from './store.js';

/**
 * Fail-closed assignment readiness (M6.2). An exact task version is ready only
 * when an approved release candidate, its approval-bound signature and the
 * approved intent head still verify inside the same transaction; the package
 * digest is recomputed deterministically from the approved content, never
 * trusted from a stored claim. Expensive by design on this synthetic MVP.
 */
export function releaseReadinessGate(verificationKey: KeyObject | string | Buffer): AssignmentReadinessGate {
  const key = typeof verificationKey === 'string' || Buffer.isBuffer(verificationKey) ? createPublicKey(verificationKey) : verificationKey;
  if (key.type !== 'public' || key.asymmetricKeyType !== 'ed25519') throw new Error('invalid_release_verification_key');
  return async (client: PoolClient, taskId: string, taskVersion: number) => {
    const row = (await client.query(`SELECT candidate.id,candidate.candidate,candidate.manifest_hash,approval.manifest,signature.signature
      FROM private_release_candidates AS candidate
      JOIN private_release_approvals AS approval ON approval.id=candidate.id
      JOIN private_release_signatures AS signature ON signature.approval_id=approval.id
      JOIN private_intent_heads AS head ON head.id=candidate.intent_id
      JOIN private_intent_revisions AS intent ON intent.id=head.id AND intent.version=head.current_version
      WHERE candidate.task_id=$1 AND candidate.task_version=$2 AND candidate.state='approved'
      AND intent.state='approved' AND intent.version=candidate.intent_version
      AND intent.content_hash=candidate.approved_intent_hash AND intent.approved_hash=candidate.approved_intent_hash
      ORDER BY candidate.version DESC LIMIT 1 FOR SHARE OF candidate,approval,signature,head,intent`, [taskId, taskVersion])).rows[0] as { id: string; candidate: unknown; manifest_hash: string; manifest: unknown; signature: string } | undefined;
    if (!row) return null;
    const contents = stageReleaseCandidate(row.candidate);
    if (contents.manifestHash !== row.manifest_hash || contentHash(row.manifest) !== row.manifest_hash) throw new WorkflowError('missing_evidence');
    const objects = (await client.query(`SELECT link.path,link.sha256,link.byte_count,object.payload FROM private_release_asset_links AS link
      JOIN private_release_objects AS object ON object.sha256=link.sha256 AND object.byte_count=link.byte_count WHERE link.approval_id=$1 ORDER BY link.path`, [row.id])).rows as { path: string; sha256: string; byte_count: number; payload: Buffer }[];
    if (objects.length !== contents.manifest.assets.length || objects.some(object => !Buffer.isBuffer(object.payload) || object.payload.length !== object.byte_count || byteHash(object.payload) !== object.sha256)) throw new WorkflowError('missing_evidence');
    const artifact = compileApprovedWorkspace({ manifest: row.manifest, manifestHash: row.manifest_hash, signature: row.signature, contract: contents.contract, listing: contents.listing, feedbackPolicy: contents.feedbackPolicy, paymentTerms: contents.paymentTerms, assets: objects.map(object => ({ path: object.path, contentBase64: object.payload.toString('base64') })) }, key);
    return { taskId: contents.contract.taskId, taskVersion: contents.contract.version, packageDigest: artifact.sha256, ready: true };
  };
}
