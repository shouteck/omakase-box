# K51b: what every test defends, read from the tests

Written by the CTO on 12 November 2026 for [K51b](../../waves/K51b.md), the owner's "a more thorough examination of the tests", after [K51](K51-tests.md) stopped at its cut-off. **This replaces K51's keyword protection with a count of the tests that defend a hard stop, found by what they assert and by reading their titles.** No product code and no test was changed.

## What this is and is not

- **A static count.** The extractor reads each `tests/**/*.test.ts` with the TypeScript compiler and lists the `it`/`test` calls it finds: **1513 tests in 145 files.** The runner reports 1880 because `it.each` tables and loops expand into several tests at run time (52 table calls). Shares below are of the static count.
- **Three signals, kept apart.** (1) *By name*: a test whose body names one of the hard-stop refusal reasons. (2) *By reading*: I read the titles of the 76 tests whose title mentions a hard-stop word and of the 113 whose body mentions one without the title doing so, and judged each; the judgement is data in [K51b-guards.json](K51b-guards.json), with every line checked against the extraction. (3) Neither signal sees a test that defends a stop in words I did not search for; that is the main limit.
- **The hard stops** are AGENTS.md's three: never-ship files never enter a bounty or come back (HS1), a private repository is never posted outside (HS2), nothing happens beyond the owner's authority (HS3). Beside them: **HS2-board**, the platform's tests that a private repository is never listed, and **SCAN**, the secret scan, which holds a publish for the owner and supports HS1 and HS3 without being one.
- **Reproduce:** `node kitchen/reviews/K51b-extract.mjs > extraction.json`, then `node kitchen/reviews/K51b-analyse.mjs extraction.json`.

## 1. The hard-stop guards: 85 tests

**85 of 1513 tests (5.6%) in 28 of 145 files defend a hard stop.** By stop: HS1 never-ship 35, HS2 private repository 3, HS3 owner authority 37, HS2-board 10. A further 29 tests defend the secret scan and 9 touch a hard stop's words or files without defending it. 109 files hold no hard-stop test of any kind.

| file | guards | of tests | scan | related |
|---|---|---|---|---|
| box/bounty/never-ship | 12 | 13 | 0 | 0 |
| box/bounty/bt13 | 7 | 15 | 2 | 0 |
| box/bounty/bt16 | 7 | 18 | 0 | 0 |
| box/bounty/bt8 | 7 | 16 | 4 | 0 |
| box/bounty/github-history | 7 | 20 | 0 | 0 |
| box/bounty/bt48 | 6 | 16 | 0 | 0 |
| box/bounty/bt8c | 5 | 19 | 3 | 0 |
| box/bounty/bt52 | 4 | 17 | 0 | 0 |
| box/bounty/bt8a | 4 | 21 | 0 | 0 |
| box/bounty/bt15-guarantees | 3 | 4 | 0 | 0 |
| platform/refresh | 3 | 23 | 0 | 0 |
| box/bounty/github | 2 | 19 | 0 | 0 |
| platform/machine | 2 | 28 | 0 | 0 |
| platform/pages | 2 | 42 | 0 | 0 |
| box/bounty/answer | 1 | 16 | 0 | 0 |
| box/bounty/bt11 | 1 | 26 | 0 | 0 |
| box/bounty/bt14 | 1 | 13 | 0 | 0 |
| box/bounty/bt18 | 1 | 11 | 0 | 0 |
| box/bounty/bt23-review | 1 | 3 | 0 | 0 |
| box/bounty/bt40 | 1 | 6 | 0 | 0 |
| box/bounty/bt51 | 1 | 18 | 0 | 0 |
| box/bounty/bt60 | 1 | 9 | 0 | 0 |
| box/bounty/bt61 | 1 | 7 | 0 | 0 |
| box/bounty/create | 1 | 15 | 0 | 3 |
| box/bounty/record | 1 | 12 | 0 | 0 |
| platform/account | 1 | 41 | 0 | 0 |
| platform/hints | 1 | 10 | 0 | 0 |
| platform/payments | 1 | 41 | 0 | 0 |

Files holding only scan or related tests, no guard: box/bounty/bt32-pass-probes (scan 1, related 0), box/bounty/bt32 (scan 1, related 0), box/bounty/bt43 (scan 0, related 3), box/bounty/bt45 (scan 1, related 0), box/bounty/bt54 (scan 13, related 0), box/bounty/bt7b (scan 0, related 1), box/bounty/pf5 (scan 0, related 2), box/bounty/scan (scan 4, related 0).

## 2. What this does to K51's statements

K51 protected 45 test files by a keyword search (and the real-journey rule) and said four of the five slowest "guard a hard stop". Against the map:

| slowest files | tests | hard-stop guards | scan | related |
|---|---|---|---|---|
| box/bounty/answer | 16 | 1 | 0 | 0 |
| box/bounty/bt43 | 35 | 0 | 0 | 3 |
| box/bounty/bt51 | 18 | 1 | 0 | 0 |
| box/bounty/github | 19 | 2 | 0 | 0 |
| box/bounty/pf5 | 34 | 0 | 0 | 2 |

