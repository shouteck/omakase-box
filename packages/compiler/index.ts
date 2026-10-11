import { createPublicKey, verify } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { byteHash, canonicalize, contentHash } from '../contracts/hash.js';
import { ApprovedReleaseManifestSchema } from '../contracts/public/release.js';
import { ExternalTaskContractSchema, PublicListingSchema, projectPublicListing } from '../contracts/public/task.js';
import { PublicFeedbackSchema } from '../contracts/public/submission.js';
import { assertDistinctPaths, PortablePathSchema } from '../contracts/paths.js';
import { deterministicZip } from './zip.js';

function object(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== keys.length || keys.some(key => !Object.hasOwn(input, key))) throw new Error('invalid_approved_release');
  return input as Record<string, unknown>;
}
function safeAssetPath(input: unknown): string {
  const path = PortablePathSchema.parse(input), lower = path.toLowerCase();
  if (lower.startsWith('release/') || lower.split('/').some(segment => ['.git', '.github', '.runtime', 'node_modules', 'private', 'secrets', 'cache', '.cache', 'coverage', 'logs', 'dist'].includes(segment) || segment === '.env' || segment.startsWith('.env.')) || lower.endsWith('.map') || lower.endsWith('.log')) throw new Error('invalid_approved_release');
  return path;
}
const categories = ['received', 'processing', 'owner_review', 'accepted', 'changes_required', 'package_defect', 'infrastructure_issue', 'expired'];
const messageCodes = ['requirement_not_met', 'invalid_input', 'check_unavailable', 'passed'];
function exactVocabulary(input: unknown, allowed: readonly string[]) {
  if (!Array.isArray(input) || input.length !== allowed.length || new Set(input).size !== allowed.length || input.some(item => !allowed.includes(item as string))) throw new Error('invalid_approved_release');
}
export function compileApprovedRelease(input: unknown, verificationKey: KeyObject | string | Buffer) {
  try {
    const encoded = canonicalize(input);
    if (Buffer.byteLength(encoded) > 160000000) throw new Error('invalid_approved_release');
    const release = object(JSON.parse(encoded), ['manifest', 'manifestHash', 'signature', 'contract', 'listing', 'feedbackPolicy', 'paymentTerms', 'assets']);
    const key = typeof verificationKey === 'string' || Buffer.isBuffer(verificationKey) ? createPublicKey(verificationKey) : verificationKey;
    if (key.type !== 'public' || key.asymmetricKeyType !== 'ed25519') throw new Error('invalid_approved_release');
    const manifest = ApprovedReleaseManifestSchema.parse(release.manifest);
    if (typeof release.signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(release.signature) || contentHash(manifest) !== release.manifestHash || !verify(null, Buffer.from(canonicalize(manifest), 'utf8'), key, Buffer.from(release.signature, 'base64'))) throw new Error('invalid_approved_release');
    const contract = ExternalTaskContractSchema.parse(release.contract), listing = PublicListingSchema.parse(release.listing);
    if (manifest.taskId !== contract.taskId || manifest.version !== contract.version || contentHash(contract) !== manifest.contractHash || contentHash(listing) !== manifest.listingHash || contentHash(projectPublicListing(contract, listing.estimatedEffortMinutes)) !== manifest.listingHash || contract.template.sha256 !== manifest.templateHash || contract.imageDigest !== manifest.executionImageDigest) throw new Error('invalid_approved_release');
    const feedback = object(release.feedbackPolicy, ['schemaVersion', 'id', 'categories', 'messageCodes', 'privateDiagnostics', 'publicDetails']);
    if (feedback.schemaVersion !== 1 || feedback.id !== contract.feedbackPolicyId || feedback.privateDiagnostics !== 'none' || feedback.publicDetails !== 'approved_public_checks_only' || contentHash(feedback) !== manifest.feedbackPolicyHash) throw new Error('invalid_approved_release');
    exactVocabulary(feedback.categories, categories); exactVocabulary(feedback.messageCodes, messageCodes);
    for (const category of feedback.categories as string[]) PublicFeedbackSchema.shape.category.parse(category);
    const expectedTerms = { schemaVersion: 1, terminology: 'payment obligation', settlementLabel: 'settlement recorded', reward: contract.reward, terms: contract.terms };
    if (contentHash(release.paymentTerms) !== manifest.paymentTermsHash || contentHash(expectedTerms) !== manifest.paymentTermsHash) throw new Error('invalid_approved_release');
    if (!Array.isArray(release.assets) || release.assets.length !== manifest.assets.length) throw new Error('invalid_approved_release');
    const approved = new Map(manifest.assets.map(asset => [asset.path, asset]));
    const entries = release.assets.map(raw => {
      const asset = object(raw, ['path', 'contentBase64']), path = safeAssetPath(asset.path), descriptor = approved.get(path);
      if (!descriptor || typeof asset.contentBase64 !== 'string' || asset.contentBase64.length > 13981016) throw new Error('invalid_approved_release');
      const bytes = Buffer.from(asset.contentBase64, 'base64');
      if (bytes.toString('base64') !== asset.contentBase64 || bytes.length !== descriptor.byteSize || byteHash(bytes) !== descriptor.sha256) throw new Error('invalid_approved_release');
      return { path, bytes };
    });
    assertDistinctPaths(entries.map(entry => entry.path));
    if (new Set(entries.map(entry => entry.path)).size !== approved.size || contract.editablePaths.some(path => !approved.has(path)) || contract.interfaces.some(item => approved.get(item.schema.path)?.sha256 !== item.schema.sha256 || approved.get(item.schema.path)?.mediaType !== 'application/json')) throw new Error('invalid_approved_release');
    const metadata = { 'release/manifest.json': manifest, 'release/contract.json': contract, 'release/listing.json': listing, 'release/feedback-policy.json': feedback, 'release/payment-terms.json': expectedTerms };
    for (const [path, value] of Object.entries(metadata)) entries.push({ path, bytes: Buffer.from(canonicalize(value), 'utf8') });
    const bytes = deterministicZip(entries);
    return { assurance: 'bounded' as const, bytes, sha256: byteHash(bytes), manifestHash: release.manifestHash as string, runtimeReadiness: 'unverified' as const, fileCount: entries.length };
  } catch { throw new Error('invalid_approved_release'); }
}
