import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { singleUnitContract } from '../../contracts/fixtures.js';

it('real PostgreSQL rejects lifecycle bypass, identity mutation, supersession reset and outbox tampering', () => {
  const output = execFileSync(process.execPath, ['scripts/verify-lifecycles.mjs'], { input: JSON.stringify(singleUnitContract()), encoding: 'utf8', timeout: 60000, stdio: 'pipe' });
  expect(JSON.parse(output)).toMatchObject({ assurance: 'tested', private: { lifecycle: 'tested', supersession: 'tested', outboxReplay: 'one_event' }, external: { reservationTerminalStates: 'tested', submissionBindingAndLifecycle: 'tested', forgedPermitBinding: 'denied' } });
}, 65000);
