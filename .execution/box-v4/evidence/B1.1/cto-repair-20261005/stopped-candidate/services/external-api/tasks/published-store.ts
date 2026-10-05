import type { Pool, PoolClient } from 'pg';
import type { BridgeClaim } from './persistence.js';
import type { PublishInput, PublishedReleaseRecord, PublishResult, PublishedTaskPersistence } from './persistence.js';
import type { ApprovedReleaseManifest, ExternalTaskContract, PublicListing } from '../../../packages/contracts/public/index.js';
import { BridgeRejected } from '../bridge/types.js';
import { PUBLISHED_TASK_DDL } from './ddl.js';

const rowProjection = `event_id,payload_hash,published_at,manifest_hash,package_sha256,package_byte_size,package_bytes,contract,listing,manifest`;

interface StoreRow {
  event_id: string;
  payload_hash: string;
  published_at: Date | string;
  manifest_hash: string;
  package_sha256: string;
  package_byte_size: number;
  package_bytes: Buffer;
  contract: unknown;
  listing: unknown;
  manifest: unknown;
}

export class PublishedReleaseStore implements PublishedTaskPersistence, ReleaseClaimDatabase {
  /** DDL source of truth for the coordinator-applied external migration. */
  readonly publishedTaskDdl = PUBLISHED_TASK_DDL;

  constructor(private readonly pool: Pool) {}

  async claimReplay(claim: BridgeClaim): Promise<boolean> {
    try {
      const existing = (await this.pool.query('SELECT payload_hash,nonce FROM external_bridge_claims WHERE event_id=$1 OR nonce=$2 LIMIT 1', [claim.eventId, claim.nonce])).rows[0] as { payload_hash: string; nonce: string } | undefined;
      return !existing;
    } catch {
      throw new BridgeRejected('persistence_unavailable');
    }
  }

  async published(eventId: string): Promise<PublishedReleaseRecord | null> {
    const row = await this.readRow('WHERE event_id=$1 LIMIT 1', [eventId]);
    if (!row || row.event_id !== eventId) return null;
    return this.recordOf(row);
  }

  async allPublished(): Promise<PublishedReleaseRecord[]> {
    const rows = (await this.pool.query(`SELECT ${rowProjection} FROM external_published_tasks ORDER BY published_at,task_id,version`)).rows as StoreRow[];
    return Promise.all(rows.map(row => this.recordOf(row)));
  }

