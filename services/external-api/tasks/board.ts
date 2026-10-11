import { BridgeRejected } from '../bridge/types.js';
import { decodeDeterministicPackage, validateReleasedPackage } from '../bridge/packaging.js';
import type { PublishedReleaseRecord, PublishedTaskPersistence } from './persistence.js';
import { projectBoardEntry, projectBoardScope } from './projections.js';
import type { ReleaseBoardEntry, ReleaseBoardScope } from './projections.js';

export interface PublishedPackageRetrieval {
  taskId: string;
  version: number;
  lineageId: string;
  manifestHash: string;
  sha256: string;
  byteSize: number;
  bytes: Uint8Array;
}

/**
 * Local board reading layer. Every served projection re-derives from the
 * stored released contract/listing through the strict allowlists and every
 * served package byte stream is re-validated against the approved manifest
 * hashes; a mismatch in the store or bytes fails closed.
 */
export class PublishedTaskBoard {
  constructor(private readonly store: PublishedTaskPersistence) {}

  async entries(): Promise<ReleaseBoardEntry[]> {
    const records = await this.store.allPublished();
    return records.map(record => projectBoardEntry(record));
  }

  async scope(taskId: string, version: number): Promise<ReleaseBoardScope> {
    const record = await this.require(taskId, version);
    return projectBoardScope(record);
  }

  async entry(taskId: string, version: number): Promise<ReleaseBoardEntry> {
    const record = await this.require(taskId, version);
    return projectBoardEntry(record);
  }

  async package(taskId: string, version: number): Promise<PublishedPackageRetrieval> {
    const record = await this.require(taskId, version);
    const entries = decodeDeterministicPackage(record.packageBytes);
    validateReleasedPackage(entries, { manifest: record.manifest, contract: record.contract, listing: record.listing });
    return {
      taskId: record.manifest.taskId,
      version: record.manifest.version,
      lineageId: record.contract.lineageId,
      manifestHash: record.manifestHash,
      sha256: record.packageSha256,
      byteSize: record.packageBytes.length,
      bytes: record.packageBytes
    };
  }

  async publishedRecord(taskId: string, version: number): Promise<PublishedReleaseRecord> {
    return this.require(taskId, version);
  }

  private async require(taskId: string, version: number): Promise<PublishedReleaseRecord> {
    const record = await this.store.publishedVersion(taskId, version);
    if (!record) throw new BridgeRejected('not_published');
    return record;
  }
}