- **Over-protected.** The 45 protected files hold 497 tests and 64 guards; 26 of the 45 hold no guard at all (box/bounty/bt11b-pass, box/bounty/bt12-install, box/bounty/bt12-package, box/bounty/bt17, box/bounty/bt19, box/bounty/bt22, box/bounty/bt43, box/bounty/bt5, box/bounty/bt54, box/bounty/bt61-agreement, box/bounty/bt61-boundary, box/bounty/bt61-journey, box/bounty/bt61-text, box/bounty/bt7-cli, box/bounty/bt7b-review, box/bounty/bt7b, box/bounty/bt7c-review, box/bounty/cli, box/bounty/first-merge, box/bounty/json-agreement, box/bounty/k14-start-budget, box/bounty/pf24, box/bounty/scan, box/bounty/snapshot, kitchen/k15-sandbox-guard, kitchen/k19-github-standin). Many of those are real-journey files, protected by the brief's separate journey rule; the rest were protected by a word.
- **Under-protected.** 9 files with 21 guards were not on the list: box/bounty/bt13 (7), box/bounty/bt52 (4), platform/refresh (3), platform/machine (2), box/bounty/bt11 (1), box/bounty/bt60 (1), platform/account (1), platform/hints (1), platform/payments (1). Had K51 treated every file outside the list as free to remove, it could have cut a hard-stop guard (`bt13`'s seven owner-authority tests, for one).
- **A second overclaim.** K51 called "nothing a solver wrote runs" a hard stop in describing the `bt6b` passes. AGENTS.md's three hard stops do not include it; it is a product rule the `bt6b` files defend. They stay a candidate class only on their own evidence (K51: they add cases the main file does not hold).
- **What stands.** K51's cut-off decision: the named candidate class (ten review and probe files, about 100 s of Windows wall time at the ceiling) does not reach a tenth, and nothing was removed. That rests on the timing table and on those files adding cases, not on the keyword protection.

## 3. Refusal names and the tests that name them

The code constructs **170 distinct refusal reasons** (CONTRACTS lists 145; the 25 it misses are the solver side and later waves: already-taken, attempt-ended, attempt-mismatch, attempt-retargeted, attempt-withdrawn, below-owner-floor, board-off, board-unread, bounty-branch-moved, bounty-id-invalid, bounty-not-open, discover-from-invalid, github-fork-failed, language-invalid, not-taken, not-taken-yet, not-waiting, nothing-to-submit, outside-owner-limits, pull-request-moved, reward-required, solving-off, taken-record-unreadable, taken-status-options, workspace-exists). Counting the tests whose body names a reason:

- **41 reasons are named by no test**, 11 of them in the 25 not in CONTRACTS. A test may still prove one through its message text or an indirect check, so this is "no test names it", not "unproven": allow-arguments, attempt-ended, attempt-withdrawn, authority-arguments, board-off, discover-from-invalid, git-missing, git-too-old, github-account-changed, github-cli-unsafe, github-fork-failed, github-git-failed, github-include-missing, github-issue-changed, github-pr-changed, github-pr-unreadable, github-unmerged-paths, instruction-file-changed, instruction-file-missing, instruction-file-not-file, instruction-import-unmaintained, instruction-settings-not-file, language-invalid, legacy-task-unavailable, manifest-tampered, merge-failed, merge-in-progress, missing-task, not-github-posted, not-postable, not-posted, not-taken, not-taken-yet, not-waiting, publish-list-settings-link, settings-inside-repo, settings-write-failed, shared-issue-closed, solution-unreadable, taken-record-unreadable, workspace-exists.
- **59 reasons are named by exactly one test.** The hard-stop reasons and their counts: never-ship-input 4; github-never-ship 5; github-include-never-ship 1; publish-list-never-ship 1; answer-never-ship 5; github-private-repository 3; owner-allow-needed 14; owner-answer-needed 13; merge-held 10; merge-approval-agent 2; settings-hard-stop 1; project-claims-list 1; project-claims-reward 1; authority-arguments 0.
- **`authority-arguments`** (HS3's argument check) is named by no test. That is the one hard-stop reason with none; whether another test proves it is for a fresh look at the code (BACKLOG).

## 4. Coverage by file: tried, not possible here

The brief asked to pilot per-file code coverage with Node's own `NODE_V8_COVERAGE`. The pilot ran `scan.test.ts` alone: the coverage output held the runner and Node's own scripts but **no script from `packages/` or `tests/`** — the test worker evaluates its code in a way that gives V8 no file name (`evalmachine.<anonymous>`). Getting file-level coverage needs `@vitest/coverage-v8`, which is not installed (a new development dependency, the CTO's to add) and still would not see the **75 of 145 test files that drive the built command-line tool as a separate process**. So no per-file "what it alone reaches" column exists; the answer to "which file proves nothing another does not" stays the K51 proof method, and the map above narrows where to point it.

## 5. What the owner can decide

- Nothing is removed by this wave, and the map does not make anything removable by itself.
- If the run must get shorter, the next step is to take the **tests no signal ties to a hard stop or a unique reason** inside a slow file and prove each redundant by the K51 break-and-red method. Start with the 109 files that hold no hard-stop test.
- `authority-arguments` and the 30 CONTRACTS reasons no test names deserve one look each: a test, or the reason retired. CONTRACTS lacks the solver side's 25 reasons.