  async publishedVersion(taskId: string, version: number): Promise<PublishedReleaseRecord | null> {
    const row = await this.readRow('WHERE task_id=$1 AND version=$2 LIMIT 1', [taskId, version]);
    return row ? this.recordOf(row) : null;
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const client = await this.acquireClient();
    try {
      await client.query('BEGIN');
      try {
        const claimed = await client.query(`INSERT INTO external_bridge_claims (event_id,nonce,payload_hash,task_id,task_version,manifest_hash,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (event_id) DO NOTHING`, [input.eventId, input.nonce, input.payloadHash, input.manifest.taskId, input.manifest.version, input.manifestHash, input.expiresAt]);
        if (claimed.rowCount === 0) {
          const prior = (await client.query('SELECT payload_hash FROM external_bridge_claims WHERE event_id=$1', [input.eventId])).rows[0] as { payload_hash: string } | undefined;
          if (prior && prior.payload_hash === input.payloadHash) {
            await client.query('ROLLBACK');
            return { outcome: 'duplicate', record: (await this.published(input.eventId)) ?? (await this.requireRecord(input)) };
          }
          await client.query('ROLLBACK');
          throw new BridgeRejected('replay');
        }
      } catch (error) {
        await this.rollbackQuietly(client);
        throw this.mapStoreError(error);
      }
      let outcome: PublishResult['outcome'] = 'published';
      const content = (await client.query('SELECT manifest_hash,package_sha256,event_id FROM external_published_tasks WHERE task_id=$1 AND version=$2', [input.manifest.taskId, input.manifest.version])).rows[0] as { manifest_hash: string; package_sha256: string } | undefined;
      if (content) {
        if (content.manifest_hash !== input.manifestHash || content.package_sha256 !== input.packageSha256) {
          await client.query('ROLLBACK');
          throw new BridgeRejected('task_conflict');
        }
        outcome = 'duplicate';
      } else {
        try {
          await client.query(`INSERT INTO external_published_tasks (event_id,task_id,lineage_id,version,manifest_hash,payload_hash,package_sha256,package_byte_size,package_bytes,contract,listing,manifest) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [
            input.eventId, input.manifest.taskId, input.contract.lineageId, input.manifest.version, input.manifestHash, input.payloadHash, input.packageSha256, input.packageBytes.length, input.packageBytes, JSON.stringify(input.contract), JSON.stringify(input.listing), JSON.stringify(input.manifest)
          ]);
        } catch (error) {
          await this.rollbackQuietly(client);
          if (!(error instanceof BridgeRejected) && this.isConstraint(error, 'external_published_task_content_unique')) return { outcome: 'duplicate', record: (await this.requireRecord(input)) };
          throw this.mapStoreError(error);
        }
      }
      await client.query('COMMIT');
      if (outcome === 'published') {
        const record = await this.published(input.eventId);
        return { outcome, record: record ?? (await this.requireRecord(input)) };
      }
      const existing = await this.publishedVersion(input.manifest.taskId, input.manifest.version);
      return { outcome, record: existing ?? (await this.requireRecord(input)) };
    } finally {
      client.release();
    }
  }

  private async requireRecord(input: PublishInput): Promise<PublishedReleaseRecord> {
    const record = await this.published(input.eventId);
    if (record && record.manifestHash === input.manifestHash) return record;
    const byVersion = await this.publishedVersion(input.manifest.taskId, input.manifest.version);
    if (byVersion && byVersion.manifestHash === input.manifestHash) return byVersion;
    throw new BridgeRejected('persistence_unavailable');
  }

  private async acquireClient(): Promise<PoolClient> {
    try {
      return await this.pool.connect();
    } catch {
      throw new BridgeRejected('persistence_unavailable');
    }
  }

  private async readRow(where: string, values: unknown[]): Promise<StoreRow | undefined> {
    try {
      return (await this.pool.query(`SELECT ${rowProjection} FROM external_published_tasks ${where}`, values)).rows[0] as StoreRow | undefined;
    } catch {
      throw new BridgeRejected('persistence_unavailable');
    }
  }

  private async recordOf(row: StoreRow): Promise<PublishedReleaseRecord> {
    return {
      eventId: row.event_id,
      payloadHash: row.payload_hash,
      publishedAt: row.published_at instanceof Date ? row.published_at.toISOString() : new Date(row.published_at).toISOString(),
      manifestHash: row.manifest_hash,
      manifest: row.manifest as ApprovedReleaseManifest,
      contract: row.contract as ExternalTaskContract,
      listing: row.listing as PublicListing,
      packageSha256: row.package_sha256,
      packageByteSize: row.package_byte_size,
      packageBytes: row.package_bytes
    };
  }

  private isConstraint(error: unknown, constraint: string): boolean {
    return typeof error === 'object' && error !== null && (error as { constraint?: string }).constraint === constraint;
  }

  private mapStoreError(error: unknown): unknown {
    if (error instanceof BridgeRejected) return error;
    if (this.isConstraint(error, 'external_bridge_claims_nonce_unique')) return new BridgeRejected('replay');
    if (this.isConstraint(error, 'external_published_task_content_unique')) return new BridgeRejected('task_conflict');
    return new BridgeRejected('persistence_unavailable');
  }

  private async rollbackQuietly(client: PoolClient): Promise<void> {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* transaction is already aborted; nothing else to release */
    }
  }
}

interface ReleaseClaimDatabase {
  claimReplay(claim: BridgeClaim): Promise<boolean>;
}
