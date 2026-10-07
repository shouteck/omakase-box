# Case `pr-2615`, part one: measured record up to the hand-off

Replay of a closed issue. Cook, wave/R3b-2, one session. All times are the host clock (`date -u`). Rules: [../../CASE-2615.md](../../CASE-2615.md), committed at `6469483` (23:35:58Z) before the image was built or the product run.

## Identity

| Item | Value |
|---|---|
| Product `cli.js` SHA-256 | `e7ef9ce1e1d26721b83c394e299d4dae8c9891639cac674f80a23d45b5a6fe2e` (93,169 bytes) |
| Built from | the existing `packages/box-cli/dist/cli.js`, built 2026-10-06T23:23:31Z; not rebuilt. No file under `packages/` is newer than it; the last commit touching `packages/` or `scripts/` is `39de96d` and the checkout was at `ca8aaa3` |
| Project base (wave 1) | `ae60352af7d216595055ef744111788b97f7416b` |
| Local owner commit 1, test only | `3b25bc97b46f11ce511ac1f1defc26749ac191a3`: `tests/options.variadic.test.js`, 7 insertions, 1 file |
| Local owner commit 2, request text only | `5841f7a4ac0b4a5eea364300b1f43775513b2dab`: `REQUEST.md`, 52 insertions, 1 file. **This is the agreement's base.** |
| Agreement | [agreement-2615.json](agreement-2615.json), SHA-256 `032ad5493007674933aa58e6ec553a2c45961b8236bca8895f21fb6bcefc7c76`, equal to `agreementSha256` in the exported `box.json` |
| Exported `box.json` | [box.json](box.json), SHA-256 `879ed9aebc28d9ad530b5d5b0176f2a28a656bbb8997689ef4cc497ec627556f` |
| Image | `kitchen-r3b-tools` `sha256:fd9136394f59…`, Node v24.11.0, npm 11.6.1, git 2.39.5 |

Both local commits exist only in the `kitchen-r3b-src` volume. `git show --stat` output for both is in [prepare-owner.log](prepare-owner.log).

## Request text

[REQUEST.md](REQUEST.md), 1,662 bytes, SHA-256 `d6e8470d…`: the issue title as a heading and the issue body, identical to wave 1's saved body (checked with `diff`). Cut: wave 1's four header lines and rule (they name the project URL and issue number), and all three comments, because each is dated after the fix was opened (opened 05:36:50Z on 19 September, five minutes after the issue; comments at 21:14Z, 21:37Z and 11:20Z the next day). The comments contain no rule, code or link; they are kept in `issue-2614.comments.raw.json`. The text contains none of: the pull request number or link, `github.com`, `ID_Continue`, a `\p{` expression. It does contain the reporter's own "Root cause" section and a commit hash of the project's development branch.

## Selection

| | Files | Bytes |
|---|---|---|
| Tracked at the project base `ae60352` | 219 | 993,396 |
| Tracked at the agreement base `5841f7a` | 220 | 995,313 |
| Shipped owner files | 39 | 357,491 |
| of which editable (`lib/*.js`) | 6 | 125,659 |
| Share of the project base | 17.8% | 36.0% |

`package-lock.json` alone is 96,378 of the shipped bytes. The product's own figure is 39 of 217 (18.0%): it walks the folder and skips the three tracked symbolic links. The Box also holds two generated files, `box.json` and `box/submit.mjs`; 41 files in all.

Read-only: `package.json`, `package-lock.json`, `index.js` (the only entry file `main` and `exports` name), `REQUEST.md`, the outcome test, 27 guard tests, and `tests/testHelpers.js` (six of the selected tests import it). Editable: `lib/argument.js`, `lib/command.js`, `lib/error.js`, `lib/help.js`, `lib/option.js`, `lib/suggestSimilar.js`.

## Declared setup and commands (final agreement)

| Name | Role | Context | Program and arguments |
|---|---|---|---|
| `install` | setup | owner | `npm ci --ignore-scripts --no-audit --no-fund` |
| `box-install` | setup | recipient | `npm ci --ignore-scripts --no-audit --no-fund` |
| `variadic-outcome` | outcome | owner | `node --test tests/options.variadic.test.js` |
| `options-guard` | guard | owner | `node --test <27 files>` |
| `box-variadic-outcome` | outcome | recipient | `node --test --test-reporter=lcov tests/options.variadic.test.js` |
| `box-options-guard` | guard | recipient | `node --test --test-reporter=dot <27 files>` |

