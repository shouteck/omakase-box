import { z } from 'zod';
import { contentHash } from '../../../../packages/contracts/hash.js';
import { HashSchema, IdSchema } from '../../../../packages/contracts/common.js';
import { PortablePathSchema } from '../../../../packages/contracts/paths.js';
import { PartitionProposalSchema } from '../../../../packages/contracts/private/planning.js';
import { analyzePolicyCandidate, parsePolicySpecification, policyJsonCopy, POLICY_PATH, POLICY_CHECK_IDS } from '../../../../packages/analyzer/policy/index.js';
import { checkPolicyData } from '../../../../packages/evaluation/policy/index.js';

const BindingSchema = z.strictObject({
  privateRevision: HashSchema, privateDestinationPath: z.literal(POLICY_PATH),
  retainedLoaderPath: PortablePathSchema.refine(path => path.split('/').includes('private')),
  retainedLoaderSha256: HashSchema, preservationRequirementIds: z.array(IdSchema).min(1).max(64)
});
const FrozenSchema = z.strictObject({
  assurance: z.literal('bounded'), status: z.literal('proposed'), approvalRequired: z.literal(true), runtimeTransfer: z.literal('pending_real_runner'),
  specification: z.unknown(), specificationHash: HashSchema, proposal: PartitionProposalSchema, proposalHash: HashSchema
});
export function preparePolicyCheck(input: { proposal: unknown; binding: unknown; candidate: unknown }) {
  const base = { assurance: 'bounded' as const, runtimeTransfer: 'pending_real_runner' as const, acceptanceEligible: false as const, requiredChecks: [...POLICY_CHECK_IDS] };
  try {
    const frozen = FrozenSchema.parse(policyJsonCopy(input.proposal));
    const specification = parsePolicySpecification(frozen.specification);
    if (contentHash(frozen.proposal) !== frozen.proposalHash || contentHash(specification) !== frozen.specificationHash || frozen.proposal.status !== 'proposed') throw new Error('policy_binding_mismatch');
    const composition = frozen.proposal.composition;
    const units = composition.workUnits.filter(unit => unit.adapterKind === 'application_policy');
    if (units.length !== 1 || units[0]!.editablePaths.length !== 1 || units[0]!.editablePaths[0] !== POLICY_PATH) throw new Error('unsupported_policy_scope');
    const binding = BindingSchema.parse(policyJsonCopy(input.binding));
    if (composition.editablePaths.some(path => path.toLowerCase() === binding.retainedLoaderPath.toLowerCase())) throw new Error('editable_loader');
    if (POLICY_CHECK_IDS.some(id => !units[0]!.trustedCheckIds.includes(id) || !composition.publicChecks.some(check => check.id === id && check.workUnitIds.includes(units[0]!.id)))) throw new Error('missing_registered_policy_check');
    const unitRequirements = units[0]!.requirementIds;
    if (new Set(binding.preservationRequirementIds).size !== binding.preservationRequirementIds.length || binding.preservationRequirementIds.some(id => !unitRequirements.includes(id))) throw new Error('unknown_preservation_requirement');
    const obligations = [...composition.requirements, ...composition.endToEndRequirements].filter(item => unitRequirements.includes(item.id));
    if (!obligations.length || obligations.some(item => !item.outputs.some(output => output.includes(frozen.specificationHash)))) throw new Error('missing_frozen_policy_obligation');
    const analysis = analyzePolicyCandidate(input.candidate);
    if (analysis.status !== 'checked') return { ...base, status: 'rejected' as const, reason: analysis.reason, bindingHash: null };
    const result = checkPolicyData(JSON.stringify(analysis.policy), specification, frozen.specificationHash);
    return { ...base, ...result, bindingHash: contentHash(binding), sourceSha256: analysis.sourceSha256, proposalHash: frozen.proposalHash };
  } catch { return { ...base, status: 'rejected' as const, reason: 'invalid_policy_preparation' as const, bindingHash: null }; }
}
