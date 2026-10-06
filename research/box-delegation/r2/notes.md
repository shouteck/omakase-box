# R2 preparation notes

- Base for development: `69bc6aa` (master tip = R2 brief); branch `wave/R2`. Prep SHA the Box pins: `6c0ee45`.
- Request: remove the unused `repo` parameter of `r1Agreement` in `tests/box/package/r1-kitchen-stats.test.ts`, preserving every assertion, comment and behavior. Preparation adds agreement data + submission instructions only — no request-specific code, generator, evaluator, driver or test.

## Phase 1 triage (untouched base `69bc6aa`)

- Outcome check (owner context): `node scripts/pnpm.mjs exec tsc --ignoreConfig --noEmit --noUnusedParameters --target ES2023 --module NodeNext --moduleResolution NodeNext --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --verbatimModuleSyntax --esModuleInterop --skipLibCheck --types node tests/box/package/r1-kitchen-stats.test.ts` → exit 2, single diagnostic `TS6133: 'repo' is declared but its value is never read` at line 30:22. Red by exit code, for exactly this defect; no unrelated diagnostics. (`tsc` on TS 6 exits 1 with TS5112 unless `--ignoreConfig` is passed when files are named — that is why the approved argv carries it.)
- Behavior guard (full owner context): `node scripts/suite.mjs box --suite package tests/box/package/r1-kitchen-stats.test.ts` → exit 0, 3/3 tests pass in 11.8 s (scoped inner loop; evidence/guard-base.log).
- Verdict: viable — guard green, outcome red by exit code on the untouched base. No manufactured base, no request-specific test.

## Design sketch (before code; feature playbook; architect/arena skipped — single-worker scoped change, principle leaves below)

| Shape | Change | Verdict |
| --- | --- | --- |
| A. New `commands` array on the agreement (name/tool/args/cwd/context/role/timeoutMs) + a runner used by export (base run) and verify (scratch run) | Additive field; `evaluator` relaxed to optional so command mode needs no registered generator; legacy registry path untouched | Chosen — minimal, commands stay agreement data |
| B. Restructure the existing `checks` strings into objects | Rewrites a legacy field's meaning; ripples through the manifest schema and every existing agreement/test | Rejected |
| C. Attach commands to `evaluator` entries | Keeps the registry coupling the wave removes; conflates generated files with executed commands | Rejected |

Ownership: `packages/box-package/commands.ts` owns execution (pinned tools — node = process.execPath, pnpm = caller invocation, tsc/vitest = `pnpm exec`; no shell; canonical-path cwd containment; 4000-char bounded log tail; per-check timeout ≤600 s; timeout/error are named results, never pass). `export.ts` owns the untouched-base record (`box.json` `baseChecks` + `warnings`; red guard = ExportFailed; no red outcome = "cannot evidence change" warning). `verify.ts` owns post-patch re-execution of owner-context commands on applied bytes in the scratch clone (non-pass = implementation-failure `command-check`); commands come from the agreement, not submission or manifest bytes.

## Implementation record

- Changed: `agreement.ts` (CommandCheckSchema, `commands`, evaluator optional + non-empty refine), new `commands.ts` (~95 lines), `export.ts` (base run + manifest record), `manifest.ts` (`commands`/`baseChecks`/`warnings`; declared tool/argv recorded, no owner absolute tool paths), `verify.ts` (phase 5b; outcome step skipped when no registered checks so a bare `vitest run` cannot sweep the suite), `index.ts`, `tests/box/package/command-checks.test.ts` (~168 lines, 10 request-agnostic cases).
- Scoped green: `node scripts/suite.mjs box --suite package tests/box/package/command-checks.test.ts` → 10/10, 24.4 s, exit 0 (evidence/command-checks.log). Full package inner loop: 12 files / 80 tests, 165.8 s, exit 0 (evidence/box-package-suite.log). One heavy job at a time; no full `verify.mjs` run (the reviewer owns `--full`).
- Failed attempts: (1) first `tsc` triage exited 1 with TS5112 — TS 6 wants `--ignoreConfig` for file lists; argv corrected and recorded. (2) First export rejected `checks.0` over the 256-char bound — agreement descriptions shortened (commit 6c0ee45). (3) Export then refused the dirty sourceRoot (the uncommitted agreement edit) — committed, re-exported clean.

## Request preparation (agreement data + instructions, separate from generic development)

- `research/box-delegation/r2/agreement.json` (3074 B): entrypoint + editable mapping of the real test file, declaredDependencies for the closure (typescript/vitest/zod), exclusions matching R1's, two command descriptors — `unused-param-outcome` (tsc --noUnusedParameters, role outcome, owner context) and `r1-behavior-guard` (vitest run of the same file, role guard, owner context) — and submission instructions. Zero request-specific package code.
- Preparation minutes: ~10 (agreement drafting + the two boundary corrections above, including the failed export attempts). Generic development: the implementation record above (~70 min inside the 90-min ceiling, shared with reading/triage).

## Export (real CLI, `node packages/box-cli/dist/cli.js export` after rebuilding dist with vite ssr)

