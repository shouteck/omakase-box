# K7-ci: repair dirty-checkout master verification

Milestone: K · Station: evidence, packaging · Base: `d4e0e99` · Branch: `wave/K7-ci` · Timebox: 60 minutes active cook work, report partial at expiry

## Outcome

Repair the latest red master Actions before performance work. START.md step 3 makes this correction the one wave this START.md K7 request may cook, then stops. GitHub run 37473156066 on A4 merge691cfd2 passed every named test step but acceptance exited3, UNCOMMITTED, because the tree was already dirty before verify began. Do not weaken clean-tree acceptance or hide generated/tracked changes.

## Scope

- Write only as root-cause evidence requires: scripts/verify.mjs, tests/kitchen/**, pnpm-lock.yaml. New focused kitchen regression files permitted. Fix the source of setup dirtiness rather than change Git status filtering. If the actual fix requires another path, report it before writing.
- Read: .github/workflows/verify.yml, scripts/{pnpm,workspace,suite,process}.mjs, workspace manifest, .gitignore, A4 package metadata and active kitchen records. Never .runtime/, .env*, secrets/, .execution/ or docs/legacy/.
- Do not touch product core, A4 fixture/check/agreement bytes, security settings, dependency versions, CI suite scope, caches owned by someone else, global config, comments or test expectations. No repository deletion. No new dependency or paid service; use already pinned local tooling and disposable wave-owned resources.

## Done when

- Reproduce the setup-dirties-clean-checkout fault in a disposable clone using actual pinned tooling, record exact changed paths/bytes and the setup step responsible. CI does not show which file was dirty; do not guess npm.cmd/Python failures, whose tests did not run in the hosted suite.
- Regression fails first, fix at source, regression green: standard frozen setup leaves tracked bytes and Git status unchanged. No lockfile/security-policy bypass, post-setup reset or ignore rule to mask source changes. Any root lockfile normalization uses pinned package manager with versions unchanged.
- Adopt kickoff inbox's applicable mechanism: dirty tree refuses before database/build/tests start, exits nonzero with useful non-secret diagnostic and is recorded honestly, not as an acceptable/reusable PASS. No implicit permission to log file contents. Acceptance remains clean committed SHA only. Broader attempt/cooldown counters stay with main K7 and must not grow this repair.
- One executed `node scripts/verify.mjs --full test:kitchen` passes on clean final candidate. Use scoped kitchen regressions before it. Verify Git HEAD/status immediately before invocation, keep Result notes elsewhere until after acceptance. Independent pass validates same-SHA record and attacks both clean-setup and dirty preflight; no fresh full rerun without stated doubt. CI suite has no host packaging tests; local repair coverage is named, do not claim full Linux CI success from Windows.

## Review lenses

- [x] Security: no clean-tree weakening or hidden tracked changes, no policy/config bypass, unrelated resources left alone.
- [x] User experience: dirty preflight is fast and actionable without dumping sensitive contents.
- [x] Measurement fairness: initial CI failure and every local attempt retained; executed versus reused distinguished; no invented Linux reproduction or performance gain.

## Notes for worker

Bug-fix playbook. Fix Root Causes means prove which setup file changed before fixing. Encode Lessons in Structure means refuse dirty state before costly work instead of repeating prose. Root workspace matches examples/* but lockfile has no A4 importers; that is a hypothesis, not a diagnosis. CI setup sequence: tooling npm ci, frozen pnpm install, Chromium setup, build, then verify. Existing verifier captures dirty once, runs184seconds of green work, finally rejects. Read and preserve inherited comments; add no comments to new code. Do not start agents, merge or push. Commit code before acceptance; leave waves/K7-ci.md Result uncommitted after verification for CTO transfer on master. Archive a compact command/result trail in Result, not a new documentation tree.

---

## Result

Accepted candidate `3300fed813a66c256813a735bca19b02fe5d614a`, cook `7604c4ac`, fresh pass `790ec0b1` PASS test-verified. Merged with --no-ff as `692ab73` and pushed master. Exact role models undisclosed; reviewer reports Subagent Default. Merged branch deleted; owned scratch removed and close found zero remaining approved temp items. No verify rerun on master. Hosted repair run37519849444 subsequently completed FAILURE. It passed the new start preflight and every named suite, then rejected the final Git-state check as UNCOMMITTED/exit3 after186s. Initial setup mutation is fixed, but Linux still does not reach accepted green. End-state changed paths versus unreadable status are not logged by the candidate, so the remaining cause is unknown. This is a partial CI repair, not full hosted success; no second wave started under this single-wave request.

Reflect: A4 introduced workspace package manifests without corresponding empty root lock importers; frozen install silently rewrote tracked bytes. Packaging lesson encoded in importer-parity regression and station card. Repeated dirty-run waste is now prevented by a preflight record before any database/test/build, plus end-status recheck. Broader repeat-run/cooldown accounting remains main K7, not claimed delivered.

- Reproduced in disposable clone `kitchen-k7-ci-clone` at 691cfd2: `npm ci --prefix scripts/tooling --ignore-scripts` left the tree clean; `node scripts/pnpm.mjs install --frozen-lockfile` (pnpm 10.34.5, all 14 workspace projects) rewrote `pnpm-lock.yaml` +4 lines — appended missing empty importers `examples/a4-multi-pkg: {}` and `examples/a4-npm-cli: {}`. A4 added both package.jsons under the `examples/*` workspace glob but never regenerated the lockfile. Frozen mode still backfills missing importers instead of failing.
- Root fix: ran pinned `pnpm install --frozen-lockfile` in the main checkout; identical +4-line normalization committed. No version, dependency or manifest changes.
- Preflight (encode-lessons-in-structure): verify.mjs now refuses immediately on a dirty snapshot — writes an honest UNCOMMITTED summary.json (steps [], notRun all, dirtyPaths listed), prints the porcelain status lines (paths only, no contents) and exits 3 before any database/build/test work. It also re-reads `git status` after the run so dirt created mid-run can no longer end in PASS; an unreadable status counts as not-clean.
- Regression: new `tests/kitchen/k7-ci-clean-checkout.test.ts` — (a) every `pnpm-workspace.yaml` package dir with a package.json must have a lockfile importer (red: exactly the two a4 dirs); (b) a fabricated repo with a dirty file makes verify exit 3, name the path, and record UNCOMMITTED with all steps notRun (red: exited 1 after running steps).
- Commands: red `node scripts/suite.mjs kitchen tests/kitchen/k7-ci-clean-checkout.test.ts` (2 failed: missing importers list; status 1 vs 3). Green same command (2 passed). Acceptance `node scripts/verify.mjs --full test:kitchen` once on clean 3300fed: `verify 3300fed PASS check=0 build=0 test:kitchen=0 db=embedded 123s`.
- Limits at review: Windows host proof; Linux had not yet completed. Later hosted run now establishes a clean start and green suites, but final Git-state refusal remains. Exact remaining path or status-read failure is unobserved. Packaging host-bound tests still not in CI scope. Scratch clone and approved temp items removed.

### Reviewer verdict — PASS (test-verified)

Commit `3300fed813a66c256813a735bca19b02fe5d614a`. Verify summary: `verify 3300fed PASS check=reused@2026-10-06T19-24-34-261Z-3300fed build=reused@2026-10-06T19-24-34-261Z-3300fed test:kitchen=reused@2026-10-06T19-24-34-261Z-3300fed db=embedded 8s` — my invocation `.kitchen/runs/2026-10-06T19-31-50-162Z-3300fed` (exit 0), reusing the underlying executed record `2026-10-06T19-24-34-261Z-3300fed` whose summary.json I read directly (full SHA match, dirty:false, PASS, all three step exits 0, logs present, new k7-ci test file listed as passing).

- Reproduced the fault myself: fresh clone at `691cfd2`, `npm ci` on tooling left tree clean, then pinned `pnpm install --frozen-lockfile` (v10.34.5) mutated `pnpm-lock.yaml` by exactly the committed +4 importer lines (`d42e1e7..52a351e`). Same install at `3300fed` reported "Already up to date" and left status clean. Independent importer-parity scan: 13 workspace package dirs, 0 missing importers.
- Dirty-preflight attacked on this real tree (modified waves file + untracked canary): exit 3 in 0s, named both porcelain paths, summary UNCOMMITTED with `steps:[]`, `notRun:[test:kitchen]`, no DB started. `reusableStep` requires `dirty===false`/`verdict===PASS`, so this record can never be reused.
- Post-run dirty attacked with a fabricated-repo fixture whose step writes a file mid-run: step exit 0 yet verdict UNCOMMITTED, exit 3 — the end re-read prevents a mid-run-dirty PASS that the old single-capture code would have printed. Second fixture deleting `.git` mid-run (end status unreadable) also ends UNCOMMITTED exit 3.
- Lens security: no clean-tree weakening — guard broadened (start refuse + end re-read); lockfile diff is importer lines only, no versions/security config touched; nothing unrelated mutated.
- Lens UX: refusal is instant, prints porcelain path lines only (no contents), exits 3 distinctly.
- Lens measurement fairness: initial CI failure and all attempts retained in record; executed vs reused distinguished in summary `reused@` fields; Linux claimed argued-not-observed — correct.
- Scope check: `git diff d4e0e99...3300fed` touches exactly the three permitted paths. New test asserts real outcomes (missing-importer list, exit 3, UNCOMMITTED summary fields) — it fails on a do-nothing implementation, which the red-first record confirms.
- Limits: Linux CI not observed from this Windows host; end-status-unreadable path proven by `.git` deletion, not an ACL-failure variant.
- Host: Windows, agent: Subagent Default (model unspecified).
