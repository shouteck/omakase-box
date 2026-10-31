# BT51-ci2: a merge in the same second as collection needs no extra GitHub read

Milestone: PF (the platform) · Station: packaging · Base: `master at dispatch` · Branch: `wave/BT51-ci2` · Timebox: 45 minutes; at expiry, report partial findings and stop
Owner decisions: none
Horizon: short

**Brief.** Written by the CTO on 1 November 2026. Run 41250885715 on master (`64cf616`) is red: K14's `apply` made 7 `gh` starts against 6. BT51-ci's own fix held (Git starts 32). BT52 is parked on its branch until this is green.

## Outcome

`apply` on a solution collected earlier in the same second makes the same `gh` reads as one collected a second before: the budget holds on a fast host, with no number changed.

## The cause

`landedBeforePull` (`packages/box-bounty/close.ts`) skips asking GitHub when the landing commit is no older than the collection. A commit's date has whole seconds and the collected time has milliseconds, so a merge in the same second reads as earlier and pays one read of the pull request. Linux is fast enough to hit it, so the first run showed `gh` 6 and the next 7.

## Scope

- Write: `packages/box-bounty/close.ts`, `tests/box/bounty/bt51.test.ts`
- Do not touch: the `BUDGET` table, any expected outcome

## Done when

- `node scripts/verify.mjs test:box-bounty test:kitchen` exits 0 on the final commit.
- A test on the comparison fails with the old formula: a landing in the same second as the collection counts as landed after it; one a second earlier does not.
- The next off-machine run on master is read at the next kickoff. This host cannot run Linux.

## Lenses

- [x] **Security:** the check stops a stranger's pull request on the owner's own commit (BT51). Say what the rounding gives up.
- [ ] **User experience:** not applicable.
- [ ] **Measurement fairness:** not applicable.

## Notes

- Bug fix playbook. BT51's "stranger" test must stay green unchanged.

---

## Result

- CTO: <host / model>
- Commit: `<SHA>`
- Verify: `<summary line>`
- Checks: the three questions answered · Level: ui-verified | test-verified | typecheck-only
- Lenses: <what was tried and what was found>
- Method: <playbook; each principle that changed a decision and what it changed>
- Findings and limits:
- Merged: `<merge SHA>` · Verify cost: `<line from node scripts/kitchen-stats.mjs --wave=BT51-ci2>` · Resources removed: yes | <what remains and why>
- Reflect: <what went wrong> -> <wave | station | kitchen>: <what it became, or "nothing">
