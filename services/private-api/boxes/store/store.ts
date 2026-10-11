import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import type { Pool, PoolClient } from 'pg';
import { tokenHash } from '../../../../packages/contracts/auth/crypto.js';
import { permits } from '../../../../packages/contracts/auth/policy.js';
import type { SessionActor } from '../../../../packages/contracts/auth/store.js';
import { IdSchema, OpaqueIdSchema } from '../../../../packages/contracts/common.js';
import { byteHash, contentHash } from '../../../../packages/contracts/hash.js';
import { importPinnedSnapshot } from '../../snapshots/importer.js';
import type { SnapshotSource } from '../../requests/types.js';
import { WorkflowError } from '../../../../packages/contracts/workflow/index.js';
import type { ActorRole } from '../../../../packages/contracts/workflow/index.js';
import {
  assertBoxTransition, assertNoRestrictedFields, AssignmentSchema, BehaviorArtifactSchema,
  BoxVersionSchema, EvaluationReceiptSchema, MergeRecordSchema, ReviewDecisionSchema
} from '../../../../packages/box-contracts/index.js';
import type { BoxOperation, BoxVersion } from '../../../../packages/box-contracts/index.js';

export type BoxAuth = SessionActor | { agentToken: string };
interface ScopedTokenRow { box_id: string; attempt_id: string | null; capability: string; actor_label: string }
interface BoxRow { box_id: string; version: number; state: string; payload: BoxVersion; content_hash: string; author_id: string }
interface AttemptRow { attempt_id: string; box_id: string; box_version: number; box_version_hash: string; executor_kind: string; executor_id: string; base_commit: string; worktree_ref: string | null; patch_hash: string | null; environment_digest: string; evaluator_digest: string; state: string; version: number }
interface RepositoryRow { repo_id: string; snapshot_id: string; source_id: string; source_root: string; base_commit: string; context_manifest: Record<string, unknown>; context_manifest_hash: string; environment_ref: unknown; evaluator_ref: unknown; merge_target: unknown; registered_by: string; registered_at: unknown }
export interface RepositoryRegistrationPlan { source: SnapshotSource; baseCommit: string; manifest: Record<string, unknown>; environmentRef: unknown; evaluatorRef: unknown; mergeTarget: unknown }

const isSession = (auth: BoxAuth): auth is SessionActor => !('agentToken' in auth);

