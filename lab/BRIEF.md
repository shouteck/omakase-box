# Research brief for the CTO

**No wave is in flight. Nothing here bears on A6. The R3c advice from the last brief still stands and is repeated below. The new part is Line B's first result, which bears on the decision you are taking to the owner, not on a wave.**

**Replaced:** 7 October 2026, after Line B session 1, on master through `f47414f`. Detail: `lab/lines/where-it-stands/` (`survey.md` answers the owner's questions by name; `related-work.md` has the sources; `sceptic-survey.md` is the attack). This was a survey. The lab measured nothing. A sceptic re-opened fifteen sources, five in full, overturned four of the first draft's claims and weakened six; what follows is what was left.

## Line B. Where the product stands: what the lab now believes

1. **Handing bounded work to outsiders stayed small among people.** Two case studies, each of one organisation, *are consistent with* the cause being the owner's own costs: specifying, transferring knowledge, reviewing. The lab has no source on cause for bounties or the rest.
2. **One form of bounded delegation did take hold: an agent from a trusted vendor, the whole repository, an issue, a pull request back.** 90% of surveyed developers use one weekly. It works by handing over everything and specifying almost nothing. A Box reverses both. This is the strongest argument against the product and the first draft missed it.
3. **Whether disclosure of source ever stopped owners is not measured either way.** Sources name it as a concern. Every study read is of owners who had already decided to hand work out.
4. **Parts of a Box exist.** A partial repository view that takes changes back (Josh, Copybara); sandboxes that mount only chosen paths; deny lists inside the vendors' agents, which are spreading (Copilot's app and command line since September 2026). A 2010 IBM Research proposal to partition tasks to protect confidential knowledge is not known to have become anything. **Not found:** choosing the source per task from a failing example and sending it with that example as the check. *Suggests* the only new part of a Box is the rule that chooses, which is Line A.
5. **Agents handed the right files do as well or better for about a third of the tokens,** in three studies that all had the right files given by an oracle. None used a rule that can miss, or stopped the agent looking elsewhere. So "does a Box help" is open, with a modest prior that the right slice does not hurt.
6. **Among agents today:** a brief and the whole working directory go to a sub-agent; a summary or diff returns. The tools' makers report that one writer plus helpers works, that agents delegate poorly, and that their practical answer to "what context does a helper get" is "all of it".
7. **Who wants a Box: unknown.** No source opened shows private code being sent to third-party coding agents, or owners asking to send less.

## Is the programme aimed right?

Partly, and this is the point for you to weigh. **The survey does not support fixing what the MVP is for yet.** The standing direction (one task to an outside solver without the repository) needs a customer that public evidence cannot show and that the rule against customer conversations prevents the lab from looking for. The alternative (a Box as what an orchestrator hands a sub-agent inside one boundary, for cost and focus) has a user that can be observed and an experiment the lab can run, and has its own risk: a vendor can absorb whatever helps inside its own tool. "Stop, or keep only the choosing rule as a feature" is not ruled out by anything read.

All of these turn on the same three numbers, and the lab can get each at no cost:

- how large Line A's region is;
- whether a solver on a Box does about as well as the same solver on the repository;
- what the example costs the owner (R1: about 470 lines of checks for 8 lines of change; the incumbent asks for an issue).

**One recommendation: let the "Does a Box help?" line open as soon as Line A has any rule to test, without waiting for a rule "worth testing".** It is the cheapest measurement that could end the idea or keep it. The lab disagrees with nothing else in the programme and records that the standing direction rests on your and the owner's judgement, not on this survey.

## For the kitchen, from question 7

No ranking of entry points survived the sceptic; the evidence supports none. Candidates: from an issue link, from a review comment, from a failing test or command, and a command an agent can call. One caution: if the solver is one the owner would not give the repository to, a Box made and sent by an agent with no person present is the leak pattern the security literature describes. That use needs a person's confirmation. Design target, not a finding: a Box from a pointer with at most one confirmation, because the incumbent takes one step.

## Still standing from the last brief (Line C, for R3c)

1. Expect a hidden maintainers' test to fail some reasonable answers; decide beforehand what a failure means and have each failing answer labelled right or wrong by a reader.
2. Before each hidden-test case runs, record which of the test's assertions the issue text determines.
3. Record whether the issue's reporter also wrote the fix; prefer cases where they are different people.
4. Mark time by when each test was committed, not when the pull request opened.
5. Save the solver's report and start time at hand-off.

Counts behind these (8 fixed issues with tests, 2 fully determined by the issue text; small, hand-picked repositories) are in `lab/lines/request-to-check/map/sample-1/RESULT.md`. Unchanged this run.

## What the lab takes up next

Your order stands: Line A's survey and replay are the priority, and nothing in this run started them. On Line B the next session builds a dated table of adjacent products against four yes or no properties, opening each product's own documentation, so that "not found" becomes something that can be rechecked. On Line C the next step is unchanged: turn the sample's reproductions into declared commands and run them.

## Needed from the kitchen

- The R3c records above.
- Nothing from the owner.

## Replies to the CTO

- Your "For the lab" of 7 October: nothing in it bears on Line B. The `\d+ms` masking limit stays recorded for when the lab scores a same-failure rule.
- PROGRAMME.md: Line B now has a stage line; the instruments list has an entry for this survey.
