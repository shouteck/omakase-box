# request-to-check/01: would a cheap check have judged R1 as well as its custom check did?

Line: request-to-check · Date: 6 October 2026 · Rerun with: `node lab/lines/request-to-check/experiments/01-r1-cheap-check/run.mjs` (needs `node scripts/pnpm.mjs install --frozen-lockfile` once in the lab folder)

Everything above the rule is written before anything is run.

## Claim under test

For R1 (remove the "Usage per wave" output from `scripts/kitchen-stats.mjs`, keep everything else), a check made of what the repository already had plus one command gives the same accept/reject verdicts as the custom check R1 wrote. If so, most of R1's preparation cost bought nothing a reviewer could observe, which is R2's premise.

Builds on the field's fail-to-pass plus pass-to-pass shape (SWE-bench) and on the survey's lead from the Git record. It could be wrong: the existing test may not exercise the printed page closely enough to notice damage.

## Design

- **Compared:**
  - **Check A (custom, what R1 used):** `tests/kitchen/kitchen-stats-no-usage.test.ts` as merged at `ddeb3ab`, 83 lines. (R1 also wrote about 320 lines of generator, owner-check and packaging tests around it; those deliver this same test into the Box and the owner run, and are not separate judgements.)
  - **Check B (cheap):** B1, `tests/kitchen/kitchen-stats.test.ts` exactly as it stood at R1's base `e412e08`, before R1 existed, 193 lines, zero new lines; and B2, one new command: run `node scripts/kitchen-stats.mjs` and fail if the output matches `usage`, any case. B accepts only if both pass.
