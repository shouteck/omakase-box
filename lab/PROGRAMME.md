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

**Corrected by the CTO on 7 October 2026, after Line A's first session.** The sentence above, "any change that makes the example pass must touch code inside that region", was the CTO's and is too strong as written. The lab showed two ways it fails: a repair can consist only of adding a new file that the program discovers, touching no existing code; and a region can reproduce the failure exactly while lacking a helper the natural fix would use. Four different claims were run together and are now kept apart: the Box reproduces the failure; every repair touches the region; a good repair fits inside it; the solver has enough to do the work. Each needs its own evidence. What remains under test is the narrower, empirical statement: for a named kind of task and a fixed rule, how often did the real change fit, at what size, and did a solver succeed. No promise of "nothing missing" is to be made from the idea alone. The owner was told the strong version; the CTO has told them it does not hold.

**What the product would be if it holds.** One task handed to an outside agent or other owner-chosen solver, without handing over the repository. The owner points at a task and confirms a draft; a Box goes out; a change comes back and is checked in the real repository. Not a marketplace, not a bounty board, not a way to find solvers. No round trips between owner and solver: a Box that needs a second message has failed. The owner has rejected one alternative design outright: starting from the whole repository and removing what the owner chooses to withhold. Do not build on it.

**The decision the lab is working towards.** Whether to build that MVP, reshape it, or stop. The CTO takes it to the owner when Lines A and B each have a first result a sceptic has attacked. No dates. Say early if a line is aimed wrong.

**Resources.** The owner is putting more into the lab. Lines A and B can run in separate sessions and do not wait for each other. Line C continues behind them. Line D (the evals) opened on 7 October 2026 and runs beside Line A. **From 8 October 2026 the Box trial at the top of Line D is the first priority; Line E continues after it.** Cost stays at zero. The lab may prototype whatever it needs in its own folder; it does not need the kitchen to build anything first.

## Active lines, in priority order

### Line A. A slice anchored on an example

**Stage (kept by the lab lead):** instrument, session 4, 7 October 2026. The runtime instrument exists and ran two development cases (Click 3208, Ky 823) in bounded containers, reviewed by two fresh sceptics. On both, executed files are more than half the source root and every wider rule is the whole root; no small package. Zod has no adapter, images and allowlists are not frozen, confirmation content stays closed and the replay has not run. Protocol and 60 candidate IDs remain frozen, with itsdangerous empty; the four-project positive screen cannot pass. Files in `lab/lines/example-slice/`; start at `instrument-session-4.md`.

**The problem for the product.** If the Box misses something the solver needs, the solver fails, and asking for more is friction the owner will not accept. The owner wants a strong guarantee, or an honest statement of how strong it is.

**What the lab must find out.**

- **What the field already knows.** Program slicing from a criterion, static and dynamic; locating a fault from failing and passing runs; reducing a program while keeping a behaviour; what is known about soundness in typed languages and in loosely typed ones (dynamic dispatch, reflection, configuration and data files); and what is known about changes that add code as opposed to changing it. With sources. Say plainly where the CTO's statement of the idea above is wrong or already has a name.
- **How often it holds on real changes.** Replay merged changes that came with a test, across several projects and at least one typed and one loosely typed language. For each: take the test as the example, compute the region by each of several rules, and record two things: did the real change fall entirely inside, and what share of the repository is the region. Rules to compare at least: the files the failing example executes; those widened to what they import; everything reachable from where the example starts; the whole source folder as the generous baseline. Fix the rules and the sample before looking. The R3b cases and outside sample 1 are a start, not the sample.
- **Bugs and features apart.** A bug has a failing run to trace. A feature that extends something existing fails early, where the support is missing, so the executed path is too short and reach from the starting point is the candidate rule. A wholly new thing has no existing code that must change; the candidate rule is what its nearest existing sibling needs. Count each kind separately and do not pool them.
- **What is missed, and why.** For every change that falls outside a region: what was it (configuration, generated code, a helper elsewhere, a caller, a new file), and would the solver have been stuck or merely less elegant? Reading needs and editing needs are different; count them apart.
- **What the solver cannot see.** New code tends to reuse helpers outside the region. How often, and what is the cheapest thing to ship that prevents duplicates?

