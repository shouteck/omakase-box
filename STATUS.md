# Status

Updated by the CTO on 31 October 2026, when PF2 closed.

## Now

- **PF2 is on master:** a solver agent can find and read bounties through `/bounties.json`, `/bounties/<id>.json` and the MCP server at `/mcp`; a person can follow `/rss.xml`. Local only, against the GitHub stand-in. See the [wave file](waves/PF2.md).
- **Before any deploy (BACKLOG, Product):** no read has met real GitHub, and a refresh tick may exceed Workers Free's 10 ms CPU. Both belong to PF6.
- **Read the off-machine run at the next kickoff:** it covers PF2's merge; BT46's worker has not yet run on Node 22.13 or Linux.
- **Branches (owner, 31 October 2026):** work closes onto master. The cloud session branch `claude/serene-noether-m9qvs3` is left as it is.
- **For the owner:**
  - the stray idle `node.exe` from BT44 (PID 16324), if it is still running;
  - the BT42 participant sessions and their `%TEMP%` folders; six empty `%TEMP%\kitchen-K43-*` folders;
  - the two PF2 fresh-agent sessions and their `%TEMP%\kitchen-PF2-*` folders, held open until the sessions are archived.

## Next

- Unbriefed, found in BT48 (BACKLOG): `rmSync` leaves non-ASCII names on Windows, which may leave a solver's file behind after a refused `apply`.
- Unbriefed, found in PF1 (BACKLOG): the dependency audit. PF2 added the MCP SDK's dev packages, unaudited.
- PF3, then PF4, in separate sessions and worktrees if run alongside the tool waves. Each replaces PF2's stated gaps: `how_to_get_paid` (PF3), `owner.record`, `payment` and `owner_record` (PF4).
- PF5 after BT49, BT50, PF2 and PF4.
- K41 after PF5, PF6 last.
- **Verify on a cloud host:** k16 cannot run without the pinned browser (BACKLOG, "Cloud-host browser route"). **On the Windows host:** the bounty suite's 30 s timeouts fail under load (BACKLOG), so run verify with heavy apps closed.
