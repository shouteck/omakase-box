# Status

Replaced at every wave close. Last written 6 October 2026, ~07:00 (+08), by Devin as CTO, at overnight run close — the queue is finished.

## Now

- **Accepted on master:** B0, B1.1, D1.1, the lean kitchen, K1, D1.2, K2a, K2b, K3, **D2.1** (`bce810d`), **D2.2** (`85035a9`), **D3.1** (`48ac79a`).
- **The delegation loop is closed end to end:** `packages/box-package` + `packages/box-cli` export a plain Box folder (box.json, compiler-derived source closure, editable + generated scaffolds, toolchain metadata, per-file SHA-256 provenance, staged lockfile, self-contained `box/submit.mjs`). A blind taster completed Request A from the folder alone and produced a bound `submission.json`; owner-side `box verify` applied it at its base, ran install/compile/outcome checks through the real loader and server, and scratch-merged with attempt identity. A no-op patch provably fails as `implementation-failure`.
- **Verification is fully Docker-free:** every ordinary suite runs on the host against the disposable embedded Postgres; `test:containers` exists separately and needs Docker + the frozen M-series image.
- **In flight:** nothing — the overnight queue is complete. Morning card: [waves/night-2026-10-05.md](waves/night-2026-10-05.md).
- **Held:** nothing.

## Approved by the CEO

- 5 Oct 2026: lean kitchen, Claude adapter, roadmap resequencing.
- 5 Oct 2026: hold W005 and finish D1.2 under the new rules; remove the old kitchen's containers; K1.
- 5 Oct 2026 (overnight message, naming = approval): **D2** and **D3.1**, plus kitchen waves K2 and K3.
- 6 Oct 2026: an off-machine verify run on GitHub Actions, free tier (K8); removing legacy material from master after tagging (K9); a milestone walkthrough for the owner; no reliance on a second model family.

## Next

1. The overnight queue is empty — D1.2, K2a, K2b, K3, D2.1-proto, D2.1, D2.2, D3.1 all PASS and merged.
2. **D4 waits for the owner** — the Box-vs-contractor comparison milestone was not named tonight.
3. Product option when the owner is back: exercise the loop on a real (non-fixture) request.
4. Kitchen waves, capped: **K4** (numbers page, stall guard, limit checks) and **K5** (stop repeating work), then measure. After that **K8** (off-machine verify run) and **K9** (legacy removal). K6 and K7 run only if verification is still above 15% of a run.

## Night queue

For `START.md overnight`. Work down the list; skip an entry whose dependency is parked and come back if it clears. Entries marked "needs naming" run only if the owner names that milestone in the overnight message.

1. ~~D1.2~~ — PASS ui-verified `22ca7ca`, merged `80bbae6`.
2. ~~K2a~~ — PASS `8c7f6a8` → `6f48940`. ~~K2b~~ — PASS `7583c08` → `1f8ef5d`. ~~K3~~ — PASS `8a53e23` → `661722d`.
3. ~~D2.1-proto~~ — PASS; design decided (compiler-derived closure). ~~D2.1~~ — PASS `8f03aa3` → `bce810d` after one FAIL round (exclusion bypasses found and closed). ~~D2.2~~ — PASS `93d38f1` → `85035a9` (blind taster ran the real loop). ~~D3.1~~ — PASS `04fb6fc` → `48ac79a` (owner-side verify + scratch merge on the real submission).
4. K4, K5, then K8 and K9 (kitchen waves). A product wave the owner names goes ahead of any of them.
5. D4 waits for the owner.

## Known problems

None blocking. Leftovers are in [BACKLOG.md](BACKLOG.md).

## Decisions waiting for the CEO

- **Next product step:** R1 (run the loop on a real request, starting with one of the kitchen's own waves) or D4 (the comparison). Recommendation: R1 first. Name either in a START message to approve it.
