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

- Worker: Claude Code box-worker subagent (claude-opus-5-5) · Reviewer: Claude Code box-reviewer subagent (claude-opus-5-5), Windows host, reviewed `50f33fb` (base master `e228445`)
- Commit: `50f33fb` — `tests/box/bounty/bt6b.test.ts` only: the hole-3 `~/` include test's fixture root is `mkdtempSync(join(homedir(), 'box-bt15-ci-home-include-'))` instead of `runRoot(...)`; the `finally` `rmSync` by exact path is unchanged; no assertion changed.
- Verify: `verify 50f33fb PASS check=0 build=0 test:box-bounty=0 db=none 680s` (476 passed, 38 files), run directory `.kitchen/runs/2026-10-15T02-14-37-909Z-50f33fb`. During the run the folder `C:\Users\shout\box-bt15-ci-home-include-TFd2Ka` was observed under home; after the run no `box-bt15*` folder remained there.
- Verdict: PASS · Level: test-verified (on `50f33fb`; read the verify finding below before merging)
- Pass verify: on `50f33fb` itself: `verify 50f33fb PASS check=reused@2026-10-15T02-14-37-909Z-50f33fb build=reused@2026-10-15T02-14-37-909Z-50f33fb test:box-bounty=reused@2026-10-15T02-14-37-909Z-50f33fb db=none 1s`, run `.kitchen/runs/2026-10-15T02-53-59-230Z-50f33fb` (all three steps reused the cook's recorded PASS on the same SHA, clean tree). On the branch tip `cb8773f` (differs only in this file) every step ran fresh, twice, and both runs were red: `verify cb8773f FAIL check=0 build=0 test:box-bounty=1 db=none 708s` (`.kitchen/runs/2026-10-15T02-27-02-266Z-cb8773f`) and `verify cb8773f FAIL check=0 build=0 test:box-bounty=1 db=none 705s` (`.kitchen/runs/2026-10-15T02-39-21-529Z-cb8773f`). Both times the only failure was `tests/box/bounty/report.test.ts` > "no attempt's report carries a verdict word": `Test timed out in 30000ms` (30683 ms, 30266 ms); 475 passed, bt6b green. Not caused by this diff: that file and what it imports are untouched; run alone (one worker, together with the hole-3 test) it passes in 21.2 s; the same test timed out on this host before (`.kitchen/runs/2026-10-11T11-59-28-980Z-1a7a2de`), and it passed on the hosted Linux run that failed only bt6b. It is a pre-existing time-limit flake under the suite's three workers: a fresh verify on this host can be red for a reason outside this wave. The head chef decides whether that blocks the merge.
- Findings: (1) Scope: `git diff master...50f33fb` touches only `tests/box/bounty/bt6b.test.ts`: one line of fixture placement (`runRoot('BT15-home-include')` to `mkdtempSync(join(homedir(), 'box-bt15-ci-home-include-'))`) plus its comment; no assertion, no other test, no product code, `support.ts` untouched. (2) Would it catch a wrong product: temporarily changed `packages/box-bounty/git.ts` line 591 so `~/` expands to `/box-mutant-nowhere` instead of `homedir()`, rebuilt, ran the test: it FAILED at `expected 'bounty apply refused (apply-unsafe-co…' to contain 'include.path'`. Restored the file, rebuilt, test passes, tree clean. The status-3 and `apply-unsafe-config` assertions alone would not have caught that mutant (the included `filter.arm.clean` is still refused under its own key); the `include.path` assertion is the one that bites. (3) Cleanup: the removed folder is exactly the path `mkdtempSync` returned, in `finally`; settings go to `BOX_BOUNTY_SETTINGS_DIR` (run root, `support.ts`), the bounty folder to `runRoot('bt6b-out')`, records into the repo inside the owned folder; nothing else is written under home. No `box-bt15-ci-home-include-*` was left under `C:\Users\shout` after either full run, the single runs or the mutant run. (4) Linux by reading: the product expands `~` with `os.homedir()` in the CLI child, which inherits the test's environment (`HOME` untouched); libuv's homedir reads `HOME` first, and Git expands a `~/` include from `HOME`; `relative(homedir(), repo)` is lexical on a path built from the same `homedir()` string, so the precondition holds by construction.
- Limits: no Linux run by the pass either (WSL has only the stopped `docker-desktop` distribution, no Node); the hosted run after the push is the Linux evidence and the head chef must read it. The green verify line is a reused record of the cook's run on `50f33fb`; my own fresh runs on the content-identical tip were red on the unrelated timeout above. Lenses: none ticked. Principle applied: prove-it-works (the mutant run on the real built CLI, rather than reasoning from the assertions alone).
- Linux evidence: none from the cook. WSL on this host has only the `docker-desktop` distribution (stopped, no Node), so no Linux run was readily available without installing or changing settings; the head chef reads the hosted run after the push. On Linux `os.homedir()` and Git's `~` both read `HOME`, so the repo under `$HOME/box-bt15-ci-home-include-*` satisfies the precondition by construction.
- Merged: · Resources removed:
- Reflect:
