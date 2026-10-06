# R2 preparation notes

- Base: `69bc6aa` (master tip = R2 brief commit); branch `wave/R2` from it.
- Request: remove the unused `repo` parameter of `r1Agreement` in `tests/box/package/r1-kitchen-stats.test.ts`, preserving every assertion, comment and behavior. Agreement data + submission instructions only — no request-specific code, generator, driver or test.

## Phase 1 triage (untouched base `69bc6aa`, wave/R2 checkout before code changes)

- Outcome check (owner context): `node scripts/pnpm.mjs exec tsc --ignoreConfig --noEmit --noUnusedParameters --target ES2023 --module NodeNext --moduleResolution NodeNext --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --verbatimModuleSyntax --esModuleInterop --skipLibCheck --types node tests/box/package/r1-kitchen-stats.test.ts` → exit 2, single diagnostic `TS6133: 'repo' is declared but its value is never read` at line 30:22. Red by exit code, for exactly this defect; no unrelated diagnostics. (Note: `tsc` on TS 6 requires `--ignoreConfig` when files are named; without it exits 1 with TS5112 — recorded so the recipient/owner runs use the approved argv, not a guess.)
- Behavior guard (full owner context): `node scripts/suite.mjs box --suite package tests/box/package/r1-kitchen-stats.test.ts` → exit 0, 3/3 tests pass in 11.8 s (scoped inner-loop run; log in resource root).
- Verdict: viable — guard green, outcome red by exit code on the untouched base. No manufactured base, no new request-specific test.

## Design sketch (before code; feature playbook)

Three shapes compared on paper:

| Shape | Change | Verdict |
| --- | --- | --- |
| A. New `commands` array on the agreement (descriptor: name/tool/args/cwd/context/role/timeoutMs) + a runner used by export (base run) and verify (scratch run) | Additive field; `evaluator` relaxed to optional so command mode needs no registered generator; legacy registry path untouched | Chosen — minimal, commands stay agreement data |
| B. Restructure the existing `checks` strings into objects | Rewrites a legacy field's meaning; ripples through manifest schema and every existing agreement/test | Rejected |
| C. Attach commands to `evaluator` entries | Keeps the registry coupling the wave removes; conflates generated files with executed commands | Rejected |

Runner/report ownership: `packages/box-package/commands.ts` owns execution (pinned tools: node = process.execPath, pnpm = caller invocation, tsc/vitest = `pnpm exec`; no shell, canonical cwd containment, bounded 4000-char log tail, per-check timeout ≤600 s). `export.ts` owns the untouched-base record (`box.json` `baseChecks` + `warnings`; red guard = ExportFailed preparation/environment gap; no red outcome = "cannot evidence change" warning). `verify.ts` owns post-patch re-execution of owner-context commands on the applied bytes in the scratch clone (non-pass = implementation-failure `command-check`); commands come from the agreement, not the submission or manifest.

## Implementation record

- Changed: `agreement.ts` (CommandCheckSchema, `commands`, evaluator optional + non-empty check-pair refine), new `commands.ts`, `export.ts` (base run + manifest record), `manifest.ts` (`commands`/`baseChecks`/`warnings`, declared argv only — no owner absolute tool paths), `verify.ts` (phase 5b command execution; outcome step skipped when no registered checks so a bare `vitest run` cannot sweep the whole suite), `index.ts` exports, `tests/box/package/command-checks.test.ts` (10 generic request-agnostic cases: boundary, runner, export base records, verify no-op/red and green paths).
- Scoped run: `node scripts/suite.mjs box --suite package tests/box/package/command-checks.test.ts` → 10/10 pass, 24.4 s, exit 0.
- Full box-package inner loop: see log in resource root (recorded below when finished).
- Request-preparation time (agreement + instructions only): a few minutes; generic development is the implementation above, timed separately. Lines of new check code: commands.ts ~95, test ~168.

## Pending (phase boundary)

- Named Box folder, pinned base SHA and hand-off record are produced after the scoped suite is green and the CLI is rebuilt; the recipient phase is a separate agent.
