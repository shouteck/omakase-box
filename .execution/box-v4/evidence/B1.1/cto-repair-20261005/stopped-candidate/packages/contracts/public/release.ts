import { z } from 'zod';
import { HashSchema, OpaqueIdSchema, TimestampSchema, VersionSchema } from '../common.js';
import { assertDistinctPaths, PortablePathSchema } from '../paths.js';
import { ExternalTaskContractSchema, PublicListingSchema } from './task.js';

export const ReleaseAssetSchema = z.strictObject({
  path: PortablePathSchema,
  sha256: HashSchema,
  byteSize: z.number().int().nonnegative().max(10485760),
  mediaType: z.enum(['application/json', 'application/typescript', 'text/plain', 'text/css', 'text/html', 'image/png', 'image/jpeg']),
  sourceAssetId: OpaqueIdSchema
});
export const ApprovedReleaseManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  canonicalizationVersion: z.literal('json-sorted-utf8/v1'),
  taskId: OpaqueIdSchema,
  version: VersionSchema,
  assets: z.array(ReleaseAssetSchema).min(1).max(1024),
  contractHash: HashSchema,
  listingHash: HashSchema,
  feedbackPolicyHash: HashSchema,
  paymentTermsHash: HashSchema,
  templateHash: HashSchema,
  executionImageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/)
}).superRefine((manifest, context) => {
  try { assertDistinctPaths(manifest.assets.map(asset => asset.path)); } catch { context.addIssue({ code: 'custom', message: 'Colliding manifest paths.' }); }
  if (manifest.assets.reduce((sum, asset) => sum + asset.byteSize, 0) > 104857600) context.addIssue({ code: 'custom', message: 'Release byte budget exceeded.' });
});
export const SignedReleasedEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  eventId: OpaqueIdSchema,
  nonce: OpaqueIdSchema,
  expiresAt: TimestampSchema,
  manifest: ApprovedReleaseManifestSchema,
  manifestHash: HashSchema,
  contract: ExternalTaskContractSchema,
  listing: PublicListingSchema,
  signature: z.string().regex(/^[A-Za-z0-9+/]{86}==$/)
}).superRefine((envelope, context) => {
  const { manifest, contract, listing } = envelope;
  if (manifest.taskId !== contract.taskId || listing.taskId !== contract.taskId || manifest.version !== contract.version || listing.version !== contract.version) context.addIssue({ code: 'custom', message: 'Release task/version mismatch.' });
});
export type ApprovedReleaseManifest = z.infer<typeof ApprovedReleaseManifestSchema>;
export type SignedReleasedEnvelope = z.infer<typeof SignedReleasedEnvelopeSchema>;
