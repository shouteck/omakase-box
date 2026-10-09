# Research programme

Set by the CTO. Rewritten short on 9 October 2026 because the page had grown to 60 KB again and every session pays to read it. The full earlier text, with every gate's wording and the owner's notes as they were given, is `lab/archive/PROGRAMME-2026-10-08.md` (and `PROGRAMME-2026-10-07.md` before it). Read them only if a task here needs them.

No deadlines. The CTO decides which problem and in what order; the lab lead decides how. The owner is not a research scientist and is not asked to steer method. The kitchen is idle: no product work resumes until the owner has agreed what the Box is.

## The lab is paused entirely (10 October 2026)

**Read this first. Do nothing below it.** The owner has paused the lab. The product is now settled and is being built by the kitchen: a coding agent that is stuck on a failing test hands off that part as a Box, without handing over the repository (`PLAN.md` on master, milestone C). The owner's view is that the specification is clear and what remains is execution.

- **No session is to run.** If you were started with `LAB.md`, tell the owner the lab is paused and stop. Do not continue, finish or tidy any study, including the record study under `lab/lines/box-trial/record-gradient/`, which was left unfinished and uncommitted in this folder.
- **Nothing is owed to the kitchen and the kitchen owes nothing here.** No brief, no sync, no "For the lab".
- **The instruments stay where they are.** The kitchen may read the tracer prototype on this branch as a reference and rebuilds what it needs as its own reviewed code.
- **To reopen the lab** the owner says so and the CTO rewrites this page. Everything below is the record of the Box trial as it stood on 9 October 2026.

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

## Next session: a serious study at almost no token cost. Records and scripts only. No agent runs.

Asked for by the owner on 9 October 2026: test the Box seriously, the way the published work that found benefits did, but without spending many tokens. The design session showed that every experiment with live or replayed model calls costs millions of tokens and still would not show a saving. So this study gets its size the other way: **from records other people have already paid for.** Public benchmark leaderboards hold complete run records for many agents and models, strong and weak, on hundreds of tasks. Reading them costs machine time and nothing else.

**What we know, and the question it leaves.** On thirty tasks and two capable agents, the agent's own search already does about as well as the Box: it reaches the right function in two to four steps and its searches put the fix near the top (gates 2 and 3b). So for a strong agent on famous code the Box matches and does not beat. The owner's question is whether that is true in general or only where conditions favour the agent. **The study asks: does the room for a Box grow as the agent gets weaker, as the code gets less familiar, or as the task gets harder?** If it does, there is a real case and a place to test it cheaply. If it does not, across a wide range, that is as definitive a no as records can give.

**Scale it up in three directions, by rules fixed and pushed before any record is read.**

