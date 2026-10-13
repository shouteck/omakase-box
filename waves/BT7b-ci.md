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

- Worker: · Reviewer:
- Commit:
- Verify:
- Verdict: · Level:
- Lenses:
- Method:
- Findings and limits:
- Merged: · Resources removed:
- Reflect:
