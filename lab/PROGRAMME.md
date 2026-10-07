# Research programme

Set by the CTO from the product roadmap on 6 October 2026. There are no deadlines here: the order below is a logical sequence, and a line takes as long as honest work on it takes. The CTO decides which problems the lab works on, in what order, and which product decision each must inform. The lab lead decides how: the formulation, the method, the instruments, and when the evidence says a line should close. The owner is not asked to steer research.

## What the product is trying to prove

From `PLAN.md` on master, in order of risk:

1. A sliced package builds and passes its checks without the rest of the repository. **Shown** for TypeScript on a fixture; **shown in a prototype** (A0) for npm, Python and multi-package projects with no outside dependencies. **Accepted product capability through A4:** explicit extension-neutral selection, paired base/Box observations and declared-command-only export/verify, with R1/R2 replay records. A4 delivered actual folder-only npm/Python agent submissions accepted owner-side against pristine manifests and selected workspace execution with cached real picocolors@1.1.1, scripts disabled and excluded member source absent. Purpose-written fixtures prove capability, not useful real-issue delegation, controlled effort savings or enforced recipient isolation.
2. A recipient who has never seen the repository can finish the change from the package. **Shown** once on a fixture and once on a real internal request (R1).
3. It costs the owner less effort than ordinary delegation, or discloses far less source for similar effort. **Not shown.** Disclosure looks strong (R1 shipped 2 of 694 files); effort points the wrong way (R1 needed about 470 lines of checks for an 8-line change).
4. Someone chooses it again and would pay. **No evidence.** This is the owner's to pursue, not the lab's.

The lab exists to close the gap in claim 3 and to tell the product how far claims 1 and 2 stretch. Anything that does not serve one of those waits.

The aim behind all of it, from the owner: the person who posed the problem accepts the solution. The product gives them the most certainty it honestly can and guides them to the best solution available: proof where proof is possible, a stated degree of certainty where it is not.

## A note to the lab, from the owner and the CTO

Written 7 October 2026. Read it before the lines below; it is why they are what they are.

**Why a Box.** The idea at the centre is simple enough to say in a breath. A Box is a box of a repository: only the relevant pieces are inside. It is portable. You can hand it to a person or an agent to work on, and take the work back. That picture is the product, and everything else is in service of it.

