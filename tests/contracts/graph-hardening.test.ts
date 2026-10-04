import { describe, expect, it } from 'vitest';
import { ExternalTaskContractSchema } from '../../packages/contracts/public/index.js';
import { fullStackContract } from './fixtures.js';

describe('joined interface and schema ownership', () => {
  it('rejects a disconnected policy unit even when its unit check and whole-task check links exist', () => {
    const task = fullStackContract(true);
    task.interfaces = task.interfaces.filter(item => item.id !== 'response_policy');
    for (const unit of task.workUnits) unit.interfaceIds = unit.interfaceIds.filter(id => id !== 'response_policy');
    task.publicChecks = task.publicChecks.filter(check => check.id !== 'policy_transfer');
    for (const check of task.publicChecks) check.interfaceIds = check.interfaceIds.filter(id => id !== 'response_policy');
    expect(ExternalTaskContractSchema.safeParse(task).success).toBe(false);
  });
  it('rejects units declaring an interface they do not participate in', () => {
    const task = fullStackContract(true);
    task.workUnits[2]!.interfaceIds.push('selection_http');
    expect(ExternalTaskContractSchema.safeParse(task).success).toBe(false);
  });
  it('rejects incompatible versions of the same schema even with the same owner', () => {
    const task = fullStackContract();
    task.interfaces.push({ ...task.interfaces[0]!, id: 'another_selection', schema: { ...task.interfaces[0]!.schema, version: 2 } });
    task.workUnits.forEach(unit => unit.interfaceIds.push('another_selection'));
    task.publicChecks.push({ id: 'another_check', kind: 'interface', requirementIds: ['select_api'], workUnitIds: ['ui', 'api'], interfaceIds: ['another_selection'] });
    expect(ExternalTaskContractSchema.safeParse(task).success).toBe(false);
  });
  it('rejects changes to a trusted published interface schema through candidate edit paths', () => {
    const task = fullStackContract();
    task.workUnits[0]!.editablePaths.push('interfaces/selection.json');
    task.editablePaths.push('interfaces/selection.json');
    expect(ExternalTaskContractSchema.safeParse(task).success).toBe(false);
  });
});
