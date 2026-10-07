# Survey result: where the product stands

Line B, session 1, 7 October 2026. Sources, and how each was read, are in [related-work.md](related-work.md). This page answers the owner's questions by name. It is a survey: the lab measured nothing.

**This is the version after the sceptic.** A fresh agent re-opened fifteen sources, five in full, and argued the opposite direction: [sceptic-survey.md](sceptic-survey.md). It overturned four of the first draft's claims and weakened six. The largest changes: the draft said no source names disclosure of source as an obstacle (three do); it said the literature finds no gain from handing agents chosen code (it finds some); it recommended one direction (the evidence does not separate the directions and does not rule out stopping). What changed is listed at the end.

## The short version

1. Handing out bounded software work to outsiders has been tried in many forms and stayed small. Two case studies, each of one organisation, are consistent with the cause being the owner's own costs: writing the task down, transferring context, reviewing what returns. The lab has no source on cause for the other forms.
2. One form of bounded delegation did take hold, in the last two years and at very large scale: give an agent from a trusted vendor the whole repository and an issue, and review a pull request. It works by handing over everything and specifying almost nothing.
3. A Box does the reverse on both counts: it withholds source and asks for a check first. What it buys is less disclosure and a check that travels.
4. Whether disclosure ever stopped owners is not measured either way. Sources name it as a concern. Every study read is of owners who had already decided to hand work out.
5. Pieces of a Box exist: a partial, returnable view of a repository; a sandbox that mounts only some paths; deny lists inside the vendors' agents. Not found: anything that chooses the source per task from a failing example and sends it with that example as the check. The new part is the rule that chooses, which is Line A.
6. Public evidence does not say who wants this. It does not separate the candidate directions, and it does not rule out "a Box adds too little".

## Question 1. Why has this way of working not taken hold?

| Attempt | What happened | What a source says about why |
|---|---|---|
| Contest crowdsourcing | Exists, niche. One industry case: cost "much greater than originally expected" | That case: owner effort to prepare specifications and answer questions, time to review, quality found late; suits "less complex and stand-alone" tasks |
| Bounties on open-source issues | About $80,000 a year on average over five years for Bountysource bounties on GitHub issues; 43% of bounty issues paid, 54% of the money paid; a fifth of solved bounty issues were never claimed. The company later failed | Nothing on cause. The study is about which bounties succeed |
| Microtask programming | Works in the lab and in one company study; onboarding in minutes | The client must design the interfaces first; "decontextualizing programming work is hard"; some owners will not expose private interfaces |
| "Good first issue" | Common label; about half not solved by newcomers; newcomer merge rates falling since 2023 | Mismatch of issue and newcomer; maintainers' capacity |
| Offshoring by project | Large industry. One study of six projects at one firm: economic success varied widely | Client extra costs for specification, knowledge transfer, control and coordination, highest where the work needs client-specific knowledge |
| Security bug bounties | Took hold: tens of millions of dollars a year (a search-summary figure). Strained since 2025 by machine-written reports | No source read on why. The lab's conjecture is that a working exploit is its own proof. Others are as plausible: the finding is worth far more, no specification is needed, the work cannot be done in-house |
| Agents on the whole repository | Took hold, 2024 to 2026: 90% of surveyed developers use one weekly | Not studied as a cause. Observed shape: all context handed over, an issue as the only specification, a trusted vendor |

**What the evidence supports.** That it stayed small among people. That in two studied organisations the owner's cost of specifying, transferring knowledge and reviewing was larger than expected. That the form which spread is the one with the least preparation by the owner.

**The owner's four guesses.**

- *Reviewing a stranger's work costs more than doing it.* Consistent with the contest case study and with maintainers' accounts.
- *Switching context costs too much.* Consistent with the offshoring study, as the owner's cost to transfer knowledge.
- *Each task is worth too little.* Mixed. Bounties averaged about $75, but a fifth of solved ones were not even claimed, and the authors conclude money was not the driver there.
- *Solvers compete against everyone for no security.* Reported by studies of contest workers that the lab knows only from search summaries.

**What it does not support.** Any single cause across these six unlike things. Any claim about whether disclosure stopped owners.

**Unknown.** What the people who ran these platforms would say: two searches, no account found. Whether the contest case study's body discusses what the company was willing to expose: not read.

## Question 2. What is the friction, exactly, and which parts can a Box remove?

| Friction | Can a Box remove it? |
|---|---|
| Solver finding the relevant code | Yes, if the slice is right (Line A). Studies that hand an agent the right files find it does as well or better at a third of the cost, but all had the right files given by an oracle |
| Owner deciding what to share | Yes, if the rule decides and the owner only confirms |
| Knowing when the work is done | Partly. The check travels; even maintainers' tests accept some wrong work (`lab/survey.md`) |
| Does the result fit the rest | Partly, by verifying in the real repository |
| Writing down what is wanted | No. It moves it, and so far enlarges it: R1 needed about 470 lines of checks for an 8-line change. The incumbent asks for an issue and nothing more |
| Reviewing what the check cannot see | No |
| Trust, price, accountability | No |
| Exposure of source to the solver | Reduces it. Whether this friction binds is not measured |

A Box adds one friction the incumbent does not have: the needed file that was left out.

Read plainly: a Box removes frictions on the solver's side of the hand-off and adds to the owner's. The two case studies put the weight on the owner's side. So the idea works only if the example and the confirmation cost the owner almost nothing. This is the sentence the sceptic left standing, and it argues for caution as much as for the product.

## Question 3. What value would a Box add that existing options do not?

- **To someone who runs agents on their whole repository:** the solver receives only what the task needs by construction (an allow list made for the task, where today's tools offer deny lists for the session and a full copy for isolation), and the task carries its check. Whether they lack it in a way they feel: unknown. Vendors are adding path controls to their own agents, which suggests the need is real and also that it may be met inside the tools people already use.
- **To someone who uses contractors:** the outsider holds a slice instead of the repository. Heavier substitutes exist (locked remote workspaces, a filtered repository view). A 2010 industrial research proposal to partition tasks so as to protect confidential knowledge is not known to have become a product.
- **To an orchestrating agent:** a unit to hand a sub-agent that is smaller than the repository and carries a check fixed before the work. Inside one boundary the gains would be cost and focus. Thin evidence that the right slice does as well at a third of the tokens.

What a Box does not add: secrecy from the model vendor (most owners accept the vendor's contract; the rest have self-hosted options), or finding a solver.

## Question 4. How is software work really divided and handed over today?

- **Among people.** Issue in, pull request out, with the whole repository. Known from weak sources for contractors.
- **From people to agents.** Ordinary by 2026: about a third of surveyed developers generate most of their code through agents. Assign an issue or mention the agent; it gets the whole repository; a pull request returns and is accepted two times in three or more in public repositories that use agents. Developers in one study keep design to themselves and find agents weak at fitting into existing code; that study says its sample leans towards people who like these tools.
- **Among agents.** A written brief goes to a sub-agent with a fresh context and the same working directory. A summary or a diff comes back. Checking is by hooks, tests and a reviewer agent. The two best-known engineering accounts say: one writer plus helpers works; parallel writers do not yet; agents are "not yet great at coordinating and delegating"; managers that prescribe too much do worse; and the practical answer to "what context does a helper get" is "all of it". The agent-to-agent protocol defines a task and treats the other agent as opaque; the guide read has nothing on what source to send, how to check, or what was disclosed.
- **Where it is heading.** More agents per task and tighter per-task permissions inside the vendors' tools. Every account read names verification as the bottleneck. Dated October 2026.

**Is something else already becoming the unit?** Yes: issue plus repository in, pull request out; and brief in, summary out. Neither limits source or carries a check, and both are spreading without those. The nearest object to a Box is the benchmark task directory (instruction, environment, tests), which is hand-made.

## Question 5. How could more software work get done through this idea?

What would have to be true:

1. Making a Box costs the owner about what assigning an issue to an agent costs. That incumbent is one step.
2. A solver on a Box succeeds about as often as on the whole repository. Measured only with the right files given by an oracle and with the agent free to look elsewhere; never with a rule that can miss and a hard boundary.
3. The check is cheap and good enough that a returned Box is lighter to review than a pull request. Line C.
4. Either there is a solver the owner wants and will not give the repository to (unknown; no source opened shows private code going to third-party coding agents, and the observed response to a distrusted solver is not to use it), or the slice pays for itself in cost and accuracy inside one boundary (thin evidence for, and the tools' own makers share full context).

The first three can be measured by the lab at no cost. The first half of the fourth cannot be assessed without talking to owners.

## Question 7. The forms of making and handing over

**Where bounded work shows up today, and what handing it to an agent takes.** From vendor pages and search summaries.

| Place | Today's hand-over | Owner's steps today |
|---|---|---|
| Issue tracker | Assign to an agent like a teammate | One |
| Pull-request review comment | Mention the agent | One |
| Chat thread | Mention the agent | One |
| Error monitor | Automatic fix proposal | None |
| Failing test or CI run | Paste into an agent, or an agent watching CI | One or none |
| Dependency update | A bot opens a pull request | None |
| Command line or editor | Type the task to a local agent | One |
| Inside an agent's run | A tool call that starts a sub-agent | None |

The table gives the incumbent's steps. The number that matters, a Box's steps from each place, does not exist yet.

**What the evidence says about becoming the easy path.** Two sources about code-analysis tools at one company, known from search summaries: tools were adopted when they appeared inside something already open (code review), were right often enough to trust, and needed no separate visit. That is all the evidence there is.

**Candidates for an MVP, not ranked.** The evidence supports no ranking. If anything it points at the tracker and the review comment, because that is where the adopted tools lived.

- From an issue, given its link.
- From a review comment.
- From a failing test or command, which is already the example.
- A command or tool an agent can call. One caution the first draft missed: if the solver is one the owner would not give the repository to, an agent that packages source and sends it out with no person present is the leak pattern the security literature warns about. For that use a person confirms.

Hand-over forms, also unranked: a folder (built); a call to an agent that takes the folder and returns a patch; a link; a queue. The owner asked what is easiest for each kind of solver; this survey cannot say.

**Design target for Line A, not a finding:** making a Box from a pointer with at most one confirmation, because the incumbent takes one step.

## What changes with agents

The lab's reasoning, without sources of its own:

- **Change form more than they disappear:** pay per task becomes token cost; competition among solvers becomes many agents answering one open request; motivation becomes "satisfies the check and not the intent".
- **Plausibly gone:** job security, time zones, the solver's time to get started.
- **Remain:** the owner's cost to say what is wanted, to review, to integrate; trust; accountability.
- **Worse where submission is open to anyone:** review load. Shown for open-source maintainers and security programmes. It does not carry over to a Box sent to one chosen solver.
- **New:** injected instructions and leaks when an agent holds private code, reads untrusted text and can send data out; agents that do not ask when a task is vague.

## The strongest argument against us

*An owner can run a capable agent inside their own boundary or under a no-retention contract. Who still needs a Box?*

It holds for the general case, and the sceptic made it stronger: the form of delegation that works hands over everything and specifies nothing, and a Box reverses both to relieve a friction nobody has shown to bind. Substitutes for the disclosure half are older and simpler. The travelling check is unique only if it is cheap, and so far it has not been.

What survives is conditional:

- **Solvers that are not the trusted vendor.** Whether owners send private code to such solvers, or would if they could send less: unknown.
- **Limiting what a misled agent can leak.** A real engineering property. Vendors are building the deny-list version into their own tools.
- **Cost and focus inside one boundary.** Thin positive evidence; measurable by the lab.
- **Owners who may share with no one.** Cannot be assessed from public sources.

## Directions

1. **Least-privilege hand-off.** One task to a solver the owner would not give the repository to, with only the source it needs and a check that returns with it. *Needs* a customer nobody has observed, plus everything in 2.
2. **The unit orchestrators pass.** A Box as what an agent hands a sub-agent inside one boundary, for cost, focus and a check fixed in advance. *Needs* a slice chosen by a fallible rule to do about as well as the whole repository for less, and a check that costs little. Has a user that can be observed today and an experiment the lab can run. Risks: the tools' makers share full context by choice, and whatever helps inside a tool its vendor can absorb.
3. **Outsourcing for restricted code.** *Needs* owners who can share nothing to accept sharing a slice. Not assessable from public sources.
4. **Stop, or keep only the rule.** What is new is a rule for choosing files; that may be a feature of an agent harness and not a product. Nothing read refutes this.

**The lab's recommendation is about order, not about a winner.** The survey cannot choose among these. Directions 1 and 2 need the same three measurements (how large Line A's region is; whether a solver on a Box does as well as on the repository; what the example costs the owner), and those can be made at no cost with no customer. Direction 1 adds a fourth need that cannot be checked under the present rule against customer conversations. So: do not fix what the MVP is for yet; open the "Does a Box help?" comparison as soon as Line A has any rule to test, since it is the cheapest measurement that could end the idea or keep it; and treat direction 1 as the programme's working hypothesis, held on the owner's and CTO's judgement and not on this survey.

**What would settle it against a Box.** The region is most of the repository; or a solver on a Box does clearly worse; or the example's cost stays near R1's. Any one.

## What the sceptic changed

- Withdrawn: "no source names disclosure"; "security bounties are the exception that explains the rule"; "the literature finds no gain from chosen context"; "third-party solvers are real and growing"; the ranking of entry points; the recommendation of direction 1.
- Weakened: owner-side cost as the cause (two case studies, abstracts); "nobody offers this" (pieces exist; only the choosing rule was not found); "tools limit attention, not access" (deny-style path controls exist and are spreading); "review gets worse with agents" (only for open submission).
- Added: whole-repository agents as the form that did take hold; the conflict between an unattended agent entry and a less-trusted solver; "stop" as a direction.
- Corrected numbers: Bountysource shares and what they are shares of; the offshoring study's size; the microtask productivity conflict, which is unresolved.

## Limits

No paper read in full by the lead; five by the sceptic. Roughly half the numbers in the source list are search-summary leads. Vendor pages are claims. Every historical sample is of owners who had already chosen to hand work out. Lead and sceptic are the same model family; the sceptic's independence is a fresh context. Nothing about what customers want, by rule.
