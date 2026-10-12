# BT6b-ci: the `~/` include test is red off this host

Milestone: BT · Station: packaging · Base: master at dispatch · Branch: `wave/BT6b-ci` · Timebox: 30 minutes; at expiry the cook stops and reports where it is, whatever state that is

**Pre-brief.** Written by the CTO on 12 October 2026. The off-machine run on the BT6b merge (`af7b4e6`) failed one test — an environment assumption in the wave's own test file, not a product defect.

## Outcome

`tests/box/bounty/bt6b.test.ts` passes on a host whose `os.tmpdir()` is outside `~` (the Linux CI runner), with the `~/`-include attack still genuinely exercised.

## The defect

The test `hole 3: refuses a `~/`-spelled include that lands inside the tree` (bt6b.test.ts ~line 409) asserts `relative(homedir(), repo)` does not start with `..`. `filteredRepo()`/`makeRepo` build fixtures under `runRoot`/tmpdir — `C:\Users\shout\...\Temp` here, `/tmp` on the runner, which is not under `/home/runner`. Red run: `gh run view 38267286700`.

## Done when

- `node scripts/verify.mjs test:box-bounty test:box-package` exits 0 on the final commit.
- The `~/` test still exercises the real attack: a repo under `homedir()` and an `include.path` spelled `~/…` that lands inside it, refused by name with nothing written. Build that test's repo under `homedir()` (the reviewer's own attacks used `~/bt6bhh-*` dirs — same shape), removing it in `finally`. Keep the premise check, reworded to say the test *places* the repo under `~` rather than assuming the host does.
- Audit the file for the same assumption elsewhere; fix any sibling that needs a repo under `~`.
- Reproduce first: run the single test file with `TMP`/`TEMP` pointed at a directory outside `homedir()` — it must fail on master before the fix and pass after.

## Review lenses

- [ ] Security — not applicable; test-only change.
- [ ] User experience — not applicable.
- [ ] Measurement fairness — not applicable.

## Notes for the worker

- Bug-fix playbook, smallest change. This is a test-environment defect: fix the test's fixture placement, not the product.
- Report at the timebox. Do not run on.

---

## Result

- Worker: · Reviewer:
- Commit:
- Verify:
- Verdict: · Level:
- Lenses:
- Method:
- Findings and limits:
- Merged: · Resources removed:
- Reflect:
