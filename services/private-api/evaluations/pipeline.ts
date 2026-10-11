import type { Pool, PoolClient } from 'pg';
import { WorkflowError } from '../../../packages/contracts/workflow/index.js';
import type { SessionActor } from '../../../packages/contracts/auth/store.js';
import { EvaluationJobStore } from '../jobs/store.js';
import { JobInvalid } from '../jobs/types.js';
import { planEvaluationJobs, PlanRejected } from '../../../packages/evaluation/pipeline/jobs.js';
import type { EvaluationJobPlan } from '../../../packages/evaluation/pipeline/jobs.js';
import { buildCandidateDiff } from '../../../packages/evaluation/pipeline/candidate-diff.js';
import type { CandidateDiff } from '../../../packages/evaluation/pipeline/candidate-diff.js';
import type { PatchMapping } from '../../../packages/evaluation/pipeline/patch-map.js';
import type { PrivateFitReport } from '../../../packages/evaluation/pipeline/fit.js';
import type { buildAttemptDescriptor } from '../../../packages/evaluation/composition/descriptor.js';

type Descriptor = ReturnType<typeof buildAttemptDescriptor>;

/**
 * M7.1 orchestration facade. Job persistence, lease binding, signed-result
 * evidence and the base evaluation transitions are owned exclusively by
 * EvaluationJobStore — this layer only plans the frozen job pair from pinned
 * descriptors, produces the private candidate diff as data against the stored
 * evaluation binding, and applies a trusted private-fit outcome to the
 * evaluation state machine. It never records evidence itself, so no path here
 * can bypass signature verification or lease authority.
 */

interface EvaluationRow {
  id: string; permit_id: string; task_id: string; task_version: number;
  submission_id: string; submission_hash: string; package_hash: string;
  private_base_revision: string; state: string; version: number; superseded: boolean;
}

export interface PlanRequest {
  evaluationId: string;
  attemptId: string;
  publicDescriptor: Descriptor;
  privateDescriptor: Descriptor;
  deadlineMs: number;
}

export interface PlanOutcome {
  plan: EvaluationJobPlan;
  enqueued: readonly { jobId: string; jobKind: 'public' | 'private'; created: boolean }[];
}

export interface FitOutcome {
  applied: boolean;
  nextState: string;
}

const FIT_STATE: Readonly<Record<PrivateFitReport['outcome'], string | null>> = Object.freeze({
  passed: null,
  contract_failure: 'changes_required',
  integration_failure: 'changes_required',
  package_defect: 'package_defect',
  infrastructure_failure: 'infrastructure_failure',
  unverified: null,
});

async function evaluationRow(client: PoolClient, evaluationId: string): Promise<EvaluationRow> {
  const { rows } = await client.query<EvaluationRow>(
    `SELECT id,permit_id,task_id,task_version,submission_id,submission_hash,package_hash,private_base_revision,state,version,superseded
     FROM private_evaluations WHERE id=$1 FOR UPDATE`, [evaluationId]);
  const row = rows[0];
  if (!row) throw new WorkflowError('missing_evidence');
  return row;
}

export class EvaluationPipeline {
  readonly jobs: EvaluationJobStore;
  constructor(private readonly pool: Pool) { this.jobs = new EvaluationJobStore(pool); }

