import { ExternalTaskContractSchema, PublicListingSchema } from '../../../packages/contracts/public/index.js';
import type { ExternalTaskContract, PublicListing } from '../../../packages/contracts/public/index.js';
import type { ReservationView } from './reservation-store.js';

export const DOWNLOAD_REJECTIONS = ['not_published', 'record_invalid', 'reservation_expired', 'reservation_closed'] as const;
export type DownloadRejection = typeof DOWNLOAD_REJECTIONS[number];

/** Fixed safe boundary error: only the code is enumerable on the wire. */
export class DownloadRejected extends Error {
  readonly code: DownloadRejection;
  constructor(code: DownloadRejection) {
    super(code);
    Object.defineProperty(this, 'name', { value: 'DownloadRejected', enumerable: false, writable: false, configurable: true });
    this.code = code;
  }
}

export interface ServedPackage {
  sha256: string;
  byteSize: number;
  bytes: Uint8Array;
  manifestHash: string;
  lineageId: string;
}

export interface BoardPackageSource {
  package(taskId: string, version: number): Promise<ServedPackage>;
}

export interface ReleasedRecordSource {
  publishedRecord(taskId: string, version: number): Promise<{ contract: unknown; listing: unknown }>;
}

export interface DownloadContext {
  board: BoardPackageSource & ReleasedRecordSource;
}

export interface DownloadedPackage {
  fileName: string;
  sha256: string;
  byteSize: number;
  bytes: Uint8Array;
}

export interface ReservationInstructions {
  schemaVersion: 1;
  purpose: string;
  requirements: Array<{ id: string; description: string }>;
  editBoundary: string[];
  environment: { dependencies: Array<{ name: string; version: string }>; template: { id: string; version: number; sha256: string }; executionProfile: string };
  acceptance: { categories: readonly string[]; publicChecks: string[] };
  reward: { currency: string; amountMinor: number };
  compensation: { revisionPolicy: 'preserve_original_expiry'; packageDefectCompensation: { currency: string; amountMinor: number }; cancellationPolicy: string; budgetExhaustionPolicy: string };
  feedbackPolicyId: string;
}

export interface ReservationDownload {
  schemaVersion: 1;
  reservationId: string;
  taskId: string;
  taskVersion: number;
  package: DownloadedPackage;
  instructions: ReservationInstructions;
}

export const DEFECT_CATEGORY_OPTIONS = ['missing_context', 'missing_dependency', 'environment_failure', 'documentation_failure', 'other'] as const;

/**
 * Contributor release download and instructions (M6.2). Serves only approved,
 * released data re-validated through the strict contract/listing schemas; no
 * chat endpoint, no private AI endpoint and no repository browsing exist.
 */
export async function projectReservationDownload(
  context: { board: BoardPackageSource & ReleasedRecordSource },
  view: Pick<ReservationView, 'id' | 'taskId' | 'taskVersion' | 'state' | 'expiresAt'>,
  nowMs: number
): Promise<ReservationDownload> {
  if (view.state === 'cancelled' || view.state === 'accepted') throw new DownloadRejected('reservation_closed');
  if (view.state === 'expired' || !Number.isFinite(Date.parse(view.expiresAt)) || Date.parse(view.expiresAt) <= nowMs) throw new DownloadRejected('reservation_expired');
  const served = await context.board.package(view.taskId, view.taskVersion);
  const record = await context.board.publishedRecord(view.taskId, view.taskVersion);
  const contract = parseContract(record.contract);
  const listing = parseListing(record.listing);
  if (contract.taskId !== view.taskId || contract.version !== view.taskVersion || listing.taskId !== view.taskId || listing.version !== view.taskVersion) throw new DownloadRejected('record_invalid');
  if (listing.reward.currency !== contract.reward.currency || listing.reward.amountMinor !== contract.reward.amountMinor) throw new DownloadRejected('record_invalid');
  if (listing.terms.reservationDurationSeconds !== contract.terms.reservationDurationSeconds) throw new DownloadRejected('record_invalid');
  return {
    schemaVersion: 1,
    reservationId: view.id,
    taskId: contract.taskId,
    taskVersion: contract.version,
    package: { fileName: `task-${contract.taskId}-v${contract.version}.zip`, sha256: served.sha256, byteSize: served.byteSize, bytes: served.bytes },
    instructions: {
      schemaVersion: 1,
      purpose: contract.purpose,
      requirements: contract.requirements.map(requirement => ({ id: requirement.id, description: requirement.description })),
      editBoundary: [...contract.editablePaths],
      environment: {
        dependencies: contract.dependencies.map(dependency => ({ ...dependency })),
        template: { id: contract.template.id, version: contract.template.version, sha256: contract.template.sha256 },
        executionProfile: contract.executionProfile
      },
      acceptance: { categories: contract.acceptanceCategories, publicChecks: contract.publicChecks.map(check => check.id) },
      reward: { ...contract.reward },
      compensation: {
        revisionPolicy: contract.terms.revisionPolicy,
        packageDefectCompensation: { ...contract.terms.packageDefectCompensation },
        cancellationPolicy: contract.terms.cancellationPolicy,
        budgetExhaustionPolicy: contract.terms.budgetExhaustionPolicy
      },
      feedbackPolicyId: contract.feedbackPolicyId
    }
  };
}

function parseContract(value: unknown): ExternalTaskContract {
  try {
    return ExternalTaskContractSchema.parse(value);
  } catch {
    throw new DownloadRejected('record_invalid');
  }
}

function parseListing(value: unknown): PublicListing {
  try {
    return PublicListingSchema.parse(value);
  } catch {
    throw new DownloadRejected('record_invalid');
  }
}