**The bar.** A statement the product could print on a Box: for this kind of task and this rule, the real change fell inside in N of M replayed cases, at this size. Where the tools give a real guarantee, say what it guarantees and what it assumes. A rule that only holds by shipping nearly everything has failed.

**After session 1 (7 October 2026): the lab's recommendation is adopted.** Next on this line: formulate and freeze the replay before looking at any fix. Task sampling across several projects with TypeScript and Python at least; the rules to compare; the size threshold that would count as "useful and small"; and separate scores for the four claims (failure reproduced, existing edits contained, new files permitted, reading and reuse needs). A missing file is classed as essential, replaceable, or unknown, with the reason. Then run it. Line D may use the first fixed execution-and-import rule without waiting.

**CTO's decision after session 4 (7 October 2026).** The lab's recommendation is adopted: A-replay-1 stops at development and is recorded as uninformative on size. On two small single-package libraries no file-level rule gave a small package; the only rule that shipped less than the whole source root shipped more than half and did not always load. That is a result about small cohesive libraries, and the product question is about large repositories. So:

- **Write a version 2 cohort before any more adapter work:** larger and multi-package repositories, in TypeScript and Python, chosen by a rule committed first. Keep it small enough to finish; a handful of repositories and a fixed number of cases each.
- **Add one baseline the first protocol did not have: the package the test lives in, plus the packages it depends on, as the repository's own manifests or build tool already state them.** That costs nothing to compute and exists today. A rule of ours has to beat it to be worth building. Report every rule's size against that baseline as well as against the whole repository.
- **The stop rule for the file-level idea, fixed now:** if on the version 2 cohort our rules give a package no smaller than that baseline in most cases, the lab says so plainly and Line A closes at file level. A finer grain (functions and statements, or stand-ins for type-only imports) is the only other place a small Box could come from; it is the parked research item, and the owner has said they do not want the product to rest on research. Do not start on it; say what it would take and stop.
- **Keep what worked:** the instrument runs third-party code sealed, captures what a failing test executes in two languages, and a package that loads reproduced the failure in 90 of 96 observations. That is reusable whatever the size result.
- **Line D does not start on Click and Ky.** There the package equals the source root, so a token comparison would measure "source without tests and documents" and not slicing. Line D waits for a version 2 case where the rule's package is clearly smaller than the baseline; if there is none, Line D does not run.

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

**The owner's decision, 8 October 2026: the Box gets one real trial. This is now the lab's first priority, ahead of Line E, and it replaces the order of work written further down this section.** The owner has not given up on Boxes. Their reasoning: people who run agents seriously already make a "box" by prompt, so the job is real; the frontier labs let agents search because that is simpler, not because it was shown to be best; so if a Box made by a program is lightweight and improves results on a benchmark people recognise, it is worth building. The CTO puts the odds at about one in five and agrees the trial is worth its cost, because it settles the question either way.

**The claim, stated so it can fail:** *given a failing test, a Box computed by a program lets the same agent fix the problem at least as often, for clearly fewer tokens and less time, than the same agent with the failing test and the whole repository.*

**The trial. One experiment that does the work of Line A's version 2 cohort and Line D together.**

- **Tasks from a public benchmark people recognise,** so the result needs no explaining: a fixed subset of SWE-bench Verified or a current equivalent, whose repositories are large (the size question Click and Ky could not answer) and whose environments are already built. Choose the subset by a rule committed first. Start small enough to finish on this machine, one container at a time: about twenty to thirty tasks.
- **Both arms get the failing test.** This is the honest setting for a Box anchored on an example, and it is a real one: a red build, a regression, a bug report that comes with a reproduction. Say plainly that it is not the benchmark's standard setting, where the test is hidden, and that the result does not transfer to tasks with no failing test.
- **Arms, same agent, same limits:** (1) whole repository plus the failing test; (2) whole repository plus the failing test plus a note listing the Box's files; (3) the sealed Box. The oracle Box as the ceiling if runs allow.
- **The Box is whatever the existing instrument computes today** (executed files plus imports), with one addition the CTO asks the lab to try because file level looked too coarse: the same rule at function level for display only, meaning the Box still ships whole files so it runs, but its note tells the agent which functions the failing test ran through. That costs no research and may be where "lightweight" comes from.
- **Measure:** solved by the benchmark's own tests; total tokens and wall time including making the Box; Box size against the whole repository and against the free baseline (the test's own package and its dependencies); failures for want of a missing file, counted apart.
- **Repeat runs** on a few tasks first to learn how much one agent varies; say how big a difference this design can see.

