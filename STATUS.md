# Status

Replaced at every wave close. Last written 6 October 2026, ~01:30 (+08), by Devin as CTO, during the overnight run, after K3 closed.

## Now

- **Accepted on master:** B0, B1.1, D1.1, the lean kitchen, K1, D1.2, K2a, K2b, **K3** (container harness deleted; `private-task-mvp-synthetic-*` stack down, volumes/networks gone; hostile-runner tests preserved in `tests/containers/`).
- **Verification is fully Docker-free:** every ordinary suite runs on the host against the disposable embedded Postgres; `test:containers` exists separately and needs Docker + the frozen M-series image.
- **In flight:** overnight run. Next wave: D2.1-proto (brief ready at [waves/D2.1-proto.md](waves/D2.1-proto.md)).
- **Held:** nothing.

## Approved by the CEO

- 5 Oct 2026: lean kitchen, Claude adapter, roadmap resequencing.
- 5 Oct 2026: hold W005 and finish D1.2 under the new rules; remove the old kitchen's containers; K1.
- 5 Oct 2026 (overnight message, naming = approval): **D2** and **D3.1**, plus kitchen waves K2 and K3.

## Next

1. **D2.1-proto** — three throwaway source-selection attempts on `examples/private-shop` Request A, compared in the wave file.
2. **D2.1** — export a Box as a folder and prove it in a clean directory (brief written after the proto result).
3. **D2.2** — a `box-recipient` completes a change from the Box and submits a patch.
4. **D3.1** — owner-side verify + merge of the patch.

## Night queue

For `START.md overnight`. Work down the list; skip an entry whose dependency is parked and come back if it clears. Entries marked "needs naming" run only if the owner names that milestone in the overnight message.

1. ~~D1.2~~ — PASS ui-verified `22ca7ca`, merged `80bbae6`.
2. ~~K2a~~ — PASS `8c7f6a8` → `6f48940`. ~~K2b~~ — PASS `7583c08` → `1f8ef5d`. ~~K3~~ — PASS `8a53e23` → `661722d`.
3. D2.1-proto → D2.1 → D2.2 → D3.1 (D2, D3.1 named tonight).
4. Nothing after that tonight: D4 waits for the owner.

## Known problems

- None blocking. Remaining minor items:
- Ports 4000/4001 are held by Docker Desktop; host tests bind 127.0.0.2 with loopback mirrors (`scripts/host-test-runtime.mjs`).
- `tests/box/delegation/support.ts` caches its run dir per module — one `delegationPool()` per file; fix when a test needs two.
- `embedded-postgres` is a beta wrapper release, Windows-only install-policy entry.
- Requesters see Amend controls on boxes they did not author (server refuses; cosmetic).
- `doctor.mjs` `databases` check reports `unverified` since the synthetic stack was removed — honest label, not a failure.
- Main checkout is detached at master while the CTO commits docs from the `kitchen-night-docs` worktree.
- Worker and reviewer roles on this host are both Devin agents; no second model family available — recorded per wave.

## Decisions waiting for the CEO

None.
