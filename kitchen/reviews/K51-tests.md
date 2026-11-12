# K51: what each test file costs, and why nothing is removed

Measured by the CTO on 12 November 2026 from three hosted runs of master and wave branches (run ids below). **Result: no candidate set reaches a tenth of the run, so by the brief's cut-off (step 3) nothing was removed, no test was changed and the proof phase did not start.**

## 1. The protected list (step 1)

Searched `tests/` for the brief's terms. Out of scope for removal, whatever the timing says:

- **`never-ship`**: answer, bt15-guarantees, bt18, bt40, bt43, bt48, bt51, bt7b-review, bt7b, bt8a, bt8c, create, github-history, github, k14-start-budget, never-ship, snapshot (all `tests/box/bounty/`), and `tests/platform/pages.test.ts`.
- **`github-private-repository`**: bt15-guarantees, bt8, github.
- **`owner-allow-needed`**: bt14, bt16, bt23-review, bt61, bt8, bt8a, record.
- **`scanPatch`**: bt54, scan.
- **`foreignFields`**: bt43, bt61-boundary, pf24.
- **Journeys** (name or comment says "journey", or the packed tool end to end): answer, bt11b-pass, bt12-install, bt12-package, bt17, bt19, bt22, bt43, bt48, bt5, bt61-agreement, bt61-journey, bt61-text, bt7-cli, bt7c-review, cli, first-merge, json-agreement, k14-start-budget, `tests/kitchen/k15-sandbox-guard`, `k19-github-standin`, `tests/platform/pages`.
- **Platform files that drive a payment** (by search for stripe, paypal, charge, payout in `tests/platform/`): account, charge, hints, pages, paypal, pf15, pf32; the rest of `tests/platform/` is kept too, because the brief names no platform candidates.

Of the five slowest bounty files (pf5, bt51, answer, github, bt43) four are protected; `pf5` is not.

## 2. The timing (step 2)

Source: the hosted logs of three runs, each with all three systems: `43184628868` (`49ae7c5`), `43147561140` (`6d2ae4a`), `43134763809` (`c7f8382`), the runner's own per-file line (`✓ file (N tests) Nms`). Median of the runs that contained the file; the spread is the Windows maximum minus minimum. Runs differ in how many files existed (138, 144, 145), so a file added later has fewer runs (`runs`). Seconds. Files run in parallel, so a file's time is not wall time.

**Local timing is not per file:** the local runner prints only the suite total (about 15 minutes for the bounty suite on this Windows host, one run, in the BT55 check), so the table does not claim local per-file medians. The hosted Windows jobs run the same operating system, and the decision below does not depend on the local column.

Suite wall time (the `Duration` line), bounty / kitchen / platform: Ubuntu 203 / 36 / 51 s; macOS 411 / 61 / 89 s; Windows 879 / 65 / 54 s in the last run, 1163 / 77 / 68 s and 915 / 68 / 56 s in the two before. Whole `verify` job: Ubuntu 251 s, macOS 488 s, Windows 955, 1255 and 994 s. Windows is the long pole.

Totals of the file times (bounty suite, 106 files, 1257 tests): Ubuntu 574 s, macOS 1042 s, Windows 2763 s against a Windows wall of 879 to 1163 s: about three files run at once.