**What counts, fixed now.** Worth building: the sealed Box or the hinted repository solves at least as many as the whole repository and uses no more than half the tokens. Not worth building: anything less, or a Box that is no smaller than the free baseline in most tasks. If the hint does as well as the seal, the product is the program that computes the Box, offered as a tool an agent calls, and sealing is optional. A sceptic reruns a sample before the result is reported. Whatever the outcome, this is the last trial of the file-level Box; the owner and CTO decide from it.

Formerly Line 2, "Does a Box help?". Opened by the CTO after Line B's first result, at the owner's request and on the lab's own recommendation. It runs beside Line A and shares its tooling; it does not wait for Line A to finish.

**The problem for the product.** Line B found that the way of working that took hold gives an agent the whole repository and lets it search, and that the makers of these tools choose to share everything with helper agents. Their bet is that searching beats choosing. A Box is the opposite bet. If an agent on a Box does clearly worse, the idea is finished; if it does as well for less, or better, that is the first hard evidence the product has ever had. The owner's question, in their words: can we do evals, and does boxing generate better results on coding, and on other work?

**What the lab must find out.** Same agent, same task, same check, with only what the agent can see changed:

- **Whole repository.** The agent searches freely. This is the incumbent.
- **Box by a rule that can miss.** Whatever rule Line A has, starting with the simplest one that can be computed today (the files the failing example executes, widened to what they import). Do not wait for a better rule.
- **Generous Box.** The whole source folder.
- **Whole repository with a hint.** Everything, plus a note listing the files the rule picked. Added by the CTO on 7 October 2026. This is how the industry already helps agents: point, do not seal. Without it a win for the Box could be the pointing and not the sealing. If the hinted repository does as well as the sealed Box, boxing adds nothing to results and the product's value rests on the boundary alone, or on the rule as a feature of someone else's tool. If the sealed Box does better than the hint, that is new.
- **A published neighbour, if it can be run at no cost.** Line A found that Trail of Bits documents bounded source packets handed to helper agents, chosen from a code graph. If that tool can produce a packet for these tasks, include it as a condition; if it cannot (it excludes direct edits and exploration-heavy work), say so and why.
- **Oracle Box.** The files the real change touched plus what they need. Nobody could ship this; it is the ceiling, and it separates "a Box cannot help" from "this rule is not good enough".

**The owner's shortcut, 7 October 2026: boxing as a skill.** The owner asked whether we can skip building anything: write the idea of a Box as a skill file (plain instructions an agent loads, the `SKILL.md` kind), give it to an agent, and run the evals on that. Yes, and it is the cheapest direct test of "a unit of work agents pass to each other", so it goes first on this line. It also makes Line D independent of Line A's tracing tool, because the agent chooses the files.

