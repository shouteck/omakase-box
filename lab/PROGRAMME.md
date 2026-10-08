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

5. **How long the Box takes to make.** The owner's concern, 8 October 2026: a Box that is slow to compute may lose to plain search even if it is good. For each task record the seconds to run the failing test untraced, the seconds to run it traced and build each Box, and say which could be looked up from a map built once in advance (per-test coverage kept from an earlier full test run) and which must be computed fresh. Gate 1's record suggests seconds per task with two five-minute timeouts; confirm or correct that. Heavier techniques from the reading (true dynamic slicing along data dependences, which gave slices of a few percent and took hours in one paper) are not to be built here: say in two sentences what each would add and cost, so the owner and CTO can decide whether a second, heavier Box is worth trying if this light one is close but not enough.

**Report one table:** per task and in total, places to look through before the fix, by ordinary search, by Box-first search, and whether the error trace alone already named it. Then one sentence.

*Worth going on:* on most tasks where the error trace does not already name the fix, searching the Box first reaches the fix in clearly fewer places than ordinary search, and falling back costs little where it does not. *Stop:* the error trace already names the fix on most tasks; or Box-first search is no shorter; or the fix is usually not in the narrow Box. Gate 1's pass mark of a tenth of the source is withdrawn; it was the CTO's and it measured the wrong thing. The comparison that matters is the Box against what an agent would otherwise search and read.

Limits to state with the result: counting places to look through is a stand-in for an agent's behaviour, not a measurement of it; search words taken mechanically are cruder than an agent's; thirty tasks, six projects, Python only; the seven tasks gate 1 could not trace stay unknown unless the narrower trace happens to fix them. One sceptic pass reruns the script on a sample.

If this says go on, gate 2 and gate 3 follow as written, with "search the Box first, then anywhere" as the instruction in the Box arm. If it says stop, the Box trial is closed and the owner and CTO decide what is next.

**Gate 1c. What a Box could be made with. Reading only, after gate 1b, and aimed at what gate 1b found lacking.** The owner's point, 8 October 2026: how good a Box is depends on the state of the art in making one. The technique can be anything: any algorithm, from any part of the field, that helps decide what is relevant to a task. Gate 1b tests only the simplest one, and the idea should not be judged by that alone. The owner also holds that a Box which only helps and never confines gets more useful as models get smarter, because a smarter agent makes better use of a good starting point and is less likely to be misled by one. The CTO agrees in this form: a Box that carries *facts an agent cannot get by reading* (what actually ran, in what order, with what values) is evidence, and better models use evidence better.

**The target the catalogue is ranked against: the ideal Box, as the owner and CTO picture it on 8 October 2026.** A hypothesis to test, not a specification.

- *Open.* It never confines. The whole repository stays reachable; the Box is where to start.
- *Light to hold.* A page or two the agent reads first: a short ordered list of the places most likely to matter, each with one line saying why it is there. The code itself is fetched on demand, most relevant first, not handed over in bulk.
- *Light to make.* Seconds, from maps prepared in advance where possible; one fresh run of the failing test at most.
- *Evidence, not opinion.* Each entry rests on something observed or computed: it ran in the failing test and not in passing ones; the wrong value depended on it; it changed last week; it sits two calls from the failure. The agent sees which, so it can weigh it.
- *Layered, each layer earning its place.* The cheapest signals always; heavier ones (true slicing, reduction) only where the cheap ones leave the list long, and only if measured to help.
- *Honest about itself.* It says how confident it is and what it could not see (code that ran in another process, a fix that needs a new function), and steps aside when it has little to offer.
- *One call,* the same in any language, usable by a person or by an agent with nobody present.
- *Carries its check.* The failing test that anchors it travels with it, so "done" is stated.

Rank techniques by how much they move a Box towards this, per unit of effort.

