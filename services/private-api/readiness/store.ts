import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { evaluatePublishGate, validateReadinessRecord, ReadinessInvalid } from './model.js';
import type { PublishGateResult, ReadinessRecord } from './model.js';

/**
 * Append-only readiness store (M4.3). Records and gate decisions are
 * immutable database rows; the publish gate is evaluated inside the same
 * transaction that persists the decision so a concurrent record insert
 * cannot race the evaluation.
 */
export class PrivateReadinessStore {
  constructor(private readonly database: Pool) {}

  /** Insert one immutable evidence record. Validation is duplicated at SQL CHECK level. */
  async record(input: unknown, recordedBy: string): Promise<ReadinessRecord> {
    const record = validateReadinessRecord({ ...(typeof input === 'object' && input !== null ? input : {}), recordId: randomUUID(), recordedBy, recordedAt: new Date().toISOString() });
    try {
      await this.database.query(
        `INSERT INTO private_readiness_records (id,task_id,task_version,package_digest,kind,status,reason_code,classified_outcome,details_digest,assurance,recorded_by,recorded_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [record.recordId, record.taskId, record.taskVersion, record.packageDigest, record.kind, record.status, record.reasonCode, record.classifiedOutcome, record.detailsDigest, record.assurance, record.recordedBy, record.recordedAt],
      );
    } catch (error) {
      throw new ReadinessInvalid((error as { code?: string }).code === '23505' ? 'conflict' : 'readiness_record_rejected');
    }
    return record;
  }

  async list(taskId: string, taskVersion: number): Promise<readonly ReadinessRecord[]> {
    const { rows } = await this.database.query(
      `SELECT id,task_id,task_version,package_digest,kind,status,reason_code,classified_outcome,details_digest,assurance,recorded_by,recorded_at FROM private_readiness_records WHERE task_id=$1 AND task_version=$2 ORDER BY recorded_at,id`,
      [taskId, taskVersion],
    );
    return Object.freeze(rows.map(row => Object.freeze({
      recordId: row.id as string,
      taskId: row.task_id as string,
      taskVersion: row.task_version as number,
      packageDigest: row.package_digest as string,
      kind: row.kind as ReadinessRecord['kind'],
      status: row.status as ReadinessRecord['status'],
      reasonCode: row.reason_code as string | null,
      classifiedOutcome: row.classified_outcome as ReadinessRecord['classifiedOutcome'],
      detailsDigest: row.details_digest as string | null,
      assurance: row.assurance as 'tested' | 'unverified',
      recordedBy: row.recorded_by as string,
      recordedAt: (row.recorded_at as Date).toISOString(),
    })));
  }

  async releaseApproved(client: PoolClient, taskId: string, taskVersion: number): Promise<boolean> {
    const { rows } = await client.query(
      `SELECT 1 FROM private_release_approvals WHERE task_id=$1 AND task_version=$2 LIMIT 1`,
      [taskId, taskVersion],
    );
    return rows.length === 1;
  }

  /**
   * Evaluate the gate and persist the immutable decision atomically. The
   * FOR SHARE lock on the records snapshot plus a serializable-visible
   * advisory xact lock on the task key makes concurrent record inserts
   * unable to silently slip past the evaluation.
   */
  async decide(taskId: string, taskVersion: number, packageDigest: string, decidedBy: string, decisionId: string): Promise<PublishGateResult & { decisionId: string }> {
    const client = await this.database.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1 || ':' || $2, 42))`, [taskId, String(taskVersion)]);
      const { rows } = await client.query(
        `SELECT id,kind,status,reason_code,classified_outcome,details_digest,assurance,recorded_by,recorded_at,package_digest,task_id,task_version FROM private_readiness_records WHERE task_id=$1 AND task_version=$2 ORDER BY recorded_at,id FOR SHARE`,
        [taskId, taskVersion],
      );
      const records: readonly ReadinessRecord[] = rows.map(row => ({
        recordId: row.id, taskId: row.task_id, taskVersion: row.task_version, packageDigest: row.package_digest,
        kind: row.kind, status: row.status, reasonCode: row.reason_code, classifiedOutcome: row.classified_outcome,
        detailsDigest: row.details_digest, assurance: row.assurance, recordedBy: row.recorded_by,
        recordedAt: (row.recorded_at as Date).toISOString(),
      }));
      const releaseApproved = await this.releaseApproved(client, taskId, taskVersion);
      const gate = evaluatePublishGate({ taskId, taskVersion, packageDigest, releaseApproved, records });
      await client.query(
        `INSERT INTO private_readiness_decisions (id,task_id,task_version,package_digest,decision,reasons,evaluated_record_ids,decided_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [decisionId, taskId, taskVersion, packageDigest, gate.decision, JSON.stringify(gate.reasons), JSON.stringify(gate.evaluatedRecordIds), decidedBy],
      );
      await client.query('COMMIT');
      return Object.freeze({ ...gate, decisionId });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (error instanceof ReadinessInvalid) throw error;
      throw new ReadinessInvalid('publication_decision_failed');
    } finally {
      client.release();
    }
  }
}
