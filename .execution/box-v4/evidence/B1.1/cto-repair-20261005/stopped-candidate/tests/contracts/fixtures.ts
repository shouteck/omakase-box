import type { ExternalTaskContract } from '../../packages/contracts/public/index.js';

export const ids = {
  task: '11111111-1111-4111-8111-111111111111',
  lineage: '22222222-2222-4222-8222-222222222222',
  asset: '33333333-3333-4333-8333-333333333333',
  event: '44444444-4444-4444-8444-444444444444',
  reservation: '55555555-5555-4555-8555-555555555555',
  submission: '66666666-6666-4666-8666-666666666666'
};
export const hash = 'a'.repeat(64);
const requirement = (id: string, description: string) => ({ id, description, inputs: ['Approved generic options and selected ID.'], outputs: ['Selected ID or safe error.'], states: ['available', 'unavailable'], invalidCases: ['Unknown selection is rejected.'], exclusions: ['Private eligibility rules and billing are not editable.'], examples: [{ given: 'An available option basic.', when: 'Basic is selected.', then: 'The selected ID is basic.' }] });
export function singleUnitContract(): ExternalTaskContract {
  return {
    schemaVersion: 1, taskId: ids.task, lineageId: ids.lineage, version: 1,
    title: 'Accessible plan selection', purpose: 'Choose one available generic plan.',
    disciplines: ['frontend'],
    workUnits: [{ id: 'ui', adapterKind: 'frontend_component', adapterVersion: 1, requirementIds: ['select_ui'], editablePaths: ['src/PlanSelector.tsx'], interfaceIds: [], trustedCheckIds: ['ui_check'], requiredCapabilities: ['browser', 'static_assets'], startAfterUnitIds: [] }],
    interfaces: [], requirements: [requirement('select_ui', 'Selection must be keyboard accessible and disabled options cannot be selected.')], endToEndRequirements: [],
    publicChecks: [{ id: 'ui_check', kind: 'unit', requirementIds: ['select_ui'], workUnitIds: ['ui'], interfaceIds: [] }],
    editablePaths: ['src/PlanSelector.tsx'], dependencies: [{ name: 'react', version: '19.3.0' }],
    template: { id: 'selection_workspace', version: 1, sha256: hash }, imageDigest: `sha256:${hash}`, executionProfile: 'dedicated-linux-kvm-fresh-vm',
    acceptanceCategories: ['contract_failure', 'integration_failure', 'package_defect', 'infrastructure_failure', 'passed', 'unverified'],
    terms: { reservationDurationSeconds: 3600, maxEvaluatedAttempts: 3, maxPatchBytes: 1048576, maxChangedLines: 10000, revisionPolicy: 'preserve_original_expiry', cancellationPolicy: 'Frozen terms apply.', packageDefectCompensation: { currency: 'USD', amountMinor: 1000 }, budgetExhaustionPolicy: 'No extra evaluation without owner-reviewed frozen terms.' },
    reward: { currency: 'USD', amountMinor: 10000 }, feedbackPolicyId: 'bounded_v1'
  };
}
export function fullStackContract(withPolicy = false): ExternalTaskContract {
  const task = singleUnitContract();
  task.disciplines.push('backend');
  task.workUnits[0]!.interfaceIds.push('selection_http');
  task.workUnits[0]!.requiredCapabilities.push('job_proxy');
  task.workUnits[0]!.startAfterUnitIds.push('api');
  task.workUnits.push({ id: 'api', adapterKind: 'backend_api', adapterVersion: 1, requirementIds: ['select_api'], editablePaths: ['src/selectPlan.ts'], interfaceIds: ['selection_http'], trustedCheckIds: ['api_check'], requiredCapabilities: ['candidate_api', 'job_proxy'], startAfterUnitIds: [] });
  task.requirements.push(requirement('select_api', 'Browser body supplies only a selected ID; trusted wrapper supplies availability context. Unknown/unavailable/malformed selections receive frozen safe errors.'));
  task.interfaces.push({ id: 'selection_http', producerUnitIds: ['ui', 'api'], consumerUnitIds: ['api', 'ui'], schema: { id: 'selection_schema', version: 1, path: 'interfaces/selection.json', sha256: hash }, semantics: 'request_response', requestSemantics: 'POST /selection with selected ID only.', responseSemantics: 'Selected ID or frozen error code.', errorStates: ['unavailable', 'not_found', 'invalid_input'], ownerUnitId: 'api', compatibilityRequirementIds: ['select_api'] });
  task.publicChecks.push({ id: 'api_check', kind: 'unit', requirementIds: ['select_api'], workUnitIds: ['api'], interfaceIds: [] }, { id: 'http_check', kind: 'interface', requirementIds: ['select_api'], workUnitIds: ['ui', 'api'], interfaceIds: ['selection_http'] });
  task.editablePaths.push('src/selectPlan.ts');
  if (withPolicy) {
    task.disciplines.push('security');
    task.workUnits[1]!.interfaceIds.push('response_policy');
    task.workUnits.push({ id: 'policy', adapterKind: 'application_policy', adapterVersion: 1, requirementIds: ['policy_headers'], editablePaths: ['config/response-security.json'], interfaceIds: ['response_policy'], trustedCheckIds: ['policy_check'], requiredCapabilities: ['data_only_policy'], startAfterUnitIds: [] });
    task.requirements.push(requirement('policy_headers', 'The trusted loader emits the approved HTTPS response headers and preserves excluded routes. Forged forwarding headers do not select ingress context.'));
    task.interfaces.push({ id: 'response_policy', producerUnitIds: ['policy'], consumerUnitIds: ['api'], schema: { id: 'policy_schema', version: 1, path: 'interfaces/policy.json', sha256: hash }, semantics: 'file', requestSemantics: 'Strict data-only policy JSON.', responseSemantics: 'Trusted wrapper applies approved headers after candidate API output.', errorStates: ['invalid_policy'], ownerUnitId: 'policy', compatibilityRequirementIds: ['policy_headers'] });
    task.publicChecks.push({ id: 'policy_check', kind: 'unit', requirementIds: ['policy_headers'], workUnitIds: ['policy'], interfaceIds: [] }, { id: 'policy_transfer', kind: 'interface', requirementIds: ['policy_headers'], workUnitIds: ['policy', 'api'], interfaceIds: ['response_policy'] });
    task.editablePaths.push('config/response-security.json');
  }
  task.endToEndRequirements.push(requirement('selection_journey', 'Actual browser selection calls the candidate API and recovers from server rejection; all composed units and approved response policy obligations apply.'));
  task.publicChecks.push({ id: 'selection_e2e', kind: 'end_to_end', requirementIds: ['selection_journey'], workUnitIds: task.workUnits.map(unit => unit.id), interfaceIds: task.interfaces.map(item => item.id) });
  return task;
}
