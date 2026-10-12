# Plan: the bounty tool for coding agents

Updated by the CTO on 11 October 2026, after BT6's first run, from the owner's decisions in discussion that day. This is the whole roadmap. Earlier plans are in Git history. Current state is in [STATUS.md](STATUS.md).

## The product in one line

**One command for a coding agent to hand off work: packaged safely, posted where it can be solved, remembered across sessions, and returned for the agent to choose.**

We are merely a tool. It offers actions and states facts. It does not require, forbid or judge any choice the agent makes. It is not a marketplace and never will be one: the bounty is a GitHub issue in an open format. **We do not interface with bounty sites; they can interface with us** (owner, 11 October 2026): anyone, a site, a solver agent or a person, can find and read every bounty without asking us.

## The design rule

**The tool does everything mechanical. The agent supplies only judgement.** The judgement is: whether to hand off, what the task is, and which solution to use, if any. Everything else is one command with defaults, and every output names the next command.

**The owner is involved once.** They set the standing rules up, either beforehand or when the first agent that wants to use the tool asks them to; either way they answer once. After that the agent runs the whole journey with nobody asked, inside those rules.

## The journey of one bounty

```
 ONCE: THE OWNER (beforehand, or when the first agent to use the tool asks them)
 a. Signs in to GitHub
 b. Writes the standing rules: what the agent may do without asking
 c. Optionally switches on the hook

 EVERY BOUNTY: THE AGENT, ALONE              GITHUB                 SOLVERS
 1. Works on a job
 2. Decides to hand a part off (any reason)
 3. One command: the task, what was tried,
    one line of why. The tool works out
    what, if anything, is not yet public
 4. The tool posts it              ────────► issue + branch
 5. The tool writes the record                                      6. Read the issue,
 7. Carries on, or its session ends                                    send pull requests
 A LATER AGENT (often a new session)         ◄──────────────────────
 8. Learns of it: the rules-file line, or the hook at session start
    and again whenever a solution arrives
 9. Sees the solutions listed with facts about each change
 10. Looks at any of them as the solver saw the code (nothing can clash there)
 11. Chooses. Its judgement alone; the tool runs nothing and judges nothing
 12. The tool merges the chosen one onto current code. On a clash it says
     what clashes and the agent merges with its own Git; either way the
     tool sees the merge and takes over from there
 13. The tool closes the loop outside: comment, close, remove the branch
 14. Resumes the job
```

## What is settled

| Part | Decision |
|---|---|
| What goes out | **An issue, on the code that is already there** (owner, 11 October 2026). The issue names the exact commit to work from and carries the task, the note on what was tried and the one line of why. Nothing is uploaded when the agent has nothing local that the task needs. Otherwise only that is: commits not yet pushed, and uncommitted changes if the agent says the task needs them. Untracked files are never published unless named. The tool states exactly what becomes public that was not. Until BT6a this is still a whole-repository snapshot. |
| Checks | **None.** A bounty carries no command, and the tool never runs anything a solver wrote. Whether a solution works is for the agent to find out by its own means. (Owner, 11 October 2026: "the onus is all on the agents, we merely provide a tool that helps them".) |
| Why an agent uses it | Any reason it judges worthwhile. The tool does not assume the reason and records the one line of why. |
| Whether the agent must use it | Never. Nothing is enforced. |
| Who is served | **Public repositories only.** Posting outside publishes the code, so the tool refuses a private repository, with no override, and says so up front. A private repository can still hand a bounty over by local folder. |
| Where it goes | A GitHub issue on the project's own repository, with an ordinary branch for solutions to target and a fixed label so bounties can be found. Solvers fork and open pull requests as for any project; bringing one home is an ordinary merge. Posting to a local folder still exists and still uses a snapshot. |
| How it survives the agent | A record per bounty in the project, with every stage; a line in the project's instruction files while any bounty is open, in one of two fixed wordings (a bounty is open; a bounty has a new solution, meaning one no agent has been shown yet), with how to see more. A solution seen and left undecided is not announced again; the tool states it with its age when an agent asks. The files change only when that fact changes, never at each stage. Outside state is read from GitHub when asked and shown with the time it was read, never kept as a copy that pretends to be current. |
| How the agent finds out | The rules-file line always. The hook, if the owner switches it on: state at the start of a session, then one line whenever something new arrives, silent otherwise. |
| How a solution is treated | Listed with facts about the change: who, what files, how large, whether it merges cleanly today, anything unusual, and that nothing was run. Facts, never a verdict. |
| Choosing | The agent's or owner's alone. It may look at each solution as the solver made it, try it by its own means, pick one, several or none. |
| Bringing it home | The chosen solution's change is merged onto current code as one labelled merge. On a clash the tool states which files clash and what changed since the bounty was posted, and the agent merges with its own Git. However the merge was made, the tool recognises it and closes the bounty. It lands as one ordinary commit that ordinary Git can reverse. |
| Reward | **$0 through BT10: no payment of any kind is implemented in those waves.** Every bounty states its reward as a field a program can read, and the amount comes from the owner's standing rules, never from the agent. **Later, in BT11, the simplest direct payment** (owner, 11 October 2026): the rule may state an amount; the issue asks the solver for their own Stripe payment link in one fixed line of their pull request; the agent awards a solver and tells the owner whom to pay, assuming the owner will faithfully do so; the tool records the award and nothing about whether payment happened. The tool never pays, never opens the link and never holds money. No bounty site is in the middle. Who is worthy of payment, and whether anyone is, is the agent's or owner's decision; using a solution and paying for one are independent. |
| Who controls it | The owner, once, through standing rules: what the agent may do without asking. They live in the owner's own settings, outside the repository, with a rule per project and a default for all projects; the tool checks the project rule, then the default, and otherwise asks. Nothing is allowed unless a written rule says so. Only the owner writes them. An owner's answer to something outside the rules can be saved as a new rule. |

