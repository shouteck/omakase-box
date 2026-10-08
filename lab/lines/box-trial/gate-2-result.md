# Gate 2: what real agents read before reaching the fix, against the Box

8 October 2026. Published run records of two agents on Gate 1's thirty tasks; scripts only; the lab ran no agent. [Plan fixed and pushed before any sample record was read](gate-2-plan.md) (commit `4f98f3f`); [instrument](gate-2/README.md); [sceptic](gate-2-sceptic.md). This gate reports; it has no pass mark. **This is the version after the sceptic**, who reproduced every number, classified records by hand, and changed the conclusion.

**Agents.** mini-SWE-agent (one tool: a shell; one attempt) with Gemini 3.5 Flash (submission of 1 September 2026, 26 of the 30 tasks present) and with GPT 5.2 Codex (19 February 2026, all 30). Chosen by the plan's rule. They were given the issue text and not the failing test.

**The sentence.** These agents find the place quickly and then read widely before changing it: they first opened the function that needed fixing after a median of 2 and 4 steps of about 35, having read little; between that moment and their first edit they took a median of 18 and 10 more steps and read 220 and 438 other functions, two thirds to three quarters of them outside the Box, in a stretch holding about two fifths of all the text they read.

So there is little *locating* to save, and a Box that only says where to start has almost nothing to offer these agents. Whether the wide reading after locating is waste a Box could prune, or understanding the agent needed, this gate cannot say.

## Before the fix is found (the plan's measurement)

| | gemini-3-5-flash | gpt-5-2-codex |
|---|---|---|
| Records found, of 30 | 26 | 30 |
| Task resolved | 24 of 26 | 23 of 30 |
| Run reached the fix (search hit, view or edit) | 26 of 26 | 29 of 30 |
| Steps in a run, median | 36.5 | 34.5 |
| Steps before reaching, median | 1 | 4 |
| Share of the run before reaching: steps / output text / input tokens, medians | 3% / 1% / 0% | 11% / 6% / 2% |
| Searches before reaching, median | 1 | 1 |
| Production functions read before reaching, other than the fix: all tasks together | 5 | 107 |
| ... of which outside the narrow Box | 5 | 92 |
| ... tasks where any such function was read | 1 | 7 |
| Production files viewed or hit before reaching: all tasks together | 32 | 79 |
| ... outside the Box / outside the rival file filter | 22 / 18 | 46 / 19 |
| **Stricter: reached only by viewing or editing the fix** (not in the plan) | 26 of 26 | 29 of 30 |
| ... steps before, median | 2 | 4 |
| ... share of the run before: steps / output text / input tokens, medians | 7% / 5% / 1% | 15% / 10% / 2% |
| ... largest share of steps before, any task | 61% | 51% |
| ... functions read before, other than the fix; outside the Box | 37; 35, on 5 tasks | 144; 119, on 9 tasks |
| ... production files before; outside the Box / outside the rival filter | 72; 36 / 22 | 101; 51 / 23 |
| Own patch changes a production file with no Box function | 2 tasks | 2 tasks |
| Steps the classifier could only call "other" | 17% | 15% |

## After the fix is found (the sceptic's measurement, outside the plan)

Computed by the sceptic from the same records; its scripts are described in [its review](gate-2-sceptic.md) and are not part of the committed instrument.

| | gemini-3-5-flash | gpt-5-2-codex |
|---|---|---|
| Steps between first opening the fix and first editing its file, median | 18 | 10.5 |
| Other production functions read in that stretch, all tasks; outside the Box | 220; 144 (65%) | 438; 342 (78%) |
| Share of the run's output text in that stretch, median | 46% | about 39% |
| First edit of the fix's file comes at this share of steps, median | 66% | 57% |
| Whole run: other production functions viewed; outside the Box | 307; 214 (70%) | 805; 587 (73%) |
| Whole run: output text from views and searches / from running things / other | 51% / 39% / 9% | 49% / 32% / 17% |
| Before-the-fix shares as means, not medians: steps / output text | 12% / 14% | 20% / 20% |
| Runs with more than a quarter of their steps before the fix | 3 of 26 | 6 of 29 |
| Reading done before the fix, counted as what it costs when re-sent on every later call: share of all input, median / mean | 7% / 15% | 14% / 19% |
| The fix's file named before anything had shown it | 0 of 26 | 7 or 8 of 30 |

