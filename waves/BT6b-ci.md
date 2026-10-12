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

- Worker: (box-worker, session ended mid-verify) · Reviewer: box-reviewer, Windows host, Claude Opus 4.5-ish (claude-opus-4-6)
- Commit: 3fcfcb2966c7b6006a8d186b75dc2c26d6663966
- Verify: `verify 3fcfcb2 PASS check=0 build=0 test:box-bounty=0 test:box-package=0 db=none 362s` — reviewer's own foreground run, `.kitchen/runs/2026-10-12T15-31-58-328Z-3fcfcb2`, exit 0, clean tree. The worker's earlier run (15-13-00-312Z) has no summary.json; nothing was reused.
- Verdict: PASS · Level: test-verified
- Lenses: none ticked (all three marked not applicable; agreed — the change is one test file only).
- Method: prove-it-works — read the diff, ran `bt6b.test.ts` scoped with `TMP`/`TEMP=C:\bt6bci-outside` (outside `homedir()`): 33/33 pass in 95s, the `~/` hole-3 test green at 2381ms, no `bt6bhh-*` left under `~` afterward. Then the full verify above.
- Findings and limits:
  - Scope: `git diff master...3fcfcb2` touches only `tests/box/bounty/bt6b.test.ts` (+42/−17) — fixture placement, exactly the brief.
  - The attack is still real: repo at `~/bt6bhh-*/repo`, `include.path = ~/…/armed.conf` resolves inside the tree; `apply` exits 3 naming `apply-unsafe-config` and `include.path` with fingerprint byte-identical (nothing written). If `unsafeOwnerCommands` returned nothing, apply would land (status 0) — a real check, not a tautology.
  - Audit: `homedir()` appears only in this test; the other include tests use `../`-relative and absolute paths — no sibling host assumption.
  - Master-side red was not re-run (needs the old file, would dirty the tree): statically the old premise `relative(homedir(), repo)` starts `..` whenever tmpdir is outside `~`, and CI run 38267286700 recorded it red.
  - Minor nits, not blocking: the test cannot distinguish "resolves inside" from "cannot be placed" for `~`-paths (both refuse under `include.path` — the brief only demands refusal by name); a hard-killed test could orphan a `bt6bhh-*` dir under `~` (named, tiny); `filteredRepoUnder` duplicates `makeRepo`'s six steps rather than parameterizing it.
- Merged: `2465d2c` (--no-ff into master, pushed; the reviewer's verdict rode the close commit — it was left uncommitted on the branch) · Resources removed: `wave/BT6b-ci` branch deleted; reviewer's `C:\bt6bci-outside` scratch and the test's own `bt6bhh-*` fixtures gone; `box-k6-*` stats swept
- Reflect: the fix matches the wave's own review history — the fourth-pass attack used `~/bt6bhh-*` dirs, so building the fixture under `~` is the same shape the check was proven against.
