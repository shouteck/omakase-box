# Plan: the bounty tool for coding agents

Updated by the CTO on 11 October 2026, after BT6's first run, from the owner's decisions in discussion that day. This is the whole roadmap. Earlier plans are in Git history. Current state is in [STATUS.md](STATUS.md).

## The product in one line

**One command for a coding agent to hand off work: packaged safely, posted where it can be solved, remembered across sessions, and returned for the agent to choose.**

We are merely a tool. It offers actions and states facts. It does not require, forbid or judge any choice the agent makes. It is not a marketplace and never will be one: the bounty is a GitHub issue, and sites that put money on issues (Algora first) are where rewards happen.

## The design rule

**The tool does everything mechanical. The agent supplies only judgement.** The judgement is: whether to hand off, what the task is, which solution to use if any, and whether any deserves a reward. Everything else is one command with defaults, and every output names the next command.

**The owner is involved once.** They set the tool up and write their standing rules. After that the agent runs the whole journey with nobody asked, inside those rules.

## The journey of one bounty

```
 ONCE: THE OWNER
 a. Signs in to GitHub; later, for rewards, sets up the bounty site account themselves
 b. Writes the standing rules: what the agent may post, offer and pay, and the budget
 c. Optionally switches on the hook

 EVERY BOUNTY: THE AGENT, ALONE              GITHUB                 SOLVERS
 1. Works on a job
 2. Decides to hand a part off (any reason)
 3. One command: the task, what was tried,
    one line of why. The tool packages
    the code, never-ship files removed
 4. The tool posts it              ────────► issue + branch
 5. The tool writes the record                                      6. Read the issue,
 7. Carries on, or its session ends                                    send pull requests
 A LATER AGENT (often a new session)         ◄──────────────────────
 8. Learns of it: the rules-file line, or the hook at session start
    and again whenever a solution arrives
 9. Sees the solutions listed with facts about each change
 10. Looks at any of them as the solver saw the code (nothing can clash there)
 11. Chooses. Its judgement alone; the tool runs nothing and judges nothing
 12. The tool merges the chosen one onto current code; a clash is staged
     in a side copy for the agent to resolve; any merge can be undone
 13. The tool closes the loop outside: comment, close, remove the branch
 14. Reward, if any and if the agent decides one is deserved, inside the budget
 15. Resumes the job
```

## What is settled

| Part | Decision |
|---|---|
| What goes out | The whole working state as a snapshot, never-ship files removed, no history; the task, the note on what was tried, the one line of why. |
| Checks | **None.** A bounty carries no command, and the tool never runs anything a solver wrote. Whether a solution works is for the agent to find out by its own means. (Owner, 11 October 2026: "the onus is all on the agents, we merely provide a tool that helps them".) |
| Why an agent uses it | Any reason it judges worthwhile. The tool does not assume the reason and records the one line of why. |
| Whether the agent must use it | Never. Nothing is enforced. |
| Who is served | **Public repositories only.** Posting outside publishes the code, so the tool refuses a private repository, with no override, and says so up front. A private repository can still hand a bounty over by local folder. |
| Where it goes | A GitHub issue on the project's own repository, with the code on a branch beside it and a fixed label so bounties can be found. Solutions return as pull requests. GitHub stays optional: everything else works without it. |
| How it survives the agent | A record per bounty in the project, with every stage; a line in the project's rules file kept current by the tool. Outside state is read from GitHub when asked and shown with the time it was read, never kept as a copy that pretends to be current. |
| How the agent finds out | The rules-file line always. The hook, if the owner switches it on: state at the start of a session, then one line whenever something new arrives, silent otherwise. |
| How a solution is treated | Listed with facts about the change: who, what files, how large, whether it merges cleanly today, anything unusual, and that nothing was run. Facts, never a verdict. |
| Choosing | The agent's or owner's alone. It may look at each solution on the original snapshot, try it by its own means, pick one, several or none. |
| Bringing it home | The chosen solution's change is merged onto current code as one labelled merge. A clash is staged in a side copy, resolved by the agent, and finished by the tool. Any merge can be undone with one command. |
| Reward | Optional. The tool carries what the owner or agent states and never decides or suggests a price or a pricing strategy. Using a solution and paying for one are separate actions; which solution deserves payment, and whether any does, is theirs to decide. The tool makes no promise on the owner's behalf. |
| Who controls it | The owner, once, through standing rules: what may be posted, offered and paid, and the budget. Only the owner writes them. An owner's answer to something outside the rules can be saved as a new rule. |

## The three hard stops

The only things the tool refuses on its own account. Each protects the owner; none governs the agent's judgement.