function gitBlobSha(bytes: Buffer): string {
  return createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}`), Buffer.from([0]), bytes])).digest('hex');
}
async function gitLooseObject(root: string, sha: string): Promise<Buffer | null> {
  const raw = await readFile(join(root, '.git', 'objects', sha.slice(0, 2), sha.slice(2))).catch(() => null);
  if (raw === null) return null;
  try { return inflateSync(raw); } catch { throw new WorkflowError('missing_evidence'); }
}
async function gitHeadCommit(root: string): Promise<string | null> {
  const head = (await readFile(join(root, '.git', 'HEAD'), 'utf8').catch(() => null))?.trim();
  if (head === undefined || head === null) return null;
  if (head.startsWith('ref: ')) {
    const ref = head.slice(5);
    const loose = await readFile(join(root, '.git', ref), 'utf8').catch(() => null);
    if (loose !== null && /^[a-f0-9]{40}$/.test(loose.trim())) return loose.trim();
    const packed = await readFile(join(root, '.git', 'packed-refs'), 'utf8').catch(() => '');
    for (const line of packed.split('\n')) {
      const match = /^([a-f0-9]{40}) (\S+)$/.exec(line);
      if (match !== null && match[2] === ref && match[1] !== undefined) return match[1];
    }
    return null;
  }
  return /^[a-f0-9]{40}$/.test(head) ? head : null;
}
async function gitTreeFiles(root: string, treeSha: string, prefix: string, out: Map<string, string>): Promise<void> {
  const object = await gitLooseObject(root, treeSha);
  if (object === null) throw new WorkflowError('missing_evidence');
  const header = object.indexOf(0);
  if (header < 0 || !object.toString('utf8', 0, header).startsWith('tree ')) throw new WorkflowError('missing_evidence');
  let index = header + 1;
  while (index < object.length) {
    const space = object.indexOf(0x20, index);
    const mode = object.toString('utf8', index, space);
    const nul = object.indexOf(0, space + 1);
    const name = object.toString('utf8', space + 1, nul);
    const sha = object.subarray(nul + 1, nul + 21).toString('hex');
    const path = prefix + name;
    if (mode === '40000') await gitTreeFiles(root, sha, path + '/', out);
    else out.set(path, sha);
    index = nul + 21;
  }
}
async function verifyGitBaseline(root: string, baseCommit: string, files: readonly { path: string; content: string }[]): Promise<void> {
  const head = await gitHeadCommit(root);
  if (head === null || head !== baseCommit) throw new WorkflowError('missing_evidence');
  const commitObject = await gitLooseObject(root, baseCommit);
  if (commitObject === null || !commitObject.toString('utf8', 0, 7).startsWith('commit ')) throw new WorkflowError('missing_evidence');
  // The tree pointer is the first line of the commit body, directly after the NUL header terminator.
  const bodyStart = commitObject.indexOf(0) + 1;
  const bodyEnd = commitObject.indexOf(0x0a, bodyStart);
  const firstLine = bodyEnd < 0 ? commitObject.toString('utf8', bodyStart) : commitObject.toString('utf8', bodyStart, bodyEnd);
  const treeLine = /^tree ([a-f0-9]{40})$/.exec(firstLine);
  if (treeLine === null || treeLine[1] === undefined) throw new WorkflowError('missing_evidence');
  const tracked = new Map<string, string>();
  await gitTreeFiles(root, treeLine[1], '', tracked);
  for (const file of files) {
    const blob = gitBlobSha(Buffer.from(file.content, 'utf8'));
    if (tracked.get(file.path) !== blob) throw new WorkflowError('missing_evidence');
  }
}

export class BoxStore {
  constructor(private readonly pool: Pool) {}
  private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); const result = await operation(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  private async session(client: PoolClient, actor: SessionActor): Promise<ActorRole> {
    if (!OpaqueIdSchema.safeParse(actor.id).success || !/^[a-f0-9]{64}$/.test(actor.sessionHash) || !/^[a-f0-9]{64}$/.test(actor.csrfHash)) throw new WorkflowError('forbidden_role');
    const row = (await client.query(`SELECT account.role FROM private_accounts AS account
      JOIN private_sessions AS session ON session.account_id=account.id
      WHERE account.id=$1 AND account.role=$2 AND NOT account.disabled
      AND session.token_hash=$3 AND session.csrf_hash=$4 AND session.expires_at>now()
      FOR SHARE OF account, session`, [actor.id, actor.role, actor.sessionHash, actor.csrfHash])).rows[0];
    if (!row || !['requester', 'owner', 'operator'].includes(String(row.role))) throw new WorkflowError('forbidden_role');
    return row.role as ActorRole;
  }
  private async scoped(client: PoolClient, token: string): Promise<ScopedTokenRow> {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new WorkflowError('forbidden_role');
    const row = (await client.query('SELECT box_id,attempt_id,capability,actor_label FROM box_scoped_tokens WHERE token_hash=$1 AND expires_at>now()', [tokenHash(token)])).rows[0];
    if (!row) throw new WorkflowError('forbidden_role');
    return row as ScopedTokenRow;
  }
  private async requirePermission(client: PoolClient, actor: SessionActor, action: string): Promise<ActorRole> {
    const role = await this.session(client, actor);
    if (!permits('private', role, action)) throw new WorkflowError('forbidden_role');
    return role;
  }
  private actorId(auth: BoxAuth): string { return isSession(auth) ? auth.id : auth.agentToken; }
  private async idempotent<T>(client: PoolClient, actorId: string, operation: BoxOperation, key: string | undefined, request: unknown, run: () => Promise<T>): Promise<T & { replayed?: boolean }> {
    if (key === undefined) return run() as Promise<T & { replayed?: boolean }>;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(key)) throw new WorkflowError('missing_evidence');
    const requestHash = contentHash(request);
    const existing = (await client.query('SELECT request_hash,result FROM box_operation_keys WHERE actor_id=$1 AND operation=$2 AND key=$3', [actorId, operation, key])).rows[0];
    if (existing) {
      if (existing.request_hash !== requestHash) throw new WorkflowError('missing_evidence');
      return { ...(existing.result as T), replayed: true };
    }
    const result = await run();
    await client.query('INSERT INTO box_operation_keys (actor_id,operation,key,request_hash,result_hash,result) VALUES ($1,$2,$3,$4,$5,$6)', [actorId, operation, key, requestHash, contentHash(result), result]);
    return result as T & { replayed?: boolean };
  }
  private async head(client: PoolClient, boxId: string, expectedVersion?: number): Promise<BoxRow> {
    if (!OpaqueIdSchema.safeParse(boxId).success) throw new WorkflowError('forbidden_role');
    const row = (await client.query(`SELECT revision.* FROM box_heads AS head JOIN box_versions AS revision ON revision.box_id=head.box_id AND revision.version=head.current_version WHERE head.box_id=$1 FOR UPDATE OF head`, [boxId])).rows[0] as BoxRow | undefined;
    if (!row) throw new WorkflowError('missing_evidence');
    if (expectedVersion !== undefined && row.version !== expectedVersion) throw new WorkflowError('stale_version');
    return row;
  }
  private async attempt(client: PoolClient, attemptId: string, expectedVersion?: number): Promise<AttemptRow> {
    if (!OpaqueIdSchema.safeParse(attemptId).success) throw new WorkflowError('missing_evidence');
    const row = (await client.query('SELECT * FROM box_attempts WHERE attempt_id=$1 FOR UPDATE', [attemptId])).rows[0] as AttemptRow | undefined;
    if (!row) throw new WorkflowError('missing_evidence');
    if (expectedVersion !== undefined && row.version !== expectedVersion) throw new WorkflowError('stale_version');
    return row;
  }
  private async executorOf(client: PoolClient, auth: BoxAuth, boxId: string): Promise<{ kind: string; id: string; capability?: string }> {
    if (isSession(auth)) {
      await this.session(client, auth);
      return { kind: 'human', id: auth.id };
    }
    const token = await this.scoped(client, auth.agentToken);
    if (token.box_id !== boxId) throw new WorkflowError('forbidden_role');
    return { kind: 'agent', id: token.actor_label, capability: token.capability };
  }

  async createArtifact(actor: SessionActor, input: unknown) {
    const artifact = BehaviorArtifactSchema.parse(input);
    assertNoRestrictedFields(artifact);
    const hash = contentHash(artifact);
    return this.transaction(async client => {
      await this.requirePermission(client, actor, 'box.write');
      await client.query('INSERT INTO box_behavior_artifacts (artifact_id,payload,content_hash,intent_id,created_by) VALUES ($1,$2,$3,$4,$5)', [artifact.artifactId, artifact, hash, artifact.intent.intentId, actor.id]);
      return { artifactId: artifact.artifactId, contentHash: hash };
    });
  }
  async read(actor: SessionActor, boxId: string) {
    return this.transaction(async client => {
      await this.requirePermission(client, actor, 'box.read');
      const row = await this.head(client, boxId);
      const approval = (await client.query('SELECT approval_id,artifact_hash,approved_by,created_at FROM box_behavior_approvals WHERE box_id=$1 AND version=$2', [boxId, row.version])).rows[0];
      const superseded = (await client.query('SELECT EXISTS(SELECT 1 FROM box_behavior_approvals WHERE box_id=$1 AND version<$2) AS superseded', [boxId, row.version])).rows[0];
      return { boxId: row.box_id, version: row.version, state: row.state, contentHash: row.content_hash, version_payload: row.payload, approval: approval ?? null, supersededApproval: !approval && Boolean(superseded?.superseded) };
    });
  }
  async create(actor: SessionActor, input: unknown, key?: string) {
    const payload = BoxVersionSchema.parse(input);
    assertNoRestrictedFields(payload);
    if (payload.version !== 1) throw new WorkflowError('invalid_transition');
    const hash = contentHash(payload);
    return this.transaction(async client => {
      await this.requirePermission(client, actor, 'box.write');
      return this.idempotent(client, actor.id, 'create', key, { input: payload }, async () => {
        const artifact = (await client.query('SELECT 1 AS ok FROM box_behavior_artifacts WHERE artifact_id=$1 AND content_hash=$2', [payload.behaviorArtifact.artifactId, payload.behaviorArtifact.contentHash])).rows[0];
        if (!artifact) throw new WorkflowError('missing_evidence');
        await client.query('INSERT INTO box_versions (box_id,version,state,payload,content_hash,author_id) VALUES ($1,1,$2,$3,$4,$5)', [payload.boxId, 'draft', payload, hash, actor.id]);
        await client.query('INSERT INTO box_heads (box_id,current_version) VALUES ($1,1)', [payload.boxId]);
        return { boxId: payload.boxId, version: 1, contentHash: hash };
      });
    });
  }
  async revise(actor: SessionActor, input: unknown, expectedVersion: number, key?: string) {
    const payload = BoxVersionSchema.parse(input);
    assertNoRestrictedFields(payload);
    if (payload.version !== expectedVersion + 1) throw new WorkflowError('invalid_transition');
    const hash = contentHash(payload);
    return this.transaction(async client => {
      const role = await this.requirePermission(client, actor, 'box.write');
      const current = await this.head(client, payload.boxId, expectedVersion);
      if (role !== 'owner' && current.author_id !== actor.id) throw new WorkflowError('forbidden_role');
      return this.idempotent(client, actor.id, 'revise', key, { input: payload, expectedVersion }, async () => {
        const artifact = (await client.query('SELECT 1 AS ok FROM box_behavior_artifacts WHERE artifact_id=$1 AND content_hash=$2', [payload.behaviorArtifact.artifactId, payload.behaviorArtifact.contentHash])).rows[0];
        if (!artifact) throw new WorkflowError('missing_evidence');
        await client.query('INSERT INTO box_versions (box_id,version,state,payload,content_hash,author_id) VALUES ($1,$2,$3,$4,$5,$6)', [payload.boxId, payload.version, 'draft', payload, hash, current.author_id]);
        await client.query('UPDATE box_heads SET current_version=$2 WHERE box_id=$1 AND current_version=$3', [payload.boxId, payload.version, expectedVersion]);
        return { boxId: payload.boxId, version: payload.version, contentHash: hash, approvalInvalidated: true };
      });
    });
  }

  async approveBehavior(actor: SessionActor, boxId: string, expectedVersion: number, expectedHash: string, approvalId: string, key?: string) {
    if (!OpaqueIdSchema.safeParse(approvalId).success) throw new WorkflowError('missing_evidence');
    return this.transaction(async client => {
      const role = await this.requirePermission(client, actor, 'box.behavior.approve');
      if (role !== 'owner') throw new WorkflowError('forbidden_role');
      const current = await this.head(client, boxId, expectedVersion);
      if (current.content_hash !== expectedHash) throw new WorkflowError('missing_evidence');
      const executor = (await client.query('SELECT 1 AS ok FROM box_assignments WHERE box_id=$1 AND box_version=$2 AND executor_id=$3', [boxId, expectedVersion, actor.id])).rows[0];
      if (executor) throw new WorkflowError('forbidden_role');
      return this.idempotent(client, actor.id, 'approve-behavior', key, { boxId, expectedVersion, expectedHash, approvalId }, async () => {
        await client.query('INSERT INTO box_behavior_approvals (approval_id,box_id,version,artifact_hash,approved_by) VALUES ($1,$2,$3,$4,$5)', [approvalId, boxId, expectedVersion, current.payload.behaviorArtifact.contentHash, actor.id]);
        return { approvalId, boxId, version: expectedVersion, artifactHash: current.payload.behaviorArtifact.contentHash };
      });
    });
  }
  async transition(actor: SessionActor, boxId: string, expectedVersion: number, to: 'open' | 'closed' | 'cancelled') {
    return this.transaction(async client => {
      const role = await this.requirePermission(client, actor, 'box.write');
      const current = await this.head(client, boxId, expectedVersion);
      if (role !== 'owner' && current.author_id !== actor.id) throw new WorkflowError('forbidden_role');
      assertBoxTransition('version', current.state, to);
      if (to === 'open') {
        const approval = (await client.query('SELECT 1 AS ok FROM box_behavior_approvals WHERE box_id=$1 AND version=$2', [boxId, expectedVersion])).rows[0];
        if (!approval) throw new WorkflowError('missing_evidence');
      }
      await client.query('UPDATE box_versions SET state=$3 WHERE box_id=$1 AND version=$2', [boxId, expectedVersion, to]);
      return { boxId, version: expectedVersion, state: to };
    });
  }
  async assign(actor: SessionActor, input: unknown, mintToken: boolean, key?: string) {
    const assignment = AssignmentSchema.parse(input);
    assertNoRestrictedFields(assignment);
    return this.transaction(async client => {
      const role = await this.requirePermission(client, actor, 'box.assign');
      if (role !== 'owner') throw new WorkflowError('forbidden_role');
      const version = (await client.query('SELECT * FROM box_versions WHERE box_id=$1 AND version=$2 FOR UPDATE', [assignment.boxId, assignment.boxVersion])).rows[0] as BoxRow | undefined;
      if (!version || contentHash(version.payload) !== assignment.boxVersionHash) throw new WorkflowError('missing_evidence');
      if (!version.payload.attemptPolicy.allowedExecutorKinds.includes(assignment.executor.kind)) throw new WorkflowError('invalid_transition');
      return this.idempotent(client, actor.id, 'assign', key, { input: assignment, mintToken }, async () => {
        await client.query('INSERT INTO box_assignments (assignment_id,box_id,box_version,box_version_hash,executor_kind,executor_id,capability,assigned_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [assignment.assignmentId, assignment.boxId, assignment.boxVersion, assignment.boxVersionHash, assignment.executor.kind, assignment.executor.actorId, assignment.capability, actor.id]);
        let token: string | null = null;
        if (mintToken && assignment.executor.kind !== 'human') {
          token = randomBytes(32).toString('hex');
          await client.query("INSERT INTO box_scoped_tokens (token_hash,box_id,attempt_id,capability,actor_label,expires_at,created_by) VALUES ($1,$2,$3,$4,$5,now()+interval '1 hour',$6)", [tokenHash(token), assignment.boxId, null, assignment.capability, assignment.executor.actorId, actor.id]);
        }
        return { assignmentId: assignment.assignmentId, token };
      });
    });
  }

  async openAttempt(auth: BoxAuth, boxId: string, expectedVersion: number, input: { attemptId: string; worktreeRef?: string | null; environmentDigest: string; evaluatorDigest: string }, key?: string) {
    if (!OpaqueIdSchema.safeParse(input.attemptId).success) throw new WorkflowError('missing_evidence');
    return this.transaction(async client => {
      const executor = await this.executorOf(client, auth, boxId);
      const current = await this.head(client, boxId, expectedVersion);
      if (current.state !== 'open') throw new WorkflowError('invalid_transition');
      const approval = (await client.query('SELECT 1 AS ok FROM box_behavior_approvals WHERE box_id=$1 AND version=$2', [boxId, expectedVersion])).rows[0];
      if (!approval) throw new WorkflowError('missing_evidence');
      if (!current.payload.attemptPolicy.allowedExecutorKinds.includes(executor.kind as 'human')) throw new WorkflowError('forbidden_role');
      if (!isSession(auth)) {
        const token = await this.scoped(client, (auth as { agentToken: string }).agentToken);
        if (token.capability !== 'attempt.execute') throw new WorkflowError('forbidden_role');
      } else {
        await this.requirePermission(client, auth, 'box.attempt');
      }
      const assignment = (await client.query("SELECT executor_kind FROM box_assignments WHERE box_id=$1 AND box_version=$2 AND executor_id=$3 AND capability='attempt.execute'", [boxId, expectedVersion, executor.id])).rows[0] as { executor_kind: string } | undefined;
      if (!assignment) throw new WorkflowError('forbidden_role');
      executor.kind = assignment.executor_kind;
      const attempts = (await client.query('SELECT count(*) AS count FROM box_attempts WHERE box_id=$1 AND box_version=$2', [boxId, expectedVersion])).rows[0];
      if (Number(attempts?.count ?? 0) >= current.payload.attemptPolicy.maxAttempts) throw new WorkflowError('invalid_transition');
      return this.idempotent(client, executor.id, 'open-attempt', key, { boxId, expectedVersion, input }, async () => {
        await client.query('INSERT INTO box_attempts (attempt_id,box_id,box_version,box_version_hash,executor_kind,executor_id,base_commit,worktree_ref,environment_digest,evaluator_digest,state,version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1)', [input.attemptId, boxId, expectedVersion, current.content_hash, executor.kind, executor.id, current.payload.baseCommit, input.worktreeRef ?? null, input.environmentDigest, input.evaluatorDigest, 'open']);
        return { attemptId: input.attemptId, boxVersionHash: current.content_hash, version: 1 };
      });
    });
  }
  async submitAttempt(auth: BoxAuth, attemptId: string, expectedVersion: number, patchHash: string, worktreeRef?: string | null, key?: string) {
    if (!/^[a-f0-9]{64}$/.test(patchHash)) throw new WorkflowError('missing_evidence');
    return this.transaction(async client => {
      const attempt = await this.attempt(client, attemptId, expectedVersion);
      const executor = await this.executorOf(client, auth, attempt.box_id);
      if (executor.id !== attempt.executor_id) throw new WorkflowError('forbidden_role');
      if (!isSession(auth)) {
        const token = await this.scoped(client, (auth as { agentToken: string }).agentToken);
        if (token.capability !== 'attempt.execute' || (token.attempt_id !== null && token.attempt_id !== attemptId)) throw new WorkflowError('forbidden_role');
      }
      assertBoxTransition('attempt', attempt.state, 'submitted');
      return this.idempotent(client, executor.id, 'submit-attempt', key, { attemptId, expectedVersion, patchHash, worktreeRef }, async () => {
        await client.query('UPDATE box_attempts SET state=$3,patch_hash=$4,worktree_ref=$5,version=version+1 WHERE attempt_id=$1 AND version=$2', [attemptId, expectedVersion, 'submitted', patchHash, worktreeRef ?? attempt.worktree_ref ?? null]);
        return { attemptId, version: expectedVersion + 1, state: 'submitted' };
      });
    });
  }
  async recordEvaluation(auth: BoxAuth, input: unknown, key?: string) {
    const receipt = EvaluationReceiptSchema.parse(input);
    assertNoRestrictedFields(receipt);
    return this.transaction(async client => {
      const attempt = await this.attempt(client, receipt.attemptId);
      let recordedBy: string;
      if (isSession(auth)) {
        await this.requirePermission(client, auth, 'evaluation.operate');
        recordedBy = auth.id;
      } else {
        const token = await this.scoped(client, auth.agentToken);
        if (token.capability !== 'attempt.evaluate' || token.box_id !== attempt.box_id || (token.attempt_id !== null && token.attempt_id !== receipt.attemptId)) throw new WorkflowError('forbidden_role');
        recordedBy = token.actor_label;
      }
      if (receipt.boxVersionHash !== attempt.box_version_hash || receipt.evaluatorDigest !== attempt.evaluator_digest || receipt.environmentDigest !== attempt.environment_digest || receipt.recordedBy !== recordedBy) throw new WorkflowError('missing_evidence');
      return this.idempotent(client, recordedBy, 'record-evaluation', key, { input: receipt }, async () => {
        await client.query('INSERT INTO box_evaluation_receipts (receipt_id,attempt_id,box_version_hash,environment_digest,evaluator_digest,outcome,payload,recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [receipt.receiptId, receipt.attemptId, receipt.boxVersionHash, receipt.environmentDigest, receipt.evaluatorDigest, receipt.outcome, receipt, recordedBy]);
        return { receiptId: receipt.receiptId };
      });
    });
  }

  async review(actor: SessionActor, input: unknown, key?: string) {
    const decision = ReviewDecisionSchema.parse(input);
    assertNoRestrictedFields(decision);
    if (decision.reviewerId !== actor.id) throw new WorkflowError('forbidden_role');
    return this.transaction(async client => {
      await this.requirePermission(client, actor, 'box.review');
      const attempt = await this.attempt(client, decision.attemptId);
      if (attempt.box_id !== decision.boxId || attempt.box_version_hash !== decision.boxVersionHash) throw new WorkflowError('missing_evidence');
      if (attempt.executor_id === actor.id) throw new WorkflowError('forbidden_role');
      if (attempt.state !== 'submitted') throw new WorkflowError('invalid_transition');
      if (attempt.patch_hash === null || decision.candidateHash !== attempt.patch_hash) throw new WorkflowError('missing_evidence');
      return this.idempotent(client, actor.id, 'review', key, { input: decision }, async () => {
        await client.query('INSERT INTO box_review_decisions (review_id,attempt_id,box_id,box_version_hash,candidate_hash,verdict,reviewer_id,rationale) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [decision.reviewId, decision.attemptId, decision.boxId, decision.boxVersionHash, decision.candidateHash, decision.verdict, actor.id, decision.rationale]);
        return { reviewId: decision.reviewId };
      });
    });
  }
  async approveMerge(actor: SessionActor, input: { approvalId: string; boxId: string; attemptId: string; reviewId: string; expectedTargetCommit: string }, key?: string) {
    for (const id of [input.approvalId, input.boxId, input.attemptId, input.reviewId]) if (!OpaqueIdSchema.safeParse(id).success) throw new WorkflowError('missing_evidence');
    return this.transaction(async client => {
      const role = await this.requirePermission(client, actor, 'box.merge.approve');
      if (role !== 'owner') throw new WorkflowError('forbidden_role');
      const attempt = await this.attempt(client, input.attemptId);
      if (attempt.box_id !== input.boxId) throw new WorkflowError('missing_evidence');
      if (attempt.executor_id === actor.id) throw new WorkflowError('forbidden_role');
      const version = (await client.query('SELECT * FROM box_versions WHERE box_id=$1 AND version=$2', [attempt.box_id, attempt.box_version])).rows[0] as BoxRow | undefined;
      if (!version) throw new WorkflowError('missing_evidence');
      const review = (await client.query("SELECT * FROM box_review_decisions WHERE review_id=$1 AND attempt_id=$2", [input.reviewId, input.attemptId])).rows[0] as { verdict: string; candidate_hash: string } | undefined;
      if (!review || review.verdict !== 'approved' || review.candidate_hash !== attempt.patch_hash) throw new WorkflowError('missing_evidence');
      if (input.expectedTargetCommit !== version.payload.mergeTarget.expectedCommit || attempt.base_commit !== version.payload.baseCommit) throw new WorkflowError('stale_version');
      return this.idempotent(client, actor.id, 'approve-merge', key, { input }, async () => {
        await client.query('INSERT INTO box_merge_approvals (approval_id,box_id,attempt_id,review_id,target_ref,base_commit,candidate_hash,approved_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [input.approvalId, input.boxId, input.attemptId, input.reviewId, version.payload.mergeTarget.branch, version.payload.baseCommit, review.candidate_hash, actor.id]);
        return { approvalId: input.approvalId };
      });
    });
  }
  async applyMerge(actor: SessionActor, input: unknown, key?: string) {
    const record = MergeRecordSchema.parse(input);
    assertNoRestrictedFields(record);
    if (record.mergeOwnerId !== actor.id) throw new WorkflowError('forbidden_role');
    if (record.state === 'applied' && record.resultCommit === null) throw new WorkflowError('missing_evidence');
    return this.transaction(async client => {
      const role = await this.requirePermission(client, actor, 'box.merge.approve');
      if (role !== 'owner') throw new WorkflowError('forbidden_role');
      const approval = (await client.query('SELECT * FROM box_merge_approvals WHERE approval_id=$1 FOR UPDATE', [record.approvalId])).rows[0] as { approval_id: string; box_id: string; attempt_id: string; candidate_hash: string; target_ref: string; approved_by: string } | undefined;
      if (!approval || approval.box_id !== record.boxId || approval.attempt_id !== record.attemptId || approval.target_ref !== record.targetRef) throw new WorkflowError('missing_evidence');
      if (approval.approved_by !== actor.id) throw new WorkflowError('forbidden_role');
      const attempt = await this.attempt(client, record.attemptId);
      if (attempt.executor_id === actor.id) throw new WorkflowError('forbidden_role');
      if (record.sourceCandidateHash !== approval.candidate_hash) throw new WorkflowError('missing_evidence');
      return this.idempotent(client, actor.id, 'apply-merge', key, { input: record }, async () => {
        await client.query('INSERT INTO box_merge_records (merge_id,approval_id,box_id,attempt_id,source_candidate_hash,target_ref,result_commit,state,applied_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [record.mergeId, record.approvalId, record.boxId, record.attemptId, record.sourceCandidateHash, record.targetRef, record.resultCommit, record.state, actor.id]);
        return { mergeId: record.mergeId };
      });
    });
  }

  async registerRepository(actor: SessionActor, plan: RepositoryRegistrationPlan, key?: string) {
    if (!/^[a-f0-9]{40}$/.test(plan.baseCommit)) throw new WorkflowError('missing_evidence');
    if (plan.manifest === null || typeof plan.manifest !== 'object' || Array.isArray(plan.manifest)) throw new WorkflowError('missing_evidence');
    return this.transaction(async client => {
      await this.requirePermission(client, actor, 'snapshot.import');
      return this.idempotent(client, actor.id, 'create', key, { kind: 'box-repository-registration', sourceId: plan.source.id, baseCommit: plan.baseCommit, manifest: plan.manifest, environmentRef: plan.environmentRef, evaluatorRef: plan.evaluatorRef, mergeTarget: plan.mergeTarget }, async () => {
        const snapshot = await importPinnedSnapshot(plan.source.root, plan.source.paths);
        await verifyGitBaseline(plan.source.root, plan.baseCommit, snapshot.files);
        const fileRoles = plan.manifest.fileRoles as Record<string, string> | undefined;
        const manifest = { ...plan.manifest, schemaVersion: 1, files: snapshot.files.map(file => ({ path: file.path, bytes: file.bytes, sha256: file.sha256, role: typeof fileRoles?.[file.path] === 'string' ? fileRoles[file.path] : 'explanatory' })) };
        const contextManifestHash = contentHash(manifest);
        for (const file of snapshot.files) {
          const bytes = Buffer.from(file.content, 'utf8');
          const sha256 = byteHash(bytes);
          if (sha256 !== file.sha256) throw new Error('snapshot_encoding_mismatch');
          await client.query('INSERT INTO private_intake_objects (sha256,byte_count,payload) VALUES ($1,$2,$3) ON CONFLICT (sha256) DO NOTHING', [sha256, bytes.length, bytes]);
        }
        const snapshotManifest = { schemaVersion: 1, files: snapshot.files.map(({ content: _content, ...metadata }) => metadata) };
        await client.query('INSERT INTO private_snapshots (id,snapshot_hash,manifest,file_count,registered_by) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (snapshot_hash) DO NOTHING', [randomUUID(), snapshot.snapshotHash, snapshotManifest, snapshot.files.length, actor.id]);
        const snapshotRow = (await client.query('SELECT id,snapshot_hash,file_count FROM private_snapshots WHERE snapshot_hash=$1', [snapshot.snapshotHash])).rows[0];
        if (!snapshotRow) throw new Error('snapshot_unavailable');
        await client.query('INSERT INTO private_snapshot_provenance (id,snapshot_id,source_id,source_root,actor_id) VALUES ($1,$2,$3,$4,$5)', [randomUUID(), snapshotRow.id, plan.source.id, plan.source.root, actor.id]);
        const repoId = 'repo-' + randomUUID();
        await client.query('INSERT INTO box_repository_registrations (repo_id,snapshot_id,source_id,source_root,base_commit,context_manifest,context_manifest_hash,environment_ref,evaluator_ref,merge_target,registered_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (snapshot_id,base_commit,context_manifest_hash) DO NOTHING', [repoId, snapshotRow.id, plan.source.id, plan.source.root, plan.baseCommit, manifest, contextManifestHash, plan.environmentRef, plan.evaluatorRef, plan.mergeTarget, actor.id]);
        const row = (await client.query('SELECT repo_id,snapshot_id,base_commit,context_manifest_hash FROM box_repository_registrations WHERE snapshot_id=$1 AND base_commit=$2 AND context_manifest_hash=$3', [snapshotRow.id, plan.baseCommit, contextManifestHash])).rows[0];
        if (!row) throw new Error('repository_registration_unavailable');
        return { repoId: String(row.repo_id), snapshotId: String(row.snapshot_id), snapshotHash: String(snapshotRow.snapshot_hash), fileCount: Number(snapshotRow.file_count), baseCommit: String(row.base_commit), contextManifestHash: String(row.context_manifest_hash) };
      });
    });
  }
  async registeredRepository(actor: SessionActor, repoId: string) {
    if (!IdSchema.safeParse(repoId).success) throw new WorkflowError('missing_evidence');
    return this.transaction(async client => {
      await this.requirePermission(client, actor, 'box.read');
      const row = (await client.query('SELECT registration.*,snapshot.snapshot_hash FROM box_repository_registrations AS registration JOIN private_snapshots AS snapshot ON snapshot.id=registration.snapshot_id WHERE registration.repo_id=$1', [repoId])).rows[0] as (RepositoryRow & { snapshot_hash: string }) | undefined;
      if (!row) throw new WorkflowError('missing_evidence');
      return { repoId: row.repo_id, snapshotId: row.snapshot_id, snapshotHash: row.snapshot_hash, sourceId: row.source_id, sourceRoot: row.source_root, baseCommit: row.base_commit, contextManifest: row.context_manifest, contextManifestHash: row.context_manifest_hash, environmentRef: row.environment_ref, evaluatorRef: row.evaluator_ref, mergeTarget: row.merge_target, registeredBy: row.registered_by, registeredAt: row.registered_at };
    });
  }
  async createPrepared(actor: SessionActor, input: { artifact: unknown; version: unknown }, key?: string, operationRequest?: unknown) {
    const artifact = BehaviorArtifactSchema.parse(input.artifact);
    const payload = BoxVersionSchema.parse(input.version);
    assertNoRestrictedFields(artifact);
    assertNoRestrictedFields(payload);
    if (payload.version !== 1) throw new WorkflowError('invalid_transition');
    const artifactHash = contentHash(artifact);
    if (payload.behaviorArtifact.artifactId !== artifact.artifactId || payload.behaviorArtifact.contentHash !== artifactHash || payload.intent.intentId !== artifact.intent.intentId) throw new WorkflowError('missing_evidence');
    const hash = contentHash(payload);
    return this.transaction(async client => {
      await this.requirePermission(client, actor, 'box.write');
      // Derived payloads carry fresh random ids, so a supplied operation request is what the key binds:
      // an identical request replays the recorded result and a different one conflicts.
      return this.idempotent(client, actor.id, 'create', key, operationRequest ?? { input: { artifact, version: payload } }, async () => {
        await client.query('INSERT INTO box_behavior_artifacts (artifact_id,payload,content_hash,intent_id,created_by) VALUES ($1,$2,$3,$4,$5)', [artifact.artifactId, artifact, artifactHash, artifact.intent.intentId, actor.id]);
        await client.query('INSERT INTO box_versions (box_id,version,state,payload,content_hash,author_id) VALUES ($1,1,$2,$3,$4,$5)', [payload.boxId, 'draft', payload, hash, actor.id]);
        await client.query('INSERT INTO box_heads (box_id,current_version) VALUES ($1,1)', [payload.boxId]);
        return { boxId: payload.boxId, version: 1, contentHash: hash };
      });
    });
  }
  async revisePrepared(actor: SessionActor, boxId: string, expectedVersion: number, input: { artifact: unknown; version: unknown }, key?: string) {
    const artifact = BehaviorArtifactSchema.parse(input.artifact);
    const payload = BoxVersionSchema.parse(input.version);
    assertNoRestrictedFields(artifact);
    assertNoRestrictedFields(payload);
    if (payload.version !== expectedVersion + 1) throw new WorkflowError('invalid_transition');
    if (payload.boxId !== boxId) throw new WorkflowError('missing_evidence');
    const artifactHash = contentHash(artifact);
    if (payload.behaviorArtifact.artifactId !== artifact.artifactId || payload.behaviorArtifact.contentHash !== artifactHash || payload.intent.intentId !== artifact.intent.intentId) throw new WorkflowError('missing_evidence');
    const hash = contentHash(payload);
    return this.transaction(async client => {
      const role = await this.requirePermission(client, actor, 'box.write');
      const current = await this.head(client, boxId, expectedVersion);
      if (role !== 'owner' && current.author_id !== actor.id) throw new WorkflowError('forbidden_role');
      return this.idempotent(client, actor.id, 'revise', key, { boxId, expectedVersion, input: { artifact, version: payload } }, async () => {
        await client.query('INSERT INTO box_behavior_artifacts (artifact_id,payload,content_hash,intent_id,created_by) VALUES ($1,$2,$3,$4,$5)', [artifact.artifactId, artifact, artifactHash, artifact.intent.intentId, actor.id]);
        await client.query('INSERT INTO box_versions (box_id,version,state,payload,content_hash,author_id) VALUES ($1,$2,$3,$4,$5,$6)', [payload.boxId, payload.version, 'draft', payload, hash, current.author_id]);
        await client.query('UPDATE box_heads SET current_version=$2 WHERE box_id=$1 AND current_version=$3', [payload.boxId, payload.version, expectedVersion]);
        return { boxId: payload.boxId, version: payload.version, contentHash: hash, approvalInvalidated: true };
      });
    });
  }
  async readPrepared(actor: SessionActor, boxId: string) {
    const head = await this.read(actor, boxId);
    return this.transaction(async client => {
      await this.requirePermission(client, actor, 'box.read');
      const artifact = (await client.query('SELECT payload FROM box_behavior_artifacts WHERE artifact_id=$1 AND content_hash=$2', [head.version_payload.behaviorArtifact.artifactId, head.version_payload.behaviorArtifact.contentHash])).rows[0];
      if (!artifact) throw new WorkflowError('missing_evidence');
      const repoId = (head.version_payload as { repoId?: unknown }).repoId;
      const repository = typeof repoId === 'string'
        ? (await client.query('SELECT * FROM box_repository_registrations WHERE repo_id=$1', [repoId])).rows[0] as RepositoryRow | undefined
        : undefined;
      return { ...head, artifact: artifact.payload as unknown, repository: repository ?? null };
    });
  }
}
