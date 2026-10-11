import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('real PostgreSQL enforces readiness immutability, owner review authority and solve classification', () => {
  const output = execFileSync(process.execPath, ['scripts/verify-readiness.mjs'], { encoding: 'utf8', timeout: 120000, stdio: 'pipe' });
  expect(JSON.parse(output)).toMatchObject({ assurance: 'tested', private: { immutableRecords: 'tested', immutableDecisions: 'tested', ownerReviewAuthority: 'tested', solveClassification: 'tested' } });
}, 125000);
