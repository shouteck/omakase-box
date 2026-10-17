# Status

Updated by the CTO on 17 October 2026 at the BT31-ci close.

## Now

- **BT31-ci merged** (`9319547`; PASS test-verified on `ee36757` after one FAIL-and-correction round). The hosted Node 22 job was red after BT31: Node 22.13's SQLite has no FTS5. The fix removed FTS5 entirely: `find` is now one plain substring search, the same on every Node, which also fixes a BT31 defect the pass found (whole-word FTS missed substring matches `find` promises). Cost: `find` scans every record (about 0.4 s at 100,000, milliseconds at realistic sizes). **Both hosted jobs green** (run 39044982524).

- **BT31 merged** (`d877a37`; independent PASS `b06c7ac` on `74086ab`, test-verified; 57 bounty files / 668 tests, 142 package tests + 6 skips, 83 kitchen tests green, zero import cycles). Bounty records now live in `.box/local/box.db` (`node:sqlite` WAL, `.box/local/.gitignore` with `*`), with existing/planted `.box/bounties/*.json` files imported and re-imported on change through `asRecord`; Node floor raised to `22.13.0` (`node-check.ts`, `pack.mjs`, `verify.yml` `install-node22`, `FIRST-FIVE-MINUTES.md`) with the SQLite `ExperimentalWarning` filtered; every benchmark operation at N = 10,000 lands inside K27's ×2 bars (0.06–0.53 ms reads/writes, 25/25+25/25 concurrent writers, crash `integrity_check` ok), K14 start budgets are unchanged, and N = 1,000 wall times dropped ~3–4×.
- **BT30 merged** (`41d8f28`; independent PASS `2bb5c24` on `d548dbc`, test-verified): all test record accesses moved behind `tests/box/bounty/support.ts` helpers, guarded by `record-access.test.ts`.
- **BT12 Part A remains merged. Part B, npm publishing, remains deferred by the owner.**

## Next

No wave is in flight. **BT32** was placed **on hold** by the owner during this run (`e472875`, `waves/BT32.md`: "Do not dispatch as written") while **K28** (`waves/K28.md`: the delegation record, researched against Beads and git-bug) is briefed and waiting for the owner to name it. **BT33** (Turso private sync) is parked. **BT12 Part B** stays deferred.
