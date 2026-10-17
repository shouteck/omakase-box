# K27 review: where the tool's memory is stored — a real database, measured and compared

Wave K27, branch `wave/K27`, 17–18 October 2026. Cook: box-worker. Design investigation — no product code, no tests changed, no account created, nothing installed into the repository. Benchmarks: `kitchen/memory/storage/benchmark.mjs` (rerun instructions in its header). Prototype: `kitchen/memory/storage/prototype.mjs` (self-test, runs from a clean checkout). Documentation pages cited with the date read; all fetched live on **2026-10-17** except where noted. Measurements on this host: Windows, Node v24.11.0, 6 CPUs; durations vary with host load — the evidence-station rule applies (MsMpEng scanning can double a run), so sizes are quoted exactly and times as measured.

## The owner's page (read this first)

**What we measured.** We asked whether the tool's memory — the records it keeps about every handed-off task — should live in a real database instead of the plain text files it uses today, and where the copy that every machine shares should live. We built three candidate stores on this machine and timed the seven things the tool actually does with its memory, at a thousand, ten thousand and a hundred thousand records.

**The answer on your own machine.** A database that is built into the tool's own runtime wins clearly: a hundred thousand records open in about four thousandths of a second, a search answers in about one thousandth, and each save takes about half a thousandth — roughly a hundred to a thousand times faster than the best version of today's plain files, which take up to half a second per save at that size and slowed past a second for one overview. The database file also shrugs off a crash mid-save (we killed a process during a write; the file checked out perfect afterwards), while today's approach survives but drops the in-flight change, and the runner-up database option silently loses whole updates when two machines save at once.

**Where the shared copy lives.** The same shared notes can keep travelling inside the project the way a commit message does — that costs nothing, needs no account and no password, works offline, and is already the arrangement you approved. Every hosted alternative (a small private database on the internet) requires you to create an account, generate a token, and accept that the project's notes are readable by that company; each also has a real monthly cost the moment usage outgrows its free tier, or pauses your data after a week idle. The measurable benefit they add — privacy on a public repository — is real but was weighed against zero-cost and zero-setup, and it does not pay for itself at this scale.

**What it costs you.** Nothing. The recommended design needs no account, no key, no money, and no new setup step — the tool's memory becomes a single small database file on each machine plus one committed shared list that travels with the project, exactly as the shared notes were already going to travel.

**The one decision.** Whether you ever want the project's shared notes to be private instead of public-in-a-public-project. That is the only thing a hosted store buys. If the answer is "not now", the recommended design ships with zero setup and a hosted store can be added later as a plug-in destination, because the design already separates "what is shared" from "where it goes".

---

## Step 1: the requirements

K26's per-tier requirements table (unchanged — K27 designs against it):

| requirement | anyone | project agents | this machine |
|---|---|---|---|
| who writes & when | GitHub itself at post/close/merge | the tool, only at milestones (posted, merged, closed, part-of changed) — never on a read | the tool on every command |
| who reads | solvers, the public, `gh` | every agent on the project on any machine | only commands on this machine |
| read pattern | `gh issue list/view` | every session start; on-demand status/find; ~N reads/command today | same plus refresh bookkeeping |
| size per bounty | fixed: one issue + branch | ~1–1.5 KB, ~2 KB posted; bounded views cap what is *seen* | unbounded (reports, caches, waits) |
| offline | no | **must work offline** | yes |
| visibility | the world | anyone who can read the repo today; a private store would narrow it | this machine's users |
| two-machine concurrency | GitHub serialises | mergeable records; last-writer-wins acceptable at milestone granularity | n/a |
| five tracked records | — | must keep loading (`bt23.test.ts`) | — |

**Measured numbers the design must beat** (K25 `measure.mjs`, this host, mix B = 5 open + rest ended): `status` ~79,417 chars in 1,778 ms at N=1,000; `status --json` 1,384,810 chars in 1,976 ms; `status <id>` flat ~766 chars/~1.5 s; instruction-block sync 1,707 ms at N=1,000; `find` does not exist. These were measured with the real CLI; Step 2 below measures the *storage layer only* for the same operations.

**The seven operations a store must serve** (with how often each runs):