The 27 guard files are every `tests/option.*.test.*` and `tests/options.*.test.*` file at base except the outcome file, plus `tests/args.variadic.test.js` and `tests/argument.variadic.test.js`, as the rule said. They ran in about one second.

## Export attempts: six, five failed

All with `--network none`. Records: `export-attempt-<n>.{meta,stdout,stderr}`.

| # | Started (Z) | Seconds | Exit | What happened |
|---|---|---|---|---|
| 1 | 23:38:03.9 | 0.6 | 1 | `Cannot find package 'typescript' imported from /src/box-tool/cli.js`. The built `cli.js` imports `typescript` at the top level as well as `zod`; the brief named only `zod`. Fixed outside the agreement: `npm install typescript@6.0.3 --ignore-scripts` in the tool folder, network on. |
| 2 | 23:38:16.6 | 1.2 | 1 | `ENOENT: no such file or directory, mkdtemp '/src/out/attempt-2/.box-staging-XXXXXX'`. Export does not create the parent of `--out`. Fixed outside the agreement: `mkdir -p` first. |
| 3 | 23:38:26.3 | 1.1 | 1 | `git clone --local --quiet /src/repo /tmp/box-base-…/owner failed … failed to create link … Invalid cross-device link`. The product clones with `--local` into the system temp folder; when that is a different filesystem from the repository, Git refuses. Fixed outside the agreement: `TMPDIR=/src/tmp`, on the repository's volume. **First Linux launch finding.** |
| 4 | 23:38:37.7 | 14.6 | 1 | `paired check 'box-variadic-outcome' exits identically but fails differently in the isolated Box than on the untouched base — a missing selected file cannot masquerade as the declared outcome.` The two tails it printed are identical. Nothing was missing. |
| 5 | 23:39:22.4 | 13.2 | 1 | Same refusal after declaring `--test-reporter=dot` on all four checks. The tails show the only difference: `✖ variadic special cases (2.154704ms)` on the base against `(2.272095ms)` in the Box. |
| 6 | 23:39:58.2 | 14.3 | **0** | Exported. Owner checks back to the plain reporter; recipient outcome check declared with `--test-reporter=lcov`, which prints nothing; recipient guard with `dot`, which prints only dots when green. |

Attempts 1 to 3 are environment problems of this replay's container and say nothing about the agreement. Attempts 4 and 5 are the product: it compares a digest of the whole output of each recipient check on both sides, and Node's test runner prints run times, so two runs never match. No reporter built into Node prints a failure without its duration. The only declaration that exports is one where the red check prints nothing.

**What that costs.** The paired evidence for the outcome check is now "exit 1 on both sides and empty output on both sides". It no longer shows that the two failures are the same failure, which is what the pairing exists to show. The same-reason evidence that remains is outside the pairing: the owner-context outcome check's log in `baseChecks` (the `strictEqual false !== true` assertion at `tests/options.variadic.test.js:176`), which wave 1 also recorded. And the solver's outcome check gives an exit code and no text. This was done with agreement data only, as the rules file allowed, but it steps round the check rather than satisfying it; the head chef decides whether the case goes on.

## Paired evidence the product recorded

| Recipient check | Base clone | Staged Box | Match |
|---|---|---|---|
| `box-variadic-outcome` | exit 1, fail, 0.187 s, empty output | exit 1, fail, 0.136 s, empty output | exit, result and digest equal (`439083f3…`, the digest of two empty strings) |
| `box-options-guard` | exit 0, pass, 1.316 s, dots | exit 0, pass, 0.867 s, dots | exit, result and digest equal (`2d5983fc…`) |

Owner-context base results: `install` exit 0 (3.1 s); `variadic-outcome` exit 1, fail; `options-guard` exit 0, pass (0.8 s); `box-install` exit 0 (3.2 s). One product warning: the legacy `checks` description has no recorded result. Full dump: [box-inspect.txt](box-inspect.txt).

**Network:** off for all six attempts. `npm ci` ran three times inside export (owner clone, base subtree, staged Box) from the cache warmed earlier, through `npm_config_offline=true` and `npm_config_cache` set on the container; the declared setup has no offline flag. So their tests ran with the network off.

## Clocks

| Span | From | To | Length |
|---|---|---|---|
| Wave start to rules committed | 23:33:31 | 23:35:58 | 2 min 27 s |
| Image build, clone, two local commits, cache warm | 23:36:58 | 23:37:10 | 12 s for the container step |
| **Agreement started to Box exported** | 23:37:25.7 | 23:40:12.6 | **2 min 47 s** |
| of which writing and editing the agreement file | | | 43 s (37.0 + 0.2 + 6.2) |
| of which export running, six attempts | | | 45 s (the successful one 14.3 s) |
| of which reading failures and fixing the environment | | | about 79 s |
| Box exported to host copy checked | 23:40:12.6 | 23:41:03 | 50 s |

