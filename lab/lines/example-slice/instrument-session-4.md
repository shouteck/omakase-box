# Session 4 record: runtime instrument and two development replays

7 October 2026. **Who wrote what.** The runtime instrument, the runs and every record under `instrument/runtime/records/` were produced by another lab session, which stopped before writing anything up. This page was assembled afterwards by a second lab lead from those records, without rerunning the containers. The author's predictions written before execution are `instrument/runtime/predictions.md` and `native-predictions.md`. Nothing on this page was predicted by its writer in advance. Two sceptics reviewed the work, both in `sceptic-runtime.md`: the first alongside the author (synthetic fixture and Click), the second after this page was drafted (Ky, and every claim below). **This is the version after the second sceptic**, who re-derived every number from the raw records, reran three Ky observations, and required the nine corrections now folded in.

Only development cases were run: `pallets/click` 3208 and `sindresorhus/ky` 823. Confirmation content is still unopened. These are two hand-run cases used to build the instrument. They are not the replay and give no rate.

## What was built

In `instrument/runtime/`: a bounded container runner (no network, read-only case, CPU, memory and time caps, uid 1000); statement coverage for Python; native TypeScript execution capture through V8 coverage and verified source maps under the project's own loader; a file-read tracer; a package exporter with primary and expanded variants and no fallback to the owner's checkout; failure-identity schemas; drivers that run a case three times in three modes (plain, traced, coverage) and refuse on any mismatch.

## What was run, including what failed first

Per case: example and guard, base and fixed, three repeats each, in three modes (12 cells, 36 executions); then for each rule a sealed package, base and "fixed source copied in" diagnostic, example and guard, three repeats (48 observations per case). All 130 recorded runs had the network disabled.

Attempts that failed before those, all kept:

- `click3208-full`: aborted after one cell. The three modes' raw output differed in the test runner's printed duration. Fixed by an identity schema that normalises only that final duration, written before the corrected run.
- `native-calibration` (6 unmapped statements, source-map mismatch) and `native-calibration-canonical` (2 unmapped): failed calibrations of the authored TypeScript fixture. `native-calibration-helpers` passed after source-map paths were canonicalised the way Node does and two exact compiler-helper statements were whitelisted.
- `ky823-native-base` and `ky823-native-base-no-cache`: the right assertion failure plus a second failure (the loader could not create a cache folder under the read-only tree) and 17 unmapped statements. `ky823-native-base-cache-tmpfs` added a temporary in-memory `node_modules` mount and reached none unmapped. So the Ky observation depends on an environment fix made after seeing a failure.

Five different images appear across the records. The image every Click record names no longer exists in Docker (the tag was rebuilt), so Click cannot be rerun on it; the first sceptic's single run is the only independent check it will get. The Ky image exists.

## Claims and their standing

**C1. The full-repository observations are stable and the instrumentation does not change them. Stands.** Click: 12 of 12 cells have one identity across the three modes and three repeats, but only under the duration-normalising schema; raw bytes differ. Base example exits 1, everything else 0. Ky: 12 of 12 cells identical byte for byte (the sceptic rehashed all 108 raw files); base example exits 1, everything else 0; no statement left unmapped, with 34 generated compiler-helper statements per run whitelisted by exact text. One Ky base example was independently rerun and matched.

**C2. Rule sizes, production root. Stands; numbers exact.**

| Case | Root source files | E | EI | R | G |
|---|---|---|---|---|---|
| click 3208 | 17 | 14 (82% files, 85% bytes) | 17 (100%) | 17 (100%) | 17 (100%) |
| ky 823 | 24 | 14 (58% files, 57% bytes) | 24 (100%) | 24 (100%) | 24 (100%) |

Against all operational source in the repository: Click E is 14 of 32 files (44%) and 79% of bytes; Ky's repository source is its root. No rule on either case is "small" by the frozen 25% threshold. EI, R and G select the same source files on both; G also ships the non-source `py.typed` on Click.

