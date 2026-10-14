# Kitchen inbox

Kitchen-wide lessons and ideas, one line each, ten at most. Only the head chef writes here. Emptied at every kickoff: each line is adopted or dropped. See "Getting better" in docs/box-v4/KITCHEN.md.

- `deriveTitle` edge: `--title "#"` derives an empty title; nothing guards it (BT14 pass finding b).
- `create`'s permission line mislabels a rewrite-mismatched remote as "no GitHub remote" (BT14 pass finding c).
- After `apply`'s clash refusal, a hand `git merge` can fail on a clean tree — stale index; `git checkout HEAD -- <file>` clears it. Consider whether `apply` should leave a fresher index (BT14 cold run).
- `github.unavailableReason` is a stored string printed verbatim into status — same replay-surface class as `github.pending`; a whitelist of reason names would bound it (BT14 pass finding d).
- The first-use owner block says "posted publicly on GitHub" even when the held post is to a folder — a brief-level decision (BT13's block is do-not-touch; BT14 pass finding f).
- BT13 pass found two "says nothing rather than guess" comments in `merged.ts` whose code reports a conservative wrong fact instead — next wave touching `merged.ts` should fix or re-scope them.
