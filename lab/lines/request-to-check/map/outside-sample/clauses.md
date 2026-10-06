# Outside sample: the clauses

Five open issues of `colinhacks/zod` at commit `0b216ef`, as recorded by the kitchen's R3 cook in `research/box-delegation/r3/evidence/issue-candidates.md` and `research/box-delegation/r3/READINESS.md`. Nothing here was fetched by the lab. The issue texts themselves were not kept by the kitchen, so each clause below is the cook's summary, not the reporter's wording.

A second labeller should be given this file and `../GUIDE.md` only, and must not open `labels-researcher.csv` or `RESULT.md` first.

One clause per issue: the kitchen recorded one expected behaviour for each.

## Z6637

Issue #6637, filed 2026-09-29. Recorded as:

> Expected: `.catchall(z.json())` must not error TS5115 under TS 7.1 nightlies (7.0.2 fine).

Also recorded: the fix would alter `$ZodRecordInternals` in `packages/zod/src/v4/core/schemas.ts`. No existing file in the repository uses `.catchall(z.json())`. The repository's own compiler is typescript ~5.5.4; the nightly is not something the repository pins.

## Z6639

Issue #6639, filed 2026-09-30. Recorded as:

> `mergeValues` uses `a === b`, so NaN intersection throws "Unmergable intersection"; repro `z.nan().and(z.nan()).safeParse(NaN)`. One-line fix in packages/zod/src/v4/core/util.ts (mergeValues).

The expected behaviour is not written down in the record; it is implied that the parse should succeed.

## Z6641

Issue #6641, filed 2026-10-01. Recorded as:

> z.record skips an own `__proto__` key without running the key schema (follow-up to #6220/#6221). Editable: record parser in v4 core/classic.

No reproduction is recorded.

## Z6621

Issue #6621, filed 2026-09-22. Recorded as:

> Non-English locales lose Infinity/-Infinity in "invalid type" messages.

Which locales, and the exact expected messages, are not recorded.

## Z6648

Issue #6648, filed 2026-10-04. Recorded as:

> toJSONSchema emits non-standard format values since 4.6.0.

Which values, and what should be emitted instead, are not recorded. Also recorded: a fix would likely change expected values in existing tests.
