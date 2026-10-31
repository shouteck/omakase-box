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

- CTO: Claude Code desktop / Claude Opus 5.5
- Commit: `981fdd7`
- Verify: `verify 981fdd7 PASS check=0 build=0 test:box-bounty=0 test:kitchen=0(selected 4 of 18 kitchen files) db=none 1210s`
- Checks: the diff is the one comparison and its test. Verify passed on this commit. The new test failed on the old formula (`expected false to be true`). · Level: test-verified on Windows only
- Lenses: Security: BT51's stranger test passed unchanged. The rounding gives up one case: a landing in the same second as the collection, but before it, skips the "predates the pull request" check. That needs a stranger's pull request opened and collected within the second the owner's own commit was made, and it costs a wrongly marked pull request, not a merge. Accepted.
- Method: bug fix playbook. Fix Root Causes: fixed the comparison rather than raising `apply`'s budget to 7, though the extra read was harmless.
- Findings and limits:
  - **Not proven on Linux.** The cause is read from the code and two runs' counts (`gh` 6, then 7), not reproduced there. The next off-machine run is the proof.
  - BT51-ci's Git fix held on Linux: `apply` measured Git 32 in run 41250885715. Its hook fix too: bt51 no longer fails there.
- Merged: `<merge>` · Verify cost: `verify: 1 runs, total 1210s` · Resources removed: yes, nothing outside Git was created
- Reflect: BT51-ci named the budget failure's cause and missed a second one hiding behind it, because a failing list stops at the first overage per command -> wave: nothing more; the Linux gap is already in BACKLOG.
