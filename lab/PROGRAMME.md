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

**The Box is open by default. The owner's decision, 8 October 2026; where this conflicts with the text above or the gates below, this wins.** In the owner's words, closely: it has very little drawback; you run the tool and it contains the relevant files; you mostly look in there to do the work; but the Box is not sealed, you can still search outside; we just provided a packaging to help you. So:

- **The product is a packaging, not a wall.** A program computes what is relevant to the task and hands it to the agent as the place to start: the files, and within them the functions the failing test ran through. The agent has the whole repository and may look anywhere. A wrong or incomplete Box then costs a little wasted reading and never a failure.
- **Sealing becomes an option for later,** for an owner who needs a boundary. It is not part of this trial.
- **This makes the trial smaller.** An open Box does not have to run alone, so levels 1 to 3 as *programs that still execute* are not needed here. What matters is the content of the packaging: which files, which functions, in what order, and how much text that is. Keep the levels as levels of *detail in the packaging* (files; files with the functions that ran marked; only those functions shown, with the rest as signatures) and drop the paired-run requirement for this trial.
- **The comparison is unchanged and sharper:** pstack has an agent read around to write the scope; we hand over a scope a program computed. Same helper, same repository, same failing test.
- **Gate 1 becomes a measure of the packaging, by script:** for each task, how much text is the Box at each level of detail against the repository; are the real fix's files and functions in it; how far down an ordered list do they sit. *Pass:* on at least half the tasks the Box is under a tenth of the repository's source and names every function the real fix changed.
- **Gate 2 is unchanged:** how much of a published agent's reading fell outside the Box, and whether what it needed was inside.
- **Gate 3 arms:** pstack-style brief written by an agent; and the same helper given the program's Box in place of that brief's scope. Count the brief-writing agent's tokens in the first arm and the program's run time in the second.
- **Two things to watch that an open Box brings, from gate 0's reading:** an agent may lean on the Box too hard and miss a fix that lies outside it (one paper in the reading list found whole-file context gave more correct fixes than slices); and with a failing test an agent can already read the error trace, so the Box has to beat that, not beat nothing. Say in gate 3's result how often the helper went outside the Box and whether it needed to.

### Spend almost no tokens until the cheap evidence says it is worth it

The owner's instruction, 8 October 2026: do not consume many tokens on this. The trial is four gates, the first of which is reading. Each costs more than the one before; stop at the first that fails and report.

**Gate 0. Read before running. No machine time, no agent runs. This is the next session.** The owner's challenge, 8 October 2026: running trials costs more than reading, and it would be strange if nobody who researched slicing had checked it on real projects. The owner is right. A ten-minute search by the CTO found work the lab's Tuesday survey did not read, and it bears directly on gates 1 to 3. Read these in full, not as abstracts, and nothing else:

1. *Stubbifier: debloating dynamic server-side JavaScript applications* (arXiv 2110.14162; Empirical Software Engineering 2022). Replaces code the tests never reach with file-level and function-level stubs that fetch the original on demand. Reported: about 56% smaller on average over 15 Node.js applications, few stubs ever expanded. This is our levels 1 and 2, and the "put the real code back automatically" option, already built and open source.
2. *The Impact of Program Reduction on Automated Program Repair* (arXiv 2408.01134; ICSME 2024). Slices away code irrelevant to a bug before repair. Reported: median repair time down from 80 minutes to under 18 on Defects4J examples, repair ability better on average and worse in a few cases.
3. *CausalRepair* (arXiv 2608.10613, August 2026). Dynamic slicing of the source from execution traces to give a model a minimal context for repair; 313 Defects4J bugs fixed. The nearest thing to our idea with a current model.
4. *On the Role of Context Granularity in LLM-Driven Program Repair* (NeurIPS 2024 workshop). Slice context gave the best ratio of correct to plausible patches; whole-file context gave more correct patches in total. A warning that less context is not simply better.
5. The measured sizes of slices from a real run: Zhang and colleagues (ICSE 2003, PLDI 2004, Empirical Software Engineering 2006) and Beszédes and colleagues on union slices. Reported ranges from a few percent of executed code to over half.

For each, record in one table: what was cut and at what grain; whether the result is a runnable program or only text for a model; how small it came out, and against what; what it did to repair success, time and cost; language and benchmark; and what the authors say went wrong. Then answer three questions in a sentence each:

- **Does this already answer gate 1?** If published sizes on real projects make the outcome of gate 1 predictable either way, say so and say which way.
- **What should gate 1 reuse instead of building?** In particular whether Stubbifier or its method can make levels 1 and 2 for TypeScript, and whether a Python equivalent exists.
- **What is left that nobody has measured?** The CTO's guess, to be confirmed or corrected: a sealed, runnable Box for a coding agent on Python or TypeScript, against a prompt-made brief.

*Pass:* the reading leaves a question worth machine time, and gate 1 is narrowed to it. *Stop:* the reading shows the Box is clearly not small enough, or clearly does not help, on evidence stronger than ours would be. One sceptic check: a fresh reader confirms the table's numbers against two of the papers. A sixth paper may be added only if one of these five cites it as the direct measurement of what we are asking.

