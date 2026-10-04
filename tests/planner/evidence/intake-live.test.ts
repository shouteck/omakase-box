import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('persists pinned private evidence with actual session/ownership, atomic quotas and inert browser downloads', () => {
  const output = execFileSync(process.execPath, ['scripts/verify-intake.mjs'], { encoding: 'utf8', stdio: 'pipe', timeout: 180000 });
  expect(JSON.parse(output)).toMatchObject({ assurance: 'tested', pinnedSnapshots: 'immutable_deduplicated', requestOwnership: 'enforced', uploadCountAndByteRace: 'bounded', evidenceDownloads: 'attachment_not_executed', contributorAccess: 'denied', plannerRetrieval: 'bounded_no_image_understanding', immutableSqlAndRevokedSession: 'tested', realCustomerData: false });
}, 185000);
