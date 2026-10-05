import { z } from 'zod';
import { ApprovedReleaseManifestSchema, ExternalTaskContractSchema, PublicCheckSchema, PublicInterfaceSchema, PublicListingSchema, TaskTermsSchema, WorkUnitSchema, projectPublicListing } from '../../../packages/contracts/public/index.js';
import { PortablePathSchema } from '../../../packages/contracts/paths.js';
import { HashSchema, IdSchema, MoneySchema, OpaqueIdSchema, RequirementSchema, TextSchema, TimestampSchema } from '../../../packages/contracts/common.js';
import { contentHash } from '../../../packages/contracts/hash.js';
import type { ApprovedReleaseManifest } from '../../../packages/contracts/public/index.js';
import { BridgeRejected } from '../bridge/types.js';
import type { PublishedReleaseRecord } from './persistence.js';

const BoardEntrySchema = z.strictObject({
  schemaVersion: z.literal(1),
  taskId: OpaqueIdSchema,
  version: z.number().int().positive(),
  title: TextSchema,
  purpose: TextSchema,
  disciplines: z.array(IdSchema).min(1).max(32),
  reward: MoneySchema,
  estimatedEffortMinutes: z.number().int().nonnegative().max(525600).nullable(),
  terms: PublicListingSchema.shape.terms,
  publishedAt: TimestampSchema
});

const BoardScopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  taskId: OpaqueIdSchema,
  lineageId: OpaqueIdSchema,
  version: z.number().int().positive(),
  title: TextSchema,
  purpose: TextSchema,
  disciplines: z.array(IdSchema).min(1).max(32),
  workUnits: z.array(WorkUnitSchema).min(1).max(64),
  interfaces: z.array(PublicInterfaceSchema).max(128),
  requirements: z.array(RequirementSchema).max(256),
  endToEndRequirements: z.array(RequirementSchema).max(256),
  publicChecks: z.array(PublicCheckSchema).min(1).max(512),
  editablePaths: z.array(PortablePathSchema).min(1).max(512),
  dependencies: z.array(z.strictObject({ name: z.string(), version: z.string() })).max(64),
  template: z.strictObject({ id: IdSchema, version: z.number().int().positive(), sha256: HashSchema }),
  imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  executionProfile: z.literal('dedicated-linux-kvm-fresh-vm'),
  acceptanceCategories: z.array(z.enum(['contract_failure', 'integration_failure', 'package_defect', 'infrastructure_failure', 'passed', 'unverified'])).length(6),
  terms: PublicListingSchema.shape.terms,
  reward: MoneySchema,
  feedbackPolicyId: IdSchema,
  package: z.strictObject({ sha256: HashSchema, byteSize: z.number().int().positive().max(134217728) })
});

export type ReleaseBoardEntry = z.infer<typeof BoardEntrySchema>;
export type ReleaseBoardScope = z.infer<typeof BoardScopeSchema>;

function verifiedBinding(record: PublishedReleaseRecord): { manifest: ApprovedReleaseManifest; contract: z.infer<typeof ExternalTaskContractSchema>; listing: z.infer<typeof PublicListingSchema> } {
  const manifest = parseStrict(ApprovedReleaseManifestSchema, record.manifest);
  const contract = parseStrict(ExternalTaskContractSchema, record.contract);
  const listing = parseStrict(PublicListingSchema, record.listing);
  if (record.manifestHash !== contentHash(manifest) || manifest.contractHash !== contentHash(contract) || manifest.listingHash !== contentHash(listing) || manifest.listingHash !== contentHash(projectPublicListing(contract, listing.estimatedEffortMinutes)) || manifest.taskId !== contract.taskId || manifest.version !== contract.version || listing.taskId !== contract.taskId || listing.version !== contract.version) throw new BridgeRejected('record_invalid');
  return { manifest, contract, listing };
}

function parseStrict<Schema extends z.ZodType>(schema: Schema, value: unknown): z.infer<Schema> {
  try {
    return schema.parse(value);
  } catch {
    throw new BridgeRejected('record_invalid');
  }
}

export function projectBoardEntry(record: PublishedReleaseRecord): ReleaseBoardEntry {
  const verified = verifiedBinding(record);
  return parseStrict(BoardEntrySchema, {
    schemaVersion: 1,
    taskId: verified.contract.taskId,
    version: verified.contract.version,
    title: verified.listing.title,
    purpose: verified.listing.purpose,
    disciplines: verified.listing.disciplines,
    reward: verified.listing.reward,
    estimatedEffortMinutes: verified.listing.estimatedEffortMinutes,
    terms: verified.listing.terms,
    publishedAt: record.publishedAt
  });
}

export function projectBoardScope(record: PublishedReleaseRecord): ReleaseBoardScope {
  const verified = verifiedBinding(record);
  if (contentHash(verified.contract.reward) !== contentHash(verified.listing.reward) || contentHash(verified.contract.terms) !== contentHash(verified.listing.terms)) throw new BridgeRejected('record_invalid');
  return parseStrict(BoardScopeSchema, {
    schemaVersion: 1,
    taskId: verified.contract.taskId,
    lineageId: verified.contract.lineageId,
    version: verified.contract.version,
    title: verified.contract.title,
    purpose: verified.contract.purpose,
    disciplines: verified.contract.disciplines,
    workUnits: verified.contract.workUnits,
    interfaces: verified.contract.interfaces,
    requirements: verified.contract.requirements,
    endToEndRequirements: verified.contract.endToEndRequirements,
    publicChecks: verified.contract.publicChecks,
    editablePaths: verified.contract.editablePaths,
    dependencies: verified.contract.dependencies,
    template: verified.contract.template,
    imageDigest: verified.contract.imageDigest,
    executionProfile: verified.contract.executionProfile,
    acceptanceCategories: verified.contract.acceptanceCategories,
    terms: verified.contract.terms,
    reward: verified.contract.reward,
    feedbackPolicyId: verified.contract.feedbackPolicyId,
    package: { sha256: record.packageSha256, byteSize: record.packageBytes.byteLength }
  });
}
