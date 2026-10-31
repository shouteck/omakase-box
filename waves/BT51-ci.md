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

- Write: `tests/box/bounty/bt51.test.ts`, `tests/box/bounty/k14-start-budget.test.ts`, any other test that writes a hook the same way
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

- CTO: <host / model>
- Commit: `<SHA>`
- Verify: `<summary line>`
- Checks: the three questions answered · Level: ui-verified | test-verified | typecheck-only
- Lenses: none ticked
- Method: <playbook; each principle that changed a decision and what it changed>
- Findings and limits:
- Merged: `<merge SHA>` · Verify cost: `<line from node scripts/kitchen-stats.mjs --wave=BT51-ci>` · Resources removed: yes | <what remains and why>
- Reflect: <what went wrong> -> <wave | station | kitchen>: <what it became, or "nothing">
