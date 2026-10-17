# Status

Updated by the CTO on 17 October 2026 at the K25 close.

## Now

- **K25 merged** (`2e96b75`; independent PASS `6e82c6f` on `038f1b9`, test-verified). The tool's agent-memory surfaces are mapped, measured from N = 1 to 1,000 in `kitchen/memory/measure.mjs`, and compared with Claude Code, AGENTS.md, Beads, Letta, Mem0, Zep and GitHub's native issue relations in `kitchen/reviews/K25-memory.md`.
- **Measurements (N = 1 → 1,000):** the instruction-file block stays constant at 7 lines / 327 chars (~82 tokens) in every mix. The hook `start` line stays 1 line but grows ~24 chars per open bounty (155 → 24,136 chars all-open; constant 253 chars at 5 open). Overview (`box bounty`, `status`) grows without bound in both mixes: 847 → 565,182 chars (~141k tokens) all-open, and 859 → 79,513 chars (~20k tokens) at 5 open + 995 ended because the `ended:` line joins every ended record (~75 chars each). Single-record `status <id>` stays flat (~750 chars).
- **Decisions and five proposed waves** (awaiting the owner's pick before any is briefed): (1) bound the ended list in `status`/`box bounty` to a count plus the few most recent; (2) cap the hook `start` line past ~10 open bounties so unasked context is constant in characters; (3) optional `--job` relation field on the record (with optional GitHub blocked-by/sub-issue mirror at `post`); (4) state in `status`/`config` whether `.box/bounties/` is tracked and warn on public remotes that records hold owner-only context; (5) `box bounty find "<text>"` purpose search across open and ended records.
- **BT12 Part A remains merged. Part B, npm publishing, remains deferred by the owner.** The install line stays held until publishing. The live demo was dropped.

## Next

No wave is in flight. This run stops after K25. The five proposed memory waves in `kitchen/reviews/K25-memory.md` and the deferred **BT12 Part B** wait for the owner's direction.
