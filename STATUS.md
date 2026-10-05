# Status

Replaced at every wave close. Last written 5 October 2026, ~22:30 (+08), by Devin as CTO, during the overnight run, after D1.2 closed.

## Now

- **Accepted on master:** B0, B1.1 (versioned Box store), D1.1 (delegation design), the lean kitchen, K1 (host verification with embedded Postgres), **D1.2** (request → owner-approved completion agreement through the real console and API). Milestone D1 is complete.
- **In flight:** overnight run. Next wave: K2a (brief ready at [waves/K2a.md](waves/K2a.md)).
- **Held:** nothing. D1.2's old unaccepted branch is merged and deleted.

## Approved by the CEO

- 5 Oct 2026: lean kitchen, Claude adapter, roadmap resequencing.
- 5 Oct 2026: hold W005 and finish D1.2 under the new rules; remove the old kitchen's containers; K1.
- 5 Oct 2026 (overnight message, naming = approval): **D2** and **D3.1**, plus kitchen waves K2 and K3.

## Next

1. **K2a** — port the 14 DB-only `*-live` tests to the disposable database.
2. **K2b** — host-run APIs test mode; port `auth-live`, `intake-live`, `tests/e2e/intent/`.
3. **K3** — remove the old container harness ([waves/K3.md](waves/K3.md)).
4. **D2.1-proto** — three throwaway source-selection attempts compared ([waves/D2.1-proto.md](waves/D2.1-proto.md)).
5. **D2.1**, **D2.2**, **D3.1** — per [waves/night-2026-10-05.md](waves/night-2026-10-05.md).

## Night queue

For `START.md overnight`. Work down the list; skip an entry whose dependency is parked and come back if it clears. Entries marked "needs naming" run only if the owner names that milestone in the overnight message.

1. ~~D1.2~~ — done, PASS ui-verified on `22ca7ca`, merged `80bbae6`.
2. K2a → K2b: port the legacy `*-live` tests to the disposable database (two waves; briefs ready).
3. K3: remove the old container harness (after K2b).
4. D2.1-proto → D2.1 → D2.2 → D3.1 (D2, D3.1 named tonight).
5. Nothing after that tonight: D4 waits for the owner.

## Known problems

- Until K2 lands, `check` still contains `*-live` tests that need the synthetic containers; that stack stays up. Back-to-back full verify runs can hit `auth-live` HTTP 429 — wait ~5 minutes. K2b removes this.
- Ports 4000/4001 can be held by Docker Desktop; host tests should bind another loopback address (D1.2 uses 127.0.0.2 with contract headers intact).
- `tests/box/delegation/support.ts` caches its run dir per module — one `delegationPool()` per file; fix when a test needs two.
- `embedded-postgres` is a beta wrapper release, and its install-policy entry covers Windows only.
- Requesters see Amend controls on boxes they did not author (server refuses; cosmetic).
- Main checkout is detached at master because the CTO commits docs from the `kitchen-night-docs` worktree during the run.
- Worker and reviewer roles on this host are both Devin agents; no second model family is available here — recorded per wave.

## Decisions waiting for the CEO

None.