These are an agent's times. The clock starts after the schema, the export source and the example agreement had been read and after the file lists had been gathered from the repository; a person new to the product would spend far longer on that reading than on the typing measured here.

## Manual steps, in order

1. Fetch the issue comments, pull request dates and issue timeline (three logged GET calls).
2. Write and commit the rules file.
3. Add one line to the image recipe (`/work/node_modules` owned by the non-root user) and build the image.
4. Build `REQUEST.md` from the saved issue body.
5. Create the volume; copy `REQUEST.md` and `cli.js` in with `docker cp`.
6. In a container: clone, check out the base, take the test file from the fix commit, commit; add `REQUEST.md`, commit; warm the npm cache; install `zod` beside `cli.js`.
7. Read `package.json`, the `lib/` listing, the test names and the tests' import lines to turn the rule into a file list.
8. Write the agreement by hand (186 lines of JSON; the 27 guard files are typed out three times: `files`, owner guard, recipient guard).
9. Run export; install `typescript`; run export; create the output parent; run export; set `TMPDIR`; run export; edit the reporter; run export; edit the reporter again; run export.
10. Copy the Box inside the volume to `/src/pristine/box-2615`.
11. Copy the Box to the host scratch folder with `docker cp`; check every recorded hash.
12. Write `SOLVER.md`, `run.sh` and `run-check.mjs` beside the Box; test them on a throwaway copy; remove the copy.

No request-specific code went into the owner repository, the Box or the product. The scripts in `../../wave2/` drive Docker and read records.

## Hand-off

- Scratch folder: `C:\Users\shout\AppData\Local\Temp\kitchen-r3b-box-2615` with `SOLVER.md`, `run.sh`, `run-check.mjs` and `work/` (the Box). Copies of the three kit files: [solver-kit/](solver-kit/).
- Host copy check ([handoff-copy-check.txt](handoff-copy-check.txt)): `box.json` identical to the retained one, all 39 recorded hashes and sizes match, 41 files present, none unexpected, no file contains CRLF, and the wrapper's hard-coded arguments equal the declared recipient commands.
- Wrapper test on a throwaway copy with its own volume ([wrapper-test.log](wrapper-test.log)): `setup` 0; `check box-variadic-outcome` 1; `check box-options-guard` 0; `checks` 1; unknown name 64; `submit` 0 with `changed: 0`. The copy and its volume were removed; the solver's copy has no `node_modules` folder and no `submission.json`.
- Pristine Box for `--box`: `/src/pristine/box-2615` in volume `kitchen-r3b-src`. The agreement for verify: `/src/in/attempt-6/agreement.json` in the same volume. Owner repository: `/src/repo`. Product: `/src/box-tool/cli.js`.

## What the Box discloses

`box.json` contains none of: the pull request number, "pull", `ID_Continue`, `github`, the project's name, the fix or base commit hashes, a host path, `/src/`, this repository's name, "kitchen" or "r3b" ([box-inspect.txt](box-inspect.txt)). Container paths are replaced with `<root>` by the product. The Box's files do name the project: `package.json` carries the package name and repository URL, and one guard test has a comment linking another issue. No Box file contains `2615`, `2614` or `ID_Continue`.

Blindness limits to carry into the result: the package name and repository URL are in the Box, so a solver with web access could look the fix up; nothing but instruction stops that. The scratch folder name and the `kitchen-r3b-nm-2615` volume name contain the pull request's number. The solver runs on this machine, where the repository and wave 1's evidence are present. The solver sees the acceptance test.

## Resources that exist at the hand-off

Image `kitchen-r3b-tools`; volume `kitchen-r3b-src`; host folder `%TEMP%\kitchen-r3b-box-2615`. No container, running or stopped. Volume `kitchen-r3b-nm-2615` does not exist yet; the solver's `setup` creates it. Created and already removed: containers `kitchen-r3b-cp`, `kitchen-r3b-prepare`, `kitchen-r3b-tool-install`, `kitchen-r3b-export-1` to `-6` and unnamed `--rm` readers; volume `kitchen-r3b-nm-wrappertest`; host folders `kitchen-r3b-in`, `kitchen-r3b-agreement-1` to `-6`, `kitchen-r3b-wrappertest-2615`.
