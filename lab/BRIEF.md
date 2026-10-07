# Research brief for the CTO

**No wave is in flight and nothing here bears on A6. One point needs your decision before the lab spends more on Line A's replay: on the two projects run so far, the frozen cohort looks unable to show a small package. It is the first item under "Is the programme aimed right?".**

Replaced 7 October 2026, after Line A session 4; master through `f47414f`, lab level with it. This session was started by one lab session and completed by another; the second reran no container and relied on a fresh sceptic to re-derive every number and rerun part of Ky. Detail: `lab/lines/example-slice/instrument-session-4.md`.

## Line A: what the lab now believes

The runtime instrument exists: third-party code runs in bounded containers with no network; what a failing test executes is captured for Python and for TypeScript under the project's own loader; packages are exported with no path back to the repository. It has run two **development** cases, `pallets/click` 3208 and `sindresorhus/ky` 823. Two cases, chosen for building the tool. Not a rate.

| Case | Source files in root | Executed (E) | Executed plus imports (EI) | Reach from the test (R) | Whole root (G) |
|---|---|---|---|---|---|
| click 3208 | 17 | 14 | 17 | 17 | 17 |
| ky 823 | 24 | 14 | 24 | 24 | 24 |

1. **No rule gives a small package on either case.** The only rule that ships less than the whole source root is "executed files", and it ships more than half.
2. **Executed files alone do not load on Ky.** A module that is imported but in which nothing ran is left out. One file added and it works.
3. **Where a package loads, it reproduces the failure, and the fixed source passes in it.** 90 of 96 sealed observations match the full repository; the six that do not are that Ky package.
4. **The real change never fits as the protocol defines fitting**, because both changes also edit a changelog or readme, which no rule makes editable. For runtime source alone: Click fits under every rule; Ky under every rule except executed files, which omits a type-only file the change edits. The list of changed paths was entered by hand and has not been checked by a second reader.
5. **Why imports reach everything, from the sceptic:** on Ky, nine of the ten added files come through type-only imports; without them it would be 15 of 24. On Click, lazy imports in modules that ran. "Executed" is also not the same measure in the two languages. At file granularity nothing comes near a quarter of the source; on Click 38% of statements ran, so a finer grain is the only place a small number could come from, and the protocol excludes it.

## Is the programme aimed right?

1. **The cohort.** Click and Ky are single-package libraries with 17 and 24 source files, so "small" means at most 4 and 6 files. This *suggests* their confirmation cases will not show a small package either. Zod is unrun and differently laid out. The cohort already could not pass its four-project screen. So finishing A-replay-1 as frozen will most likely return "no demonstrated promise" for a reason that is about the panel, not about the idea. The lab has not changed the protocol and will not without you. **Recommendation: let A-replay-1 stop at development, record it as uninformative on size, and have the lab write a version 2 cohort of larger and multi-package repositories before any more adapter work.** The product question is whether a slice is small where repositories are big; this panel cannot answer it.
2. **Line D can start on what exists.** The execution-plus-imports package can be made today for Click and Ky. Know that on both it equals the source root, so a token comparison there measures "source root against whole repository", not slicing.
3. **For the owner's picture of a Box.** On a small cohesive library, a Box cut by files is most of the library. That is a result, on two cases.

## Other lines

**B:** unchanged. Whole-repository agents are the incumbent; demand for limited disclosure is unknown; pieces of a Box exist and the choosing rule is the new part. Build, reshape or stop is open.

**C:** unchanged; small chosen sample. R3c still needs: which hidden assertions the request determines, right or wrong labels for failing answers, reporter against fix author, test commit dates, the solver's report and start time, and one structurally clean wrong answer.

**D:** no eval run. Keep whole, hinted, rule, generous, neighbour and oracle conditions distinct.

## Needed from the kitchen and replies

Nothing from the kitchen or the owner. Master's "For the lab" has nothing new for this session. Housekeeping the lab owes: two lab images in Docker and about 140 scratch folders in the system temp folder are kept for reruns and will be removed when Line A's development stage closes; 187 MB of raw records are on disk, with hashes in Git.
