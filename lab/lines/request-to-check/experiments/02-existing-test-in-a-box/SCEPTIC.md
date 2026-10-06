# Sceptic: request-to-check/02

Date: 6 October 2026. Reviewer: a fresh agent started by the lab lead with the role file and this experiment's files, no earlier conversation. Host: Claude Code on the Windows 10 machine, lab worktree, branch `lab`. Model: the session states Opus 5.5 (`claude-opus-5-5`). The experiment's two commits carry a "Claude Opus 5.5" co-author line, so this review is by the same model family as the work. It is independent by being a fresh agent, not by being a different model.

Rerun with: `node lab/lines/request-to-check/experiments/02-existing-test-in-a-box/sceptic-run.mjs` (about two minutes; raw records in `sceptic-results.json`; works in a temp directory `lab-sceptic02-*` and removes it).

## 1. Reproduction

`node lab/tools/kitchen-busy.mjs` printed idle. `run.mjs` was rerun once, unchanged, in 28 seconds. Every printed line matches the Result table: A refused at parse with the quoted message, B refused naming `vitest`, C exported, install exit 0, base 10 of 10 and red, accepted change 10 of 10 and green, `tsc` exit 0 in all four states, both post-hoc candidates fail the guard.

One number differs. The rerun reports 3 owner files of **746**, not 745. The inventory counts the files of the commit being exported, and the Result commit itself added `results.json`. The figure moves with every commit to the lab branch; 745 was right at `dfb4f31`.

The rewritten `results.json` differs from the committed one only in the lab HEAD, that count, the base commit hash, temp directory names and timings. The temp directory was removed. `git status` after the rerun showed `results.json` changed by the rerun, plus `lab/lines/request-to-check/related-work.md`, `lab/survey.md` and `lab/papers/` changed by someone else working in the worktree at the same time. Those three were not touched by this review.

The result reproduces.

## 2. The measurement

Checked and found sound:

- **The base is faithful.** The diff from the reconstructed base to today's script is the same as `git diff e412e08 ddeb3ab -- scripts/kitchen-stats.mjs`, line for line: the same two removed lines in `readWaves` and the same six removed lines in `page`, the same one added line (`sceptic-results.json`, `part1.baseFidelity.identical: true`). It is still today's tree around those lines, not R1's tree, as the README says.
- **The folder is outside any checkout.** No directory above the exported folder holds `node_modules`, `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `.git` or a vitest config. From inside the folder `vitest` and `typescript` resolve to the folder's own `node_modules`. The vitest banner names the folder as its root.
- **The guard runs against the Box's copy of the script.** The test computes `root` as two directories above itself. In the Box the test sits at `src/tests/kitchen/`, so `root` is `src/` and the script path is `src/scripts/kitchen-stats.mjs`. The probes run with that `root` as working directory. The two post-hoc candidates (which change only the Box's copy) fail the guard, which could not happen if the lab worktree's script were being run.
- **`tsc --noEmit` does typecheck the shipped test.** The generated `tsconfig.json` includes `src` and `evaluator`. A type error appended to the shipped test made `tsc` exit 2 naming `src/tests/kitchen/kitchen-stats.test.ts`.
- **"3 owner files" is what `box.json` reports**: `disclosure.shippedOwnerFiles: 3`, and the three non-generated entries are the script, `process.mjs` and the test.
- **The exporter is master's.** `git diff master HEAD -- packages/box-package packages/box-cli` is empty.
- **The three "what stands between" statements match the code**, with one correction to the first:
  - (a) `agreement.ts` line 47: `evaluator` is an array with `.min(1)` of `{ box, generator }`. Correct. But the schema only checks the name's shape; `export.ts` calls `generate()`, which accepts any registered name. So the format does not demand a generator written for this request. It demands any registered one. See attack 3.
  - (b) `verify.ts` runs `install`, `tsc --noEmit` and `vitest run` on the registered owner check files only. `agreement.checks` is never read there. Correct.
  - (c) `export.ts` copies `agreement.checks` into `box.json` (line 137) and does nothing else with it. Nothing runs a check at export. Correct.

Findings:

1. **The third check is not a check. Its exit code is 0 on the base.** The agreement lists `node src/scripts/kitchen-stats.mjs  # fails if the output contains "Usage per wave"`. The words after `#` are a comment. Run exactly as `box.json` gives it, the command exits 0 on the base while printing the Usage section (`part1.literalChecks`). "Red on the base" in the table is the runner's own `stdout.includes('Usage per wave')`, code that lives in `run.mjs` and is in no Box. The Design paragraph says the rule is applied by the runner; the Result ("One command gave the evidence of change, red on the base and green after") and the cost line ("two check lines") read as if the Box carried a working check. It did not.
2. **A recipient who changes nothing sees every declared check pass.** On the untouched base the three checks as written give `tsc` 0, guard 0, third command 0. Nothing in this Box's declared checks distinguishes "done" from "not started". The guard is not meant to; the command was meant to and cannot.
3. **`tsc` says nothing about the script.** The script is `.mjs` and the generated settings do not check JavaScript. A syntax error placed in the Box's script left `tsc` at exit 0. "`tsc --noEmit`: exit 0 in both states" is true and would be true for any content of the script, including the empty file (the post-hoc rows show exit 0 there too). The row measures the test file's typing and nothing about the change.
4. **One of the guard's ten tests is hollow in the Box.** The test that requires the page to exit 0 "on the real repo" runs against `src/`, which has none of the limit files. It passes because there is nothing to measure. The README reports this under Surprise. In the owner's tree that test can fail; in the Box it cannot.
5. **Three runs, one record.** `results.json` holds the last run only. The setup failure and the second run are described in prose and have no record.

