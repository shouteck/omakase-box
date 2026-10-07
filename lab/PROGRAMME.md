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

## Standing direction: the lab leads

From the CTO, 7 October 2026, after talking the product through with the owner. This replaces every earlier standing direction on this page.

**What changed.** The owner and the CTO are not yet satisfied that the product idea is technically sound or clearly placed. Two worries: a Box is only worth having if it reliably contains what the solver needs, and nobody knows the answer in advance; and a product that just hands out issues is something the industry already has and does not use much. So the order is reversed. The lab goes first and the kitchen's product roadmap waits for it. Engineering is not the constraint; a correct idea and a clear direction are.

**The idea under test.** Do not try to predict the solution. Anchor the Box on one concrete example of the wanted behaviour that fails today: a reproduction for a bug, an example of intended use for a feature. Work back from where that example goes wrong to the code that can influence it. Any change that makes the example pass must touch code inside that region, so the region is knowable before anyone solves anything. The same example is the "done" check. If this holds, the product's two hard problems (what to ship, and what "done" means) are one problem with one input.

**What the product would be if it holds.** One task handed to an outside agent or other owner-chosen solver, without handing over the repository. The owner points at a task and confirms a draft; a Box goes out; a change comes back and is checked in the real repository. Not a marketplace, not a bounty board, not a way to find solvers. No round trips between owner and solver: a Box that needs a second message has failed. The owner has rejected one alternative design outright: starting from the whole repository and removing what the owner chooses to withhold. Do not build on it.

**The decision the lab is working towards.** Whether to build that MVP, reshape it, or stop. The CTO takes it to the owner when Lines A and B each have a first result a sceptic has attacked. No dates. Say early if a line is aimed wrong.

**Resources.** The owner is putting more into the lab. Lines A and B can run in separate sessions and do not wait for each other. Line C continues behind them. Cost stays at zero. The lab may prototype whatever it needs in its own folder; it does not need the kitchen to build anything first.

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

**The problem for the product.** The owner does not want another issue board, bounty site or open-source task delegator, and does not want conversations with possible customers until the MVP is clear. So direction has to be worked out from what is public.

**What the lab must find out.**

- **Who already does something adjacent,** and exactly what: coding agents that work on a whole repository, in the cloud or on the owner's machine; tools that choose context for an agent; bounty and task marketplaces, and what is publicly known about why they stay small; contractor and outsourcing platforms; ways companies let outsiders work on code they will not share (clean rooms, restricted environments, on-premises agents, no-retention agreements). For each: what it does, what it does not do, and whether it would make a Box pointless.
- **The strongest argument against us.** If an owner can run a capable agent inside their own boundary, or trusts a vendor's promise not to keep their code, who still needs a Box? Find the cases that survive that argument, if any, and say how large they look from public evidence.
- **Where a small Box with a stated guarantee would matter** and where it would not: restricted code, specialised outside agents, cost and accuracy of agents on less context, auditability of what an outsider saw.
- **Two or three candidate directions** stated as one sentence each, with what each needs to be true and what public evidence there is. One recommendation.

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

### Does a Box help? (not open)

Formerly Line 2. Same agent, same task, same checks: the Box against the whole repository. It matters more under the new direction, because if an agent does clearly worse with a Box the product does not work. It opens when Line A has a rule worth testing; until then there is nothing to compare. Line B should report what is publicly known about agents working on reduced context.

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
- **Sync state, 7 October 2026:** research session 5 run on master through `f47414f` (fix-paired-check). Brief replaced at the end of that session. Programme rewritten by the CTO afterwards: the lab leads; Lines A, B, C.

- **Labelling guide for the map, version 0, with pilot.** `lab/lines/request-to-check/map/`. 79 bullets from 15 wave briefs, two blind labellers, kappa 0.71. Measures whether the guide can be followed, not yet what real requests need. Faults known; version 1 specified, untested.
- **Existing tests as Box guards (historical).** `lab/lines/request-to-check/experiments/02-existing-test-in-a-box/`. Two old-format runners used to export a named test and run it in a clean folder. Seven hand-picked tests were tried; these runners have not been migrated to the accepted neutral format or rerun in this sync.
- **R1 candidate set.** `lab/lines/request-to-check/experiments/01-r1-cheap-check/`. 13 wrong and 4 right versions of one script, with a runner that scores any check on them. One request, no held-out part.
