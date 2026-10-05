import { randomUUID } from 'node:crypto';
import { contentHash } from '../../../packages/contracts/hash.js';
import { InternalIntentSchema } from '../../../packages/contracts/private/index.js';
import type { InternalIntent } from '../../../packages/contracts/private/index.js';
import { DemoPlannerProvider } from '../../../packages/planner/providers/demo.js';
import { demoFixtures } from '../../../packages/planner/providers/demo-fixtures.js';
import type { PrivatePlanningInput, PrivatePartitionInput, ProviderResult } from '../../../packages/planner/providers/contracts.js';
import type { PartitionProposal } from '../../../packages/contracts/private/planning.js';

export const SELECTION_GOAL = demoFixtures.find(fixture => fixture.id === 'selection_journey')!.goal;
export const SELECTION_WITH_POLICY_GOAL = demoFixtures.find(fixture => fixture.id === 'selection_with_policy')!.goal;
export const RANKING_GOAL = demoFixtures.find(fixture => fixture.id === 'ranking')!.goal;
export const CLOUD_GOAL = demoFixtures.find(fixture => fixture.id === 'cloud_deployment')!.goal;

export const SOURCE_CANARY = 'SYNTHETIC_PLANNER_SOURCE_OBSERVATION_CANARY';

export function planningInput(goal: string = SELECTION_GOAL): PrivatePlanningInput {
  const snapshotId = randomUUID();
  const snapshotHash = 'a'.repeat(64);
  return {
    assurance: 'bounded',
    request: { requestId: randomUUID(), snapshotId, goal, currentBehaviour: '', desiredBehaviour: '', constraints: [], exclusions: [] },
    snapshotHash,
    sources: [{ reference: { evidenceId: snapshotId, snapshotHash, location: 'src/selection/api.ts' }, sha256: 'b'.repeat(64), text: `${SOURCE_CANARY} synthetic source observation only.`, truncated: false }],
    attachments: [],
    imageUnderstanding: false,
    textByteLimit: 65536
  };
}

export interface ApprovedSelection {
  readonly provider: DemoPlannerProvider;
  readonly planning: PrivatePlanningInput;
  readonly intent: InternalIntent;
  readonly intentHash: string;
  readonly partitionInput: PrivatePartitionInput;
}

export async function approvedFixture(goal: string = SELECTION_GOAL): Promise<ApprovedSelection> {
  const provider = new DemoPlannerProvider();
  const planning = planningInput(goal);
  const intentResult = await provider.proposeIntent(planning);
  if (intentResult.status !== 'proposal') throw new Error('demo intent proposal failed');
  const decisions = intentResult.proposal.decisions.map(decision => ({ ...decision, answer: 'Confirmed synthetic outcome.' }));
  const intent = InternalIntentSchema.parse({
    schemaVersion: 1,
    intentId: randomUUID(),
    version: 1,
    state: 'approved',
    goal: planning.request.goal,
    snapshotHash: planning.snapshotHash,
    facts: intentResult.proposal.facts,
    evidence: intentResult.proposal.evidence,
    decisions,
    assumptions: intentResult.proposal.assumptions,
    unknowns: intentResult.proposal.unknowns,
    acceptanceExamples: intentResult.proposal.acceptanceExamples,
    scope: {
      included: [`Private provenance: planning request ${planning.request.requestId} supplied the captured snapshot and evidence for this intent.`, ...intentResult.proposal.scope.included],
      excluded: [...intentResult.proposal.scope.excluded]
    }
  });
  const intentHash = contentHash(intent);
  return {
    provider,
    planning,
    intent,
    intentHash,
    partitionInput: {
      approvedIntent: intent as never,
      approvedIntentHash: intentHash,
      planningEvidence: planning,
      approval: { intentId: intent.intentId, version: 1, contentHash: intentHash, state: 'approved' }
    }
  };
}

export async function providerPartition(fixture: ApprovedSelection): Promise<PartitionProposal> {
  const result = await fixture.provider.proposePartition(fixture.partitionInput);
  if (result.status !== 'proposal') throw new Error(`demo partition proposal failed: ${result.reason}`);
  return result.proposal;
}

export const syntheticDestinations = {
  privateRevision: 'f'.repeat(64),
  templateVersion: 1,
  workUnitDestinations: {
    selection_ui: { privateDestinationPath: 'src/selection/SelectionPanel.tsx', retainedAdapterPath: 'src/private/selection-provider.ts' },
    selection_api: { privateDestinationPath: 'src/selection/api.ts', retainedAdapterPath: 'src/private/selection-adapter.ts' }
  },
  interfaceAdapters: { selection_http: { privateAdapterPath: 'src/private/selection-adapter.ts' } }
};

export const syntheticRankingDestinations = {
  privateRevision: 'f'.repeat(64),
  templateVersion: 1,
  workUnitDestinations: { ranking: { privateDestinationPath: 'src/ranking/rankPrivateItems.ts', retainedAdapterPath: 'src/private/scoring-adapter.ts' } },
  interfaceAdapters: {}
};

export const syntheticPolicyDestinations = {
  privateRevision: 'f'.repeat(64),
  templateVersion: 1,
  workUnitDestinations: { response_policy: { privateDestinationPath: 'config/response-security.json', retainedAdapterPath: 'src/private/response-policy-wrapper.ts' } },
  interfaceAdapters: {}
};

export const syntheticWithPolicyDestinations = {
  privateRevision: 'f'.repeat(64),
  templateVersion: 1,
  workUnitDestinations: {
    selection_ui: { privateDestinationPath: 'src/selection/SelectionPanel.tsx', retainedAdapterPath: 'src/private/selection-provider.ts' },
    selection_api: { privateDestinationPath: 'src/selection/api.ts', retainedAdapterPath: 'src/private/selection-adapter.ts' },
    response_policy: { privateDestinationPath: 'config/response-security.json', retainedAdapterPath: 'src/private/response-policy-wrapper.ts' }
  },
  interfaceAdapters: {
    selection_http: { privateAdapterPath: 'src/private/selection-adapter.ts' },
    response_policy: { privateAdapterPath: 'src/private/response-policy-wrapper.ts' }
  }
};
