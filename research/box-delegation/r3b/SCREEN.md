# R3b-1 screening: `tj/commander.js`

Cook, wave/R3b-1. Host clock (`date -u`): start 2026-10-06T23:13:26Z; `SELECTION.md` committed 23:14:06Z (`ec4f320`); first candidate query 23:14:15Z; first test run 23:17:31Z; last 23:20:12Z. The rule, the definitions and the container recipe are in [SELECTION.md](SELECTION.md) and were not changed afterwards.

## Result in one paragraph

Eight candidates screened, all from commander.js; no project was dropped. **Three qualify** under the predeclared rule (#2615, #2609, #2350). Four more fail at base for the right reason, pass at the fix and have green guards, but have no linked issue, only a pull request description, so the predeclared rule drops them. One (#2264, "Fix typos") is not a behaviour fix: its tests pass at base. Two of the three qualifying fixes landed after June 2026 (#2615, #2609).

Every number below is one run per cell. The tests are deterministic unit tests with no I/O, and #2609 was run a second time through the documented command with the same three exit codes, but nothing else was repeated.

## Table

Exit codes are `spawnSync().status` of the test process itself, recorded in `evidence/runs/pr-<n>.json` under `.runs.<run>.exit`. A = the fix's test files overlaid on base; B = same files at the fix; C = guards (every untouched `tests/**/*.test.*` file) at unchanged base. Counts in brackets are tests run / passed / failed as printed by the runner; they are context, not the verdict.

| # | PR | Issue | Fix date (UTC) | Base | Fix | A | B | C | Qualifies | Reason |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | [#2636](https://github.com/tj/commander.js/pull/2636) inspector port for IPv6 hosts | none | 2026-10-05 | `b2be0c76` | `6320660f` | 1 [18/16/2] | 0 [18/18/0] | 0 [1409/1409/0] | no | Right-reason failure (`deepStrictEqual`: `--inspect=[::1]` not bumped to `:9230`), but no issue text. |
| 2 | [#2630](https://github.com/tj/commander.js/pull/2630) inspector port for `--inspect-wait` | none | 2026-09-30 | `fca3bb7d` | `130cf3a9` | 1 [16/12/4] | 0 [16/16/0] | 0 [1409/1409/0] | no | Right-reason failure (`deepStrictEqual`: `--inspect-wait` returned unchanged), but no issue text. |
| 3 | [#2615](https://github.com/tj/commander.js/pull/2615) Unicode variadic option placeholders | [#2614](https://github.com/tj/commander.js/issues/2614) | 2026-09-28 | `ae60352a` | `a9f06ddf` | 1 [19/18/1] | 0 [19/19/0] | 0 [1402/1402/0] | **yes** | `strictEqual false !== true` on `option.variadic` for a non-ASCII placeholder: the behaviour the issue reports. |
| 4 | [#2609](https://github.com/tj/commander.js/pull/2609) electron argv parsing only for main process | [#2603](https://github.com/tj/commander.js/issues/2603) | 2026-09-26 | `fc2135ee` | `b5cbf2b4` | 1 [47/41/6] | 0 [47/47/0] | 0 [1382/1382/0] | **yes** | Six `deepStrictEqual` failures, all `['script.js','user']` where `['user']` is expected: the script path parsed as a user argument, as the issue reports. |
| 5 | [#2544](https://github.com/tj/commander.js/pull/2544) uppercase `E` exponent in negative numbers | none | 2026-07-05 | `c3ffcfcd` | `a6bcd2ec` | 1 [152/132/20] | 0 [152/152/0] | 0 [1249/1248/0] | no | Right-reason failure (20 x `doesNotThrow` got `unknown option '-1E3'`), but no issue text. C printed one test neither passed nor failed (skipped by the project); exit 0. |
| 6 | [#2350](https://github.com/tj/commander.js/pull/2350) `.configureOutput()` copies settings | [#2342](https://github.com/tj/commander.js/issues/2342) | 2025-03-26 | `672e3806` | `68199e64` | 1 [26/25/1] | 0 [26/26/0] | 0 [1182/1182/0] | **yes** | Jest `toBe`: expected 80, received 40: configuring the copy changed the original, as the issue reports. Before June 2026. |
| 7 | [#2348](https://github.com/tj/commander.js/pull/2348) leading space in option help text | none | 2025-03-25 | `9d941f81` | `672e3806` | 1 [10/9/1] | 0 [10/10/0] | 0 [1197/1197/0] | no | Right-reason failure (`toEqual`: `" (default: custom)"` has a leading space), but no issue text. Before June 2026. |
| 8 | [#2264](https://github.com/tj/commander.js/pull/2264) "Fix typos" | none | 2024-10-11 | `0193201f` | `3a79d846` | 0 [86/86/0] | 0 [86/86/0] | 0 [1026/1026/0] | no | Not a behaviour fix: spelling changes in 11 files; the changed tests pass at base. Matched the rule only because the title starts with "Fix". |

Full hashes are in [screen/candidates.json](screen/candidates.json).

## Counts

- Merged pull requests listed: 200 (the 100 most recent held only five candidates, so the next 100 were fetched as the rule says; oldest listed merged 2024-06-09).
- Candidates under the rule in those 200: exactly 8. All eight screened. None skipped.
- Qualified: **3** (#2615, #2609, #2350).
- Dropped: **5**
  - no linked issue, so no issue text to use as the request: 4 (#2636, #2630, #2544, #2348). All four pass the three-run test.
  - fix's tests do not fail at base (not a behaviour fix): 1 (#2264).
- Dropped for a wrong-reason failure (load error, missing export, syntax error): 0.
- Dropped for red guards: 0.
- Fix landed after June 2026: 5 of 8 (#2636, #2630, #2615, #2609, #2544); of the three qualifying, 2.

## About the "no issue" drop

The brief's own test in step 4 is the three runs. `SELECTION.md` added, before any result, that a candidate without an issue is dropped because wave 2 needs the issue as the request. I kept to what was written. The four dropped that way are listed in `cases.json` under `replayableWithoutIssue`, with the pull request description as the only request text, so the head chef can decide whether a pull request description is an acceptable request. They are not counted as qualifying here.

## How large each qualifying fix is

| Case | Source change | Test change | After June 2026 |
|---|---|---|---|
| #2615 | `lib/option.js` +1/-1 | `tests/options.variadic.test.js` +7/-0 | yes |
| #2609 | `lib/command.js` +8/-4 | `tests/command.parse.test.js` +170/-8 | yes |
| #2350 | `lib/command.js` +5/-1 | `tests/command.configureOutput.test.js` +11/-0 | no (2025-03) |

## Limits wave 2 should know

- **Issue text can give the fix away.** #2614's body quotes the faulty line and names the remedy; #2342 suggests the solution. #2603 describes the symptom and cause but has 8 comments where the design was discussed; only the issue body was saved, not the comments.
- **#2609 targets `release/16.x`**, a semver-major behaviour change, and its test file rewrites eight existing lines as well as adding cases. At base, 41 of its 47 tests pass and the 6 failures are all the new behaviour.
- **#2350 and #2348 are from the Jest era** (the project moved to Node's runner in January 2026). The predeclared command was `node --test <files>`; at those commits the project's own `test` script is `jest`, so the script ran `node node_modules/jest/bin/jest.js --runTestsByPath <files>`. This is a deviation from the letter of `SELECTION.md`, chosen by reading `package.json` at each commit, and it needs `node_modules`, so those cases depend on the install.
- **The guards are the whole untouched suite**, 100 to 108 files, not a hand-picked neighbourhood. Wave 2 may want a narrower set; the full list per case is in `evidence/runs/pr-<n>.json` under `.guards`.
- **Solver exposure.** All three qualifying fixes are public. A model with a training cutoff of June 2026 cannot have seen #2615 or #2609; #2350 is from March 2025 and could have been seen.
- **No type checks were run.** The project's `test` script also runs `tsd`/`tsc`; only the runtime tests were screened.
- **Alternative readings checked.** For each right-reason verdict the failing assertion was read against the issue or pull request text; none of the failures is an import, export or syntax error. Each failing assertion compares a value the library returned with the expected one (the inspector-port failures show argument arrays, not a socket error), so none reads as an effect of the container or of the missing network. I did not read the test sources beyond the lines quoted in the failures.

## Container recipe, as run

- Image `kitchen-r3b-tools` built from [image/Dockerfile](image/Dockerfile): the pinned `node:24.11.0-bookworm-slim@sha256:76d0ed0e...1152` plus apt `git` and `ca-certificates`; default user `node` (uid 1000). Node v24.11.0, npm 11.6.1, git 2.39.5. Build log: `evidence/image-build.log`.
- One named volume, `kitchen-r3b-src`, mounted at `/src`: the clone (`/src/repo`), one `node_modules` per distinct lockfile (`/src/nm/<sha256 of package-lock.json>`), and short-lived worktrees (`/src/wt/<id>-A|B|C`). The `kitchen-r3b-out` volume named in `SELECTION.md` was never created; results leave on stdout.
- Every container: `--rm -i --memory 2g --cap-drop ALL --security-opt no-new-privileges --pids-limit 512 --user node -v kitchen-r3b-src:/src`. No other mount, no environment passed, no Docker socket, not privileged. The script reaches the container on stdin (`node - ... < screen.mjs`), so this repository is never mounted.
- Network on: image build; `git clone --no-checkout https://github.com/tj/commander.js.git` (anonymous); `npm ci --ignore-scripts --no-audit --no-fund` from the commit's own `package.json` and `package-lock.json`, unchanged. Network off (`--network none`): every test run.
- Installs: `package-lock.json` was byte-identical between base and fix in all eight candidates. Six installs ran, one per distinct lockfile (#2615, #2636, #2609, #2544, #2350, #2264); #2630 and #2348 reused an existing one. All six exited 0. Each is recorded in `evidence/runs/pr-<n>.json.prepare.json`. `node_modules` is hard-link copied into each worktree.
- Each run records `git rev-parse HEAD` and `git status --porcelain` just before the test command: run A shows only the overlaid test file(s) as modified; B and C are clean.

## Rerun one case

From the checkout root, in Git Bash, with Docker running:

    sh research/box-delegation/r3b/screen/rerun-case.sh pr-2615 ae60352af7d216595055ef744111788b97f7416b a9f06ddfe1a97c932579370a1b4e727f7fa511a7 "$TEMP/kitchen-r3b-rerun-2615.json"

It builds the image if absent, clones and installs with the network on, runs A, B and C with the network off, and writes the record to the path given. Read `.runs.A_fixTests_at_base.exit`, `.runs.B_fixTests_at_fix.exit` and `.runs.C_guards_at_base.exit`; expected 1, 0, 0. The script's own exit code only says the recording finished. Remove what it made with `docker volume rm kitchen-r3b-src` and `docker image rm kitchen-r3b-tools`, and delete the output file.

## Evidence

- `evidence/pr-list.raw.json` (+ `.queried-at.txt`): the first query, 100 merged pull requests. `evidence/pr-list-200.raw.json`: the second, 200. Query: `gh pr list --repo tj/commander.js --state merged --limit <100|200> --json number,title,mergedAt,labels,body,baseRefName,mergeCommit,closingIssuesReferences,files,url`.
- `evidence/prs/pr-<n>.md|json`: each candidate's pull request text, verbatim. `evidence/issues/issue-<n>.md|json`: the three issue bodies, verbatim, with URL.
- `evidence/runs/pr-<n>.json`: the record of the three runs (argv, cwd, HEAD, overlay, times, exit, signal, full stdout and stderr). `evidence/runs/pr-<n>.json.prepare.json`: clone and install record.
- `evidence/logs/pr-<n>.<run>.log`: the same stdout and stderr split out for reading.
- `screen/screen.mjs`: the in-container script. `screen/candidates.json`: the eight tuples.

The reviewed recorder (`r3/recorder/run-recorder.mjs`) was not used: it runs commands on the machine it is started on, and these commands must run inside the container. `screen.mjs` follows the same rule it does: spawn directly, no shell, record the process's own exit.
