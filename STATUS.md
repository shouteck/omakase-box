# Status

Replaced at every wave close. Last written 5 October 2026, 21:05 (+08), by Claude as CTO, after K1 closed and the D1.2 brief was written.

## Now

- **Accepted on master:** B0, B1.1 (versioned Box store), D1.1 (delegation design), the lean kitchen, K1 (verification on the host with an embedded Postgres, no Docker).
- **In flight:** D1.2 resumption. Brief ready at [waves/D1.2.md](waves/D1.2.md); not yet dispatched. Planned host: Devin as CTO, dispatching its own worker and a separate reviewer.
- **Held:** D1.2 (create and approve a Box from a request). Unaccepted code and the old kitchen's records are on the local branch `wave/D1.2` (not pushed).

## Approved by the CEO

- 5 Oct 2026: lean kitchen, Claude adapter, roadmap resequencing.
- 5 Oct 2026: hold W005 and finish D1.2 under the new rules; remove the old kitchen's containers; K1.
- Not yet approved: D2.

## Next

1. **D1.2 resumes** from `wave/D1.2` (already approved): rebase onto master, move its tests to the disposable database, drop its container harness, review and verify.
2. **D2 - the Box as a folder and a command line.** Proposal to the CEO when D1.2 closes.

## Known problems

- 16 tests named `*-live.test.ts` shell into the old `private-task-mvp-synthetic` container stack, including some inside `check`. That stack is left running for them. `auth-live` returns HTTP 429 when `check` runs back to back; wait about five minutes between full verify runs.
- `scripts/box-verification/` and `tests/box/verification/` are the old container harness. Unused; remove in a cleanup wave together with the `BOX_VERIFICATION_PROFILE` switches.
- `embedded-postgres` is a beta wrapper release, and its install-policy entry covers Windows only.
- Three source tarballs under `.execution/box-v4/evidence/B1.1/` are on disk, ignored by Git.
- Worker and reviewer were both Claude Opus 5.5 on K1. Use a different host for one of the roles when available.

## Decisions waiting for the CEO

None.