| file | tests | ubuntu | windows | macos | win spread | runs |
|---|---|---|---|---|---|---|
| box/bounty/pf5.test.ts | 52 | 47 | 201 | 81 | 51 | 3 |
| box/bounty/bt51.test.ts | 18 | 31 | 132 | 55 | 30 | 3 |
| box/bounty/answer.test.ts | 16 | 16 | 96 | 32 | 37 | 3 |
| box/bounty/github.test.ts | 25 | 16 | 81 | 28 | 46 | 3 |
| box/bounty/bt43.test.ts | 37 | 25 | 80 | 37 | 20 | 3 |
| box/bounty/bt52.test.ts | 21 | 12 | 74 | 19 | 53 | 3 |
| box/bounty/bt13.test.ts | 15 | 13 | 72 | 20 | 49 | 3 |
| box/bounty/github-history.test.ts | 23 | 12 | 71 | 25 | 16 | 3 |
| box/bounty/report.test.ts | 10 | 12 | 71 | 21 | 21 | 3 |
| box/bounty/bt32.test.ts | 14 | 11 | 68 | 26 | 17 | 3 |
| box/bounty/bt56.test.ts | 15 | 15 | 67 | 23 | 22 | 3 |
| box/bounty/bt46.test.ts | 29 | 7 | 66 | 13 | 24 | 3 |
| box/bounty/bt11b.test.ts | 17 | 9 | 63 | 19 | 19 | 3 |
| box/bounty/bt7b-review.test.ts | 15 | 11 | 61 | 17 | 30 | 3 |
| box/bounty/bt11.test.ts | 26 | 17 | 60 | 25 | 17 | 3 |
| box/bounty/bt6b-holes.test.ts | 8 | 11 | 57 | 24 | 17 | 3 |
| box/bounty/bt6b-third.test.ts | 7 | 11 | 53 | 23 | 14 | 3 |
| box/bounty/bt10.test.ts | 16 | 8 | 52 | 17 | 8 | 3 |
| box/bounty/bt6b-second.test.ts | 7 | 9 | 52 | 21 | 15 | 3 |
| box/bounty/first-merge.test.ts | 9 | 10 | 49 | 21 | 16 | 3 |
| box/bounty/bt8.test.ts | 27 | 7 | 47 | 14 | 24 | 3 |
| box/bounty/bt7.test.ts | 9 | 9 | 46 | 14 | 17 | 3 |
| box/bounty/bt8a.test.ts | 27 | 8 | 45 | 14 | 19 | 3 |
| box/bounty/bt6b.test.ts | 7 | 10 | 43 | 18 | 12 | 3 |
| platform/pages.test.ts | 52 | 36 | 42 | 61 | 9 | 3 |
| box/bounty/bt38.test.ts | 5 | 12 | 42 | 22 | 14 | 3 |
| box/bounty/bt15.test.ts | 29 | 8 | 41 | 13 | 24 | 3 |
| box/bounty/bt19.test.ts | 11 | 9 | 36 | 15 | 17 | 3 |
| box/bounty/bt11b-pass.test.ts | 10 | 7 | 35 | 15 | 11 | 3 |
| box/bounty/bt8c.test.ts | 19 | 6 | 34 | 12 | 10 | 3 |
| box/bounty/bt37.test.ts | 14 | 7 | 33 | 13 | 10 | 3 |
| box/bounty/bt7b.test.ts | 11 | 5 | 28 | 10 | 9 | 3 |
| box/bounty/pf26.test.ts | 7 | 8 | 27 | 9 | 34 | 3 |
| box/bounty/bt16.test.ts | 18 | 5 | 26 | 7 | 9 | 3 |
| box/bounty/bt49.test.ts | 10 | 5 | 26 | 11 | 8 | 3 |
| box/bounty/bt58.test.ts | 7 | 4 | 25 | 9 | 13 | 3 |
| box/bounty/pf15.test.ts | 19 | 4 | 23 | 7 | 13 | 3 |
| box/bounty/bt39.test.ts | 9 | 6 | 22 | 12 | 8 | 3 |
| kitchen/k16-record.test.ts | 5 | 15 | 22 | 20 | 3 | 3 |
| box/bounty/bt12-install.test.ts | 3 | 5 | 21 | 12 | 8 | 3 |
| box/bounty/k14-start-budget.test.ts | 2 | 4 | 19 | 6 | 13 | 3 |
| box/bounty/bt36.test.ts | 6 | 3 | 19 | 6 | 7 | 3 |
| box/bounty/bt14.test.ts | 15 | 3 | 19 | 7 | 6 | 3 |
| box/bounty/record.test.ts | 12 | 3 | 18 | 6 | 6 | 3 |
| box/bounty/bt7c-review.test.ts | 5 | 5 | 18 | 9 | 6 | 3 |
| box/bounty/bt44.test.ts | 5 | 4 | 18 | 8 | 5 | 3 |
| box/bounty/bt22.test.ts | 11 | 5 | 18 | 6 | 6 | 3 |
| box/bounty/bt7-correction.test.ts | 3 | 4 | 17 | 8 | 3 | 3 |
| box/bounty/bt35.test.ts | 23 | 6 | 16 | 7 | 5 | 3 |
| box/bounty/bt32-pass-probes.test.ts | 3 | 3 | 16 | 6 | 6 | 3 |
| box/bounty/json-agreement.test.ts | 3 | 5 | 15 | 9 | 3 | 3 |
| box/bounty/bt61-text.test.ts | 1 | 4 | 15 | 8 | 2 | 2 |
| box/bounty/bt21.test.ts | 7 | 3 | 15 | 6 | 5 | 3 |
| box/bounty/bt28.test.ts | 20 | 4 | 15 | 6 | 5 | 3 |
| box/bounty/bt7-git-channels.test.ts | 6 | 2 | 15 | 4 | 5 | 3 |
| box/bounty/bt7-refusals.test.ts | 3 | 2 | 15 | 5 | 3 | 3 |
| kitchen/verify-reuse.test.ts | 22 | 6 | 14 | 11 | 2 | 3 |
| box/bounty/bt17.test.ts | 4 | 4 | 14 | 7 | 4 | 3 |
| box/bounty/bt15-guarantees.test.ts | 4 | 3 | 14 | 6 | 4 | 3 |
| box/bounty/bt7-cli.test.ts | 4 | 3 | 13 | 6 | 3 | 3 |
| box/bounty/bt8b.test.ts | 22 | 2 | 13 | 4 | 5 | 3 |
| box/bounty/bt45.test.ts | 4 | 2 | 13 | 5 | 3 | 3 |
| box/bounty/bt61-journey.test.ts | 6 | 3 | 13 | 6 | 2 | 2 |
| box/bounty/pf25.test.ts | 7 | 3 | 12 | 6 | 3 | 3 |
| box/bounty/bt26.test.ts | 8 | 2 | 12 | 5 | 4 | 3 |
| box/bounty/bt40.test.ts | 6 | 5 | 12 | 7 | 4 | 3 |
| box/bounty/create.test.ts | 15 | 1 | 12 | 2 | 5 | 3 |
| box/bounty/bt31.test.ts | 10 | 2 | 12 | 3 | 3 | 3 |
| box/bounty/bt63.test.ts | 9 | 5 | 12 | 8 | 3 | 3 |
| box/bounty/bt61-agreement.test.ts | 2 | 2 | 11 | 5 | 2 | 2 |
| box/bounty/bt50.test.ts | 26 | 5 | 11 | 8 | 3 | 3 |
| box/bounty/bt7-filters.test.ts | 2 | 2 | 11 | 6 | 1 | 3 |
| box/bounty/pf27.test.ts | 5 | 2 | 10 | 4 | 2 | 3 |
| box/bounty/bt23-review.test.ts | 3 | 1 | 10 | 2 | 4 | 3 |
| box/bounty/bt31-ci.test.ts | 5 | 1 | 10 | 3 | 3 | 3 |
| box/bounty/bt47.test.ts | 4 | 2 | 10 | 4 | 2 | 3 |
| box/bounty/bt61.test.ts | 7 | 3 | 9 | 5 | 2 | 2 |
| box/bounty/bt23.test.ts | 7 | 1 | 9 | 2 | 2 | 3 |
| box/bounty/never-ship.test.ts | 13 | 1 | 9 | 2 | 4 | 3 |
| box/bounty/bt41.test.ts | 6 | 2 | 9 | 4 | 2 | 3 |
| box/bounty/hook.test.ts | 14 | 2 | 9 | 3 | 3 | 3 |
| box/bounty/bt57.test.ts | 7 | 2 | 8 | 4 | 3 | 3 |
| box/bounty/bt60.test.ts | 9 | 1 | 8 | 3 | 2 | 3 |
| box/bounty/bt18.test.ts | 62 | 5 | 8 | 6 | 2 | 3 |
| box/bounty/snapshot.test.ts | 9 | 1 | 7 | 2 | 2 | 3 |
| box/bounty/tell.test.ts | 4 | 1 | 7 | 3 | 1 | 3 |
| box/bounty/bt61-solver.test.ts | 1 | 1 | 6 | 3 | 1 | 2 |
| box/bounty/pf32.test.ts | 2 | 1 | 6 | 3 | 1 | 3 |
| box/bounty/bt55.test.ts | 5 | 1 | 6 | 4 | 0 | 1 |
| kitchen/k19-github-standin.test.ts | 4 | 4 | 6 | 5 | 1 | 3 |
| box/bounty/bt32-pass-toctou.test.ts | 1 | 1 | 6 | 2 | 1 | 3 |
| box/bounty/bt37-probe.test.ts | 1 | 1 | 5 | 2 | 1 | 3 |
| box/bounty/bt64.test.ts | 6 | 0 | 5 | 0 | 2 | 3 |
| box/bounty/bt48.test.ts | 107 | 1 | 5 | 2 | 3 | 3 |
| kitchen/k45-kitchen-reach.test.ts | 11 | 2 | 4 | 4 | 1 | 3 |
| box/bounty/bt54.test.ts | 16 | 1 | 4 | 2 | 2 | 3 |
| platform/pf22.test.ts | 12 | 5 | 4 | 9 | 2 | 3 |
| box/bounty/cli.test.ts | 13 | 1 | 4 | 1 | 1 | 3 |
| kitchen/k37-load-stats.test.ts | 17 | 1 | 3 | 2 | 1 | 3 |
| box/bounty/pf24.test.ts | 12 | 2 | 3 | 2 | 1 | 3 |
| box/bounty/bt42.test.ts | 2 | 1 | 2 | 1 | 1 | 3 |
| kitchen/kitchen-stats.test.ts | 16 | 2 | 2 | 3 | 0 | 3 |
| kitchen/k12-bounty-parallel.test.ts | 6 | 0 | 2 | 1 | 1 | 3 |
| box/bounty/bt12-package.test.ts | 14 | 1 | 2 | 2 | 0 | 3 |
| kitchen/k34-start-evidence.test.ts | 8 | 1 | 2 | 1 | 0 | 3 |
| box/bounty/bt65.test.ts | 4 | 2 | 2 | 2 | 1 | 3 |
| kitchen/k7-ci2-final-status.test.ts | 9 | 0 | 2 | 1 | 1 | 3 |
| kitchen/k6-scope-budget.test.ts | 5 | 1 | 2 | 2 | 0 | 3 |
| box/bounty/pf29.test.ts | 5 | 1 | 2 | 1 | 0 | 3 |
| box/bounty/pf16.test.ts | 8 | 1 | 1 | 1 | 0 | 3 |
| box/bounty/bt7-pins.test.ts | 1 | 0 | 1 | 0 | 1 | 3 |
| platform/account.test.ts | 67 | 1 | 1 | 1 | 1 | 3 |
| kitchen/k36-brief-check.test.ts | 14 | 1 | 1 | 1 | 0 | 3 |
| platform/machine.test.ts | 39 | 1 | 1 | 2 | 0 | 3 |
| platform/charge.test.ts | 79 | 1 | 1 | 1 | 0 | 3 |
| platform/payments.test.ts | 50 | 1 | 1 | 1 | 0 | 3 |
| kitchen/kitchen-stats-no-usage.test.ts | 4 | 0 | 1 | 0 | 0 | 3 |
| platform/paypal.test.ts | 39 | 1 | 1 | 1 | 0 | 3 |
| kitchen/k35-living-rulebook.test.ts | 9 | 0 | 0 | 1 | 0 | 3 |
| platform/api.test.ts | 30 | 0 | 0 | 1 | 0 | 3 |
| box/bounty/bt53.test.ts | 7 | 0 | 0 | 0 | 0 | 3 |
| kitchen/k6-corrections.test.ts | 7 | 0 | 0 | 0 | 0 | 3 |
| platform/refresh.test.ts | 23 | 0 | 0 | 0 | 0 | 3 |
| kitchen/k7-ci-clean-checkout.test.ts | 2 | 0 | 0 | 0 | 0 | 3 |
| kitchen/k29-arg-refusals.test.ts | 7 | 0 | 0 | 0 | 0 | 3 |
| platform/pf28.test.ts | 3 | 0 | 0 | 0 | 0 | 3 |
| box/bounty/bt5.test.ts | 6 | 0 | 0 | 0 | 0 | 3 |
| kitchen/k60-hook-timeout.test.ts | 4 | 0 | 0 | 0 | 0 | 3 |
| kitchen/k59-test-timeout.test.ts | 4 | 0 | 0 | 0 | 0 | 3 |
| platform/pf29.test.ts | 8 | 0 | 0 | 0 | 0 | 3 |
| platform/pf32.test.ts | 7 | 0 | 0 | 0 | 0 | 3 |
| platform/hints.test.ts | 19 | 0 | 0 | 0 | 0 | 3 |
| kitchen/k15-sandbox-guard.test.ts | 4 | 0 | 0 | 0 | 0 | 3 |
| kitchen/k12-db-suites.test.ts | 2 | 0 | 0 | 0 | 0 | 3 |
| platform/bt60.test.ts | 7 | 0 | 0 | 0 | 0 | 3 |
| box/bounty/secret-literals.test.ts | 1 | 0 | 0 | 0 | 0 | 3 |
| platform/pf15.test.ts | 14 | 0 | 0 | 0 | 0 | 3 |
| platform/pf9b.test.ts | 3 | 0 | 0 | 0 | 0 | 3 |
| platform/bt58.test.ts | 2 | 0 | 0 | 0 | 0 | 3 |
| box/bounty/standalone.test.ts | 2 | 0 | 0 | 0 | 0 | 3 |
| box/bounty/record-access.test.ts | 2 | 0 | 0 | 0 | 0 | 3 |
| box/bounty/bt61-boundary.test.ts | 6 | 0 | 0 | 0 | 0 | 2 |
| kitchen/k61-cleanup.test.ts | 6 | 0 | 0 | 0 | 0 | 3 |
| box/bounty/scan.test.ts | 4 | 0 | 0 | 0 | 0 | 3 |
| platform/pf33.test.ts | 3 | 0 | 0 | 0 | 0 | 3 |

