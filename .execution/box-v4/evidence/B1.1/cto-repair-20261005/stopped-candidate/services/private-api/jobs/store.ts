import { createHash, createPublicKey, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { canonicalize, byteHash } from '../../../packages/contracts/hash.js';
import { HashSchema } from '../../../packages/contracts/common.js';
import { WorkflowError } from '../../../packages/contracts/workflow/index.js';
import type { SessionActor } from '../../../packages/contracts/auth/store.js';
import { DEFAULT_LIMITS, HarnessId, JobSchema, LeaseSchema, SignedResultSchema, canonical as canonicalProtocol, trustedHarness, verifyTrustedResult } from '../../../packages/runner-protocol/index.js';
import type { Lease, TrustedResult } from '../../../packages/runner-protocol/index.js';
import {
  aggregateAuthoritativeOutcome,
  anomalyEvidence,
  buildInternalEvaluationResult,
  infrastructureEvidence,
  trimCapture,
  verifiedResultEvidence,
  PAYLOAD_DIGEST_INPUT_LIMIT
} from '../../../packages/evaluation/runner-results/index.js';
import type {
  AnomalyCause,
  EvidenceClass,
  EvidenceRecord,
  EvaluationOutcome,
  InfrastructureCause,
  JobBinding,
  JobKind,
  VerifiedCheck
} from '../../../packages/evaluation/runner-results/index.js';
import { ANOMALY_PAYLOAD_LIMIT, DEADLINE_WINDOW_MS, INTERRUPTION_CAUSES, JobBindingConflict, JobInvalid, RESULT_RECORD_LIMIT, assertJobOperator } from './types.js';
import type { InterruptionCause, ResultOutcome } from './types.js';
import { EVALUATION_JOB_DDL } from './ddl.js';

const EnqueueInputSchema = z.strictObject({
  evaluationId: z.uuid(),
  jobKind: z.enum(['public', 'private']),
  attemptId: z.uuid(),
  artifactHash: HashSchema,
  imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  harnessId: HarnessId,
  harnessDigest: HashSchema,
  requiredCheckIds: z.array(z.string().regex(/^[a-zA-Z0-9_.-]{1,80}$/)).min(1).max(1024).refine(ids => new Set(ids).size === ids.length),
  deadlineMs: z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
});

interface EvaluationRow {
  id: string; version: number; state: string; superseded: boolean; permit_id: string; submission_id: string;
  task_id: string; task_version: number; submission_hash: string; package_hash: string; private_base_revision: string;
}
interface JobRow {
  id: string; evaluation_id: string; evaluation_version: number; permit_id: string; attempt_id: string; submission_id: string;
  task_id: string; task_version: number; job_kind: JobKind; profile: string; job_state: string; version: number;
  submission_hash: string; package_hash: string; private_base_revision: string; artifact_hash: string; image_digest: string;
  harness_id: string; harness_digest: string; required_check_ids: unknown; deadline_ms: string;
  lease_id: string | null; lease_profile: string | null; lease_baseline_digest: string | null; lease_bound_at: Date | string | null;
  authoritative_log_digest: string | null; authoritative_class: EvidenceClass | null; authoritative_outcome: ResultOutcome | null;
  authoritative_cause: string | null; authoritative_result_sequence: number | null;
  created_at: Date | string; ended_at: Date | string | null;
}
interface ResultRow { evidence_class: EvidenceClass; result_outcome: ResultOutcome; cause: string; outcome_checks: unknown; log_digest: string | null; payload_digest: string | null }
interface StoredLogsRow { log_digest: string; bytes: Buffer; byte_count: number; original_byte_count: number; complete: boolean }

export const JOB_COLUMNS = 'id,evaluation_id,evaluation_version,permit_id,attempt_id,submission_id,task_id,task_version,job_kind,profile,job_state,version,submission_hash,package_hash,private_base_revision,artifact_hash,image_digest,harness_id,harness_digest,required_check_ids,deadline_ms,lease_id,lease_profile,lease_baseline_digest,lease_bound_at,authoritative_log_digest,authoritative_class,authoritative_outcome,authoritative_cause,authoritative_result_sequence,created_at,ended_at';

const SUPPORTED_HARNESS = new Set<string>(['pure-module/v1', 'frontend/v1', 'backend-api/v1', 'application-policy/v1', 'composed/v1']);
const JOB_TERMINAL_STATES = new Set(['completed', 'cancelled']);
const CHECK_ID_PATTERN = /^[a-zA-Z0-9_.-]{1,80}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMAGE_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && value.constructor === Object;
}

function requireUuid(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw new JobInvalid(`${label}_damaged`);
}

