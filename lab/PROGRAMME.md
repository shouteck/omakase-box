# Research programme

Set by the CTO. Rewritten short on 9 October 2026 because the page had grown to 60 KB again and every session pays to read it. The full earlier text, with every gate's wording and the owner's notes as they were given, is `lab/archive/PROGRAMME-2026-10-08.md` (and `PROGRAMME-2026-10-07.md` before it). Read them only if a task here needs them.

No deadlines. The CTO decides which problem and in what order; the lab lead decides how. The owner is not a research scientist and is not asked to steer method. The kitchen is idle: no product work resumes until the owner has agreed what the Box is.

## What a Box is, and what it is not

**A Box tells a coding agent where the relevant code is, by shaping where it looks. It is not information handed to the agent to think about.**

| | A Box | Coverage data, traces and reports for agents |
|---|---|---|
| What the agent receives | Its ordinary search and navigation, with the relevant code first | Data to query or a report to read |
| What the agent has to do | Nothing it was not already doing | Decide to ask, know what to ask, read and interpret the answer |
| Load on the agent | None added | Added |
| If the agent ignores it | It cannot; it is in the path of what the agent already does | Then it does nothing |
| If it is wrong | The agent looks further; the whole repository stays open | The agent may reason from a wrong fact |

A coverage report, a trace or a test-impact map is raw material a Box may be made from, behind the tool, where the agent never sees it. Something that shows that material to the agent is a different thing. Sort other work into three kinds and say which: (1) a Box in this sense; (2) runtime information for agents; (3) better search for agents with no runtime evidence. Report "this already exists" only for the first kind.

**The owner's position, which the lab works within:** the Box is open and never confines; it is a plain program with no trained model; it is language-agnostic for the agent; it is used only where it earns its place; an open tool that only helps cannot make a capable agent worse, and even a small gain is worth having at scale. Scope for now is **the Box for a failing test**; widening to other cases is intended later.

## What is established

- **Making the Box (gates 1 and 1b).** From one failing test, about two seconds: every function that test ran, a median 4.7% of a large project's source, holding the real fix on 28 of 29 tasks. The error trace names the fix on 6 of 29. Removing what passing tests also ran throws the fix away two times in three.
- **What agents do without it (gates 2 and 3b).** Strong agents on well-known public projects reach the right function in two to four steps of about thirty-five, and their own searches already put the fix within a few results of the top; reordering by the Box moves it from about second to first. After finding the place they read hundreds of other functions before editing, about two fifths of all they read, mostly outside the Box; eight of nine failed runs had found the place.
- **Offering a tool (gate 3).** One that is only mentioned is not called. One that can return nothing costs real steps: fifteen empty or failed calls, 42% more tokens at the median, same tasks solved. No working Box has yet been used by a live agent.
- **What others have (reading, 8 October; authors' own numbers, not replicated).** Nothing inspected is a Box in the sense above. Runtime information for agents exists and raises tasks solved, usually at higher cost: ADI 55.0% to 63.8% at $1.02 to $1.28 a task; DAIRA 65.4% to 74.2% at $0.73 to $0.81; SWE-Doctor about two points over its baselines at about double the cost. Coverage connectors for agents exist in several languages (Wallaby, Coco, coverctl, Supercov). Ranked search for agents with no runtime evidence exists (Entire: mean cost down 8.2% on one repository). AutoCodeRover injects a runtime-derived list of suspicious methods as a hint. "Not found" in a bounded reading is not "does not exist".
- **Language-agnostic route.** Standard coverage reports plus a multi-language parser can supply "what ran" as covered regions in Python, JavaScript and Go, but a line hit is not always a function call (a definition line runs on import), order is never recorded, and child processes need configuration. Unknown or stale evidence must stay unmarked.

Detail: `lab/lines/box-trial/` (each gate's result and sceptic review) and `lab/lines/box-trial/ideal-box/`.

## The work now: a lab prototype of the Box, checked by script, and one design page

One session. No live agent. Few tokens: scripts and a summary file; the lab lead reads the summary, not the logs.

1. **Fix what gate 3b got wrong.** Identify a function by file and the line its definition starts on, never by name alone. Unknown, ambiguous or stale evidence gives no mark and no reordering.
2. **The Box itself (silent).** The ordinary search commands over the whole repository, returning every match an ordinary search returns, with matches inside what the failing test ran first and carrying the shortest unambiguous mark. Check by script on the thirty tasks and every recorded query: nothing an ordinary search returns is lost; the mark is right against the trace; where the fix lands, ordinary against Box.
3. **Its footprint, because the owner's case rests on small gains.** By script: what the tool adds to a run (any instruction text times steps, marks, answer length) beside what it is expected to save. Design for none: no instruction where the tool can be met without one. A part whose cost exceeds its expected saving stays out.
4. **Facts on request, kept separate.** "What ran in this file" and "how did the test get to the failure" are runtime information, not a Box; others report gains from that kind of tool, at higher cost. Prototype them only far enough to show a real answer on one task and their footprint. Whether they belong in the product is the owner's decision.
5. **One page for the owner, in plain language.** The Box as the agent meets it, shown on one real task. What it promises and what it does not. Its cost per run. Then, separately, facts on request, with what they would add and cost. Two or three choices that are the owner's, each as a plain question with the lab's recommendation.

One sceptic pass: rerun a sample of the script checks and attack the marks.

## After that, only on the owner's word: one fair live test

The owner's position is that the test shows how much the Box helps and proves it works when used; it is not there to decide whether to go on. Rules learned the hard way: one pilot pair first, then stop and read it; a token ceiling fixed in advance; tasks where the plain agent does not already solve everything (a cheaper model in both arms); if possible code the model has not memorised; the Box in the path of what the agent does, so it cannot be missed. "Better" is fixed beforehand: more solved with none lost, or the same for clearly fewer tokens and steps, beyond what repeating a task shows as noise.

## For later, not now

- **Beyond failing tests:** a reproduction script (nearly free), an error from a log, a named function or file, a change under review, a feature request. Most need a map, built once, of which test runs which code. How often each case arises is unknown. Keep the trace format independent of where the trace came from.
- **Sharper ordering inside the Box,** a small ranker trained on past fixes, and a rerunnable scoreboard for improving the Box by script.
- **A sealed Box** for an owner who needs a boundary.
- **Lines A, B, C and E** from 7 October are paused; their records are under `lab/lines/`.

## Standing rules

Zero cost. Few tokens. No trained model inside the Box. Third-party code only in containers, network off, install scripts disabled; nothing sent to any project. No conversations with possible customers. Not a marketplace or bounty board. One session, one piece of work; the owner sends `LAB.md` for each. Every result is attacked by a sceptic before it reaches the CTO.

- **Sync state, 9 October 2026:** prescribed prototype and owner design page complete, independently reviewed after mandatory multiline/path fixes. Thirty frozen task snapshots and all 243 retained native streams checked. Recommend silent ordering alone; optional facts stay separate. Navigation proxies do not establish repair or actual token savings. [Owner page](lines/box-trial/ideal-box/prototype/owner-design.md), [result](lines/box-trial/ideal-box/prototype/result.md), [review](lines/box-trial/ideal-box/prototype/sceptic-followup.md). Await owner design agreement and explicit request before a live pair; no next session or product work started.
