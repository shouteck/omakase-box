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

- Worker: Codex, inherited configured model, Windows; agent `/root/bt5_ci_worker` · Reviewer: independent Codex, inherited configured model, Windows; agent `/root/bt5_ci_reviewer`. No model diversity claimed.
- Commit: `ac58ab9281822d1ec8451d03e6e8efa1d79f75ab`
- Worker verify: `verify ac58ab9 PASS check=0 build=0 test:box-bounty=0 db=embedded 326s`; 142/142 bounty tests passed.
- Reviewer verify: `verify ac58ab9 PASS check=reused@2026-10-10T23-24-04-215Z-ac58ab9 build=reused@2026-10-10T23-24-04-215Z-ac58ab9 test:box-bounty=reused@2026-10-10T23-24-04-215Z-ac58ab9 db=embedded 8s`. Completed exit 0, record `.kitchen/runs/2026-10-10T23-30-39-037Z-ac58ab9`; independently inspected the exact-SHA clean worker record and suite log. No doubt warranted `--fresh`.
- Verdict: PASS · Level: test-verified
- Measurement fairness: reviewer put a runnable native executable named `php.exe` on the parent PATH. Live probe reported PHP present and fixture builder refused before creating its destination. Under that same parent environment all six candidate tests passed. Isolation removes inherited PATH aliases and uses an empty child PATH and working directory; Node starts by absolute path. This proves controlled probe behavior, not PHP absence on the host. All expected outcomes retained, no skips added.
- Method: bug-fix playbook. Read fix-root-causes led to controlling executable lookup rather than changing the assertion; read prove-it-works led to original/fixed hostile-PATH reproduction and exact-commit acceptance. Reviewer also applied test-behavior-not-implementation to output/status assertions. Only `tests/box/bounty/bt5.test.ts` changed.
- Findings and limits: BT6 deferred under START.md's red-master rule. No public bounty posted. Attacks ran on Windows only; native-executable setup avoids Linux dependence on command-file shims. Initial sandbox acceptance failed before tests at disposable Postgres `initdb`; permitted escalation passed without settings changes. Reviewer initially assumed probe presence exits 1, corrected its attack to the diagnostic mode's actual exit-0 contract and reran successfully. Latest hosted run at kickoff remains failed; pushed repair will trigger a new run, not waited on at close.
- Merged: `176618ba7427d6a9eacfe5764d1ac14c75102963` · Resources removed: worker and reviewer scratch removed, acceptance database cleaned by verify; merged branch removed at close.
- Reflect: a live-host fixture premise was encoded as a portable suite assertion. Wave: isolation and corrected comments now distinguish controlled behavior from host inventory. Kitchen: adopt into reviewer profile that machine capability assertions need controlled child lookup or explicit live-preflight labeling.
