import { contentHash } from '../../contracts/hash.js';
import type { PartitionProposal } from '../../contracts/private/planning.js';
import type { Composition } from '../../contracts/public/composition.js';

export interface DemoFixture { id: string; goal: string; partition: PartitionProposal }
const requirement = (id: string, description: string) => ({ id, description, inputs: ['Approved synthetic inputs only.'], outputs: ['The published observable result.'], states: ['normal', 'empty', 'rejected'], invalidCases: ['Malformed inputs receive the published safe rejection.'], exclusions: ['Private computation and real credentials are excluded.'], examples: [{ given: 'The approved synthetic scenario.', when: 'The stated action occurs.', then: 'The stated requirement is observed.' }] });
function selection(combined: boolean): Composition {
  const composition: Composition = {
    disciplines: ['frontend','backend'],
    workUnits: [
      { id: 'selection_ui', adapterKind: 'frontend_component', adapterVersion: 1, requirementIds: ['selection_ui'], editablePaths: ['src/PlanSelector.tsx'], interfaceIds: ['selection_http'], trustedCheckIds: ['selection_ui_check'], requiredCapabilities: ['browser','static_assets','job_proxy'], startAfterUnitIds: ['selection_api'] },
      { id: 'selection_api', adapterKind: 'backend_api', adapterVersion: 1, requirementIds: ['selection_api'], editablePaths: ['src/selectPlan.ts'], interfaceIds: ['selection_http'], trustedCheckIds: ['selection_api_check'], requiredCapabilities: ['candidate_api','job_proxy'], startAfterUnitIds: [] }
    ],
    interfaces: [{ id: 'selection_http', producerUnitIds: ['selection_ui','selection_api'], consumerUnitIds: ['selection_api','selection_ui'], schema: { id: 'selection_schema', version: 1, path: 'interfaces/selection.json', sha256: contentHash({ selectedId: 'string', clientContextAllowed: false }) }, semantics: 'request_response', requestSemantics: 'POST only selectedId; the trusted wrapper attaches generic availability context.', responseSemantics: 'Return selectedId or a frozen safe error.', errorStates: ['unavailable','not_found','invalid_input'], ownerUnitId: 'selection_api', compatibilityRequirementIds: ['selection_api'] }],
    requirements: [requirement('selection_ui', 'Accessible keyboard/pointer selection handles loading, empty, disabled and error states.'), requirement('selection_api', 'Validate selected ID against trusted option context; browser-supplied context cannot override it.')],
    endToEndRequirements: [requirement('selection_journey', 'Actual browser selection calls the scoped API, observes rejection and recovers without bypassing availability.')],
    publicChecks: [{ id: 'selection_ui_check', kind: 'unit', requirementIds: ['selection_ui'], workUnitIds: ['selection_ui'], interfaceIds: [] }, { id: 'selection_api_check', kind: 'unit', requirementIds: ['selection_api'], workUnitIds: ['selection_api'], interfaceIds: [] }, { id: 'selection_http_check', kind: 'interface', requirementIds: ['selection_api'], workUnitIds: ['selection_ui','selection_api'], interfaceIds: ['selection_http'] }, { id: 'selection_journey_check', kind: 'end_to_end', requirementIds: ['selection_journey'], workUnitIds: ['selection_ui','selection_api'], interfaceIds: ['selection_http'] }],
    editablePaths: ['src/PlanSelector.tsx','src/selectPlan.ts']
  };
  if (combined) {
    composition.disciplines.push('security');
    composition.workUnits[1]!.interfaceIds.push('response_policy');
    composition.workUnits.push({ id: 'response_policy', adapterKind: 'application_policy', adapterVersion: 1, requirementIds: ['response_policy'], editablePaths: ['config/response-security.json'], interfaceIds: ['response_policy'], trustedCheckIds: ['response_policy_check'], requiredCapabilities: ['data_only_policy'], startAfterUnitIds: [] });
    composition.interfaces.push({ id: 'response_policy', producerUnitIds: ['response_policy'], consumerUnitIds: ['selection_api'], schema: { id: 'response_policy_schema', version: 1, path: 'interfaces/response-policy.json', sha256: contentHash({ frameAncestors: ['none','self'], noSniff: 'boolean', hsts: 'bounded_https_only' }) }, semantics: 'file', requestSemantics: 'Strict data-only approved response policy.', responseSemantics: 'Trusted wrapper strips candidate overrides and applies headers using trusted ingress context.', errorStates: ['invalid_policy'], ownerUnitId: 'response_policy', compatibilityRequirementIds: ['response_policy'] });
    composition.requirements.push(requirement('response_policy', 'Apply owner-agreed HTTPS headers, preserve excluded routes and reject forged ingress/candidate header overrides.'));
    composition.publicChecks.push({ id: 'response_policy_check', kind: 'unit', requirementIds: ['response_policy'], workUnitIds: ['response_policy'], interfaceIds: [] }, { id: 'response_policy_transfer', kind: 'interface', requirementIds: ['response_policy'], workUnitIds: ['response_policy','selection_api'], interfaceIds: ['response_policy'] });
    const whole = composition.publicChecks.find(check => check.id === 'selection_journey_check')!;
    whole.workUnitIds.push('response_policy'); whole.interfaceIds.push('response_policy');
    composition.editablePaths.push('config/response-security.json');
  }
  return composition;
}
function single(kind: 'frontend_component' | 'backend_pure_module' | 'application_policy'): Composition {
  const policy = kind === 'application_policy', frontend = kind === 'frontend_component';
  const id = policy ? 'response_policy' : frontend ? 'selection_ui' : 'ranking';
  const path = policy ? 'config/response-security.json' : frontend ? 'src/PlanSelector.tsx' : 'src/rankItems.ts';
  const description = policy ? 'Emit owner-agreed response headers from strict policy data while preserving HTTPS/localhost and excluded-route behaviour.' : frontend ? 'Select available generic plans with accessible keyboard/pointer and empty/loading/error/disabled states.' : 'Rank all supplied IDs once by descending finite score and ascending ASCII ID, without mutation; reject malformed, duplicate and nonfinite inputs.';
  return { disciplines: policy ? ['security','configuration'] : frontend ? ['frontend'] : ['backend','data'], workUnits: [{ id, adapterKind: kind, adapterVersion: 1, requirementIds: [id], editablePaths: [path], interfaceIds: [], trustedCheckIds: [id + '_check'], requiredCapabilities: policy ? ['data_only_policy'] : frontend ? ['browser','static_assets'] : ['restricted_process'], startAfterUnitIds: [] }], interfaces: [], requirements: [requirement(id, description)], endToEndRequirements: [], publicChecks: [{ id: id + '_check', kind: 'unit', requirementIds: [id], workUnitIds: [id], interfaceIds: [] }], editablePaths: [path] };
}
const proposed = (composition: Composition): PartitionProposal => ({ status: 'proposed', composition, retainedPrivateWork: ['Protected eligibility/pricing/scoring and trusted wrappers remain private.', 'These fixture hints require independent analysis, disclosure review and real-runner readiness before release.'] });
const unsupported = (reason: string): PartitionProposal => ({ status: 'not_supported', reason, missingCapabilities: ['A reviewed adapter and execution/disclosure profile for this responsibility.'], retainedPrivateWork: ['Keep the complete unsupported outcome recorded; do not execute or silently shrink it.'] });
export const demoFixtures: readonly DemoFixture[] = [
  { id: 'component_selection', goal: 'Let a person select an available plan using keyboard or pointer, with clear loading, empty and error states.', partition: proposed(single('frontend_component')) },
  { id: 'ranking', goal: "Rank supplied items deterministically without changing the caller's input.", partition: proposed(single('backend_pure_module')) },
  { id: 'selection_journey', goal: 'Choose an available plan through one UI-to-API flow, reject invalid/unavailable choices on the server, and recover visibly from server errors.', partition: proposed(selection(false)) },
  { id: 'response_policy', goal: 'Emit the agreed HTTPS response security headers while preserving the excluded health route and localhost behaviour.', partition: proposed(single('application_policy')) },
  { id: 'selection_with_policy', goal: 'Deliver the selection journey and its response policy together as one task with interface and end-to-end obligations.', partition: proposed(selection(true)) },
  { id: 'cloud_deployment', goal: 'Deploy a new cloud network and production cluster.', partition: unsupported('No cloud infrastructure adapter; live deployment and expense are outside this build scope.') },
  { id: 'data_migration', goal: 'Migrate production customer records to a new schema.', partition: unsupported('No customer-data migration adapter or minimal-data review; real records are excluded.') },
  { id: 'ci_workflow', goal: "Change the application's build and deployment workflow.", partition: unsupported('Data-only application policy cannot authorize executable CI/build/deployment changes.') }
];
