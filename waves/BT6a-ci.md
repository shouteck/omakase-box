# BT6a-ci: missing-gh tests isolate executable lookup

Milestone: BT · Station: packaging · Base: `d35e194` · Branch: `wave/BT6a-ci` · Timebox: 50 minutes

## Outcome

The missing-GitHub-CLI refusal and complete folder journey pass regardless of whether git, node and gh share an installation directory. START.md gives the failed master check precedence over the requested BT7.

## Scope

- Write: `tests/box/bounty/github.test.ts`, `tests/box/bounty/github-fixture.ts`, narrowly needed bounty test helpers.
- Read: executable resolution and adjacent fixtures as needed.
- Do not touch: product code, expected outcomes, platform skips, other waves or workflow configuration.

## Done when

- `node scripts/verify.mjs test:box-bounty` exits 0 on the final clean commit.
- Both failing tests retain their assertions and execute on Windows and Linux. No host installation directory can leak gh into their missing-gh environment.
- Prove the isolation with gh present in the parent environment, and prove git and node remain usable during the whole local journey. Restore environment and remove scratch files even on failure.

## Review lenses

- [x] Security: poison executable lookup with an available gh; confirm it cannot be invoked by these offline cases.
- [ ] User experience
- [ ] Measurement fairness

## Notes for the worker

Hosted run 38124324459 on d35e194 fails github.test.ts lines 86 and 318. The current PATH uses the directories of git and node; Linux puts git and gh together in /usr/bin. Fix the fixture premise, not the refusal or expected outcome. Read the bug-fix playbook and relevant principles. One worker then a fresh reviewer. Do not edit kitchen documents. Report the exact commit and verify record to the CTO.

## Result

- Worker: `/root/bt6a_ci_cook`, Codex on Windows. Reviewer: fresh `/root/bt6a_ci_pass`, GPT-6-family Codex on Windows; exact runtime model identifier not exposed.
- Commit: `9a59b25a7c450f0f829e613d722d4f1628d7ac06`.
- Worker verify: `verify 9a59b25 PASS check=0 build=0 test:box-bounty=0 db=embedded 655s`. Record `.kitchen/runs/2026-10-11T08-32-32-742Z-9a59b25`: clean exact SHA, 188 bounty tests passed, no skips.
- Reviewer verify: `verify 9a59b25 PASS check=reused@2026-10-11T08-32-32-742Z-9a59b25 build=reused@2026-10-11T08-32-32-742Z-9a59b25 test:box-bounty=reused@2026-10-11T08-32-32-742Z-9a59b25 db=embedded 6s`. Completed invocation `.kitchen/runs/2026-10-11T08-45-14-173Z-9a59b25`, exit 0.
- Verdict: PASS, test-verified. Only the two permitted test files changed; both original expected outcomes remain, without product changes or platform skips.
- Security: reviewer independently reran focused poisoning/refusal/folder tests, exit 0, 13 passed and 15 excluded by name filter, 53.26s. Runnable parent gh was co-located with Git/Node, successfully called before isolation, absent inside isolation, and never invoked by the full local journey. Exception restoration, Git/Node usability and owned-directory cleanup passed.
- Method: worker followed bug-fix playbook. Fix-root-causes corrected the shared executable lookup premise; prove-it-works drove runnable parent poisoning and real subprocess probes; type-system discipline kept forwarding pairs typed as tuples without casts. Reviewer inspected native Windows binaries/DLLs/cmd, GIT_EXEC_PATH and absolute POSIX wrappers.
- Findings and limits: Windows needs Git's core binary and DLLs plus cmd for the runnable parent stand-in. Initial regression exposed shell lookup; verification then exposed tuple inference, both corrected before final acceptance. Sandbox initdb failed before checks for cook and reviewer; host-permission retries passed. Linux was inspected but not executed locally. Latest hosted run before merge remained inherited failure 38124324459; the next hosted result is pending.
- Merged: `b0dce53e78909a71ff0c78db39eae81ae3c3bd71`. Resources removed: helper scratch removed, verify databases cleaned; no review files added.
- Reflect: installation directories are not a missing-tool environment. Station lesson encoded in the runnable co-location/restoration regression and isolated helper, with no additional prose rule. Windows launcher and shell dependencies are proved by real executable probes.
