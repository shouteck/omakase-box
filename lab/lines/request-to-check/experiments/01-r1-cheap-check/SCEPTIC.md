# Sceptic: request-to-check/01

Date: 6 October 2026. Reviewer: a fresh agent started by the lab lead with the role file and this experiment's files, no earlier conversation. Host: Claude Code on the Windows 10 machine, lab worktree, branch `lab`. Model: the session states Opus 5.5 (`claude-opus-5-5`). The experiment's commits carry a "Claude Opus 5.5" co-author line, so this review is by the same model family as the work it reviews. It is independent by being a fresh agent, not by being a different model.

Rerun with: `node lab/lines/request-to-check/experiments/01-r1-cheap-check/sceptic-run.mjs` (about two minutes; raw records in `sceptic-results.json`).

## 1. Reproduction

`node lab/tools/kitchen-busy.mjs` printed idle. `run.mjs` was rerun once, unchanged, in 93 seconds. All eight verdicts for A and B match the Result table, and the rewritten `results.json` is byte-identical to the committed one (`git status` shows no change to it). The runner restored `scripts/kitchen-stats.mjs` and removed its two temporary test files.

The result reproduces.

## 2. The measurement

Checked and found sound:

- Check A written by the runner is `git show ddeb3ab:tests/kitchen/kitchen-stats-no-usage.test.ts`, 83 lines. Check B1 is `git show e412e08:tests/kitchen/kitchen-stats.test.ts`, 193 lines. R1 did not change that file (`git diff e412e08 ddeb3ab` on it is empty).
- Each mutation produces the candidate the README describes. `swap` throws when its target text is absent, so no mutation can silently fail to apply. C0 and C1 are the files at `e412e08` and `ddeb3ab`.
- Both checks ran on the same candidate file with the same Node and vitest.

Findings:

1. **The agreement count depends on which mutation was picked inside each class.** C7 replaces one of several "missing" labels; A only asserts that the word "missing" appears somewhere on an empty root, so it passes. Replace all of them and A rejects while B accepts (S2 below). C6 deletes "Largest costs"; B1 protects three of the five headings, A protects five, so the disagreement exists for exactly two headings and C6 picked one of them. Neither choice is wrong, but "7 of 8" is a property of the eight cases and no more.
2. **B2 exercised only the empty-data path of the page.** The lab worktree has no `.kitchen/runs` (the page reports "0 run dirs"). In the checkout where R1 ran there were run records. No verdict in the table changes because of this, since B1 covers a fabricated-runs root, but B1 never looks for the word "usage", so in this tree nothing in B checks for usage text on a page that has run data.
3. **B2's verdict depends on repository data.** It rejects C0 because the heading always prints. It rejects a "show the section only when there is data" candidate (S3) only because four wave files (K4, K5, K8, K9) contain a `Usage:` line. A carries its own fixture for this; B2 borrows the repository's.
4. **B1 depends on the real repository being inside its limits.** Its last test requires the real page to exit 0. If `STATUS.md` passes 60 lines or the inbox passes ten entries, B1 fails for every candidate, right or wrong. It did not happen here (C1 passes 10 of 10), so no verdict is an artefact of it.
5. **"The same surrounding repository" is the lab HEAD, not R1's state.** The tree includes K6, merged after R1. Nothing observed depends on that difference.
6. **B2 does not look at the exit code.** An empty or crashing script passes B2. B rejects C2 only through B1. This matches the README's definition of B2 and is disclosed in the table.
7. **The cost comparison "83 lines against 0 lines + 1 command" compares judgements, not R1's cost.** `git diff --stat e412e08 ddeb3ab` is 827 insertions in 18 files for a 9-line change to the script. The check body exists three times: the 83-line test, and near-copies inside `owner-checks.ts` (+87) and `scaffolds.ts` (+86). The README's "about 320 lines" (87 + 86 + 90 + 57) is arithmetically right but leaves out the 60-line `driver.mjs`. Almost all of R1's preparation cost was delivering a check into a Box and the owner run. Check B was never delivered anywhere, so its "0 lines" is the cost of running a test in the owner's own tree. The Limits paragraph says this; the table header and the claim sentence ("most of R1's preparation cost bought nothing a reviewer could observe") do not. This experiment does not test that sentence.

## 3. Attacks on the conclusion

Ten further runs. S1 to S6 are wrong candidates chosen to split the two checks. R1 is a second correct solution. R2 and R3 are the accepted change in an altered environment. K0 is the accepted change as a control. Predictions were made from reading the two tests before running; all ten came true, so these are also development cases.

