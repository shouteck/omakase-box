import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('real PostgreSQL enforces the atomic acceptance transaction and payable guards', () => {
  const output = execFileSync(process.execPath, ['scripts/verify-acceptance.mjs'], { encoding: 'utf8', timeout: 120000, stdio: 'pipe' });
  expect(JSON.parse(output)).toMatchObject({ assurance: 'tested', private: { ownerGuard: 'tested', payableBinding: 'tested', atomicCommit: 'tested', replayDenied: 'tested', outboxGuards: 'tested' } });
}, 125000);
