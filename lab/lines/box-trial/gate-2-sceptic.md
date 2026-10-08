# Gate 2: sceptic

8 October 2026. Review of [gate-2-result.md](gate-2-result.md) (the draft) against [gate-2-plan.md](gate-2-plan.md). Scripts only; no agent run, nothing paid, no Git change. The only file written is this one (`gate-2/sample-rerun.json` was rewritten by the rerun).

**Host and model.** Claude Opus 5.5 (`claude-opus-5-5`) in Claude Code on the Windows host, started fresh with no view of the researcher's conversation. As far as I know this is the same model family as the researcher. This is independence of context, not of model; no diversity is claimed.

## Standing

| Claim on the page | Standing |
|---|---|
| Gemini first views or edits the fix after a median of 2 steps of about 36 | **Stands** |
| GPT does so after a median of 4 steps of about 35 | **Stands, with a note**: a "step" is an action, not a model call, and the number depends on GPT's wide views counting (see a) |
| 5% to 8% of the run's output text before that point | **Weaken**: true as medians (4.8% and 8.1%; 9.6% for GPT once a parser fault is fixed), but the means are 14% and 20% and the tail is long |
| 1% to 2% of input tokens | **Does not stand as a measure of what could be saved** (see e). The arithmetic is right; the meaning is not |
| Most pre-reach reading is outside the Box (35 of 37, 119 of 144) | **Stands**, concentrated on 5 and 9 tasks as the page says |
| "So there is little reading to save" | **Does not stand.** What is earned: there is little *locating* to save |
| Prediction 4 "held" (most of the run is editing, running, checking after the fix is found) | **Does not stand as worded.** The first edit of the fix's file comes at a median 66% (Gemini) and 57% (GPT) of steps |
| "What follows": a Box that only says where to start has almost nothing to save | **Weaken to "suggests"**, for these two agents on public, probably memorised repositories |
| Agent-selection rule followed | **Stands** |
| Post-hoc strict rows handled honestly | **Stands**, and they are in fact the programme's own definition |

## 1. Rerun

- `check.py`: passed.
- `measure.py` on `django__django-12193`, `sympy__sympy-12096`, `astropy__astropy-14539` (three projects, both agents, six rows): every field identical to the same rows in `summary.json`.
- Headline table recomputed from `summary.json` rows with my own script, both agents, both definitions: every number matches (26/30 records; 24/23 resolved; 26/29 reached; 36.5/34.5 steps; 1/4 and 2/4 steps before; 3/1/0 and 11/5/2, 7/5/1 and 15/8/2 per cent; 5;5;1 and 107;92;7; 37;35;5 and 144;119;9; files 32;22;18, 76;45;18, 72;36;22, 95;47;20; max 61% and 51%; other-only 17% and 15%).

## 2. Hand classification

**Gemini, `sympy__sympy-12096`** (target `Function._eval_evalf`, function.py 500-547; 45 steps). Step 1 a repository-wide search for `_eval_evalf` (the issue names it), step 2 `grep -n "def _eval_evalf" sympy/core/function.py`, step 3 `sed -n '500,530p'` of that file. The script's reaching step (2 by hit, 3 strict) is right. But the first edit is step 34. Steps 4 to 33 are understanding: views of `evalf.py`, eight searches, a dozen `python -c` experiments, two test runs. The page counts none of that as reading that matters.

**GPT, `astropy__astropy-7166`** (target `InheritDocstrings.__init__`, misc.py 523-540; 42 steps). `ls`, one grep for the class, then `sed -n '430,580p'`: reached at step 3, correct. It then reads 31 functions in four other files (steps 5 to 10) before touching anything.