Make a catalogue, one row per technique, from the literature and from tools that exist today. Cast wide on kinds: what ran (coverage, call traces); what differs between failing and passing runs; what the wrong value depended on (slicing along data and control); what changed recently (version history, the commits that last touched what ran); what is structurally near (call graph and import distance from the test and from the error trace); what is textually near (the issue's words against names and comments); reduction and debloating; learned rankers; and combinations. For each: what it needs as input; what it gives the agent that reading the error trace does not; how long it takes on a large project and whether it can be prepared in advance; whether a working tool exists for Python and for TypeScript today or it would have to be built, and how big a job that is; what published evidence there is that it helps a model or an agent fix more or spend less, with the setting and the caveat; and whether it needs a model or is pure computation.

Then rank the top five for adding to the Box next, by expected gain against effort, given the specific weakness gate 1b showed (too much start-up noise, the fix ranked too low, the fix missing, or too slow). Say which can be combined cheaply.

Keep it bounded: one session, a fixed list of search queries recorded in the notebook, full text only for the ten most relevant sources, abstracts for the rest and marked as such. A sceptic checks five rows against their sources. This is a map for deciding what to build, not a survey for its own sake; if gate 1b says stop for a reason no technique could fix (for example, the error trace already names the fix nearly always), say that and do not run this gate.

**CTO's decision after gate 1b (8 October 2026): gate 2 is the next session, before gate 1c.** Gate 1b settled size, speed and containment: the narrow Box is a median 4.7% of source, takes about two seconds, and holds the fix on 28 of 29 tasks, while the error trace names the fix on only 6. It left one thing open, and the sceptic put a finger on it: counting places in a mechanical search cannot say what an agent would really have done. With a well-chosen word ordinary search is already short on 13 of 20 tasks. Whether agents in practice choose well and read little, or wander, is a fact about agents, and published run records hold it at no token cost. So look there next. Gate 1c (ranking inside the Box) follows only if gate 2 shows there is reading to save.

**Gate 2 as it now stands. This replaces the pass mark in the paragraph below; the owner's standard is that any real improvement is worth having, so this gate reports and the CTO and owner decide.** For the same thirty tasks, take published records of one or two recent agents (prefer ones that solved most of them; say which and when they ran). By script, for each task:

1. *What the agent did before it first touched the right place:* how many searches, how many files opened, how many distinct functions and how much text read, before its first view or edit of a function the real fix changed. Also for the whole run.
2. *How that reading sits against the Box:* what share of the files and functions it read before reaching the fix were outside the narrow Box (reading the Box would have steered it away from) and what share inside. Whether the first thing it needed was in the Box. Whether it ever needed something outside the Box to finish, and what.
3. *The same against the rival filter* gate 1b found nearly as good: only the files the failing test ran.
4. *Where the tokens went:* the share of the run's input spent before first reaching the fix. That is the ceiling on what any Box could save on that task.
5. *Runs that failed or wandered:* for tasks an agent did not solve, was the fix in the Box, and did the agent ever look at it?

Report one table and one sentence: on these tasks, how much of real agents' reading before reaching the fix lay outside the Box, and how large a share of the run that was. State the two limits that matter: these records come from the benchmark's ordinary setting, where the agent was not given the failing test, so an agent with the test and its trace may wander less; and one or two agents on thirty tasks is a look, not a rate. If the records cannot be had at no cost, say so and stop; do not substitute live runs without the owner's word.

**Gate 2, the original wording, kept for the method notes; its pass mark is withdrawn (see above).** Use the published run records of an agent on the same benchmark tasks (the benchmark's public submissions include full trajectories; if they cannot be had at no cost, say so and skip to gate 3 with a smaller sample). For each task a script reads the record and counts: tokens the agent spent reading and searching; how much of that was on material the Box would have removed; whether everything the agent read before its fix is in the Box.
*Pass:* the Box would have removed at least half of the reading on tasks where the gate chose a Box, and what a successful agent needed was inside in at least four tasks in five. *Fail:* say so and stop. State the limit plainly: those records are from the benchmark's normal setting, without the failing test given, so this is an estimate of the ceiling and not a measurement.

**Gate 3, redesigned by the CTO on 8 October 2026 after gate 2. This replaces the wording below it. It is the first step in the trial that spends agent tokens, so it does not start until the owner sends `LAB.md` for it.**

Gate 2 showed that published agents find the fix in a few steps, so the reason we expected a Box to help (saving the search for where to look) has little room. The owner's answer: it does not need that reason. If an agent with the Box gets better results than the same agent without it, that is what matters, whatever the mechanism. The CTO agrees that gate 2 was evidence about *why* a Box might help, not a measurement of *whether* it does, and that only a live run measures that. There are ways it could help that gate 2 could not see: an agent that knows what ran in the failing test may read less after finding the place, or fix more correctly; a weaker or cheaper agent may gain more than a strong one.

**The question:** does the same agent, given the Box as well, solve more of these tasks or solve them for less?

- **Two arms, owner/CTO corrected on 8 October 2026.** Both get the issue text, failing test and whole repository. The Box is one extra command, box-search, covering only what the failing test ran. No listing or source enters context until the command is called. Box alone gets one instruction line requiring the agent to begin with box-search and use ordinary search whenever it is insufficient; everything stays reachable. Record every call, returned matches and subsequent actions. A valid Box attempt requires at least one call. Preserve the stopped passive-offer starts separately as the finding that its two completed Box agents never called it. Restart with the same fixed tasks, model and limits; control unchanged. No sealing, brief-writing agent or pstack arm.
- **Tasks chosen where there is room, by a rule fixed before any run.** From the thirty: the tasks a published agent failed, and the tasks with the longest published runs, up to eight; plus four that were solved quickly, to check that the Box does no harm where nothing needs fixing. Say which is which in the result. If a task cannot be run on this machine, drop it by rule and say so.
- **A cheap agent, and the same one in both arms.** The cheapest model that published results show solving a fair share of these tasks. A weaker agent is also where a Box is most likely to show an effect. Fixed limits on steps and tokens per run.
- **Runs:** each of the twelve tasks once per arm; then three of them twice more per arm to see how much one agent varies. About thirty-six short runs. If the first twelve pairs already show the arms indistinguishable or the Box arm clearly worse, stop there and do not run the repeats.
- **Measure:** solved, by the benchmark's own tests; total tokens and steps; steps and text read before first reaching the fix and between reaching and first editing (gate 2's measures, so the two can be compared); whether the agent used the Box at all, and how; and for any task solved in one arm and not the other, a short reading of why.
- **What "better" means, fixed before any run** (the owner, 8 October 2026: an open Box cannot make an agent worse, so the work is to say what better is and show it). In this order:
  1. *More right.* More tasks solved by the benchmark's tests, and no solved task lost.
  2. *Same result for less.* On tasks both arms solve: fewer total tokens, fewer steps, less time.
  3. *A cheaper agent reaching a dearer one's result.* If the published record shows a stronger model's solve rate on these tasks, say how far the cheap agent with the Box closes the gap.
  4. *Steadier.* On the repeated tasks, less variation from run to run.
  5. *No harm where nothing was needed.* On the four easy tasks, the Box arm costs no more than the few hundred tokens the Box itself adds.
  The Box counts as better if it wins on 1 or 2 beyond the noise and loses on none of the five. "The same" is the outcome to watch for: it would mean the tool is harmless and adds nothing these agents use.
- **Report one table and one sentence.** With this few tasks only a large difference means anything; say what size of difference this could and could not see. The owner's standard is that any real improvement is worth having; the lab's job is to say whether what it saw is real or within the noise.
- **Rules:** their code only in containers, network off for the agent's work; nothing sent to any project; record the model, the limits and every run including failed starts; one sceptic pass that rereads the solved-in-one-arm cases and reruns the scoring, not the agents.

If the Box arm is not better on results or cost beyond the noise, the trial ends. If it is, the next steps are the ones already written: what else could go in the Box, and a larger live run.

**Gate 3, the original wording, superseded by the paragraph above.** Only if gates 1 and 2 pass. Six tasks the gate chose a Box for, two arms (pstack-style brief; Box), one run each, the cheapest model that public results show solving most of them, a fixed cap on turns and tokens per run. Twelve runs in all. Count every token in both arms, including the brief-writing agent's and the program's run time. Two tasks are run twice in each arm first, to see how much one agent varies.
*Pass:* the Box arm solves at least as many and uses no more than half the tokens. With six tasks this can only confirm or contradict gates 1 and 2; say so.

**Rules that keep the lab's own cost down, for this trial:**

- Scripts do the work and write a summary file; the lab lead reads the summary, not the logs or the raw records.
- No literature survey beyond gate 0's named papers. No new lines. Lines B, C and E are paused, below.
- One sceptic pass at the end of each gate, and it reruns scripts on a sample; it does not run agents.
- A session ends when its gate has a result. Do not start the next gate in the same session; the owner sends `LAB.md` again after the CTO has read the result.
- Their code runs only in containers, network off, install scripts disabled; nothing is sent to any project.
- Report each gate in the brief as one table and one sentence: passed, failed, or could not be decided and why.

**The owner's plan for the Box, 8 October 2026: build the best one the state of the art allows, measure it on several metrics, then hill-climb it on benchmarks.** **This is an idea for later, not work for now** (the owner, same day: "I'm just throwing out ideas"). Do not build any of it in gate 1b or 1c. The only thing asked of gate 1b is what it would do anyway: keep its script rerunnable. The rest of this paragraph records the idea so it is not lost. If the first Box proves worth improving, what would be wanted is a **scoreboard that can be rerun cheaply**, so that every later change to how a Box is made can be scored the same way:

- *Offline metrics, by script, no agent tokens, on as many tasks as machine time allows:* where the real fix's functions sit in the Box's ordered list (in the first 1, 5, 10, 20; and the average position); how often the fix is in the Box at all; how long the list is; how long the Box takes to make; and the same numbers for the plain error trace and for ordinary search, as the baselines to beat.
- *Online metrics, with agents, on a small fixed sample, run rarely:* tasks solved, total tokens, time, and how often the agent went outside the Box and needed to.
- *Check once that the offline numbers predict the online ones.* If a Box that ranks the fix higher does not also make an agent cheaper or better, the offline scoreboard is measuring the wrong thing and must change before anyone climbs it.
- *Keep some tasks and whole projects aside,* never used while improving the Box, and score on them only at milestones. Thirty tasks from six Python projects is small enough to overfit without noticing. Add a second language to the held-aside set as soon as the tracer allows.
- Gate 1b's script and its thirty tasks are the seed of this. Write it so tasks and techniques can be added without rewriting it.

*A second idea for later, also the owner's, 8 October 2026: the Box-maker could itself be a trained model.* Two forms, very different in cost. (a) A language model trained to explore a repository and return where to look: this is what at least one vendor has already published and withdrawn for product reasons; it needs training data, compute and money, and it puts the product back on the model as the moat. Not for us now. (b) A small ranker, not a language model, trained on past fixes to combine the evidence a program has already computed (ran only when failing, distance from the failure, recently changed, and so on) into one ordering: cheap to train on an ordinary machine, fast to run, and the natural automatic form of climbing the scoreboard. Worth costing in gate 1c's catalogue as one row; not to be built there.

Climbing the scoreboard is engineering and belongs to the kitchen, under pstack's hillclimb playbook, once the lab has shown the first Box is worth climbing from. The lab keeps the scoreboard honest and supplies the catalogue of what to try.

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

- **Gate 1b instrument:** `lab/lines/box-trial/gate-1b/`; per-test call tracing in the pinned images, narrow Box, error-trace baseline, mechanical search words, place counts and a pre-fixed decision. Any Box given as a set of function keys can be scored. Research instrument only.

- **Gate 2 instrument:** `lab/lines/box-trial/gate-2/`; fetches published mini-SWE-agent run records with receipts, classifies shell commands, finds the step that first reaches the fix, and scores reading against the Box and the file filter. Research instrument only.

- **Sync state, 8 October 2026:** Gate 0 passed; Gate 1 failed; Gate 1b worth going on by its rule, weakened to "suggests"; Gate 2 reported. **Gate 3 required-search restart reported:** ten valid paired tasks solved in both arms, paired median 41.6% more tokens for Box; two zero-call Box runs invalid. All fifteen calls were empty/error responses. Passive-offer starts are preserved separately. Independent review reproduced the whole measurement and supports only "no improvement demonstrated in this protocol", not that useful Boxes cannot help. [Result](lines/box-trial/gate-3-result.md). Stop without repeats under the fixed rule. Gate 1c and product transfer unstarted; other lines paused.

- **Gate 3 closeout:** amended plan pushed at 7918335 before fresh starts; 24 starts retained, 10 valid Box attempts, 2 invalid; no repeats. Astropy 13033 has a pristine expired-data guard failure and remains unknown. Django descriptions and Matplotlib truncated IDs were corrected only in native grading, preserving original receipts and patch hashes. Any future tool usability/query changes require a separately authorized and frozen experiment.
