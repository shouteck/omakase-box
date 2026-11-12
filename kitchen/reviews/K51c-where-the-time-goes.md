# K51c: where the test time goes

Measured by the CTO on 12 November 2026 on the owner's Windows host (Windows 10, Node 24.11.0), for [K51c](../../waves/K51c.md), after K51b asked "can the tests be faster". One worker, an otherwise idle machine, so these are cleaner than the hosted three-worker times and about the same operating system as the slow hosted job. No product code and no test changed.

## The finding

**Almost all of a test's time is starting other programs, and Windows starts them slowly.** The fixture is not the cost.

| what | time |
|---|---|
| a fresh test world (the K38 copy of a prepared repo, remote and state) | about 140 to 150 ms; the one-time build of the template 1.3 s (drafted) to 5.4 s (posted, collected) |
| one `git rev-parse` | 24 ms |
| `node -e 0` | 45 ms |
| one `omakase-box bounty describe` / `status` | about 200 / 230 ms |
| `renderStatus` in a posted world | 0.8 s: 13 child starts, 816 ms of the 866 ms (8 Git at 55 ms each, 5 `gh` stand-ins at 75 ms each) |
| `answerGitHub` (collect a pull request) | 1.35 s: 24 starts, 1323 ms (22 Git, 2 `gh`) |
| `closeBounty` | 1.4 s: 23 starts, 1382 ms (18 Git, 5 `gh`) |

The median of the 275 tests in the 12 slowest files is 3.1 s (55 under 1 s, 79 from 1 to 3 s, 141 over 3 s); that fits a test being a few commands and a command being 13 to 24 starts (I did not count commands per test). The 12 files hold 275 of 1257 bounty tests and 1074 s of one-worker time. The `gh` stand-in is a copy of `node.exe` running a script, so each GitHub call in a test pays a Node start; the tool's own Git calls average 55 ms, more than a bare `git rev-parse`; I did not trace why (the calls are merges, fetches and listings, not rev-parse).

| file | tests | total s | mean s | slowest s |
|---|---|---|---|---|
| pf5 | 52 | 220 | 4.2 | 17.6 |
| bt51 | 18 | 127 | 7.0 | 17.5 |
| answer | 16 | 100 | 6.2 | 10.3 |
| github | 25 | 85 | 3.4 | 9.0 |
| bt43 | 37 | 83 | 2.2 | 12.9 |
| report | 10 | 80 | 8.0 | 12.4 |
| github-history | 23 | 73 | 3.2 | 10.2 |
| bt32 | 14 | 70 | 5.0 | 9.1 |
| bt56 | 15 | 70 | 4.7 | 10.3 |
| bt13 | 15 | 65 | 4.3 | 9.4 |
| bt52 | 21 | 64 | 3.0 | 7.3 |
| bt46 | 29 | 38 | 1.3 | 3.4 |

Slowest single tests: `pf5` "T1 and T4 hold" 17.6 s, `bt51` "a late mark keeps the branch at the head" 17.5 s, `pf5` "asks at most five reads per command" 17.1 s, `bt43` the quoted-names journey 12.9 s, `report` "each answer is its own numbered attempt" 12.4 s.

## What can make the run faster

1. **Fewer child starts per command (product code, and users get it too).** A command that starts 13 to 24 programs costs 0.8 to 1.4 s on Windows. Where Git is asked the same question twice, or several questions a single `git cat-file --batch` or `for-each-ref` could answer, merging calls shortens every command in the product and every test that runs it. K14 already budgets program starts for some commands; `status`, `answerGitHub` (22 Git starts) and `closeBounty` (18) are the places to look. This needs a trace of which calls repeat, then its own wave with the start-budget test as the guard.
2. **Spread the Windows job over more runners** (split the bounty suite's files across two or three jobs). It changes no test or code and cuts wall time roughly in proportion; it needs the workflow and `verify`'s reading of results changed.
3. **Not the fixture.** At 150 ms of a 3 s median test, rebuilding it again would save about 5%.
4. **Test removal** is a small lever on this evidence: a removed test saves its few commands, and K51/K51b found no candidate set near a tenth.

## Method

`node node_modules/vitest/vitest.mjs run --maxWorkers=1 --config scripts/vitest.config.mjs --reporter=json --outputFile=<file>` over the 12 slowest files (`pf5 bt51 answer github bt43 bt52 bt13 github-history report bt32 bt56 bt46`); the start counts come from [K51c-count-starts.test.ts.txt](K51c-count-starts.test.ts.txt), a throwaway test (copy it into `tests/box/bounty/`, drop the `.txt`, run it with `K51_OUT=<file>`, delete it) that wraps `child_process.spawnSync` for one command in a posted world. One run each; the repeated runs of the fixture and command timings agreed within about 20%.