## 3. Attacks on the conclusion

### 3.1 Is this test a lucky case? Six other existing tests, same route

Each case: today's tree unchanged as the base, the test added as an entrypoint, the file it tests as the editable, `vitest` declared, R1's generator listed because the format demands one, and any dependency the exporter named added at the version the repository already pins. Then install, `tsc`, and the test in the folder. No candidate change is applied: the question is only whether the test travels and is green before anyone touches anything. Each test was also run in the lab worktree first.

| Case | Test as guard, for | In the repository | Export | Gaps the exporter named | Owner files | Guard in the folder, on the base |
|---|---|---|---|---|---|---|
| exp 02 | `tests/kitchen/kitchen-stats.test.ts`, `scripts/kitchen-stats.mjs` | 10 of 10 | ok | `vitest` | 3 | **10 of 10** |
| T1 | `tests/kitchen/verify-reuse.test.ts`, `scripts/suite.mjs` | 10 of 10 | ok | none beyond `vitest` | 4 | **10 of 10** |
| T2 | `tests/kitchen/k6-scope-budget.test.ts`, `scripts/kitchen-stats.mjs` | 4 of 5 | ok | none | 3 | **3 of 5, red** |
| T3 | `tests/kitchen/k6-corrections.test.ts`, `scripts/kitchen-stats.mjs` | 10 of 10 | ok | none | 3 | **9 of 10, red** |
| T4 | `tests/contracts/paths.test.ts`, `packages/contracts/paths.ts` | 34 of 34 | ok, second attempt | `zod` | 3 | **34 of 34** |
| T5 | `tests/contracts/composition.test.ts`, `packages/contracts/public/index.ts` | 25 of 25 | ok, second attempt | `zod` (six import chains) | 9 | **25 of 25** |
| T6 | `tests/contracts/boundaries.test.ts`, `scripts/boundaries.mjs` | 4 of 4 | ok, second attempt | `typescript` | 3 | **1 of 4, red** |

`tsc --noEmit` exited 0 in all six folders.

Named reasons for the red ones:

