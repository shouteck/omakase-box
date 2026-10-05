import { expect, it } from 'vitest';
import { DemoPlannerProvider } from '../../../packages/planner/providers/demo.js';
import { demoFixtures } from '../../../packages/planner/providers/demo-fixtures.js';
import { planningInput, partitionInput } from './fixtures.js';

it('a goal-only deterministic demo is reviewable, non-authorizing and needs owner decisions', async () => {
  const input = planningInput('A synthetic outcome without a technical specification.');
  const provider = new DemoPlannerProvider();
  const first = await provider.proposeIntent(input), second = await provider.proposeIntent(input);
  expect(first).toEqual(second);
  expect(first).toMatchObject({ status: 'proposal', mode: 'demo', assurance: 'unverified', provenance: { repairAttempts: 0, modelVerification: 'not_applicable' } });
  if (first.status !== 'proposal') throw new Error('Demo failed.');
  expect(first.proposal.goal).toBe(input.request.goal); expect(first.proposal.decisions[0]).toMatchObject({ required: true, answer: null }); expect(first.proposal).not.toHaveProperty('state');
});
it.each(demoFixtures.map(fixture => [fixture.id, fixture.goal] as const))('preserves the complete outcome and explicit fixture support for %s', async (_id, goal) => {
  const provider = new DemoPlannerProvider(), input = planningInput(goal);
  expect(await provider.proposeIntent(input)).toMatchObject({ status: 'proposal', proposal: { goal } });
  expect(await provider.proposePartition(partitionInput(input))).toMatchObject({ status: 'proposal', mode: 'demo' });
});
it('keeps frontend/backend/policy together with interface/end-to-end obligations', async () => {
  const input = planningInput(demoFixtures.find(fixture => fixture.id === 'selection_with_policy')!.goal);
  const result = await new DemoPlannerProvider().proposePartition(partitionInput(input));
  expect(result).toMatchObject({ status: 'proposal', proposal: { status: 'proposed', composition: { disciplines: ['frontend','backend','security'] } } });
  if (result.status !== 'proposal' || result.proposal.status !== 'proposed') throw new Error('Missing composed proposal.');
  expect(result.proposal.composition.workUnits).toHaveLength(3); expect(result.proposal.composition.interfaces).toHaveLength(2); expect(result.proposal.composition.endToEndRequirements.length).toBeGreaterThan(0);
});
it('unknown goals produce explicit unsupported partitions rather than a hardcoded smaller task', async () => {
  expect(await new DemoPlannerProvider().proposePartition(partitionInput(planningInput('Unmatched synthetic complete outcome.')))).toMatchObject({ status: 'proposal', proposal: { status: 'not_supported', retainedPrivateWork: ['Unmatched synthetic complete outcome.'] } });
});
it('input mutations and prior output edits cannot alter the provider catalogue; cancellation stays explicit', async () => {
  const provider = new DemoPlannerProvider(), input = planningInput(demoFixtures[0]!.goal);
  const result = await provider.proposePartition(partitionInput(input));
  if (result.status === 'proposal' && result.proposal.status === 'proposed') result.proposal.composition.editablePaths.push('unsafe.ts');
  expect(JSON.stringify(await provider.proposePartition(partitionInput(input)))).not.toContain('unsafe.ts');
  const controller = new AbortController(); controller.abort();
  expect(await provider.proposeIntent(input, controller.signal)).toMatchObject({ status: 'failed', reason: 'cancelled' });
});
