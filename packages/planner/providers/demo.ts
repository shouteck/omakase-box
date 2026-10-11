import { canonicalize } from '../../contracts/hash.js';
import { demoFixtures } from './demo-fixtures.js';
import type { DemoFixture } from './demo-fixtures.js';
import { proposalContext, proposalResult, validateIntentProposal, validatePartitionInput, validatePartitionProposal, validatePlanningInput } from './contracts.js';
import type { PlannerProvider, PrivatePlanningInput, PrivatePartitionInput, ProviderResult } from './contracts.js';
import type { IntentProposal, PartitionProposal } from '../../contracts/private/planning.js';

export class DemoPlannerProvider implements PlannerProvider {
  readonly mode = 'demo' as const;
  private readonly fixtures: readonly DemoFixture[];
  constructor(fixtures: readonly DemoFixture[] = demoFixtures) {
    this.fixtures = JSON.parse(canonicalize(fixtures)) as DemoFixture[];
    for (const fixture of this.fixtures) validatePartitionProposal(fixture.partition);
    if (new Set(this.fixtures.map(fixture => fixture.goal)).size !== this.fixtures.length) throw new Error('invalid_demo_configuration');
  }
  async proposeIntent(value: PrivatePlanningInput, signal?: AbortSignal): Promise<ProviderResult<IntentProposal>> {
    if (signal?.aborted) return { status: 'failed', mode: this.mode, assurance: 'unverified', reason: 'cancelled' };
    try {
      const input = validatePlanningInput(value), context = proposalContext(input);
      const fixture = this.fixtures.find(item => item.goal === input.request.goal);
      const proposal = validateIntentProposal({ goal: input.request.goal,
        facts: input.sources.length ? [{ statement: 'Captured private source text is available as untrusted evidence for review.', evidence: [input.sources[0]!.reference], assurance: 'unverified' }] : [],
        evidence: context.references.slice(0,256),
        decisions: [{ id: 'outcome_confirmation', question: 'Confirm the intended before/after outcome and observable examples.', required: true, answer: null }],
        assumptions: [{ statement: 'This deterministic demo is a review aid, not model inference or a correctness/readiness result.', assurance: 'unverified' }],
        unknowns: ['An internal owner must resolve consequential choices before approval.', ...(input.attachments.some(item => item.text === null) ? ['Images are stored as private evidence; image understanding is unavailable.'] : []), ...(!fixture ? ['No exact demo partition fixture matches this outcome; do not silently shrink it.'] : [])],
        acceptanceExamples: fixture?.partition.status === 'proposed' ? [...fixture.partition.composition.requirements, ...fixture.partition.composition.endToEndRequirements] : [{ id: 'outcome_example', description: input.request.desiredBehaviour || input.request.goal, inputs: ['The requester-described starting situation.'], outputs: ['The owner-confirmed desired result.'], states: ['before','after'], invalidCases: ['Missing consequential decisions block approval.'], exclusions: [...input.request.exclusions], examples: [{ given: input.request.currentBehaviour || 'The current workflow has not yet been described.', when: 'The customer performs the intended action.', then: input.request.desiredBehaviour || input.request.goal }] }],
        scope: { included: [input.request.goal, ...input.request.constraints], excluded: [...input.request.exclusions] }
      }, context);
      return proposalResult(this.mode, input, proposal, 0);
    } catch { return { status: 'failed', mode: this.mode, assurance: 'unverified', reason: 'invalid_input' }; }
  }
  async proposePartition(value: PrivatePartitionInput, signal?: AbortSignal): Promise<ProviderResult<PartitionProposal>> {
    if (signal?.aborted) return { status: 'failed', mode: this.mode, assurance: 'unverified', reason: 'cancelled' };
    try {
      const input = validatePartitionInput(value);
      const fixture = this.fixtures.find(item => item.goal === input.approvedIntent.goal);
      const proposal = validatePartitionProposal(fixture?.partition ?? { status: 'not_supported', reason: 'This explicit demo catalogue has no partition for the complete requested outcome.', missingCapabilities: ['Independent boundary analysis and a reviewed fixture or provider proposal.'], retainedPrivateWork: [input.approvedIntent.goal] });
      return proposalResult(this.mode, input, proposal, 0);
    } catch { return { status: 'failed', mode: this.mode, assurance: 'unverified', reason: 'invalid_input' }; }
  }
}
