import type { Pool, PoolClient } from 'pg';
import { permits } from '../../../packages/contracts/auth/policy.js';
import { WorkflowError } from '../../../packages/contracts/workflow/index.js';
import type { SessionActor } from '../../../packages/contracts/auth/store.js';
import { byteHash } from '../../../packages/contracts/hash.js';
import { validatePatch } from '../../../packages/evaluation/patch-validation/patch.js';
import { mapPatchToUnits } from '../../../packages/evaluation/pipeline/patch-map.js';
import { buildCandidateDiff } from '../../../packages/evaluation/pipeline/candidate-diff.js';
import { renderPublicFeedback, feedbackCategoryFor, FeedbackRejected } from '../feedback/policy.js';
import {
  AcceptanceRejected, deriveAcceptanceId, deriveEventId, deriveFeedbackPublicId,
  insertAcceptance, insertFeedbackEvent, insertObligation, transitionEvaluation,
} from '../ledger/acceptance-transaction/record.js';

/**
 * Owner acceptance and controlled feedback (M7.2). Only a live owner session
 * with `acceptance.approve` may decide; the exact bound evaluation revision
 * is verified inside the transaction (superseded or non-owner_review rows,
 * stale versions and non-passed results all reject). Money terms always
 * come from the approved contract — never the request — and the candidate
 * diff is recomputed from the stored patch bytes and approved work units,
 * so the acceptance binds exactly what was evaluated.
 */

interface EvaluationRow {
  id: string; permit_id: string; task_id: string; task_version: number;
  submission_id: string; submission_hash: string; package_hash: string;
  private_base_revision: string; state: string; version: number; superseded: boolean;
}
interface ImportRow { patch: Buffer; envelope: { submission?: { contributorId?: string } } }
interface CheckRow { outcome_checks: unknown }

export interface DecisionResult {
  readonly created: boolean;
  readonly eventId: string;
  readonly state: string;
}

export class PrivateAcceptanceStore {
  constructor(private readonly pool: Pool) {}

