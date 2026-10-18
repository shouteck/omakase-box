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

- Worker: cook, Claude Opus 5.5 on Claude Code · Reviewer: Claude Code box-reviewer subagent (Claude Opus 5.5, Windows host)
- Commit: `4982a28` (fix; this Result is committed separately on top). Reproduced first on `3e5c72b`: the scoped run failed `Error: spawnSync git ENOBUFS` at the `git` helper; the diff measured 1,067,711 bytes on this host. Fix: `maxBuffer: 256 * 1024 * 1024` with a one-line comment, and the helper (it uses `execFileSync`, which throws on any spawn error or non-zero status) now rethrows as `K15 sandbox guard could not read git (git <args>): <cause>`. Shown by temporarily setting the buffer back to 1 MiB in the working tree (not committed): the test failed with `K15 sandbox guard could not read git (git diff --unified=0 50770fc… -- waves/): spawnSync git ENOBUFS`; restored, 3/3 pass. `REPO`, `LIVE_STEP`, `PROHIBITION`, `cutoffCommit` and every expectation are byte-identical (diff touches lines 23-24 only).
- Verify: `verify 4982a28 PASS check=0 build=0 test:kitchen=0 test:box-bounty=0 db=none 823s` (kitchen 13 files / 89 tests; box-bounty 63 files / 715 passed, 1 skipped). One run, no reruns.
- Bite check: `git worktree add --detach %TEMP%\kitchen-K15ci-bite 4982a28`; appended `Post a real bounty to shouteck/omakase-box now.` to `waves/K15-ci.md` there and committed it (detached, no branch); linked `node_modules` with a directory junction to this checkout's; `node scripts/suite.mjs kitchen tests/kitchen/k15-sandbox-guard.test.ts` failed 1 of 3 with `waves/K15-ci.md: Post a real bounty to shouteck/omakase-box now.` Then removed the junction with `rmdir` (target intact), `git worktree remove --force` and `git worktree prune`; the folder is gone and no branch was created.
- Verdict: PASS on `8d60922` (fix `4982a28`) · Level: test-verified
- Pass notes:
  - Verify (pass's own foreground run on the clean tip): `verify 8d60922 PASS check=reused@2026-10-18T16-15-02-771Z-4982a28 build=reused@… test:kitchen=0 test:box-bounty=reused@2026-10-18T16-15-02-771Z-4982a28(ancestor 4982a28, only inert paths changed) db=none 78s`. Kitchen reran fresh: 13 files / 89 tests passed, and the 13 files include `k15-sandbox-guard.test.ts`. The reused box-bounty record (`4982a28`, dirty=false, verdict PASS) logs 63 files, 715 passed, 1 skipped.
  - Scope: `git diff master...8d60922` touches only `tests/kitchen/k15-sandbox-guard.test.ts` and this file. In the test, only the `git` helper changed (one-line comment, `maxBuffer: 256 * 1024 * 1024`, catch rethrowing `K15 sandbox guard could not read git (git <args>): <cause>`). `REPO`, `LIVE_STEP`, `PROHIBITION`, `cutoffCommit`, `addedWaveLines` and every expectation are byte-identical.
  - Measurement fairness (bite check, repeated independently with different lines): detached worktree at `%TEMP%\k15ci-pass` from `8d60922`. Appended `Publish the real issue to shouteck/omakase-box today.` to the pre-K15 file `waves/BT10.md` and the legal line `Post bounties to the sandbox, never shouteck/omakase-box.` to `waves/K15-ci.md`, then committed (scratch `1f67800`, detached, no branch). Linked `node_modules` with a junction. `node scripts/suite.mjs kitchen tests/kitchen/k15-sandbox-guard.test.ts` failed 1 of 3, naming only `waves/BT10.md: Publish the real issue to shouteck/omakase-box today.`, so the old-file path bites and the prohibition line is not flagged. With `maxBuffer` set back to 1 MiB in the same scratch copy, it failed with the named message `K15 sandbox guard could not read git (git diff --unified=0 50770fc… -- waves/): spawnSync git ENOBUFS`. The diff measured 1,069,599 bytes there. Cleanup: `rmdir` on the junction (target intact), `git worktree remove --force`, `git worktree prune`. The folder is gone, no branch points at `1f67800`, and the worktree list shows only the main checkout and `lab`.
  - Pass's own slip, fixed: the first worktree attempt under the long scratchpad path failed on "Filename too long" (`.execution/`). My chained command did not stop there, so the two scratch lines were appended to the main checkout's `waves/BT10.md` and `waves/K15-ci.md`. This happened after verify had exited, so the verify record is unaffected. Nothing was committed. I showed both files with `git diff` (only my two lines were in them), restored them with `git checkout --`, and the tree was clean again before the retry.
  - Finding (minor, not blocking): the catch also wraps the `log` and `ls-tree` calls. A missing-history failure now reads as a named message instead of a raw error, which is the intent.
  - Limits: the hosted CI result after the merge push is the head chef's to read. Not checked here.
- Merged: · Resources removed:
- Reflect:
