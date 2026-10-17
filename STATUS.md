# Status

Updated by the CTO on 17 October 2026 at the BT29 close.

## Now

- **BT29 merged** (`743e23e`; independent PASS `21c3377` on `761143b`, ui-verified; 656 bounty tests, 142 package tests + 6 skips, 83 kitchen tests green). The per-ended-posted-record `compact status uses the cached last observation` line in `renderStatus` is gone and its fact now lives once in `box bounty help`. Mix C (5 open + rest ended, all posted with `github` + `attempts`) in `kitchen/memory/measure.mjs` dropped from **131,263 → 5,893 chars** (1,052 → 57 lines) at N = 1,000, flat from N = 10 to N = 1,000. Mix C also surfaced an O(N²) `refreshGitHubFormat` -> `persistRecord` loop in `status --json` on ended posted records, recorded in `kitchen/reviews/K25-memory.md` for K27/BT30.
- **BT28 merged** (`18a14cd`; independent PASS `5932543` on `07e1bac`, test-verified): `ENDED_OVERVIEW_LIMIT = 5`, `HOOK_START_OPEN_LIMIT = 10`, `create --part-of`, `records:` tracking warning, and `box bounty find <query> [--json]`.
- **BT12 Part A remains merged. Part B, npm publishing, remains deferred by the owner.** The install line stays held until publishing. The live demo was dropped.

## Next

**K26** (shared vs machine-local memory model + 3-agent second-machine experiment) is starting now, followed by **K27** (storage engine benchmark, shared-store comparison, and scratch prototype). **BT30** builds both after the owner chooses the shared store. **BT12 Part B** stays deferred.
