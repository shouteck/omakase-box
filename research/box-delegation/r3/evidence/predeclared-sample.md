# R3 predeclared test sample — recorded BEFORE any test result

Repo: colinhacks/zod, pinned commit 0b216ef674e297ebe41d8bf902262e56f8755822 (2026-10-02T18:08:53Z), MIT.
Recorded: 2026-10-06T~04:55Z (UTC), before any test execution.

Denominator: 202 `*.test.ts` files under packages/ (excl. node_modules) at pinned commit.
Sample (4 files, contrasting):
1. packages/zod/src/v4/classic/tests/string.test.ts  — core stable string validators
2. packages/zod/src/v4/classic/tests/codec.test.ts   — newer codec feature area
3. packages/zod/src/v4/mini/tests/object.test.ts     — zod-mini variant surface
4. packages/zod/src/v4/classic/tests/issue-schema.test.ts — issue regression file (likely references GitHub issues)

Selection rationale: contrast stable core vs newer feature vs variant package vs issue-regression file. No results known at declaration time. This is a 4/202 sample; no inference to the whole suite.
