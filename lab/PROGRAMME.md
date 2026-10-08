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
- **Offering a tool (gate 3).** One that is only mentioned is not called. One that can return nothing costs real steps: fifteen empty or failed calls, 42% more tokens at the median, same tasks solved. This describes the historical explicit-tool trial. The separately authorized silent pilot below delivered one reordered search to a live agent, followed by an explicit open, with both repairs failing.
- **What others have (reading, 8 October; authors' own numbers, not replicated).** Nothing inspected is a Box in the sense above. Runtime information for agents exists and raises tasks solved, usually at higher cost: ADI 55.0% to 63.8% at $1.02 to $1.28 a task; DAIRA 65.4% to 74.2% at $0.73 to $0.81; SWE-Doctor about two points over its baselines at about double the cost. Coverage connectors for agents exist in several languages (Wallaby, Coco, coverctl, Supercov). Ranked search for agents with no runtime evidence exists (Entire: mean cost down 8.2% on one repository). AutoCodeRover injects a runtime-derived list of suspicious methods as a hint. "Not found" in a bounded reading is not "does not exist".
- **Language-agnostic route.** Standard coverage reports plus a multi-language parser can supply "what ran" as covered regions in Python, JavaScript and Go, but a line hit is not always a function call (a definition line runs on import), order is never recorded, and child processes need configuration. Unknown or stale evidence must stay unmarked.

Detail: `lab/lines/box-trial/` (each gate's result and sceptic review) and `lab/lines/box-trial/ideal-box/`.

## Done on 9 October 2026 (kept for the record): a lab prototype of the Box, checked by script, and one design page

One session. No live agent. Few tokens: scripts and a summary file; the lab lead reads the summary, not the logs.

1. **Fix what gate 3b got wrong.** Identify a function by file and the line its definition starts on, never by name alone. Unknown, ambiguous or stale evidence gives no mark and no reordering.
2. **The Box itself (silent).** The ordinary search commands over the whole repository, returning every match an ordinary search returns, with matches inside what the failing test ran first and carrying the shortest unambiguous mark. Check by script on the thirty tasks and every recorded query: nothing an ordinary search returns is lost; the mark is right against the trace; where the fix lands, ordinary against Box.
3. **Its footprint, because the owner's case rests on small gains.** By script: what the tool adds to a run (any instruction text times steps, marks, answer length) beside what it is expected to save. Design for none: no instruction where the tool can be met without one. A part whose cost exceeds its expected saving stays out.
4. **Facts on request, kept separate.** "What ran in this file" and "how did the test get to the failure" are runtime information, not a Box; others report gains from that kind of tool, at higher cost. Prototype them only far enough to show a real answer on one task and their footprint. Whether they belong in the product is the owner's decision.
5. **One page for the owner, in plain language.** The Box as the agent meets it, shown on one real task. What it promises and what it does not. Its cost per run. Then, separately, facts on request, with what they would add and cost. Two or three choices that are the owner's, each as a plain question with the lab's recommendation.

One sceptic pass: rerun a sample of the script checks and attack the marks.

## Completed on 9 October 2026: the live pilot (authorization and protocol retained below)

The prototype session is done and reviewed (`lab/lines/box-trial/ideal-box/prototype/`). The owner has read the design and wants a live run, because nothing so far shows an agent doing better and only a live run can. What is tested is **the Box as the lab recommended it: silent ordering of ordinary search, no instruction, no marks.** Facts on request are not part of this run.

**What went wrong in gate 3, and the safeguard for each. Every safeguard is a step that must be passed and recorded before the next one starts.**

| Gate 3's mistake | Safeguard this time |
|---|---|
| The tool returned nothing on all fifteen calls, and nobody knew until twenty-four runs were done | The Box is the agent's ordinary search, so it cannot come back empty where ordinary search would not. And step 2 below proves it on the pilot task before any agent starts. |
| All pairs were run before anyone looked at one | One pair only. Then stop, read it, report. Nothing further without the owner's word. |
| The tool rejected commands agents actually type (combined commands, absolute paths) | Step 2 replays real recorded agent commands for that task through the exact wrapper the agent will get, inside the exact container. |
| The scoring could not apply the agents' patches, found after the first pair | Step 1 checks the harness with no agent: the real fix must score as solved and an empty change as not solved, through the same export and scoring path the agents' work will take. |
| The plain agent solved every task, so nothing could show | Choose the task and model so that the plain agent is not expected to walk it: a task published agents failed or laboured on, and a cheaper or lower-effort model, the same in both arms. Say what evidence the choice rests on. |
| 5.8 million tokens went before the fault was seen | A ceiling fixed before the first run: 400,000 tokens per run, 800,000 for the pilot in all, counted as gate 3 counted them. A run that reaches its cap is stopped and recorded as capped. |
| A Box-arm run was counted even though the Box had done nothing | A Box-arm run is valid only if the record shows at least one search whose order the Box actually changed. Record, per run: searches made, searches reordered, and whether the agent opened something the Box had moved up. |
| The agent was told to use a tool, and the instruction itself cost steps | No instruction about the Box in either arm. The two prompts are identical, word for word. |

**The steps.**

1. **Harness check. No agent, no tokens.** On the chosen task, in the exact container: the real fix scores as solved; an empty change scores as not solved; a change that breaks a guard test scores as not solved. Through the same export and scoring the agents' work will use.
2. **Box check on that task. No agent, no tokens.** Build the Box for the task's failing test. Run the task's recorded agent searches from gates 2 and 3 through the wrapper as the agent will meet it. Confirm by script: every ordinary result is returned; at least one of those searches is reordered; no command is rejected or altered in meaning; the wrapper adds no text. If none of the recorded searches is reordered on this task, choose another task by the same rule and say so.
3. **Fix the plan and push it** before the first run: the task and why, the model and settings, the two identical prompts, the limits, the token ceiling, what will be recorded, and what counts as a valid Box-arm run.
4. **The pair.** One run without the Box, one with, fresh sessions, same model, same limits. Their code only in containers with the network off for the agent's work.
5. **Stop. Read both records before anything else.** Report to the CTO: did the Box-arm agent's searches come back reordered; did it open something the Box moved up; did anything error or get rejected; were both runs scored cleanly; what each solved, and its tokens and steps. Say plainly whether the tool worked as intended with a live agent. One pair shows that, and cannot show which arm is better; do not claim it does.

**Then wait.** If the pilot is clean, the CTO brings the owner a plan for the comparison proper: how many pairs, on which tasks, with what ceiling, and how large a difference that could and could not see. The lab does not start it.

**Rules.** No product code. Zero cost: an allowance the owner already has, explicitly authorised as before, no new purchase or key. Nothing sent to any project. Every run recorded, including a failed start. One sceptic pass that rereads both records and reruns the scoring, not the agents.

## For later, not now

- **Beyond failing tests:** a reproduction script (nearly free), an error from a log, a named function or file, a change under review, a feature request. Most need a map, built once, of which test runs which code. How often each case arises is unknown. Keep the trace format independent of where the trace came from.
- **Sharper ordering inside the Box,** a small ranker trained on past fixes, and a rerunnable scoreboard for improving the Box by script.
- **A sealed Box** for an owner who needs a boundary.
- **Lines A, B, C and E** from 7 October are paused; their records are under `lab/lines/`.

## Standing rules

Zero cost. Few tokens. No trained model inside the Box. Third-party code only in containers, network off, install scripts disabled; nothing sent to any project. No conversations with possible customers. Not a marketplace or bounty board. One session, one piece of work; the owner sends `LAB.md` for each. Every result is attacked by a sceptic before it reaches the CTO.

- **Sync state, 9 October 2026:** reading, prototype and authorized one-pair silent live pilot closed and independently reviewed. Box reordered one search and the next command opened promoted code. Both actual patches fail the named test and pass all five guards; 383,261 total reported tokens, within caps. [Result](lines/box-trial/live-pilot/result.md), [review](lines/box-trial/live-pilot/sceptic.md). No superiority established. No more pairs or product work; await the owner's word before a separately planned broader comparison.
