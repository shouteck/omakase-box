import { randomUUID } from 'node:crypto';
import { contentHash } from '../../../packages/contracts/hash.js';
import type { PrivatePlanningInput, PrivatePartitionInput } from '../../../packages/planner/providers/contracts.js';

export function planningInput(goal = 'Synthetic customer outcome'): PrivatePlanningInput {
  const snapshotId = randomUUID(), snapshotHash = 'a'.repeat(64);
  return { assurance: 'bounded', request: { requestId: randomUUID(), snapshotId, goal, currentBehaviour: '', desiredBehaviour: '', constraints: [], exclusions: [] }, snapshotHash, sources: [{ reference: { evidenceId: snapshotId, snapshotHash, location: 'src/example.ts' }, sha256: 'b'.repeat(64), text: 'Synthetic source observation only.', truncated: false }], attachments: [], imageUnderstanding: false, textByteLimit: 65536 };
}
export function intentProposal(input: PrivatePlanningInput) {
  return { goal: input.request.goal, facts: [], evidence: input.sources.map(source => source.reference), decisions: [{ id: 'outcome', question: 'Confirm the intended outcome.', required: true, answer: null }], assumptions: [], unknowns: ['Owner confirmation required.'], acceptanceExamples: [], scope: { included: [input.request.goal], excluded: ['Real billing'] } };
}
export function partitionInput(input = planningInput()): PrivatePartitionInput {
  const approvedIntent = { schemaVersion: 1 as const, intentId: randomUUID(), version: 1, goal: input.request.goal, snapshotHash: input.snapshotHash, state: 'approved' as const, facts: [], evidence: input.sources.map(source => source.reference), decisions: [], assumptions: [], unknowns: [], acceptanceExamples: [], scope: { included: [input.request.goal], excluded: ['Real customer data'] } };
  return { approvedIntent, approvedIntentHash: contentHash(approvedIntent), planningEvidence: input };
}
export function wire(proposal: unknown) {
  return { status: 200, body: Buffer.from(JSON.stringify({ model: 'synthetic-model', created_at: '2026-10-03T00:00:00Z', message: { role: 'assistant', content: typeof proposal === 'string' ? proposal : JSON.stringify(proposal) }, done: true })) };
}
