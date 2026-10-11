import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { ApprovedReleaseCompiler } from '../../../services/private-api/releases/compiler.js';
import { preparePublicWorkspace } from '../../../packages/compiler/workspace.js';
import { PUBLIC_IMAGE_PROFILE } from '../../../templates/workspaces/public-image-profile.js';
import { canonicalize, byteHash } from '../../../packages/contracts/hash.js';
import { stageReleaseCandidate } from '../../../services/private-api/releases/staging.js';
import { projectPublicListing } from '../../../packages/contracts/public/task.js';
import { singleUnitContract } from '../../contracts/fixtures.js';

const keys = generateKeyPairSync('ed25519');
const actor = { id: randomUUID(), role: 'owner' as const, sessionHash: 'a'.repeat(64), csrfHash: 'b'.repeat(64) };
function fixture(authorized = true) {
  const prepared = preparePublicWorkspace(singleUnitContract(), { imageDigest: PUBLIC_IMAGE_PROFILE.imageDigest });
  const candidate = { contract: prepared.contract, listing: projectPublicListing(prepared.contract, 30), assets: prepared.assets.map(asset => ({ ...asset, sourceAssetId: randomUUID() })), feedbackPolicy: { schemaVersion: 1, id: prepared.contract.feedbackPolicyId, categories: ['received','processing','owner_review','accepted','changes_required','package_defect','infrastructure_issue','expired'], messageCodes: ['requirement_not_met','invalid_input','check_unavailable','passed'], privateDiagnostics: 'none', publicDetails: 'approved_public_checks_only' } };
  const contents = stageReleaseCandidate(candidate);
  const row = { version: 2, state: 'approved', manifest_hash: contents.manifestHash, candidate, manifest: contents.manifest, signature: sign(null, Buffer.from(canonicalize(contents.manifest)), keys.privateKey).toString('base64') };
  const objects = contents.assets.map(asset => ({ path: asset.path, sha256: asset.sha256, byte_count: asset.byteSize, payload: Buffer.from(asset.contentBase64, 'base64') }));
  const query = vi.fn(async (sql: string, _args?: unknown[]) => ({ rows: sql.includes('JOIN private_sessions') ? authorized ? [{ id: actor.id }] : [] : sql.includes('FROM private_release_candidates') ? [row] : sql.includes('FROM private_release_asset_links') ? objects : [] }));
  const pool = { connect: async () => ({ query, release: vi.fn() }) } as unknown as ConstructorParameters<typeof ApprovedReleaseCompiler>[0];
  return { compiler: new ApprovedReleaseCompiler(pool, keys.publicKey), query, row, objects };
}
it('compiles only immutable approved objects under active owner/current-intent locks with no arbitrary repository capability', async () => {
  const { compiler, query, row } = fixture();
  const artifact = await compiler.compile(actor, randomUUID(), { expectedVersion: 2, manifestHash: row.manifest_hash });
  expect(artifact.sha256).toBe(byteHash(artifact.bytes));
  expect(artifact.runtimeReadiness).toBe('unverified');
  expect(query.mock.calls.find(([sql]) => sql.includes('JOIN private_sessions'))![0]).toContain('session.expires_at>now()');
  expect(query.mock.calls.find(([sql]) => sql.includes('FROM private_release_candidates'))![0]).toContain("intent.state='approved'");
  expect(query.mock.calls.find(([sql]) => sql.includes('FROM private_release_candidates'))![0]).toContain('FOR SHARE');
  expect(query.mock.calls.at(-1)![0]).toBe('COMMIT');
});
it('revoked owner and requester/operator/contributor cannot access package bytes', async () => {
  const { compiler, row } = fixture(false);
  await expect(compiler.compile(actor, randomUUID(), { expectedVersion: 2, manifestHash: row.manifest_hash })).rejects.toThrow('forbidden_role');
  for (const role of ['requester','operator','contributor']) await expect(compiler.compile({ ...actor, role } as never, randomUUID(), { expectedVersion: 2, manifestHash: row.manifest_hash })).rejects.toThrow('forbidden_role');
});
it('staged/unapproved records, changed hashes and corrupted stored bytes never reach a compiled artifact', async () => {
  const { compiler, row, objects } = fixture();
  await expect(compiler.compile(actor, randomUUID(), { expectedVersion: 1, manifestHash: row.manifest_hash })).rejects.toThrow('stale_version');
  row.state = 'release_review';
  await expect(compiler.compile(actor, randomUUID(), { expectedVersion: 2, manifestHash: row.manifest_hash })).rejects.toThrow('stale_version');
  row.state = 'approved'; objects[0]!.payload = Buffer.from('corrupt');
  await expect(compiler.compile(actor, randomUUID(), { expectedVersion: 2, manifestHash: row.manifest_hash })).rejects.toThrow('missing_evidence');
});
