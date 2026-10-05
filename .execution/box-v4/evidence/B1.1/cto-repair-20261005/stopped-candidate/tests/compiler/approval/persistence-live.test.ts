import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('actual synthetic PostgreSQL stores immutable exact approvals under session/CSRF/concurrency checks', () => {
  const output = execFileSync(process.execPath, ['.execution/evidence/M4.1/verify-release-live.mjs'], { encoding: 'utf8', timeout: 70000 });
  expect(JSON.parse(output)).toMatchObject({ assurance: 'tested', realCustomerData: false, immutableAssets: 'tested', ownerSession: 'tested', csrf: 'tested', roleDenial: 'tested', approvalConcurrency: 'tested', staleIntent: 'tested', signature: 'tested' });
}, 75000);
