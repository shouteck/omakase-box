# Status

Updated by the CTO on 17 October 2026 at the BT28 close.

## Now

- **BT28 merged** (`18a14cd`; independent PASS `5932543` on `07e1bac`, test-verified; 655 bounty tests, 142 package tests + 6 skips, 83 kitchen tests green, zero import cycles). All five K25 memory improvements are live:
  1. **Bounded ended overview (`ENDED_OVERVIEW_LIMIT = 5`):** compact `status` and `box bounty` show a count plus the 5 most recently ended records (`all <total>: box bounty status --full`); steady-state overview at N = 1,000 (5 open, 995 ended) dropped from **79,513 → 3,940 chars** (~985 tokens), flat from N = 100 to N = 1,000.
  2. **Bounded unasked hook start (`HOOK_START_OPEN_LIMIT = 10`):** `hook start` and `.box/bounties/OPEN` cap open listings past 10 while still marking all open arrivals/conflicts told; at N = 1,000 all-open, `hook start` dropped from **24,136 → 389 chars** (~97 tokens) and `OPEN` from **71,945 → 754 chars**, constant from N = 100 to N = 1,000.
  3. **Bounty relations (`create --part-of "<job or id>"`):** stored on the record (`partOf`, validated in `asRecord`), shown on open and ended lines and carried in `status --json`.
  4. **Record-tracking notice (`records:`):** `status` and `config` warn when `.box/bounties/` has files tracked in Git (including linked worktrees, with zero extra `git` spawns when untracked), and `--full`/`--json` state the tracking status.
  5. **Purpose search (`box bounty find <query> [--json]`):** searches `id`, `title`, `why`, `partOf`/`job`, task text and `--resume` note across open and ended records, bounded to 20 matches (`box-bounty/find@1`).
- **BT12 Part A remains merged. Part B, npm publishing, remains deferred by the owner.** The install line stays held until publishing. The live demo was dropped.

## Next

Nothing is in flight. The CTO reviewed K25 and BT28 on 17 October 2026: sound, measured, and independently reproduced, with one gap: a per-record line in compact `status` escapes the bound for bounties posted to GitHub, which the measurement (unposted synthetic records) could not see. **BT29** is briefed to fix and measure it. **Owner decided (17 October 2026):** split each record into a shared part, committed (including the why and what was tried, written like a commit message), and a local part, ignored; drafts stay local until posted. **K26** designs what is remembered and for whom, tested with fresh agents (after BT29); **K27** designs where it is stored, with a real database measured and shared stores compared (the owner, 17 October 2026: "absolutely essential to the quality of our tool"); **BT30** builds both after the owner chooses the shared store. **BT12 Part B** (npm publishing) stays deferred.