  private async transact<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (error instanceof AcceptanceRejected || error instanceof WorkflowError || error instanceof FeedbackRejected) throw error;
      const message = (error as { message?: string }).message ?? '';
      if (/owner_required|completed_latest_evaluation_required/.test(message)) throw new WorkflowError('forbidden_role');
      if (/stale_evaluation_version|invalid_evaluation_transition|evaluation_result_immutable|owner_acceptance_required|invalid_initial_obligation/.test(message)) throw new AcceptanceRejected('stale_state');
      if (/outbox_event_immutable|outbox_delivery_immutable|acceptance_immutable|obligation_terms_immutable/.test(message)) throw new AcceptanceRejected('duplicate_event');
      throw new AcceptanceRejected('persistence_unavailable');
    } finally { client.release(); }
  }

  private async requireOwner(client: PoolClient, actor: SessionActor): Promise<void> {
    if (actor.role !== 'owner' || !permits('private', actor.role, 'acceptance.approve')) throw new WorkflowError('forbidden_role');
    const { rows } = await client.query(
      `SELECT account.id FROM private_accounts AS account
       JOIN private_sessions AS session ON session.account_id=account.id
       WHERE account.id=$1 AND account.role='owner' AND NOT account.disabled
       AND session.token_hash=$2 AND session.csrf_hash=$3 AND session.expires_at>now()
       FOR SHARE OF account, session`,
      [actor.id, actor.sessionHash, actor.csrfHash],
    );
    if (!rows[0]) throw new WorkflowError('forbidden_role');
  }

  private async lockEvaluation(client: PoolClient, evaluationId: string): Promise<EvaluationRow> {
    const { rows } = await client.query<EvaluationRow>(
      `SELECT id,permit_id,task_id,task_version,submission_id,submission_hash,package_hash,private_base_revision,state,version,superseded
       FROM private_evaluations WHERE id=$1 FOR UPDATE`, [evaluationId]);
    const row = rows[0];
    if (!row) throw new WorkflowError('missing_evidence');
    return row;
  }

  /** Recompute the exact candidate diff from stored bytes + approved work units; never trusts caller hashes. */
  private async candidateDiffHash(client: PoolClient, evaluation: EvaluationRow): Promise<string> {
    const imported = (await client.query<ImportRow>(
      `SELECT patch,envelope FROM private_submission_imports WHERE evaluation_id=$1`, [evaluation.id])).rows[0];
    if (!imported) throw new WorkflowError('missing_evidence');
    const candidate = (await client.query<{ candidate: { contract?: { workUnits?: { id: string; editablePaths: string[] }[]; editablePaths?: string[] } } }>(
      `SELECT candidate FROM private_release_candidates WHERE task_id=$1 AND task_version=$2 AND state='approved'`,
      [evaluation.task_id, evaluation.task_version])).rows[0];
    const workUnits = candidate?.candidate?.contract?.workUnits;
    const editablePaths = candidate?.candidate?.contract?.editablePaths;
    if (!Array.isArray(workUnits) || !Array.isArray(editablePaths)) throw new WorkflowError('missing_evidence');
    const validated = validatePatch({ bytes: new Uint8Array(imported.patch), editablePaths });
    const mapping = mapPatchToUnits(
      workUnits.map(unit => ({ unitId: unit.id, editablePaths: unit.editablePaths })),
      validated.files.map(file => file.path),
    );
    return buildCandidateDiff({
      privateBaseRevision: evaluation.private_base_revision,
      submissionHash: evaluation.submission_hash,
      patchDigest: byteHash(new Uint8Array(imported.patch)),
      mapping,
    }).candidateDiffHash;
  }

  /** Authoritative public-check outcomes for the allowlisted feedback detail. */
  private async publicCheckOutcomes(client: PoolClient, evaluationId: string): Promise<{ checkId: string; outcome: 'passed' | 'failed' | 'unverified' }[]> {
    const { rows } = await client.query<CheckRow & { outcome_checks: unknown }>(
      `SELECT r.outcome_checks FROM private_evaluation_job_results r
       JOIN private_evaluation_jobs j ON j.id=r.job_id AND j.authoritative_result_sequence=r.recorded_sequence
       WHERE j.evaluation_id=$1 AND j.job_kind='public'`,
      [evaluationId]);
    const raw = rows[0]?.outcome_checks;
    if (!Array.isArray(raw)) return [];
    const checks: { checkId: string; outcome: 'passed' | 'failed' | 'unverified' }[] = [];
    for (const entry of raw) {
      if (typeof entry !== 'object' || entry === null) continue;
      const record = entry as { checkId?: unknown; outcome?: unknown };
      if (typeof record.checkId !== 'string') continue;
      checks.push({ checkId: record.checkId, outcome: record.outcome === 'passed' ? 'passed' : record.outcome === 'failed' ? 'failed' : 'unverified' });
    }
    return checks;
  }

  private async payee(client: PoolClient, evaluationId: string): Promise<string> {
    const { rows } = await client.query<{ contributor: string | null }>(
      `SELECT envelope->'submission'->>'contributorId' AS contributor FROM private_submission_imports WHERE evaluation_id=$1`,
      [evaluationId]);
    const contributor = rows[0]?.contributor;
    if (typeof contributor !== 'string' || !/^[0-9a-f-]{36}$/i.test(contributor)) throw new WorkflowError('missing_evidence');
    return contributor;
  }

  private async money(client: PoolClient, evaluation: EvaluationRow, field: 'reward' | 'packageDefectCompensation'): Promise<{ currency: string; amountMinor: number }> {
    const { rows } = await client.query<{ amount: number | string; currency: string }>(
      field === 'reward'
        ? `SELECT (candidate->'contract'->'reward'->>'amountMinor')::numeric AS amount, candidate->'contract'->'reward'->>'currency' AS currency
           FROM private_release_candidates WHERE task_id=$1 AND task_version=$2 AND state='approved'`
        : `SELECT (candidate->'contract'->'terms'->'packageDefectCompensation'->>'amountMinor')::numeric AS amount, candidate->'contract'->'terms'->'packageDefectCompensation'->>'currency' AS currency
           FROM private_release_candidates WHERE task_id=$1 AND task_version=$2 AND state='approved'`,
      [evaluation.task_id, evaluation.task_version]);
    const row = rows[0];
    if (!row || typeof row.currency !== 'string' || !/^[A-Z]{3}$/.test(row.currency)) throw new WorkflowError('missing_evidence');
    const amountMinor = Number(row.amount);
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new WorkflowError('missing_evidence');
    return { currency: row.currency, amountMinor };
  }

  private feedback(eventId: string, evaluation: EvaluationRow, category: Parameters<typeof feedbackCategoryFor>[0], checks: { checkId: string; outcome: 'passed' | 'failed' | 'unverified' }[]) {
    const payload = renderPublicFeedback({
      publicId: deriveFeedbackPublicId(evaluation.id),
      category: feedbackCategoryFor(category),
      releasePolicyVersion: evaluation.task_version,
      publicCheckOutcomes: checks,
    });
    return { eventId, submissionId: evaluation.submission_id, payload };
  }

  /**
   * Owner accepts the exact evaluated revision: obligation (payable) +
   * immutable acceptance + evaluation→accepted + feedback outbox in one
   * transaction. A replay resolves to the recorded event — never a second
   * payable row.
   */
  async accept(actor: SessionActor, input: { evaluationId: string; expectedVersion: number }): Promise<DecisionResult> {
    return this.transact(async client => {
      await this.requireOwner(client, actor);
      const evaluation = await this.lockEvaluation(client, input.evaluationId);
      const prior = await client.query(`SELECT event_id FROM private_acceptances WHERE evaluation_id=$1`, [evaluation.id]);
      if (prior.rows[0]) return { created: false, eventId: prior.rows[0].event_id as string, state: 'accepted' };
      if (evaluation.superseded || evaluation.state !== 'owner_review' || evaluation.version !== input.expectedVersion) throw new WorkflowError('stale_version');
      const eventId = deriveEventId(evaluation.id, 'accept');
      const acceptanceId = deriveAcceptanceId(evaluation.id);
      const reward = await this.money(client, evaluation, 'reward');
      const checks = await this.publicCheckOutcomes(client, evaluation.id);
      // The obligation's acceptance_id FK is immediate while the acceptance's
      // payable FKs are deferred to COMMIT — acceptance first, obligation next.
      await insertAcceptance(client, {
        id: acceptanceId, eventId, evaluationId: evaluation.id, ownerId: actor.id,
        submissionHash: evaluation.submission_hash, packageHash: evaluation.package_hash,
        privateBaseRevision: evaluation.private_base_revision,
        candidateDiffHash: await this.candidateDiffHash(client, evaluation),
      });
      await insertObligation(client, {
        eventId, acceptanceId, payeeId: await this.payee(client, evaluation.id),
        reason: 'accepted_submission', currency: reward.currency, amountMinor: reward.amountMinor,
      });
      await transitionEvaluation(client, evaluation.id, 'owner_review', 'accepted');
      await insertFeedbackEvent(client, this.feedback(eventId, evaluation, 'accepted', checks));
      return { created: true, eventId, state: 'accepted' };
    });
  }

  /** Owner sends the evaluation back as changes_required with allowlisted feedback; no payable event. */
  async reject(actor: SessionActor, input: { evaluationId: string; expectedVersion: number }): Promise<DecisionResult> {
    return this.transact(async client => {
      await this.requireOwner(client, actor);
      const evaluation = await this.lockEvaluation(client, input.evaluationId);
      if (evaluation.superseded || evaluation.state !== 'owner_review' || evaluation.version !== input.expectedVersion) throw new WorkflowError('stale_version');
      const eventId = deriveEventId(evaluation.id, 'reject');
      const checks = await this.publicCheckOutcomes(client, evaluation.id);
      await transitionEvaluation(client, evaluation.id, 'owner_review', 'changes_required');
      await insertFeedbackEvent(client, this.feedback(eventId, evaluation, 'changes_required', checks));
      return { created: true, eventId, state: 'changes_required' };
    });
  }

  /**
   * Package-defect compensation: a payable record for the contributor without
   * an acceptance — the published terms compensate the contributor when the
   * package itself was defective. Idempotent on the derived event id.
   */
  async compensate(actor: SessionActor, input: { evaluationId: string; expectedVersion: number }): Promise<DecisionResult> {
    return this.transact(async client => {
      await this.requireOwner(client, actor);
      const evaluation = await this.lockEvaluation(client, input.evaluationId);
      const eventId = deriveEventId(evaluation.id, 'compensate');
      const prior = await client.query(`SELECT event_id FROM private_payment_obligations WHERE event_id=$1`, [eventId]);
      if (prior.rows[0]) return { created: false, eventId, state: evaluation.state };
      if (evaluation.superseded || (evaluation.state !== 'package_defect' && evaluation.state !== 'owner_review')) throw new WorkflowError('stale_version');
      if (evaluation.state === 'owner_review' && evaluation.version !== input.expectedVersion) throw new WorkflowError('stale_version');
      const terms = await this.money(client, evaluation, 'packageDefectCompensation');
      const checks = await this.publicCheckOutcomes(client, evaluation.id);
      await insertObligation(client, {
        eventId, acceptanceId: null, payeeId: await this.payee(client, evaluation.id),
        reason: 'package_defect_compensation', currency: terms.currency, amountMinor: terms.amountMinor,
      });
      if (evaluation.state === 'owner_review') await transitionEvaluation(client, evaluation.id, 'owner_review', 'package_defect');
      await insertFeedbackEvent(client, this.feedback(eventId, evaluation, 'package_defect', checks));
      return { created: true, eventId, state: 'package_defect' };
    });
  }

  /** Bounded owner-review queue projection — no logs, no private content. */
  async pending(): Promise<readonly { evaluationId: string; taskId: string; taskVersion: number; version: number; outcome: string | null }[]> {
    const { rows } = await this.pool.query(
      `SELECT id,task_id,task_version,version,result->>'outcome' AS outcome FROM private_evaluations
       WHERE state='owner_review' AND NOT superseded ORDER BY task_id, task_version, id`,
    );
    return rows.map(row => ({ evaluationId: row.id as string, taskId: row.task_id as string, taskVersion: row.task_version as number, version: row.version as number, outcome: (row.outcome as string | null) ?? null }));
  }
}
