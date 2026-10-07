# Outside sample 1: Sceptic

7 October 2026. Examines `RESULT.md` (commit `f0ef32c`) against `PLAN.md` (commit `4c7ae9a`).

## Who

A fresh agent started inside Claude Code on a Windows 10 machine. The session says the model is Opus 5.5 (`claude-opus-5-5`). Both labellers report the same model in their notes. That limits this review in one specific way: where I re-read a text and reached the same label as the labellers, that is a third reading by the same kind of reader, not independent confirmation. The parts of this review that are independent of the model are the mechanical ones: the rerun of the scoring, the Git history, and the checks against GitHub (pull request diffs, file lists, commit dates, authors, closing pull requests).

One more limit. I was asked to decide my own labels before looking at the labellers'. I ran `score.mjs` first (step 1), and its output prints labels and notes for the `determined` column, and I read `labels-a.csv` to check the counts. So I had seen the labels before I read the issues. My readings below were made from the issue text and the diffs, but they were not blind.

Nothing was committed, installed or posted. GitHub was read with the host's `gh` only.

## 1. Reproduction

Reran `node lab/lines/request-to-check/map/sample-1/score.mjs labels-a.csv labels-b.csv`. Every figure in the agreement table, the source table, the `determined` table, the by-issue counts (18 or 19 of 37; open 7 or 8 of 18; fixed 11 of 19) and the by-repository counts (axios 10 of 13, click 4 of 19, both by labeller A's own outcomes) matches the output and the csv files. The percentages in the predictions table are correct (21/54 = 39%, 20/54 = 37%, 22/54 = 41%, 13/54 = 24%, 12/54 = 22%).

`PLAN.md` has one commit, `4c7ae9a` (09:32:54 +08:00), and `git diff 4c7ae9a -- PLAN.md` is empty. `GUIDE.md` and `fetch.mjs` were committed in the same commit and not changed since. `fetch-record.json` gives `fetchedAt` 01:32:54.986Z, the same second as the commit. The records are consistent with "commit, then fetch" and cannot show the order inside that second. The predictions were not edited after the fetch.

What does not match:

| Where in RESULT.md | It says | What the files say |
|---|---|---|
| Guards | "Ten conditions ask that something keep working" | 9 by labeller A, 8 by labeller B, 8 agreed (63 both-result minus 54 both-outcome is 9, one of them disputed). Ten is reached only by adding labeller B's two commander guards, which the plan says are never mixed into the sample's counts. |
| Departures | "four texts were cut at the stated lengths, including two test diffs (`axios-11192`, `axios-11262`) and one diff not shown at all" | Cut marks in the sample: `axios-11192` (test diff, 7,713 characters missing), `axios-11262` (a lock file, not a test), `click-3802` (test diff, 553 characters missing, one whole test), `click-3840` (a comment). The real test diffs that were cut are `axios-11192` and `click-3802`. `click-3802` is not named and was labelled from an incomplete diff. The known case `commander-2603` has four cuts, including 3,786 characters of its test diff, and is not mentioned. |
| Departures | Nothing about the split | `conditions.md` says "More conditions exist: 12 not listed" for `click-3786` and "2 not listed" for `click-3847`. The splitter dropped at least 14 conditions. "78 conditions" is a truncated count and the truncation is not reported. Labeller B flagged it. |
| Departures | "One fix (`click-3740`) was opened a minute before its issue was filed, so no request text predates it" | Pull request #3739 was opened then, but its only commit is by a maintainer and dated 2026-08-13, thirteen days after the issue. The tests that were merged were written after the issue text. The statement is wrong about the tests. |
| Predictions table, row 5 | "Higher than predicted on both" | The prediction for `source` was "at or above 0.6", so 0.95 held. The prediction for `determined` was a band, 0.4 to 0.6, and 1.00 is outside it. One held, one failed. |
| Predictions table, row 4 | "Mostly" | Two of three parts held. "No at least one in ten" failed (0 of 8). |
| What it supports, first bullet | "the third look that finds none (0 of 5 in zod ...; about one in ten in our own briefs ...)" | One in ten is not none. I did not check the two earlier looks. |
| Agreement table, last row | "20 cases, 100%, kappa 1.00" | For 10 of the 20 the issue file itself prints "None: the fix changed no file whose path looks like a test". Those rows are copied, not judged. Two more are lock files. The judged cases are 8, both labellers used two values on them, and they agreed on all 8. Kappa on 8 cases with two values is very weak evidence, and it is evidence about agreement only. |

## 2. Validity of `determined`

### The 8 sample issues labelled YES or PARTLY, and the 3 known cases

Full diffs fetched with `gh` for `axios-11192` (pull request 11194), `click-3802` (3818) and `commander-2603` (2609), whose diffs are cut in the files.

| id | Labellers | Mine | Evidence |
|---|---|---|---|
| axios-11131 | PARTLY | PARTLY, close to YES | The third test is the issue's own reproduction (`stackTraceLimit = 2`, caller name present). The "does not duplicate" tests follow from the issue's version table and suggested one-line fix. Only the exact stack strings are new. Issue and pull request are by the same author, 13 minutes apart. |
| axios-11192 | PARTLY | PARTLY, close to NO | The text offers two fixes. The first ("options the caller did not set should not be sent") fails the tests, which assert `capturedInit.redirect === 'follow'` and `capturedInit.mode === 'cors'`. The second ("at least `cache` should be left undefined") matches the restricted-runtime tests. The tests also keep the explicit default where the runtime accepts it, which the text calls pointless. |
| click-3740 | PARTLY | PARTLY | The text asks that writing a string not raise `TypeError`; one test asserts that, two assert ANSI stripping, which the text does not mention. See the clock finding below: the label stands, the stated reason for doubting the case does not. |
| click-3802 | PARTLY | PARTLY | Text: "handles the KeyboardInterrupt exception gracefully". Tests: exit code 1 kept, error exit code 3 kept, exit code 0 kept on success (in the cut part), interrupt propagates without standalone mode. |
| click-3822 | PARTLY | PARTLY | Text gives the `prompt` case with `pathlib.Path`. Tests add `str`, `bytes`, `convert`, direct calls, `click.Path[pathlib.Path]` at run time, and a method name `coerce_path_result`. |
| cobra-2222 | PARTLY | **NO** | The text is a design discussion ("it requires some design", "So, let's talk"). It floats "a struct, with Text and description" or documentation only. The tests call functions `Completion("banana")` and `CompletionWithDesc("orange", ...)` that return strings. Nothing written before the fix names a function helper or those names; an implementation that follows the text does not compile against the test. The guide's NO covers "something that differs from what the text ... suggests". Labeller B wrote "borders on NO". |
| cobra-2240 | YES | YES | One assertion: the context seen inside the help function equals the execution context. That is the title. No input is given in the text, so PARTLY is defensible. Issue and pull request are by the same author, 27 minutes apart. |
| cobra-2257 | YES | YES | The test is the issue's reproduction with `__completeNoDesc` in place of `__complete`. The fixer is a different person, eleven months later. This is the only YES in the sample where the text and the test are independent. |
| commander-2342 | YES | YES | The test is the issue's scenario reduced: configure output on a copy, original width unchanged. Different author. |
| commander-2603 | PARTLY | PARTLY under the guide; see clock finding | The renderer assertion comes from comments 7 and 8, which the file marks "AFTER the fix was opened". The renderer test was committed on 2026-09-12 at 16:46, after both comments (02:18 and 16:15 the same day). Read up to when the test was written, the issue thread does determine it. |
| commander-2614 | PARTLY | PARTLY, also meets NO | The text says "a non-ASCII letter" and suggests "a Unicode-aware letter/number check". The test input ends in U+0301, a combining mark, which is neither. A fix that does what the text suggests fails the test. The guide puts "a broader rule" under PARTLY and "differs from what the text suggests" under NO; this case is both. |

Corrected count for the sample, mine: NO-TEST 12, YES 2, PARTLY 5, NO 1. The labellers have PARTLY 6, NO 0.

Three findings about the column itself, which matter more than the one changed label:

1. **The clock is the pull request's opening time, and it is the wrong clock.** `fetch.mjs` marks each comment BEFORE or AFTER using `pr.createdAt`. Tests are often written or rewritten later. In `click-3740` the merged tests were written 13 days after the pull request was opened, by a maintainer. In `commander-2603` the renderer test was written after the issue comments that asked for it. In `axios-11192` a maintainer added commits eight days after opening. The effect is one-directional: text that shaped the tests is excluded as "after the fix", which pushes cases toward PARTLY.
2. **In half the cases the issue and the fix are not independent.** In 4 of the 8 sample fixes with tests, the issue's author also opened the pull request (`axios-11131`, `click-3740`, `cobra-2222`, `cobra-2240`), three of them within half an hour of filing. In the known cases, 2 of 3 (`commander-2603`, `commander-2614`). For those, "did the text determine the tests" measures how fully an author described a patch they already had. Cases where someone else wrote the tests from the issue: `axios-11192`, `click-3802`, `click-3822`, `cobra-2257`, plus the maintainer's rewrite in `click-3740`, and `commander-2342`. Among those six: YES 2, PARTLY 4.
3. **PARTLY is the guide's default and hides two opposite situations.** Any one extra assertion makes a request PARTLY (labeller A said so). `axios-11131`, where the central test is the reporter's own script, and `commander-2614`, where the text's suggested fix fails the test, carry the same label.

### The 12 labelled NO-TEST

Checked each pull request's file list and full diff on GitHub.

| id | Pull request | Files changed | Any test or assertion change? |
|---|---|---|---|
| axios-11260 | 11266 | `docs/package.json`, `docs/package-lock.json` | No |
| axios-11261 | 11267 | `package.json`, `package-lock.json`, `tests/smoke/bun/bun.lock` | No. The lock file is the only "test" path. |
| axios-11262 | 11272 | `tests/module/cjs/package.json`, its lock file | No |
| click-3766 | 3768 | `.github/workflows/nightly.yaml`, `docs/contributing.md` | No assertion. The change adds a nightly job that runs Flask's test suite, so the fix is itself a check, outside any test path. |
| click-3786 | 3787 | `CHANGES.md`, `pyproject.toml`, `uv.lock` | No |
| cobra-2298 | 2316 | `site/content/user_guide.md` | No |
| cobra-2323 | 2325 | `command.go` (one line, `var` to `const`) | No |
| serdejson-1123 | 1124 | `src/lib.rs`, two files removed under `src/features_check/` | No. No `#[cfg(test)]`, no `#[test]`, no doc example. |
| serdejson-1134 | 1135 | `src/map.rs`, `src/value/de.rs` (185 lines added) | No. Searched the diff for `cfg(test)`, `#[test]`, `assert`, doc examples: none. |
| serdejson-1164 | 1166 | `src/lib.rs`, `src/macros.rs` | No |
| serdejson-1214 | 1215 | `src/value/from.rs` (6 lines) | No. The new `impl` has no doc example. |
| serdejson-1225 | 1226 | `src/map.rs` (22 lines) | No. The new method has a one-line doc comment with no example. |

For the five serde-rs/json fixes I also listed every commit on the default branch in the three days after each merge: none touches `tests/`, and each merge is followed within minutes by a release commit. RESULT.md's worry that "that five may be overcounted" is settled: it is not. All 12 stand as NO-TEST.

What the 12 are is the finding. Seven are changes for which nobody would expect a test: three unused-dependency removals filed by one person within 16 minutes (`axios-11260`, `11261`, `11262`), a release task (`click-3786`, GitHub issue type "Task"), a documentation page (`cobra-2298`), a CI and documentation change (`click-3766`), and a `var` to `const` edit that the issue itself says has "no functional impact" (`cobra-2323`). The other five are all serde-rs/json, where the maintainer merges and releases without tests as a habit.

Split by whether the fix changes what the software does:

| | With tests | Without tests |
|---|---|---|
| Behaviour-changing fixes (13) | 8 | 5, all serde-rs/json |
| Not behaviour-changing (7) | 0 | 7 |

Outside serde-rs/json, 8 of 8 behaviour-changing fixes came with tests.

## 3. Validity of `source`

Rule, fixed before reading: take the 54 sample conditions both labellers call RESULT and OUTCOME, in `ids.txt` order, and pick positions `floor(i * 54 / 16)` for i = 0 to 15.

| id | A | B | Mine | Evidence |
|---|---|---|---|---|
| axios-11131.1 | REQUEST | REQUEST | REQUEST | Script and the wanted line `caller preserved: true` are both given. |
| axios-11261.1 | REQUEST | REQUEST | REQUEST | File and the entry to remove are named; the check is a search. Not a reproduction. |
| axios-11289.1 | REQUEST | REQUEST | REQUEST | Self-contained script with a local server and the exact expected array. |
| axios-11295.1 | REQUEST | REQUEST | REQUEST | Four lines and the expected object. |
| click-3406.1 | NEW | NEW | NEW | "Migrate sentinel values like at ..." gives no input or result; which values is open. |
| click-3652.2 | PERSON | PERSON | PERSON | "the exact implementation can be discussed". |
| click-3766.1 | PERSON | NEW | PERSON | The reporter offers two fixes and asks which. Maintainer comments before the fix say the removal was not deliberate but do not settle what to do. |
| click-3802.1 | NEW | NEW | NEW | A race with no reproduction ("run often enough"). |
| click-3847.2 | PERSON | PERSON | PERSON | "maybe typing thing?" |
| click-3847.5 | PERSON | PERSON | PERSON | "should be invisible to the public API" in a maintainer's comment, no form given. |
| cobra-2257.1 | REQUEST | REQUEST | REQUEST | Program, command line and expected output. |
| cobra-2481.3 | NEW | NEW | NEW | Needs PowerShell and a command that emits `:0` as a completion; neither is given. |
| cobra-2520.1 | NEW | NEW | NEW | Reproduction given, but the expected output shown is another program's; what to assert has to be decided. |
| serdejson-1134.2 | NEW | NEW | NEW | A trait implementation is asked for; no input or result. |
| serdejson-1225.2 | NEW | NEW | NEW | The text gives the implementation, not a call and result. The maintainer refused it before the fix. |
| serdejson-1323.1 | REQUEST | NEW | REQUEST | Type definitions and a complete `assert_eq!` are given. It needs the `url` crate, which the text does not name, and the reporter is asking whether this is a bug at all. |

My count on the 16: REQUEST 6, NEW 6, PERSON 4. I match labeller A on 16 of 16 and labeller B on 14 of 16; the two differences are the two where A and B differ from each other. Given that I am the same model, this adds little.

The hard test on the six REQUEST (could the check be written from the text alone with no design decision): four pass cleanly (`axios-11131.1`, `axios-11289.1`, `axios-11295.1`, `cobra-2257.1`). `axios-11261.1` passes as a search of a manifest, not as a run of anything. `serdejson-1323.1` passes only after adding an unnamed dependency, and it would encode a result the maintainers may never accept.

Outside the draw, read while doing the other steps, two REQUEST labels I would change:

| id | A and B | Mine | Evidence |
|---|---|---|---|
| click-3652.1 | REQUEST | PERSON | A maintainer disputes the form in comment 1; in comment 4 the requester writes "I agree what I proposed is non-standard. While the exact implementation can be discussed". The quoted output is no longer what is wanted. Both labellers chose REQUEST "by the cheaper rule". |
| click-3847.1 | REQUEST | NEW | "rename to _convert_type" under a title that says "public api deprecated". Whether the old name must disappear or stay with a warning is not stated; the one-line check needs that decision. |

With those two changes: labeller A becomes REQUEST 19, NEW 21, PERSON 14; labeller B becomes REQUEST 18, NEW 23, PERSON 13, of 54.

What REQUEST contains matters more than its total. Of labeller A's 21 REQUEST outcomes, 6 are literal edit requests with no input and no result to run (`axios-11260.1`, `11261.1`, `11262.1`, `click-3786.3`, `click-3847.1`, `cobra-2323.1`; labeller A lists them). One of those, `click-3786.3`, is a ticked box on a maintainer's release checklist. Taking out the six edits and the retracted `click-3652.1` leaves 14 outcomes that are a reporter's reproduction with a wanted result: 14 of 54, 26% (13 of 54 for labeller B). Two of those need an outside tool or network (`axios-11192.1`: wrangler and a live call to cloudflare.com; `serdejson-1123.1`: cargo-geiger). By issue: 12 of 37 (labeller A) or 11 of 37 (labeller B) have a reproduction-type REQUEST outcome, about 30%, not "about half".

A shared-input effect on agreement: both labellers read the same `conditions.md`, written by a third agent of the same model, and its paraphrases carry label hints (`serdejson-1330.1`: "makes no more specific request"; `click-3766.1`: "two fixes depending on intent"; `serdejson-1225.2`: the maintainer's refusal). Labeller A labelled most open issues from that file alone. Agreement of 0.95 is partly agreement with the splitter.

## 4. The split

Rule, fixed before reading: every fifth issue in `issue-ids.json` order, starting with the first. That gives `axios-11295`, `axios-11262`, `click-3847`, `click-3822`, `cobra-2520`, `cobra-2323`, `serdejson-1340`, `serdejson-1225`.

| Issue | Finding |
|---|---|
| axios-11295 | Faithful. Four conditions, all in the text. |
| axios-11262 | Faithful. |
| click-3847 | A maintainer's to-do list with "consider" and "maybe", plus a nine-comment discussion. Split as five requests, "2 not listed". Condition 2 states as settled ("is marked as private") what the text leaves as "maybe typing thing?". Conditions 4 and 5 come from another maintainer's comment. |
| click-3822 | Faithful. One condition, the central one. |
| cobra-2520 | Faithful. |
| cobra-2323 | Condition 1 faithful. Condition 2 turns the reporter's assurance ("has no functional impact on behavior") into a requested guard. |
| serdejson-1340 | Faithful, and it keeps the reporter's "I'm not sure if it's a bug". It is still counted as an outcome with a ready check. |
| serdejson-1225 | Faithful to the reporter's text. Two of the four conditions were refused by the maintainer before the fix and accepted as refused by the reporter; they are counted as two wanted outcomes. |

No invented condition and no missed central request in the eight. What the split does do:

- It turns assurances into guards. `axios-11260.2`, `axios-11261.2` and `cobra-2323.2` are the reporter saying the change is harmless. They are 3 of the 8 or 9 guards.
- It keeps refused and retracted items as outcomes (`serdejson-1225.2`, `.3`, `click-3652.1`).
- It splits a maintainer's process checklist as if it were a request (`click-3786`: 5 conditions kept, 12 dropped).

**Did the split manufacture requests, and is that why prediction 1 failed?** No. Reading all 40: one issue asks for nothing (`serdejson-1332`). Three more are reports or questions where the split supplied an implied outcome: `serdejson-1330` (a forwarded email, no request stated), `serdejson-1323` and `serdejson-1340` (both ask whether the behaviour is a bug). `cobra-2298` began as a question and became an agreed documentation request in the comments before the fix. Counting all the doubtful ones as no-request gives 4 of 40, 10%. Prediction 1 fails either way.

The real reason it failed is the sampling frame, not the split. Half the sample is "closed as completed with a merged pull request", which by construction asks for a change. Issues closed as not planned or as duplicates, where questions and support requests end up, are excluded by the queries. The prediction named "duplicates"; the frame cannot contain them. The fair denominator for prediction 1 is the 20 open issues: 1 to 4 of 20.

## 5. Framing: each bullet under "What it supports"

**Bullet 1: a check already in the repository and named by the requester is essentially never offered.**
The count is right: 0 of 54. Two attacks. First, it is close to true by construction for outcomes. An outcome is false today; a test that already exists and decides it would have to be failing or skipped. A named existing test is naturally a guard, and for guards the count is 0 of 8 or 9, of which three are the unbounded "no behaviour change" assurances. Second, the nearest thing to a named repository check in the sample ("verify or trigger nightly tests" with a link to `nightly.yaml`, in `click-3786`) is among the 12 conditions the splitter dropped. Zero of 54 clustered in 37 issues from four repositories puts the rate under roughly one in twelve, no tighter.
Standing: **stands as "suggests"**, with "essentially never" replaced by "none in 54", and with the note that the result is expected by definition for outcomes.

**Bullet 2: in a little over a third of outcome conditions, and about half of issues, the reporter's own text contains both an input and the wanted result.**
The arithmetic is right for the label REQUEST. The sentence is not right about what REQUEST contains. Six are literal edits with no input or result, one was retracted by its requester. Reporter's reproductions with a wanted result: 14 of 54 (26%) and 12 of 37 issues (32%) for labeller A; 13 and 11 for labeller B. Ten of labeller A's 21 are in axios, where three issues are one person's dependency chores and several reports follow a template with an "Expected" line; click has 4 of 19. Two of the REQUEST outcomes come from reporters who are not sure the behaviour is wrong, so a check copied from the text can be runnable and still be the wrong check.
Standing: **weaken**. Corrected: about a quarter of outcome conditions and about a third of issues carry a reproduction with the wanted result; a further six conditions are literal edits whose check is a search. "About half of issues" does not stand as a statement about reproductions.

**Bullet 3: more than half of merged fixes for real issues change no test; a replay benchmark from fixes with tests is drawn from the minority; an owner who expects the maintainers to have a test will usually be wrong.**
The count stands: 12 of 20, all verified on GitHub, the five Rust ones included. The reading does not.
- The sample is not a fair sample of fixes. It is the newest issues closed as completed that have a linked merged pull request. Newest-first favours issues that are closed quickly, and trivial ones close quickly: three of axios's five were filed by one person in 16 minutes and closed two days later. Fixes with no issue, and fixes committed without a linked pull request, are not in the frame at all. Three issues in the pools were skipped for having no merged closing pull request (`cobra-2498`, `cobra-2277`, `serdejson-1328`), as the plan says.
- "Real issues" overstates. Seven of the 12 are housekeeping, a release task, documentation or a no-op edit. No one expects a test for removing an unused dependency.
- The other five are one repository and one maintainer's habit. Five fixes from serde-rs/json are one observation about serde-rs/json, not five about fixes.
- For fixes that change behaviour: 8 of 13 have tests, and 8 of 8 outside serde-rs/json. An owner who expects a test for a behaviour change was right in three of the four repositories every time.
Standing: **does not stand** as worded. What stands: 12 of 20 changed no test, of which 7 change no behaviour and 5 are one repository. The replay-benchmark point reduces to: a benchmark built from fixes with tests leaves out housekeeping and leaves out projects that merge without tests. The sentence about the owner should be removed.

**Bullet 4: when a fix comes with tests, those tests usually assert more than the issue said: 6 of 8, and 2 of 3 known; not one was labelled as contradicting the issue.**
"6 of 8 are not YES" survives my reading (5 PARTLY and 1 NO). The rest is weaker than it reads.
- PARTLY is triggered by any single extra assertion. In `axios-11131` the main test is the reporter's script.
- The clock biases toward PARTLY (finding 1 in section 2). With test commit time as the clock, `commander-2603` moves toward YES, and "2 of 3 in the known cases" becomes 1 of 3 or 2 of 3 depending on a worker-thread case I could not settle because the comment that would decide it is cut in the file.
- Four of the eight are an author describing their own patch.
- Eight cases, three repositories (serde-rs/json contributes none), one day.
- "Not one was labelled as contradicting the issue" is true of the labels and misleading about the cases. In `cobra-2222` the tests use an interface the text did not propose. In `axios-11192` the first of the two fixes the text asks for fails the tests. In `commander-2614` the fix the text suggests fails the test. That is three of eleven where a solver who followed the issue could fail the maintainers' test, which is the thing R3c needs to know and which PARTLY conceals. RESULT.md does say PARTLY is not failure; it should also say that PARTLY is not safety.
Standing: **weaken**. Corrected: in 6 of 8 the tests contain at least one assertion the issue text does not give (5 PARTLY, 1 NO by my reading). In at least 2 of 8, and 1 of 3 known cases, a fix that the issue text itself suggests would fail the tests, read from the diffs and not run.

**"Does not show".**
Stands. Add to it: the kappa of 1.00 on `determined` rests on 8 judged cases, and the kappa of 0.95 on `source` is between two readers who were both handed a third same-model agent's paraphrase.

## 6. Selection

`fetch.mjs` implements the plan's rule: four repositories, `is:issue is:open` and `is:issue is:closed reason:completed linked:pr`, newest created first, a pool of 15, keeping issues with a merged closing pull request. `fetch-record.json` shows the pools and the three skips, and I confirmed on GitHub that each skipped issue's only closing pull request is unmerged. No shortfall. None of the 43 items is a pull request.

Differences between script and plan, none of which changes a count here:

- The test-path pattern also matches `.spec.` and file names starting `test_`, which the plan does not list. No file in the 20 fixes is matched only by those.
- The closing pull requests are read with `first: 5` and the first merged one is taken. `click-3740` has two merged closing pull requests (#3739 and #3764); only the first was used, and #3764 also changes `tests/test_termui.py`. `click-3822` and `click-3802` each have exactly five linked pull requests with the merged one last; a sixth would have been missed.
- The plan says comments are kept "with its author's role and time"; the BEFORE or AFTER mark by pull request opening time is the script's addition and is the clock problem above.

Items that are something other than a user's request, and what they distort:

| Issue | What it is | Effect |
|---|---|---|
| click-3786 | A maintainer's release checklist, issue type "Task", all boxes ticked when fetched | One of the 12 NO-TEST; one of the 11 fixed issues "with a REQUEST outcome"; two outcomes in the 54 |
| click-3847, click-3696, click-3406 | A maintainer's own to-do notes | 9 of click's 19 outcomes, mostly PERSON |
| axios-11260, 11261, 11262 | One contributor's three dependency-removal chores, 16 minutes apart | 3 of 12 NO-TEST, 3 of 21 REQUEST, 3 of the guards |
| serdejson-1330 | A security email forwarded by the maintainer | One PERSON outcome with no request in it |

## 7. Cost

Nothing paid. The scripts call only the public GitHub API through the host's `gh` and read local files. The splitter and labellers are agents of the session's own model. My own calls were read-only `gh api` requests for pull request files, diffs, commits and issue links.

## Standing

| Bullet | Standing | Corrected statement |
|---|---|---|
| 1. No check named in the repository | Stands as "suggests" | None in 54 outcomes and none in 8 or 9 guards; expected by definition for outcomes. |
| 2. Reporter's text contains the check | Weaken | Reproduction with wanted result: 13 or 14 of 54 conditions (about a quarter), 11 or 12 of 37 issues (about a third). Six more are literal edits. |
| 3. More than half of fixes change no test | Does not stand as worded | 12 of 20 verified; 7 change no behaviour, 5 are serde-rs/json. Behaviour-changing fixes: 8 of 13 with tests, 8 of 8 outside serde-rs/json. Not a fair sample of fixes. |
| 4. Tests assert more than the issue said | Weaken | 6 of 8 not fully determined (5 PARTLY, 1 NO). In 2 of 8, and 1 of 3 known, a fix the text suggests would fail the tests. Biased toward PARTLY by the clock and by the guide's definition; half the cases are self-described patches. |
| Does not show | Stands | Add the limits on both kappas. |

For the instrument, before a second sample: use the test's commit time, not the pull request's opening time; record whether the issue's author wrote the fix; define a test by assertions, not by path; never drop conditions; label literal edits apart from reproductions; and sample fixes from merged pull requests, not from issues.