**Gate 1. Size. No agent runs.** About thirty tasks from a public benchmark with large repositories and ready-made environments (SWE-bench Verified or a current equivalent), chosen by a rule committed first, Python first because the instrument traces it. For each task a script computes every level, runs the paired check, and writes one row: size of each level against the repository and the free baseline, whether it ran, whether the real fix's edits fall inside kept code, and whether the real fix touches or calls anything reduced to a stand-in.
*Pass:* on at least half the tasks the leanest working level is under a quarter of the free baseline and holds the real fix. *Fail:* say so and stop. This is a few hours of machine time and nothing else.

**Gate 1b. The Box as the first place to search. No agent runs. This is the next session, and the last measurement of the Box whatever it shows.** Set by the CTO on 8 October 2026 after gate 1 failed, from the owner's reading of that result. Gate 1 measured the Box as something to *read*, and as that it is far too big: 28% to 56% of a large project even in its leanest form, with the fix's function hundreds or thousands of places down the list. The owner's point: an open Box does not have to be read. The agent can *search inside it first* and fall back to ordinary search when that is not enough. Then size matters much less; what matters is whether a search lands on the right place sooner.

Gate 1 also did not measure the method the owner described. It traced whole test files and added everything they import. The owner's Box is the functions the one failing test ran through.

Do this by script on the same thirty tasks, reusing gate 1's images and receipts. No new tasks, no agents, no new ideas beyond the four below.

1. **The narrow Box.** Trace only the named failing test or tests. Keep only functions that ran. Add no imports. Report its size beside gate 1's.
2. **The same with start-up noise removed.** Subtract what the passing tests in the same test file also ran. Report size, and whether the fix's functions survive the subtraction; if they often do not, say so and do not use this version in step 4.
3. **What the free signal already gives.** From the failing test's own output, the error trace: does it already name a function the real fix changed? This is the baseline any Box has to beat, and nobody has counted it for us.
4. **A search, three ways.** Fix before looking at any result how search words are taken from each task, mechanically and with no judgement: identifiers that appear in the issue text and in the failing test's failure message. For each word, search (a) the whole repository, (b) the narrow Box, (c) the Box from step 2 if it survived. Record for each: how many matching places come back, and how many an agent would have to look through before reaching a function the real fix changed, taking matches in the order a plain search returns them. When the Box has no match that leads to the fix, count the fall-back: the Box's matches plus the whole-repository search.

**Report one table:** per task and in total, places to look through before the fix, by ordinary search, by Box-first search, and whether the error trace alone already named it. Then one sentence.

*Worth going on:* on most tasks where the error trace does not already name the fix, searching the Box first reaches the fix in clearly fewer places than ordinary search, and falling back costs little where it does not. *Stop:* the error trace already names the fix on most tasks; or Box-first search is no shorter; or the fix is usually not in the narrow Box. Gate 1's pass mark of a tenth of the source is withdrawn; it was the CTO's and it measured the wrong thing. The comparison that matters is the Box against what an agent would otherwise search and read.

Limits to state with the result: counting places to look through is a stand-in for an agent's behaviour, not a measurement of it; search words taken mechanically are cruder than an agent's; thirty tasks, six projects, Python only; the seven tasks gate 1 could not trace stay unknown unless the narrower trace happens to fix them. One sceptic pass reruns the script on a sample.

If this says go on, gate 2 and gate 3 follow as written, with "search the Box first, then anywhere" as the instruction in the Box arm. If it says stop, the Box trial is closed and the owner and CTO decide what is next.

**Gate 2. What it would have saved. No agent runs.** Use the published run records of an agent on the same benchmark tasks (the benchmark's public submissions include full trajectories; if they cannot be had at no cost, say so and skip to gate 3 with a smaller sample). For each task a script reads the record and counts: tokens the agent spent reading and searching; how much of that was on material the Box would have removed; whether everything the agent read before its fix is in the Box.
*Pass:* the Box would have removed at least half of the reading on tasks where the gate chose a Box, and what a successful agent needed was inside in at least four tasks in five. *Fail:* say so and stop. State the limit plainly: those records are from the benchmark's normal setting, without the failing test given, so this is an estimate of the ceiling and not a measurement.

**Gate 3. A small live check.** Only if gates 1 and 2 pass. Six tasks the gate chose a Box for, two arms (pstack-style brief; Box), one run each, the cheapest model that public results show solving most of them, a fixed cap on turns and tokens per run. Twelve runs in all. Count every token in both arms, including the brief-writing agent's and the program's run time. Two tasks are run twice in each arm first, to see how much one agent varies.
*Pass:* the Box arm solves at least as many and uses no more than half the tokens. With six tasks this can only confirm or contradict gates 1 and 2; say so.

**Rules that keep the lab's own cost down, for this trial:**

- Scripts do the work and write a summary file; the lab lead reads the summary, not the logs or the raw records.
- No literature survey beyond gate 0's named papers. No new lines. Lines B, C and E are paused, below.
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

- **Open-packaging Gate 1 instrument:** `lab/lines/box-trial/gate-1/`; frozen public sample, native test tracing, AST import closure, three text detail levels and historical-patch scoring. Research instrument only, no product transfer.

- **Sync state, 8 October 2026:** Gate 0 passed; Gate 1 failed: zero confirmed successes, 23 confirmed misses, seven unknown on 30 fixed tasks; at most seven successes against fifteen required. [Result and limits](lines/box-trial/gate-1-result.md). Trial stopped before Gate 2; owner and CTO decide from the numbers. Other lines remain paused. The original gate wording above is retained as history and is superseded where it conflicts with the owner's open-packaging decision.
