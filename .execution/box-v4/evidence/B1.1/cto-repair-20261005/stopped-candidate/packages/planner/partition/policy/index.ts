import { contentHash } from '../../../contracts/hash.js';
import { PartitionProposalSchema } from '../../../contracts/private/planning.js';
import { parsePolicySpecification, policyJsonCopy, POLICY_PATH, POLICY_CHECK_IDS } from '../../../analyzer/policy/index.js';

export function freezePolicyProposal(rawProposal: unknown, rawSpecification: unknown) {
  const specification = parsePolicySpecification(rawSpecification);
  const proposal = PartitionProposalSchema.parse(policyJsonCopy(rawProposal));
  if (proposal.status !== 'proposed') throw new Error('policy_partition_not_supported');
  const units = proposal.composition.workUnits.filter(unit => unit.adapterKind === 'application_policy');
  if (units.length !== 1 || units[0]!.editablePaths.length !== 1 || units[0]!.editablePaths[0] !== POLICY_PATH) throw new Error('unsupported_policy_scope');
  const unit = units[0]!;
  const specificationHash = contentHash(specification);
  const requirementIds = new Set(unit.requirementIds);
  for (const requirement of [...proposal.composition.requirements, ...proposal.composition.endToEndRequirements]) {
    if (!requirementIds.has(requirement.id)) continue;
    requirement.inputs = [...requirement.inputs, `Frozen policy declaration: ${JSON.stringify(specification)}`];
    requirement.outputs = [...requirement.outputs, `Exactly one declared alternative must be satisfied; specification SHA-256 ${specificationHash}.`, 'Strip all candidate-controlled security headers before applying policy from trusted ingress; excluded /health responses and unrelated headers remain unchanged.'];
    requirement.states = [...new Set([...requirement.states, 'https', 'http', 'localhost', 'excluded_route'])];
    requirement.invalidCases = [...requirement.invalidCases, 'Reject duplicate JSON keys, unknown fields, executable/remote references, out-of-scope paths and undeclared policy values.'];
    requirement.exclusions = [...requirement.exclusions, 'No evaluator commands, ports, dependencies, networking or privileges are policy outputs.'];
    requirement.examples = [...requirement.examples, { given: 'Trusted HTTPS ingress outside localhost.', when: 'The trusted wrapper applies an allowed policy after candidate output.', then: 'Emit declared headers; HSTS exists only if enabled. HTTP/localhost omits HSTS. /health preserves its original headers.' }];
  }
  for (const id of POLICY_CHECK_IDS) {
    if (proposal.composition.publicChecks.some(check => check.id === id)) throw new Error('policy_check_id_collision');
    const transfer = id !== 'policy_schema_v1' && id !== 'policy_constraints_v1';
    proposal.composition.publicChecks.push({ id, kind: transfer ? 'end_to_end' : 'unit', requirementIds: [...unit.requirementIds], workUnitIds: transfer ? proposal.composition.workUnits.map(entry => entry.id) : [unit.id], interfaceIds: transfer ? proposal.composition.interfaces.map(entry => entry.id) : [] });
    unit.trustedCheckIds.push(id);
  }
  const frozenProposal = PartitionProposalSchema.parse(proposal);
  return { assurance: 'bounded' as const, status: 'proposed' as const, approvalRequired: true as const, runtimeTransfer: 'pending_real_runner' as const, specification, specificationHash, proposal: frozenProposal, proposalHash: contentHash(frozenProposal) };
}
export type FrozenPolicyProposal = ReturnType<typeof freezePolicyProposal>;
