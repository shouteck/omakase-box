# Status

Updated by the CTO on 17 October 2026 at the BT30 close.

## Now

- **BT30 merged** (`41d8f28`; independent PASS `2bb5c24` on `d548dbc`, test-verified; 56 bounty files / 658 tests, 142 package tests + 6 skips, 83 kitchen tests green). All 135 direct record-file lines across 34 files under `tests/box/bounty/` now go through `tests/box/bounty/support.ts` helpers (`readRecord`, `readRecordRaw`, `writeRecord`, `writeRecordRaw`, `rewriteRecordRaw`, `recordIds`, `recordExists`, `removeRecord`, `openLine`, `boxFile`, `recordsDir`, `recordFilePath`, `RECORDS_DIR_REL`), guarded by `tests/box/bounty/record-access.test.ts` with unchanged assertions and zero `packages/` diff.
- **K27 merged** (`e189876`; independent PASS `ad19521` on `e964687`, test-verified) and **K26 merged** (`3ba4efe`; independent PASS `01c589e` on `ed095c2`, test-verified).
- **BT12 Part A remains merged. Part B, npm publishing, remains deferred by the owner.**

## Next

**BT31** (records move into a local `node:sqlite` database `.box/local/box.db`; Node floor `22.13.0`) is starting now, followed by **BT32** (shared/local split, committed `shared.jsonl` with `merge=union`). This run stops after BT32. **BT12 Part B** stays deferred.