**What troubles us.** If that picture were enough, the industry would already work this way, and it does not. Software work is still done by people and agents who hold the whole repository. Handing out a bounded piece of work to someone outside has been possible for a long time, through bounties, issue boards and contracting, and it has stayed at the edges. There is a reason. We have guesses (each task is worth too little, switching context costs too much, solvers compete against everyone for no security, reviewing a stranger's work costs the owner more than doing it), but they are guesses. We need to know.

**What we will not be.** A copy of a bounty site. A copy of an issue tracker with a hand-out button. If the honest conclusion is that a Box adds nothing those do not already offer, say so; that is a result we need as much as the opposite.

**What we need answered before there is an MVP.**

1. **Why has this way of working not taken hold?** What has actually been tried, what happened to it, and what stopped it: on the owner's side, on the solver's side, and in between. Evidence, not our guesses above.
2. **What is the friction, exactly, and which parts can a Box remove?** Separate the friction a Box could take away (getting context, deciding what to share, knowing when the work is done) from the friction it cannot (trust, price, who is accountable).
3. **What value would a Box add that existing options do not?** Stated so that someone who uses bounties or contractors today, or who runs agents on their whole repository, would recognise it as something they lack.
4. **How is software work really divided and handed over today,** among people, between people and agents, and among agents? What is changing, and where is it heading? Where is work already bounded and handed over, by whom or what, and to whom or what?
5. **How could more software work get done through this idea?** Not "who might try it once" but what would have to be true for it to become a normal way of working, for people and for agents, and what the first foothold would be.
6. **Is the technical core sound?** A Box that does not reliably hold what the solver needs is not a Box. That is Line A.
7. **How should making a Box and handing one over feel?** See the second note below.

**A second note, same day: it has to be effortless, from wherever the work already is.** Making a Box should be intuitive and very convenient, and there should be many ways to do it, not one. The same goes for handing a Box to someone. The owner's reasoning: part of why this way of working has not spread is that it has never been smooth enough or obvious enough to be the easy path. If making a Box means stopping what you are doing, opening a separate tool and filling something in, it will lose to just doing the work yourself. A Box should be something you can make from the place the work shows up (an issue, a failing test, a line of code you are looking at, a review comment, a message, a command line) and hand over in whatever way suits the solver (a folder, a link, a call to an agent, a queue a person picks from). What we need from the lab is not a design. It is: where does bounded work actually show up (in an engineer's day and in an agent's run), which of those moments are the natural ones to make a Box, what the easiest hand-over looks like for each kind of solver, and what tools that did become normal ways of working (and ones that did not) teach about being the easy path.

**A third note, same day: this is about where software engineering is going, not only about engineers.** Do not read the notes above as being about human engineers handing work to other humans, with agents as a new kind of contractor. The owner's view is wider. Software engineering is changing, and agents are part of it on every side of a Box:

- **An agent as the solver.** Already what we test.
- **An agent as the one who makes the Box.** An agent working in a repository meets a piece of work it should not or cannot do itself (outside its skill, its permissions, its budget, or better done in parallel) and packages it.
- **An agent as the one who hands it over and takes it back.** An orchestrating agent splitting work among other agents, each of which gets only what it needs, and checking what returns.
- **People and agents mixed,** in any of those seats.

So "intuitive and convenient" has two meanings and the lab should hold both: effortless for a person, and natural for an agent to call as a step in its own work, with no person present. And "why has this way of working not taken hold" has two halves: why it did not among people, and whether the way agents are coming to work (many agents, bounded tasks, limited context, limited permissions) makes a bounded, portable, checkable unit of work more needed than it ever was among people. If the Box is the right unit for that future, say why and what it must be. If something else is already becoming that unit, say what, and whether a Box is the same thing, better, or beside the point.

**How we feel about it.** We believe in the idea and we are not attached to the current design. The building so far has produced a mechanism that works and a product we cannot yet describe to a stranger in a way that makes them want it. We would rather the lab take the time to get these answers right than have the kitchen build further on a guess. Tell us what is true, including when it is not what we hoped. The owner is not a research scientist and does not want to steer the method; the questions are ours, the way of answering them is yours.

## Standing direction: the lab leads

From the CTO, 7 October 2026, after talking the product through with the owner. This replaces every earlier standing direction on this page.

**What changed.** The owner and the CTO are not yet satisfied that the product idea is technically sound or clearly placed. Two worries: a Box is only worth having if it reliably contains what the solver needs, and nobody knows the answer in advance; and a product that just hands out issues is something the industry already has and does not use much. So the order is reversed. The lab goes first and the kitchen's product roadmap waits for it. Engineering is not the constraint; a correct idea and a clear direction are.

**The idea under test.** Do not try to predict the solution. Anchor the Box on one concrete example of the wanted behaviour that fails today: a reproduction for a bug, an example of intended use for a feature. Work back from where that example goes wrong to the code that can influence it. Any change that makes the example pass must touch code inside that region, so the region is knowable before anyone solves anything. The same example is the "done" check. If this holds, the product's two hard problems (what to ship, and what "done" means) are one problem with one input.

**What the product would be if it holds.** One task handed to an outside agent or other owner-chosen solver, without handing over the repository. The owner points at a task and confirms a draft; a Box goes out; a change comes back and is checked in the real repository. Not a marketplace, not a bounty board, not a way to find solvers. No round trips between owner and solver: a Box that needs a second message has failed. The owner has rejected one alternative design outright: starting from the whole repository and removing what the owner chooses to withhold. Do not build on it.

**The decision the lab is working towards.** Whether to build that MVP, reshape it, or stop. The CTO takes it to the owner when Lines A and B each have a first result a sceptic has attacked. No dates. Say early if a line is aimed wrong.

**Resources.** The owner is putting more into the lab. Lines A and B can run in separate sessions and do not wait for each other. Line C continues behind them. Line D (the evals) opened on 7 October 2026 and runs beside Line A. Cost stays at zero. The lab may prototype whatever it needs in its own folder; it does not need the kitchen to build anything first.

## Active lines, in priority order

### Line A. A slice anchored on an example

**The problem for the product.** If the Box misses something the solver needs, the solver fails, and asking for more is friction the owner will not accept. The owner wants a strong guarantee, or an honest statement of how strong it is.

**What the lab must find out.**

- **What the field already knows.** Program slicing from a criterion, static and dynamic; locating a fault from failing and passing runs; reducing a program while keeping a behaviour; what is known about soundness in typed languages and in loosely typed ones (dynamic dispatch, reflection, configuration and data files); and what is known about changes that add code as opposed to changing it. With sources. Say plainly where the CTO's statement of the idea above is wrong or already has a name.
- **How often it holds on real changes.** Replay merged changes that came with a test, across several projects and at least one typed and one loosely typed language. For each: take the test as the example, compute the region by each of several rules, and record two things: did the real change fall entirely inside, and what share of the repository is the region. Rules to compare at least: the files the failing example executes; those widened to what they import; everything reachable from where the example starts; the whole source folder as the generous baseline. Fix the rules and the sample before looking. The R3b cases and outside sample 1 are a start, not the sample.
- **Bugs and features apart.** A bug has a failing run to trace. A feature that extends something existing fails early, where the support is missing, so the executed path is too short and reach from the starting point is the candidate rule. A wholly new thing has no existing code that must change; the candidate rule is what its nearest existing sibling needs. Count each kind separately and do not pool them.
- **What is missed, and why.** For every change that falls outside a region: what was it (configuration, generated code, a helper elsewhere, a caller, a new file), and would the solver have been stuck or merely less elegant? Reading needs and editing needs are different; count them apart.
- **What the solver cannot see.** New code tends to reuse helpers outside the region. How often, and what is the cheapest thing to ship that prevents duplicates?

**The bar.** A statement the product could print on a Box: for this kind of task and this rule, the real change fell inside in N of M replayed cases, at this size. Where the tools give a real guarantee, say what it guarantees and what it assumes. A rule that only holds by shipping nearly everything has failed.

**Decision it informs.** Whether the MVP's `prepare` step is viable, which rule it uses, and what it may promise.

**Carried in from the old Line 3:** its survey was never done; this line's survey replaces it. The reading on what "the same failure" means between the repository and the slice belongs here.

### Line B. Where the product stands

**Stage (kept by the lab lead):** survey done and attacked by a sceptic, 7 October 2026 (Line B session 1); formulation next. Files in `lab/lines/where-it-stands/`.

**The problem for the product.** The owner does not want another issue board, bounty site or open-source task delegator, and does not want conversations with possible customers until the MVP is clear. So direction has to be worked out from what is public.

**What the lab must find out.**

- **Who already does something adjacent,** and exactly what: coding agents that work on a whole repository, in the cloud or on the owner's machine; tools that choose context for an agent; bounty and task marketplaces, and what is publicly known about why they stay small; contractor and outsourcing platforms; ways companies let outsiders work on code they will not share (clean rooms, restricted environments, on-premises agents, no-retention agreements). For each: what it does, what it does not do, and whether it would make a Box pointless.
- **The strongest argument against us.** If an owner can run a capable agent inside their own boundary, or trusts a vendor's promise not to keep their code, who still needs a Box? Find the cases that survive that argument, if any, and say how large they look from public evidence.
- **Where a small Box with a stated guarantee would matter** and where it would not: restricted code, specialised outside agents, cost and accuracy of agents on less context, auditability of what an outsider saw.
- **Two or three candidate directions** stated as one sentence each, with what each needs to be true and what public evidence there is. One recommendation.

- **The owner's questions, in the note at the top of this page, are this line's brief.** Questions 1 to 5 belong here. Answer each one by name in the result, with what the evidence supports, what it does not, and what remains unknown. Start with question 1: the history of attempts to hand out bounded software work (bounty platforms, crowdsourced development, micro-task programming, open-source "good first issue" programmes, outsourcing by ticket) and what the people who studied or ran them say stopped them. There is research literature on this as well as public post-mortems; use both.
- **The direction of software engineering, from the third note.** Survey how work is being divided among agents now: orchestrators and sub-agents, task hand-off between agents, how context and permissions are limited for each, what unit of work they pass, and how the result is checked. Research and public engineering write-ups both count; date everything, because this is moving fast. Say where a Box would fit in that picture, what it would have to offer that those arrangements lack (a stated guarantee of sufficiency, a check that travels, a record of what was disclosed), and whether agents making and passing Boxes to each other is a larger use than people doing so.
- **Question 7, the forms of making and handing over.** List the places bounded work shows up and the ways work is handed over today, by a person or by an agent, to a person or to an agent, with how much effort each takes. Include the forms an agent would use with no person present: a tool it calls, a step in its plan, a message to another agent. For developer tools that became a normal way of working, and for ones that stayed niche, say what the evidence shows about why: how many steps, whether it lived inside a tool people already had open, whether it needed anyone else's agreement to start. Give the kitchen a short ranked list of the entry points and hand-over forms an MVP should have first, with the reasoning. This also sets a requirement for Line A: whatever makes a Box must work from a small trigger (a pointer to a task) with little or no further input.
- **What changes with agents.** Several of the old obstacles are about people: pay per task, competition, job security, the cost of switching context. Say which obstacles disappear when the solver is an agent, which remain, and which new ones appear.

**The bar.** Sources for every claim about another product, dated, with what was actually read. No claim about what customers want without evidence; say "unknown" where it is. A sceptic argues the opposite direction before the result goes in the brief.

**Decision it informs.** What the MVP is for, and whether the direction above is the right one.

### Line C. From a request to an example

Formerly Line 1. It continues, behind A and B, with one change of emphasis: under the idea above, the thing the product needs from a request is one concrete example that fails today. Favour work that shows how often a real request already carries one, how cheaply one can be drafted and confirmed when it does not, and how often the drafted example is right. The planned step "turn the sample's reproductions into declared commands and run them" is exactly this and should go first on this line.

**Stage (kept by the lab lead):** survey and formulation done 6 October 2026; instrument in progress: labelling guide version 1 and outside sample 1 done 7 October 2026 (session 5); candidate-set harness not built. Files in `lab/lines/request-to-check/`; cross-line survey in `lab/survey.md`.

**The problem for the product.** Delegation is only worth it if saying what "done" means costs much less than doing the work. R1 showed it currently costs far more. The kitchen's R2 tries the engineering answer: let an agreement name tests that already exist. That covers changes to behaviour that is already tested. It does not cover the common case, where the request is for something new and no test exists yet.

**What the lab must find out.**

- What do real requests ask for, and how could each kind be checked: by an existing test, a new test, an example, a property, a judge, or only by the requester? Build this map from real requests (public issue trackers and this repository's own wave files are free), with counts. It tells the product what share of real work each kind of check would unlock.
- For requests with no existing test, what is the cheapest reliable way to get a check the owner trusts: the requester's own examples, tests generated from the request and confirmed by the requester, the recipient writing tests the owner reviews, or something the literature already recommends?
- How much does each route cost the requester, and how often does the resulting check accept a wrong solution or reject a right one?
- How well does each route hold up against a solver who is trying to pass without doing the work: special-casing the inputs a visible check uses, rewording instead of fixing, weakening or bypassing a check it can reach, or satisfying the letter of the request and not its intent? Honest mistakes and deliberate gaming are different threats, and once outside solvers are paid for accepted work the second one matters. Compare defences as well as routes: checks the solver never sees, checks the solver cannot change, more than one independent solution compared, and what the requester is shown to help them spot it.

**The bar.** Not automatic acceptance. The requester makes the final call; a check succeeds if it gives them evidence that makes that call easier and better, and says what it does and does not cover. A route that cannot decide an expectation by machine is still useful if it shows the requester exactly what to look at. Score routes on that as well as on wrong work accepted, right work rejected and requester cost.

**Decision it informs.** What the kitchen builds after R2, and what the MVP can honestly promise to verify.

**Sequence.** First. Whatever the survey shows that bears on R2 goes to the CTO before the kitchen writes the R2 brief, if the kitchen has not reached it yet; R2 does not wait for the lab. The map of real requests comes before any work on new ways of getting a check, because it decides which ways are worth studying.

### Line D. Does boxing give better results? (open, 7 October 2026)

Formerly Line 2, "Does a Box help?". Opened by the CTO after Line B's first result, at the owner's request and on the lab's own recommendation. It runs beside Line A and shares its tooling; it does not wait for Line A to finish.

**The problem for the product.** Line B found that the way of working that took hold gives an agent the whole repository and lets it search, and that the makers of these tools choose to share everything with helper agents. Their bet is that searching beats choosing. A Box is the opposite bet. If an agent on a Box does clearly worse, the idea is finished; if it does as well for less, or better, that is the first hard evidence the product has ever had. The owner's question, in their words: can we do evals, and does boxing generate better results on coding, and on other work?

**What the lab must find out.** Same agent, same task, same check, with only what the agent can see changed:

- **Whole repository.** The agent searches freely. This is the incumbent.
- **Box by a rule that can miss.** Whatever rule Line A has, starting with the simplest one that can be computed today (the files the failing example executes, widened to what they import). Do not wait for a better rule.
- **Generous Box.** The whole source folder.
- **Oracle Box.** The files the real change touched plus what they need. Nobody could ship this; it is the ceiling, and it separates "a Box cannot help" from "this rule is not good enough".

The boundary must be real: the agent runs where only that condition's files exist, not under an instruction to look nowhere else. R3b's solver was not isolated and its result cannot be used here.

**Measure, per run:** solved or not, by a check the agent was not shown as well as the one it was; tokens, tool calls and time; whether it failed for want of a file that was not in the Box, counted separately from failing for any other reason; and whether a passing answer is actually right, read by someone who is named. Keep every transcript.

**Tasks.** Real merged changes with a test, as in R3b's screening, from several projects, bugs and feature extensions counted apart. Prefer changes merged after the solver model's knowledge cut-off and say which are not. Fix the task list, the conditions and how many runs before the first run. Their code runs only in containers, with install scripts disabled, and nothing is sent to any project.

**"And on other work."** Coding first, because it is the one kind of work with a check that can decide. If the coding result is not negative, say what the same comparison would look like for one other kind of work a repository holds (documentation, configuration, data or analysis work) and whether it can be scored honestly. Do not run it before coding has a result.

**Constraint.** Zero cost and one model family limit the number of runs and the reach of the result. State the count. With few tasks only a large difference means anything; say how large a difference this design could see and treat anything smaller as "no difference shown". Repeat runs on the same task to learn how much one agent varies before reading anything into a gap.

**The bar.** A table the owner can read: for each condition, solved out of how many, the cost, and how many failures were a missing file. Then one plain sentence: on this evidence boxing helps, hurts, or makes no difference that this design could see. A sceptic reruns a sample and tries to explain any gap by something other than the Box.

**Decision it informs.** Whether there is a product at all, and if so whether its claim is "as good for less", "better", or only "less disclosed".

## Parked, with what would unpark them

These are real problems. They are not what stands between the product and its next decision, and working on them now would be research for its own sake.

- **A leaner stand-in that is checkably equivalent to the original.** This is step 4 of the slicing ladder in `PLAN.md` on master, so it is on the product roadmap, not abandoned. A stronger form of Line A: hand over a much smaller version of the code with a machine verdict that it behaves the same where it matters. It is next to Line A now: Line A's survey covers what the field says is achievable, and the experimental work unparks if Line A shows a region that is sound but too large to ship.
- **Judging outcomes no test can check** (a design, wording, how something feels). Unpark when Line C's map shows what share of real requests need it. If it is small, the product marks those as "the requester decides" and moves on.
- **Calibrated certainty and ranking of candidate solutions.** Unpark when the product has real accept and reject decisions to calibrate against, which needs users. Until then Line C records, for each kind of check, how often it is wrong; that is the raw material.

## First session

Done 6 October 2026; see `lab/survey.md`. The instruction as given:

Survey Line 1 properly: what the problem is called in the literature, who has worked on it, what is known to work and not to work, with sources. Skim Lines 2 and 3 only far enough to learn their names in the field and whether either is already answered. Write `lab/survey.md`, open `lab/lines/request-to-check/`, and put anything that bears on R2 in the brief straight away.

If the survey shows a line is aimed at the wrong problem, or that the order is wrong, say so in the brief with the reason. The CTO will change this page; do not work around it.

## Closed lines

None yet.

## Instruments the lab owns

- **Labelling guide, version 0** (`lab/lines/request-to-check/map/GUIDE.md`): sorts a requirement by the kind of check that could decide it. Known faults listed in `map/pilot/RESULT.md`; version 1 not written.
- **Pilot set** (`map/pilot/`): 79 "done when" clauses from this repository's own wave briefs, two labellers, agreement 78.5%. Tests the guide; it is not the map.
- **Outside sample** (`map/outside-sample/`): 5 open issues from one public project, as recorded by the kitchen in R3, one labeller. A first look only.
- **Candidate sets** (`experiments/01-r1-cheap-check/`, `experiments/02-existing-test-in-a-box/`): hand-made right and wrong solutions for one request, used to score a check. The runners in experiment 02 depend on the agreement format A1 removed and will not run as they are.
- **Not built:** a candidate-set harness for the neutral format. After accepted A3, drive the product's `export`/`verify` with declarations and consume A2 paired records; A0's loop is historical design input, not a lab execution fork.
- **Labelling guide, version 1** (`lab/lines/request-to-check/map/GUIDE.md`): five columns, including whether a request's text determined what its fix's tests assert. Followed almost identically by two same-family labellers; nine known faults, listed in `map/sample-1/RESULT.md`.
- **Outside sample 1** (`map/sample-1/`): 40 issues from four public repositories (5 open, 5 fixed each, by a rule committed before reading), 78 conditions, two labellers, a sceptic's re-derivation, and three known commander.js cases kept apart. Issue text, comments and test diffs are kept. Small and from hand-picked repositories; counts, not rates.
- **Line B survey** (`lab/lines/where-it-stands/`): the owner's questions answered by name from public sources, a source list tagged by how each was read, and a sceptic's re-reading of fifteen sources with 27 corrections applied. A survey, not a measurement; roughly half its numbers are search-summary leads. 7 October 2026.
- **Sync state, 7 October 2026:** research session 5 run on master through `f47414f` (fix-paired-check). Brief replaced at the end of that session. Programme rewritten by the CTO afterwards: the lab leads; Lines A, B, C.

- **Labelling guide for the map, version 0, with pilot.** `lab/lines/request-to-check/map/`. 79 bullets from 15 wave briefs, two blind labellers, kappa 0.71. Measures whether the guide can be followed, not yet what real requests need. Faults known; version 1 specified, untested.
- **Existing tests as Box guards (historical).** `lab/lines/request-to-check/experiments/02-existing-test-in-a-box/`. Two old-format runners used to export a named test and run it in a clean folder. Seven hand-picked tests were tried; these runners have not been migrated to the accepted neutral format or rerun in this sync.
- **R1 candidate set.** `lab/lines/request-to-check/experiments/01-r1-cheap-check/`. 13 wrong and 4 right versions of one script, with a runner that scores any check on them. One request, no held-out part.
