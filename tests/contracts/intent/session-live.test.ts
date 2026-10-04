import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('actual private DB session records protect intent revisions, decisions and immutable owner approval', () => {
  const output=execFileSync(process.execPath,['scripts/verify-intent-sessions.mjs'],{encoding:'utf8',stdio:'pipe',timeout:65000});
  expect(JSON.parse(output)).toMatchObject({assurance:'tested',sessionRevocation:'denied',operatorRequesterApproval:'denied',unresolvedDecision:'blocked',exactHash:'required',approvedPayload:'immutable',editAfterApproval:'new_revision_stale_old_approval',publicProductFlow:'not_implemented',realCustomerData:false});
},70000);
