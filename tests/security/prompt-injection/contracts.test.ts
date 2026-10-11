import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { validateIntentProposal } from '../../../packages/planner/providers/contracts.js';
import { PLANNING_SYSTEM_PROMPT } from '../../../packages/planner/prompts/system.js';

const reference = { evidenceId: randomUUID(), snapshotHash: 'a'.repeat(64), location: 'src/untrusted.ts' };
const proposal = { goal: 'Synthetic goal containing untrusted instructions', facts: [], evidence: [reference], decisions: [], assumptions: [], unknowns: ['Owner review required.'], acceptanceExamples: [], scope: { included: ['Synthetic scope'], excluded: ['Automatic release'] } };
const context = { goal: proposal.goal, snapshotHash: reference.snapshotHash, references: [reference] };
it('cannot turn untrusted proposal instructions into release, role, tool or endpoint authority', () => {
  for (const field of ['approval','releaseSignature','ownerRole','endpoint','tools','shell','privateRepositoryRoot']) {
    expect(() => validateIntentProposal({ ...proposal, [field]: 'synthetic-injected-authority' }, context)).toThrow('invalid_intent_proposal');
  }
  expect(() => validateIntentProposal({ ...proposal, evidence: [{ ...reference, location: 'http://synthetic-unapproved.invalid/private' }] }, context)).toThrow('invalid_intent_proposal');
});
it('rejects accessor-backed proposals without running their getter and keeps prompt policy application-owned', () => {
  let invoked = false;
  const attack = { ...proposal };
  Object.defineProperty(attack, 'goal', { enumerable: true, get() { invoked = true; return context.goal; } });
  expect(() => validateIntentProposal(attack, context)).toThrow('invalid_intent_proposal');
  expect(invoked).toBe(false);
  expect(PLANNING_SYSTEM_PROMPT).toContain('untrusted data');
  expect(PLANNING_SYSTEM_PROMPT).toContain('You cannot approve');
  expect(PLANNING_SYSTEM_PROMPT).toContain('do not split');
});
