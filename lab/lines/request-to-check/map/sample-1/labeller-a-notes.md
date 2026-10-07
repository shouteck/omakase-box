# Labeller A notes, sample 1

Host and model: Claude Code agent on a Windows machine. The session tells me the model is Opus 5.5 (id `claude-opus-5-5`). I know nothing else about the host.

What I read: `GUIDE.md`, `sample-1/conditions.md`, `sample-1/ids.txt`, and issue files. I read all 22 issue files that have a `.T` id in full as they are given (several test diffs are cut in the file itself), plus click-3652, click-3847, cobra-2481, cobra-2520 in full and the first parts of click-3840 and serdejson-1323. For the other open issues I labelled from `conditions.md` alone. I did not open any forbidden file.

Output: `labels-a.csv`, 108 lines (header plus 107 ids). A script confirmed the ids match `ids.txt` in order and every column holds an allowed value.

## Hardest conditions

1. **axios-11261.T and axios-11262.T.** The issue files count a lockfile and a package manifest as "test changes" because they live under `tests/`. They assert nothing. The guide says `NO-TEST` only when "the fix changed no test files", which read literally is false here. I used `NO-TEST` anyway because the question is about what tests assert, and said so in the notes. `YES` is defensible for 11262 (the edit is exactly what the text asks). This is a guide gap, not a judgement call I am confident in.

2. **Literal edit requests** (axios-11260.1, 11261.1, 11262.1, 11262.2, cobra-2323.1, click-3786.3, click-3847.1). "Remove X from file Y", "change var to const", "rename a to _a". The text has no code or command, so `REQUEST` does not fit by its wording, but turning it into a grep needs no design decision, so `NEW` overstates the cost. I used `REQUEST`. Whoever reads the counts should know these seven are not reproductions.

3. **Unbounded guards** (axios-11260.2, 11261.2, cobra-2323.2: "no effect on public API or runtime behaviour"). No check is named. The honest check is "the existing suite still passes", which is `REPO` in spirit but the text does not point at it. I used `NEW` by the cheaper rule. `PERSON` is just as defensible. These labels are close to noise.

4. **click-3766.1.** The requester offers two different fixes and asks which. One is a docs edit (`RECORD`), the other restores a CI workflow. The fix did both. I followed the tie rule to `RESULT` and then `PERSON`. A condition that is itself a fork does not fit one row.

5. **axios-11292.3 and .4.** These constrain code that does not exist yet ("the cleanup must not delay the error"). `OUTCOME` says false today, `GUARD` says true today. They are vacuously true today, so I used `GUARD`, but they really are part of the new behaviour. 11292.4 also packs two things in one line: "no added overhead" (not checkable from outside, `PERSON`, `n`) and "preserves custom responses" (`NEW`, `y`).

6. **cobra-2240.T.** The text has no code at all, yet the one assertion in the fix's test is what anyone would write from the text. `YES` requires that inputs "are stated in the text"; `PARTLY` lists kinds of extra specifics, none of which apply. I chose `YES`.

7. **click-3840.1 and click-3802.1.** Intermittent failures. click-3840 has a two line reproduction and an unmistakable wanted result, but one run decides nothing. I used `NEW` because the number of runs or a way to force the failure is a design decision. The guide does not mention flakiness.

8. **commander-2342.1 and cobra-2520.1.** Full reproduction, but the wanted result is given in prose ("uses 70 for the help width") or as output from a different program. Someone still has to decide what to assert. I used `NEW`. Another careful labeller could say `REQUEST`.

9. **click-3786.4.** "Tag and publish the release." None of the four `about` values fits an action in the outside world whose result is observable. I used `RESULT` with `NEW`.

10. **click-3696.3 and .4.** "The typing need checking", "the test coverage is incomplete". Not behaviour, not a record, arguably process. Tie rule gave `RESULT`, then `PERSON` since no target is stated.

## Where the guide is ambiguous, contradictory or misleading