## The three hard stops

The only things the tool refuses on its own account. Each protects the owner; none governs the agent's judgement.

1. **Never-ship files** (secrets, keys, credentials, environment files, Git internals, the tool's own state, anything the owner lists) are removed from what goes out and refused in what comes back. From BT8, what is about to be posted is also scanned for things shaped like secrets, and a hit makes that bounty wait for the owner.
2. **A private repository is not posted outside.**
3. **The owner's standing rules.** Nothing happens outside the authority the owner granted. Until standing rules are built (BT8), that authority is the limits file plus a yes for each bounty.

## Other rules of the product

- No command returns nothing or fails silently. Every outcome is a named state with a next step.
- The tool states facts, never judgements.
- Text written by a stranger is never shown as if the tool wrote it, and never put in front of an agent that did not ask to look at it.
- A merge lands as one ordinary commit, and the tool says which. Reversing it is ordinary Git, not a command of the tool (owner, 12 October 2026; `undo` stays until a reviewed wave removes it).
- **Only what the tool is needed for.** A command or feature exists only if an agent could not do the same with what it already has (Git, the GitHub command line, its editor) without losing something only the tool guarantees. The tool owns the life of the bounty, from posted to closed. It does not own how code gets merged or what happens to it afterwards.
- **The merged solution earns the reward, all of it.** One solution is merged; being merged is what makes it the worthy one. No split, nothing asked of the agent, nothing else published about the others. Parts of other solutions used by hand earn nothing, and every bounty says so before a solver starts.
- **Git is required, and the tool insists on it.** The whole tool rests on Git and on GitHub issues and pull requests, so there is no way of working without them and none is offered. With Git absent or too old, or the GitHub command line absent or not signed in, every command that needs it refuses by name, changes nothing, and says what is required and the least version. The tool installs nothing and prints no installation steps (owner, 12 October 2026).
- **Memory without demand.** The tool is part of an agent's memory, and must not cost it attention. What an agent sees unasked is only what it needs then: that the tool exists; while a bounty is open, that it is; and a solution arriving, at a natural pause. With nothing to say, nothing is said. Detail is always one command away and never pushed. No line count is enforced; reviewers judge it by watching a fresh agent.
- **Host agnostic.** The tool does not depend on one agent host. Its lines are kept in every instruction file the project's hosts load, its hook is offered per host with the same content, and nothing in its wording favours one.
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
| **BT6a** | **A bounty is an issue on the code that is already there.** No more copy of the whole repository per bounty. The bounty branch is a name pointing at a commit GitHub already has, plus the agent's own unpushed or uncommitted work only when the task needs it. Solutions are ordinary pull requests on the real history, merged the ordinary way. | Brief: [waves/BT6a.md](waves/BT6a.md). Approved by the owner, 11 October 2026. Faster, a normal experience for solvers, and nothing stray gets published. Reworks merged code around posting and the return path; BT7 is revised after it. |
| **BT7** | **Look, choose, resolve.** `look` gives the agent a solution as the solver saw the code, where nothing can clash. Applying the chosen one stays one command when it merges cleanly. On a clash the tool stages the merge in a side copy, names the files, the agent resolves them, and the tool finishes or cancels. A half-finished merge is in the record for the next agent. The working code is untouched until the last step. **Picking the job back up:** the record carries what the posting agent was doing, gathered by the tool (the branch and commit it was on, the files it had changed, the one line of why) plus at most one line from the agent on what it was in the middle of; `status` shows it to the later agent. No long hand-over is asked for. | Brief: [waves/BT7.md](waves/BT7.md), written for BT6a's model; also states how many comments solvers left and lets the agent read and answer them. Accepted by a fresh agent given only the tool's output and a repository with solutions waiting, one of which clashes. **Parked 12 October 2026 after three reviewed FAILs, all on the clash path; split by the owner into BT7a and BT7b.** |
| **BT7a** | **Look, questions, pick the job back up.** Everything of BT7 that held through three reviews: `look` and its copy, solvers' questions and the reply, new and seen, the saved job context, working without an identifier, the shorter `status`. A clashing `apply` ends at the named refusal it has on master and now names `look`. | Brief: [waves/BT7a.md](waves/BT7a.md). Cut from the parked `wave/BT7`, not rewritten. Accepted by a fresh agent given only the tool's output. |
| **BT6b** | **Nothing a solver wrote runs at a merge, in every configuration.** Today, when the owner's Git configuration names a filter program that lives inside the repository, a solution that replaces that program gets it run at a clean `apply`. Detect it before landing and refuse by name, or close it another way the cook can prove. Also: `post --with-changes` must not push unfiltered bytes of a filtered file. | Found by BT7's reviews, on master since BT6a. Brief to be written. Comes before BT7b, which leans more on plain Git. |
| **BT7b** | **The tool owns the life of the bounty.** On a clash `apply` states what clashes and why, and stops; the agent merges with its own Git. However a solution came to be merged, the tool recognises it the next time it runs and closes the bounty: record, issue, pull request. No side copy, no `finish`, no `cancel`. Git and the GitHub command line are required: missing, too old or not signed in is a named refusal that says what is required. | Brief: [waves/BT7b.md](waves/BT7b.md). Owner's decision, 12 October 2026, replacing the staged merge and its prototype wave. Accepted by a fresh agent given a clashing solution and only the tool's output. |
| **BT7c** | **Fewer commands.** Each command is kept only if the tool is needed for it. Candidates to remove or fold: `undo`, `confirm` (after BT8), `unlook` and the look folder, `reply`, `remind`, `answer` into `look` and `apply`, `questions` into `status`, `reject` and `withdraw` into one. About eighteen commands become about seven. | Brief to be written; each candidate is checked in the code first. A removal, so it waits for the owner's go. Accepted by a fresh agent whose journey gets shorter, not harder. |
| **BT8** | **Standing rules: the owner hands over once.** One setup. The rules say what the agent may do without asking (post a bounty, merge a chosen solution) and the reward each bounty states, which today can only be $0. Inside them nothing waits for the owner; outside them the agent asks and the answer can be saved as a rule. Only the owner writes them; an agent cannot grant itself authority. The owner can read a summary of what was done and withdraw the authority at any time. | Brief: [waves/BT8.md](waves/BT8.md). The tool's lines are kept in every instruction file the project's hosts load, so an agent on any host learns of the tool and of open bounties. What is newly published is scanned for things shaped like secrets before it goes out with nobody asked. Replaces the yes for each bounty. Closes the known gap that the yes is a command an agent could run itself. |
| **BT9** | **The hook.** On hosts that have the slots: the state of open bounties at the start of a session, then one line when something new arrives, each event announced once, silent otherwise. Off until the owner switches it on. Switching it on shows a plain disclosure: what it does, what it touches, what it costs in the agent's context, how it may affect the agent (including that with standing rules a solution arriving can lead to a merge with nobody asked), what it never does, how to stop it. | Brief: [waves/BT9.md](waves/BT9.md), with a slot for the moment an agent is about to finish, and with a first reading of which hosts offer which slots. Prints only what the tool generated. |
| **BT10** | **The open bounty format, and the whole journey run once.** Each bounty carries a block a program can read (version, identifier, where the code is, how to answer, state, reward $0), kept stable, with a short public page describing it, and proved by a reader that uses none of our code. Then one real bounty on this repository through every step built in BT6 to BT9, with the kitchen as solver: two solutions, one clashing, chosen, resolved, undone, merged again, closed. | Brief: [waves/BT10.md](waves/BT10.md). We do not interface with bounty sites; they can interface with us. The owner sees the exact issue text and says "go" before it is posted. |
| **BT11** | **A stated reward, and the solver's own payment link.** The owner's rule may state a reward above $0. The issue tells a solver who wants paying to add one line with their Stripe payment link. Next to each solution the agent sees whether a recognised link was given; one command awards a solver and gives the agent the message to pass to the owner: whom to pay, how much, and the link. | Brief: [waves/BT11.md](waves/BT11.md). Owner's idea, kept deliberately simple. The agent decides who is to be paid and assumes the owner will faithfully pay; the owner pays by opening the link. No confirmation is asked for and the tool has no "paid" or "declined". The tool never pays or opens the link. An agent paying by itself is in the backlog until agent wallets work without a person. Tested with no real money: a labelled test bounty, the kitchen as solver, a test-mode link. The owner sees the exact issue text and says "go" before it is posted. |
| **BT12** (proposed) | **Someone else can install it.** One artifact holding only the bounty tool, a `box` command, proven from a clean machine on Linux and Windows, with a first-five-minutes page, and shown in a live demo: a fresh agent, driving a terminal and a browser the way a person would, installs it into a fresh clone of this repository and goes through the whole workflow with a real test bounty, the kitchen as solver and the owner's test payment link. Then, separately, whether to publish it. | Brief: [waves/BT12.md](waves/BT12.md). **Not approved.** Making it installable is product work; publishing it under a name is the owner's decision alone, after seeing exactly what would be published, and the owner holds the registry account. |

Every remaining wave has its brief, written ahead on 11 October 2026. The head chef checks each against the Result of the wave before it and corrects names only; a change of substance comes back to the owner.

## What we know and do not know

- **What exists around us.** Sites that put money on GitHub issues for people (Algora, nearly inactive as of 11 October 2026; Opire and BountyHub, small). Tools that pass work to a stronger model on failure. What we found nowhere as one tool: the posting side for an agent with the decision left to it, memory across sessions, and bringing the chosen answer home.
- **Demand is thin everywhere.** The most active site found has paid a few hundred developers in total. There is no crowd of solvers waiting. Early bounties may wait a long time, and the tool says so.
- **The bet.** Sites are short of tasks, not solvers; a tool in the agent's hand is where tasks come from. If agents hand work off often, that position matters. This is unproven and the owner chose to build and learn from use. The measure that comes free from the record: of the bounties posted, how many got a solution, and how long it took.
- **Where solvers may come from first:** coding agents that already work from GitHub issues, and anyone who reads the open format. Untested.
- **Money is out until BT11, and then minimal.** The best-known bounty site is nearly inactive and the others are small, so payment is direct between owner and solver through the solver's own link. Without anyone holding the money, a solver takes the risk of not being paid; what protects them is only that everything is public under the owner's GitHub name. An agent paying by itself depends on agent payment products that are still early.
- **Accepted:** this is a convenience layer on places we do not control.

## Not in this plan

A marketplace or site of our own; adapters to other people's bounty sites; holding, moving or verifying anyone's money; an agent completing a payment by itself; reputation; private repositories; choosing which files to send; running or checking solutions; deciding or suggesting prices; any research. The lab is paused.
