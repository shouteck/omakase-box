# Plan: the bounty tool for coding agents

Updated by the CTO on 10 October 2026 after BT3, from the owner's decisions in discussion that day. This is the whole roadmap. Earlier plans are in Git history. Current state is in [STATUS.md](STATUS.md).

## The product in one line

**One command for a coding agent to hand off work it cannot or should not do: packaged safely, posted where it will get solved, remembered across sessions, and returned verified.**

It is not a marketplace. Bounty sites for agents already exist and are short of real tasks. An agent can already post to one of them with a call. What it cannot do in one step is everything before and after posting, and that is the work this tool takes on. **Its value is taking cognitive load off the agent across the whole journey.**

## The design rule

**The tool does everything mechanical. The agent supplies only judgement.** Three decisions belong to the agent: whether to hand off, what the task is, and whether to accept the answer. Everything else is one command with defaults, and every output names the next command.

## The journey of one bounty

```
 AGENT A (working)             OWNER            BOUNTY SITE           SOLVER
 1. Works on a job
 2. Decides to hand a part off
    (any reason it judges worthwhile)
 3. Tool builds the bounty ───► 4. Sees what is
    and shows a preview            leaving, says yes
 5. Tool posts it and     ────────────────────► 6. Listing visible
    writes the record                                               7. Takes it, gets the Box
 8. Carries on, or its                                              9. Solves, returns
    session ends                                                       an answer
 AGENT B (a later session)                      ◄──────────────────
 10. Arrives; open bounties are where it already looks
 11. The answer has already been checked; it reads a report of facts
 12. It decides: accept or reject
 13. Accepted: brought forward onto current code, in a way that can be undone
 14. Resumes the job agent A left
```

## What is settled

| Part | Decision |
|---|---|
| What goes out | The whole repository as a snapshot, never-ship files removed, no history; the task, the note on what was tried, the check and its level. A smaller set of files is deferred. |
| Why an agent uses it | Any reason it judges worthwhile: stuck, cheaper elsewhere, faster in parallel, no access, a second opinion, reasons not yet imagined. The tool does not assume the reason, and **records one line of why** on every bounty so the reasons can be learned from use. |
| Whether the agent must use it | **Never. It is at the agent's discretion; nothing is enforced.** The tool is there for when it is the better choice. |
| How the agent knows | A short description saying what it does, when it is worth using and when it is not; a few lines in the project's own rules; the owner's limits; open bounties shown where the agent already looks. Full instructions load only when the agent reaches for it. Reminders at moments of difficulty exist as an option the owner switches on; they are off by default. |
| What the agent needs to choose well | The facts to compare: what a bounty would cost, what the owner's limits allow, how long an answer may take or that this is not yet known, how it will be judged. The tool states them. |
| Who controls it | The owner sets limits once. Nothing leaves outside them. |
| Where it goes | Existing bounty sites, through adapters. First destination is a local folder. |
| How it survives the agent | A record per bounty in the project, with every stage and its history. |
| How an answer is treated | **The tool reports facts and never gives a verdict.** It checks the answer before anyone looks, says what passed, what changed, what looks unusual and what it did not check. The decision is the agent's or the owner's, and is recorded. Accepting can be undone in one step. |
| How "done" is judged | Three levels, stated in the listing: *mechanical*, *example*, *reviewed*. A passing check is evidence, not proof. |

## Rules of the product

- Nothing leaves the owner's machine outside the owner's limits; by default every bounty waits for the owner's yes.
- Never-ship files never enter a bounty, and never come back in an answer.
- No command returns nothing or fails silently. Every outcome is a named state with a next step.
- **The tool states facts, never judgements.** "The check you set now passes", never "this answer is correct".
- Nothing is applied without a decision, unless the owner has allowed it for answers that pass a mechanical check. What is applied can be undone.
- One real use before many.

## Built

| Wave | What exists | State |
|---|---|---|
| BT1 | `box bounty create`: the whole-repository bounty on disk, never-ship on real paths, the check proven to fail today, preview, a listing a stranger can read | Merged |
| BT2 | The record in the project (`.box/bounties/`), stages and history, `status`, `confirm`, `post` to a local folder, `withdraw` | Merged |
| BT3 | `answer`: binds a returned folder to its bounty, extracts the change, refuses never-ship paths, verifies a mechanical answer on what was shipped, merges onto current code as a real merge; `apply`, `reject`; conflicts abort cleanly | Merged |
| K10 | The off-machine run tests these suites on a pinned runner | Merged |
| C1 | `box trace` (what a failing test ran). Not used here; kept for the smaller Box later | Merged |