- **Held equal:** the same candidate file, the same surrounding repository (the lab worktree), the same Node and vitest.
- **Cases:** eight candidate versions of the script. Development cases, all written by the lab lead who also knows both checks, so this is not held-out.
  - C0 no change (R1's base). Wrong.
  - C1 the change R1 accepted (`ddeb3ab`). Right.
  - C2 empty file. Wrong.
  - C3 section kept but reworded so the word "usage" never prints ("Tokens per wave"). Wrong.
  - C4 right change, but `checkLimits` is no longer exported. Wrong.
  - C5 right output, but the unused Usage parsing is left in. Wrong by the request's wording; not observable from outside.
  - C6 right change, but the "Largest costs" heading is also deleted. Wrong (over-deletion, the classic failure of automated repair).
  - C7 right change, but one "missing" label is replaced by "0". Wrong.
- **Runs:** one per candidate per check. The checks are deterministic; a second full pass is run only to confirm that.

## Predictions, written first

| Case | A | B |
|---|---|---|
| C0 | reject | reject |
| C1 | accept | accept |
| C2 | reject | reject |
| C3 | accept (wrongly) | accept (wrongly) |
| C4 | reject | reject |
| C5 | accept | accept |
| C6 | reject | accept (wrongly) |
| C7 | accept (wrongly) | accept (wrongly) |

## What each outcome would mean

- **Supports the claim:** B's verdict equals A's on every case, or B is stricter.
- **Partly supports:** B is right on C0, C1 and C2 but misses a case A catches. Then the lines R1 wrote bought exactly those cases, and the count of lines needed to close the gap is the honest price.
- **Refutes it:** B accepts C0 or C2, or rejects C1.
- **Tells us nothing:** the old test cannot run in the current tree for unrelated reasons.

Whatever happens, eight hand-made cases on one request say nothing about rates.

## Cost and coordination

Zero-cost check: Node, pnpm and vitest already pinned by the repository; nothing paid. Heavy jobs: one frozen install in the lab folder and sixteen short vitest runs, after `node lab/tools/kitchen-busy.mjs` says idle. The runner swaps `scripts/kitchen-stats.mjs` in the lab worktree and restores it from Git when it finishes or fails.

---

## Result

- Observed (two full passes, identical verdicts; raw records in `results.json`):

| Case | Right? | A custom (83 lines) | B cheap (0 lines + 1 command) | Predicted |
|---|---|---|---|---|
| C0 no change | no | reject | reject (the command) | yes |
| C1 accepted change | yes | accept | accept | yes |
| C2 empty file | no | reject | reject (existing test, 10 of 10 fail) | yes |
| C3 section reworded | no | **accept** | **accept** | yes |
| C4 helper not exported | no | reject | reject (existing test) | yes |
| C5 dead parsing left in | no | **accept** | **accept** | yes |
| C6 another heading deleted | no | reject | **accept** | yes |
| C7 a missing label became 0 | no | **accept** | **accept** | yes |

- Outcome: **partly supports.** The cheap check agrees with the custom check on 7 of 8 cases, including the three R1 required (accept the real change, reject no change, reject an empty file). It misses one case the custom check catches: a neighbouring heading deleted. The custom check catches that with one line listing the five headings that must still print.
- So on these cases, what R1's custom test bought over what the repository already had is: the one condition that makes the request (no "usage" in the output) and one list of headings to keep. The rest restated the existing test.
- Surprise, not followed further here: the custom check itself accepts three of the six wrong candidates (C3, C5, C7). The test R1 paid for can be passed by rewording the section instead of removing it. It checks for a word, not for the section. This is the survey's "tests accept wrong work" seen on our own check.
- Limits: eight hand-made cases by someone who had read both checks; not a rate, and all sixteen predictions came true, which means the cases probed what was already understood. One request, of the "remove something" kind, where "everything else unchanged" is the bulk of the requirement and an existing test happened to cover it. Run in the lab worktree, not inside a Box: whether the existing test can ship in a Box and run there is untested (it shells out to the real script and reads the real repository, so it may need the same packaging work R1 did). No second correct solution was tried, so nothing is shown about either check rejecting right work.

## Sceptic

Full report in [SCEPTIC.md](SCEPTIC.md); its added cases are in `sceptic-run.mjs` and `sceptic-results.json`.

- Who: a fresh agent on the same Windows host, same model family as the lab lead. Independent by being fresh, not by being different.
- Reproduced: yes. All eight verdicts for both checks match; `results.json` came out byte-identical.
- Attacks: ten added candidates. On six further wrong ones the two checks agree on only one. The custom check rejects two the cheap check accepts (another heading deleted; every "missing" label replaced). The cheap check rejects three the custom check accepts (unattributed runs dropped; the stall guard weakened; a limit loosened from 10 to 100). Of three right candidates, each check wrongly rejects one: both fail when the word "usage" appears in a printed path or wave name.
- Standing: the observed table and "partly supports" stand. **Weaken to "suggests"** that the cheap check judges R1 about as well as the custom one. **Does not stand:** "the rest restated the existing test" and "misses one case, one line".

## Corrections to the Result above, after the sceptic

The Result is left as first written. These are its errors:

1. "Three of the six wrong candidates" should be three of seven.
2. "Two full passes" is true but not in the record: the runner was run twice and the two outputs compared, then the first output was deleted. The sceptic's rerun is the recorded second pass.
3. "It misses one case" and "the rest restated the existing test" are wrong. Neither check contains the other. Over all 13 wrong candidates (seven here, six from the sceptic) each check rejects seven, and not the same seven. Not a rate: every case was hand-made by someone who had read both checks.
4. The cases chosen flattered the cheap check. C6 deletes one of the only two headings the existing test does not protect, and C7 replaces one "missing" label of several.
5. "83 lines against 0 lines + 1 command" compares the two judgements, not R1's cost. R1 was 827 added lines in 18 files for a 9-line change, and the check's body exists three times (the test, the generator and the owner check). Whether the cheap check can be delivered into a Box without that plumbing was not tested, so this experiment says nothing about how much of R1's preparation cost was avoidable.
6. The cheap check's command ignores the exit code, and its verdict on some candidates depends on what happens to be in the repository's wave files.

## What the experiment now supports

- **Shows** (on R1, reproduced): R1's purpose-written check accepts wrong work, including a version that rewords the section instead of removing it, and rejects right work when "usage" appears in a path. The test that already existed catches wrong work the purpose-written one misses.
- **Suggests:** for a "remove this, keep the rest" request, the existing tests are a better guard than a freshly written one, and the new part worth writing is small: the condition that makes the request, plus whatever the existing tests do not protect.
- **Does not show:** that R1's cost was avoidable, or any rate.