function requireHash(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new JobInvalid(`${label}_damaged`);
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function bindingOf(row: JobRow): JobBinding {
  return {
    jobId: row.id,
    jobKind: row.job_kind,
    packageHash: row.package_hash,
    submissionHash: row.submission_hash,
    artifactHash: row.artifact_hash,
    imageDigest: row.image_digest,
    harnessId: row.harness_id,
    harnessDigest: row.harness_digest,
    revision: { taskId: row.task_id, taskVersion: row.task_version, privateBaseRevision: row.private_base_revision }
  };
}

function trustedRecordFor(row: JobRow, result: TrustedResult) {
  return {
    jobId: row.id,
    jobKind: row.job_kind,
    packageHash: row.package_hash,
    submissionHash: row.submission_hash,
    artifactHash: row.artifact_hash,
    imageDigest: row.image_digest,
    harnessId: row.harness_id,
    harnessDigest: row.harness_digest,
    outcome: result.outcome,
    checks: result.checks,
    logDigest: result.logDigest
  };
}

/** Stable bounded digest over a delivered signed result input for replay detection. Delivered bytes are never stored. */
function deliveredDigest(input: unknown): string {
  const parsed = SignedResultSchema.safeParse(input);
  if (parsed.success) return byteHash(Buffer.from(canonicalProtocol(parsed.data), 'utf8'));
  let text: string;
  if (typeof input === 'string') text = input;
  else {
    try { text = canonicalize(input); }
    catch { text = JSON.stringify(input, (_, value) => typeof value === 'bigint' ? value.toString() : value) ?? 'unknown_input'; }
  }
  if (Buffer.byteLength(text) > PAYLOAD_DIGEST_INPUT_LIMIT) throw new JobInvalid('result_deliverable_too_large');
  return byteHash(Buffer.from(text, 'utf8').subarray(0, ANOMALY_PAYLOAD_LIMIT));
}

function classifyRunnerError(error: unknown): AnomalyCause {
  const message = error instanceof Error ? error.message : '';
  if (message === 'Unauthenticated runner result.') return 'unauthenticated_result';
  if (message === 'Runner result binding mismatch.') return 'binding_mismatch';
  if (message === 'Stale runner result.') return 'stale_result';
  if (message === 'Incomplete runner result.') return 'incomplete_result';
  if (message === 'Contradictory runner verdict.') return 'contradictory_result';
  return 'malformed_result';
}

/** Deterministic marker digest so unverified completions keep a bounded log identity when no bytes exist. */
function unverifiedLogMarker(cause: string, payloadDigest: string | null): string {
  return createHash('sha256').update(`unverified:${cause}:${payloadDigest ?? 'no_delivered_input'}`, 'utf8').digest('hex');
}

function buildChecks(raw: unknown): VerifiedCheck[] {
  if (!Array.isArray(raw)) throw new JobInvalid('result_checks_damaged');
  const checks: VerifiedCheck[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.checkId !== 'string' || !CHECK_ID_PATTERN.test(entry.checkId)) throw new JobInvalid('result_checks_damaged');
    if (entry.outcome !== 'passed' && entry.outcome !== 'failed' && entry.outcome !== 'unverified') throw new JobInvalid('result_checks_damaged');
    checks.push({ checkId: entry.checkId, outcome: entry.outcome });
  }
  return checks;
}

function uniqueViolation(error: unknown): boolean {
  const code = (error as { code?: unknown }).code;
  const constraint = (error as { constraint?: unknown }).constraint;
  return code === '23505' && typeof constraint === 'string' && constraint.startsWith('private_evaluation_jobs');
}

export interface EnqueuedJob {
  created: boolean; jobId: string; jobKind: JobKind; jobState: 'queued'; version: number;
  immutableBinding: { artifactHash: string; imageDigest: string; harnessId: string; harnessDigest: string; attemptId: string };
}
export interface LeaseReport { jobId: string; leaseId: string; jobState: 'running'; version: number }
export interface ResultReport {
  jobId: string; recorded: boolean; evidenceClass: EvidenceClass; outcome: ResultOutcome;
  cause: string | null; payloadDigest: string | null; authoritativeLogDigest: string | null;
  jobState: 'queued' | 'running' | 'completed' | 'cancelled'; version: number; evaluationUpdate: 'applied' | 'skipped';
}
export interface JobRead {
  jobId: string; evaluationId: string; evaluationVersion: number; jobKind: JobKind; jobState: 'queued' | 'running' | 'completed' | 'cancelled'; version: number;
  attemptId: string; submissionId: string; taskId: string; taskVersion: number;
  submissionHash: string; packageHash: string; privateBaseRevision: string;
  artifactHash: string; imageDigest: string; harnessId: string; harnessDigest: string;
  requiredCheckIds: readonly string[]; deadlineMs: number;
  lease: { leaseId: string; boundAt: string } | null;
  authoritative: { evidenceClass: EvidenceClass; outcome: ResultOutcome; cause: string; logDigest: string; resultSequence: number } | null;
  createdAt: string; endedAt: string | null;
}
export interface LogRead { jobId: string; digest: string; byteCount: number; originalByteCount: number; complete: boolean; bytes: Buffer }
export interface CleanupReport { jobId: string; jobState: 'cancelled'; version: number; logsDiscarded: boolean }

function sameBinding(row: JobRow, parsed: z.infer<typeof EnqueueInputSchema>): boolean {
  if (!Array.isArray(row.required_check_ids) || row.required_check_ids.length !== parsed.requiredCheckIds.length) return false;
  for (let index = 0; index < row.required_check_ids.length; index++) if (row.required_check_ids[index] !== parsed.requiredCheckIds[index]) return false;
  return row.attempt_id === parsed.attemptId && row.artifact_hash === parsed.artifactHash
    && row.image_digest === parsed.imageDigest && row.harness_id === parsed.harnessId && row.harness_digest === parsed.harnessDigest;
}

export class EvaluationJobStore {
  /** DDL source of truth for coordinator migration; the store binds it to the private pool in isolated synthetic tests. */
  readonly evaluationJobDdl = EVALUATION_JOB_DDL;
  constructor(private readonly pool: Pool) {}

