# Status

Replaced at every wave close. Last written 6 October 2026, ~00:50 (+08), by Devin as CTO, during the overnight run, after K2b closed.

## Now

- **Accepted on master:** B0, B1.1, D1.1, the lean kitchen, K1, D1.2, K2a, **K2b** (`SYNTHETIC_HOST_TEST` host-run APIs; every `*-live` test and `tests/e2e` now run on the disposable Postgres — ordinary verification needs no Docker and the 429 flake is gone).
- **In flight:** overnight run. Next wave: K3 (brief ready at [waves/K3.md](waves/K3.md)) — remove the dead container harness and retire the `private-task-mvp-synthetic-*` stack.
- **Held:** nothing.

## Approved by the CEO

- 5 Oct 2026: lean kitchen, Claude adapter, roadmap resequencing.
- 5 Oct 2026: hold W005 and finish D1.2 under the new rules; remove the old kitchen's containers; K1.
- 5 Oct 2026 (overnight message, naming = approval): **D2** and **D3.1**, plus kitchen waves K2 and K3.

## Next

1. **K3** — remove the old container harness; relocate the three Docker tests for the frozen hostile-runner path to `tests/containers/`; bring the synthetic stack down at the end.
2. **D2.1-proto** — three throwaway source-selection attempts compared ([waves/D2.1-proto.md](waves/D2.1-proto.md)).
3. **D2.1**, **D2.2**, **D3.1** — per [waves/night-2026-10-05.md](waves/night-2026-10-05.md).

## Night queue

For `START.md overnight`. Work down the list; skip an entry whose dependency is parked and come back if it clears. Entries marked "needs naming" run only if the owner names that milestone in the overnight message.

1. ~~D1.2~~ — PASS ui-verified `22ca7ca`, merged `80bbae6`.
2. ~~K2a~~ — PASS test-verified `8c7f6a8`, merged `6f48940`. ~~K2b~~ — PASS test-verified `7583c08`, merged `1f8ef5d`.
3. K3: remove the old container harness (brief updated for the three non-live Docker tests).
4. D2.1-proto → D2.1 → D2.2 → D3.1 (D2, D3.1 named tonight).
5. Nothing after that tonight: D4 waits for the owner.

## Known problems

- The synthetic container stack is still up carrying ~300 leftover `synthetic_*` databases; K3 brings it down and deletes the harness. Until then nothing needs it.
- Ports 4000/4001 are held by Docker Desktop; host tests bind 127.0.0.2 with loopback mirrors (`host-test-runtime.mjs`).
- `tests/box/delegation/support.ts` caches its run dir per module — one `delegationPool()` per file; fix when a test needs two.
- `embedded-postgres` is a beta wrapper release, Windows-only install-policy entry.
- Requesters see Amend controls on boxes they did not author (server refuses; cosmetic).
- Main checkout is detached at master while the CTO commits docs from the `kitchen-night-docs` worktree.
- Worker and reviewer roles on this host are both Devin agents; no second model family available — recorded per wave.

## Decisions waiting for the CEO

None.