## Remaining waves

Each cooks only when named; the kitchen stops after each.

| Wave | Outcome | Notes |
|---|---|---|
| **BT3a** | **Report, do not judge.** When an answer arrives the tool checks it and writes a report of facts: the check's result, whether a declared "must keep passing" command still passes, what changed, whether it would merge cleanly onto current code, flags for anything worth a second look, and what was not checked. A passing answer stops there for a decision; it is no longer applied automatically. A failing answer no longer ends the bounty: it is recorded and the bounty stays open. Several answers are listed with passing ones first. Accepting can be undone with one command. | Brief: [waves/BT3a.md](waves/BT3a.md). Changes behaviour BT3 shipped, on the owner's decision. |
| **BT3b** | **Fewer things to supply.** `create` asks for one line of why and records it; takes its title from the task when none is given; picks a sensible place to write; gathers evidence for the note by itself (the failing output, the files changed so far). `box bounty help` shows the whole journey on one screen. Every success line ends with the exact next command. | Small. Closes known rough edges listed in STATUS. |
| **BT4** | **Tell the agent.** Three separate, switchable pieces: the tool's description (what, when, when not); the lines for a project's rules, with an "open bounties" line the tool keeps current; reminders at moments of difficulty, off by default. Plus the owner's limits file, which also supplies the facts an agent needs to choose. | Accepted by constructed scenarios, below. Two or three wordings are tried and the best kept; published research found wording alone changes a tool's use tenfold, and that more detail is not better. |
| **BT5** | **The kitchen uses it.** Part one, the journey: a person asks for a bounty on this repository's own work; a solver that has never seen the repository answers; a different session collects it from the record. Part two, judgement: one or two scenarios run in full, climbing from description only, to the rules note, to a reminder, stopping at the first rung where the agent chooses sensibly. Part three, open: the tool stays installed during ordinary waves, nobody mentions it, and the recorded reasons are read afterwards. | Part one proves it works. Parts two and three are reported honestly, including "nobody used it". |
| **BT6** | **The first bounty posted outside.** An adapter to one existing site. | Needs the owner's separate approval and a choice of site. Preceded by an hour's reading of how those sites take a task from a program, verify and pay. Once money moves, accepting is no longer undoable; that needs its own rule (a window before payment is final) and is not designed yet. |

## How BT4 is accepted: constructed scenarios

A small set of situations, written before any run, each with the sensible behaviour stated in advance.

- **Where the bounty is the better choice,** on something an agent can weigh: stuck after several distinct attempts; no access to what the task needs; cheaper than the remaining budget; faster in parallel; a second opinion where correctness matters; specialist knowledge it has shown it lacks.
- **Where it is not:** a task it can plainly do; a bounty that would cost more than the limits allow; code the owner has marked never to send.
- **Crafted honestly.** For each, every other reasonable move (search the web, read the documentation, try another approach, ask the owner, use a stronger model, install something) is listed with why it does not resolve the situation, and that reason is true in what the agent is shown. Alternatives are not removed to force the answer. The owner being away is the natural setting: an unattended agent has nobody to ask.
- **Run cheaply.** The agent is given the situation at the moment of decision and a few steps, not a whole job.
- **Scored on reasoning.** Trying cheaper options first and then posting is good. Solving it a cheaper way is also good, and means the scenario was flawed. Posting without trying anything cheaper is overuse. Running out of budget without considering it, or claiming success, is the failure being looked for.
- **Attacked before use.** A fresh reviewer tries to find a reasonable way to avoid the bounty in each scenario. If there is one, the scenario is fixed or dropped.

These test whether an agent recognises a good moment when one is put in front of it. They do not show how agents will use the tool in general; the recorded reasons and BT5's open part are for that.

## What we know and do not know

- **Searched five times, not found as one tool:** the whole posting-side workflow. Every ingredient exists somewhere (agent bounty sites with escrow and test-based verification, hand-off notes, escalation to a stronger model on failure). Any of them could add the rest.
- **Not known:** how often agents will choose to hand work off, and for what. Published work finds agents poor at recognising they should stop, and prone both to overusing and to ignoring tools. The owner chose to build and learn from use.
- **Left for the future:** how much smarter agents will use it. The tool is reason-neutral and records why, so it does not have to guess.
- **Accepted:** this is a convenience layer on sites we do not control. Its value is breadth, reliability and being neutral between them.

## Not in this plan

A marketplace of our own, payment handling, reputation, choosing which files to send, any research. The lab is paused.
