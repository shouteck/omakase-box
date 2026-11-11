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

The same code (`5110411`: 60 s per test on Windows, 30 s elsewhere, plus the report step) on the wave branch and, with one marker file each so the push starts a run (a branch pointing at a commit already on the remote starts none), on three scratch branches, four hosted runs in parallel, 11 November 11:55 to 12:25 UTC. Linux, macOS, the install tests and the audit were green in all four.

| Run | Branch | Windows verify | Minutes |
|---|---|---|---|
| 43015911523 | `wave/K59` | **green** | 25.5 |
| 43016075721 | `wave/K59-try-1` | **green** | 27.6 |
| 43016081826 | `wave/K59-try-2` | **green** | 27.2 |
| 43016088251 | `wave/K59-try-3` | **green** | 24.6 |

**Four green Windows jobs, no timeout, against two timeouts in ten before.** That cannot prove a one-in-five flake is gone: four runs would all be green about 40 % of the time even if nothing had changed. It shows the flake did not recur, and the table below shows why it should not.

The report step's "Slowest tests on windows-2025", the same four runs: 31.5 to 37.2 s for `independent bounties in same-address copies…` (synchronous, no timeout of its own, passes whatever the limit), 30.0 to 33.7 s for `T1: a run that changes nothing…` (its own 180000), 26 to 28 s for the k16 recording (its own 290000), then the default-limit tests at 20 to 25 s: `every bounty command stays within its Git and gh start budget` 21.6 to 24.9 s, and **`records a waiting PR as new then seen before collection…` 23.4 s, the test that failed in BT54** (`bt7.test.ts:169`), which now has 60 s: 39 % of its limit instead of 78 %. Linux's slowest in the same runs: 15 to 16 s (the recording, its own timeout), then 11.7 s, then 8 s or less: a margin of two or more on a limit that stays 30 s.

Windows wall time is unchanged (24.6 to 27.6 min against 22.3 to 25.7 before): this wave buys reliability, not speed.

## What the change does not do

- A test that is entirely synchronous and over the limit still passes, as before; nothing here makes such a test fail.
- A real hang on Windows is now reported 30 s later than before.
- Tests with their own timeout are untouched.
- Setup hooks have their own limit, `hookTimeout`, which K59 left at Vitest's 10 s default: master's K59 merge run 43024146368 failed on Windows with `Hook timed out in 10000ms` in `bt8c.test.ts` and `pf26.test.ts`. Raised on Windows by [K60](../../waves/K60.md).
