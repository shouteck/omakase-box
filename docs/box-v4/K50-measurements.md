# K50 measurements: one wave, local against hosted

Measured 10 and 11 November 2026 by the CTO; the numbers are read from GitHub (`gh run list`, `gh run view`) and from `.kitchen/runs/` on the Windows host. Wall time is created-at to last job's end, so it includes queueing (every job started within 3 seconds of the push, every time).

## Before and after

| | Before (the old rule) | After (K50) |
|---|---|---|
| Who gives the verdict | a full `verify` on the Windows host, by hand | the hosted run on the wave's commit, on Linux, Windows and macOS |
| Systems seen before a merge | Windows only; Linux after the merge | all three, before the merge |
| Minutes to a verdict for one candidate | local full profile: median **22.5** (n=32, range 19.6 to 33.3; kitchen-stats, 10 Nov). BT63's candidates: 24.2 (failed on a timeout), 28.7 (failed, a kitchen test), 28.5 (passed) | hosted, all three systems: **25.7** (Windows is the long pole). Linux alone **6.1**, macOS **8.9** |
| What the host does meanwhile | runs flat out; nothing else safely | nothing; the CTO reads, edits, runs the next check |
| Local full runs this wave needed | | **0** until the one the brief requires on the final commit (below) |

Hosted Linux-only on master, before K50, push to verdict: median **5.3** minutes (23 finished runs, 4.0 to 22.5; 17 more were cancelled by a newer push; 3 to 10 Nov).

A hosted run costs the CTO no host time but is not faster for Windows: 25.7 minutes against 22.5 locally. The gain is coverage (three systems, and the two that found faults the host cannot see) and a quiet host, not speed.

## Every hosted run on the K50 branches (none cancelled)

| Run | Branch | Commit | Result | Minutes |
|---|---|---|---|---|
| 42802182752 | `wave/K50` | `9df199a` | red: audit (two high advisories), Linux (no local `master`), Windows 23 tests, macOS 10 | 22.4 |
| 42806106580 | `wave/K50` | `5a2fd5e` | red (the park push) | 23.6 |
| 42968576447 | `wave/K50` | `059759b` | red: Windows 4 tests, macOS 7; audit, Linux, both Linux and Windows install tests green | 22.3 |
| 42972218389 | `wave/K50` | `aab17f5` | red: macOS verify, one platform test (a 30 s timeout on the select arrow key); everything else green | 22.9 |
| **42975233441** | `wave/K50` | `eb90502` | **green on all seven jobs** | 25.7 |
| 42975308141 | `wave/K50-bite-nevership` | `47d00cd` | red, as meant (below) | 22.9 |
| 42975677006 | `wave/K50-bite-chmod` | `09cfb3d` | red on Linux and macOS, green on Windows, as meant | 25.9 |

## The final run, per system (42975233441)

| System | verify | install test (Node 22) | Skipped (bounty / kitchen / platform) |
|---|---|---|---|
| ubuntu-24.04 | green, 6.1 min | green | 19 / 0 / 0 |
| windows-2025 | green, 25.6 min | green | 2 / 0 / 0 |
| macos-15 | green, 8.9 min | green | 19 / 0 / 1 |
| audit (one Linux job) | green: `pnpm audit --prod --audit-level high` | | |

Tests passed: ubuntu 1143 + 152 + 448, windows 1160 + 152 + 448, macos 1143 + 152 + 447 (bounty, kitchen, platform). Each skip is named beside its assertion with its reason (search the tests for `Host-only`); the workflow prints each suite's count per system in a step called "Skips on <system>".

## The check still bites

- **A broken never-ship rule** (the `.env` rule made to match nothing), run 42975308141: verify **red on all three systems** (job times: Linux 3.6 min, macOS 6.8, Windows 22.8).
- **A fault only Linux shows** (`bt51.test.ts`'s hook written without `chmodSync`, so Git ignores it), run 42975677006: verify **red on Linux and macOS** (three `bt51` tests) and **green on Windows**, which does not look at the executable bit. The brief expected Linux red, Windows green; macOS red too is the finding.
- Both scratch branches deleted, locally and on origin.

## What the first macOS evidence found

Nothing had ever run on macOS. Four findings, each fixed or skipped by name:

1. Tests handed the library the runner's raw temp path (macOS `/var` is a link to `/private/var`; GitHub's Windows machine spells it `C:\Users\RUNNER~1`) where the CLI hands it the canonical one: `runRoot` now returns the canonical folder. This is also what BT64 found on Windows (a never-publish entry could be missed).
2. The install test's scrubbed `PATH` had no `/bin`, so npm could not start `sh` (macOS only; Windows has System32 in the same list).
3. The arrow key on a closed `<select>` opens its menu on macOS instead of changing it, so one platform test timed out; its select step is now its own test, skipped on macOS. This is **inferred from the timeout, not observed**.
4. A second high advisory, `source-map-js` through `next` and `postcss`, which the brief did not know of: one `pnpm` override lifts it to 1.2.2.

Not found by this wave: Linux or macOS runs of anything the board's Worker does in production; the hosted runs are the tool's tests, not the deploy.

## Inert pushes

A push touching only `docs/box-v4/K50-measurements.md` starts no run (shown on `wave/K50`, below).