**Why import-following reaches the whole root** (the sceptic's diagnostics, outside the frozen protocol):

- Ky: nine of the ten files EI adds are reached only through type-only imports, which the frozen rule counts on purpose. Following value imports only gives 15 of 24 files and 58% of bytes. Still not small.
- Click: the three files EI adds are imported lazily by modules that did run. The package initializer is not the cause for EI. It is the cause for R, because the test imports only the package.

**E does not mean the same thing in the two languages.** In Python, `import` and `def` are executed statements, so every loaded module is in E; three of Click's 14 E files ran no line inside any function. The TypeScript adapter does not count function or type declarations, so a loaded module that only declares a function is not in E. Part of the difference between the two E rows is this, not the projects. Counting only files with a function-body line executed, Click E would be 11 of 17 files and 77% of bytes. At statement level, 38% of Click's statements ran. Nothing at file granularity comes near 25%; a finer grain is the only place a small number could come from, and the protocol excludes it.

**C3. Executed files alone are not a loadable package on Ky. Weakened: true under this adapter's definition of an executed statement.** The E primary package fails all six base observations, example and guard alike, with `ERR_MODULE_NOT_FOUND` for `source/utils/delay.js`: a setup failure, not a different behavioural failure. The output differs between repeats only in a loader query string. The expanded package adds that one file (15 of 24) and reproduces the full-repository identity 6 of 6. On Click, E reproduces 6 of 6 with no expansion, which follows from Python's E including every loaded module. Rerun once independently: same failure.

**C4. Where a package loads, it reproduces the failure. Stands on the record.** All 96 sealed observations ran safely. Click: 48 of 48 match the full repository. Ky: 42 of 48; the six that do not are E primary. With the fixed versions of the changed runtime source files copied in, example and guard pass 3 of 3 for Click E, EI, R, G and Ky EI, R, G. One Ky EI base example was independently rerun and matched.

**C5. The historical change never fits inside the package as the protocol defines "reference-feasible". Weakened: the lists of changed paths were entered by hand in the replay drivers by the author and no second reader has checked them against the patches.** As recorded: Click's accepted change also edits `CHANGES.rst`; Ky's also edits `readme.md`. Both are outside every rule's editable set, so the full historical patch is refused for all rules on both cases. Ky's change also edits `source/types/hooks.ts`, a type-only file that E omits. For runtime source alone: Click contained by all four rules; Ky by EI, R and G, not by E.

**C6. What this does and does not say. Stands.** Two development cases from small single-package libraries. On these, the only rule that ships less than the whole source root is E; it ships more than half, and on Ky it will not load and misses an edited file. It does not say what happens in larger or multi-package repositories, and it is not the replay.

## Protocol points this raises

- "Reference-feasible" as frozen fails on a changelog or readme line. That is the protocol working as written. Whether documentation edits should count is a version 2 question, not something to relax now.
- Click's and Ky's roots have 17 and 24 source files, so a small package there is at most 4 and 6 files, and neither development case came close under any rule. This *suggests*, for those two projects only, that the confirmation cases will not show a small package either. Zod, with a different layout, has not been run. This is a post-hoc observation from development cases and base file counts; it is not used to change the rules, the threshold or the cohort.
- Two things to decide on purpose before any admission: whether `package.json` and `tsconfig.json` are editable in a Ky package (they are recorded as editable), and a stale duplicate row for the test file in Ky's authority manifest.

## Not done

Zod has no runtime adapter (vitest and its worker model are uncalibrated). The other three development candidates have no runnable example admitted. Image digests, allowlists and identity schemas are recorded per run but not declared frozen, and one image is already lost. Re-export-only source mapping, worker threads and adversarial targets remain outside what the fixtures test. Raw records are on disk, not in Git: `instrument/runtime/records/README.md`. About 140 `lab-a-replay-1-*` scratch folders from this session remain in the system temp folder.
