import type { ApprovedReleaseManifest, ExternalTaskContract, PublicListing } from '../../../packages/contracts/public/index.js';
import { BridgeRejected } from '../bridge/types.js';

export interface BridgeClaim {
  eventId: string;
  nonce: string;
  /** Canonical SHA-256 of the exact delivered packet; identical replay bytes share it. */
  payloadHash: string;
  expiresAt: string;
}

export interface ReleaseClaimStore {
  /** True when event id and nonce are both unseen and now claimed; false means replay/duplicate. */
  claimReplay(claim: BridgeClaim): Promise<boolean>;
}

export interface PublishedReleaseRecord {
  eventId: string;
  payloadHash: string;
  publishedAt: string;
  manifestHash: string;
  manifest: ApprovedReleaseManifest;
  contract: ExternalTaskContract;
  listing: PublicListing;
  packageSha256: string;
  packageByteSize: number;
  packageBytes: Uint8Array;
}

export interface PublishInput {
  eventId: string;
  nonce: string;
  payloadHash: string;
  expiresAt: string;
  manifestHash: string;
  manifest: ApprovedReleaseManifest;
  contract: ExternalTaskContract;
  listing: PublicListing;
  packageSha256: string;
  packageBytes: Uint8Array;
}

export type PublishResult = { outcome: 'published' | 'duplicate'; record: PublishedReleaseRecord };

export interface PublishedTaskPersistence {
  published(eventId: string): Promise<PublishedReleaseRecord | null>;
  publish(input: PublishInput): Promise<PublishResult>;
  allPublished(): Promise<PublishedReleaseRecord[]>;
  publishedVersion(taskId: string, version: number): Promise<PublishedReleaseRecord | null>;
}

/**
 * In-memory implementation of the publication store contract. Mirrors the SQL
 * store semantics: one content row per (taskId, version), identical content is
 * idempotent, anything else for a published version is a conflict, and event
 * or nonce reuse is replay. Claims register here exactly like the SQL claims.
 */
export class MemoryPublishedTaskPersistence implements PublishedTaskPersistence, ReleaseClaimStore {
  private readonly versions = new Map<string, PublishedReleaseRecord>();
  private readonly events = new Map<string, PublishedReleaseRecord>();
  private readonly nonces = new Set<string>();

  async claimReplay(claim: BridgeClaim): Promise<boolean> {
    const prior = this.events.get(claim.eventId);
    if (prior) return false;
    if (this.nonces.has(claim.nonce)) return false;
    this.nonces.add(claim.nonce);
    return true;
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const identity = `${input.manifest.taskId}:${input.manifest.version}`;
    const existing = this.versions.get(identity);
    if (existing) {
      if (existing.manifestHash !== input.manifestHash || existing.packageSha256 !== input.packageSha256) throw new BridgeRejected('task_conflict');
      return { outcome: 'duplicate', record: existing };
    }
    const record: PublishedReleaseRecord = {
      eventId: input.eventId,
      payloadHash: input.payloadHash,
      publishedAt: new Date().toISOString(),
      manifestHash: input.manifestHash,
      manifest: structuredClone(input.manifest),
      contract: structuredClone(input.contract),
      listing: structuredClone(input.listing),
      packageSha256: input.packageSha256,
      packageByteSize: input.packageBytes.length,
      packageBytes: Buffer.from(input.packageBytes)
    };
    this.versions.set(identity, record);
    this.events.set(input.eventId, record);
    return { outcome: 'published', record };
  }

  async published(eventId: string): Promise<PublishedReleaseRecord | null> {
    return this.events.get(eventId) ?? null;
  }

  async allPublished(): Promise<PublishedReleaseRecord[]> {
    return [...this.versions.values()];
  }

  async publishedVersion(taskId: string, version: number): Promise<PublishedReleaseRecord | null> {
    return this.versions.get(`${taskId}:${version}`) ?? null;
  }
}