- **T2:** one test starts `scripts/suite.mjs` by a path built from the root; the file is not in the Box (`Cannot find module ...\src\scripts\suite.mjs`). A second test reads `.kitchen/runs` under the root (`ENOENT ... src\.kitchen\runs`). That second test also fails in the lab worktree, which has no `.kitchen/runs`, so only the first failure is about travelling.
- **T3:** one test starts `scripts/suite.mjs` by path; not in the Box. The other nine pass, including three that name a pnpm shim and the pinned pnpm by path (not examined why; they may not reach those paths on this route).
- **T6:** the test reads `packages/contracts/package.json` and runs `./scripts/boundaries.mjs` relative to the working directory, not relative to itself. In the Box the working directory is the Box root and the script is at `src/scripts/`. Three of four fail with file not found.

What this shows:

- **Four of seven existing tests were green in the folder on the base. Three were red for reasons unrelated to any change.** The seven were chosen by this reviewer and by the lead, not sampled. It is not a rate.
- **In all three red cases the export succeeded and named no gap.** The exporter names missing packages. It does not see files a test opens or starts at run time. A requester learns the guard is broken only by installing and running it in the folder, which the product does not do (statement (c) above). This is the README's "partly supports" outcome, observed on other tests.
- **The Limits paragraph is wrong on one point and right on another.** It says a test that "imports helpers" would behave differently. T4 and T5 import repository helpers, a fixtures module and a third-party package, and travelled cleanly: selection follows imports, and the one missing package was named. What breaks is what the paragraph also names: paths built from the root or the working directory (T2, T3, T6). No database-backed test was tried.
- **The experiment's test is not a fluke, and it is not typical either.** T1 has the same shape and also travels. The two other tests that guard the very same script (T2, T3) do not.

### 3.2 The evaluator that had to be listed

R1's generated evaluator is in the folder at `evaluator/kitchen-stats-no-usage.test.ts` and is not among the declared checks.

- **A plain `pnpm exec vitest run` in the folder picks it up.** On the base: exit 1, 2 files, 12 of 14 pass; the two failures are the evaluator's own (the Usage text is present). After the accepted change: exit 0, 14 of 14.
- So in the experiment's Box the only thing that is actually red on the base and green after the change, by exit code, is R1's custom evaluator: the artefact this route was meant to make unnecessary. The declared checks do not include it and a recipient running the declared checks never sees it.
- **A wrong candidate that keeps the section and rewords its heading** ("Agent usage by wave") passes all three declared checks, and passes the runner's "contains `Usage per wave`" rule as well. R1's evaluator rejects it (2 of 4 fail). This is experiment 01's known weakness of the phrase test, now shown on this route.
- **For another request the listed generator is noise or worse.** In T4, T5 and T6 the Box has no `kitchen-stats.mjs`; the evaluator fails 4 of 4, so a plain `vitest run` in those folders is red whatever the recipient does. In T1, T2 and T3 the script is present in today's form and the evaluator passes 4 of 4 while testing nothing about the request.
- **Inference from the code, not run:** the owner side keys its check on the listed generator. For the experiment's Box, owner verify would run R1's custom owner check, not the existing test. For a different request listing R1's generator, it would run R1's check against the owner's `kitchen-stats.mjs`, pass, and merge, having checked nothing about the submitted change beyond `tsc`. So the README's statement 1 ("a new request has no such generator, so today it must write one") is not what the code enforces. A new request can list any registered generator and export. What it gets is a Box and an owner verify whose only outcome check belongs to another request.

### 3.3 Strongest case against the claim as worded

The claim has two halves: the existing test as guard, and "one command as its evidence of change ... red on the base".

- The guard half held on every probe: it ran the Box's script, in isolation, green on the base, green after the change, red on two wrong candidates.
- The command half does not hold as worded. No command in the Box is red on the base. The evidence of change was computed by the experiment's runner. Making it a real check needs a command that exits non-zero on a phrase, written to work in the recipient's shell (the pipe-to-grep form is not portable to the Windows command shell this machine uses), or a small script shipped in the Box, which is new request-specific code, the thing the claim excludes. That cost is not zero and is not measured here.
- "No request-specific code" is true only because R1's request-specific generator was already in the product and was reused. The README says so in statement 1. The claim sentence does not.

## 4. The framing

