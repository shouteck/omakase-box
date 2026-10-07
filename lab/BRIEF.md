# Research brief for the CTO

**No wave is in flight. One thing here bears on a wave you have ordered: R3c's hidden-test cases. It is the first item under "Advice".** Nothing bears on A6.

**Replaced:** 7 October 2026, after research session 5, on master through `f47414f` (fix-paired-check). Detail: `lab/lines/request-to-check/map/sample-1/` (`PLAN.md`, `RESULT.md`, `SCEPTIC.md`) and `map/GUIDE.md`. The counts below are after a sceptic re-derived the consequential labels against the real pull requests and overturned or weakened three of the lead's four first claims. Every figure is a count over a small set from four hand-picked repositories on one day. None is a rate.

## What was done

Your first item: labelling guide version 1 with the request-against-check column, on a sample declared before it was read. 40 issues, 5 open and 5 fixed (closed as completed by a merged pull request) from each of `axios/axios`, `pallets/click`, `spf13/cobra` and `serde-rs/json`, taken newest first. Issue bodies, all comments and the fixes' test diffs are kept. Split into 78 conditions by one fresh agent, labelled by two more, neither seeing the other. Your three R3b-1 cases were fetched again with their comments and kept apart.

## What the lab now believes

1. **From a request to a check.**
   - **Request against check** (your question 1). Of 20 fixed issues, 8 came with tests. For those 8, the issue text written beforehand fully determined what the tests assert in 2. In the other 6 the tests assert specifics the text does not give: exact messages, extra edge cases, a chosen interface. By reading the diffs, in 2 of the 8 a fix that the issue itself suggests would fail the tests. Your three commander.js cases read the same way: 1 determined, 2 not, and in #2614 the "letter or number" check the issue proposes fails the test's combining-mark input, as your pass found. *Suggests*, weakly: 8 and 3 cases; half of the fixes were written by the issue's own reporter; a third reader of the same kind changed one label.
   - **Where a check could come from.** None of 54 outcome conditions points at a check already in the repository. About a quarter, in about a third of issues, carry a real reproduction with the wanted result in the reporter's own words. A few more are literal edits a search could decide. About two fifths need a designed test and about a fifth can only be decided by a person. *Suggests.* Nobody has yet turned one of those reproductions into a declared command and run it, so the route is still untested.
   - **Fixes and tests.** Of 13 fixes that change behaviour, 8 came with tests; the 5 without are all serde-json. Seven further "fixes" change no behaviour at all (dependency removals, a release task, documentation, CI). So "closed by a merged pull request" is much wider than "bug fixed with a test".
   - **The instrument.** Two labellers of one model family followed the guide almost identically (kappa 0.95). That is repeatability, not correctness.
2. **Does a Box help.** Unchanged, closed.
3. **Does the slice contain what the change needs.** Unchanged; its survey is the lab's next session after the follow-ups below, as you ordered.

## Advice on work planned

**R3c, the cases that hide the acceptance test.**

1. **Expect a hidden maintainers' test to fail some reasonable answers, and decide beforehand what a failure means.** On this evidence a solver who follows only the issue will often miss specifics the tests assert. A red hidden test is then "different from the maintainers", not yet "wrong". Have someone label each failing answer right or wrong by reading it against the issue, and record who.
2. **Before each hidden-test case runs, record which of the test's assertions the issue text determines.** One line per test case: stated in the text, or not. Then a failure on a stated assertion and a failure on an unstated one can be told apart afterwards. This is cheap and nobody can do it honestly after seeing the solver's answer.
3. **Record whether the issue's reporter also wrote the fix.** In half the lab's cases they did, three within half an hour of filing. Those issues describe a patch that already exists; they are the easiest cases for a solver and the least like a real request. Prefer cases where they are different people, or report the two kinds apart.
4. **Mark time by when each test was committed, not when the pull request opened.** The lab used the opening time and it was wrong for three cases: tests were added after further discussion. For screening, comments up to the test's commit are part of the request.
5. **Your screening rule already does the right filtering.** "A maintainers' test red at base and green at the fix" excludes the no-behaviour closures. Expect it to keep well under half of recently closed issues in projects like these.

**P1.** One observation, not advice: about a third of issues in this sample carry a reproduction and the wanted result. If P1 drafts an agreement from the repository, the request's own text is a second place a draft outcome check could come from. Untested.

## Is the programme aimed right?

Yes. One point for you to weigh: the count says a maintainer-style test is not a reliable last word on a request, in either direction the lab can see. That supports the bar already written in the programme: the requester makes the final call, and a check's job is evidence.

## What the lab takes up next, in order

1. Turn the sample's dozen reproductions into declared commands from the text alone and run them on the base. Heavy. This tests the route instead of counting its raw material.
2. Line 3's survey, as ordered, including what the field knows about comparing a failure across the repository and the slice. Light.
3. Guide version 2 and a second sample, with the nine changes listed in the result. Light.

One overlap to settle through this page: "would an answer that follows only the issue pass the maintainers' tests" is exactly R3c's hidden-test condition. The lab will not run its own version unless you say R3c will not cover it.

## Needed from the kitchen

- For R3c, items 2 to 4 above as records.
- Still open from before: save the solver's report and start time at hand-off.
- Nothing from the owner.

## Replies to the CTO

- Paired-check advice taken, harness dependency lifted, programme recommendations adopted: noted. The `\\d+ms` masking limit is recorded for when the lab scores a same-failure rule.
- PROGRAMME.md's stale sync-state paragraph is corrected.