## What was predicted and what happened

1. *Both agents reach the fix on at least 25 of 30.* Held: 26 of 26 present, and 29 of 30.
2. *The median share of steps before reaching is under a quarter.* Held: 3% and 11% by the plan's definition, 7% and 15% when a search hit does not count.
3. *Most functions read before reaching are outside the Box, but few in number.* Held. On most tasks the count is zero.
4. *Most of a run is spent after reaching the fix, so the ceiling on what a Box could save is small.* The first half held. The second half does not follow and is withdrawn: much of what comes after is still reading, mostly outside the Box.

## Reading the tables

- **Reaching.** The plan counts a search result that lands inside the fix's function. The stricter rows count only opening those lines or editing that file; they were added after the first numbers were seen, and they are the programme's own wording ("first view or edit"). The sceptic tested a tighter cut still (a view of at most 150 lines): it moves the GPT agent a great deal only because that agent pages through files in windows of 150 to 260 lines; at 300 lines nothing moves. The reaching step is sound.
- **The file-level filter does about as well as the Box.** Before the fix, about half the production files touched hold no Box function, and about a quarter are outside the cruder "files the test ran" filter.
- **Runs that failed.** Two Gemini runs and seven GPT runs did not resolve their task. In eight of those nine the fix was in the Box and the agent opened it. They failed after finding the place. The ninth is SymPy 16597, where the fix is outside the Box and the agent never reached it.
- **Needing something outside the Box.** One real case: the Gemini run on Django 12193 also changed a file in which the failing test ran nothing. The other listed cases are not: two GPT runs repaired the sandbox's own imports in unrelated files, and SymPy 16597 is the known fix outside the Box.
- **Sign of familiarity.** The GPT agent named the right file before anything had shown it on 7 or 8 tasks. Some are guessable from the issue. Gemini always searched first.

## Meaning and limits

- **The agents were not given the failing test.** With the test and its error trace they would probably locate at least as fast.
- **Two agents, thirty tasks, one run each.** A look, not a rate. Four Matplotlib records are missing from one submission, and one task (Django 16116) has no Box to compare with.
- **These tasks may be in the models' training data.** On private code locating could take longer. Nothing here measures that.
- **Input-token shares mislead.** Early calls are short, so "1% to 2% of input tokens before the fix" understates the cost; an earlier draft leaned on it. What early reading costs is being re-sent on every later call: 7% and 14% of all input at the median.
- **Reading is inferred from shell commands, and the patterns err both ways.** Found by hand-checking: some commands are wrongly taken as edits (text containing `&gt;` or `.write(`); a wide view counts every function it spans as read; of the 15% to 17% of steps classed only "other", about half are the agent reading its own diff and half are housekeeping. GPT's "steps" are actions, and one call can hold several. One GPT run's late reaching (51% of steps, Astropy 14539) was the agent repairing its environment, not searching.
- **One instrument fault was fixed after the sceptic found it:** when a call held several actions, all their outputs were credited to the last. 27 GPT calls were affected; the GPT text share before the fix moved from 8% to 10%. The summary from before the fix is kept.

## What follows

The trial's claim was that a program-made Box saves the tokens an agent spends working out where to look. On this evidence current agents spend little there on these tasks; that part of the claim has no room to succeed.

The evidence *suggests* a different place to look: after finding the fix, these agents read several hundred functions before editing, most of them outside what the failing test ran. If much of that is waste, a Box that says "this ran, that did not" could cut it; if the agent needs it (callers, siblings, conventions), a Box should not try. Published records cannot separate the two. That is a question for a small live comparison, or for reading a handful of these stretches by hand, and it is the CTO's and owner's call whether it is worth either.

## Every task

Each cell: resolved; steps in the run; step at which the fix was reached by the plan's definition / by viewing or editing only; other production functions read before that (stricter definition), outside the Box / all.

