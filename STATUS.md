# Status

Updated by the CTO on 17 October 2026 at the K26 close.

## Now

- **K26 merged** (`3ba4efe`; independent PASS `01c589e` on `ed095c2`, test-verified). `kitchen/reviews/K26-shared-memory.md` classifies every field of `BountyRecord`, its nested types, and `.box/` files into three tiers (*anyone* ~30 rows, *project agents* ~8 rows, *this machine* ~45 rows), splits the 5 mixed fields (`resume`, `content.note`, `events[]`, `attempts[]`, `github`) with no new `create` option, and hands the per-tier storage requirements and reader audit to K27.
- **Second-machine experiment (`kitchen/memory/second-machine/`):** three fresh `box-recipient` agents ran on isolated clones (`world-a` full records, `world-b` shared tiers only, `world-c` public issue only). Both `(a)` and `(b)` noticed the open bounty before touching the test and retried 0 failed fixes; `(b)` (shared tiers only) completed the unfinished `revokeSession`/`cleanupExpired` session-store migration and closed the bounty cleanly (while `(a)` hesitated over stale machine-local branch/dirty-record warnings), and `(c)` (public issue only) missed the unfinished session-store migration completely because the public issue carries no `partOf` or `resume` handover note.
- **BT29 merged** (`743e23e`; independent PASS `21c3377` on `761143b`, ui-verified): removed the per-ended-posted-record `compact status uses the cached last observation` line (Mix C compact `status` at N = 1,000 dropped from **131,263 → 5,893 chars**).
- **BT28 merged** (`18a14cd`; independent PASS `5932543` on `07e1bac`, test-verified).
- **BT12 Part A remains merged. Part B, npm publishing, remains deferred by the owner.**

## Next

**K27** (storage engine benchmark at 1,000–100,000 bounties, shared-store comparison, scratch prototype, and BT30 outline) is starting now; this run stops after K27. **BT30** builds both after the owner chooses the shared store. **BT12 Part B** stays deferred.