- Named Box folder (kept for the folder-only recipient — explicit phase exception): `C:\Users\shout\Desktop\Projects\r2-box-unused-param`; pinned agreement `research/box-delegation/r2/agreement.json`; baseCommit `6c0ee459339dcbcdc8b6c52430ecb74a9997aa33`.
- 25 files: the editable test (`src/tests/box/package/r1-kitchen-stats.test.ts`), `support.ts`, and the reachable packaging closure (`src/packages/**`, 18 runnable files); no evaluator file (command mode). Disclosure: 20 owner files of 1852 inventory → share 0.0108 on the live filesystem denominator (sourceRoot `.`; R1's tracked-vs-filesystem caveat applies — the tracked non-excluded denominator is smaller).
- Base check record in box.json: `unused-param-outcome` result fail exit 2 (TS6133 line 30:22, ~2 s), `r1-behavior-guard` result pass exit 0 (~13 s); warnings [].
- Box self-check on a clean copy outside the checkout: `pnpm install --frozen-lockfile` 41 packages in 1.5 s, `pnpm exec tsc --noEmit` exit 0 (evidence/box-selfcheck.log). The named folder itself was left untouched (no node_modules) for the recipient.
- Recipient recipe: Node >=24.11.0 <25 + pnpm 10.34.5; `pnpm install --frozen-lockfile`, edit the one editable file, `node box/submit.mjs`. Owner commands in box.json are plain `pnpm exec …` argv — no owner absolute paths.

## Gaps and limits (phase boundary)

- Recipient-context commands exist in the schema/runner but this request declares none; their execution path at export (the box is not installed at export time) is undeveloped — named gap, recorded, not claimed.
- Owner verify executes agreement commands only; the recorded `baseChecks` travel in box.json for the recipient and reviewer, but verify does not re-check that a green post-patch outcome was red at base — it relies on the export-time record (which cannot be forged by the submission).
- Guard source is visible inside the editable file itself (the wave anticipated this); the outcome check, not secrecy, is the delegated contract.
- No CI wait; no push; no merge. Owner-side verify end-to-end on this request awaits the recipient's submission (phase 2).
- Resource inventory: temp resource root `%TEMP%\kitchen-r2-cook` (logs + one box self-check copy) — deleted at phase close after copying logs to `research/box-delegation/r2/evidence/`. Kept: `r2-box-unused-param/` (named Box for the recipient) and this checkout's rebuilt `packages/box-cli/dist` (gitignored build output). No ambiguous old temps touched (K6 data untouched per STATUS).

## CTO correction round (commits 0767aac, 41fdf38 — Git timestamps 11:42/11:44; base 69bc6aa 11:16, so active cook ~30 min, not the earlier guessed 70)

- `checks` remain owner-readable descriptions only; executable truth is `commands` (tool/argv/cwd/context/role). A named gap is now recorded in `warnings` for every agreement: `N legacy 'checks' entr(ies) are owner-readable descriptions … no base results recorded` — legacy evaluator-only agreements still export (regression-covered), they are just not claimed as executed.
- Owner-context checks now run in a disposable `git clone --local` at the pinned base (`mkdtemp box-base-*`, removed after) — approved commands never execute in the real owner repo. The pinned local toolchain (`scripts/tooling`) is materialized into the clone when present: it is installed, not committed, and the R1 guard's `requirePnpmTooling` failed without it (evidence/r2-export-tooling-gap.log — a real runtime-path gap surfaced by execution, then fixed generically). `verify` materializes the same tooling into its scratch clone before running declared commands.
- Recipient-context checks run at export on the emitted folder copied to a temp run dir and installed from its own lockfile (install only when a pinned pnpm tool is declared). A red recipient guard — e.g. a command naming a file the Box never shipped — refuses export even with owner checks green.
- Nonempty `--out` is refused before any command executes; the folder is emitted to a sibling staging dir and renamed into place only after all base checks are recorded, so a failed export leaves no partial Box and nothing is clobbered.
- Recipient recipe stays generic: box.json carries the declared `commands` (pinned tool + argv + cwd); the recipient runs them with `pnpm exec`/`node` in the installed folder — no in-box runner was needed (the tools are already the recipe).
- New/updated generic cases (13 total, evidence/command-checks.log, 26.9 s): recipient-context base pass/fail record, recipient guard refusal via missing runtime path, legacy evaluator-only export with named gap, plus the prior owner/base/verify cases. Scoped export+submission regression: 22/22 (evidence/export-regression.log). No full verify run — reviewer owns `--full`.

## Re-export (pinned prep SHA 41fdf38)

- Command: `node packages/box-cli/dist/cli.js export research/box-delegation/r2/agreement.json --repo . --out ../r2-box-unused-param` → exit 0 (evidence/r2-export.log). Named folder `C:\Users\shout\Desktop\Projects\r2-box-unused-param` re-created (prior one was ours, deleted; no K6 dirs touched).
- Base results in box.json — all four declared checks on the untouched base:
  - owner `unused-param-outcome` (outcome): **fail**, exit 2, ~3 s — TS6133 'repo' unused at tests/box/package/r1-kitchen-stats.test.ts(30,22).
  - owner `r1-behavior-guard` (guard): **pass**, exit 0, ~15 s.
  - recipient `package-typecheck-guard` (guard): **pass**, exit 0, ~3 s (installed staged Box, `tsc --noEmit` on the package tsconfig).
  - recipient `package-unused-param-outcome` (outcome): **fail**, exit 2, ~3 s — TS6133 at src/tests/box/package/r1-kitchen-stats.test.ts(30,22).
  - warnings: the named legacy-strings gap (2 entries). No all-green warning — both outcome checks are red.
- Disclosure: 20 owner files / 1857 inventory → share 0.0108 (live filesystem denominator, sourceRoot '.').
- Real repo left unchanged by export: `git status --porcelain` clean after the run; all command execution happened in the disposable clone and staged copy.
- Remaining gaps: owner verify end-to-end on this request still awaits the recipient submission; install-in-clone cost (~minutes, cold workspace install) is recorded but not optimized; recipient-context commands at owner verify are not run (owner verify = owner context only, by design).
