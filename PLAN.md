# Plan: the bounty tool for coding agents

Rewritten by the CTO on 10 October 2026, when the owner gave the word after settling the product end to end. This is the whole roadmap. Earlier plans are in Git history (`9353307` for outsider delegation and the Box-as-a-search-tool draft; `e2a4fe9` for the failing-test hand-off). Current state is in [STATUS.md](STATUS.md).

## The product in one line

**One command for a coding agent to hand off work it cannot or should not do: packaged safely, posted where it will get solved, remembered across sessions, and returned verified.**

It is not a marketplace. Bounty sites for agents already exist and are short of real tasks. This is the layer between a coding agent and those sites. An agent can already post to one of them with a call; what it cannot do in one step is everything before and after posting. That is the work this tool takes on.

## The journey of one bounty

```
 AGENT A (working)             OWNER            BOUNTY SITE           SOLVER
 1. Works on a job
 2. Decides to hand a part off
    (stuck, cheaper elsewhere,
     lacks access, any reason)
 3. Tool builds the bounty ───► 4. Sees what is
    and shows a preview            leaving, says yes
 5. Tool posts it and     ────────────────────► 6. Listing visible
    writes the record                                               7. Takes it, gets the Box
 8. Carries on, or its                                              9. Solves, returns
    session ends                                                       an answer
 AGENT B (a later session)                      ◄──────────────────
 10. Arrives, reads the record
 11. Finds an answer has come back
 12. Tool verifies it in the real repository
 13. Accepted: brought forward onto current code and applied
     Rejected: with a stated reason
 14. Resumes the job agent A left
```

## What is settled

| Part | Decision |
|---|---|
| What goes out | **The whole repository**, as a snapshot of the working state with never-ship files removed and no history; plus the task, the agent's note on what it tried, and the check that decides success. Choosing a smaller set of files is deferred. |
| Why an agent uses it | Any reason it judges worthwhile. Being stuck is one. The tool does not assume the reason. |
| How the agent knows it can | A clear description of the tool, lines in the project's own agent rules, the owner's limits, and optional nudges at moments such as repeated failure. A tool that is only mentioned is not used; the wording is part of the product. |
| Who controls it | The owner sets limits once (what may leave, how much may be spent, what needs a yes). Nothing leaves outside them. |
| Where it goes | Existing bounty sites, through adapters. First destination is a local folder. |
| How it survives the agent | A small record per bounty, committed with the project, so any later agent on any host can find it, understand it and finish it. |
| How it comes back | Verified in the real repository against the version it was made for, brought forward onto current code, then applied. |
| How "done" is judged | Three levels, stated in the listing: *mechanical* (a check that fails today must pass, and nothing else may break); *example* (an example of the wanted behaviour, agreed before posting, now works); *reviewed* (existing tests still pass, then the owner or the agent reads the change). |
| How it is understood | Every command says where the bounty is in its journey and what comes next. A fresh agent given only the record can say what to do. |

## Rules of the product

- **Nothing leaves the owner's machine outside the owner's limits,** and by default every bounty waits for the owner's yes.
- **Never-ship files never enter a bounty:** secrets, credentials, anything the owner lists, checked on the real path of each file and not on its spelling.
- **It never returns nothing, and never fails silently.** Every outcome is a named state with a next step.
- **One real use before many.**

## Already built, and reused

| Piece | State |
|---|---|
| The Box: a plain folder a solver can work in with nothing else, with a manifest, declared setup and check commands | Built, tested |
| Running declared programs safely on Windows and elsewhere; hashing; path containment | Built |
| The solver's sealing tool; binding an answer to the exact bounty it was made for | Built |
| Verifying a returned change in the real repository: accept, or reject with a named reason | Built; rejects a do-nothing answer, an altered task, edits where none are allowed |
| Recording what a failing test ran (`box trace`, wave C1) | Built on 10 October 2026. **Not used by this milestone.** Kept for the smaller Box later. |

## Milestone BT: the bounty tool

Approved by the owner on 10 October 2026. Each wave cooks only when named; the kitchen stops after each.

| Wave | Outcome | Notes |
|---|---|---|
| **BT1** | **Create.** One command turns "hand this off" into a complete bounty on disk: the repository snapshot with never-ship files removed, the task, the hand-off note, the check and its level, a listing a stranger can read, and a preview of exactly what would leave. It confirms the check really fails today. Nothing is posted. | Brief: [waves/BT1.md](waves/BT1.md). |
| **BT2** | **Remember.** The bounty's record lives in the project and moves through named stages. `status` lists every open bounty with its stage and next step; `withdraw` ends one; the owner's yes is recorded; "posting" delivers to a destination, the first being a local folder. | The record is what lets a different agent finish the job. |
| **BT3** | **Return.** Take an answer back: verify it against the version it was made for, bring it forward onto current code, apply it, or reject it with a reason. Then say what job is waiting on it. | Reuses the existing verify. |
| **BT4** | **Tell the agent.** The skill or plugin that installs the tool into the agents people already use: the description, the lines for a project's rules, the owner's limits file, optional nudges. | Tested by cold reads: an agent with only the description explains the journey; an agent with only a record says what to do next. |
| **BT5** | **The kitchen uses it.** One real bounty on this repository's own work, end to end: one agent posts, a solver that has never seen the repository answers, a different session picks it up from the record and brings it home. | The first real evidence. Destination is still a local folder. |
| **BT6** | **The first bounty posted outside.** An adapter to one existing bounty site. | Needs the owner's separate approval and a choice of site. Preceded by an hour's reading of how those sites accept a task posted by a program. |

**Later, each its own decision:** more sites; payment; nudges driven by model-escalation systems when their strongest model fails; the smaller Box, for owners who cannot send a whole repository (C1 is its starting point); languages and setups whose checks need services.

## What we know and do not know

- **Checked four times by search, not found as one tool:** the whole workflow on the posting side. Every ingredient exists somewhere: agent bounty sites with escrow and test-based verification, hand-off notes, escalation to a stronger model on failure, asking a human for non-coding steps. "Not found" is not "does not exist", and any of those could add the rest.
- **Not known:** how often agents will choose to hand work off, and whether the existing sites return good answers. The owner chose to build and learn from use. BT5 is where that learning starts.
- **Known and accepted:** this is a convenience layer on sites we do not control. Its value is breadth, reliability and being neutral between them.

## Not in this plan

A marketplace of our own, payment handling, reputation, choosing which files to send, any research. The lab is paused. The web console and the earlier delegation flows stay in the repository, untouched by this milestone.
