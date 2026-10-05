# Status

Replaced at every wave close. Last written 6 October 2026, ~00:00 (+08), by Devin as CTO, during the overnight run, after K2a closed.

## Now

- **Accepted on master:** B0, B1.1 (versioned Box store), D1.1 (delegation design), the lean kitchen, K1 (host verification with embedded Postgres), D1.2 (request → owner-approved agreement via console+API), **K2a** (14 DB-only legacy live tests on the disposable Postgres — `scripts/host-test-runtime.mjs`).
- **In flight:** overnight run. Next wave: K2b (brief ready at [waves/K2b.md](waves/K2b.md)).
- **Held:** nothing.

## Approved by the CEO

- 5 Oct 2026: lean kitchen, Claude adapter, roadmap resequencing.
- 5 Oct 2026: hold W005 and finish D1.2 under the new rules; remove the old kitchen's containers; K1.
- 5 Oct 2026 (overnight message, naming = approval): **D2** and **D3.1**, plus kitchen waves K2 and K3.

## Next

1. **K2b** — host-run `private-api`/`external-api` test mode; port `auth-live`, `intake-live`, `tests/e2e/intent/`. Removes the 429 flake structurally.
2. **K3** — remove the old container harness; relocate the three Docker tests for the frozen hostile-runner path to `tests/containers/` ([waves/K3.md](waves/K3.md)).
3. **D2.1-proto** — three throwaway source-selection attempts compared ([waves/D2.1-proto.md](waves/D2.1-proto.md)).
4. **D2.1**, **D2.2**, **D3.1** — per [waves/night-2026-10-05.md](waves/night-2026-10-05.md).

## Night queue

For `START.md overnight`. Work down the list; skip an entry whose dependency is parked and come back if it clears. Entries marked "needs naming" run only if the owner names that milestone in the overnight message.

1. ~~D1.2~~ — PASS ui-verified `22ca7ca`, merged `80bbae6`.
2. ~~K2a~~ — PASS test-verified `8c7f6a8`, merged `6f48940`. K2b next.
3. K3: remove the old container harness (after K2b; brief updated for the three non-live Docker tests).
4. D2.1-proto → D2.1 → D2.2 → D3.1 (D2, D3.1 named tonight).
5. Nothing after that tonight: D4 waits for the owner.

## Known problems

- `auth-live` (in `check` AND `test:auth`) still uses the container stack and its 20-logins/5-min limiter makes back-to-back full verify runs fail 429 — structural until K2b lands; ~5 min spacing or `--only` runs work around it.
- Ports 4000/4001 can be held by Docker Desktop; host tests bind another loopback address (D1.2 precedent: 127.0.0.2, contract headers intact).
- `tests/box/delegation/support.ts` caches its run dir per module — one `delegationPool()` per file; fix when a test needs two.
- The synthetic container DBs carry ~300 leftover `synthetic_*` databases from container-fixture history; K3 retires the stack.
- `embedded-postgres` is a beta wrapper release, Windows-only install-policy entry.
- Requesters see Amend controls on boxes they did not author (server refuses; cosmetic).
- Main checkout is detached at master while the CTO commits docs from the `kitchen-night-docs` worktree.
- Worker and reviewer roles on this host are both Devin agents; no second model family available — recorded per wave.

## Decisions waiting for the CEO

None.
