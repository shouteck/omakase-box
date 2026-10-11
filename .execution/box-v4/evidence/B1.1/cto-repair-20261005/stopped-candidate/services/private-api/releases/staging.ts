import { z } from 'zod';
import { byteHash, canonicalize, contentHash } from '../../../packages/contracts/hash.js';
import { ApprovedReleaseManifestSchema, ReleaseAssetSchema } from '../../../packages/contracts/public/release.js';
import { ExternalTaskContractSchema, PublicListingSchema, projectPublicListing } from '../../../packages/contracts/public/task.js';
import { PublicFeedbackSchema } from '../../../packages/contracts/public/submission.js';
import { IdSchema } from '../../../packages/contracts/common.js';

const feedbackCategories = ['received', 'processing', 'owner_review', 'accepted', 'changes_required', 'package_defect', 'infrastructure_issue', 'expired'] as const;
const messageCodes = ['requirement_not_met', 'invalid_input', 'check_unavailable', 'passed'] as const;
const FeedbackPolicySchema = z.strictObject({
  schemaVersion: z.literal(1), id: IdSchema, categories: z.array(PublicFeedbackSchema.shape.category).length(8),
  messageCodes: z.array(z.enum(messageCodes)).length(4), privateDiagnostics: z.literal('none'), publicDetails: z.literal('approved_public_checks_only')
}).superRefine((policy, context) => {
  if (new Set(policy.categories).size !== feedbackCategories.length || new Set(policy.messageCodes).size !== messageCodes.length) context.addIssue({ code: 'custom', message: 'Feedback vocabulary must be complete and unique.' });
});
const CandidateSchema = z.strictObject({
  contract: ExternalTaskContractSchema, listing: PublicListingSchema, feedbackPolicy: FeedbackPolicySchema,
  assets: z.array(z.strictObject({ path: ReleaseAssetSchema.shape.path, sourceAssetId: ReleaseAssetSchema.shape.sourceAssetId, mediaType: ReleaseAssetSchema.shape.mediaType, contentBase64: z.string().max(13981016) })).min(1).max(1024)
});
function releasePathAllowed(path: string): boolean {
  const lower = path.toLowerCase(), segments = lower.split('/');
  return !segments.some(segment => ['.git', 'node_modules', 'private', 'cache', '.cache', 'logs', 'coverage'].includes(segment) || segment === '.env' || segment.startsWith('.env.')) && !lower.endsWith('.map') && !lower.endsWith('.log');
}
function decodeAsset(asset: z.infer<typeof CandidateSchema>['assets'][number]) {
  if (!releasePathAllowed(asset.path)) throw new Error('invalid_release_candidate');
  const bytes = Buffer.from(asset.contentBase64, 'base64');
  if (bytes.length > 10485760 || bytes.toString('base64') !== asset.contentBase64) throw new Error('invalid_release_candidate');
  const descriptor = { path: asset.path, sourceAssetId: asset.sourceAssetId, mediaType: asset.mediaType, byteSize: bytes.length, sha256: byteHash(bytes) };
  if (asset.mediaType === 'image/png' || asset.mediaType === 'image/jpeg') {
    const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (asset.mediaType === 'image/png' ? !png : !jpeg) throw new Error('invalid_release_candidate');
    return { ...descriptor, encoding: 'base64' as const, contentBase64: asset.contentBase64, text: null };
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw new Error('invalid_release_candidate');
  return { ...descriptor, encoding: 'utf8' as const, contentBase64: asset.contentBase64, text };
}
export function stageReleaseCandidate(input: unknown) {
  try {
    const encoded = canonicalize(input);
    if (Buffer.byteLength(encoded, 'utf8') > 16777216) throw new Error('invalid_release_candidate');
    const candidate = CandidateSchema.parse(JSON.parse(encoded));
    const { contract, listing, feedbackPolicy } = candidate;
    if (contentHash(listing) !== contentHash(projectPublicListing(contract, listing.estimatedEffortMinutes)) || feedbackPolicy.id !== contract.feedbackPolicyId) throw new Error('invalid_release_candidate');
    const assets = candidate.assets.map(decodeAsset).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    const byPath = new Map(assets.map(asset => [asset.path, asset]));
    if (contract.editablePaths.some(path => !byPath.has(path)) || contract.interfaces.some(item => byPath.get(item.schema.path)?.sha256 !== item.schema.sha256 || byPath.get(item.schema.path)?.mediaType !== 'application/json')) throw new Error('invalid_release_candidate');
    const paymentTerms = { schemaVersion: 1 as const, terminology: 'payment obligation' as const, settlementLabel: 'settlement recorded' as const, reward: contract.reward, terms: contract.terms };
    const manifest = ApprovedReleaseManifestSchema.parse({
      schemaVersion: 1, canonicalizationVersion: 'json-sorted-utf8/v1', taskId: contract.taskId, version: contract.version,
      assets: assets.map(({ path, sourceAssetId, mediaType, byteSize, sha256 }) => ({ path, sourceAssetId, mediaType, byteSize, sha256 })),
      contractHash: contentHash(contract), listingHash: contentHash(listing), feedbackPolicyHash: contentHash(feedbackPolicy), paymentTermsHash: contentHash(paymentTerms),
      templateHash: contract.template.sha256, executionImageDigest: contract.imageDigest
    });
    return {
      assurance: 'bounded' as const, state: 'release_review' as const, approval: null, packageReady: false as const,
      manifest, manifestHash: contentHash(manifest), contract, listing, feedbackPolicy, paymentTerms, assets,
      combinedDisclosure: { reviewRequired: true as const, unitIds: contract.workUnits.map(unit => unit.id), interfaceIds: contract.interfaces.map(item => item.id), capabilities: [...new Set(contract.workUnits.flatMap(unit => unit.requiredCapabilities))].sort() }
    };
  } catch { throw new Error('invalid_release_candidate'); }
}
export type ReleaseContentsReview = ReturnType<typeof stageReleaseCandidate>;
