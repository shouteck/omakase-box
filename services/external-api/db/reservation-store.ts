import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { ExternalTaskContractSchema } from '../../../packages/contracts/public/index.js';
import { contentHash } from '../../../packages/contracts/hash.js';
import { assertTransition, WorkflowError } from '../../../packages/contracts/workflow/index.js';

export class ExternalReservationStore {
  constructor(private readonly pool: Pool) {}
  async reserve(contributorId: string, taskId: string, taskVersion: number) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (!(await client.query('SELECT id FROM external_accounts WHERE id = $1 AND NOT disabled', [contributorId])).rowCount) throw new WorkflowError('forbidden_role');
      const row = (await client.query('SELECT contract, package_hash FROM external_task_versions WHERE id = $1 AND version = $2 AND NOT withdrawn FOR SHARE', [taskId, taskVersion])).rows[0] as { contract: unknown; package_hash: string } | undefined;
      if (!row) throw new WorkflowError('invalid_transition');
      const contract = ExternalTaskContractSchema.parse(row.contract);
      if (contract.taskId !== taskId || contract.version !== taskVersion) throw new WorkflowError('missing_evidence');
      const id = randomUUID();
      const result = await client.query("INSERT INTO external_reservations (id, task_id, task_version, package_hash, contributor_id, terms_hash, expires_at) VALUES ($1, $2, $3, $4, $5, $6, now() + $7 * interval '1 second') RETURNING expires_at", [id, taskId, taskVersion, row.package_hash, contributorId, contentHash(contract.terms), contract.terms.reservationDurationSeconds]);
      await client.query('COMMIT');
      return { reservationId: id, expiresAt: result.rows[0].expires_at as Date, version: 1 };
    } catch (error) {
      await client.query('ROLLBACK');
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') throw new WorkflowError('stale_version');
      throw error;
    } finally { client.release(); }
  }
  async cancelOwn(contributorId: string, reservationId: string, expectedVersion: number) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (!(await client.query('SELECT id FROM external_accounts WHERE id = $1 AND NOT disabled', [contributorId])).rowCount) throw new WorkflowError('forbidden_role');
      const row = (await client.query('SELECT contributor_id, state, version FROM external_reservations WHERE id = $1 FOR UPDATE', [reservationId])).rows[0] as { contributor_id: string; state: string; version: number } | undefined;
      if (!row || row.contributor_id !== contributorId) throw new WorkflowError('forbidden_role');
      assertTransition({ kind: 'reservation', from: row.state, to: 'cancelled', actor: 'contributor', expectedVersion, currentVersion: row.version });
      await client.query("UPDATE external_reservations SET state = 'cancelled', version = version + 1 WHERE id = $1 AND version = $2", [reservationId, expectedVersion]);
      await client.query('COMMIT');
      return { version: expectedVersion + 1, state: 'cancelled' };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}