  private async transact<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  /**
   * Freeze the public/private job pair for a received evaluation. Every
   * binding field comes from the stored evaluation row — the caller supplies
   * only the pinned attempt descriptors, attempt identity and deadline.
   * Public is enqueued first; enqueue() enforces the release-manifest image,
   * published-check and trusted-harness authorities for each job. Replays are
   * idempotent through enqueue's existing-row path.
   */
  async plan(actor: SessionActor, input: PlanRequest): Promise<PlanOutcome> {
    let plan: EvaluationJobPlan;
    try {
      plan = await this.transact(async client => {
        const evaluation = await evaluationRow(client, input.evaluationId);
        if (evaluation.superseded) throw new WorkflowError('missing_evidence');
        return planEvaluationJobs({
          evaluationId: evaluation.id,
          permitId: evaluation.permit_id,
          attemptId: input.attemptId,
          submissionId: evaluation.submission_id,
          taskId: evaluation.task_id,
          taskVersion: evaluation.task_version,
          submissionHash: evaluation.submission_hash,
          packageHash: evaluation.package_hash,
          privateBaseRevision: evaluation.private_base_revision,
          publicDescriptor: input.publicDescriptor,
          privateDescriptor: input.privateDescriptor,
          deadlineMs: input.deadlineMs,
        });
      });
    } catch (error) {
      if (error instanceof PlanRejected) throw new JobInvalid(error.code);
      throw error;
    }
    const enqueued: { jobId: string; jobKind: 'public' | 'private'; created: boolean }[] = [];
    for (const job of [...plan.jobs].sort(job => (job.jobKind === 'public' ? -1 : 1))) {
      const result = await this.jobs.enqueue(actor, {
        evaluationId: input.evaluationId,
        jobKind: job.jobKind,
        attemptId: input.attemptId,
        artifactHash: job.artifactHash,
        imageDigest: job.imageDigest,
        harnessId: job.harnessId,
        harnessDigest: job.harnessDigest,
        requiredCheckIds: [...job.requiredCheckIds],
        deadlineMs: job.deadlineMs,
      });
      enqueued.push({ jobId: result.jobId, jobKind: job.jobKind, created: result.created });
    }
    return Object.freeze({ plan, enqueued: Object.freeze(enqueued) });
  }

  /**
   * Private candidate diff as data. The base revision and submission hash are
   * read from the stored evaluation row so a caller cannot rebind the diff to
   * foreign content; the patch digest and unit mapping come from validated
   * M6.3 intake and mapPatchToUnits.
   */
  async candidateDiffFor(evaluationId: string, patchDigest: string, mapping: PatchMapping): Promise<CandidateDiff> {
    return this.transact(async client => {
      const evaluation = await evaluationRow(client, evaluationId);
      return buildCandidateDiff({
        privateBaseRevision: evaluation.private_base_revision,
        submissionHash: evaluation.submission_hash,
        patchDigest,
        mapping,
      });
    });
  }

  /**
   * Apply a trusted private-fit outcome to the evaluation. Fit is computed by
   * the pipeline from authoritative evidence; this method only persists the
   * resulting state under a guarded UPDATE, so stale or pending evaluations
   * surface as no-ops rather than overwriting transitions the job store owns.
   * 'passed'/'unverified' never move the evaluation: the aggregate path in
   * the job store advances to owner_review, and unverified stays put.
   */
  async applyFit(evaluationId: string, fit: PrivateFitReport): Promise<FitOutcome> {
    const nextState = FIT_STATE[fit.outcome];
    if (nextState === null) {
      return Object.freeze({ applied: false, nextState: fit.outcome === 'passed' ? 'owner_review' : 'unchanged' });
    }
    return this.transact(async client => {
      const evaluation = await evaluationRow(client, evaluationId);
      if (evaluation.state !== 'private_evaluating' && evaluation.state !== 'owner_review') {
        return Object.freeze({ applied: false, nextState: evaluation.state });
      }
      const pending = await client.query<{ pending: number }>(
        `SELECT count(*)::int AS pending FROM private_evaluation_jobs
         WHERE evaluation_id=$1 AND job_state NOT IN ('completed','cancelled')`, [evaluationId]);
      if (pending.rows[0]!.pending > 0) throw new WorkflowError('missing_evidence');
      const updated = await client.query(
        `UPDATE private_evaluations SET state=$2, version=version+1 WHERE id=$1 AND state=$3`,
        [evaluationId, nextState, evaluation.state]);
      if (updated.rowCount !== 1) throw new WorkflowError('stale_version');
      return Object.freeze({ applied: true, nextState });
    });
  }

  /** Bounded status projection — no private logs, bindings, or internal detail. */
  async status(evaluationId: string): Promise<{ state: string; jobs: readonly { jobId: string; kind: string; state: string; outcome: string | null }[] } | null> {
    const evaluation = (await this.pool.query<{ state: string }>(`SELECT state FROM private_evaluations WHERE id=$1`, [evaluationId])).rows[0];
    if (!evaluation) return null;
    const jobs = (await this.pool.query(
      `SELECT id,job_kind,job_state,authoritative_outcome FROM private_evaluation_jobs WHERE evaluation_id=$1 ORDER BY job_kind`,
      [evaluationId])).rows;
    return {
      state: evaluation.state,
      jobs: jobs.map(job => ({ jobId: job.id as string, kind: job.job_kind as string, state: job.job_state as string, outcome: job.authoritative_outcome as string | null })),
    };
  }
}
