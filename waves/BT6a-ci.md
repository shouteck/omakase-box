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

Pending.
