import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { singleUnitContract } from '../../contracts/fixtures.js';

it('real synthetic PostgreSQL enforces revision/approval and reservation concurrency invariants', () => {
  const output = execFileSync(process.execPath, ['scripts/verify-persistence.mjs'], { input: JSON.stringify(singleUnitContract()), encoding: 'utf8', timeout: 60000, stdio: 'pipe' });
  const result = JSON.parse(output);
  expect(result).toMatchObject({ assurance: 'tested', private: { unresolvedApproval: 'denied', approvedRevisionImmutable: 'tested', concurrentRevision: 'one_winner', priorApprovalPreserved: true }, external: { concurrentReservation: 'one_winner', crossContributor: 'denied', staleVersion: 'denied', cancellationPreservesExpiry: true } });
}, 65000);
