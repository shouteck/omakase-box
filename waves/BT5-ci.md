# BT5-ci: make the missing-tool probe independent of the host

Milestone: BT repair required by START.md · Station: packaging · Base: `68c4d5b` · Branch: `wave/BT5-ci` · Timebox: 45 minutes

## Outcome

The bounty suite exercises a genuinely absent PHP executable in a controlled child environment, even on a host that has PHP installed. The BT5 fixture's real-host preflight stays honest.

## Scope

- Write: `tests/box/bounty/bt5.test.ts`; a test helper under `tests/box/bounty/` only if necessary.
- Read: `kitchen/bt5/fixtures.mjs`, `kitchen/bt5/PROTOCOL.md`, suite and verification scripts as needed.
- Do not touch: product code, workflow, fixture implementation, expected outcomes, frozen history.

## Done when

- `node scripts/verify.mjs test:box-bounty` exits 0 on the candidate.
- The existing PHP-absent assertion is retained and passes in an isolated subprocess environment with no PHP executable available.
- Present-program and nonexistent-program probe checks still run. No test is skipped, weakened, or made conditional on host PHP.
- The reviewer attacks the isolation using a host PATH containing a stand-in PHP executable, demonstrating that the test still tests absence rather than host inventory. Use portable executable setup without relying on Windows-only shims on Linux.

## Review lenses

- [ ] Security
- [ ] User experience
- [x] Measurement fairness: distinguish a controlled probe behavior test from the live fixture preflight. Never claim this proves PHP absent on the real host.

## Notes for the worker

GitHub run 38057786379 failed on commit 751c480 at bt5.test.ts:35: expected `php absent`, got `php present`. This is the only failure shown; 130 tests passed and 11 were skipped on Linux. Preserve the assertion, control the child environment, and update comments so the suite does not claim to measure the host. The fixture builder's real-host preflight must remain unchanged. Follow the bug-fix playbook and read relevant principles. Do not start other agents or perform network mutations.

## Result

- Worker: pending · Reviewer: pending
- Commit: pending
- Verify: pending
- Verdict: pending · Level: pending
- Lenses: pending
- Method: pending
- Findings and limits: BT6 deferred under START.md's red-master rule. No public bounty posted.
- Merged: pending · Resources removed: pending
- Reflect: pending
