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
- Missing/not measured: token counts, recipient time, owner acceptance time — all phase 2/3.
- Limits: blind-taster isolation on this host is instructional only; one run, no speed claim.
