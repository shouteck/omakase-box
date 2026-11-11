# K59 measurements: the slow tests on the hosted Windows runner

Read on 11 November 2026 from the hosted logs (`gh run view <id> --log`) and the job history (`gh api repos/shouteck/omakase-box/actions/runs/<id>/attempts/<n>/jobs`). Nothing here is from memory.

How a table was made: lines of the form `✓ <name> <n>ms` in a job's log, leaving out the ones that start with `tests/` (vitest prints a whole-file total for each file, minutes long, beside each test's own time). Reproduce with a filter over `gh run view <id> --log` that reads those lines.

## Before

### The Windows runner is three to six times slower than Linux on the same files

| File | Windows (run 43007131911) | Linux (same run) |
|---|---|---|
| `pf5.test.ts` (52 tests) | 310 s | 50 s |
| `bt51.test.ts` (18) | 180 s | 32 s |
| `answer.test.ts` (16) | 150 s | 18 s |
| `github.test.ts` (25) | 123 s | 17 s |
| `bt43.test.ts` (37) | 122 s | 25 s |

Tests taking 15 s or more: **Windows 17 / 19 / 13** (runs 43007131911 / 42975233441 / 43001061001), **Linux 1 each**, macOS 1 each.

### The slowest single tests on Windows, run 43007131911

| ms | Test | File | Own timeout? |
|---|---|---|---|
| 35,522 | independent bounties in same-address copies notify once… | `first-merge.test.ts` | no; passes because it is synchronous |
| 32,976 | T1: a run that changes nothing leaves the instruction block… | `bt38.test.ts` | yes, 180000 |
| 26,524 | produces the video, stills, transcript, screen and index… | `k16-record.test.ts` | yes, 290000 |
| 24,442 | asks at most five reads per command… | `pf5.test.ts` | yes, 180000 (describe) |
| 23,838 | T1 and T4 hold: reads leave the block and the chains alone… | `pf5.test.ts` | yes (describe) |
| 22,682 | every bounty command stays within its Git and gh start budget | `k14-start-budget.test.ts` | no |
| 20,642 | T4: every reading command appends no chain event… | `bt38.test.ts` | yes, 180000 |

Linux's slowest single tests in the same run: 16.5 s (the k16 recording), 11.6 s, 8.3 s.

A test over the limit can pass: vitest's timer cannot interrupt a test that is entirely synchronous (the 35.5 s one), so a test fails only when it still has an async step after the timer is overdue. That is why which test fails is different each time.

### Every hosted Windows verify job since K50 resumed (11 November, 05:46 UTC), attempts counted

| Run | Attempt | Commit | Result | Cause |
|---|---|---|---|---|
| 42968576447 | 1 | `059759b` (K50) | red | real: four tests spelling a temp folder differently (fixed in K50) |
| 42972218389 | 1 | `aab17f5` (K50) | green | |
| 42975233441 | 1 | `eb90502` (K50) | green | |
| 42975308141 | 1 | `47d00cd` (K50 scratch) | red | by design: a broken never-ship rule |
| 42975677006 | 1 | `09cfb3d` (K50 scratch) | green | by design: Windows ignores the hook's mode |
| 42987962187 | 1 | `ac925b6` (K50) | green | |
| 42997363465 | 1 | `3b94c32` (K50) | green | |
| 43007131911 | 1 | `9e970ba` (BT54) | green | |
| **43000354419** | 1 | `5280b2d` (master) | **red** | **one 30 s timeout, `report.test.ts:263`** |
| 43000354419 | 2 | `5280b2d` | green | the rerun |
| **43001061001** | 1 | `380812b` (BT54) | **red** | **one 30 s timeout, `bt7.test.ts:169`** |
| 43001061001 | 2 | `380812b` | green | the rerun |

Leaving out the one run with real failures and the two scratch runs red or green by design, that is **2 timeouts in 10 attempts**: one run in five, each in a different file. On this host's own full runs the same tests time out far more often (K50's three attempts: 5, 4 and 2 tests).

## After

To be filled when the proof runs finish (the same commit pushed to three scratch branches, three parallel hosted runs).
