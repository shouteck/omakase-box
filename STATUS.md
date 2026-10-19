# Status

Updated by the CTO on 19 October 2026 at the BT38 close.

## Now

- **BT38 merged** (`eb1fd51`; independent PASS test-verified on `6745b39`, verdict `6768894`). Adds `tests/box/bounty/bt38.test.ts` with direct proofs for T1 (instruction-file bytes and `mtimeMs` stay identical across all 18 reading commands, and change when a new PR arrives), T4 (remote and local `refs/box-bounty/*` stay identical across the same 18 reading commands), C5 (`planBounty`'s snapshot commit resolves with the captured tree, while new drafts are unpinned post-BT24 — `docs/box-v4/CONTRACTS.md` C5 corrected at close), and PL3 (table-driven CLI refusals across all 9 contract sections exit non-zero and name a next step; ~99 lexical refusal messages without a verbatim command listed in the Result). Removes the dead `refuse` helper from `packages/box-bounty/look.ts`.
- **Bite proof:** worker broke T1 (`replaceFile` forced write), T4 (`refreshSharedMemory` appended a chain event) and PL3 (`missing-query` stripped of its command) and captured the verbatim failures; the independent pass repeated the T1 bite itself.
- **Verify cost:** `verify: 2 runs, total 1158s` (2 PASS, 0 FAIL, 0 missing/malformed summaries, 1,150 executed step-seconds; within comparable win32 cohort median 1,028 s, n=3) from post-merge `node scripts/kitchen-stats.mjs --wave=BT38`.
- Main checkout is master; all `bt38*` scratch items and the merged branch are removed. Latest hosted result before merge was green `39296933710`; post-push checks are not awaited.

## Next

This run stops after BT38. No wave is in flight or starts automatically. BT39 (fix `git()` buffer limit at 100k files + profile and speed up `create` at 10k files and `status` at 100 solutions) is briefed and ready when named; BT33 stays parked and BT12 Part B deferred.
