# R3b-2 result: one replayed public issue through the whole product

Cook, wave/R3b-2, one session, 2026-10-06 23:33Z to 23:50Z (host clock). One case: `pr-2615`, issue #2614 of `tj/commander.js`. The control case `pr-2350` was not run, by the head chef's decision.

**This is a replay.** The issue is closed and the maintainers' fix was merged on 28 September 2026. The result shows a handover working on someone else's code. It does not show an open issue being solved, and nothing was sent to the project.

## In one paragraph

The product exported a Box for the issue, a separate agent solved it from the Box folder, and the product's owner-side verify accepted the submission (exit 0, verdict `pass`) and rejected a no-op (exit 3). The solver's change passes the maintainers' whole test suite. But export refused five times before it succeeded, and two of those refusals are a product defect that a real requester would hit on almost any test runner: the paired check compares the checks' whole output, and test runners print run times. Export succeeded only when the outcome check was declared with a reporter that prints nothing. So this case does **not** show the paired check working on a real test runner.

## The four "useful" conditions (PLAN.md)

| Condition | Verdict | Evidence | Caveat |
|---|---|---|---|
| A real issue from someone else's repository | **Partly met** | **Replay** of issue #2614 in `tj/commander.js`, a public project that is not ours; the request text is the reporter's own words; the acceptance test is the maintainers'. | The issue was already fixed. Nobody outside asked us for anything and nothing was delivered to them. |
| A Box prepared in minutes, with no code written for that request | **Partly met** | 2 min 47 s from starting the agreement to an exported Box; the agreement is 186 lines of hand-written data; nothing was added to the owner repository, the Box or the product. | Six export attempts, five refused. The one that worked needed a workaround in agreement data that blinds the paired check (below). The clock is an agent's and excludes reading the schema, the export source and the example agreement. Three of the refusals needed fixes to the container, which a requester on their own machine may not meet. |
| Solved by an agent or person that has never seen the repository | **Partly met** | The solver worked from the Box folder (38 of the project's 219 files plus the request text) through a wrapper whose containers mounted only that folder; it changed one editable file and sealed once. | Blindness was by instruction, not by force: the solver ran on this machine, its session started in our repository's folder, and the Box's `package.json` names the project, so the fix was one web search away. It said it recognised the package and did not know the issue. Same model family as everyone else in the kitchen. |
| Accepted by the owner-side check, with the evidence stated honestly | **Met, for this case** | `box verify` exit 0, verdict `pass`, network off, against the owner repository with the pristine `--box`; outcome and guard both green on the applied change. The no-op is rejected with exit 3. The held-back probe and the maintainers' full suite agree. | One case. The solver saw the acceptance test. The owner-side check is the test the solver was given; what the hidden probe adds is reported separately below. |

Not one of the four is met without a caveat that matters. Taken together: the mechanism carried a real outside issue end to end once, with a workaround.

## Timeline and clocks

| Step | From (Z) | To (Z) | Length |
|---|---|---|---|
| Reading the brief, schema, export source, example | 23:33:31 | 23:35:58 | 2 min 27 s, **not** in the preparation clock |
| Rules file committed alone (`6469483`) | | 23:35:58 | |
| Image build; clone, two local commits, npm cache warm | 23:36:58 | 23:37:10 | 12 s for the container step |
| **Agreement started to Box exported** | 23:37:25.7 | 23:40:12.6 | **2 min 47 s** |
| of which writing and editing the agreement | | | 43 s |
| of which export running, six attempts | | | 45 s (the successful one 14.3 s) |
| of which reading refusals and fixing the environment | | | about 79 s |
| Box copied to the host and every hash checked | 23:40:12.6 | 23:41:03 | 50 s |
| Solver kit written and tested; hand-off commit `e0c8afb` | | 23:43:36 | |
| Solver: edit saved, then sealed (file times in its folder) | 23:44:43 | 23:45:00 | The solver reported about five minutes in all; the file times show the edit and the seal 17 s apart. Its own start time was not recorded. |
| `box verify` on the submission | 23:46:16.2 | 23:46:22.3 | 6.2 s |
| `box verify` on the no-op | 23:47:30.0 | 23:47:34.7 | 4.7 s |

All of these are agent times on one run. They say the product's own steps are quick; they say little about how long a person new to the product would need.

## Request text

`REQUEST.md` (1,662 bytes): the issue title and the issue body, identical to the body wave 1 saved. The fix was opened five minutes after the issue, before any comment, so the rule cut all three comments; they contain no rule, code or link. Also cut: the header lines wave 1 added, which name the project URL and issue number. Kept: the reporter's own "Root cause" section, written before the fix. The text has no pull request number or link and not the maintainers' expression. Whether the issue body was edited after the fix was opened cannot be told from the public API.

The request and the acceptance test do not ask for the same thing, as wave 1's reviewer found: the request's example is `<值...>` and it suggests a "letter/number check", while the maintainers' test needs a placeholder ending in a combining mark to be variadic. The solver noticed this and asked. It could resolve it only because it saw the test.

## Selection and editable rule

Fixed in [CASE-2615.md](CASE-2615.md) before export, from the issue and the package manifest, not from the fix.

| | Files | Bytes |
|---|---|---|
| Tracked at the project base `ae60352` | 219 | 993,396 |
| Shipped owner files | 39 | 357,491 |
| of which editable: all six `lib/*.js` | 6 | 125,659 |
| Share shipped | 17.8% | 36.0% |

Shipped read-only: `package.json`, `package-lock.json` (96,378 bytes), `index.js`, `REQUEST.md`, the outcome test, 27 guard tests, `tests/testHelpers.js`. The product's own figure is 39 of 217; it skips three tracked symbolic links. The editable set was not narrowed to the file the fix touched; the solver changed one of the six.

## Export: six attempts, five refused

Every attempt ran in a container with the network off. Raw output: `evidence/wave2/export-attempt-<n>.*`.

| # | Exit | Message | Kind |
|---|---|---|---|
| 1 | 1 | `Cannot find package 'typescript' imported from /src/box-tool/cli.js` | Product: the built `cli.js` needs `typescript` at start-up as well as `zod`, even for an agreement that uses no TypeScript feature. Installed `typescript@6.0.3` beside it. |
| 2 | 1 | `ENOENT: no such file or directory, mkdtemp '/src/out/attempt-2/.box-staging-XXXXXX'` | Product: export does not create the parent of `--out` and the message does not say so. Created it. |
| 3 | 1 | `git clone --local … failed to create link … Invalid cross-device link` | Product, first seen on Linux: export clones the owner repository into the system temp folder with `--local`; when that is another filesystem, Git refuses. Set `TMPDIR` onto the repository's volume. |
| 4 | 1 | `paired check 'box-variadic-outcome' exits identically but fails differently in the isolated Box than on the untouched base — a missing selected file cannot masquerade as the declared outcome.` | **Product, the headline finding.** Nothing was missing; the two output tails it printed are identical. |
| 5 | 1 | The same, with `--test-reporter=dot` declared. The tails show the only difference: `(2.154704ms)` against `(2.272095ms)`. | **Same finding.** |
| 6 | 0 | Exported. | With the workaround below. |

### The headline finding

Export runs each recipient check twice, in a clone of the base and in the staged Box, and refuses unless the two outputs have the same digest over everything printed. Node's test runner prints how long each test took, so two runs of the same red test never print the same bytes. None of Node's built-in reporters prints a failure without its duration. Most test runners print timings. As built, the paired check refuses a real test runner's red output, and its message blames a missing file.

### The workaround, and what it cost

In agreement data only, the recipient outcome check was declared with `--test-reporter=lcov`, which prints nothing, and the recipient guard with `--test-reporter=dot`, which prints only dots while green. No code was written and the product was not changed. The cost:

- The paired evidence for the outcome check is "exit 1 on both sides, empty output on both sides". It no longer shows that the Box fails for the same reason as the base, which is the whole purpose of the pairing.
- The solver's outcome check gave an exit code and no text.
- A guard that turned red would print durations too; that path was not exercised.

This case therefore does not count as the paired check working on a real test runner. It worked on a silenced one.

### Paired evidence as recorded in `box.json`

| Recipient check | Base clone | Staged Box | Match |
|---|---|---|---|
| `box-variadic-outcome` | exit 1, empty output | exit 1, empty output | exit, result and digest equal; the digest is that of two empty strings |
| `box-options-guard` | exit 0, dots | exit 0, dots | exit, result and digest equal |

Owner-context results at base, not paired: outcome exit 1 with `strictEqual false !== true` at `tests/options.variadic.test.js:176`; guard exit 0; both installs exit 0.

`npm ci` ran three times inside export from a cache warmed beforehand, with `npm_config_offline=true` set on the container. The declared setup carries no offline flag. The project's tests ran with the network off throughout.

## The solver's conditions

**What it had.** A folder with `SOLVER.md`, a wrapper `run.sh` and the Box in `work/`: 39 owner files, `box.json` and `box/submit.mjs`. The wrapper offered `setup`, `check <name>`, `checks` and `submit`, each in a throwaway container that mounted only `work/` and a volume for `node_modules`; checks and submit had no network.

**What it could not see through the wrapper.** The other 181 tracked files, the Git history, the fix, the pull request, the issue comments.

**Enforced:** what the containers mounted; the read-only files (sealing refuses if one changed, and after the solver finished only `lib/option.js` and `submission.json` differed from the exported Box); the editable list (verify rejects anything outside it).

**Only an instruction:**

- The solver was an agent on this machine. Its session started in our repository's folder with our project instructions loaded. It says it opened nothing there. Nothing stopped it.
- The Box's `package.json` names the package and its repository URL. The solver said it recognised the library and had no knowledge of this issue or fix. With web access the fix was findable. The scratch folder's name also carried the pull request's number.
- It was told to use the wrapper rather than run the code on the host.

**What it did**, by its own report, checked against the files: changed only `lib/option.js`; ran `setup` (0), `checks` (0), `submit` (0); sealed once. It edited before its first check run, so it never saw the red outcome itself. One attempt; no rerun was asked for.

## Owner-side verify

`node cli.js verify submission.json --agreement … --repo /src/repo --box /src/pristine/box-2615`, in a container, network off, same offline cache as export.

- **Process exit code: 0. Verdict: `pass`.**
- Six files applied, one changed (`lib/option.js`, 10,237 to 10,386 bytes).
- Declared owner checks on the applied change: `install` exit 0; `variadic-outcome` exit 0, pass; `options-guard` exit 0, pass.
- Scratch merge `6243ae5f…` on branch `box-verify/variadic-option-placeholders-v1-c89a23aab5e3`; the scratch clone was removed by the product. The owner repository was clean and at the same commit afterwards.

Report: `evidence/wave2/verify-solver.stdout`.

## Held-back probe

Separate from the product's verdict. Written from the issue's example, never shown to the solver, run with the network off on three trees: the owner base, the base with the solver's change, and the maintainers' fix. Each line is what the library returned. Table: `evidence/wave2/probe-table.txt`.

The issue's own example:

- `new Option('--tag <值...>').variadic`: base `false`; **solver `true`**; fix `true`.
- Parsing `--tag one two` with that option: base throws `too many arguments. Expected 0 arguments but got 1: two.`; **solver `{ tag: ['one', 'two'] }`**; fix the same. This is the issue's expected result.

Existing behaviour:

- `<value...>` and `[value...]` stay variadic, and `--tag one two` still parses to two values, on all three trees.
- `<value,...>` stays non-variadic on all three. So does `<值,...>`, and `<值>` without dots.

Where the solver and the maintainers differ, reported without judging either:

- `<e` + U+0301 combining acute + `...>`: solver `true`, fix `true`. This is the class the maintainers' test needs.
- `<value` + U+203F undertie, a connector other than underscore, + `...>`: solver `false`, fix `true`.
- `<l` + U+00B7 middle dot + `...>`: solver `false`, fix `true`.
- `<a,` + U+0301 + `...>`, a mark straight after a comma: solver `false`, fix `true`.
- `<x` + U+00B2 superscript two + `...>`: solver `true`, fix `false`.

Four of the fourteen probes differ. The maintainers' own test suite does not cover any of the four.

## Comparison with the maintainers' fix

Both change the same line of `lib/option.js`. The maintainers replaced `\w` with `\p{ID_Continue}`; the solver replaced it with `[\p{L}\p{N}_]\p{M}*`, a letter, number or underscore followed by any combining marks, and added one comment line. The solver's rule is narrower for connectors, the middle dot and stray marks, and wider for numbers such as superscripts.

The fix commit's full runtime suite (`node --test`, 109 test files) with the solver's `lib/option.js` in place of the maintainers': **exit 0; 1,421 tests, 1,421 pass, 0 fail.** The same suite on the unmodified fix commit, as a control: exit 0; 1,421 of 1,421. The project's type checks (`tsd`, `tsc`) were not run.

## Negative: a no-op is rejected

A fresh copy of the pristine Box, sealed with `node box/submit.mjs` and no edit (`changed: 0`), then verified the same way:

- **Process exit code: 3. Verdict: `fail`, class `implementation-failure`, reason `command-check`.**
- Detail: `declared outcome check 'variadic-outcome' did not pass (result: fail, exit 1)`; guard exit 0; no merge.

## Accepted deviations

- **Two local commits in the owner repository, not one.** Commit 1 adds only the maintainers' test (`3b25bc9`, 7 insertions). Commit 2 adds only `REQUEST.md` (`5841f7a`) and is the agreement's base. Export reads shipped files from the owner source root and refuses one that differs from its base, so the request text had to be committed.
- **One line added to the image recipe**, so that a volume mounted at `/work/node_modules` is writable by the non-root user.
- **The recipient checks declare a reporter**; the owner checks do not. See the workaround above.
- **The closing order.** Resources were removed before the final commit rather than after it, so that this file could list them and `verify.mjs` could run on the last commit.

## What would have confused a real requester

- The pairing refusal names a cause that was not the cause and shows two identical tails.
- A shipped file must be committed first; a new request file cannot simply be pointed at.
- The agreement needs the 27 guard files typed three times, plus fields with no meaning here (`declaredDependencies`, `excludedPrefixes`, a `checks` description that only produces a warning).
- `--out` needs an existing parent folder.
- The product needs `typescript` installed to start.

## Limits

- **One case, one solver, one run of everything.** No spread, no repeat.
- **Replay** of a fixed issue, on a small one-line fix in a library with no runtime dependencies.
- **Same model family** for the cook, the solver and the reviewer.
- **The solver saw the acceptance test**, and needed it: the request alone points at a different fix.
- **Blindness by instruction**, on a machine that holds the repository, with the project named inside the Box.
- **The outcome check was silent**, and the paired evidence is exit codes and empty output only.
- **Clocks are agent times** and exclude the cook's reading of the schema and export source.
- **The editable rule** was all of `lib/`; a narrower rule would have been hindsight and a wider one was not tried.
- **Not run:** the control case; the project's type checks; a wrong (non-no-op) submission; a tampered read-only file; verify without `--box`; anything on a second repository; the solver on a machine without the repository; a human solver.
- **Linux:** the product had not been run by hand on Linux before. Three of the five refusals were found that way; other paths remain untried.

## Safety record

- Nothing went to the project. Three `gh` calls, all GET, logged with times in `evidence/wave2/gh-commands.log`; one anonymous clone.
- The project's code ran only in `kitchen-r3b-tools` containers: non-root, 2 GB, all capabilities dropped, no new privileges, no Docker socket, no host environment, no mount of this repository. The product ran there too.
- Network on only for the image build, the clone, one `npm ci --ignore-scripts` that warmed the cache, two `npm install --ignore-scripts` of the product's own dependencies, and the wrapper's `setup`. Off for every export, check, probe, suite and verify run.
- The only host mount was the scratch folder's `work/`, for the solver's wrapper.

## Resources

Created and removed, checked empty at 23:48Z with `docker ps -a`, `docker volume ls`, `docker images` and a listing of the temp folder:

- Image `kitchen-r3b-tools`.
- Volumes `kitchen-r3b-src`, `kitchen-r3b-nm-2615`, `kitchen-r3b-nm-wrappertest`.
- Containers (all `--rm` or removed): `kitchen-r3b-cp`, `-prepare`, `-tool-install`, `-export-1` to `-6`, `-verify-solver`, `-verify-noop`, `-trees`, `-probe-owner-base`, `-probe-solver`, `-probe-fix`, `-suite-solver`, `-suite-fix`, `-noop-seal`, and unnamed readers.
- Host folders under the temp folder: `kitchen-r3b-box-2615`, `kitchen-r3b-wrappertest-2615`, `kitchen-r3b-in`, `kitchen-r3b-sub`, `kitchen-r3b-agreement-1` to `-6`.

Left alone because this wave did not create them: four older folders in the temp folder (`box-a2-guard-*`, `box-a2-missing-*`, `box-export-stage-*`, `box-verify-*`), Docker build-cache layers, and the base Node image. No `postgres` process was running.

## Evidence, under `evidence/wave2/`

| File | What |
|---|---|
| `handoff-2615.md` | The part-one record: identities, clocks, manual steps, disclosure scan |
| `agreement-2615.json`, `agreement-2615.attempts-1-4.json`, `agreement-2615.attempt-5.json` | The agreement as exported and as first written |
| `export-attempt-<n>.{meta,stdout,stderr}` | All six export attempts |
| `box.json`, `box-inspect.txt` | The exported manifest and its inspection |
| `REQUEST.md`, `issue-2614.comments.raw.json`, `issue-2614.timeline.raw.json`, `pr-2615.meta.raw.json`, `gh-commands.log` | The request text and the logged read-only queries |
| `solver-kit/`, `wrapper-test.log`, `handoff-copy-check.txt` | What the solver was given, and the checks made on it |
| `submission-2615.json`, `solver-2615.diff`, `maintainers-2615-lib.diff` | The submission and both changes |
| `verify-solver.*`, `verify-noop.*`, `negative-noop-seal.log` | The product's two verify runs |
| `probe-*.jsonl`, `probe-table.txt` | The held-back probe on three trees |
| `part-two-*.log`, `full-suite-solver.out`, `full-suite-fix.out` | The comparison trees and the full suite runs |
| `prepare-owner.log`, `image-build.log`, `box-tool-typescript-install.log` | Preparation |

Scripts are in `wave2/`. Product `cli.js` SHA-256 `e7ef9ce1e1d26721b83c394e299d4dae8c9891639cac674f80a23d45b5a6fe2e`, the existing build from the checkout at `ca8aaa3`, not rebuilt. The owner repository, the pristine Box and the solver's folder no longer exist; the two verify runs can be repeated only by rebuilding the case with `wave2/prepare-owner.sh`, which will give the same commits only if the commit times match, so a rerun would need a new export.