| Case | Right? | A custom | B cheap | What decided it |
|---|---|---|---|---|
| K0 accepted change, control | yes | accept | accept | |
| S1 "Verify runs" heading deleted | no | reject | **accept** | A lists five headings, B1 three |
| S2 every missing label printed as 0 or n/a | no | reject | **accept** | A requires "missing" on an empty root; B never reads the labels |
| S3 section kept, shown only when a wave records usage | no | reject | reject | A by fixture; B2 only because four real wave files record usage |
| S4 runs on no wave branch no longer listed | no | **accept** | reject | B1 asserts "not on a wave branch: 2 runs"; A does not |
| S5 stall guard counts a dirty PASS as a PASS | no | **accept** | reject | B1 tests `stallCheck` behaviour; A only checks it is a function |
| S6 inbox limit loosened from 10 to 100 | no | **accept** | reject | B1 trips all three limits; A trips one |
| R1 correct, written differently | yes | accept | accept | |
| R2 accepted change, temp directory named `lab-usage-tmp` | yes | **reject** | accept | the page prints its root path; A matches the word in it |
| R3 accepted change, a wave file named `lab-usage-probe` exists | yes | accept | **reject** | the page prints wave names; B2 matches the word in one |

What this shows:

- **The two checks are not near-equivalent. They overlap.** On the six wrong candidates here they agree once. A catches two that B misses and B catches three that A misses. Counting the lead's seven wrong candidates and these six together, each check rejects 7 of 13 and they are not the same seven.
- **A holds more that B lacks than the Result says.** The Result names the no-usage condition and the heading list. S2 adds a third: the missing-data label on an empty root, which the request names explicitly ("missing-data labels"). The populated-usage fixture is a fourth in principle, matched by B2 here only through repository data (S3).
- **B holds things A lacks.** Wave attribution of leftover runs, stall-guard behaviour and two of the three limits. The request asks to preserve these. So on this request the pre-existing test is the stronger "keep everything else" check, and A is a thinner restatement of part of it plus the conditions above. This strengthens the experiment's direction (the existing test was worth more than the new one) while contradicting its wording (that the rest of A restated what existed and B misses one case).
- **Both checks reject right work when the word "usage" appears in the surroundings.** A does so when the temp directory path contains it; B2 when any printed repository name contains it. The README said nothing was shown about rejecting right work. It is now shown for both, by the same defect the Result already identified: they test for a word.
- **A differently written correct solution is accepted by both** (R1). One case; nothing follows about rates.

Not run: a comparison of the page before and after the change with the section's lines removed (a characterisation or golden-output check). It is the obvious cheap baseline for a "remove this, keep the rest" request, costs no assertions about content, and on paper would reject C3, C6, C7, S1 and S2. It is untested here.

## 4. The framing

- **Plan before run: confirmed as far as Git can show.** `b899611` (10:27:38) adds the README down to the rule and `run.mjs`. `934510e` (10:32:58) adds only the Result section (24 lines added, none removed) and `results.json`; `run.mjs` is unchanged between them. Git shows the plan was committed before the results were; it cannot show when the run happened.
- **"Partly supports" is the right word under the rule written beforehand** (B right on C0, C1, C2 and misses a case A catches). The additional cases do not move it to "refutes": B still rejects no-change and empty and accepts the real change.
- **Arithmetic error.** "The custom check itself accepts three of the six wrong candidates": seven of the eight candidates are wrong. A accepts three of seven.
- **Unrecorded run.** "Two full passes, identical verdicts": the runner makes one pass and `results.json` holds one. The second pass is not in the record. This review's rerun is a recorded-by-diff second pass and it matched.
- **Overstated.** "It misses one case the custom check catches" and "The custom check catches that with one line": at least three conditions separate them (S1, S2, and S3's fixture), not one line.
- **Overstated.** "The rest restated the existing test": A's exit-code and helper-export tests restate B1; its empty-root test does not, and B1 contains much that A never states.
- **Stated correctly:** not a rate; one request; cases written by someone who knew both checks; not run in a Box.

## 5. Cost

Nothing paid. Both runners use local Git, Node v24.11.0 and the vitest already installed in this folder. No network call, model call or service. This review added one runner, one results file and this file; it created and removed two temporary test files, one temporary wave file and one temp directory. `git status` afterwards shows only the new sceptic files from this review.

## Standing

**Weaken to "suggests", and one sentence does not stand.**

- Stands: the observed table. It reproduces exactly.
- Stands: "partly supports" as the outcome word.
- Stands, and is strengthened: R1's custom test can be passed by wrong work, and the test the repository already had rejects wrong work the custom test accepts.
- Weaken to "suggests": that a cheap check judges R1 about as well as the custom check. On 13 wrong candidates each rejects seven, but different ones; agreement was 7 of 8 on the lead's cases and 2 of 7 on distinct candidate files chosen to split them (S1 to S6 and R1). Neither figure is a rate.
- Does not stand: "The rest restated the existing test", and "misses one case ... one line". The gap is at least the heading list, the missing-data label and the usage fixture.
- Not tested by this experiment: that most of R1's preparation cost bought nothing. That cost was delivery of a check into a Box, and check B was never delivered.

The reading the evidence supports: for this request neither check contains the other, the best cheap check is their union (the existing test, the no-usage condition, the heading list, the missing label), and both need the word test replaced by something that survives the word appearing in a path or a name.
