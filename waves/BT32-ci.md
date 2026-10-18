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

- Worker: cook on `wave/BT32-ci` (Windows host) · Reviewer: fresh Devin `box-reviewer` agent (this session); host model identity not disclosed; no model or Git settings changed. Reviewed candidate `a9c4729`; wave tip `4790157` = candidate + Result record only (waves/BT32-ci.md, confirmed via `git show --stat`).
- Commit: `a9c4729` — "BT32-ci: scale-gate malformed-ref seed carries its own git identity" (one line in `tests/box/bounty/bt32.test.ts:360`; this Result committed on top)
- Verify: `verify a9c4729 PASS check=0 build=0 test:box-bounty=0 db=none 938s` — run dir `.kitchen/runs/2026-10-18T08-25-16-294Z-a9c4729`, 61 files / 690 passed / 1 skipped. **Reused by the pass**: `summary.json` names sha `a9c47291bc60…`, clean tree, all three steps exit 0; nothing specific to doubt, and a 938 s re-run on the same SHA proves nothing new.
- Verdict: **PASS** · Level: **test-verified**
- Identity-stripped before/after: temp bare repo, `GIT_CONFIG_NOSYSTEM=1` + `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_SYSTEM` → empty file. Before (unfixed shape): `git -C r.git commit-tree 4b825dc… -m empty` → `Author identity unknown` / `fatal: unable to auto-detect email address`, exit 128. After (fixed shape): same call with `-c user.name=x -c user.email=x@x` → commit `79c6a5f`, exit 0. Stronger end-to-end proof: `node scripts/suite.mjs box --suite bounty tests/box/bounty/bt32.test.ts` under the same stripped env — all 14 tests pass (72.5s).
- Sweep of raw git calls (what was checked, what was found): enumerated all 66 `execFileSync`/`spawnSync('git', …)` sites in `tests/box/bounty/` plus every `git()`/`objectGit()`/fixture-runner call that can create a commit (`commit`, `commit-tree`, `cherry-pick`, `merge`, `rebase`, `am`, `fast-import`). Found: `bt32.test.ts` L142/L177 `gitIn` and L205 `commitEvent` already carried the flags — the L360 `commit-tree` was the lone omission (fixed). `bt32-pass-toctou.test.ts:42` `commit-tree` carries them; `bt32-pass-probes.test.ts:38,148` runners carry them; `bt21.test.ts:124` `merge --no-commit` carries them anyway; `github.test.ts:221` and all `github-history.test.ts`/`objectGit` commit-tree call sites carry them; `measure-post.mjs:63,76` carry `user.name=box-bounty`. `fast-import` calls (`bt32.test.ts:342`, `github-history.test.ts:316`) embed `committer`/`author` lines in the stream. Every `git(repo, …)` `commit`/`merge`/`cherry-pick`/`commit-tree` call routes through `support.ts:94`, which injects `-c user.name=bt-test -c user.email=bt-test@test.invalid`. `update-ref`, `push`, `fetch`, `clone`, `ls-remote`, `hash-object`, `mktree`, `read-tree`, `checkout-index`, `diff`, `show-ref`, `rev-parse`, `cat-file`, `check-ignore`, `ls-files` create no commit objects — no identity needed. Non-issues worth noting: `ordinary-tree.ts` `plainGit` injects nothing by design ("Git as an agent types it") and currently only runs `diff` — a future commit-creating call through it would reintroduce this flake; product-side commit creation carries its own `box-bounty` identity (`chain.ts:127`, `snapshot.ts:60`, `answer.ts:276`, `publish-plan.ts:301`).
- Pass's own evidence (all run on this host, on `a9c4729` + `4790157` checked out):
  - `git diff master...a9c4729` = exactly the one-line change in scope (`-c user.name=x -c user.email=x@x` inserted before `-C`, matching L142/L177/L205). Nothing else touched; `4790157` edits only the wave file.
  - Independent identity-stripped repro: fresh temp bare repo, `GIT_CONFIG_NOSYSTEM=1` + `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_SYSTEM` → empty file. Unfixed `commit-tree` shape → `Author identity unknown` / `fatal: unable to auto-detect email address (got 'shout@DESKTOP-6U13DFA.(none)')`, exit 128. Fixed shape → commit `75079ea`, exit 0. The cook's before/after claim is real.
  - Independent stripped-env scoped run (my own, 18 Oct ~16:46): `node scripts/suite.mjs box --suite bounty tests/box/bounty/bt32.test.ts` → 14/14 tests pass, 73.0 s, exit 0, zero `identity unknown` strings in the log — the file is green with no Git identity at any level, not just at the fixed line.
  - Independent sweep: enumerated every `execFileSync`/`spawnSync('git', …)` site in `tests/box/bounty/` (direct-literal calls) plus every helper (`support.ts` `git()` injects `bt-test` identity at :94; `recreateSnapshot`'s runner only issues `read-tree`/`checkout-index`; local runners in `bt12-install`, `bt8a`/`bt8b` fixtures, `bt14`/`bt17`/`measure-post`, `bt7-ux-fixture` either inject or carry call-site flags; `objectGit` commit-tree call sites all carry flags; both `fast-import` streams embed `committer` lines at `bt32.test.ts:336` and `github-history.test.ts:313`). Found no second omission — the cook's list is accurate. One wording nit: the Result says `plainGit` "currently only runs `diff`" — it actually has **zero callers** today (`bt7.test.ts:133` is an inline `spawnSync` diff, not `plainGit`); conclusion unchanged, and the "future wave could reintroduce" warning stands.
  - Review lenses: none ticked — correct; a test-only CI fix with no product-surface change.
- Merged: `f23125a` (`--no-ff`, pushed); `wave/BT32-ci` branch deleted. · Resources removed: repro bare repo + empty gitconfig (`/tmp/tmp.UITjnY96QE`), scratch logs (`/tmp/bt32-scoped.log`, `/tmp/verify-bt32ci.log`), suite temp dirs (`$TEMP/box-bt1-*`); pass's own repro repo + stripped-env scoped log (`/tmp/bt32ci-review-scoped.log`) removed after capture; tree clean (`git status --porcelain` empty).
- Reflect: the file's own convention made the fix one line; the brief's mechanical sweep was the real work — `plainGit` and the fast-import committer-lines are the two places a future wave could reintroduce this class. CTO sorted it station-ward: the identity rule now sits on `kitchen/stations/packaging.md` so the next cook sweeps new raw git calls by habit.
