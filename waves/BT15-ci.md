# BT15-ci: the home-folder include test places its project under home on every system

Milestone: BT · Station: packaging · Base: master `c832f36` · Branch: `wave/BT15-ci` · Timebox: 45 minutes; at expiry the cook stops and reports where it is

**Brief.** Written by the CTO on 15 October 2026. The hosted check on master after BT15 closed (run 38667984660, commit `c832f36`) is red. A red master comes before any other wave.

## What failed

One test on the off-machine Linux runner, `tests/box/bounty/bt6b.test.ts` > "pass holes — configured commands that still reached a solver program" > "hole 3: refuses a `~/`-spelled include that lands inside the tree — the test places the repo under the home directory": `AssertionError: expected true to be false` at the line that checks the fixture sits under the home folder (`expect(fromHome.startsWith('..')).toBe(false)`). Bounty suite 466 passed, 1 failed, 9 skipped.

## Why

BT15 moved this fixture into `runRoot('BT15-home-include')`, which creates it under the system temp folder. On this Windows host the temp folder is inside the home folder (`C:\Users\<user>\AppData\Local\Temp`), so the precondition held. On Linux the temp folder is `/tmp`, outside the home folder, so the test's own precondition fails before the product is exercised. The test's comment already says it must not assume "the host's temp root is there". The product behaviour under test (a `~/` include that resolves inside the tree is refused with `apply-unsafe-config`) is not in question.

## Outcome

The test builds its fixture under the home folder on every system, its assertions unchanged, and the hosted check on master is green.

## Scope

- Write: `tests/box/bounty/bt6b.test.ts` (this test's fixture placement), and `tests/box/bounty/support.ts` only if a helper for an owned folder under home belongs there.
- Do not touch: product code; any assertion of this or any other test; global settings; the `HOME` environment of the process.

## Done when

- `node scripts/verify.mjs test:box-bounty` exits 0 on the final commit, on this host.
- The fixture root is created directly under the home folder, with an owned, wave-named prefix (for example `os.homedir()` + `mkdtemp`, named for BT15-ci or the test), and removed in `finally` by exact path, as today. The precondition assertion and every assertion after it are unchanged.
- **It is shown to work where it failed:** the test runs on Linux, in the off-machine runner after the push (the head chef reads it), or on this host under WSL or a container if one is available to the cook without changing any global setting. If neither is available before merge, the Result says so and the head chef reads the hosted run after the push.
- No other test is changed. `git diff master -- tests/` touches only this fixture placement.

## Review lenses

- [ ] **Security:** not applicable, beyond confirming the product code is untouched and no assertion changed.
- [ ] **User experience:** not applicable.
- [ ] **Measurement fairness:** not applicable.

## Notes for the worker

- Bug-fix playbook: the failure is reproduced by reading the hosted log above and the code; the root cause is the fixture's location, not the product.
- Clean up only what the test creates, by exact path. Never remove anything else under the home folder.
- Report at the timebox. Do not run on.

---

## Result

- Worker: Claude Code box-worker subagent (claude-opus-5-5) · Reviewer:
- Commit: `50f33fb` — `tests/box/bounty/bt6b.test.ts` only: the hole-3 `~/` include test's fixture root is `mkdtempSync(join(homedir(), 'box-bt15-ci-home-include-'))` instead of `runRoot(...)`; the `finally` `rmSync` by exact path is unchanged; no assertion changed.
- Verify: `verify 50f33fb PASS check=0 build=0 test:box-bounty=0 db=none 680s` (476 passed, 38 files), run directory `.kitchen/runs/2026-10-15T02-14-37-909Z-50f33fb`. During the run the folder `C:\Users\shout\box-bt15-ci-home-include-TFd2Ka` was observed under home; after the run no `box-bt15*` folder remained there.
- Verdict: · Level:
- Linux evidence: none from the cook. WSL on this host has only the `docker-desktop` distribution (stopped, no Node), so no Linux run was readily available without installing or changing settings; the head chef reads the hosted run after the push. On Linux `os.homedir()` and Git's `~` both read `HOME`, so the repo under `$HOME/box-bt15-ci-home-include-*` satisfies the precondition by construction.
- Merged: · Resources removed:
- Reflect:
