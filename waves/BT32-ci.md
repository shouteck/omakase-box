# BT32-ci: the scale-gate's malformed-ref seed carries its own Git identity

Milestone: BT · Station: packaging · Base: master at dispatch · Branch: `wave/BT32-ci` · Timebox: 30 minutes; at expiry the cook stops and reports where it is

**Brief.** Written by the CTO on 18 October 2026. Hosted run `39110515908` on master (`3ef7bf7`) went red: `tests/box/bounty/bt32.test.ts:360` calls `git commit-tree` through raw `execFileSync` with no author identity, and the GitHub-hosted runner has no `user.name`/`user.email`, so Git refused ("Author identity unknown"). The same line passed locally because the dev account has a global identity — a latent flake, not a product defect.

## Why

Every other commit-creating call in the file already carries `-c user.name=x -c user.email=x@x` (lines ~142, ~177, ~205), and the shared `git()` helper in `tests/box/bounty/support.ts` injects identity for exactly this reason. The scale-gate test's `commit-tree` seed for the malformed ref is the lone omission.

## Outcome

`test:box-bounty` is green on a machine with no Git identity configured at any level, and stays green on the hosted run.

## Scope

- Write: `tests/box/bounty/bt32.test.ts` — the `commit-tree` `execFileSync` call at line ~360 only.
- Do not touch: product code, `github-fixture.ts`, `support.ts`, any assertion or expected value.

## The change

Add `'-c', 'user.name=x', '-c', 'user.email=x@x'` to that call's argument list (with the other `-c` flags, before `-C`), matching the file's own convention. Then **mechanically sweep**: enumerate every raw `execFileSync`/`spawnSync` git call in `tests/box/bounty/` that creates a commit (`commit`, `commit-tree`, `cherry-pick`, `merge`, `rebase`, `am`) and confirm each carries identity flags or routes through the `git()` helper that injects them. `fast-import` streams embed a committer line and `update-ref`/`push`/`fetch` need none. List what the sweep found in the Result — a list from memory is exactly how this one was missed.

## Done when

- `node scripts/verify.mjs test:box-bounty` exits 0 on the final commit.
- Reproduce before fixing: run that `commit-tree` shape in a temp repo with identity stripped (`GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_SYSTEM` pointing at an empty file) and show the "Author identity unknown" refusal; show the fixed call succeeding under the same stripped environment. Record both in the Result.

## Review lenses

- [ ] **Security:** not applicable.
- [ ] **User experience:** not applicable.
- [ ] **Measurement fairness:** not applicable.

## Notes for the worker

- Bug-fix playbook. Do not edit `waves/BT32-ci.md` while a verify runs.
- The hosted failure is at `gh run view 39110515908 -R shouteck/omakase-box`.

---

## Result

- Worker: · Reviewer:
- Commit:
- Verify:
- Verdict: · Level:
- Identity-stripped before/after:
- Sweep of raw git calls (what was checked, what was found):
- Merged: · Resources removed:
- Reflect:
