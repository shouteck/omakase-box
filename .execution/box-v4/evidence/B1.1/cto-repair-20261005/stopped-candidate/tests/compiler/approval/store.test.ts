import { generateKeyPairSync, randomUUID, verify } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { canonicalize, contentHash } from '../../../packages/contracts/hash.js';
import { PrivateReleaseStore } from '../../../services/private-api/releases/store.js';
import { stageReleaseCandidate } from '../../../services/private-api/releases/staging.js';
import { projectPublicListing } from '../../../packages/contracts/public/task.js';
import { singleUnitContract } from '../../contracts/fixtures.js';

const keys = generateKeyPairSync('ed25519');
const actor = { id: randomUUID(), role: 'owner' as const, sessionHash: 'a'.repeat(64), csrfHash: 'b'.repeat(64) };
const intentId = randomUUID();
const privateRevision = 'c'.repeat(64);
const approvedIntentHash = 'd'.repeat(64);
export function releaseInput() {
  const contract = singleUnitContract();
  return { contract, listing: projectPublicListing(contract, 30), assets: [{ path: 'src/PlanSelector.tsx', sourceAssetId: randomUUID(), mediaType: 'application/typescript', contentBase64: Buffer.from('export const synthetic = true;\n').toString('base64') }], feedbackPolicy: { schemaVersion: 1, id: contract.feedbackPolicyId, categories: ['received', 'processing', 'owner_review', 'accepted', 'changes_required', 'package_defect', 'infrastructure_issue', 'expired'], messageCodes: ['requirement_not_met', 'invalid_input', 'check_unavailable', 'passed'], privateDiagnostics: 'none', publicDetails: 'approved_public_checks_only' } };
}
function fixture(authority = true) {
  const input = releaseInput(), review = stageReleaseCandidate(input);
  const row = { id: randomUUID(), task_id: review.contract.taskId, task_version: 1, intent_id: intentId, intent_version: 1, approved_intent_hash: approvedIntentHash, private_revision: privateRevision, candidate: input, manifest_hash: review.manifestHash, version: 1, state: 'release_review' };
  const query = vi.fn(async (sql: string, _args?: unknown[]) => {
    if (sql.startsWith('SELECT byte_count,payload')) return { rows: review.assets.map(asset => ({ byte_count: asset.byteSize, payload: Buffer.from(asset.contentBase64, 'base64') })) };
    if (sql.includes('JOIN private_sessions')) return { rows: authority ? [{ role: 'owner' }] : [] };
    if (sql.includes('private_release_candidates') && sql.startsWith('SELECT')) return { rows: [row] };
    if (sql.includes('private_intent_heads')) return { rows: [{ version: 1, state: 'approved', approved_hash: approvedIntentHash, content_hash: approvedIntentHash }] };
    return { rows: [], rowCount: 1 };
  });
  const release = vi.fn();
  const pool = { connect: async () => ({ query, release }) } as unknown as ConstructorParameters<typeof PrivateReleaseStore>[0];
  return { store: new PrivateReleaseStore(pool, keys.privateKey), query, row, review, release };
}
const approval = (hash: string) => ({ expectedVersion: 1, manifestHash: hash, combinedDisclosureReviewed: true, semanticDisclosureRationale: 'Synthetic reviewed combined public meaning.' });
it('requires a stored active owner session inside the same transaction and signs the exact canonical manifest', async () => {
  const { store, query, row, review, release } = fixture();
  const result = await store.approve(actor, row.id, approval(review.manifestHash));
  expect(result.state).toBe('approved');
  expect(verify(null, Buffer.from(canonicalize(review.manifest)), keys.publicKey, Buffer.from(result.signature, 'base64'))).toBe(true);
  const [sql, args] = query.mock.calls[1]!;
  expect(sql).toContain('session.expires_at>now()');
  expect(sql).toContain('FOR SHARE OF account, session');
  expect(args).toEqual([actor.id, actor.sessionHash, actor.csrfHash]);
  expect(query.mock.calls.some(([statement]) => statement.includes('INSERT INTO private_release_approvals'))).toBe(true);
  expect(query.mock.calls.at(-1)![0]).toBe('COMMIT');
  expect(release).toHaveBeenCalledOnce();
});
it('rejects revoked authority without writing or signing any approval', async () => {
  const { store, row, review, query } = fixture(false);
  await expect(store.approve(actor, row.id, approval(review.manifestHash))).rejects.toThrow('forbidden_role');
  expect(query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
  expect(query.mock.calls.at(-1)![0]).toBe('ROLLBACK');
});
it.each(['requester', 'operator', 'contributor'])('never accepts %s as release authority', async role => {
  const { store, row, review } = fixture();
  await expect(store.approve({ ...actor, role } as never, row.id, approval(review.manifestHash))).rejects.toThrow('forbidden_role');
});
it('requires exact hash/version, current approved intent and explicit complete-disclosure review', async () => {
  const { store, row, review } = fixture();
  await expect(store.approve(actor, row.id, approval('f'.repeat(64)))).rejects.toThrow('stale_version');
  await expect(store.approve(actor, row.id, { ...approval(review.manifestHash), expectedVersion: 2 })).rejects.toThrow('stale_version');
  await expect(store.approve(actor, row.id, { ...approval(review.manifestHash), combinedDisclosureReviewed: false })).rejects.toThrow();
  row.approved_intent_hash = 'e'.repeat(64);
  await expect(store.approve(actor, row.id, approval(review.manifestHash))).rejects.toThrow('missing_evidence');
});
it('detects stored content drift and does not replace its hash with recomputed unchecked bytes', async () => {
  const { store, row, review } = fixture();
  row.candidate.assets[0]!.contentBase64 = Buffer.from('changed bytes').toString('base64');
  await expect(store.approve(actor, row.id, approval(review.manifestHash))).rejects.toThrow('missing_evidence');
  expect(contentHash(review.manifest)).toBe(review.manifestHash);
});