1. **More tasks.** From thirty to as many as machine time allows, aiming at one hundred and fifty or more Python tasks from the same public benchmark, sampled by a stated rule across its projects. For each: build the narrow Box from the failing test, exactly as gate 1b did (about two seconds a task once the image is there; one container at a time).
2. **More agents, chosen to span strength.** Prefer one scaffold with many models, so that only the model differs: the benchmark's bash-only listing with the minimal agent is the obvious source. Take at least six, by rule, from the strongest to the weakest that still has full records, including small and older models. Record each one's published solve rate.
3. **Less familiar code, if records exist at no cost.** A benchmark of recent or private-style tasks with published run records (issues fixed after the models' cut-off, or a newer benchmark built to avoid memorised projects). If none can be had free, say so and leave this direction open.

**Measure, by script, for every task and agent:**

- *Finding:* did the run ever open or edit a function the real fix changed; how many steps and how much text before it first did; what share of the run that was.
- *Searching:* for every search the agent made, where the first result inside a fixed function sits, ordinary order against the Box's order; and whether the Box would have changed the order at all. This is the count of real opportunities: searches where the order changes and the fix is among the results.
- *Missing:* runs that never reached the fix. For each: was the fix in the Box; did the agent make any search whose Box order would have put a fixed function in the first three results.
- *After finding:* text read between first reaching the fix and first editing, inside and outside the Box.
- *Familiarity:* did the agent name the right file before anything had shown it.
- *Reading, which is where slicing would act.* The owner's view, 9 October 2026: for the narrow case of ordering search results, an agent's own search probably matches the Box; the larger prize is slicing, which the literature showed to help, and which the Box should grow into. Ordering changes where an agent looks. Slicing changes how much it has to read once it is there, and reading is where the tokens are: about half of all text in gate 2's runs came from viewing code. A silent form of slicing fits the definition of a Box: when the agent opens a file, the functions the failing test ran are shown in full and the rest reduced to their signatures, with the whole file one ordinary command away. Nothing is asked of the agent and nothing is hidden for good. Measure the room for that, from the same records: for every file view an agent made, how much of the text returned lay inside functions the failing test ran and how much outside; summed over a run, what share of all text read a sliced view would have removed; and the check that matters, how often something outside the slice turned out to be needed (the agent later edited it, or the real fix changed it, or the agent went back and opened it in full). Report it along the same gradient of agent strength. The published gains from slicing were for tools and single prompts that could not look around; say plainly that this measures room for an agent that can.

**Report the gradient, not one number.** One table and one chart: agents ordered by published strength, and for each the median steps to find the fix, the share of runs that never found it, the share of searches where the Box had a real opportunity, and how far the Box would have moved the fix. Then the same split by project, and by familiar against less familiar code if that direction was possible. One sentence: the room for a Box does or does not grow as agents weaken, with the size of the difference between the strongest and weakest and how sure the data make it (intervals from resampling tasks, not from counting searches as independent).

**What each outcome would mean, fixed now.**

- *Room grows clearly for weaker agents or less familiar code:* the Box has a case, and it is "a cheap agent with the Box against an expensive one without". The lab then proposes one small live test in exactly that corner, where the expected effect is larger and a cheap model makes each run cheap. The owner decides on it separately.
- *No room anywhere in the range:* agents of every strength find the place quickly and their searches already rank the fix. The Box as a locating aid is closed, on evidence far wider than three pairs.
- *Room only in runs that failed for other reasons:* say so; a Box would not have saved them.

**Limits to state.** Records show what agents did without a Box, so this measures room and opportunity, never what an agent would do with one. Published records are from runs without the failing test given. Models may know these projects. The Box is built from the benchmark's failing test, which a real user would have to have.

**Rules.** No agent and no model calls: scripts over public records, a summary file, the lab lead reads the summary. Third-party code only in containers, network off. Reuse gate 1b's and gate 2's instruments; the recorder fault does not affect them, since nothing is delivered to an agent, but the ordering code must be the corrected file-and-starting-line identity from the prototype. Keep disk and time in hand: one image at a time, removed after use; if the full sample cannot finish in a session, finish a balanced part and say what remains. One sceptic pass: re-derive the table from the saved records on a sample, and look for a reason other than agent strength for any gradient (task mix, record format, run length caps).

## Completed on 9 October 2026: definitive experiment design (authorization retained below)

Design-only session complete. [Owner page](lines/box-trial/definitive-design/owner-page.md) compares next-decision replay, three-command continuations and repeated repairs. Recommend conditional next-decision replay, preceded by no-agent native-equivalence safeguards and an opportunity census. Exact search-time resume is unestablished; no RPC probe or repair agent ran. Own-record costs and 20 offline noise/effect scenarios are retained. Fresh sceptic required sharper sparse-disagreement intervals and correct terminal power; targeted verification of 9a8e2e0 accepted both fixes. A ±5 point navigation equivalence answer is possible with stable outcomes; noisy cases remain undecided. This is no promise of small repair savings.

**Next scope is for owner/CTO.** Design is delivered; no instrument fix, capability probe or model experiment authorized by this completed session. Other lines remain paused.

### Original design-only instruction

Asked for by the owner on 9 October 2026. The three live pairs (one for the Box, two against, no outcome changed, and a recorder fault found) settled nothing, and could not have: whole-run token counts vary too much from run to run for a handful of pairs to see anything but a very large effect. The owner holds that a silent, open Box cannot in theory make an agent worse and wants an experiment that can actually answer whether it makes it better. The owner cannot spend many tokens. So the task is the lab's own kind of problem: **get the most certainty per token.** Do not run it. Design it, cost it, have it attacked, and bring it back.

**What "definitive" has to mean here.** Say in advance what result would count as "the Box helps", what would count as "it does not, to within X", and what would be left undecided. An experiment that can only ever return "no difference shown" is not acceptable; neither is one that claims more than its size supports. For each design give the smallest effect it could reliably detect and what it costs.

**The reason the pairs were weak, and so where to look.** Two full runs of the same task differ in a hundred ways unrelated to the Box, and the Box acts at only a few moments in a run: when a search comes back. Designs that isolate those moments should need far fewer tokens than designs that compare whole runs. Consider at least these, and others the lab knows; say for each whether it is feasible with the access the lab has, at zero cost:

1. **Fork at the search.** Take an agent's run up to the moment a search returns. From that identical state, continue twice: once with the ordinary result, once with the Box's ordering. Measure what the agent does next (does it open the function that needed fixing; how many steps and how much text before it first does). Everything before the fork is the same, so most of the noise is gone, and each fork costs one continuation of a few steps, not a whole run. The recorded runs already held (gate 2's published records, gate 3's controls, the pilot and the two new pairs) contain hundreds of such moments. Whether a run can be resumed from a recorded state with the tools the lab has, and how faithfully, is the first thing to find out.
2. **Repeat the same run to measure the noise first.** Nobody has yet run one arm twice. Without that, no difference between arms can be read. A design must include it or borrow it from recorded data, and say how.
3. **A measure nearer the mechanism than whole-run tokens:** steps and text read up to the first opening of the right function; whether the agent opens something the Box moved up, and whether that was on the way to the fix or a detour. These vary less than a whole run and say why, not only whether.
4. **Shorter, cheaper tasks and a cheaper model,** so that more pairs fit in the same tokens, weighed against having less room to improve.
5. **Stopping rules that end the experiment as soon as the answer is clear** in either direction, with the chance of a wrong stop stated.
6. **Tasks where the Box has something to do.** On well-known public code, capable agents already find the place in a few steps. If a definitive answer on those tasks would be "no room", say so, and say what a set with room would be: code the model has not seen (this repository; issues fixed after the model's cut-off), or a weaker agent.

**Fix the instrument first, in the design.** The recorder changed what a piped search returns (it ran the whole search before passing output on, adding about 18,000 characters of warnings in one live case). The design must state how the tool will be shown, with no agent, to behave exactly like the native commands on the commands agents actually type, including pipes, and must not rely on replaying old commands alone, since that is what missed the fault.

**What to bring back. One page for the owner, and the working behind it.**

- Two or three candidate designs, each in a paragraph a non-specialist can follow.
- For each: what it measures; how many tokens, as a range; the smallest effect it could detect at that cost; what could still fool it; and whether it needs anything the lab does not have.
- One recommendation, with the reason.
- What the owner would be able to say at the end of it, in a sentence, for each possible outcome.
- Costs worked out from the recorded runs' own variation, not from rules of thumb; show the calculation or the simulation.

**Rules for this session.** No repair agent and no model tokens beyond the lab's own reading and writing. If a small no-agent probe is needed to learn whether forking from a recorded state is possible at all, say what it is and ask; do not run it. One sceptic pass whose job is to find the cheapest way the recommended design could give a confident wrong answer.

## Completed on 9 October 2026: continuation stopped after two new pairs (authorization/protocol retained)

Both new Box runs used more reported tokens with the same successful repair outcomes as control. The frozen two-against rule stopped the session before a third task was prepared. New usage 380,096, within caps. Fresh review independently rescored all six patches including pilot; all scores match. It also found a live recorder/native stderr fault, which prevents a clean ordinary-native comparison. [Result](lines/box-trial/live-three/result.md), [review](lines/box-trial/live-three/sceptic.md). Further comparisons are stopped; a no-agent streaming/native safeguard correction is required first, and no additional repair run is authorized here.

The pilot was clean: the silent Box reordered a search for a live agent, the agent opened what was moved up, nothing errored, and both arms failed the task (control 14 commands and 200,832 tokens; Box 10 commands and 182,429). The owner read that as a first sign of saving and has authorised three more pairs. The CTO's advice was that a comparison able to detect a small saving would need far more runs than we can afford, and that three pairs cannot prove one; the owner has chosen three as a cheap next look, and that is what the lab runs. Report what they show without stretching it.

**Same Box, same rules as the pilot** (`lab/lines/box-trial/live-pilot/plan.md`): silent ordering of ordinary search, no instruction, no marks, no facts tool; identical prompts; same model and effort as the pilot; whole repository open; their code only in containers.

**What changes from the pilot:**

- **Three new tasks, not repeats of the pilot's.** From the thirty, chosen by a rule fixed and pushed before any run: tasks published agents failed or laboured on, from three different projects and none from Sphinx, on which the no-token Box check shows at least one recorded agent search actually reordered. If a project has no such task, take the next by the rule and say so.
- **Alternate which arm runs first.** The pilot ran the control first. Run the Box arm first on two of the three, so that anything owed to order (a warm cache, time of day) does not all fall on one side.
- **Every safeguard again, per task, before its pair:** the scoring check (real fix solved, empty change not, broken guard not) and the Box check (recorded commands through the exact wrapper, at least one reordered, nothing rejected, no text added). No tokens until both pass for that task.
- **Ceilings:** 400,000 tokens per run, 2,400,000 for the three pairs in all. A run at its cap is stopped and recorded as capped. If the first of the three pairs shows a fault in the tool or the scoring, stop and report; do not run the other two.
- **A Box-arm run is valid** only if the record shows at least one search the Box actually reordered.

**Report.** One table with all four pairs, the pilot included and marked as such: task, which arm ran first, solved or not in each arm, commands, tokens, searches made and reordered, whether the agent opened something the Box moved up. Then, in plain words: on how many of the four the Box arm used fewer tokens, and on how many it solved what the control did not or the reverse. State what four pairs can and cannot support. If all four go the same way, say that this would happen by chance about one time in eight for a tool that does nothing, so it is a sign and not a proof; if they split, say that this is what no effect and a small effect both look like. Say nothing about percentages saved as if they were a measurement. One sceptic pass rereads the records and reruns the scoring, not the agents.

**Spend as little as the answer allows: run the pairs one at a time and stop early** (the owner, same day: tokens cannot be wasted on experiments). The only result a handful of pairs can establish is a consistent one, so stop as soon as consistency is gone. Count a pair "for the Box" if the Box arm used fewer tokens, or solved the task when the control did not; "against" if the reverse; a difference under 5% of tokens with the same outcome is a tie and counts as neither. The pilot counts as the first pair, for the Box.

- After each pair, if **two pairs so far are against**, stop and do not run the rest: a consistent effect is ruled out and a small one cannot be shown at this size.
- If all three new pairs are for the Box, that is four of four. Stop and report; do not go on. The CTO will ask the owner whether to run two more, since six of six would happen by chance about one time in sixty-four for a tool that does nothing, and that is the cheapest result that would not be luck.
- Otherwise run all three and report.

**Then stop.** The owner and CTO decide from the table.

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

- **Sync state, 10 October 2026:** the lab is paused entirely by the owner. See the top of this page.