| Task | gemini-3-5-flash: resolved; steps; reached at (hit, view or edit) / (view or edit only); functions read before, outside Box / all | gpt-5-2-codex: resolved; steps; reached at (hit, view or edit) / (view or edit only); functions read before, outside Box / all |
|---|---|---|
| astropy__astropy-14539 | yes; 34; 3 / 3; 0 / 0 | yes; 59; 31 / 31; 13 / 17 |
| astropy__astropy-7166 | yes; 42; 2 / 2; 0 / 0 | yes; 42; 3 / 3; 0 / 0 |
| astropy__astropy-14182 | yes; 29; 2 / 2; 0 / 0 | yes; 28; 4 / 4; 0 / 0 |
| astropy__astropy-13033 | NO; 30; 4 / 5; 0 / 0 | NO; 35; 5 / 5; 2 / 3 |
| astropy__astropy-14508 | yes; 33; 2 / 21; 0 / 0 | yes; 43; 4 / 4; 0 / 0 |
| django__django-13786 | yes; 31; 2 / 3; 0 / 0 | yes; 33; 2 / 2; 0 / 0 |
| django__django-15467 | yes; 32; 2 / 8; 1 / 2 | yes; 21; 3 / 4; 0 / 0 |
| django__django-12193 | yes; 32; 2 / 16; 21 / 21 | NO; 31; 8 / 13; 27 / 29 |
| django__django-16116 | yes; 43; 2 / 3; - | yes; 29; 4 / 5; - |
| django__django-14752 | yes; 14; 2 / 2; 0 / 0 | yes; 20; 5 / 5; 0 / 0 |
| matplotlib__matplotlib-24570 | no record | yes; 30; 6 / 7; 5 / 7 |
| matplotlib__matplotlib-21568 | no record | NO; 68; 35 / 36; 70 / 75 |
| matplotlib__matplotlib-23412 | no record | yes; 38; 19 / 19; 0 / 0 |
| matplotlib__matplotlib-26113 | no record | yes; 37; 3 / 6; 0 / 0 |
| matplotlib__matplotlib-13989 | yes; 44; 2 / 4; 0 / 0 | yes; 30; 15 / 16; 0 / 0 |
| scikit-learn__scikit-learn-11578 | yes; 34; 2 / 3; 0 / 0 | yes; 42; 3 / 4; 0 / 0 |
| scikit-learn__scikit-learn-14087 | yes; 34; 2 / 3; 0 / 0 | NO; 18; 5 / 5; 0 / 0 |
| scikit-learn__scikit-learn-12585 | yes; 37; 2 / 3; 0 / 0 | yes; 20; 3 / 4; 0 / 0 |
| scikit-learn__scikit-learn-14894 | yes; 37; 2 / 3; 0 / 0 | yes; 31; 5 / 6; 0 / 0 |
| scikit-learn__scikit-learn-13124 | yes; 26; 3 / 3; 0 / 0 | yes; 26; 6 / 6; 1 / 1 |
| sphinx-doc__sphinx-7454 | yes; 51; 5 / 5; 5 / 5 | yes; 48; 4 / 4; 0 / 0 |
| sphinx-doc__sphinx-9320 | yes; 24; 4 / 4; 0 / 0 | yes; 28; 2 / 3; 0 / 0 |
| sphinx-doc__sphinx-10614 | NO; 49; 3 / 19; 0 / 0 | NO; 54; 3 / 5; 0 / 8 |
| sphinx-doc__sphinx-8595 | yes; 43; 3 / 4; 0 / 0 | yes; 53; 3 / 4; 0 / 0 |
| sphinx-doc__sphinx-11445 | yes; 41; 1 / 3; 2 / 3 | NO; 25; 3 / 4; 0 / 0 |
| sympy__sympy-12481 | yes; 36; 2 / 3; 0 / 0 | yes; 34; 6 / 7; 1 / 3 |
| sympy__sympy-12096 | yes; 45; 2 / 3; 0 / 0 | yes; 53; 19 / 20; 0 / 1 |
| sympy__sympy-16597 | yes; 68; 7 / 13; 0 / 0 | NO; 71; never / never; - |
| sympy__sympy-22914 | yes; 49; 1 / 2; 0 / 0 | yes; 46; 6 / 9; 0 / 0 |
| sympy__sympy-16766 | yes; 55; 2 / 5; 6 / 6 | yes; 42; 6 / 9; 0 / 0 |
