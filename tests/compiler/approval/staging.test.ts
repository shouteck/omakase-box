import { describe, expect, it } from 'vitest';
import { byteHash, contentHash } from '../../../packages/contracts/hash.js';
import { projectPublicListing } from '../../../packages/contracts/public/task.js';
import { stageReleaseCandidate } from '../../../services/private-api/releases/staging.js';
import { fullStackContract, singleUnitContract, ids } from '../../contracts/fixtures.js';

function candidate(combined = false) {
  const contract = combined ? fullStackContract(true) : singleUnitContract();
  const assets = contract.editablePaths.map(path => ({ path, sourceAssetId: ids.asset, mediaType: path.endsWith('.json') ? 'application/json' : 'application/typescript', contentBase64: Buffer.from(path.endsWith('.json') ? '{"schemaVersion":1}' : 'export const synthetic = true;\n').toString('base64') }));
  for (const item of contract.interfaces) {
    const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, id: item.schema.id }));
    item.schema.sha256 = byteHash(bytes);
    assets.push({ path: item.schema.path, sourceAssetId: ids.asset, mediaType: 'application/json', contentBase64: bytes.toString('base64') });
  }
  return { contract, listing: projectPublicListing(contract, 30), assets, feedbackPolicy: { schemaVersion: 1, id: contract.feedbackPolicyId, categories: ['received', 'processing', 'owner_review', 'accepted', 'changes_required', 'package_defect', 'infrastructure_issue', 'expired'], messageCodes: ['requirement_not_met', 'invalid_input', 'check_unavailable', 'passed'], privateDiagnostics: 'none', publicDetails: 'approved_public_checks_only' } };
}

describe('exact release-review candidate staging', () => {
  it('shows actual release bytes and hashes, and never manufactures an approval', () => {
    const input = candidate();
    const staged = stageReleaseCandidate(input);
    expect(staged.state).toBe('release_review');
    expect(staged.approval).toBeNull();
    expect(staged.manifestHash).toBe(contentHash(staged.manifest));
    expect(staged.assets[0]).toMatchObject({ path: 'src/PlanSelector.tsx', text: 'export const synthetic = true;\n', sha256: byteHash(Buffer.from('export const synthetic = true;\n')) });
    expect(staged.manifest.contractHash).toBe(contentHash(input.contract));
    expect(staged.manifest.listingHash).toBe(contentHash(input.listing));
    expect(staged.paymentTerms.terminology).toBe('payment obligation');
    expect(staged.paymentTerms.settlementLabel).toBe('settlement recorded');
  });
  it('reviews the complete frontend/backend/policy union as one immutable-content candidate', () => {
    const staged = stageReleaseCandidate(candidate(true));
    expect(staged.combinedDisclosure.unitIds).toEqual(['ui', 'api', 'policy']);
    expect(staged.combinedDisclosure.interfaceIds).toEqual(['selection_http', 'response_policy']);
    expect(staged.combinedDisclosure.capabilities).toEqual(expect.arrayContaining(['browser', 'candidate_api', 'job_proxy', 'data_only_policy']));
    expect(staged.combinedDisclosure.reviewRequired).toBe(true);
    expect(staged.assets).toHaveLength(5);
  });
  it('is deterministic across asset order and independent input objects', () => {
    const input = candidate(true);
    const first = stageReleaseCandidate(input);
    const second = stageReleaseCandidate({ ...structuredClone(input), assets: [...input.assets].reverse() });
    expect(second).toEqual(first);
    first.contract.title = 'Local mutation';
    expect(stageReleaseCandidate(input).contract.title).toBe(input.contract.title);
  });
  it('invalidates the manifest for one changed asset byte or public policy', () => {
    const input = candidate();
    const original = stageReleaseCandidate(input).manifestHash;
    input.assets[0]!.contentBase64 = Buffer.from('export const synthetic = false;\n').toString('base64');
    expect(stageReleaseCandidate(input).manifestHash).not.toBe(original);
    input.listing.estimatedEffortMinutes = 31;
    expect(stageReleaseCandidate(input).manifest.listingHash).toBe(contentHash(input.listing));
  });
  it.each(['.env', '.git/config', 'node_modules/tool.js', 'dist/source.js.map', 'private/log.txt', 'cache/private.txt', '../escape.ts', 'C:/host.txt'])('rejects forbidden release path %s', path => {
    const input = candidate(); input.assets.push({ ...input.assets[0]!, path });
    expect(() => stageReleaseCandidate(input)).toThrow('invalid_release_candidate');
  });
  it('rejects missing editable/schema assets, changed schema bytes and listing disagreement', () => {
    const input = candidate(true);
    expect(() => stageReleaseCandidate({ ...input, assets: input.assets.slice(1) })).toThrow();
    const schema = input.assets.find(asset => asset.path.startsWith('interfaces/'))!;
    schema.contentBase64 = Buffer.from('{"changed":true}').toString('base64');
    expect(() => stageReleaseCandidate(input)).toThrow();
    const wrongListing = candidate(); wrongListing.listing.reward.amountMinor++;
    expect(() => stageReleaseCandidate(wrongListing)).toThrow();
  });
  it('rejects aliasing paths, noncanonical byte encodings, private fields and unsafe feedback', () => {
    const input = candidate();
    expect(() => stageReleaseCandidate({ ...input, assets: [input.assets[0], input.assets[0]] })).toThrow();
    expect(() => stageReleaseCandidate({ ...input, assets: [{ ...input.assets[0], contentBase64: 'not base64' }] })).toThrow();
    expect(() => stageReleaseCandidate({ ...input, approvedBy: ids.task })).toThrow();
    expect(() => stageReleaseCandidate({ ...input, feedbackPolicy: { ...input.feedbackPolicy, privateDiagnostics: 'raw_logs' } })).toThrow();
  });
  it('never invokes supplied object getters or returns private error details', () => {
    let touched = false;
    const input = candidate();
    expect(() => stageReleaseCandidate({ ...input, get privateSource() { touched = true; return 'PRIVATE_CANARY'; } })).toThrow('invalid_release_candidate');
    expect(touched).toBe(false);
  });
});
