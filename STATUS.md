# Status

Updated by the CTO on 31 October 2026, when BT49 closed.

## Now

- **BT49 is on master** (`6d07b06`): an over-size issue is refused before anything is pushed, and a change over 2 MiB lists its files instead of printing. GitHub's limits are from secondary sources; see the [wave file](waves/BT49.md).
- **The off-machine run went red and is fixed:** BT48's packaging-card lines broke a size limit (`2b0e040`). BT48's own `bt43` test ran there and passed.
- **Running now:** BT50, then BT47 and BT46 (owner's START message).
- **Branches (owner, 31 October 2026):** work closes onto master. The cloud session branch `claude/serene-noether-m9qvs3` is left as it is.
- **For the owner:**
  - the stray idle `node.exe` from BT44 (PID 16324), if it is still running;
  - the BT42 participant sessions and their `%TEMP%` folders; six empty `%TEMP%\kitchen-K43-*` folders.

## Next

- Unbriefed, found in BT48 (BACKLOG): `rmSync` leaves non-ASCII names on Windows, which may leave a solver's file behind after a refused `apply`.
- PF1, then PF2 and PF3, then PF4, in separate sessions and worktrees if run alongside the tool waves.
- PF5 after BT49, BT50, PF2 and PF4.
- K41 after PF5, PF6 last.
- **brief-check:** PF2–PF6 name `test:platform`, which PF1 creates. Re-check them after PF1.
- **Verify on a cloud host:** k16 cannot run without the pinned browser (BACKLOG, "Cloud-host browser route"). **On the Windows host:** the bounty suite's 30 s timeouts fail under load (BACKLOG), so run verify with heavy apps closed.
