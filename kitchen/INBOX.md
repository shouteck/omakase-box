# Kitchen inbox

Kitchen-wide lessons and ideas, one line each, ten at most. Only the head chef writes here. Emptied at every kickoff: each line is adopted or dropped. See "Getting better" in docs/box-v4/KITCHEN.md.

- One command checks kitchen documents before a push, running the AGENTS.md + KITCHEN.md size rule and `brief-check` on every brief changed: K43's kickoff found master red from the CTO's own edit, and eight queued briefs fail `brief-check` (K43).
- Verify runs in a disposable worktree are lost when it is removed: copy its `.kitchen/runs/*` into the main checkout first, or let verify take a runs directory, so kitchen-stats counts them (K43 lost four of seven).
