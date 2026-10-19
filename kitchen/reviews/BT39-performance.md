# BT39 performance notes — buffers, profiles, spawn audit, bites

Worker scratch root: `%TEMP%\kitchen-BT39-base` (all raw logs, result JSONs,
`.cpuprof` files, the adapted `measure-bt39.mjs`, spy + probe scripts).
Base SHA `d068844789be33312922cb419a7bbdb178597a39`; candidate branch `wave/BT39`.
Host: i5-9400F, 6 cores, Node v24.11.0. `os.loadavg()` is a Windows stub —
load is the sampled CPU-busy percent printed per cohort.

## Process-output audit (Part 1)

Every `spawnSync`/`execFileSync`/`spawn` in `packages/box-bounty/` and
`packages/box-cli/src/`:

| site | buffer before | grows with size? | after |
|---|---|---|---|
| `git.ts` generic `run()` — ls-tree, ls-files, diff, rev-list, fetch, status, merge-tree, … | none (1 MiB default) | yes — project and history | 512 MiB (`GIT_OUTPUT_LIMIT`); `result.error`/ENOBUFS stays `GitFailed` naming the command |
| `git.ts` `commandConfig` (config dump) | none | config size | 512 MiB |
| `git.ts` `gitFilteredBlob`/`gitWriteBlob` (hash-object; sha out) | none | no (sha only) | 512 MiB, uniform |
| `git.ts` `cat-file blob`, `cat-file --batch` | 512 MiB | yes | unchanged (same constant) |
| `git.ts` `cat-file --batch-check` | none | yes (names) | 512 MiB |
| `git.ts` `gitIndexWrite`, `gitStdin`, `gitRefsWrite` | none | small / history | 512 MiB |
| `git.ts` `git version` probe | none | fixed tiny | unchanged |
| `publish-plan.ts` `gitStdin` (`rev-list --stdin`) | none | history | 512 MiB |
| `gh.ts` ×2 (command-file + binary) | 16 MiB | API-paged, GitHub-bounded | unchanged |
| `packages/box-cli/src/**` | — | **no spawn calls exist** | — |
| `packages/box-cli/pack.mjs` ×2 | default | npm/CLI text only | noted, out of scope |

512 MiB is a bound, not "infinite": past it the same named `GitFailed`
fires. Streaming sites keep their existing stream bounds.

## Profiles (`--cpu-prof`, parent CLI only — child work shows as spawnSync wait)

- `create` @10k, baseline (`cpuprof/create-t1-10000-plain-1792436912345`):
  `open` 32.4 %, `spawnSync` 24.8 %+tail ≈ 33 %, `lstat` 20.4 %,
  `stat`/`realpathSync` ≈ 4 %, `classifySnapshot` 0.7 %, scan regex ≈ 0.4 %.
- `create` @10k, candidate (`…-1792439836928`): `spawnSync` 32.5 %+tail,
  `open` 26.7 %+1.4 %, `lstat` 18.1 % — same shape; the speed path was
  reverted (below), so the remaining cost is per-file `open`/`read`/`lstat`
  plus `add -A` hashing — contract-bound work.
- `status` @100 PRs, baseline (`status-status-base-…806984`): 93.9 %
  `spawnSync` — the process is a shell around ~104 `gh api` children
  (~100 of them `pulls/<n>/files`).
- `status` @100, candidate (`status-status-cand-…802495`): 563 samples vs
  6430 — spawnSync spread over ~5 gh + ~7 git calls; no dominant frame.

## Process starts (K14 preload spy)

- create @1k baseline 14 git / 0 gh; candidate 14 git / 0 gh (the index-copy
  removal restored the count — unchanged).
- status-posted world, baseline: 4 git / 105 gh (100 `pulls/<n>/files` +
  issue + pulls list ×2 + comments + version).
- candidate steady state: 8 git / 5 gh. The +4 git = 1 `ls-remote`
  (answersKey base tip) + chain-fetch throttle landing on that run
  (fetch + for-each-ref ×2 — pre-existing once-a-minute read, not a new
  per-refresh cost).

## The snapshot regression found and fixed before this report

A first cut seeded the temp index by byte-copying `.git/index` (stat cache
→ `add -A` skips unchanged files). Probe `/tmp/kitchen-BT39-base/
probe-index-copy.mjs` replays both seed sequences verbatim:

- `update-index --assume-unchanged` + worktree edit → baseline ships edited
  bytes, copy ships stale bytes — DIVERGENT.
- `update-index --skip-worktree` + worktree edit → same divergence.
- racy same-size+mtime edit, staged add/delete → identical.

A copied index inherits AU/SW bits and stat cache; the snapshot contract is
"bytes in the working tree", not "what `git add` would notice". Reverted to
`read-tree` seed; regression tests for AU/SW live in `bt39.test.ts`. Create
is therefore at baseline speed; the speed limb of create is reported as a
partial blocker with the counterexample named.

## Measurements (five unfiltered consecutive runs unless marked)

| point | base d068844 | candidate | note |
|---|---|---|---|
| create @1k | 2279, 2313, 2313, 2325, 2799 → med 2313 | 3393, 2400, 2764, 2374, 2654 → med 2654 | ≈ baseline (host ≈90 % busy during candidate set) |
| create @10k | 18702, 16899, 18276, 18652, 17425 → med 18276 | 19846, 18915, 18956, 20420, 18062 → med 18956 | ≈ baseline |
| status @100 | 11087, 11474, 12214, 12250, 10833 → med 11474 | 12110, 1128, 796, 855, 863 → med 863 | run 1 regenerates once (new key incl. base tip), then record reads |
| bt17 JSON | — | byte-identical | per-step exit/lines/characters — JSON-level, not raw-text diff |
| 100k create | ENOBUFS 5/5 | see Result | single run |

Bites (scratch `cand-src`, restored): never-ship `BUILTIN_RULES=[]` →
9/13 named failures; scan `scanLine` muted → 2/4 named failures.
