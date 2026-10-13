# BT7b-ci: merge-recognition tests are red off this host

Milestone: BT · Station: packaging · Base: master at dispatch · Branch: `wave/BT7b-ci` · Timebox: 30 minutes; at expiry the cook stops and reports where it is, whatever state that is

**Pre-brief.** Written by the CTO on 13 October 2026. The off-machine runs on the BT7b merge (`bd31c77`) and the BT7c merge (`1ce6cc7`) each failed 17 tests in `tests/box/bounty/bt7b.test.ts` and `tests/box/bounty/bt7b-review.test.ts` — all `git merge ... failed: Committer identity unknown`. An environment assumption in the wave's own tests, not a product defect: the fixture `git()` calls that create merges carry no `user.name`/`user.email`, which this Windows host supplies from global config and the Linux runner does not. Red runs: `gh run view 38287099798`, `gh run view 38329013247`.

## Outcome

The bounty test suite passes on a host with no committer identity configured anywhere — the runner's actual state — with every merge-attribution scenario still genuinely exercised.

## Done when

- `node scripts/verify.mjs test:box-bounty test:box-package` exits 0 on the final commit.
- Reproduce first: run the two failing files with global+system Git config neutralised (`GIT_CONFIG_NOSYSTEM=1` and `HOME`/`USERPROFILE` pointed at an empty scratch dir — no fallback identity anywhere). On master they must fail with `Committer identity unknown`; after the fix they pass in that same environment.
- Fix at the fixture level, not per call site: every test-side commit-creating Git call (merge, commit, commit-tree, cherry-pick, revert) in the bounty suite gets a deterministic test identity — the helper `git()` in `support.ts` or the repo-building helpers (`makeRepo`, github-fixture) are the right seam; the worker picks and says why. The injected identity must be visibly a test fixture's (e.g. `bt-test`), never the owner's.
- Audit the whole `tests/box/bounty/` directory for other commit-creating calls lacking identity, not just the 17 that went red — the same assumption anywhere is the same latent failure. Product code must not change: the tool already supplies its own identity for merges it makes.
- No test's expected outcome changes; the merges land exactly as before, only the identity supplying them is explicit.

## Review lenses

- [ ] Security — not applicable; test-only change.
- [ ] User experience — not applicable.
- [ ] Measurement fairness — not applicable.

## Notes for the worker

- Bug-fix playbook, smallest change. This is a test-environment defect: fix fixture plumbing, never the product.
- Check the injected identity does not mask a test that asserts on config state (e.g. a test reading `user.name`) — grep the suite before choosing the seam.
- Report at the timebox. Do not run on.

---

## Result

- Worker: cook (`7587669`) · Reviewer: the pass — Devin subagent (Claude) on the Windows host, fresh agent, did not write this code
- Commit: `758766952fe68cc5f592e64189c9aa480df03e80`
- Verify: `verify 7587669 PASS check=0 build=0 test:box-bounty=0 test:box-package=0 db=none 339s` — recorded run `.kitchen/runs/2026-10-13T00-56-39-481Z-7587669`, exact SHA, clean tree; relied on per role. Reviewer's own evidence: `node scripts/suite.mjs box --suite bounty tests/box/bounty/bt7b.test.ts tests/box/bounty/bt7b-review.test.ts` under `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL/SYSTEM=NUL`, `HOME`/`USERPROFILE`/`XDG_CONFIG_HOME` on an empty scratch dir — 26/26 passed, exit 0.
- Verdict: PASS · Level: test-verified
- Lenses: none ticked (all three marked not applicable in the brief).
- Method: full `git diff master...7587669` read (one file, +5/−1, `tests/box/bounty/support.ts` helper argv only — no product code, no test expectation touched). CI environment reproduced locally: `git var GIT_COMMITTER_IDENT` in the neutralised env answers `Committer identity unknown`, and the master's argv shape (`safe.directory` + `-C`, no identity) fails a scratch merge with exactly that error — the same merge under the new argv (`-c user.name=bt-test -c user.email=bt-test@test.invalid` before caller args) lands green. Seam verified live: a call site's own `-c` still wins (makeRepo-shaped argv commits as `bt1-test`), and `git config --get user.name` inside a fixture repo stays unset — the injection is per-invocation argv, not config state, so a product git call still sees no ambient identity (product supplies `box-bounty` identity at its own commit call sites: answer.ts, github.ts, snapshot.ts). Independent audit of `tests/box/bounty/` for commit-creating verbs (`commit`, `merge`, `commit-tree`, `revert`, `cherry-pick`, `tag -a`, `stash`, `rebase`, `--amend`, `am`, `notes`) across `.ts`/`.mjs` helpers, direct `spawnSync('git'…)` call sites, and calls routed through the product helper (`objectGit`/`safeGit`/`gitOutcome` from `packages/box-bounty/git.ts`): every commit-creating call outside `support.ts`'s `git()` already carries its own `-c` (bt7-ux-fixture.mjs and measure-post.mjs local helpers, all `objectGit` commit-tree sites); product-helper calls in tests are read-tree/update-index/update-ref/diff/worktree — no identity needed; no tag/stash/rebase anywhere. Masked-assertion check: the suite's only author assertion is `%an = box-bounty` on a product-built commit-tree (github-history.test.ts:87) — product-supplied identity, unmaskable by the fixture; no test asserts identity is absent.
- Findings and limits: `plainGit` in `tests/box/bounty/ordinary-tree.ts` is the only identity-free spawn helper left, and it has no call sites — latent, not live; worth deleting or injecting if it is ever wired up. The two `.mjs` measurement scripts' local `git()` helpers are likewise not injected but every commit verb they issue carries `-c`. Reviewer ran only the two named files in the hostile env; the rest of the bounty suite ran under the recorded normal-env verify on the same SHA. Worker fields left blank by the cook; filled here by the pass.
- Merged: pending · Resources removed: scratch dirs `%TEMP%/bt7b-ci-home`, `%TEMP%/bt7b-ci-seam`, log `bt7b-ci-run.log` (temp, disposable)
- Reflect:
