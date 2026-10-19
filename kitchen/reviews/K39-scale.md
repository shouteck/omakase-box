# K39 — the four unmeasured scale targets, measured

Measured on 19–20 October 2026 against the built CLI
(`packages/box-cli/dist/cli.js`) and the GitHub stand-in extracted verbatim
from `tests/box/bounty/github-fixture.ts`, by
`kitchen/memory/scale/measure.mjs` (five runs per point, scratch worlds under
`%TEMP%\kitchen-k39-*`, removed on exit). Wall time = process start to exit.

**Host:** Intel Core i5-9400F, 6 logical cores, 16 GB (2–3 GB free during the
runs). `os.loadavg()` is a stub on Windows — never observed load; each cell
instead carries a ~250 ms sampled CPU-busy figure (28–92 % across the
session; the box was busy, so treat absolute times as a loaded-host reading).

## Verdicts

| # | PLAN.md target | Result | Verdict |
|---|---|---|---|
| 1 | `create` < 1 s on 10,000 files | median **20,617 ms** (17.9–22.2 s); at 100,000 files `create` **fails outright** (ENOBUFS, 5/5 runs) | **missed** — ~20× over at 10k; broken at 100k |
| 2 | one whole `post` < 30 s | median **2,193–2,356 ms** across 0/5/50 unpushed commits | **met** (13× margin) |
| 3 | `status`/`look` usable at 100 solutions | `status` ~8.8 s steady, `look` ~0.35 s, output bounded at 108 lines / 4,802 chars | **met** |
| 4 | `apply`/`close` cheap at 1,000 records | apply 2,738 ms (vs 1,950 at 10), close 2,133 ms (vs 1,353 at 10) | **met** |

## Target 1 — `create` (goal: < 1 s at 10,000 files) — MISSED

Scratch repos: N tracked files across `src/dir-XXXX/` (mixed 300 B–150 KB),
TASK.md, AGENTS.md, 8 uncommitted edits, 6 untracked files. Verified counts:

| N | tracked (`git ls-files`) | files on disk | fixture: generation | fixture: add+commit |
|---|---|---|---|---|
| 1,000 | 1,002 | 1,002 | 579 ms | 1,485 ms |
| 10,000 | 10,002 | 10,002 | 4,721 ms | 11,109 ms |
| 100,000 | 100,002 | 100,002 | 40,530 ms | 129,224 ms |

Runs (ms, wall start→exit):

| N | run 1 | run 2 | run 3 | run 4 | run 5 | median | range | cpuBusy |
|---|---|---|---|---|---|---|---|---|
| 1,000 | 2,269 | 2,297 | 2,351 | 2,569 | 2,318 | **2,318** | 2,269–2,569 | ~73% |
| 10,000 | 17,914 | 20,617 | 21,053 | 22,243 | 20,317 | **20,617** | 17,914–22,243 | ~81% |
| 100,000 | 67,070 | 55,884 | 52,558 | 53,278 | 49,475 | **52,778** | 49,475–67,070 | ~62% |

**At 100k all five `create` runs exit 1**, each after paying the snapshot
`add -A`: `git -c core.quotepath=false ls-tree -r -z --format=… <commit>
failed` — the tool's generic `git()` spawnSync
(`packages/box-bounty/git.ts:204`) sets no `maxBuffer`, so Node's 1 MiB
default kills the listing (the fixture's tree prints 1,052,672 bytes).
Isolated call with the same buffer semantics: **5/5 ENOBUFS in 1,426–1,835 ms**.
`cat-file blob`/`--batch` calls already set 512 MiB (`git.ts:337,352`);
`ls-tree` does not.

Even before that wall, the curve says the < 1 s target is unreachable in
this shape: ~1.9–2.3 s at just 1,000 files (CLI start + git spawns is the
floor), ~20 s at 10,000 — the snapshot re-hashes every worktree file through
a temp `GIT_INDEX_FILE` + `add -A` on each `create`.

## Target 2 — whole `post` (goal: < 30 s) — MET

World: repo + bare remote stand-in + `origin git@github.com:owner/project.git`;
fresh draft and one dirty tracked file per run (`--with-changes` builds the
wip commit each time). Breakdown legs measured separately.

| leg | 0 unpushed | 5 unpushed | 50 unpushed |
|---|---|---|---|
| `git push` control (same tip→fresh ref) | 126 ms med (125–141) | 138 ms med (125–152) | 129 ms med (125–257) |
| `post --preview --with-changes` (plan+scan, no publish) | 1,197 ms med (1,165–1,209) | 1,219 ms med (1,173–1,554) | 1,203 ms med (1,192–1,370) |
| **`post --with-changes` (measured)** | **2,193 ms** (2,088–2,255) | **2,356 ms** (2,214–2,373) | **2,337 ms** (2,202–2,673) |

Dominant cost is the local leg (plan+scan ≈ 1.2 s, ~half the post); the push
is ~0.1 s and the stand-in gh calls are a handful of ~40–140 ms processes.
Per post, gh call count from the stand-in log: small constant (~5–8 calls).
Number of unpushed commits is irrelevant to the wall time at these sizes.

## Target 3 — 100 solutions on one bounty — MET

One posted bounty; 100 open PRs in the stand-in, each a real `commit-tree`
commit descending from `refs/heads/box-bounty/<id>` and pushed to
`refs/pull/<n>/head`. Verified: 100 PRs in stand-in state, 100 pull refs on
the remote.

| surface | runs (ms) | median | range | cpuBusy |
|---|---|---|---|---|
| `status` — first discovery (collects all 100) | 9,107 | — | — | ~33% |
| `status` — steady state | 8,263 / 8,906 / 8,754 / 8,639 | **8,754** | 8,263–8,906 | |
| `status --full` | 8,542 / 9,300 / 8,880 / 8,933 / 8,877 | **8,880** | 8,542–9,300 | ~29% |
| `status --json` | 9,530 / 8,684 / 9,016 / 30,257 / 17,973 | **9,530** | 8,684–30,257 | ~33% |
| `look <id> 1` | 1,638 / 547 / 372 / 351 / 324 | **372** | 324–1,638 | ~49% |
| `look <id> 100` | 2,104 / 395 / 329 / 340 / 305 | **340** | 305–2,104 | ~40% |

Output size of `status`: **108 lines / 4,802 chars** — bounded, BT28's
bound holds (it does not grow with the 100 attempts). First-discovery vs
steady-state differ little (~9.1 s vs ~8.8 s) — collection of the 100 unseen
attempts is not the dominating cost; the ~8.7 s steady floor is 100
per-attempt facts renders + git reads. `status --json` had one 30 s outlier
(host contention, cpuBusy sample was taken before the run); the other four
runs cluster ~8.7–9.5 s. "Usable" judgement: ~9 s reads are workable; `look`
is fast either end of the list.

## Target 4 — `apply`/`close` at 1,000 records — MET

K25 generator: N−? compat records seeded into `.box/bounties/*.json`,
imported by the store's own path on the next command (verified count of
record files seen: 1,000 / 10 seeded). Then 10 real posted bounties each
with one solver PR collected via `look` — 5 applied, 5 closed.

| op | records | runs (ms) | median | range | cpuBusy |
|---|---|---|---|---|---|
| `apply` | 10 | 2,894 / 2,877 / 1,950 / 1,934 / 1,920 | **1,950** | 1,920–2,894 | ~47% |
| `close` | 10 | 1,416 / 1,392 / 1,353 / 1,339 / 1,315 | **1,353** | 1,315–1,416 | ~47% |
| `apply` | 1,000 | 2,547 / 2,433 / 2,738 / 3,785 / 2,953 | **2,738** | 2,433–3,785 | ~49% |
| `close` | 1,000 | 2,300 / 2,120 / 2,133 / 2,280 / 1,961 | **2,133** | 1,961–2,300 | ~49% |

Cost grows ~1.4–1.6× from 10→1,000 records (the write re-syncs open
surfaces over all records) — sub-linear, stays ~2–3 s. Cheap in absolute
terms on this host.

## Notes and limits

- All times include Node CLI start (~0.5–1 s on this loaded box) — that is
  the honest end-user wall time, and also the floor for target 1's goal.
- The 100k `create` failure is deterministic (fixed 1 MiB buffer), not a
  timing flake — retried 5×, identical refusal each time; the isolated call
  reproduces ENOBUFS in ~1.5 s.
- `measure.mjs --target=<n>` reruns any single target; default is all four.
  Target 1 is the slow point (~30 min at 100k on NTFS+Defender); the script
  reports fixture generation/add times beside the measured runs.
- Stand-in realism: same `standin.cjs` + preload the bounty suite pins;
  pushes land on a local bare repo (protocol fetch for `refs/pull/*/head`,
  not local clone tricks).
