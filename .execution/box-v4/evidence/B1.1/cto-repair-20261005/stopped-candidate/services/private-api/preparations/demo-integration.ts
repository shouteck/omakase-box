import type { SessionActor } from '../../../packages/contracts/auth/store.js';
import { WorkflowError } from '../../../packages/contracts/workflow/index.js';
import type { InternalIntent } from '../../../packages/contracts/private/index.js';

const SHOP_SELECTION_JOURNEY = {
  privateRevision: 'f'.repeat(64),
  templateVersion: 1,
  workUnitDestinations: {
    selection_ui: { privateDestinationPath: 'src/selection/SelectionPanel.tsx', retainedAdapterPath: 'src/private/selection-provider.ts' },
    selection_api: { privateDestinationPath: 'src/selection/api.ts', retainedAdapterPath: 'src/private/selection-adapter.ts' }
  },
  interfaceAdapters: { selection_http: { privateAdapterPath: 'src/private/selection-adapter.ts' } }
} as const;

const SHOP_COMPONENT_SELECTION = {
  privateRevision: 'f'.repeat(64),
  templateVersion: 1,
  workUnitDestinations: {
    selection_ui: { privateDestinationPath: 'src/selection/SelectionPanel.tsx', retainedAdapterPath: 'src/private/selection-provider.ts' }
  },
  interfaceAdapters: {}
} as const;

const SHOP_RANKING = {
  privateRevision: 'f'.repeat(64),
  templateVersion: 1,
  workUnitDestinations: {
    ranking: { privateDestinationPath: 'src/ranking/rankPrivateItems.ts', retainedAdapterPath: 'src/private/scoring-adapter.ts' }
  },
  interfaceAdapters: {}
} as const;

const SHOP_RESPONSE_POLICY = {
  privateRevision: 'f'.repeat(64),
  templateVersion: 1,
  workUnitDestinations: {
    response_policy: { privateDestinationPath: 'config/response-security.json', retainedAdapterPath: 'src/private/response-policy-wrapper.ts' }
  },
  interfaceAdapters: {}
} as const;

const SHOP_SELECTION_WITH_POLICY = {
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
} as const;

export interface SyntheticDeclaredTarget {
  readonly privateRevision: string;
  readonly templateVersion: number;
  readonly workUnitDestinations: Readonly<Record<string, { privateDestinationPath: string; retainedAdapterPath: string }>>;
  readonly interfaceAdapters: Readonly<Record<string, { privateAdapterPath: string }>>;
}

export interface PreparationIntegrationSource {
  declaredTargets(actor: SessionActor, intent: InternalIntent): Promise<unknown>;
}

export class SyntheticShopPlanningIntegrationSource implements PreparationIntegrationSource {
  async declaredTargets(actor: SessionActor, intent: InternalIntent): Promise<unknown> {
    if (!['owner', 'requester'].includes(actor.role)) throw new WorkflowError('forbidden_role');
    const record: Record<string, SyntheticDeclaredTarget> = {
      'Deliver one accessible selection UI-to-API flow where the trusted server validates the chosen synthetic option and visibly recovers from server errors.': SHOP_SELECTION_JOURNEY,
      'Choose an available plan through one UI-to-API flow, reject invalid/unavailable choices on the server, and recover visibly from server errors.': SHOP_SELECTION_JOURNEY,
      'Let a person select an available plan using keyboard or pointer, with clear loading, empty and error states.': SHOP_COMPONENT_SELECTION,
      "Rank supplied items deterministically without changing the caller's input.": SHOP_RANKING,
      'Emit the agreed HTTPS response security headers while preserving the excluded health route and localhost behaviour.': SHOP_RESPONSE_POLICY,
      'Deliver the selection journey and its response policy together as one task with interface and end-to-end obligations.': SHOP_SELECTION_WITH_POLICY
    };
    const targets = record[intent.goal];
    if (targets === undefined) throw new WorkflowError('missing_evidence');
    return targets;
  }
}
