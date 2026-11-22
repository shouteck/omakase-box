# CI-speed — parallel hosted verification

Station: Evidence. Owner request: split CI without reducing coverage on any OS.

## Plan

1. Partition bounty files with validated Vitest shards (Windows four, Linux/macOS two).
2. Keep kitchen acceptance and platform in independent per-OS jobs, retaining diagnostics and browser requirements; cache pnpm and browsers.
3. Run affected kitchen guards, all four bounty shards and YAML validation, then commit and push the requested devin branch. No PR or merge.

## Done when

- Affected `test:kitchen` guards pass; shard file counts sum to the full bounty file count.
- Workflow parses and retains all three OS images, frozen installs, typecheck/build/lint, browser-backed tests and reports.
- Branch pushed; hosted run id reported (not acceptance until green).

## Changed expectations

None: existing guarded properties are preserved.

## Result

Host: Devin Linux. Model identity unavailable. No PR or merge requested.

- Build: `node scripts/workspace.mjs build` passed (57 modules transformed).
- Affected kitchen files selected by `// reads:` headers for suite.mjs/verify.yml: `14 passed (14)`, `97 passed (97)` in 16.75s.
- Initial kitchen run: k6-scope-budget failed because this checkout had no `.kitchen/runs`; created that ignored runner directory and reran successfully. No test expectation changed.
- `bt12-package.test.ts`: `1 passed (1)`, `14 passed (14)` in 2.08s.
- Actual bounty executions, `node scripts/suite.mjs box --suite bounty --shard i/4`, neutral HOME: all exit 0. Test Files: 31 + 31 + 31 + 31 = 124. Tests: 370 passed / 4 skipped; 300 / 5; 305 / 10; 496 / 0. Durations: 44.26s, 37.52s, 47.69s, 51.97s. All original host skips remain.
- Full inventory via Vitest list: 124 files. A separate attempt to use `vitest list --shard` for an overlap proof returned all 124 files per shard (list does not partition); not used as shard execution evidence.
- YAML parsed with installed transitive yaml@2.9.1: bounty, kitchen, platform, audit, install-node22. Eight bounty entries; five total macOS jobs including install-node22. Playwright cache-key step executed: `version=1.63.0`.
- Platform needs Chromium (`pages.test.ts`) and built CLI (`commands.ts`); both retained explicitly. Bounty has no browser imports and retains Python. Platform's runner builds Next itself.
- Diff checked against requested scope; audit and install-node22 unchanged. No existing test expected outcome changed. Hosted acceptance pending push/run; no measured speedup claimed before hosted completion.
- Principle read: prove-it-works — real shard executions, not just matrix inspection.
- Reflection: the fresh checkout lacked the run directory assumed by a scoped k6 test; full hosted verify creates it. No new kitchen rule needed.