- **Meanings before the run: confirmed as far as Git can show.** `dfb4f31` (10:46:09) holds the README down to the rule, with the four outcome meanings, and `run.mjs`. `1b47212` (10:47:53) adds 32 lines to the README, all below the rule, removes none, and adds `results.json`. The recorded run carries `labHead: dfb4f31` and vitest start times of 10:47:21 and later, so the recorded run is after the plan commit.
- **Not confirmable:** the README says the runner was run three times with two edits between. The plan commit and the Result commit are 104 seconds apart and one run takes about 28 seconds. Only the last run has a record. Git cannot show when the first two happened.
- **`run.mjs` was edited after the plan commit: disclosed accurately.** Two edits: the base is rebuilt by text instead of `git apply` (the committed plan version could not have run; the README says the first run died there with no measurement taken), and the post-hoc block. Both are named in the Result, and the post-hoc rows are labelled as not predicted. The text rebuild is faithful (section 2).
- **Is "supports" the right word?** Under the rule written beforehand ("C exports and predictions 4 and 5 hold"), yes: all three held. The rule itself counted "the command is red" by the runner's reading, so the rule was met as written. The word is right for the rule and too strong for the sentence that follows it.
- **Overstated:**
  - "One command gave the evidence of change, red on the base and green after." The command exits 0 in every state. The runner gave the evidence.
  - "What the requester had to write ... two check lines." One of the two is a comment, not a check.
  - "Then an existing test can be the guard through today's exporter" (the pre-written meaning) reads as general. Observed: this one can; of six others, three cannot, and the exporter does not say which.
  - "A new request ... must write one [generator]." Not enforced; any registered one exports.
  - "`tsc --noEmit`: exit 0 in both states" is reported beside the guard and the command as if it bore on the change. It cannot see the script.
- **Understated:** the Limits paragraph groups "imports helpers" with the cases that would break. Those travel.
- **Stated correctly:** one request, one test; the base is a reconstruction; nothing was submitted or owner-verified; nothing runs checks at export; the test ships as disclosed source; the "real repo" test passes in the folder only because the limit files are absent.
- **Dropped quietly:** nothing found. The first run's failure is recorded.

## 5. Cost

Nothing paid. Both runners use local Git, Node v24.11.0, the repository's own CLI through the `tsx` already installed here, and the pinned pnpm in `scripts/tooling`. The exporter's lockfile step and the installs contact the public npm registry and the local pnpm store; no model call, no service, no purchase. Nothing was installed into the lab folder. This review added `sceptic-run.mjs`, `sceptic-results.json` and this file, created one temp directory `lab-sceptic02-*` and removed it. It did not commit.

## Standing

**The guard half stands, as one case. The command half does not stand as worded. The general reading weakens to "suggests".**

- Stands: the observed table. It reproduces, apart from 745 becoming 746.
- Stands: with today's exporter and no new code, R1's pre-existing test was exported into a Box, ran there in isolation against the Box's copy of the script, was green on the base, green after the accepted change and red on two wrong candidates. Deterministic, reproduced, one request.
- Stands: the three "what stands between" statements (b) and (c) exactly, and (a) with the correction that any registered generator satisfies the format.
- Does not stand: "one command as its evidence of change ... red on the base". No declared check fails on the base. A recipient who does nothing passes all three. The evidence of change in this experiment came from the runner, and inside the Box only R1's unlisted custom evaluator supplies it.
- Weaken to "suggests": "an existing test can be the guard through today's exporter" as a statement about existing tests. Four of seven tried were green in the folder; three were red for reasons the exporter did not name. Seven hand-picked tests in one repository; not a rate.
- Does not stand: "a new request must write a generator" as a description of what the product enforces today.

The reading the evidence supports: tests whose only ties to the repository are imports travel through today's exporter and work as a guard; tests that start or read other files by path do not, and the exporter cannot tell the two apart, so a guard has to be run in the exported folder on the base before it is trusted. The evidence-of-change check is still unsolved on this route: the one tried here is a comment, and the only working one in the Box is the custom evaluator from R1.
