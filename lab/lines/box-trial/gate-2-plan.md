# Gate 2 plan: what real agents read before reaching the fix, against the Box

Fixed 8 October 2026 and pushed before any run record for the thirty tasks was downloaded or read. Authority: PROGRAMME.md, "Gate 2 as it now stands". This gate reports; it has no pass mark. The writer has seen Gate 1b's results, and the record *format* on one task outside the sample (`django__django-11099`), and nothing else.

## Records

Public, free, no agent run by the lab.

- **Which agents, by a rule fixed before looking.** From the SWE-bench Verified submissions list on 8 October 2026: the most recent mini-SWE-agent submission with public run records, and the most recent one from a different model maker. That gives `20260901_mini-v2.4.2_gemini-3-5-flash` (Gemini 3.5 Flash, reported 71.8% resolved, records in the submitter's public GitHub repository) and `20260219_mini-v2.0.0_gpt-5-2-codex` (GPT 5.2 Codex, reported 72.8%, records in the benchmark's public bucket). Both are one attempt per task, with one tool: a shell.
- **Tasks.** Gate 1's thirty. A task whose record is missing from a submission is reported missing for that agent, not replaced. Whether each run resolved its task comes from the submission's own evaluation files.
- **Setting.** These agents were given the issue text only. They were not given the failing test.

## What is taken from each record, by script

A record is a list of steps: a shell command and its output. Each command is classified by fixed patterns, first match wins:

- **view**: prints part of a named repository file: `cat`, `sed -n 'A,Bp'`, `nl ... | sed -n`, `head`, `tail`, and the same after `cd /testbed &&`. Gives the file and, where stated, the line range; otherwise the whole file up to the length of the output.
- **search**: contains `grep`, `rg`, `git grep`, `find`, `ag` or `ack`. Output lines of the form `path:line:` count as lines shown from that file.
- **edit**: writes to a repository file: `sed -i`, redirection into a file, a here-document into a file, `git apply`, `patch`, `perl -pi`, or a Python or shell snippet that names a repository file and opens it for writing or calls `write`/`replace`.
- **run**: starts Python, pytest or a project script without matching the above.
- **other**: everything else.

A step can hold several commands joined by `&&`, `;` or newlines; each is classified, and the step takes every class found. The share of steps that are only `other` is reported as the parser's blind spot.

Files are mapped onto Gate 1's base snapshot, functions as in Gate 1b. Text shown is counted in characters of command output.

## Definitions

- **Target:** as in Gate 1b: existing production functions the historical fix changes; for the two `file-target` tasks, the patched files.
- **Reaching the fix:** the first step that views lines overlapping a target function, or shows a search hit inside one, or edits a file containing one. For `file-target` tasks: the first view, hit or edit in a patched file. A run that never does is `never reached`.
- **Narrow Box:** Gate 1b's, from its recorded trace. **Rival filter:** the production files in which the failing test called anything.
- **Before reaching:** all steps strictly before the reaching step.

## What is reported, per task and agent, and in total

1. Before reaching, and for the whole run: number of steps; searches; distinct files viewed or hit; distinct production functions viewed (a view overlapping a function's lines); characters of output.
2. Against the Box: of the distinct production functions viewed before reaching, how many are outside the narrow Box; of the distinct production files viewed or hit before reaching, how many hold no Box function. Whether the target is in the Box (from Gate 1b). Whether the agent's own final patch changes a production function or file outside the Box, and which.
3. The same file count against the rival filter.
4. Share of the run before reaching, three ways: steps; characters of output; and the model's reported input tokens summed over calls, where the record has them.
5. For runs that did not resolve the task: was the target in the Box, and did the agent ever reach it.

**The one sentence** will state, for runs that reached the fix: the median share of the run spent before reaching it, and the median share of the production functions read before reaching it that lay outside the Box.

## What is predicted, so it can be wrong

1. Both agents reach the fix on at least 25 of 30 tasks.
2. They reach it early: the median share of steps before reaching is under a quarter.
3. Of what they read before reaching, most production functions (over half) are outside the Box, but that is few functions in absolute terms: a median under ten.
4. Most of a run is spent after reaching the fix (editing, running, checking), so the ceiling on what a Box could save is small.

## Limits known in advance

The agents had no failing test; with one, they may wander less. Two agents, thirty tasks, one run each: a look, not a rate. A shell-only agent's reading is inferred from command text, and the patterns will miss some (reported). Reading a function is taken as viewing any of its lines. Benchmark tasks and their fixes may be in these models' training data, which would shorten their search. The Box is Gate 1b's, made from the historical failing test.

## Sceptic

One fresh agent: reruns the script on a sample and compares; classifies by hand the commands of two records and compares with the script; attacks the definitions of reaching and reading. No agents are run on tasks.
