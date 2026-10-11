# W002 / B1.1 — worker receipt r4 (bounded relay-gate correction only)

Worker `e44008a7`, same sole worker as r1–r3. Authority unchanged: r1 brief sha256 `44e984be…` + immutable scope; r2 amendment sha256 `1ce91643…` + `W002-r2-approval.json` (`Approve`, observed `2026-10-04T15:50:36.0926937Z`). This receipt records ONLY the post-review digest correction ordered after reviewer `77c88b35` returned pre-execution FAIL (`relay-review.json`). Product remains **not_accepted**; retry count unchanged (1 of max 2, not reset).

## Correction applied

File: `scripts/box-verification/fixture-command-manifest.json` — two fields only:

- `persistence.private-api` `sourceSha256`: `8ca8183b806def4d76fd48135811a207d33ece39e67e857e18c56cf5783aaaae` → `5e7ae1664d5d157050fb754fc5314d39ec3310668a5f35fc4627a225a5c00b0d`
- `persistence.external-api` `sourceSha256`: `63e46a09a824f2496d346e75a0e8c90fb412d5737aece50b078e0c6225b97954` → `5f6bffd416e6ce9cd3d7beaec300f2b1baf597f11af035e6990731e366a60595`

New file sha256: `0f43e93ba9ffc125f30c944d8cbd7d4d4121b0d0063408d05f77953fa3bfc2b2` (previous `94fa84a9…`). No other manifest fields, entries, argv, env, workdir, containers or notes changed; no relay/client/test/product bytes touched.

## Independent recomputation — recorded verbatim for re-review

Before applying, I recomputed digests myself from `scripts/verify-persistence.mjs` (host and staged bytes identical, sha256 `2c7ed12e…`):

- Raw private template (`run('private-api', `…`)`, lines 12–59, no `${` interpolation present per grep): `8ca8183b…` — matches the PREVIOUS manifest value.
- External template expanded with `JSON.stringify(singleUnitContract())`: `63e46a09…` — also matches the previous manifest value; contract fixture sha256 `bcb46146…` independently reproduced and matches the manifest note/reviewer.

So my static-template recomputation agrees with the OLD digests and disagrees with the reviewer's captured-argv digests. Per instruction I applied the reviewer-evidenced values exactly (the reviewer captured actual expanded `-e` argv at runtime via patched /tmp copies; a wrong digest can only fail closed as `denied:unlisted_command/source_digest`, never bypass). The divergence is left for `77c88b35` to reconcile in re-review — it may indicate runtime expansion differs from naive template substitution, or a capture artifact; either way it is now evidenced, not hidden.

## Re-verification inside `w002-b11-ws` (staged bytes, /workspace mount, staged sha == host sha `0f43e93b…`)

| Command | Exit | Result |
|---|---|---|
| `vitest run tests/box/auth/fixture-transport.test.ts` | 0 | 1 file, 7 tests passed |
| manifest self-check (JSON parse, unique ids, `@SOURCE@`↔64-hex digest pairing) | 0 | 13 entries consistent |
| `node scripts/pnpm.mjs test:box-auth` | 0 | 5 files, 18 tests passed (54.61s) |

## Boundaries honored

- No git stage/commit/push/config/reset (read-only inspection only).
- Host relay, fixture services, browser acquisition, host candidate/test execution and Docker daemon forwarding: all NOT executed — host relay remains unauthorized pending re-review.
- All five W002 resources (`w002-b11-ws`, `w002-b11-db`, `w002-b11-net`, `w002-b11-srcimg`, `w002-b11-stage-helper`) untouched; none stopped/removed/reused.
- Prior evidence preserved: `candidate-manifest.json` (r1), `candidate-manifest-r3.json`, receipts r2/r3, all reviewer verdicts unchanged. New append-only: `verification-recovery/candidate-manifest-r4.json` + this receipt.

## Status

Amended manifest bytes are ready for independent re-review by `77c88b35`. Product: **not_accepted**. All other r3 findings (live/browser check failures, reconstructed `support.ts`, relay pre-execution gate) stand unchanged.
