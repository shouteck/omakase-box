import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { IntentProposalSchema, PartitionProposalSchema } from '../../../packages/contracts/private/planning.js';
import { validateIntentProposal } from '../../../packages/planner/providers/contracts.js';
import { fullStackContract } from '../../contracts/fixtures.js';

const reference = { evidenceId: randomUUID(), snapshotHash: 'a'.repeat(64), location: 'src/example.ts' };
const proposal = () => ({ goal: 'Synthetic customer outcome', facts: [{ statement: 'Synthetic proposal observation', evidence: [reference], assurance: 'unverified' as const }], evidence: [reference], decisions: [{ id: 'desired_outcome', question: 'Confirm the intended behaviour.', required: true, answer: null }], assumptions: [], unknowns: ['Owner confirmation required.'], acceptanceExamples: [], scope: { included: ['Synthetic outcome only'], excluded: ['Real billing'] } });
it('accepts an untrusted proposal with exact supplied evidence but no approval or executor authority', () => {
  expect(validateIntentProposal(proposal(), { goal: proposal().goal, snapshotHash: reference.snapshotHash, references: [reference] })).toEqual(proposal());
  for (const field of ['approved','state','actorId','command','toolCalls','executor']) expect(IntentProposalSchema.safeParse({ ...proposal(), [field]: 'synthetic-owner' }).success).toBe(false);
});
it('rejects invented evidence, changed goal and model-manufactured tested assurance', () => {
  const context = { goal: proposal().goal, snapshotHash: reference.snapshotHash, references: [reference] };
  expect(() => validateIntentProposal({ ...proposal(), goal: 'Different outcome' }, context)).toThrow('invalid_intent_proposal');
  expect(() => validateIntentProposal({ ...proposal(), evidence: [{ ...reference, evidenceId: randomUUID() }] }, context)).toThrow('invalid_intent_proposal');
  expect(() => validateIntentProposal({ ...proposal(), facts: [{ ...proposal().facts[0], assurance: 'tested' }] }, context)).toThrow('invalid_intent_proposal');
  expect(() => validateIntentProposal(proposal(), { ...context, snapshotHash: 'b'.repeat(64) })).toThrow('invalid_intent_proposal');
});
it('accepts one connected frontend/backend/policy proposal without layer-specific task splitting', () => {
  const { disciplines, workUnits, interfaces, requirements, endToEndRequirements, publicChecks, editablePaths } = fullStackContract(true);
  const composition = { disciplines, workUnits, interfaces, requirements, endToEndRequirements, publicChecks, editablePaths };
  expect(PartitionProposalSchema.safeParse({ status: 'proposed', composition, retainedPrivateWork: ['Eligibility remains in a private wrapper.'] }).success).toBe(true);
  expect(PartitionProposalSchema.safeParse({ status: 'proposed', composition: { ...composition, family: 'frontend' }, retainedPrivateWork: [] }).success).toBe(false);
  expect(PartitionProposalSchema.safeParse({ status: 'proposed', composition: { ...composition, workUnits: [workUnits[0]] }, retainedPrivateWork: [] }).success).toBe(false);
  expect(PartitionProposalSchema.safeParse({ status: 'not_supported', reason: 'No cloud adapter is registered.', missingCapabilities: ['cloud infrastructure'], retainedPrivateWork: ['Deployment stays private and unexecuted.'] }).success).toBe(true);
});
