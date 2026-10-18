# K15-ci: the sandbox guard reads the whole wave history without hitting a buffer limit

Milestone: K (kitchen) · Station: evidence · Base: master `09e340c` · Branch: `wave/K15-ci` · Timebox: 45 minutes; at expiry the cook stops and reports where it is

**Brief.** Written by the CTO on 19 October 2026. The hosted run on master `09e340c` (run 39143651110) is red: `verify` failed, `install-node22` passed. A red master comes before any other wave.

## What failed

`tests/kitchen/k15-sandbox-guard.test.ts` › "no line added under waves/ since K15 asks for a real post on the working repository" crashed with `Error: spawnSync git ENOBUFS` (signal SIGTERM). Its `git` helper (around line 23) runs `git diff --unified=0 <cutoff> -- waves/` through `spawnSync` with Node's default `maxBuffer` of 1,048,576 bytes. The CTO measured that diff on master: **1,065,795 bytes**. It grows with every wave file written, so the guard was always going to cross the limit; nothing in BT35 caused it. The test never reached its check, so this is a crash, not a guard finding.

## Outcome

The guard reads the whole diff however large it grows, and checks exactly what it checked before.

## Scope

- Write: `tests/kitchen/k15-sandbox-guard.test.ts` (the `git` helper only).
- Do not touch: the guard's matching rules (`REPO`, `LIVE_STEP`, `PROHIBITION`), the cutoff derivation, any expectation, any other file.

## The fix

Give the helper's `spawnSync` a `maxBuffer` large enough for years of growth (for example `256 * 1024 * 1024`), with a one-line comment saying why (the wave-file diff since K15 passed 1 MiB on 19 October 2026). If the helper already inspects `error` or `status`, make an `ENOBUFS` or any spawn error **fail the test with a named message** rather than crash silently, so a future limit shows as a finding.

## Done when

- `node scripts/verify.mjs test:kitchen test:box-bounty` exits 0 on the final commit.
- The test is shown to still bite: in a scratch copy outside the checkout, add one wave-file line that names a real post on the working repository without a prohibition word, run the test, see it fail, discard the copy (the Result says how).
- After the merge push, both hosted jobs are green; the head chef reads them.

## Review lenses

- [ ] **Security:** not applicable beyond confirming the guard's rules are byte-identical.
- [ ] **User experience:** not applicable.
- [x] **Measurement fairness:** the pass repeats the bite check.

## Notes for the worker

- Bug-fix playbook: reproduce the `ENOBUFS` locally first (the diff is over 1 MiB on this host too).
- Do not edit `waves/K15-ci.md` while a verify runs. Report at the timebox.

---

## Result

- Worker: cook, Claude Opus 5.5 on Claude Code · Reviewer:
- Commit: `4982a28` (fix; this Result is committed separately on top). Reproduced first on `3e5c72b`: the scoped run failed `Error: spawnSync git ENOBUFS` at the `git` helper; the diff measured 1,067,711 bytes on this host. Fix: `maxBuffer: 256 * 1024 * 1024` with a one-line comment, and the helper (it uses `execFileSync`, which throws on any spawn error or non-zero status) now rethrows as `K15 sandbox guard could not read git (git <args>): <cause>`. Shown by temporarily setting the buffer back to 1 MiB in the working tree (not committed): the test failed with `K15 sandbox guard could not read git (git diff --unified=0 50770fc… -- waves/): spawnSync git ENOBUFS`; restored, 3/3 pass. `REPO`, `LIVE_STEP`, `PROHIBITION`, `cutoffCommit` and every expectation are byte-identical (diff touches lines 23-24 only).
- Verify: `verify 4982a28 PASS check=0 build=0 test:kitchen=0 test:box-bounty=0 db=none 823s` (kitchen 13 files / 89 tests; box-bounty 63 files / 715 passed, 1 skipped). One run, no reruns.
- Bite check: `git worktree add --detach %TEMP%\kitchen-K15ci-bite 4982a28`; appended `Post a real bounty to shouteck/omakase-box now.` to `waves/K15-ci.md` there and committed it (detached, no branch); linked `node_modules` with a directory junction to this checkout's; `node scripts/suite.mjs kitchen tests/kitchen/k15-sandbox-guard.test.ts` failed 1 of 3 with `waves/K15-ci.md: Post a real bounty to shouteck/omakase-box now.` Then removed the junction with `rmdir` (target intact), `git worktree remove --force` and `git worktree prune`; the folder is gone and no branch was created.
- Verdict: · Level:
- Merged: · Resources removed:
- Reflect:
