import { randomUUID, createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { collectPlanningEvidence } from '../../../packages/planner/retrieval/index.js';

it('bounds text on UTF-8 character boundaries and preserves private references without image-understanding claims', () => {
  const snapshotId = randomUUID(), evidenceId = randomUUID();
  const source = '🙂'.repeat(20000);
  const sha256 = createHash('sha256').update(source).digest('hex');
  const snapshot = { schemaVersion: 1 as const, snapshotHash: 'a'.repeat(64), files: [{ path: 'src/value.ts', bytes: Buffer.byteLength(source), sha256, content: source }] };
  const result = collectPlanningEvidence({ requestId: randomUUID(), snapshotId, goal: 'Synthetic outcome', currentBehaviour: '', desiredBehaviour: '', constraints: [], exclusions: [] }, snapshot, [{ id: evidenceId, mediaType: 'image/png', bytes: Buffer.from('synthetic image') }]);
  expect(result.assurance).toBe('bounded');
  expect(result.imageUnderstanding).toBe(false);
  expect(result.sources[0]!.reference).toEqual({ evidenceId: snapshotId, snapshotHash: snapshot.snapshotHash, location: 'src/value.ts' });
  expect(Buffer.byteLength(result.sources[0]!.text)).toBeLessThanOrEqual(65536);
  expect(result.sources[0]!.text).not.toContain('�');
  expect(result.sources[0]!.truncated).toBe(true);
  expect(result.attachments[0]).toEqual({ reference: { evidenceId, snapshotHash: snapshot.snapshotHash, location: `request-evidence/${evidenceId}` }, mediaType: 'image/png', text: null, truncated: false });
  expect(JSON.stringify(result)).not.toContain('synthetic image');
});