- **`NO-TEST` is defined by file paths, the question by assertions.** See item 1. The upstream path heuristic ("path looks like a test") makes it worse.
- **`REQUEST` requires "code, a command line, a file, a call" in the text.** Literal edit requests have none of these in the sense meant, yet are the cheapest checks in the whole sample. See item 2.
- **The tie rule ("take the cheaper one, the one earlier in its table") is only meaningful for `source`.** For `about` the table is not ordered by cost, so the rule pushes every doubtful case to `RESULT`, which then forces source, role and observable labels on things like "consider deprecating" or "typing needs checking". For `role`, `observable` and `determined` it is unclear whether the rule applies at all. I applied it to `about` literally and did not apply it to `determined`.
- **`observable`: "in a file" is not defined.** A package manifest, a lockfile, a CI workflow and an unexported Go constant are all files, and all are source. I put `n` for dev manifests and unexported names, `y` for a package version (visible in metadata) and for a Python rename (visible by import). I expect low agreement on this column for such rows.
- **`RECORD` gets no further columns**, but some record conditions are mechanically checkable (cobra-2505.1: a tutorial snippet should compile and the wanted text is quoted). The map loses that.
- **`PERSON` mixes two different things**: "no mechanical check is possible" and "what is wanted is not settled". axios-11291.1, cobra-2507.2 and cobra-2491.1 have complete inputs and would be `REQUEST` the moment someone picks one of the named options. axios-11292.4 is the other kind. Counting them together hides which requests need one decision and which can never be checked.
- **`role` has no value for "unknown" or "constraint on the new code".** axios-11289.2 does not say what happens today; I assumed `OUTCOME`.
- **Set-up rule versus heavy tools.** axios-11192.1 needs wrangler and a live URL, commander-2603.1 needs Electron. Tools and versions are named so the rule says `REQUEST`, but "a copy of what they already wrote" is far from a runnable check there.
- **Rejected or disputed conditions.** serdejson-1225.2 and .3 were refused by the maintainer before the fix; click-3652.1 was disputed and the requester backed off. The guide says label what the text says, so they count as wanted outcomes. That inflates the map with things nobody will build.
- **`determined` is one value per request.** Fix tests usually have one core assertion the text does determine and several extras it does not (axios-11131, click-3822, commander-2603). Any extra makes the whole request `PARTLY`, so `PARTLY` will swallow most of the column and say little.
- **"Before the fix was opened" assumes the issue came first.** click-3740 was filed one minute after its pull request. The body is then not independent of the fix.
- **Cut diffs.** commander-2603, axios-11192 and click-3802 have truncated test diffs in the file. I labelled on what is shown.
- **`NO` barely differs from `PARTLY`** when the tests pick a different interface than the one the text floats (cobra-2222: struct suggested, functions tested). "A chosen interface" is listed under `PARTLY`, "differs from what the text suggests" under `NO`.

## Suggested changes

1. Define `NO-TEST` as "the fix changed no file that contains assertions" and fix the upstream detection so manifests, lockfiles and fixtures under `tests/` are not counted.
2. Add a source value for literal edits, for example `EDIT`: "the text names the file or identifier and the exact change; the check is a search". Or say outright that these are `REQUEST`.
3. Say that the tie rule applies to `source` only. For `about`, give an explicit order of preference or a short decision list (docs page: `RECORD`; tests, types, CI config, release actions: say which).
4. Split `PERSON` into `CHOICE` (inputs are there, the text offers alternatives or leaves the wanted result open) and `JUDGE` (no mechanical check possible).
5. Define `observable` for repository files: say whether manifests, CI config and private names count as outside the code. One sentence with three examples would do.
6. Allow `source` on `RECORD` rows, or add a flag for records that are mechanically checkable.
7. Add a role value such as `LIMIT` for constraints on the new behaviour, and say what to do when the text does not say whether the condition holds today.
8. Add a rule for unbounded guards ("no behaviour change"): either always `REPO` when the repository obviously has a suite, or a dedicated value.
9. Add a rule for intermittent failures.
10. For `determined`, either label per test case group or add a second column: is the core assertion determined, yes or no, separate from whether extras exist.
11. Add a flag column for conditions the maintainers rejected or the requester withdrew before the fix.
12. State what to do when the issue was filed after the fix was opened and when the diff shown is cut.