- **Write the skill.** One short file telling an agent how to hand work to a helper as a Box: state the task and one example that fails today, choose the files the helper needs, say which may be edited, name the check, and take back a change and run the check. Keep it short enough that an agent follows it. Write it before any run and do not tune it on the eval tasks; if it is revised, keep every version and score them apart.
- **Conditions that use it,** added to those above: (a) an agent delegating to a helper the ordinary way, with a brief and the whole repository; (b) the same agent with the skill, the helper still able to see everything (the Box as a brief); (c) the same agent with the skill, the helper sealed in a folder holding only what the first agent chose (the Box as a boundary). The existing `export` may be used to build that folder; nothing new is built for it.
- **The owner's objection, same day, and it is right:** condition (b) is not new. Writing a helper a brief with a tight scope, the files that matter, do-not-touch fences and a verification contract is established practice: pstack says "the brief is the product: a worker cannot ask you a question", this kitchen's own wave briefs do it, and other harnesses and prompt guides do the same. So treat (b) as **the best existing practice and the real baseline**, written the way pstack would write it, not as our idea. The only arm that is ours is (c), and what it adds over (b) is exactly three things: the helper cannot see anything else; the folder was shown to run and fail the right way before it left; and it can leave the repository. Report (c) against (b) first. If (c) is not better than (b) on results, say plainly that a Box is not a way to get better work out of agents, and that anything left of the idea rests on the boundary being wanted for its own sake.
- **The owner's sharper claim, later the same day, and the one this line should test first.** A Box made by prompting is an agent reading around the repository to decide what a helper needs, and then the helper reading around again. That spends tokens on something a tool could compute. An **algorithmic Box**, made by a program from the code itself (what a failing test runs through, what those files import) and not by a model's judgement, should cost far less for the same result. Stated so it can fail: *on bounded coding tasks, a tool-made Box gets the same success as a pstack-style brief with the whole repository, for clearly fewer total tokens.* The primary measure for this claim is total tokens and time across every agent involved, at equal success; success alone is the guard, not the goal. Count the tool's own run time as cost. Run this comparison before the skill arms: baseline (b), the tool-made Box sealed, and the oracle Box as the ceiling. The existing evidence is in its favour as far as it goes (right files at about a third of the tokens, with an oracle), and the tool is what Line A's replay is already building, so the two lines now feed each other directly: Line A says how often the tool's Box contains the real change and how big it is; Line D says what that is worth in tokens and success.
- **What it adds to the measures:** what the first agent chose against what the real change needed; whether it wrote a usable failing example unaided and what that cost in tokens and steps; how often the helper was stuck for a missing file; and the total cost of both agents, not the helper's alone, since making the Box is not free.
- **Read the result with its limit:** a skill is instructions, so a result here is about this wording and this model. A bad result may mean a bad skill; say what was tried. A good result with a file anyone can copy says the idea works and says nothing about whether it is a product.

The boundary must be real: the agent runs where only that condition's files exist, not under an instruction to look nowhere else. R3b's solver was not isolated and its result cannot be used here.

**Measure, per run:** solved or not, by a check the agent was not shown as well as the one it was; tokens, tool calls and time; whether it failed for want of a file that was not in the Box, counted separately from failing for any other reason; and whether a passing answer is actually right, read by someone who is named. Keep every transcript.

**Tasks.** Real merged changes with a test, as in R3b's screening, from several projects, bugs and feature extensions counted apart. Prefer changes merged after the solver model's knowledge cut-off and say which are not. Fix the task list, the conditions and how many runs before the first run. Their code runs only in containers, with install scripts disabled, and nothing is sent to any project.

**"And on other work."** Coding first, because it is the one kind of work with a check that can decide. If the coding result is not negative, say what the same comparison would look like for one other kind of work a repository holds (documentation, configuration, data or analysis work) and whether it can be scored honestly. Do not run it before coding has a result.

**Constraint.** Zero cost and one model family limit the number of runs and the reach of the result. State the count. With few tasks only a large difference means anything; say how large a difference this design could see and treat anything smaller as "no difference shown". Repeat runs on the same task to learn how much one agent varies before reading anything into a gap.

**The bar.** A table the owner can read: for each condition, solved out of how many, the cost, and how many failures were a missing file. Then one plain sentence: on this evidence boxing helps, hurts, or makes no difference that this design could see. A sceptic reruns a sample and tries to explain any gap by something other than the Box.

**Decision it informs.** Whether there is a product at all, and if so whether its claim is "as good for less", "better", or only "less disclosed".

### Line E. A product out of research that nobody has built yet (open, 7 October 2026)

Opened by the CTO at the owner's request. It does not depend on the Box and may outlive it.

**Stage (kept by the lab lead):** session 1 done and attacked by a sceptic, 7 October 2026. It searched the layer next to the model, before the redirection below was read: 26 areas between lead and sceptic, none survive, one near miss (a transaction and undo layer under agent actions). The redirected area has not been searched. Files in `lab/lines/unbuilt-research/`.

**The owner's reasoning.** After a day of testing the Box idea from several sides, the owner's view is that a product in the agent space that earns revenue without many competitors probably has to come out of research results that have not been turned into products yet. The owner is not a research scientist and wants to bring something to market, so the research has to be already done by someone else: the lab's job is to find it, not to do it.