| # | operation | frequency | what it needs |
|---|---|---|---|
| 1 | list open | every `status`, `hook start`, block sync | open set: id, title, stage |
| 2 | bounded overview (open + count + 5 most recent ended) | once per `status`/`box bounty` | indexed ended sort |
| 3 | `find` by purpose | on demand | search over title/why/partOf/task/note |
| 4 | read one record | on demand | point lookup by id |
| 5 | write at a milestone | each `create/post/apply/close` | durable single-record write |
| 6 | hook `start` | every session start | open set, one line |
| 7 | instruction-block sync | on every record write | open set + rewrite of one block |

## Step 2: the local engine — measured

### What the documentation says (all read 2026-10-17)

- **`node:sqlite`** — [nodejs.org/api/sqlite.html](https://nodejs.org/api/sqlite.html): "Stability: 1.2 - Release candidate"; added in **v22.5.0** behind `--experimental-sqlite`, unflagged from **v22.13.0** (Node 22 changelog; on this host's Node **24.11.0** it runs with no flag). It **does print** `ExperimentalWarning: SQLite is an experimental feature and might change at any time` on stderr at first use — observed live on this machine; suppressible with `NODE_NO_WARNINGS=1` or `--no-warnings` (a child/worker process also confines it). **FTS5 works on this host**: `CREATE VIRTUAL TABLE t USING fts5(x)` + `MATCH` verified live.
- **`sql.js`** — [github.com/sql-js/sql.js](https://github.com/sql-js/sql.js): SQLite compiled to WASM; the database lives in memory and the caller persists by exporting the whole DB buffer. Measured live: **the default WASM build has no FTS5** (`no such module: fts5` — FTS5 requires a custom build). Bundle cost measured with this repo's own `pack.mjs` approach (vite ssr bundle in scratch): `sql-wasm.js` 46.6 KB bundles to 67.7 KB, but the **wasm (684.9 KB) is loaded at runtime via `locateFile`, not bundled** — a single-file package must base64-embed it (~+0.9–1.0 MB) and the emitted bundle failed Node's ESM/CJS check (`ERR_AMBIGUOUS_MODULE_SYNTAX`) when naively bundled. Persistence rewrites the **whole file per write** (measured 944 ms/write at N=100,000); two processes writing share nothing — **last writer overwrites the whole file** (measured: one of two writers' 25 updates vanished entirely).
- **Plain JSON files plus an index** — the best version of today: `index.json` (atomic tmp+rename writes, like the tool's own writer) + append-only sharded JSONL (512 records/shard — N=100,000 creates ~200 shard files, not 100,000 NTFS files). No docs needed; this is the baseline.

### The tables (all seven ops, this host, Node 24.11.0; times in ms)

**node-sqlite** (WAL, FTS5; ~5% open records, sizes deterministic):

| N | open | seed | on-disk | listOpen | boundedOverview | find | readOne | writeMilestone | hookStart | blockSync |
|---|---|---|---|---|---|---|---|---|---|---|
| 1,000 | 7.4 | 64 | 3.02 MiB | 0.27 | 0.33 | 0.40 | 0.10 | 0.22 | 0.33 | 1.94 |
| 10,000 | 5.8 | 877 | 30.5 MiB | 2.59 | 2.33 | 0.49 | 0.08 | 0.50 | 0.75 | 2.43 |
| 100,000 | 3.9 | 9,253 | 299 MiB | 19.1 | 42.8 | 0.92 | 0.07 | 0.40 | 19.4 | 15.6 |

Concurrency: two processes writing **different** bounties — both completed 25/25, ~80–100 ms. Writing the **same** bounty — SQLite serialises; some writes got `SQLITE_BUSY` and were retried-counted (e.g. 16+18 wrote, 16 failed of 50 at N=100,000); final record consistent (54 events, all from completed writes). Crash: killed mid-write → `PRAGMA integrity_check` = **ok**, victim record had all completed writes (368–459 events), other records intact.

**sql.js** (no FTS5 in default build → `find` fell back to indexed LIKE; whole-file persist per write):

| N | open | seed | on-disk | listOpen | boundedOverview | find | readOne | writeMilestone | hookStart | blockSync |
|---|---|---|---|---|---|---|---|---|---|---|
| 1,000 | 52.7–58.5 | 94–180 | 2.62 MiB | 4.2 | 8.5 | 2.7 | 0.29 | 11.1 | 3.5 | 1.2 |
| 10,000 | 2.2 | 1,688 | 26.2 MiB | 11.9 | 4.7 | 0.83 | 0.24 | 93.8 | 2.9 | 2.7 |
| 100,000 | 52.0 | 9,745 | 262 MiB | 21.8 | 40.1 | 1.14 | 0.20 | **944.3** | 15.8 | 19.3 |

Concurrency: different bounties — both "completed" but the file holds **only the last writer's** state (b's 25 writes: `bEvents=4` at N=10,000 — silently lost). Same bounty: same loss (`aEvents=29`, not ~79). Crash: reopen + export succeeded (no integrity_check available); killed during persist → file rolls back to the last completed export — **the in-flight write is simply gone, never half-written**. Load note: the N=100,000 run overlapped another benchmark process early on; its op times are the slower of the two runs' spread.

**json-indexed** (the best version of today — atomic index + append-only shards):

| N | open | seed | on-disk | listOpen | boundedOverview | find | readOne | writeMilestone | hookStart | blockSync |
|---|---|---|---|---|---|---|---|---|---|---|
| 1,000 | 0.5–0.7 | 28–44 | 2.10 MiB | 1.4–2.5 | 15.7–21.7 | 0.6–2.9 | 7.0–8.6 | 13.1–14.4 | 0.9–2.9 | 0.8–1.3 |
| 10,000 | 0.2 | 220–299 | 21.0 MiB | 6.9–10.0 | 13.4–19.5 | 3.5–5.0 | 5.3–6.6 | 28.5–42.0 | 7.1–11.1 | 6.5–7.6 |
| 100,000 | 0.3–0.9 | 2,633–4,141 | 210.6 MiB | 110–367 | 214–1,108 | 85.6–329.6 | 5.2 | **480–503** | 238–298 | 95.9–155.5 |

Concurrency: all writes "succeeded" but the shared `index.json` is last-writer-wins — the loser's index updates were lost (record bodies survive in shards; the index drifted, `aEvents=57–78` partial merges). Crash after making the index atomic: store reopens, victim keeps its completed appends (5–17 events), other records intact. **Before** the atomic fix, a kill mid-index-write tore the whole index → `OPEN FAILED: Unexpected end of JSON input` — the honest record of what non-atomic file state costs.

### What the numbers decide

- node-sqlite is ~30–40× faster on writes at N=100,000 (0.40 ms vs 944 ms / 480 ms) and ~10× on reads, with real FTS and real crash recovery. It costs **zero bytes** in the package — it is in Node itself.
- sql.js fails the wave's own constraints twice: no FTS5 in the default build (a custom WASM build is a new dependency story), and its all-or-nothing whole-file persist loses cross-process writes — the exact thing the shared tier must not do. It remains the **fallback for Node 22.5–22.12** (where `node:sqlite` needs a flag the tool cannot add mid-process) if we accept its limits there.
- json-indexed is the respectable baseline: fine to N≈10,000, degrades past it, and its index is one torn write away from total unreadability unless every writer is perfectly atomic — SQLite gets that guarantee from the WAL instead of discipline.

## Step 3: the shared store — compared

Every row read live on **2026-10-17**; "needs an account" means this wave did not measure it (no account was created anywhere).

| store | free tier & limits | owner's one-time setup | credentials without an agent touching them | offline | privacy | sync shape | leaving |
|---|---|---|---|---|---|---|---|
| **GitHub issues** (already used; [sub-issues](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues), [dependencies](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-issue-dependencies)) | free on any repo; sub-issues ≤100/parent, 8 levels; blocked-by native | none — `gh` already signed in | `gh` keeps its own auth; the tool shells out | no | public on a public repo | the issue **is** the store; machine-readable block in the body | export via `gh`; it's already public anyway |
| **Committed shared file** (`.box/bounties/shared.jsonl` — K26's committed shared tier) | free, unlimited | none | none — it travels with `git clone/pull` | **yes** (reads fully offline) | anyone who can read the repo (owner's standing decision) | append-only JSONL; merge conflicts resolve line-wise; milestone writes only | already plain files — nothing to leave |
| **Hidden Git ref** (`refs/box-bounty/shared`; [git-fetch refspec docs](https://git-scm.com/docs/git-fetch), [GitHub rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)) | free, unlimited | none | same Git auth as push/pull (https/ssh credentials) | yes after fetch | anyone who fetches the ref explicitly; invisible in the default clone/branch listing — hidden from casual view, not access-controlled | `git push origin <sha>:refs/box-bounty/shared` + explicit refspec fetch; branch protection does not cover non-branch refs by default (rulesets target branches/tags) | delete the ref; history stays reflog-reachable only briefly |
| **Turso** ([pricing](https://turso.tech/pricing), [embedded replicas](https://docs.turso.tech/features/embedded-replicas)) | $0: 100 DBs, 5 GB, 500M rows read/mo, 10M written/mo, 3 GB sync | create account → create DB → create token (3 steps) | a Turso auth token the owner stores once (e.g. in `config`/gh-style keyring); agents never see it | partial — **embedded replicas** (local SQLite file synced to Turso) give offline reads + queued writes | **private** — the one option that hides shared notes on a public repo | libSQL embedded replica: local file + background sync — the only hosted option matching our two-tier shape | `turso db shell` dump / it's SQLite — trivially portable |
| **Neon** ([plans](https://neon.tech/docs/introduction/plans)) | $0: 100 projects, 10 branches/project, 100 CU-hours/project, 1 GB storage/project (20 GB total), scale-to-zero | account → project → connection string (3 steps) | Postgres connection string stored once by the owner | no — server Postgres; cold start on scale-to-zero adds seconds | private | `postgres://` driver inside the CLI — no embedded replica; needs a sync design we would build | `pg_dump`; Postgres is portable |
| **Supabase** ([pricing](https://supabase.com/pricing)) | $0: 500 MB DB, 2 active projects, **paused after 1 week of inactivity**, unlimited API requests | account → project → API key/DB password (3 steps) | service/anon key stored once by the owner | no | private | Postgres (or PostgREST) — same sync design cost as Neon | `pg_dump` |
| **Cloudflare D1** ([limits](https://developers.cloudflare.com/d1/platform/limits/), [pricing](https://developers.cloudflare.com/d1/platform/pricing/)) | $0: 5M rows read/**day**, 100k written/day, 5 GB total, 500 MB/DB | account → create D1 → **deploy a Worker or use the HTTP API** (4 steps — requires Workers) | CF API token stored once by the owner | no | private | HTTP API only (no local replica on free tier without a Worker) | `d1 export` to SQL; SQLite semantics |

**Also considered:** Git refs in `refs/notes/` (GitHub displays notes on commit pages — not hidden enough) and Beads' `refs/dolt/data` precedent (same shape as the hidden ref above — proof the shape works in production tooling). Nothing else free fit better than the committed file.

**Decision-relevant differences:** only the committed file and the hidden ref are free, credential-free, offline-capable and already-authorized destinations. GitHub issues remain the *anyone* tier regardless. A hosted DB buys exactly one thing: privacy — at the cost of an account, a stored credential, a network dependency, and (Supabase) idle pausing. Turso's embedded-replica model is the only hosted design that mirrors the local-then-sync shape this wave recommends, which is why it is the named fallback if privacy is ever wanted.

## Step 4: the prototype

`kitchen/memory/storage/prototype.mjs` implements the recommendation: `node:sqlite` + WAL + FTS5 behind one interface — `shared_bounties` carrying **only** K26's anyone + project-agents fields (the `postShared` path *refuses* a machine-local key — the schema cannot hold one), `local_bounties` for the machine tier, an FTS5 virtual table for `find`, and a shared-store adapter that syncs a committed `shared.jsonl` through a bare Git repo stand-in in scratch.

Self-test run on this machine (2026-10-17, Node 24.11.0) — all ten assertions green:

- **(a)** a draft wrote nothing to the shared store; `post` synced the shared tier once; the shared file contains **zero** machine-local fields (checked against the forbidden list: `folder`, `branch`, `commit`, `changed`, `scanFindings`, `waiting`, `attempts`, `conflicts`, `snapshot`, `manifestSha256`, `githubApproval`, `githubCache`); the local record kept folder, branch, changed, scanFindings and a rejected attempt.
- **(b)** machine 2, starting from an empty DB, pulled the shared file and answered `listOpen`, `boundedOverview`, `find` (by purpose words), `readOne`, `hookStart` and the instruction block correctly — and holds **zero** local rows.
- **(c)** deleting machine 1's DB entirely and rebuilding from the shared store restored the shared mental model (why, partOf, resume hand-over, GitHub facts); only machine-local detail was lost — which is the design's promise.

## Step 5: migration and growth

- **One-time migration:** on first run after upgrade the tool walks `.box/bounties/*.json`, feeds each record through `asRecord` (unchanged — same validation), splits it into the shared row + local row, and writes both in one transaction. The five tracked records in this repository stay exactly where they are — they are already public history, the split is not retroactive (K26), and `bt23.test.ts` keeps reading the `.json` files, so **the JSON reader stays as the migration path and the compatibility shim**; new writes go to the DB.
- **Compaction:** an ended bounty compacts after a period (say 90 days): its local row drops attempt reports, refresh caches and scan detail to a one-line summary — the Beads closed-work pattern. Shared rows never compact (they are the project's memory).
- **One-year size:** 20 bounties/week ≈ 1,040/year. Measured on-disk ~3 KB/record (SQLite incl. FTS, shared+local rows of realistic size) → **~3.2 MB/year**, ~6 MB at five years. The 100,000-record DB was 299 MiB — that is a century of use. Growth is a non-problem; bounded views were K25's fix and stay.

## Step 6: recommendation and the BT30 outline

**Local engine: `node:sqlite` (WAL, FTS5).** Numbers: writes 0.22–0.50 ms at every N vs 480–944 ms for both alternatives at 100k; `find` ~1 ms via real FTS5; crash recovery verified (`integrity_check` ok after a mid-write kill); zero package bytes (it ships in Node). Two warts, both priced: the stderr `ExperimentalWarning` (suppress via `NODE_NO_WARNINGS=1` in the packaged entry shim, or accept one stderr line once per process), and Node 22.5–22.12 need `--experimental-sqlite` — **fallback: sql.js** (dev-dep bundling its wasm base64, ~+1 MB package, no FTS5 → `find` uses the measured LIKE path, single-writer documented) for that window only; or simply declare Node ≥22.13 the floor — BT30's choice, both quantified here.

**Shared store: a committed shared file** (`shared.jsonl` or the DB-serialised equivalent) travelling with the repository — zero cost, zero setup, offline, already authorised by the owner's "shared = public" decision. **Hidden-ref variant** for teams that want it out of the working tree. **Turso** is the fallback the day privacy is worth an account: embedded replicas fit this exact two-tier shape (local SQLite + background sync), free tier is generous (5 GB, 10M writes/mo), and leaving is trivial (it is SQLite).

**The owner's decision, plainly:** nothing to set up if shared stays public (recommended, $0). If private shared notes are ever wanted: create a Turso account + one database + paste one token into the tool's config — 3 steps, $0 now, stays $0 until ~5 GB or 10M writes/month (years away at 20 bounties/week).

### BT30 outline

1. **Storage interface** — the prototype's: `listOpen / boundedOverview / find / readOne / writeLocal / createDraft / postShared / importShared / exportShared`, one module, injected store so tests can use `:memory:`.
2. **Schema** — `shared_bounties` (K26's anyone+agents fields only), `local_bounties` (machine tier), `bounties_fts` (title/why/partOf/task/note), `OPEN` becomes a derived view written on sync, not a file.
3. **Migration** — first-run importer from `.box/bounties/*.json` via `asRecord`; the JSON reader remains for the five tracked records and for import.
4. **Reads** — each command maps to one bounded query: `status` → boundedOverview, `hook start` → listOpen, `find` → FTS5, `status <id>` → readOne; nothing reads all records except `--json`, which asks for it.
5. **Behaviour tests** — K26's five: draft shares nothing; post writes exactly the shared field set (assert absent local fields by name); reads write nothing; second machine answers correctly; the five tracked records still load (`bt23.test.ts` stays green).
6. **Measurements BT30 must reproduce** — this report's tables: the seven ops at N=1,000/10,000/100,000, two-process same-bounty writes serialised not lost, kill-mid-write integrity, and the K25 surface sizes unchanged.
7. **Packaging** — `node:sqlite` adds zero bytes (single file stays single); the `ExperimentalWarning` needs a one-line shim decision; sql.js fallback measured at ~+1 MB bundled if ever needed.

## What was not examined, and why

- **Actual network latency of the hosted stores** — needs an account; none was created, per the brief.
- **A custom sql.js FTS5 build** — it only exists to rescue the fallback; not worth a WASM toolchain survey for a fallback of a fallback.
- **Merge/CRDT protocols for racing shared milestones** — K26 already scoped this to "mergeable shape"; two machines racing one milestone is rare and the JSONL append shape bounds it.
- **Per-command end-to-end times through the real CLI** — Step 2 measured the storage layer deliberately; the CLI adds ~170–250 ms process start per command regardless of engine (K25), which drowns every engine difference below N=10,000.