## 3. The cut-off (step 3)

A tenth of the Windows `verify` job is 95 to 125 s of wall time, which at three files at once is about 300 to 390 s of file time. The table is flat: the slowest file (`pf5`, 201 s) is 7% of the bounty file time and the five slowest together are 590 s, four of them protected.

The one class of candidates the brief names that exists here is the review and probe files: `bt7b-review`, `bt6b-holes`, `bt6b-third`, `bt6b-second`, `bt11b-pass`, `bt7c-review`, `bt32-pass-probes`, `bt23-review`, `bt32-pass-toctou`, `bt37-probe` (10 files, 60 tests, 313 s of Windows file time, about 100 s of wall time). That is the ceiling, reached only if all ten were redundant, and the files' own first comments say they are not: they "add negative cases the wave's tests do not pin" (`bt11b-pass`), are "adversarial cases the wave's own tests do not carry" (`bt7b-review`), and each `bt6b` pass is a further way a solver's program ran (a hard stop). Four of the ten are on the protected list (`bt7b-review`, `bt11b-pass`, `bt7c-review`, `bt23-review`), and the three `bt6b` passes attack "nothing a solver wrote runs". No file is a pass-probe whose cases the main file holds. Without those, the set is `bt32-pass-probes`, `bt32-pass-toctou` and `bt37-probe`: 27 s.

Other classes: *retired* (a test of a command or record shape with no reader left): not searched file by file. The signals found are live behaviour: `bt38` and `bt40` assert that a removed command such as `undo` is refused `command-removed`, and `bt23` converts old record shapes that `record.ts` still reads by design (K30 review, "retired-stage loaders"). *Asserts nothing* and *retired rule* (kitchen): not searched; the kitchen suite is 65 s of wall time, so even all of it is under a tenth, and the cut-off decision does not need them.

**So: no candidate set saves a tenth, and the files that could be named are the ones that guard the hard stops. Nothing removed.** A small saving is not worth a lost check (the brief).

## 4. Before and after

Before: 145 files, 1880 tests (bounty 1257, kitchen 166, platform 457), Windows `verify` 955 s on the last run. After: the same; no file, test, limit or expectation changed.

## 5. What could still be done, not by this wave

- The wall time is set by the Windows runner and by a few files that spawn many Git processes (`pf5`, `bt51`, `answer`, `github`). That is a speed question for BACKLOG ("Bounty suite under load"), not a test that proves nothing.
- If a file ever becomes provably redundant, the proof method in the brief (break the guarantee in a scratch copy, see another test go red) stands.