**What the lab must find.** Published results from roughly the last eighteen months, in or next to the agent space, where a paper reports something that works, building it is engineering, and no product does it yet. Three candidates, each with the strongest argument against it.

**The owner's filter. A candidate must pass all of these; say which it fails if it fails:**

1. No machine has to decide whether software is correct. (Every Box-shaped idea failed here or leaned on it.)
2. Nothing rests on an unsolved research problem. The paper's result must already be good enough to use.
3. It is real software, not a prompt or a skill file.
4. It is not already standard practice, and not something an agent vendor adds in an afternoon.
5. It is not a marketplace or a bounty board.
6. The owner can tell whether it is good without being a researcher: a number, or something visible.
7. The market has not found it: no funded product, no popular open-source tool doing the same.
8. Someone would plausibly pay, and the lab can say who, from public evidence.

**What the CTO's first look found (7 October 2026, about ten searches, abstracts only; leads, not findings).**

- *Token waste is real and measured, and the market has already found it.* Reading is reported at about three quarters of a coding agent's tokens in one study and about half in another; one paper cuts total cost by a fifth to a third by pruning the running history, another reports up to 60% fewer tokens with a trained exploration helper (that paper was withdrawn for "product IP issues", which suggests a vendor is shipping it). Several open-source proxies and at least one launched product already compress agent context. Fails filter 7.
- *Finding which agent and which step caused a failed run* is an active research topic with accuracy reported between 15% and 46%. Fails filter 2.
- *Scanning agent skills and tool servers for malicious content*: large audits exist and a security vendor already does it. Fails filter 7.
- *Building evaluation tasks automatically from a repository*: published in 2025 by a group connected to a startup; newer benchmarks exist. Probably fails filter 7; not checked.
- *Security enforced outside the model by fixed rules* (the CaMeL line of work: a deterministic layer that controls what an agent may do with untrusted content): the research has converged on a design with real guarantees and a reference implementation is public. Passes filters 1 to 3 on its face. Whether products already exist was not established, and the buyer is an enterprise security team. Worth a proper look.
- *A pattern to test:* in this area the gap between a paper and a product looks like months, and many of the papers come from the vendors themselves. If that holds, the candidates worth having are results a vendor has less reason to build: ones that work across vendors, ones that constrain the agent instead of selling more of it, and ones outside coding.

**The owner's redirection, later on 7 October 2026. This changes where the lab looks, and it overrides the first look above.** The owner's words, closely: we may be heading into the wrong direction and area; we cannot look where the frontier labs are working; we need to be in a different layer, where the model is not the moat. The CTO agrees. Everything examined today (context for agents, delegation between agents, token cost, agent security, evaluation) sits directly on top of the model, and each time the answer was "a model maker or agent vendor does this, or will". So:

9. **The model is not the moat.** Add this to the filter and treat it as the first test, not the last. A candidate passes only if a better model next year makes the product more valuable or leaves it untouched, and never makes it unnecessary. Ask of every candidate: if the frontier labs shipped a model twice as good tomorrow, would this still be needed, and would they have any reason to build it themselves?

Where the advantage would have to come from instead, as starting points and not a list to fill: access to data or systems the model makers do not have; being inside a specific trade's daily work and its records; taking on trust, compliance or liability that a model maker will not; integration across many vendors or many small systems that no one vendor cares about; things that touch the physical world or a regulated process; a network of users whose value grows with its size.

This widens the search well beyond coding and developer tools, and the lab should leave that area unless a candidate there clearly passes test 9. "A product out of research nobody has built yet" still stands as the owner's hypothesis, but the research may now come from any field where agents or models make something newly possible, not only from papers about agents. The lab does not know what trades or systems the owner has knowledge of or access to; the CTO has asked, and will add the answer here. Until then, prefer candidates that need no special access to start.

**Method is the lab's.** Search widely before narrowing; the owner has not said it must be about coding. For each candidate open the paper itself and at least the three nearest products, dated. A sceptic tries to find the existing product the lead missed, which is the most likely way a candidate dies.

**The bar.** Three candidates on one page, each with: what the paper showed, what would have to be built, who would pay and the evidence, what already exists, and which of the eight filters is weakest. If fewer than three survive, say how many did and stop; "none" is an acceptable answer.

**Decision it informs.** What the owner builds next.

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