  private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); const result = await operation(client); await client.query('COMMIT'); return result; }
    catch (error) { try { await client.query('ROLLBACK'); } catch { /* broken connection aborts with the transaction */ } throw error; }
    finally { client.release(); }
  }

  private async authoritativeEvaluation(client: PoolClient, evaluationId: string): Promise<EvaluationRow> {
    requireUuid(evaluationId, 'evaluation');
    const row = (await client.query('SELECT id,version,state,superseded,permit_id,submission_id,task_id,task_version,submission_hash,package_hash,private_base_revision FROM private_evaluations WHERE id=$1 FOR UPDATE', [evaluationId])).rows[0] as EvaluationRow | undefined;
    if (!row) throw new WorkflowError('missing_evidence');
    return row;
  }

  private async evaluationIdForJob(client: PoolClient, jobId: string): Promise<string> {
    requireUuid(jobId, 'job');
    const row = (await client.query('SELECT evaluation_id FROM private_evaluation_jobs WHERE id=$1', [jobId])).rows[0] as { evaluation_id: string } | undefined;
    if (!row) throw new WorkflowError('missing_evidence');
    return row.evaluation_id;
  }

  private async jobRow(client: PoolClient, jobId: string): Promise<JobRow> {
    const row = (await client.query(`SELECT ${JOB_COLUMNS} FROM private_evaluation_jobs WHERE id=$1 FOR UPDATE`, [jobId])).rows[0] as JobRow | undefined;
    if (!row) throw new WorkflowError('missing_evidence');
    return row;
  }

  private async requiresEvaluationOperator(client: PoolClient, actor: SessionActor): Promise<void> {
    assertJobOperator(actor);
    const row = (await client.query(`SELECT account.role FROM private_accounts AS account
      JOIN private_sessions AS session ON session.account_id=account.id
      WHERE account.id=$1 AND account.role=$2 AND NOT account.disabled
      AND session.token_hash=$3 AND session.csrf_hash=$4 AND session.expires_at>now()
      FOR SHARE OF account, session`, [actor.id, actor.role, actor.sessionHash, actor.csrfHash])).rows[0];
    if (!row) throw new WorkflowError('forbidden_role');
  }

  private async approvedImageAndChecks(client: PoolClient, taskId: string, taskVersion: number): Promise<{ imageDigest: string; publishedCheckIds: readonly string[] }> {
    const approval = (await client.query('SELECT manifest FROM private_release_approvals WHERE task_id=$1 AND task_version=$2', [taskId, taskVersion])).rows[0] as { manifest: unknown } | undefined;
    if (!approval || !isRecord(approval.manifest) || !(IMAGE_DIGEST_PATTERN.test(String((approval.manifest as Record<string, unknown>).executionImageDigest)))) throw new WorkflowError('missing_evidence');
    const candidate = (await client.query("SELECT candidate FROM private_release_candidates WHERE task_id=$1 AND task_version=$2 AND state='approved'", [taskId, taskVersion])).rows[0] as { candidate: unknown } | undefined;
    if (!candidate || !isRecord(candidate.candidate)) throw new WorkflowError('missing_evidence');
    const contract = (candidate.candidate as Record<string, unknown>).contract;
    if (!isRecord(contract) || !Array.isArray((contract as Record<string, unknown>).publicChecks)) throw new WorkflowError('missing_evidence');
    const publishedCheckIds: string[] = [];
    for (const entry of (contract as Record<string, unknown>).publicChecks as unknown[]) {
      if (!isRecord(entry) || typeof entry.id !== 'string' || !CHECK_ID_PATTERN.test(entry.id)) throw new WorkflowError('missing_evidence');
      publishedCheckIds.push(entry.id);
    }
    return { imageDigest: (approval.manifest as Record<string, unknown>).executionImageDigest as string, publishedCheckIds: Object.freeze(publishedCheckIds) };
  }

  /** Transactional enqueue against an authoritative attempt permit context (never a client assertion). */
  async enqueue(actor: SessionActor, input: unknown): Promise<EnqueuedJob> {
    const parsed = EnqueueInputSchema.parse(input);
    try { return await this.enqueueOnce(actor, parsed, false); }
    catch (error) {
      if (uniqueViolation(error)) return this.enqueueOnce(actor, parsed, true);
      throw error;
    }
  }

  private async enqueueOnce(actor: SessionActor, parsed: z.infer<typeof EnqueueInputSchema>, retry: boolean): Promise<EnqueuedJob> {
    return this.transaction(async client => {
      await this.requiresEvaluationOperator(client, actor);
      const evaluation = await this.authoritativeEvaluation(client, parsed.evaluationId);
      const existing = (await client.query(`SELECT ${JOB_COLUMNS} FROM private_evaluation_jobs WHERE evaluation_id=$1 AND job_kind=$2 FOR SHARE`, [evaluation.id, parsed.jobKind])).rows[0] as JobRow | undefined;
      if (existing) {
        if (!sameBinding(existing, parsed)) throw new JobBindingConflict();
        return { created: false, jobId: existing.id, jobKind: existing.job_kind, jobState: 'queued', version: existing.version, immutableBinding: { artifactHash: existing.artifact_hash, imageDigest: existing.image_digest, harnessId: existing.harness_id, harnessDigest: existing.harness_digest, attemptId: existing.attempt_id } };
      }
      if (evaluation.superseded) throw new WorkflowError('missing_evidence');
      if (!retry) {
        const sibling = (await client.query('SELECT attempt_id FROM private_evaluation_jobs WHERE evaluation_id=$1 AND job_kind<>$2 LIMIT 1', [evaluation.id, parsed.jobKind])).rows[0] as { attempt_id: string } | undefined;
        if (sibling && sibling.attempt_id !== parsed.attemptId) throw new JobBindingConflict();
        if (evaluation.state !== (parsed.jobKind === 'public' ? 'received' : 'public_evaluating')) throw new WorkflowError('invalid_transition');
        const authority = await this.approvedImageAndChecks(client, evaluation.task_id, evaluation.task_version);
        if (authority.imageDigest !== parsed.imageDigest) throw new JobInvalid('image_authority_mismatch');
        if (parsed.jobKind === 'public' && JSON.stringify([...parsed.requiredCheckIds]) !== JSON.stringify([...authority.publishedCheckIds])) throw new WorkflowError('missing_evidence');
        if (trustedHarness(parsed.harnessId).digest !== parsed.harnessDigest) throw new JobInvalid('harness_authority_mismatch');
        const now = Date.now();
        if (!Number.isSafeInteger(parsed.deadlineMs) || parsed.deadlineMs <= now || parsed.deadlineMs > now + DEADLINE_WINDOW_MS) throw new JobInvalid('invalid_job_deadline');
      }
      const jobId = randomUUID();
      await client.query(`INSERT INTO private_evaluation_jobs
        (id,evaluation_id,evaluation_version,permit_id,attempt_id,submission_id,task_id,task_version,job_kind,profile,protocol_version,job_state,version,submission_hash,package_hash,private_base_revision,artifact_hash,image_digest,harness_id,harness_digest,required_check_ids,deadline_ms)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1,'queued',1,$11,$12,$13,$14,$15,$16,$17,$18,$19)`, [jobId, evaluation.id, evaluation.version, evaluation.permit_id, parsed.attemptId, evaluation.submission_id, evaluation.task_id, evaluation.task_version, parsed.jobKind, 'dedicated-linux-kvm-fresh-vm', evaluation.submission_hash, evaluation.package_hash, evaluation.private_base_revision, parsed.artifactHash, parsed.imageDigest, parsed.harnessId, parsed.harnessDigest, JSON.stringify([...parsed.requiredCheckIds]), parsed.deadlineMs.toString()]);
      await client.query('UPDATE private_evaluations SET state=$2, version=version+1 WHERE id=$1', [evaluation.id, parsed.jobKind === 'public' ? 'public_evaluating' : 'private_evaluating']);
      return { created: true, jobId, jobKind: parsed.jobKind, jobState: 'queued', version: 1, immutableBinding: { artifactHash: parsed.artifactHash, imageDigest: parsed.imageDigest, harnessId: parsed.harnessId, harnessDigest: parsed.harnessDigest, attemptId: parsed.attemptId } };
    });
  }

  /** Bind the lease identity immutably and move the job to running. */
  async assumeLease(jobId: string, leaseInput: unknown): Promise<LeaseReport> {
    let lease: Lease;
    try { lease = LeaseSchema.parse(leaseInput); } catch { throw new JobInvalid('invalid_lease'); }
    return this.transaction(async client => {
      await this.authoritativeEvaluation(client, await this.evaluationIdForJob(client, jobId));
      const row = await this.jobRow(client, jobId);
      if (row.job_state !== 'queued') throw new WorkflowError('invalid_transition');
      if (lease.jobId !== row.id) throw new JobInvalid('lease_job_mismatch');
      await client.query(`UPDATE private_evaluation_jobs SET job_state='running', version=version+1, lease_id=$2, lease_profile=$3, lease_baseline_digest=$4, lease_bound_at=now() WHERE id=$1`, [row.id, lease.leaseId, lease.profile, lease.baselineDigest]);
      const updated = (await client.query('SELECT version FROM private_evaluation_jobs WHERE id=$1', [row.id])).rows[0] as { version: number };
      return { jobId: row.id, leaseId: lease.leaseId, jobState: 'running', version: updated.version };
    });
  }

  /**
   * Record a delivered, signed runner result against the immutable job binding.
   * Verified results require bounded matching log bytes when bytes are passed.
   * Every anomaly is recorded unverified and never becomes passing evidence.
   */
  async recordResult(jobId: string, signedInput: unknown, publicKey: string, logs: Uint8Array | null = null, now: number = Date.now()): Promise<ResultReport> {
    try { createPublicKey(publicKey); } catch { throw new JobInvalid('result_public_key_key'); }
    return this.transaction(async client => {
      await this.authoritativeEvaluation(client, await this.evaluationIdForJob(client, jobId));
      const row = await this.jobRow(client, jobId);
      const storedDigest = await this.captureLogs(client, row.id, logs);
      const payload = deliveredDigest(signedInput);
      if (row.job_state !== 'running') {
        const replayed = await this.payloadSeenBefore(client, row.id, payload);
        return this.applyAnomaly(client, row, replayed ? 'replayed_result' : 'late_result', payload, storedDigest);
      }
      let trusted: TrustedResult;
      try { trusted = verifyTrustedResult(signedInput, this.protocolJobOf(row), this.protocolLeaseOf(row), publicKey, now); }
      catch (error) { return this.applyAnomaly(client, row, classifyRunnerError(error), payload, storedDigest); }
      if (storedDigest !== null && storedDigest !== trusted.logDigest) return this.applyAnomaly(client, row, 'log_mismatch', payload, storedDigest);
      if (trusted.outcome === 'unverified') return this.applyRunnerUnverified(client, row, payload, storedDigest ?? trusted.logDigest);
      return this.applyVerified(client, row, trusted, payload, storedDigest ?? trusted.logDigest);
    });
  }

  /** Runner-side timeout report while the job is running. */
  async recordTimeout(jobId: string, logs: Uint8Array | null = null): Promise<ResultReport> {
    return this.recordInterruptionLike(jobId, 'timeout', logs);
  }

  /** Runner/controller interruption report for lost or unavailable jobs. */
  async recordInterruption(jobId: string, cause: InterruptionCause, logs: Uint8Array | null = null): Promise<ResultReport> {
    if (!INTERRUPTION_CAUSES.includes(cause)) throw new JobInvalid('invalid_interruption_cause');
    return this.recordInterruptionLike(jobId, cause, logs);
  }

  private async recordInterruptionLike(jobId: string, cause: InterruptionCause | 'timeout', logs: Uint8Array | null): Promise<ResultReport> {
    return this.transaction(async client => {
      await this.authoritativeEvaluation(client, await this.evaluationIdForJob(client, jobId));
      const row = await this.jobRow(client, jobId);
      if (JOB_TERMINAL_STATES.has(row.job_state)) {
        return { jobId: row.id, recorded: false, evidenceClass: 'infrastructure', outcome: 'infrastructure', cause: null, payloadDigest: null, authoritativeLogDigest: row.authoritative_log_digest, jobState: row.job_state as ResultReport['jobState'], version: row.version, evaluationUpdate: 'skipped' };
      }
      if (row.job_state !== 'running' && cause === 'timeout') throw new JobInvalid('invalid_timeout_state');
      if (row.job_state !== 'queued' && row.job_state !== 'running') throw new WorkflowError('invalid_transition');
      const storedDigest = await this.captureLogs(client, row.id, logs);
      const sequence = await this.insertResultRow(client, row.id, { evidenceClass: 'infrastructure', outcome: 'infrastructure', cause, checks: [], logDigest: storedDigest, payloadDigest: null });
      if (sequence === 0) return { jobId: row.id, recorded: false, evidenceClass: 'infrastructure', outcome: 'infrastructure', cause: null, payloadDigest: null, authoritativeLogDigest: storedDigest, jobState: row.job_state as ResultReport['jobState'], version: row.version, evaluationUpdate: 'skipped' };
      const logDigest = storedDigest ?? unverifiedLogMarker(cause, null);
      await this.completeJob(client, row, 'infrastructure', 'infrastructure', cause, sequence, logDigest);
      const applied = await this.advanceEvaluation(client, row.evaluation_id, row.job_kind, 'infrastructure_failure', null);
      return { jobId: row.id, recorded: true, evidenceClass: 'infrastructure', outcome: 'infrastructure', cause, payloadDigest: null, authoritativeLogDigest: logDigest, jobState: 'completed', version: row.version + 1, evaluationUpdate: applied ? 'applied' : 'skipped' };
    });
  }

  /** Cancel one job with an explicit expected version; never touches another job or workspace. */
  async cancel(actor: SessionActor, jobId: string, expectedVersion: number): Promise<CleanupReport> {
    return this.transaction(async client => {
      await this.requiresEvaluationOperator(client, actor);
      await this.authoritativeEvaluation(client, await this.evaluationIdForJob(client, jobId));
      const row = await this.jobRow(client, jobId);
      if (row.job_state === 'cancelled') {
        if (row.version !== expectedVersion) throw new WorkflowError('stale_version');
        return { jobId: row.id, jobState: 'cancelled', version: row.version, logsDiscarded: false };
      }
      if (row.job_state !== 'queued' && row.job_state !== 'running') throw new WorkflowError('invalid_transition');
      if (row.version !== expectedVersion) throw new WorkflowError('stale_version');
      const cancelled = await client.query(`UPDATE private_evaluation_jobs SET job_state='cancelled', version=version+1, ended_at=now() WHERE id=$1 AND version=$2 AND job_state IN ('queued','running')`, [row.id, expectedVersion]);
      if (cancelled.rowCount !== 1) throw new WorkflowError('stale_version');
      return { jobId: row.id, jobState: 'cancelled', version: row.version + 1, logsDiscarded: false };
    });
  }

  /** Scoped cleanup: cancel when active and discard only this job's stored log bytes. */
  async cleanup(actor: SessionActor, jobId: string, expectedVersion: number): Promise<CleanupReport> {
    return this.transaction(async client => {
      await this.requiresEvaluationOperator(client, actor);
      await this.authoritativeEvaluation(client, await this.evaluationIdForJob(client, jobId));
      const row = await this.jobRow(client, jobId);
      if (row.job_state === 'completed') throw new WorkflowError('invalid_transition');
      let finalVersion: number;
      if (row.job_state === 'cancelled') {
        if (row.version !== expectedVersion) throw new WorkflowError('stale_version');
        finalVersion = row.version;
      } else {
        if (row.version !== expectedVersion) throw new WorkflowError('stale_version');
        const cancelled = await client.query(`UPDATE private_evaluation_jobs SET job_state='cancelled', version=version+1, ended_at=now() WHERE id=$1 AND version=$2 AND job_state IN ('queued','running')`, [row.id, expectedVersion]);
        if (cancelled.rowCount !== 1) throw new WorkflowError('stale_version');
        finalVersion = row.version + 1;
      }
      const removed = await client.query('DELETE FROM private_evaluation_job_logs WHERE job_id=$1', [row.id]);
      return { jobId: row.id, jobState: 'cancelled', version: finalVersion, logsDiscarded: removed.rowCount === 1 };
    });
  }

  private async payloadSeenBefore(client: PoolClient, jobId: string, payloadDigest: string): Promise<boolean> {
    const row = (await client.query('SELECT 1 AS seen FROM private_evaluation_job_results WHERE job_id=$1 AND payload_digest=$2 LIMIT 1', [jobId, payloadDigest])).rows[0];
    return row !== undefined;
  }

  private async insertResultRow(client: PoolClient, jobId: string, values: { evidenceClass: EvidenceClass; outcome: ResultOutcome; cause: string; checks: readonly VerifiedCheck[]; logDigest: string | null; payloadDigest: string | null }): Promise<number> {
    const current = (await client.query('SELECT COALESCE(MAX(recorded_sequence),0)+1 AS next FROM private_evaluation_job_results WHERE job_id=$1', [jobId])).rows[0] as { next: number };
    if (current.next > RESULT_RECORD_LIMIT) return 0;
    await client.query(`INSERT INTO private_evaluation_job_results
      (job_id,recorded_sequence,evidence_class,result_outcome,cause,outcome_checks,log_digest,payload_digest)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [jobId, current.next, values.evidenceClass, values.outcome, values.cause, JSON.stringify([...values.checks]), values.logDigest, values.payloadDigest]);
    return current.next;
  }

  private async completeJob(client: PoolClient, row: JobRow, evidenceClass: EvidenceClass, outcome: ResultOutcome, cause: string, sequence: number, logDigest: string): Promise<void> {
    const update = await client.query(`UPDATE private_evaluation_jobs SET
      job_state='completed', version=version+1, authoritative_log_digest=$2, authoritative_class=$3,
      authoritative_outcome=$4, authoritative_cause=$5, authoritative_result_sequence=$6, ended_at=now() WHERE id=$1`, [row.id, logDigest, evidenceClass, outcome, cause, sequence]);
    if (update.rowCount !== 1) throw new WorkflowError('stale_version');
  }

  /** Evaluation state mapping; a failed precondition is skipped, never silently accepted. */
  private async advanceEvaluation(client: PoolClient, evaluationId: string, kind: JobKind, to: 'changes_required' | 'infrastructure_failure' | 'owner_review', payload: unknown): Promise<boolean> {
    const from = kind === 'public' ? 'public_evaluating' : 'private_evaluating';
    const update = payload === null
      ? await client.query('UPDATE private_evaluations SET state=$2, version=version+1 WHERE id=$1 AND state=$3', [evaluationId, to, from])
      : await client.query('UPDATE private_evaluations SET state=$2, result=$3, version=version+1 WHERE id=$1 AND state=$4', [evaluationId, to, payload, from]);
    return update.rowCount === 1;
  }

  /** Store bounded log capture deterministically. First capture wins; later captures never rewrite stored bytes. */
  private async captureLogs(client: PoolClient, jobId: string, logs: Uint8Array | null): Promise<string | null> {
    if (logs === null) {
      const row = (await client.query('SELECT log_digest FROM private_evaluation_job_logs WHERE job_id=$1', [jobId])).rows[0] as { log_digest: string } | undefined;
      return row ? row.log_digest : null;
    }
    const prepared = trimCapture(logs);
    await client.query(`INSERT INTO private_evaluation_job_logs (job_id,bytes,byte_count,original_byte_count,complete,log_digest)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (job_id) DO NOTHING`, [jobId, Buffer.from(prepared.bytes), prepared.bytes.length, prepared.originalByteCount, prepared.complete, prepared.digest]);
    const row = (await client.query('SELECT log_digest FROM private_evaluation_job_logs WHERE job_id=$1', [jobId])).rows[0] as { log_digest: string } | undefined;
    return row ? row.log_digest : null;
  }

  /** Record an anomalous/late/untrusted result. Running jobs complete unverified; evaluation falls to infrastructure_failure. */
  private async applyAnomaly(client: PoolClient, row: JobRow, cause: AnomalyCause, payloadDigest: string, storedDigest: string | null): Promise<ResultReport> {
    const sequence = await this.insertResultRow(client, row.id, { evidenceClass: 'unverified', outcome: 'unverified', cause, checks: [], logDigest: storedDigest, payloadDigest });
    if (row.job_state === 'running') {
      if (sequence === 0) return { jobId: row.id, recorded: false, evidenceClass: 'unverified', outcome: 'unverified', cause, payloadDigest, authoritativeLogDigest: storedDigest, jobState: row.job_state as ResultReport['jobState'], version: row.version, evaluationUpdate: 'skipped' };
      const logDigest = storedDigest ?? unverifiedLogMarker(cause, payloadDigest);
      await this.completeJob(client, row, 'unverified', 'unverified', cause, sequence, logDigest);
      const applied = await this.advanceEvaluation(client, row.evaluation_id, row.job_kind, 'infrastructure_failure', null);
      return { jobId: row.id, recorded: true, evidenceClass: 'unverified', outcome: 'unverified', cause, payloadDigest, authoritativeLogDigest: logDigest, jobState: 'completed', version: row.version + 1, evaluationUpdate: applied ? 'applied' : 'skipped' };
    }
    return {
      jobId: row.id, recorded: sequence !== 0, evidenceClass: 'unverified', outcome: 'unverified', cause,
      payloadDigest, authoritativeLogDigest: row.authoritative_log_digest, jobState: row.job_state as ResultReport['jobState'],
      version: row.version, evaluationUpdate: 'skipped'
    };
  }

  /** The runner itself declared the run unverified; record unverified evidence that can never pass. */
  private async applyRunnerUnverified(client: PoolClient, row: JobRow, payloadDigest: string, logDigest: string): Promise<ResultReport> {
    const sequence = await this.insertResultRow(client, row.id, { evidenceClass: 'unverified', outcome: 'unverified', cause: 'runner_reported_unverified', checks: [], logDigest, payloadDigest });
    if (sequence === 0) return { jobId: row.id, recorded: false, evidenceClass: 'unverified', outcome: 'unverified', cause: 'runner_reported_unverified', payloadDigest, authoritativeLogDigest: logDigest, jobState: row.job_state as ResultReport['jobState'], version: row.version, evaluationUpdate: 'skipped' };
    await this.completeJob(client, row, 'unverified', 'unverified', 'runner_reported_unverified', sequence, logDigest);
    const applied = await this.advanceEvaluation(client, row.evaluation_id, row.job_kind, 'infrastructure_failure', null);
    return { jobId: row.id, recorded: true, evidenceClass: 'unverified', outcome: 'unverified', cause: 'runner_reported_unverified', payloadDigest, authoritativeLogDigest: logDigest, jobState: 'completed', version: row.version + 1, evaluationUpdate: applied ? 'applied' : 'skipped' };
  }

  private async applyVerified(client: PoolClient, row: JobRow, trusted: TrustedResult, payloadDigest: string, logDigest: string): Promise<ResultReport> {
    const evidence = verifiedResultEvidence(bindingOf(row), trustedRecordFor(row, trusted));
    const sequence = await this.insertResultRow(client, row.id, { evidenceClass: 'verified', outcome: evidence.outcome, cause: 'runner_result', checks: evidence.checks, logDigest, payloadDigest });
    if (sequence === 0) return { jobId: row.id, recorded: false, evidenceClass: 'verified', outcome: evidence.outcome, cause: 'runner_result', payloadDigest, authoritativeLogDigest: logDigest, jobState: row.job_state as ResultReport['jobState'], version: row.version, evaluationUpdate: 'skipped' };
    await this.completeJob(client, row, 'verified', evidence.outcome, 'runner_result', sequence, logDigest);
    let applied: boolean;
    if (row.job_kind === 'public') {
      if (evidence.outcome === 'passed') applied = false;
      else applied = await this.advanceEvaluation(client, row.evaluation_id, row.job_kind, 'changes_required', null);
    } else if (evidence.outcome === 'failed') {
      applied = await this.advanceEvaluation(client, row.evaluation_id, row.job_kind, 'changes_required', null);
    } else {
      applied = await this.applyPrivatePassEvaluation(client, row, evidence);
    }
    return { jobId: row.id, recorded: true, evidenceClass: 'verified', outcome: evidence.outcome, cause: 'runner_result', payloadDigest, authoritativeLogDigest: logDigest, jobState: 'completed', version: row.version + 1, evaluationUpdate: applied ? 'applied' : 'skipped' };
  }

  /** Aggregate both authoritative job evidences; only a complete passed aggregate reaches owner review. */
  private async applyPrivatePassEvaluation(client: PoolClient, row: JobRow, privateEvidence: EvidenceRecord): Promise<boolean> {
    const publicRecord = await this.jobAuthoritativeRecord(client, row.evaluation_id, 'public');
    const records = publicRecord === null ? [privateEvidence] : [publicRecord, privateEvidence];
    const aggregate = aggregateAuthoritativeOutcome(records);
    if (aggregate.outcome !== 'passed') return false;
    try {
      const result = buildInternalEvaluationResult(
        { evaluationId: row.evaluation_id, attemptId: row.attempt_id, submissionHash: row.submission_hash, packageHash: row.package_hash, privateBaseRevision: row.private_base_revision },
        records,
        await this.loadStoredLogs(client, row.id)
      );
      return await this.advanceEvaluation(client, row.evaluation_id, row.job_kind, 'owner_review', result);
    } catch { return false; }
  }

  private protocolJobOf(row: JobRow) {
    const checks: string[] = [];
    if (!Array.isArray(row.required_check_ids)) throw new JobInvalid('required_check_ids_damaged');
    for (const entry of row.required_check_ids as unknown[]) {
      if (typeof entry !== 'string' || !CHECK_ID_PATTERN.test(entry)) throw new JobInvalid('required_check_ids_damaged');
      checks.push(entry);
    }
    const deadline = Number(row.deadline_ms);
    if (!Number.isSafeInteger(deadline)) throw new JobInvalid('deadline_damaged');
    requireHash(row.submission_hash, 'stored_submission');
    requireHash(row.package_hash, 'stored_package');
    requireHash(row.private_base_revision, 'stored_base');
    requireHash(row.artifact_hash, 'stored_artifact');
    requireHash(row.harness_digest, 'stored_harness');
    if (!SUPPORTED_HARNESS.has(row.harness_id) || typeof row.image_digest !== 'string' || !IMAGE_DIGEST_PATTERN.test(row.image_digest)) throw new JobInvalid('stored_binding_damaged');
    return JobSchema.parse({
      protocolVersion: 1, jobId: row.id, attemptId: row.attempt_id, jobKind: row.job_kind, profile: row.profile,
      packageHash: row.package_hash, submissionHash: row.submission_hash, artifactHash: row.artifact_hash,
      imageDigest: row.image_digest, harnessId: row.harness_id, harnessDigest: row.harness_digest,
      requiredCheckIds: checks, deadline, limits: DEFAULT_LIMITS
    });
  }

  private protocolLeaseOf(row: JobRow): Lease {
    if (row.lease_id === null || row.lease_profile === null || row.lease_baseline_digest === null) throw new JobInvalid('lease_binding_missing');
    return LeaseSchema.parse({ leaseId: row.lease_id, jobId: row.id, baselineDigest: row.lease_baseline_digest, profile: row.lease_profile, status: 'fresh' });
  }

  private async jobAuthoritativeRecord(client: PoolClient, evaluationId: string, kind: JobKind): Promise<EvidenceRecord | null> {
    const row = (await client.query(`SELECT ${JOB_COLUMNS} FROM private_evaluation_jobs WHERE evaluation_id=$1 AND job_kind=$2`, [evaluationId, kind])).rows[0] as JobRow | undefined;
    if (!row) return null;
    if (row.authoritative_class === null || row.authoritative_result_sequence === null || row.authoritative_outcome === null || row.authoritative_cause === null) return null;
    const result = (await client.query('SELECT evidence_class,result_outcome,cause,outcome_checks,log_digest,payload_digest FROM private_evaluation_job_results WHERE job_id=$1 AND recorded_sequence=$2', [row.id, row.authoritative_result_sequence])).rows[0] as ResultRow | undefined;
    if (!result) return null;
    const binding = bindingOf(row);
    if (result.evidence_class === 'verified' && row.authoritative_class === 'verified') {
      if (typeof row.authoritative_log_digest !== 'string' || typeof result.log_digest !== 'string') return null;
      return verifiedResultEvidence(binding, {
        jobId: row.id, jobKind: row.job_kind, packageHash: row.package_hash, submissionHash: row.submission_hash,
        artifactHash: row.artifact_hash, imageDigest: row.image_digest, harnessId: row.harness_id, harnessDigest: row.harness_digest,
        outcome: result.result_outcome === 'passed' ? 'passed' : result.result_outcome === 'failed' ? 'failed' : 'unverified',
        checks: buildChecks(result.outcome_checks), logDigest: result.log_digest
      });
    }
    if (result.evidence_class === 'infrastructure' && row.authoritative_class === 'infrastructure') {
      return infrastructureEvidence(binding, result.cause as InfrastructureCause, result.log_digest);
    }
    if (result.evidence_class === 'unverified' && row.authoritative_class === 'unverified') {
      return anomalyEvidence(binding, result.cause as AnomalyCause, result.log_digest, result.payload_digest);
    }
    return null;
  }

  private async loadStoredLogs(client: PoolClient, jobId: string): Promise<Buffer> {
    const row = (await client.query('SELECT bytes FROM private_evaluation_job_logs WHERE job_id=$1', [jobId])).rows[0] as { bytes: Buffer } | undefined;
    return row ? row.bytes : Buffer.alloc(0);
  }

  /** Bounded safe private projection; raw log bytes are never part of it. */
  private projectionOf(row: JobRow): JobRead {
    const checks: string[] = [];
    if (!Array.isArray(row.required_check_ids)) throw new JobInvalid('required_check_ids_damaged');
    for (const entry of row.required_check_ids as unknown[]) {
      if (typeof entry !== 'string' || !CHECK_ID_PATTERN.test(entry)) throw new JobInvalid('required_check_ids_damaged');
      checks.push(entry);
    }
    const deadline = Number(row.deadline_ms);
    if (!Number.isSafeInteger(deadline)) throw new JobInvalid('deadline_damaged');
    requireUuid(row.attempt_id, 'stored_attempt');
    requireUuid(row.submission_id, 'stored_submission');
    requireHash(row.submission_hash, 'stored_submission');
    requireHash(row.package_hash, 'stored_package');
    requireHash(row.private_base_revision, 'stored_base');
    requireHash(row.artifact_hash, 'stored_artifact');
    requireHash(row.harness_digest, 'stored_harness');
    if (!SUPPORTED_HARNESS.has(row.harness_id) || !IMAGE_DIGEST_PATTERN.test(row.image_digest)) throw new JobInvalid('stored_binding_damaged');
    return {
      jobId: row.id, evaluationId: row.evaluation_id, evaluationVersion: row.evaluation_version, jobKind: row.job_kind,
      jobState: row.job_state as JobRead['jobState'], version: row.version,
      attemptId: row.attempt_id, submissionId: row.submission_id, taskId: row.task_id, taskVersion: row.task_version,
      submissionHash: row.submission_hash, packageHash: row.package_hash, privateBaseRevision: row.private_base_revision,
      artifactHash: row.artifact_hash, imageDigest: row.image_digest, harnessId: row.harness_id, harnessDigest: row.harness_digest,
      requiredCheckIds: Object.freeze(checks), deadlineMs: deadline,
      lease: row.lease_id === null ? null : { leaseId: row.lease_id, boundAt: iso(row.lease_bound_at) ?? '' },
      authoritative: row.authoritative_class === null || row.authoritative_result_sequence === null || row.authoritative_outcome === null || row.authoritative_cause === null || row.authoritative_log_digest === null
        ? null
        : { evidenceClass: row.authoritative_class, outcome: row.authoritative_outcome, cause: row.authoritative_cause, logDigest: row.authoritative_log_digest, resultSequence: row.authoritative_result_sequence },
      createdAt: iso(row.created_at) ?? '', endedAt: iso(row.ended_at)
    };
  }

  async read(actor: SessionActor, jobId: string): Promise<JobRead> {
    return this.transaction(async client => {
      await this.requiresEvaluationOperator(client, actor);
      requireUuid(jobId, 'job');
      const row = (await client.query(`SELECT ${JOB_COLUMNS} FROM private_evaluation_jobs WHERE id=$1`, [jobId])).rows[0] as JobRow | undefined;
      if (!row) throw new WorkflowError('missing_evidence');
      return this.projectionOf(row);
    });
  }

  async readForEvaluation(actor: SessionActor, evaluationId: string): Promise<readonly JobRead[]> {
    return this.transaction(async client => {
      await this.requiresEvaluationOperator(client, actor);
      requireUuid(evaluationId, 'evaluation');
      const rows = (await client.query(`SELECT ${JOB_COLUMNS} FROM private_evaluation_jobs WHERE evaluation_id=$1 ORDER BY job_kind DESC`, [evaluationId])).rows as JobRow[];
      return rows.map(row => this.projectionOf(row));
    });
  }

  /** Private-only raw log access for evaluation operators; never part of any public projection. */
  async readLogs(actor: SessionActor, jobId: string): Promise<LogRead> {
    return this.transaction(async client => {
      await this.requiresEvaluationOperator(client, actor);
      requireUuid(jobId, 'job');
      const row = (await client.query('SELECT log_digest,byte_count,original_byte_count,complete,bytes FROM private_evaluation_job_logs WHERE job_id=$1', [jobId])).rows[0] as StoredLogsRow | undefined;
      if (!row) throw new WorkflowError('missing_evidence');
      requireHash(row.log_digest, 'stored_log_digest');
      return { jobId, digest: row.log_digest, byteCount: row.byte_count, originalByteCount: row.original_byte_count, complete: row.complete, bytes: row.bytes };
    });
  }
}
