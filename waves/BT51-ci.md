# BT51-ci: the off-machine run on master is green again

Milestone: PF (the platform) · Station: packaging · Base: `master at dispatch` · Branch: `wave/BT51-ci` · Timebox: 60 minutes; at expiry, report partial findings and stop
Owner decisions: none
Horizon: short

**Brief.** Written by the CTO on 1 November 2026. Run 41248769316 on master (`85e1845`, BT51's close) failed 4 tests on Linux. START.md makes the fix this run's one wave, ahead of BT52, which the owner named. Both causes are in the tests; no product code changes.

## Outcome

The bounty suite gives the same answers on Linux as on Windows for BT51's tests and the start budget, with no expected outcome and no budget number changed.

## The causes

1. `tests/box/bounty/bt51.test.ts`, three tests: `refuseUpdates` writes `hooks/update` with no execute bit. Linux Git ignores it, the push lands, and the "refused push" never happens.
2. `tests/box/bounty/k14-start-budget.test.ts`, `apply` at 33 against 32: on Linux the stand-in is `node standin.cjs`, so the spy loads inside it and counts the stand-in's own `git merge-base` (`ancestorOnRemote`, added in BT51). On Windows the preload exits before the spy loads. The tool made 32 starts on both.

## Scope

- Write: `tests/box/bounty/bt51.test.ts`, `tests/box/bounty/k14-start-budget.test.ts`, `tests/box/bounty/answer.test.ts` (its must-not-fire `post-merge` hook has the same flaw: on Linux it could never fire)
- Read for context: `tests/box/bounty/github-fixture.ts`
- Do not touch: `packages/`, the `BUDGET` table, any expected outcome

## Done when

- `node scripts/verify.mjs test:box-bounty test:kitchen` exits 0 on the final commit.
- A new test shows the spy counts a Git start in an ordinary script and none inside a script named `standin.cjs`; it fails without the fix.
- The next off-machine run on master is read at the next kickoff. This host cannot run Linux, so the hook fix is proven there, not here; the Result says so.

## Lenses

- [ ] **Security:** not applicable, test-only.
- [ ] **User experience:** not applicable.
- [ ] **Measurement fairness:** covered by the spy test above; the budget's numbers do not move.

## Notes

- Bug fix playbook. A second instance of a flaw class gets named: grep every hook a test writes.

---

## Result

- CTO: Claude Code desktop / Claude Opus 5.5
- Commit: `4df7e07`
- Verify: `verify 4df7e07 PASS check=0 build=0 test:box-bounty=0 test:kitchen=0(selected 4 of 18 kitchen files) db=none 1243s`
- Checks: the diff is three test files and this brief; no `packages/` change, no `BUDGET` number and no expected outcome moved. Verify passed on this commit. Would the checks catch a wrong fix: the new spy test failed with the guard removed (`standin.cjs` counted 1, expected 0). The hook fix has no such proof here: Windows runs a hook with or without the bit. · Level: test-verified on Windows only
- Lenses: none ticked
- Method: bug fix playbook. Fix Root Causes: fixed the spy and the hooks rather than raising the budget to 33, and the pattern grep found `answer.test.ts`.
- Findings and limits:
  - **Not proven on Linux.** Both causes come from reading the code and the failed run's log; this host cannot run Linux. The next off-machine run on master is the proof. If it is still red, the next wave is this fix again.
  - `answer.test.ts`' must-not-fire `post-merge` hook could never fire on Linux, so that part of the check was empty there. It is now armed, and Linux may show a new result.
  - The other hook writes in `bt7.test.ts` and `bt7-git-channels.test.ts` already set the bit.
  - Verify took 1243 s on this host, with the bounty suite's load limits in BACKLOG.
- Merged: see `git log --first-parent master` · Verify cost: recorded in the status commit's run of `kitchen-stats --wave=BT51-ci` · Resources removed: yes, nothing outside Git was created
- Reflect: a kickoff read the off-machine run while it was still in progress, so the red surfaced after BT52's plan was approved -> wave: the plan is saved in `waves/BT52.md`. Linux-only test faults reach master unseen from this host -> kitchen: one inbox line.
