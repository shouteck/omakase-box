# R1 preparation notes

- Base: `e412e08` product base; branch `wave/R1` created from `6f11f27` (master tip, includes the R1 brief).
- `.mjs` selection: proven on the existing engine — `ts.resolveModuleName('./process.mjs', ...)` resolves, and `deriveSelection` on the R1 agreement returns both `scripts/kitchen-stats.mjs` (editable) and `scripts/process.mjs` (runnable) with zero gaps. No schema or engine change was needed.
- Contract: `tests/kitchen/kitchen-stats-no-usage.test.ts` and the `kitchen-stats-no-usage` generator/owner-check pair fail on the unmodified script (Usage section printed) and on a blank/no-output script.
- Export: `node research/box-delegation/r1/driver.mjs` pins the agreement to HEAD and runs the real `box export` into a directory outside the checkout.
## Phase 1 record (2026-10-05, ~07:27–07:36 local)

- Preparation commit: the `wave/R1` HEAD at export time (branched from master tip `6f11f27`; product base `e412e08`). The authoritative pin lives in the pinned agreement and `box.json` `baseCommit`; earlier SHAs `b7b6389`/`a8c6fae` differ only in this notes file.
- Exported Box: `C:\Users\shout\Desktop\Projects\r1-box-kitchen-stats` (kept for the recipient — explicit phase exception); pinned agreement `C:\Users\shout\Desktop\Projects\r1-agreement.pinned.json`.
- Disclosure: 2 owner files shipped (`scripts/kitchen-stats.mjs` editable, `scripts/process.mjs` runnable) out of 1834 inventory files → share 0.0011 (0.11% of the source-root inventory, sourceRoot `.` = whole repo denominator).
- Exported box self-check in the box folder: `pnpm install --frozen-lockfile` OK (1.6 s), `pnpm exec tsc --noEmit` exit 0, `pnpm exec vitest run evaluator/kitchen-stats-no-usage.test.ts` exit 1 → 2 failed / 2 passed, both failures the Usage assertions on the unmodified script. Blanked editable also fails (proved in tests/box/package/r1-kitchen-stats.test.ts).
- Verify: `node scripts/verify.mjs --full test:box-package test:kitchen` → `verify b7b6389 FAIL check=0 build=0 test:box-package=0 test:kitchen=1 db=embedded 245s`. All green except the intended red contract: tests/kitchen 22 passed / 2 failed (the no-Usage assertions); box/package incl. the new r1 test 3/3.
- Failed attempts: (1) first r1 box test asserted `share < 1` — mini repo is only the closure so share is legitimately 1; assertion corrected to shippedOwnerFiles===2. (2) `/tmp` paths not visible to Windows tsc — moved generator typecheck scratch under `.kitchen/`. No other failed attempts.
- Missing/not measured: token counts, recipient wall time, owner acceptance time — see below; recipient effort split (25% setup / 35% context / 40% change+verification) is self-reported, not measured.
- Limits: blind-taster isolation on this host is instructional only; one run, no speed claim.

## Phase 2/3 record (2026-10-05, ~07:36–07:56 local)

- Recipient: fresh box-recipient `abbc9212`, Windows/Git Bash, saw only `C:\Users\shout\Desktop\Projects\r1-box-kitchen-stats`. Changed only `src/scripts/kitchen-stats.mjs` (Usage regex/field and section removed); sealed `submission.json` via `node box/submit.mjs`. Reported tsc exit 0 and evaluator 4/4. Toolchain: corepack pnpm 10.34.5 / node 24.11.0 (pnpm not on PATH). No questions, no interventions, no missing context reported. Isolation instructional, not enforced.
- Submission: `C:\Users\shout\Desktop\Projects\r1-box-kitchen-stats\submission.json`; applies: `scripts/kitchen-stats.mjs` changed, sha256 `2b79e471…3117a1`, 17502 B (baseline blob 17940 B, sha256 `319bee60…252ed`).
- `box submit` (validateSubmission): accepted, baseCommit `016c0d37` = agreement pin, baseSource agreement.
- `box verify` (owner, real CLI): verdict **pass**, attemptSha256 `e993a51644a7`, checks install/compile/outcome all pass; scratch merge branch `box-verify/r1-kitchen-stats-v1-e993a51644a7`, commit `59c3b705afe875cda8d57f67545b50ce79cc0dd3`, kept clone `C:\Users\shout\AppData\Local\Temp\box-verify-WAthdZ\owner`.
- Negative: pristine box re-exported to `%LOCALAPPDATA%\Temp\r1-noop-box`, sealed unchanged (changed: 0); owner verify → verdict fail, `implementation-failure`/`outcome`, named check `tests/box-owner-checks/kitchen-stats-no-usage.test.ts` (Usage still printed). Attempt sha `4a2a7a61…41e53`.
- Integration: `git show 59c3b70:scripts/kitchen-stats.mjs` written to `scripts/kitchen-stats.mjs`; sha256 matches the artifact (`2b79e471…`). No hand copy.
- Failed attempts this phase: (1) post-integration `verify 79e029a FAIL test:box-package=1` — the phase-1 r1 test still asserted the unmodified script prints Usage; corrected to assert green on the integrated script plus Usage-printing and blank negatives. (2) verify log tail polls returned empty while the run was in flight — reran with output to file.
- Final verification: `node scripts/verify.mjs --full test:box-package test:kitchen` on `cbb122f` → `verify cbb122f PASS check=0 build=0 test:box-package=0 test:kitchen=0 db=embedded 285s`; run dir `.kitchen/runs/2026-10-05T23-46-53-275Z-cbb122f`. All steps executed this invocation (none reused); kitchen suite 24/24, box/package suite all green.
- Disclosure detail: shipped owner bytes = kitchen-stats.mjs 17940 B + process.mjs (runnable context) = 2 files of 1834 inventory (sourceRoot `.`, inventory excludes node_modules/, dist/, .git/, .kitchen/, .runtime/, secrets/, .execution/, docs/legacy/, coverage/, data/, test-results/, playwright-report/, __pycache__/).
- Stage timestamps (local): export 07:29; box self-check 07:30; phase-1 verify FAIL 07:30–07:36; submit accepted ~07:37; owner verify pass 07:38; no-op rejection 07:39; integration commit 79e029a ~07:44; test fix + commit cbb122f ~07:47; final verify PASS 07:46–07:56.
- Still missing: recipient tokens/wall-clock (self-report only), reviewer pass — pending.
