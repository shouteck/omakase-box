# BT39 performance notes - buffers, profiles, spawn audit, bites

## Accepted Result (Supersedes Intermediate Measurements Below)

Accepted SHA: `23e7cbe9638fdf85cfa9580eb58c9f4a9607791d`; independent
PASS `de40d03`, final output-measurement evidence `2a8dffb`. Earlier
pure-native path resolution was rejected for changing binary/scan/note path
spelling on case-divergent Windows repositories. The guarded fast path
retains the input spelling for an unchanged case-folded offset; redirects
use the original JS resolver. The unsafe index-copy experiment was removed.

| Final point | Baseline runs (ms) | Accepted-code runs (ms) | Median / range |
|---|---|---|---|
| create, 1k | 2279, 2313, 2313, 2325, 2799 | 3348, 2200, 2237, 2751, 3188 | 2313 / 2279-2799 -> 2751 / 2200-3348 |
| create, 10k | 18702, 16899, 18276, 18652, 17425 | 26015, 15917, 17823, 18429, 14816 | 18276 / 16899-18702 -> 17823 / 14816-26015 |
| status, 100 PRs | 11087, 11474, 12214, 12250, 10833 | 12110, 1128, 796, 855, 863 | 11474 / 10833-12250 -> 863 / 796-12110 |

These are unfiltered observations on this Windows host, not an idle-host
benchmark or a statistically established speedup. The final 10k median is
about 2.5% lower, with overlapping spread; the final worker 1k median is
higher. The 26,015 ms observation overlapped a scoped red-proof suite, so
the final create cohort is not a fully isolated timing comparison.
CPU-busy sampling was recorded per cohort, not per individual command.
Earlier approximately 10-13% create gains below belong to superseded code.
Parent CPU profiles locate cost; they do not measure child Git CPU.
The profile of the native resolver predates its spelling guard, so it
supports the mechanism, not an exact final-code CPU fraction.

Status's first observation pays for regenerating a saved listing; the four
subsequent observations reuse it. Five observations support the mixed
sequence median, not a five-sample steady-state claim. On the measured
world, gh starts fall from 105 to 5; Git starts were 4 to 8 including a
pre-existing chain-refresh interval and the new remote-base-tip read.
No real-GitHub latency or sustained service-level target was measured.

The reviewer completed create at 100,002 tracked files on the accepted
code: exit 0, `bt-9bf7eb48cfa4`, **194,476 ms**, one run only. This is not a
proof of unlimited project size: buffered Git output has a finite 512 MiB
limit and failures must remain named.

The reviewer ran `bt17-measure.mjs` on accepted code and compared its JSON
byte-for-byte with the baseline: identical, 2,565 bytes, empty stderr.
That script measures exit/line/character counts, not raw CLI text. A live
baseline/candidate `low.bin` versus disk `LOW.BIN` probe additionally
confirmed the corrected path-text boundary. Never-ship and scan mutation
checks failed as expected; all 750 bounty and 136 kitchen tests passed.

Planning budgets derived from this profile and agent workflow: create
3 s at 1k, 20 s at 10k, successful 100k capture; status 2 s with an unchanged
100-PR listing and 15 s when listing facts change. These are median goals
for like-for-like local stand-in cohorts, not per-invocation guarantees.
The historic under-1-second create target remains a recorded miss.
Raw scratch was inspected by the pass; it is disposable and removed at
close. The tables, mutation descriptions and Git/verify records are the
durable evidence.

## Intermediate Investigation (Historical, Not Final-Code Claims)

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

## Final create speedup: native realpath in `classifySnapshot`

The profile's second-largest parent-side cost after the scan's `open`/`read`
was the JavaScript `realpathSync` — it lstats every path component
(~18–20 % lstat + part of `open` at 10k files). `realpathSync.native`
resolves links and junctions in one system call and returns the on-disk
spelling. Equivalence: containment still runs through `relative` on two
resolved paths (win32 `relative` compares case-folded), dedup and the
never-ship rules already key on lowercase, and the escape/unreadable
refusals are unchanged — only the *spelling* of `canonical`/`realPath` can
now differ, and only when the on-disk case differs from the tree spelling
(the JS form never corrected case or expanded 8.3 aliases — BT26's caveat;
native is strictly the truer canonical). Regression tests in bt39.test.ts:
junction escape still refused `link-escape`; a tracked file whose disk case
differs from its tree spelling still ships exactly once.

Measured (five unfiltered consecutive runs, kept world
`kitchen-k39-izGNxL`, same fixtures as the baseline rows):

| point | base d068844 | candidate (native) | note |
|---|---|---|---|
| create @1k | med 2313 (2279–2799) | 3114, 2086, 2028, 2068, 2091 → med **2086** | ≈10 % faster; runs above/below base min are spread, median clearly under |
| create @10k | med 18276 (16899–18702) | 21165, 14282, 16732, 14399, 15910 → med **15910** | ≈13 % faster; min 14282 under base min 16899 |

Raw: `post-1k-native.log`, `post-10k-native.log`,
`result-t1-*-native.json`; profile `cpuprof/create-t1-10000-plain-
1792442868144.cpuprof` (candidate, 15,664 ms / 7,966 samples): `open`
45 % (scan reads — contract-bound), `spawnSync` ≈32 % (`add -A` hashing
in the git child), native `realpath` 7.6 %, `stat` 2.5 % — `lstat` is no
longer a named frame at all (was 18–20 %). Prior rows below keep their
provenance — the index-copy candidate's numbers are not the final build's.
Bite re-run after the path change (scratch `cand-src`, canonicalisation
neutralised to `absolute`): bt39 junction-escape + 6 never-ship/create
junction tests fail by name — log `bite-canonical.log`, source restored.

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
