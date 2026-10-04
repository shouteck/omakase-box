import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('actual synthetic APIs reject forged identity, CSRF, expired sessions and invitation replay', () => {
  const output=execFileSync(process.execPath,['scripts/verify-auth.mjs'],{encoding:'utf8',stdio:'pipe',timeout:60000});
  expect(JSON.parse(output)).toMatchObject({assurance:'tested',signedSessionIsolation:'tested',clientRoleInjection:'denied',csrf:'required',requesterOperatorAuthority:'denied',invitationReplayRevocationExpiry:'tested',disabledAccounts:'denied',expiredSessions:'denied',publicProjection:'allowlisted',resourceOwnership:'tested',actualBrowserSignedSessions:'tested',logoutRevocation:'tested'});
},65000);
