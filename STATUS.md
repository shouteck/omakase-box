# Status

Replaced at every wave close. Last written 5 October 2026, 20:40 (+08), by Claude as CTO, at the switch to the lean kitchen.

## Now

- **Accepted on master:** B0, B1.1 (versioned Box store), D1.1 (delegation design), and the lean kitchen itself.
- **In flight:** K1, verify on the host without Docker. Brief: [waves/K1.md](waves/K1.md).
- **Held:** D1.2 (create and approve a Box from a request). The CEO held the old kitchen's wave W005 after 24 review rounds. Its unaccepted code and records are on the local branch `wave/D1.2` (not pushed).

## Approved by the CEO

- 5 Oct 2026: lean kitchen, Claude adapter, roadmap resequencing.
- 5 Oct 2026: hold W005 and finish D1.2 under the new rules; remove the old kitchen's containers; K1.
- Not yet approved: D2.

## Next

1. **K1** closes.
2. **D1.2 resumes** from `wave/D1.2`: rebase onto master, move its tests to the disposable database, drop its container harness, review and verify.
3. **D2 - the Box as a folder and a command line.** Proposal to the CEO when D1.2 closes.

## Known problems

- `packages/box-contracts` is missing from `pnpm-lock.yaml`; on the host `test:box-contracts` fails with "Cannot find package 'zod'". K1 fixes it.
- `tests/box/auth/support.ts` only accepts a database on a removed container's hostname. K1 fixes it.
- 16 tests named `*-live.test.ts` shell into the old `private-task-mvp-synthetic` container stack, including some inside `check`. That stack is left running for them until they are ported.
- `scripts/box-verification/` and `tests/box/verification/` are the old container harness. Unused; remove in a later cleanup wave.
- Three source tarballs under `.execution/box-v4/evidence/B1.1/` are on disk, ignored by Git.

## Decisions waiting for the CEO

None.