1. **Never-ship files** (secrets, keys, credentials, environment files, Git internals, the tool's own state, anything the owner lists) are removed from what goes out and refused in what comes back.
2. **A private repository is not posted outside.**
3. **The owner's standing rules.** Nothing happens outside the authority the owner granted. Until standing rules are built (BT8), that authority is the limits file plus a yes for each bounty.

## Other rules of the product

- No command returns nothing or fails silently. Every outcome is a named state with a next step.
- The tool states facts, never judgements.
- Text written by a stranger is never shown as if the tool wrote it, and never put in front of an agent that did not ask to look at it.
- What is merged can be undone.
- One real use before many.

## Built

| Wave | What exists | State |
|---|---|---|
| BT1 | `create`: the whole-repository bounty on disk, never-ship on real paths, preview, a listing a stranger can read | Merged |
| BT2 | The record (`.box/bounties/`), stages, `status`, `confirm`, `post` to a local folder, `withdraw` | Merged |
| BT3, BT3a | `answer`, the facts report, several answers, `apply` as a real merge onto current code, `reject`, `undo` | Merged; the check parts are removed in BT6 |
| BT3b | One line of why, defaults, `help` | Merged |
| BT4 | The description, the lines for the project's rules file with the open-bounties line, the owner's limits file, reminders (off by default) | Merged |
| BT5 | The kitchen used it for real, end to end, through a local folder; the tool stays installed in this repository | Merged |
| BT6, first run | The GitHub adapter: post as issue and branch, public-only refusal, solutions from pull requests, `status` reading GitHub, recovery of half-done steps | Reviewed, parked on `wave/BT6`, nothing posted |
| K10 | The off-machine run tests these suites | Merged |
| C1 | `box trace`. Not used here | Merged |

## Remaining waves

Each cooks only when named; the kitchen stops after each. The order is the dependency order.

| Wave | Outcome | Notes |
|---|---|---|
| **BT6** (second run) | **The first bounty posted outside, with no checks.** Takes checks out of creating and answering; a solution from any account can be listed and merged, with nothing run; the report describes the change only; then one real public issue on this repository, answered and collected. | Brief: [waves/BT6.md](waves/BT6.md). The owner sees the exact issue text and says "go" before anything is posted. |
| **BT7** | **Look, choose, resolve.** `look` gives the agent a solution as the solver saw the code, where nothing can clash. Applying the chosen one stays one command when it merges cleanly. On a clash the tool stages the merge in a side copy, names the files, the agent resolves them, and the tool finishes or cancels. A half-finished merge is in the record for the next agent. The working code is untouched until the last step. **Picking the job back up:** the record carries what the posting agent was doing, gathered by the tool (the branch and commit it was on, the files it had changed, the one line of why) plus at most one line from the agent on what it was in the middle of; `status` shows it to the later agent. No long hand-over is asked for. | Pre-brief: [waves/BT7.md](waves/BT7.md). Accepted by a fresh agent given only the tool's output and a repository with solutions waiting, one of which clashes. |
| **BT8** | **Standing rules: the owner hands over once.** One setup. The rules say what the agent may post without asking, and (ready for BT10) what it may offer and pay and the budget. Inside them nothing waits for the owner; outside them the agent asks and the answer can be saved as a rule. Only the owner writes them; an agent cannot grant itself authority. The owner can read a summary of what was done and withdraw the authority at any time. | Pre-brief: [waves/BT8.md](waves/BT8.md). Replaces the yes for each bounty. Closes the known gap that the yes is a command an agent could run itself. |
| **BT9** | **The hook.** On hosts that have the slots: the state of open bounties at the start of a session, then one line when something new arrives, each event announced once, silent otherwise. Off until the owner switches it on. Switching it on shows a plain disclosure: what it does, what it touches, what it costs in the agent's context, how it may affect the agent (including that with standing rules a solution arriving can lead to a merge or a payment with nobody asked), what it never does, how to stop it. | Pre-brief: [waves/BT9.md](waves/BT9.md), with a first reading of which hosts offer which slots. Prints only what the tool generated. |
| **BT10** | **A reward, through a site that funds issues (Algora first).** The tool adds the reward the owner or agent stated and, where the site allows, releases payment inside the budget once the agent has decided and an undo window has passed; otherwise the owner releases it. | Needs the owner's separate approval and a spending limit. The owner creates the account, accepts the terms and adds the payment method themselves. Preceded by a reading of what triggers payment there, whether it can be held, its terms on using claimed work, minimums and refunds. |

## What we know and do not know

- **What exists around us.** Algora is a payment layer on GitHub issues for people, where the maintainer decides; it is where a reward would happen. Tools that pass work to a stronger model on failure exist. What we found nowhere as one tool: the posting side for an agent with the decision left to it, memory across sessions, and bringing the chosen answer home.
- **Demand is thin everywhere.** The most active site found has paid a few hundred developers in total. There is no crowd of solvers waiting. Early bounties may wait a long time, and the tool says so.
- **The bet.** Sites are short of tasks, not solvers; a tool in the agent's hand is where tasks come from. If agents hand work off often, that position matters. This is unproven and the owner chose to build and learn from use. The measure that comes free from the record: of the bounties posted, how many got a solution, and how long it took.
- **Where solvers may come from first:** coding agents that already work from GitHub issues, and people on Algora once a reward is attached. Untested.
- **Most agents may not spend money.** Expect most early use to carry no reward.
- **Accepted:** this is a convenience layer on places we do not control.

## Not in this plan

A marketplace of our own; payment handling of our own; reputation; private repositories; choosing which files to send; running or checking solutions; deciding or suggesting prices; any research. The lab is paused.
