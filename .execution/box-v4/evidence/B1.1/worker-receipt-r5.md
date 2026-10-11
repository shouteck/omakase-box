# W002 / B1.1 — worker receipt r5 (bounded revert of r4 digest change)

Worker `e44008a7`. Authority unchanged: r1 sha256 `44e984be…`; r2 `Approve` observed `2026-10-04T15:50:36.0926937Z` bound to `1ce91643…`. Product remains **not_accepted**; retry count unchanged (1 of max 2).

## Action

Reviewer `77c88b35` (`relay-review-r2.json`) determined their earlier "actual expanded argv" digests were artifacts of their own /tmp instrumentation (the capture patch rewrote `./dist/*.js` relative imports inside the template strings). The r3 manifest digests were correct all along.

Reverted exactly two fields in `scripts/box-verification/fixture-command-manifest.json`:

- `persistence.private-api.sourceSha256` → `8ca8183b806def4d76fd48135811a207d33ece39e67e857e18c56cf5783aaaae`
- `persistence.external-api.sourceSha256` → `63e46a09a824f2496d346e75a0e8c90fb412d5737aece50b078e0c6225b97954`

Resulting file sha256 `94fa84a95f79132e6808aaebf3a2ee5812142ce517b3b82f571c92da60b6f6c7` — byte-identical to the r3 manifest. This also resolves the discrepancy disclosed in r4: the worker static-template recomputation (raw private template `8ca8183b`; external expanded with `singleUnitContract()` → `63e46a09`) was correct, and the reviewer's captured argv had been contaminated by the instrumentation patch.

## Re-verification inside `w002-b11-ws` (staged == host == `94fa84a9…`, confirmed by in-container sha256sum)

| Command | Exit | Result |
|---|---|---|
| manifest self-check (JSON parse, unique ids, `@SOURCE@`↔64-hex digest pairing) | 0 | 13 entries consistent |
| `vitest run tests/box/auth/fixture-transport.test.ts` | 0 | 1 file, 7 tests passed |
| `test:box-auth` | — | not rerun; bytes identical to the r3 manifest that passed 18/18 |

## Boundaries honored

- No other product/tooling/source changes; only that one file re-staged.
- No git stage/commit/push/config/reset.
- Host relay, fixture services, browser download, host tests and Docker daemon forwarding: none executed — relay remains unauthorized.
- All five W002 resources untouched; no cleanup/reuse.
- All prior evidence preserved unchanged: r1 `candidate-manifest.json`, `candidate-manifest-r3.json`, `candidate-manifest-r4.json`, receipts r2/r3/r4, `relay-review.json`, `relay-review-r2.json`, `browser-manifest.json`, `setup-recipe.md`.

## Status

Manifest bytes equal the r3-verified content and are ready for quick independent confirmation by `77c88b35`. Standing items unchanged: `support.ts` reconstruction disclosure; environment-dependent `check`/`test:auth`/`test:contracts`/`test:planner` failures; relay pre-execution gate still pending.
