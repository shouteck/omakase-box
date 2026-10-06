# request-to-check/02: can a test the repository already has travel into a Box and work as the guard?

Line: request-to-check · Date: 6 October 2026 · Rerun with: `node lab/lines/request-to-check/experiments/02-existing-test-in-a-box/run.mjs` (needs the one-time installs recorded in the notebook, session 2)

Everything above the rule is written before anything is run.

## Claim under test

With the exporter as it is on master today, and no request-specific code, the R1 request can be packaged with the pre-existing test `tests/kitchen/kitchen-stats.test.ts` as its guard and one command as its evidence of change; in a clean directory the guard is green on the base, the command is red on the base, and both are green after the accepted change.

This is the question experiment 01 could not answer and the one R2 turns on. It could be wrong at three places: the agreement format may refuse it, the source selection may not carry what the test needs, or the test may assume the whole repository is around it.

## What reading the code already says (to be confirmed by running)

- `packages/box-package/agreement.ts`: an agreement must list at least one `evaluator`, and each names a `generator`, which is code registered in `scaffolds.ts`. There is no way to say "this existing file is the check".
- `packages/box-package/verify.ts`: the owner-side verify runs install, `tsc`, and the owner checks registered for those generators. It never runs the agreement's `checks` commands.
- `packages/box-package/selection.ts`: source is selected by following TypeScript imports. The existing test starts the script as a child process from a path built at run time, which is not an import.

## Design

