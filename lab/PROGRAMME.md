# Research programme

Set by the CTO. Rewritten short on 8 October 2026: the earlier page had grown to 54 KB, and every session paid to read it. The full earlier text, with the owner's notes and every line's history, is `lab/archive/PROGRAMME-2026-10-07.md`. Read it only if a task here needs it.

No deadlines. The CTO decides which problem and in what order; the lab lead decides how. The owner is not a research scientist and is not asked to steer method.

## Where things stand

- The product idea is a **Box**: a small, runnable piece of a repository, made for one task, with its check attached, that a person or agent can work in without the rest.
- 7 October tested that idea from several sides. What fell: a guarantee that nothing is missing (two counter-examples); a Box as a way to find customers who will not share code (no public evidence either way); a Box cut by whole files on small libraries (it came out as the whole library). A search for a different product next to the model found none.
- What stands, and what the owner wants tried: serious users of agents already make a "box" by prompt. pstack tells an agent to write a helper a brief with a tight scope, do-not-touch fences and a verification contract. That is an agent spending tokens to work out what a program could compute. **If a program makes the Box, it should be cheaper for the same result.**

## The one active piece of work: the Box trial

**The claim, stated so it can fail.** Given a failing test, a Box computed by a program gets the same agent to a fix at least as often as a pstack-style brief does, for no more than half the total tokens.

**The only comparison.** Against the pstack way: an agent reads the task and the repository, writes the helper a brief (scope, fences, check) as pstack's orchestrate playbook describes, and a helper works with the whole repository. Nothing else is compared. No oracle arm, no hinted arm, no other tools.

**What a Box is here.** Made by a program with no model involved, in levels, each accepted on a task only if the sealed Box still fails the failing test the same way and passes the guard tests:

- Level 0: the files the tests executed, plus what those import.
- Level 1: files reached only through type-only or never-executed imports become stand-ins (names and signatures, no insides).
- Level 2: inside shipped files, functions the tests ran are kept whole; the rest become a signature, one line of description and a body that fails loudly saying it was left out.
- Level 3: drop comments, unrelated tests and unreachable files.

**A Box is used only when it earns its place** (the owner's principle). The program applies a gate using only what it knows before the agent starts: there is a failing test; the Box passed its run; it is small against the whole repository and against the free baseline (the test's own package plus its dependencies); stand-ins are not most of what is left. If the gate says no, the agent works the pstack way. The gate's rule is fixed before any agent run.

### Spend almost no tokens until the cheap evidence says it is worth it

The owner's instruction, 8 October 2026: do not consume many tokens on this. The trial is three gates. Each costs more than the one before; stop at the first that fails and report.

**Gate 1. Size. No agent runs.** About thirty tasks from a public benchmark with large repositories and ready-made environments (SWE-bench Verified or a current equivalent), chosen by a rule committed first, Python first because the instrument traces it. For each task a script computes every level, runs the paired check, and writes one row: size of each level against the repository and the free baseline, whether it ran, whether the real fix's edits fall inside kept code, and whether the real fix touches or calls anything reduced to a stand-in.
*Pass:* on at least half the tasks the leanest working level is under a quarter of the free baseline and holds the real fix. *Fail:* say so and stop. This is a few hours of machine time and nothing else.

**Gate 2. What it would have saved. No agent runs.** Use the published run records of an agent on the same benchmark tasks (the benchmark's public submissions include full trajectories; if they cannot be had at no cost, say so and skip to gate 3 with a smaller sample). For each task a script reads the record and counts: tokens the agent spent reading and searching; how much of that was on material the Box would have removed; whether everything the agent read before its fix is in the Box.
*Pass:* the Box would have removed at least half of the reading on tasks where the gate chose a Box, and what a successful agent needed was inside in at least four tasks in five. *Fail:* say so and stop. State the limit plainly: those records are from the benchmark's normal setting, without the failing test given, so this is an estimate of the ceiling and not a measurement.

**Gate 3. A small live check.** Only if gates 1 and 2 pass. Six tasks the gate chose a Box for, two arms (pstack-style brief; Box), one run each, the cheapest model that public results show solving most of them, a fixed cap on turns and tokens per run. Twelve runs in all. Count every token in both arms, including the brief-writing agent's and the program's run time. Two tasks are run twice in each arm first, to see how much one agent varies.
*Pass:* the Box arm solves at least as many and uses no more than half the tokens. With six tasks this can only confirm or contradict gates 1 and 2; say so.

**Rules that keep the lab's own cost down, for this trial:**

- Scripts do the work and write a summary file; the lab lead reads the summary, not the logs or the raw records.
- No literature survey. No new lines. Lines B, C and E are paused, below.
- One sceptic pass at the end of each gate, and it reruns scripts on a sample; it does not run agents.
- A session ends when its gate has a result. Do not start the next gate in the same session; the owner sends `LAB.md` again after the CTO has read the result.
- Their code runs only in containers, network off, install scripts disabled; nothing is sent to any project.
- Report each gate in the brief as one table and one sentence: passed, failed, or could not be decided and why.

**What happens after.** All three pass: the kitchen turns the instrument into the product's `prepare` step. Any fails: the owner and CTO decide from the numbers; this is the last trial of the Box in this form.

**Not built in this trial, to be costed in a sentence each if the results point there:** putting real code back automatically when an agent in a Box reaches for a stand-in; further reductions from the literature.

## Paused lines

Each has its last result in `lab/lines/` and its full brief in the archive. None runs until the CTO reopens it.

- **A. A slice anchored on an example** (`lab/lines/example-slice/`). Folded into the trial: its instrument is what gate 1 runs. Its first replay stopped at two development cases.
- **B. Where the product stands** (`lab/lines/where-it-stands/`). One survey, attacked. Whole-repository agents are the incumbent; demand for limited disclosure unknown.
- **C. From a request to an example** (`lab/lines/request-to-check/`). Outside sample 1 done; next step was turning reproductions into runnable checks.
- **E. A product out of research nobody has built** (`lab/lines/unbuilt-research/`). Session 1: none survive next to the model. The owner redirected it to layers where the model is not the moat; session 2 not run.

## Standing constraints from the owner

- Not a marketplace, bounty board or issue-tracker clone.
- No round trips between owner and solver; a Box that needs a second message has failed.
- Do not design around "ship everything except what the owner withholds".
- No conversations with possible customers until the MVP is clear.
- The product must not rest on unsolved research. Cutting code down with ordinary tools and checking by running is engineering; proving equivalence is research and stays parked.
- Zero cost, and now also: few tokens.

## Instruments the lab owns

Listed in the archive page. The one this trial uses: the runtime instrument in `lab/lines/example-slice/instrument/` (sealed runs, execution tracing for Python and TypeScript, package export, paired observations). The lab lead adds new instruments here in one line each.

- **Sync state, 8 October 2026:** programme rewritten by the CTO; the Box trial is the only active work; next session is gate 1.
