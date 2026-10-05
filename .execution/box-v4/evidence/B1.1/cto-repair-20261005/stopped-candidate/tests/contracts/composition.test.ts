import { describe, expect, it } from 'vitest';
import { ExternalTaskContractSchema, projectPublicListing } from '../../packages/contracts/public/index.js';
import { fullStackContract, singleUnitContract } from './fixtures.js';

describe('task composition contracts', () => {
  it('validates single-unit, coherent full-stack and frontend/backend/policy tasks without exclusive family tags', () => {
    for (const task of [singleUnitContract(), fullStackContract(), fullStackContract(true)]) expect(ExternalTaskContractSchema.parse(task)).toEqual(task);
  });
  it.each(['privateRevision', 'approvalActor', 'family', 'internalIntent', 'modelPrompt', 'role'])('rejects unknown privileged or exclusive task field %s', name => {
    expect(ExternalTaskContractSchema.safeParse({ ...singleUnitContract(), [name]: 'synthetic-private-canary' }).success).toBe(false);
  });
  it('rejects nested privileged fields instead of stripping them', () => {
    const task = singleUnitContract();
    expect(ExternalTaskContractSchema.safeParse({ ...task, workUnits: [{ ...task.workUnits[0], command: 'unsafe' }] }).success).toBe(false);
  });
  it.each(['duplicate_ids', 'shared_paths', 'case_paths', 'dangling_interface', 'unknown_capability', 'unsupported_version', 'missing_capability', 'schema_owner', 'missing_e2e', 'partial_e2e', 'cyclic_start', 'uncovered_requirement', 'missing_interface_check', 'tooling_edit', 'executable_policy'])('rejects invalid composition %s', scenario => {
    const task = fullStackContract(true);
    const ui = task.workUnits[0]!; const api = task.workUnits[1]!; const policy = task.workUnits[2]!;
    if (scenario === 'duplicate_ids') api.id = ui.id;
    if (scenario === 'shared_paths') api.editablePaths = [...ui.editablePaths];
    if (scenario === 'case_paths') api.editablePaths = ['SRC/PLANSELECTOR.TSX'];
    if (scenario === 'dangling_interface') ui.interfaceIds.push('missing');
    if (scenario === 'unknown_capability') (ui.requiredCapabilities as string[]).push('shell');
    if (scenario === 'unsupported_version') (api as unknown as { adapterVersion: number }).adapterVersion = 2;
    if (scenario === 'missing_capability') api.requiredCapabilities = ['candidate_api'];
    if (scenario === 'schema_owner') task.interfaces[1]!.schema.path = task.interfaces[0]!.schema.path;
    if (scenario === 'missing_e2e') task.endToEndRequirements = [];
    if (scenario === 'partial_e2e') task.publicChecks.find(check => check.kind === 'end_to_end')!.workUnitIds = ['ui'];
    if (scenario === 'cyclic_start') api.startAfterUnitIds = ['ui'];
    if (scenario === 'uncovered_requirement') ui.requirementIds.push('unpublished');
    if (scenario === 'missing_interface_check') task.publicChecks = task.publicChecks.filter(check => check.id !== 'http_check');
    if (scenario === 'tooling_edit') { api.editablePaths = ['package.json']; task.editablePaths[1] = 'package.json'; }
    if (scenario === 'executable_policy') { policy.editablePaths = ['config/policy.ts']; task.editablePaths[2] = 'config/policy.ts'; }
    expect(ExternalTaskContractSchema.safeParse(task).success).toBe(false);
  });
  it('permits bidirectional runtime interfaces while requiring acyclic start dependencies', () => {
    expect(ExternalTaskContractSchema.safeParse(fullStackContract()).success).toBe(true);
  });
  it('creates a positive public listing projection rather than serializing the task', () => {
    const task = fullStackContract(true);
    const listing = projectPublicListing(task, null);
    expect(Object.keys(listing).sort()).toEqual(['schemaVersion', 'taskId', 'version', 'title', 'purpose', 'disciplines', 'reward', 'estimatedEffortMinutes', 'terms'].sort());
    expect(listing).not.toHaveProperty('workUnits');
    expect(listing.estimatedEffortMinutes).toBeNull();
    expect(() => projectPublicListing({ ...task, privateLogs: 'canary' } as typeof task, null)).toThrow();
  });
});