**GPT, `astropy__astropy-14539`** (target `TableDataDiff._diff`, diff.py 1344-1488; 59 steps; the page's largest GPT share, 51%). Reached at step 31 with a 261-line view; correct. But the thirty steps before are not searching for the place. Steps 13 to 30 are repairing the environment: `pip install`, compiling `astropy/utils/_compiler` with gcc, pinning numpy. The agent had opened the right file at step 11 (lines 1-520, the wrong part). "Late" here measures a broken sandbox, not a hard search.

**What the script gets wrong.**

1. **Several commands in one model call (GPT only).** `steps_of` appends every tool output of a call to the *last* action. 27 of 1,064 GPT calls carry more than one action (71 extra actions, all with no input-token figure). In 14539, steps 3, 6, 7 and 11 show zero characters and step 12 carries the text of two views. Hits and character counts are misplaced. Corrected by matching outputs to actions in order, the strict GPT output-text median moves from 8.1% to 9.6%; steps and tokens do not move. Small, but it is a fault, and "steps" for GPT are actions (median 34.5), not model calls (median 32).
2. **False edits.** Any `>` redirection counts as an edit of every repository file named in the command: `git diff -- sympy/core/function.py > patch.txt` is scored as editing the target. A Python experiment that calls `.write(` or `writeto` is scored as an edit (14539 step 33). Neither changed a reaching step in the records I read, but 153 GPT steps are classed edit against 49 for Gemini, which is not credible as real edits.
3. **Reading missed.** `inspect.getsource` and similar inside Python (11 GPT steps, 2 Gemini) is classed run. Views of files that are not `.py` are classed other: about 53 Gemini and 77 GPT steps, mostly the agent re-reading its own `patch.txt`, plus C source and docs. `git diff` and `git show` (79 and 50 steps) show source lines and count as nothing.
4. **Reading over-counted.** A view counts every function any of whose lines falls in the window. GPT's habitual window is 150 to 260 lines, so one command "reads" 5 to 15 functions.
5. **Multi-line `python -c`** is split on newlines and each line classed other; harmless because the step also carries run.

**The "other-only" 15% to 17%.** Gemini, 170 steps: `git diff` 52, `git status` 31, the submit `echo` 31, `cat` of a file outside the snapshot 28 (mostly its own patch or scratch files), `rm` 10, the rest odd. GPT, 166 steps: `ls` 36, `sed -n` of a non-.py file 34 (31 of them `patch.txt`), submit `echo` 30, `git status` 21, `git diff` 18, the rest odd. So roughly half is housekeeping, and roughly half is the agent reading its own diff. Almost none is missed reading of repository source. The blind spot does not threaten the reaching step.

## 3. Sensitivities

| | gemini-3-5-flash | gpt-5-2-codex |
|---|---|---|
| Page (strict): steps before, median; share steps / output text / input tokens | 2; 7% / 5% / 1% | 4; 15% / 8% / 2% |
| Same, means instead of medians | 12% / 14% / 4% | 20% / 20% / 5% |
| Runs with more than a quarter of steps before reaching | 3 of 26 | 6 of 29 |
| **(a)** Reaching needs a view of at most 150 lines over the target, or an edit | 2.5; 7% / 6% / 1% | 14; 39% / 53% / 10% |
| (a) the same with at most 300 lines | 2; 7% / 5% / 1% (unchanged) | 4; 15% / 10% / 2% (unchanged) |
| (a) width of the reaching view, median; reached by a view over 150 lines | 66 lines; 2 of 26 | 151 lines; 15 of 29 |
| **(b)** Between first reaching and first edit of a target file: steps, median | 18 | 10.5 |
| (b) other production functions read there, all tasks; outside the Box | 220; 144 (65%) | 438; 342 (78%) |
| (b) share of the run's output text in that stretch, median | 46% | 38% to 40% |
| (b) for comparison, the page's pre-reach count; outside the Box | 37; 35 | 144; 119 |
| First edit of a target file: share of steps / output text / input tokens, medians | 66% / 73% / 47% | 57% / 83% / 33% |
| **(c)** Whole run: other production functions viewed; outside the Box | 307; 214 (70%) | 805; 587 (73%) |
| (c) share of output text from view and search steps / run steps / other | 51% / 39% / 9% | 49% / 32% / 17% |
| **(d)** Target file named in the first command / in the first three | 5 / 23 of 26 | 0 / 8 of 30 |
| (d) target file named before any output or the issue had shown it | 0 of 26 | 7 or 8 of 30 |
| **(e)** Pre-reach context re-sent on every later call, as a share of all input tokens, median / mean / largest | 7% / 15% / 62% | 14% / 19% / 45% (25 runs) |

- **(a) Not an artefact.** The 150-line cut moves GPT a great deal, but only because GPT pages through files in windows of 150 to 260 lines; one of the excluded views is 151 lines centred on the target. At 300 lines nothing moves for either agent. No reach was a whole-file `cat` of a large file. The reaching step is sound.
- **(b) The page's gap.** After first seeing the fix and before first changing it, the agents read six times (Gemini) and three times (GPT) as many other functions as before reaching it, two thirds to three quarters of them outside the Box, across 19 tasks each, in a stretch holding about two fifths of all output text. This is where a Box either helps (it would have pruned that reading) or hurts (the agent needed it and a sealed Box would withhold it). The gate cannot say which, and the page does not mention it.
- **(c)** About half of everything these agents read is views and searches, and about seven tenths of the functions they view lie outside the Box.
- **(d)** Gemini always searches first; no sign of going straight to the file. GPT names the right file before anything had shown it on 7 or 8 tasks (for example `sklearn/model_selection/_split.py`, `lib/matplotlib/axes/_axes.py`, `sympy/core/function.py`). Some are guessable from the issue; together they show familiarity with these repositories' layout. That supports the page's training-data caveat; it is not proof of a memorised fix.
- **(e) The 1% to 2% is not fair.** Summing input tokens of the calls before reaching counts a few short calls against a run of long ones. What reading costs is that it stays in context and is paid for again on every later call. Measured that way (growth in context up to the reaching call, times the calls that follow, without prompt caching), the pre-reach reading is 7% and 14% of all input at the median, 15% and 19% at the mean. The programme's item 4 calls the input share "the ceiling on what any Box could save"; the page's figure is several times below that ceiling.

## 4. Comparisons with the Box

- `functions_outside_box` (viewed, minus Box, minus target), `functions_not_target`, `files_outside_box` (production files holding no Box function) and `files_outside_rival` (production files absent from the trace) are computed as the plan says. Totals are over runs with a Box.
- `django__django-16116` has no trace: `has_box` is false, the Box fields are absent, it is left out of Box totals and kept in the reaching medians, and the per-task table shows "-". Handled. The page should say in words that one task has no Box.
- **"Own patch outside the Box", 2 tasks per agent, is mostly not what the page says.**
  - GPT, `sympy__sympy-12481` and `-12096`: the files are `sympy/assumptions/sathandlers.py` and `sympy/plotting/plot.py` on both. In both patches these are the same three-line change, `from collections import Mapping` to `collections.abc`, made so that an old SymPy imports on a new Python. They are repairs to the sandbox carried into the final patch, not a need of the task. They show the GPT runs were not in a clean benchmark environment (see also the pip and gcc steps), which also inflates their step counts.
  - Gemini, `sympy__sympy-16597`: `sympy/assumptions/ask_generated.py` is part of the historical fix itself. This is the known task whose fix is outside the Box, not a new finding.
  - Gemini, `django__django-12193`: `django/contrib/postgres/forms/array.py`. This one is real: the agent changed a second place the failing test never ran.
  - So the honest count is one genuine case (Gemini), one restatement of gate 1b, and two environment artefacts.

## 5. Framing

- **"Little reading to save" is not earned.** The gate measured reading before *locating* the fix and found it small. It did not measure reading before *being able to write* the fix, which the same records show to be large and mostly outside the Box. The sentence and "What follows" slide from the first to the second.
- **Prediction 4** was "held" on input tokens after reaching. By steps and output text the majority of the run comes before the first edit. What follows reaching is mostly more reading and experiments, not "editing, running, checking".
- **"What follows" is stronger than the evidence** in one direction and misses the other. The programme makes gate 1c depend on whether "there is reading to save". Half of the output text is reading and seven tenths of the functions read are outside the Box; whether that reading is waste or need is the open question, and it is a better statement of where this gate leaves the trial than "almost nothing to save".
- **Strict rows.** Marked as added after the first numbers, shown beside the planned ones, not swapped in silently. Fair. Note that PROGRAMME.md defines the point as the agent's "first view or edit" of a fixed function, so the strict rows are the programme's definition and the plan's search-hit rule was the departure. The headline sentence rightly uses the strict numbers but should say so.
- **Agent selection.** One listing of `evaluation/verified` in SWE-bench/experiments: the latest mini-SWE-agent entry is `20260901_mini-v2.4.2_gemini-3-5-flash`; the next ones back are `20260226_mini-v2.0.0_gemini-3-pro-high` (same maker) and `20260219_mini-v2.0.0_gpt-5-2-codex`. The rule was followed. Not checked: whether the 26 February entry has public records, which does not matter since it is the same maker.
- **Limits stated on the page** (no failing test given, two agents, training data, shell inference, four missing Matplotlib records) are fair. Missing: the GPT environment trouble, and that medians hide a long tail.

## Corrections for the result page

1. Replace "So there is little reading to save" with what was measured: little is read before the fix is first *found*. Add that most of the run's reading comes after that and before the first edit.
2. Add rows for the stretch between first reaching and first edit of a target file: 18 and 10.5 steps at the median; 220 and 438 other functions, 144 and 342 outside the Box; about two fifths of output text. Add the first-edit point: 66% and 57% of steps.
3. Add the whole-run rows: 307 and 805 other functions viewed, 214 and 587 outside the Box; about half of output text comes from views and searches.
4. Rewrite prediction 4: held for input tokens after reaching; not held if "after reaching" is read as editing and checking.
5. Drop the 1% to 2% input-token figure from the headline sentence, or pair it with the re-sent cost (7% and 14% median, 15% and 19% mean) and say which assumption each makes.
6. Give means and tail beside the medians: 12% and 20% of steps, 14% and 20% of output text; 3 of 26 and 6 of 29 runs spend over a quarter of their steps before reaching.
7. Fix `steps_of` so each tool output goes to its own action, rerun, and state that GPT "steps" are actions (27 calls carry several). Expect the GPT output-text median to move from 8% to about 10%.
8. Rewrite "Needing something outside the Box": one genuine case (Gemini, Django 12193, `postgres/forms/array.py`); SymPy 16597 is the fix already known to be outside the Box; the two GPT cases are `collections.abc` import repairs to the sandbox and should not be counted.
9. Say that the GPT runs repaired their environment (pip, gcc, import shims), that this pads their step counts, and that the page's largest GPT share (astropy 14539, 51%) is that and not searching.
10. Say that the stricter rows are the programme's own definition ("first view or edit"), and that the sentence uses them.
11. In limits, replace "Reading done inside a Python snippet is not seen" with the measured blind spots: about half of other-only steps are the agent reading its own diff, about half housekeeping; redirections and Python `.write(` are over-counted as edits; a wide view counts every function in the window.
12. Add to the training-data limit: GPT named the right file before anything had shown it on 7 or 8 of 30 tasks; Gemini on none.
13. In "What follows", keep "a Box that only points to the start saves little" as "suggests", and state the open question the records raise: whether the large, mostly out-of-Box reading between finding and fixing is waste a Box would remove or need a Box would have to supply.
14. State in words that `django__django-16116` has no Box and is excluded from Box totals.