- **Base:** a throwaway clone of the lab worktree in a temp directory, with R1's change to `scripts/kitchen-stats.mjs` reversed in one commit, so the Usage section is back. Everything else is today's repository. (R1's real base predates the exporter features R1 itself needed.)
- **Attempts, in order, each a real `box export` through the real CLI:**
  - A: R1's agreement with no evaluator at all, the existing test added as an entrypoint, checks naming the existing test and the command.
  - B: as A, but with R1's already-registered generator listed only to satisfy the format. It is not among the checks.
  - C: as B, plus whatever the exporter names as missing, if it names anything a requester could add in a line.
- **In the exported folder, outside any checkout:** frozen install; then on the base and again after copying in the accepted script: `tsc --noEmit`; the existing test under vitest; and `node src/scripts/kitchen-stats.mjs` with the rule "fails if the output contains `Usage per wave`".
- **Held equal:** same folder, same toolchain, only the one script file changes between the two states.
- **Runs:** one. Deterministic steps; the sceptic's rerun is the second.

## Predictions, written first

1. Attempt A is refused when the agreement is read, because the evaluator list is empty.
2. Attempt B is refused with a named gap: `vitest` is imported by the test and is not a declared dependency.
3. Attempt C (declare `vitest`) exports. The folder contains the script, `process.mjs` and the test, about three owner files.
4. In the folder on the base: install succeeds; the existing test is green (less sure: one of its ten tests runs the page "on the real repo", and the folder is not the repository); the command is red.
5. After the accepted change: the existing test is green and the command is green.
6. `tsc --noEmit` in the folder: unsure. The folder's generated settings are stricter than the repository's test settings; a failure here would be about the test's typing, not about the change.

## What each outcome would mean

- **Supports the claim:** C exports and predictions 4 and 5 hold. Then an existing test can be the guard through today's exporter, and what stands between R1's cost and this route is the format (it insists on a generated evaluator) and the owner side (it does not run named commands).
- **Partly supports:** it exports but the guard is red on the base for reasons that have nothing to do with the change. Then existing tests cannot be assumed to travel; the failures name what a test needs that import-following does not carry.
- **Refutes it:** no attempt exports without writing new code.
- **Tells us nothing:** install fails for network or tooling reasons.

## Cost and coordination

Zero cost: the repository's own CLI, pinned pnpm, packages from the public registry. Heavy jobs: one export with lockfile resolution, one install and six short runs in a temp directory named `lab-exp02-*`, after `node lab/tools/kitchen-busy.mjs` says idle. The runner removes the temp directory when it finishes or fails and changes nothing in the lab worktree except `results.json`.

---

## Result

Raw records in `results.json` (last run). The runner was run three times: the first stopped at setup, the second gave the first six rows below, the third repeated them and added the two post-hoc rows.

- **Setup failure, recorded:** the first run died building the base. R1's recorded patch no longer applies in reverse because K6 edited the neighbouring lines. The runner now restores the removed lines by text. No measurement had been taken.

| Step | Predicted | Observed |
|---|---|---|
| A: no evaluator | refused at parse | refused: `evaluator: Too small: expected array to have >=1 items` |
| B: existing test as entrypoint | refused, `vitest` undeclared | refused: `import of undeclared dependency 'vitest' (via tests/kitchen/kitchen-stats.test.ts -> vitest)` |
| C: B plus `vitest` declared | exports, about three owner files | exports; 3 owner files of 745 (the script, `process.mjs`, the test) |
| Install in the folder | succeeds | succeeds |
| Base: guard / command | green (less sure) / red | 10 of 10 pass / red |
| After the accepted change: guard / command | green / green | 10 of 10 pass / green |
| `tsc --noEmit` | unsure | exit 0 in both states |
| Post-hoc: empty script | not predicted | guard fails |
| Post-hoc: `checkLimits` not exported | not predicted | guard fails |

- Outcome: **supports**, with the limits below. With today's exporter and no new code, the test the repository already had travelled into a Box, ran in a clean directory outside any checkout, was green on the base, stayed green after the right change and went red on two wrong ones. One command gave the evidence of change, red on the base and green after.
- What the requester had to write for this, beyond R1's agreement: one more entrypoint, one declared dependency, two check lines. No generator, no owner check, no packaging test.
- The two post-hoc rows were added after seeing that the guard was green, to rule out that it was green because it tested nothing in the folder. They are not predictions.
- **What stands between this and a finished delegation, confirmed by the refusals and by the code:**
  1. The agreement format insists on at least one generated evaluator. Attempt C only exported because R1's generator was already registered and was listed to satisfy the format; a new request has no such generator, so today it must write one.
  2. The owner-side verify runs install, `tsc` and the registered owner checks. It does not run the agreement's `checks`. So the guard and the command ran in the Box but have no owner-side counterpart; this experiment did not submit or owner-verify anything.
  3. Nothing runs the checks on the base at export. The red-on-base and green-on-base results above were found by this runner, not reported by the product.
- Surprise: none against the predictions. The thing I was least sure of, the test that runs the page "on the real repo", passed in the folder; the script reports absent limit files as missing and exits 0.
- Limits: one request, one test, and a test unusually easy to move: it imports nothing from the repository, starts the script by a path relative to itself, and that path happens to land on the Box's copy. A test that imports helpers, needs a database, reads fixtures or builds paths from the repository root would behave differently; selection follows imports and would not have carried anything this test opened at run time. The base is a reconstruction (today's tree with R1's lines put back), not R1's real base. The existing test shipped to the recipient is disclosed source and a visible check; neither cost is measured here. Whether the check is any good is experiment 01's question, not this one's.

## Sceptic

Full report in [SCEPTIC.md](SCEPTIC.md); its six added cases are in `sceptic-run.mjs` and `sceptic-results.json`.

- Who: a fresh agent on the same Windows host, same model family as the lab lead.
- Reproduced: yes, every line of the table. (Its rerun reports 3 owner files of 746, not 745: the count is of the exported commit, which by then included this experiment's `results.json`.)
- Checked and sound: the rebuilt base matches R1's diff line for line; the folder is isolated; the test runs the Box's copy of the script; `tsc` does check the shipped test.
- Attacks: six other existing tests sent through the same route. All six exported. Three were green in the folder and three were red for reasons unrelated to any change, and in all three the exporter named no gap. Also: a recipient who changes nothing passes every check the Box declares.
- Standing: **stands as one case** that this test travelled and worked as a guard. **Does not stand:** "one command gave the evidence of change, red on the base". **Weaken to "suggests":** that existing tests in general can be the guard.

## Corrections to the Result above, after the sceptic

The Result is left as first written. These are its errors:

1. **The evidence-of-change check was not a check.** The third line in the agreement's `checks` is a command followed by a comment saying when it should fail. Run as written it exits 0 on the base. "Red on the base" was computed by this experiment's runner, which is in no Box. So in the exported Box nothing declared fails on the base, and a recipient who changes nothing passes all three declared checks. The claim "one command gave the evidence of change" is withdrawn; what was shown is that the guard half works.
2. `tsc --noEmit` cannot see the `.mjs` script at all. Its exit 0 in both states says nothing about the change.
3. "A new request must write a generator" overstates the code. The format accepts any registered generator, including one written for a different request, and then ships that unrelated evaluator into the Box and, by the code, would run its owner check. That is worse than a refusal: the format can be satisfied with a check that has nothing to do with the request.
4. The Limits paragraph guessed wrong about which tests travel. Tests tied to the repository by imports travel (two of the sceptic's cases, once their package dependency was declared). Tests that start or read other files by path do not, and the exporter cannot tell: it named no gap for any of the three that failed.
5. Only the last run is recorded; the first two exist only in this file's account of them.

## What the experiment now supports

- **Shows** (one case, reproduced): a test the repository already had can be shipped by today's exporter with no new code and work as a guard in a clean folder: green on the base, green after the right change, red on two wrong ones.
- **Suggests** (seven hand-picked tests, four green in the folder): whether an existing test travels depends on how it reaches the code. By import, it travels. By a path it builds at run time, it arrives broken, and export reports success.
- **Shows** (by running the declared checks): nothing in today's Box format makes a check red on the base, and the format can be satisfied by an unrelated registered evaluator.
- **Does not show:** a rate; anything owner-side; that R1's cost was avoidable end to end.
