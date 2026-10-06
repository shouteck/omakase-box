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
