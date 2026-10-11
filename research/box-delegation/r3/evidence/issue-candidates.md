# R3 open-issue candidates — colinhacks/zod (read via `gh`, read-only)

AMENDMENT (post-review): the "~05:05Z / ~05:10Z" read stamps in this file were
projections and post-date the 05:04:13Z commit. No raw `gh` transcript was
retained, so the only committed bound is that the list was in the commit by
05:04:13Z; per-issue read times are not proven. States/URLs/dates were
re-confirmed OPEN by the reviewer's read-only `gh` queries at ~05:10Z.

Selection rule (from waves/R3.md): an unchanged EXISTING check must be red on the pinned base
0b216ef for the issue; guards green; no request-specific test/evaluator/driver written.

## Candidate 1 — #6637 (OPEN) https://github.com/colinhacks/zod/issues/6637
- Read time: before 05:04:13Z commit; exact time unrecorded (original "~05:05Z" retracted above). State: OPEN. Filed 2026-09-29.
- Expected: `.catchall(z.json())` must not error TS5115 under TS 7.1 nightlies (7.0.2 fine).
- Existing check: repo CI matrix includes typescript "latest" + typecheck; fix would alter $ZodRecordInternals in packages/zod/src/v4/core/schemas.ts.
- Tested: typescript@latest resolved to 7.0.2. Pinned nightly typescript@7.1.0-dev.20260929.1 exists (verified). `tsc --noEmit -p packages/zod/tsconfig.test.json` under that nightly produced no error output; the appended `TSC_EXIT=0` is a pipeline artifact. No existing file uses `.catchall(z.json())`, so NO existing command is shown defect-red. Reproducing needs a NEW use-site file = request-specific test code (banned).
- REJECTED: outcome command would not be an unchanged existing check.

## Candidate 2 — #6639 (OPEN) https://github.com/colinhacks/zod/issues/6639
- Read time: before 05:04:13Z commit; exact time unrecorded. OPEN, filed 2026-09-30. `mergeValues` uses `a === b`, so NaN intersection throws "Unmergable intersection"; repro `z.nan().and(z.nan()).safeParse(NaN)`. One-line fix in packages/zod/src/v4/core/util.ts (mergeValues).
- Existing check: latent bug; no existing test asserts NaN intersection acceptance (observed sample/suite output was green). Would need a NEW test — banned.
- REJECTED: no unchanged existing check was shown defect-red.

## Candidate 3 — #6641 (OPEN) https://github.com/colinhacks/zod/issues/6641
- Read time: before 05:04:13Z commit; exact time unrecorded. OPEN, filed 2026-10-01. z.record skips an own `__proto__` key without running the key schema (follow-up to #6220/#6221). Editable: record parser in v4 core/classic.
- Existing check: latent; needs new test. REJECTED on the same ground.

## Candidate 4 — #6621 (OPEN) https://github.com/colinhacks/zod/issues/6621
- OPEN 2026-09-22. Non-English locales lose Infinity/-Infinity in "invalid type" messages. No existing locale test was identified asserting those tokens; suspected latent.
- REJECTED: no unchanged existing check was shown defect-red.

## Candidate 5 — #6648 (OPEN) https://github.com/colinhacks/zod/issues/6648
- OPEN 2026-10-04. toJSONSchema emits non-standard format values since 4.6.0. Fix likely changes existing expected values => editable test = weakening risk; also likely needs new assertions.
- REJECTED: no unchanged existing check was shown defect-red.
