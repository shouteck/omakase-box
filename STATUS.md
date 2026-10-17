# Status

Updated by the CTO on 17 October 2026 at the K27 close (completing `START.md: BT29, K26, K27`).

## Now

- **K27 merged** (`e189876`; independent PASS `ad19521` on `e964687`, test-verified). Local engines (`node:sqlite` WAL+FTS5, `sql.js` WASM, and `json-indexed`) benchmarked at N = 1,000, 10,000 and 100,000 across all 7 operations in `kitchen/memory/storage/benchmark.mjs`, and shared stores (committed `.box/bounties/shared.jsonl`, hidden `refs/box-bounty/shared`, GitHub issues, Turso, Neon, Supabase, Cloudflare D1) compared from live docs in `kitchen/reviews/K27-storage.md`:
  - **Local engine recommendation:** `node:sqlite` (WAL + FTS5) — 0.22–0.50 ms milestone writes and ~1 ms FTS5 `find` from N = 1,000 to 100,000 (vs 480 ms `json-indexed` and 944 ms `sql.js` at N = 100,000), `PRAGMA integrity_check` clean after a mid-write `SIGKILL`, zero bundle bytes added (vs `sql.js` ~1 MB bundled and no FTS5 in its default WASM build).
  - **Shared store recommendation:** committed append-only `.box/bounties/shared.jsonl` in the repository ($0, 0 owner setup steps, works offline, no new credential or remote; hidden Git ref `refs/box-bounty/shared` if kept out of the working tree; **Turso** embedded replicas as the private hosted fallback if privacy is ever needed, 3 owner setup steps, free tier 5 GB / 10M writes).
  - **Prototype (`kitchen/memory/storage/prototype.mjs`):** 10/10 self-tests green — separate `shared_bounties` and `local_bounties` tables + FTS5 + `shared.jsonl` Git sync, proving drafts stay local, Machine 2 rebuilds the shared mental model from `shared.jsonl` alone with zero machine-local fields leaked, and deleting the local DB loses only machine-local detail.
- **K26 merged** (`3ba4efe`; independent PASS `01c589e` on `ed095c2`, test-verified): 3-tier field classification, 5 mixed-field splits, and 3-agent second-machine experiment (`kitchen/reviews/K26-shared-memory.md`).
- **BT29 merged** (`743e23e`; independent PASS `21c3377` on `761143b`, ui-verified): removed the per-ended-posted-record compact `status` line (Mix C compact `status` at N = 1,000: **131,263 → 5,893 chars**).
- **BT12 Part A remains merged. Part B, npm publishing, remains deferred by the owner.**

## Next

Nothing is in flight. The owner chose on 17 October 2026: the shared memory is **public for now** (committed with the code); a **private online store** (Turso) is the intended next step afterwards. K27's outline is briefed as three waves, in order: **BT30** (tests reach records only through helpers; no product change), **BT31** (records move into a local `node:sqlite` database; Node floor 22.13), **BT32** (the shared/local split, a committed `shared.jsonl` with `merge=union`). Each cooks only when named. **BT12 Part B** stays deferred.
