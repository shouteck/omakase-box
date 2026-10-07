# Labeller B notes, sample 1, guide version 1

Who: an agent started inside Claude Code on a Windows 10 machine. The session tells me the model is "Opus 5.5" (id `claude-opus-5-5`). I cannot verify that myself and know nothing else about the host.

What I read: `GUIDE.md`, `sample-1/conditions.md`, `sample-1/ids.txt`, and all 43 files in `sample-1/issues/` (long lines cut at a few hundred characters on screen, so the tail of some very long paragraphs was not seen; the files themselves also contain "[cut here]" marks in test diffs and comments). I opened nothing else. I ran no code from the issues and used no network.

Output: `labels-b.csv`, checked by script against `ids.txt` (same ids, same order, allowed values only, a note on every PARTLY).

## Hardest conditions

- **axios-11260.2, axios-11261.2, cobra-2323.2** ("no effect on the public API or runtime behaviour"). Everyone knows this means "the existing tests still pass", but the text names no test, suite or command, so `REPO` is not allowed. What is left is `NEW` (nobody will design a test for "nothing changed") or `PERSON`. I took `NEW` by the tie rule. Neither label is true to what would happen in practice.
- **axios-11261.T and axios-11262.T**. The fix touched files whose path contains `tests/`, but they are a lock file and a package manifest. There are no assertions. `NO-TEST` is literally false ("the fix changed no test files"), and YES, PARTLY and NO are meaningless. I used `NO-TEST` and said so. For axios-11262 the "test files" are the very files the request asks to edit, so YES is also arguable.
- **click-3740.T**. The fix was opened one minute before the issue was filed. The question "reading only the text written before the fix" has an empty text. I treated the body as the request and answered PARTLY.
- **click-3766.1**. One condition, two different fixes named by the requester: delete a line from the docs (RECORD) or restore a CI workflow (RESULT, or arguably PROCESS). The maintainers chose the second. `about` cannot hold both. I labelled it RESULT.
- **click-3652.1**. The body gives an exact expected help screen (REQUEST by the letter). In comment 4 the same requester says the exact form is negotiable, and a maintainer has already said it is the wrong signal. The condition is labelled as if it were a firm, copyable check. It is not.
- **serdejson-1225.2 and .3**. A maintainer declined both before the fix was opened. I still had to give them a source, role and observable as if they were live requests.
- **axios-11292.3 and axios-11295.4** (role). Both are worded as guards ("should neither replace nor delay", "while preserving") but they constrain behaviour on a code path that does not exist or throws today. "True today and must stay true" does not apply cleanly. I gave one GUARD and one OUTCOME and I am not confident the two are consistent.
- **axios-11292.4**. The split joins "adds no overhead" (not checkable from outside, a reading judgement) with "keeps custom responses without a cancellable body working" (a designable test). One label cannot describe both.
- **click-3840.1**. A three line script and an unmistakable wanted result, so REQUEST by the letter. But the failure happens "about half the times", another person could not reproduce it, and the script opens Notepad and waits. One run of the copied script decides nothing. I labelled it NEW.
- **axios-11285.1, cobra-2491.1, click-3847.5** (NEW or PERSON). The behaviour is clear but the public name or interface is explicitly left to the maintainers. A stranger can only write the check after making the decision the text reserves for someone else. I chose PERSON, against the tie rule, because I judged NEW did not really fit. Another labeller following the tie rule will say NEW.
- **commander-2614.T**. The test input ends in a combining accent mark, not a letter, and uses optional brackets. The issue asks for "a non-ASCII letter" and suggests a "letter/number check", which a mark would fail. Easy to wave through as YES. I said PARTLY.
- **cobra-2222.T**. The text suggests a struct with validation. The fix ships two functions. "A chosen interface" is listed under PARTLY, "differs from what the text suggests" under NO. Both describe this case.

## Where the guide is ambiguous, contradictory or forces a misleading label

1. **The tie rule decides too much.** "If two values seem to fit, take the cheaper one" is applied most often at the NEW/PERSON border, where nearly every feature request sits. It pushes unsettled requests into NEW and so overstates how much work a designed test could cover. It also has odd effects in `about` (RESULT wins over PROCESS and NONE just by being first in the table) and in `determined` (YES wins over PARTLY). The guide does not say whether the tie rule applies to those columns at all; "the one earlier in its table" suggests yes, "cheaper" only makes sense for `source`.
2. **`REPO` is nearly unreachable for guards.** The commonest guard in real issues is "do not break anything". It can only be REPO if the requester happens to name a test. So the guard that is cheapest in real life is recorded as NEW or PERSON.
3. **`about` has no place for repository housekeeping and CI.** Dependency removals, lock files, version strings, release tags, CI workflows and added tests are not "what the software does", not a written record, and not really "how or by whom". I put manifests and version strings under RESULT and tagging and publishing under PROCESS. That line is mine, not the guide's.
4. **RECORD loses information.** cobra-2505.1 is a documentation fix with an exact expected snippet that must compile: fully checkable, and cheaply. Because it is RECORD it gets no source. cobra-2222.2 (Go examples) is documentation that the test runner executes. The purpose of the map is "where could a check come from", and RECORD conditions are simply dropped from that count.
5. **`observable` is unclear for files in the repository.** "In a file" counts as observable, "only by reading the source" does not. A `package.json`, a `pyproject.toml` version, a workflow file, a `const` declaration: file or source? I said y for manifests and config and n for program source. Type annotations are a second gap: they are only visible by running a type checker, which I counted as a command line (y).
6. **`source` and `observable` can contradict.** cobra-2323.1 is REQUEST (the exact old and new line are given, a text search decides it) and observable n. The guide does not say whether a search of the source counts as a check.
7. **REQUEST ignores how costly the environment is.** axios-11192.1 needs a Cloudflare Workers runtime and a live call to an outside site. commander-2603.1 needs Electron. Both are REQUEST because the tools are named. "A copy of what they already wrote" is true but the check is far from cheap to run, and flaky ones (click-3840.1) are not covered at all.
8. **The set-up rule is vague on "versions the text does not name" and "tools".** Many good reproductions name no version because none is needed. Read literally the rule makes them NEW. I read it as "needs a specific version". For serdejson-1323.1 one type comes from a crate the text never names. I applied the rule (NEW), which feels harsh for a report that includes its own assertion.
9. **No label for a condition that the thread itself withdrew, rejected or left as a question.** See click-3652.1, serdejson-1225.2 and .3, click-3847.3, serdejson-1340.1 ("not sure if it's a bug"). Labelling "what the text says" does not help when the text says two things at different times.
10. **Column 5 has several holes.**
    - "Test file" is decided by path. Lock files and manifests under `tests/` count. See above.
    - PARTLY covers "a chosen interface" and "a broader or narrower rule". NO covers "differs from what the text suggests". These overlap.
    - It is one answer per request, but a fix often has one test that mirrors the reproduction and several that go beyond it (axios-11131, click-3822, click-3802). PARTLY then hides that the core assertion was fully determined.
    - Diffs are cut ("[cut here: 7713 more characters]", "[not shown: length budget used up]"). I judged from what was shown.
    - A fix opened before the issue (click-3740) leaves no "before" text.
    - The issue body is never marked before or after. It is before in all cases but that one.
    - Whether a fix that does only part of the request (serdejson-1225, cobra-2222) changes the answer is not said.
11. **Role is defined by "true today", which the labeller often cannot know from the text**, and which fails for conditions on behaviour that only exists after the change.
12. **Splits I would question.** axios-11292.4 and click-3786.5 each join two things of different kinds. click-3786 lists five conditions and says twelve more exist but are not listed; the listed ones mix RECORD, RESULT and PROCESS, so the request as a whole is badly represented. click-3766.1 holds two alternative fixes in one line.

## Suggested changes

1. Restrict the tie rule to `source`, and add a hard test for the NEW/PERSON border: "If the check cannot be written until someone picks a public name, an interface or one of several named behaviours, and the text leaves that pick open, it is PERSON." Give `about` and `determined` their own tie rules or none.
2. Add a source value for the general guard, for example `SUITE`: "the condition is that existing behaviour is unchanged and no specific behaviour is named; the project's existing tests are the only realistic check". Keep REPO for a named test.
3. Add an `about` value such as `REPO-STATE` (dependencies, manifests, versions, CI, tags, tests) or state plainly which of the existing four each of those goes in.
4. Let RECORD conditions carry source and observable too, or add a flag "checkable record" so documentation with an exact expected content is not lost.
5. Define `observable` by example: list manifests, config, workflow files, type annotations and private names, each with y or n. Say whether a text search of the source is a check.
6. Add a column or a note code for "needs special environment" (other OS, GUI, outside network, a named third party runtime) and for "intermittent". Say that an intermittent failure is NEW.
7. Rewrite the set-up rule: "NEW if the reproduction cannot be run as written because a dependency, tool or required version is not named or cannot be read off the code, or because more than about ten lines of set-up are missing."
8. Add a `status` column or fixed note words: `declined`, `withdrawn`, `question`, `alternative`. Then the labels describe the request and the status says whether anyone still wants it.
9. For column 5:
   - define a test file as one that contains assertions, and add a value `NO-ASSERT` for "files under a test path changed but none hold assertions";
   - answer per condition where possible, or add a second field "core assertion determined: y/n" beside the overall answer;
   - move "a chosen interface that differs from the one the text suggests" to one side explicitly (I would put it under NO);
   - say what to do when the diff is cut and when the fix predates the issue (I suggest a value `UNKNOWN` for both);
   - mark the body as before or after like the comments.
10. Define role by the wording and intent, not by today's truth: "OUTCOME if it describes the change asked for; GUARD if it limits how the change may be made, including limits on the new code itself."
11. Fix the splitter rather than the labeller: one kind of thing per condition, alternatives as separate lines marked as alternatives, and never "N more not listed".
