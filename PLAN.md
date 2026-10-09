# Plan: hand-off Boxes for coding agents

Rewritten by the CTO on 10 October 2026, on the owner's instruction to keep only what this product needs. The earlier plan (outsider delegation, milestones D, R and A, the Box-as-a-search-tool draft) is in Git history at commit `9353307`. Current state is in [STATUS.md](STATUS.md).

## The product

**A coding agent that is stuck hands off the part it cannot do, without handing over the repository.**

1. An agent working in a repository has a failing test it cannot make pass.
2. It calls one command. The tool runs that test, records what code ran, and packages exactly those files with the test as the acceptance check. That package is a **Box**.
3. The owner sees a short summary (what is leaving, how much of the repository that is, what counts as done) and confirms.
4. The Box goes to a solver: another agent or a person, who never sees the repository.
5. A solution comes back and is checked mechanically in the real repository. If it passes, the agent gets it.

Think of it as a bounty an agent creates for work it is struggling with. Agent bounty markets already exist and are short of real tasks; they also need the solver to see the repository, which rules out private code. A Box removes that need.

**What it is not, in this plan:** a marketplace of our own, payments, reputation, a tool that finds solvers. Those exist elsewhere or come later, each by its own decision.

## Two rules of the product

- **Nothing leaves without a person's yes.** An agent that packages source and sends it out unattended is the leak pattern security researchers describe. Every hand-off shows the owner what is leaving and waits for one confirmation.
- **A never-ship list.** Secrets, credentials and whatever the owner marks never enter a Box, checked on the real path of each file and not on its spelling.

## What already exists and is kept

| Piece | Where | State |
|---|---|---|
| The Box format: a plain folder with `box.json`, selected source, declared setup and check commands | `packages/box-package`, `packages/box-contracts` | Built, tested |
| Export, with the check that the Box behaves like the full repository | `box export` | Built; proven on an outside project |
| The solver's sealing tool, inside the Box | `box/submit.mjs` | Built |
| Owner-side verification of a returned change in the real repository | `box submit`, `box verify` | Built; rejects a do-nothing change, an altered agreement, edits outside the allowed files |
| A neutral agreement: any program as setup or check, no built-in package manager | milestone A | Built |
| Recording what a failing test ran, about two seconds, the fix inside it on 28 of 29 public bugs | lab prototype on branch `lab` | Method proven; to be rebuilt as product code |

Details of the format are in [SUBMISSION-CONTRACT.md](docs/box-v4/delegation/SUBMISSION-CONTRACT.md). The wider product map, written for the earlier direction and still broadly right about what a Box contains, is [DELEGATION-MAP.md](docs/box-v4/DELEGATION-MAP.md).

## Milestone C: the hand-off

Approved by the owner on 10 October 2026. Each wave cooks only when named; the kitchen stops after each.

| Wave | Outcome | Notes |
|---|---|---|
| **C1** | **Record what a failing test ran.** One command takes a test command and writes every function in the repository that ran, identified exactly. Python first. | Brief: [waves/C1.md](waves/C1.md). The foundation the next wave reads. |
| **C2** | **From a failing test to a ready Box with nothing written by hand.** One command: trace the test, choose the files that ran plus what the project needs to install and run, apply the never-ship list, write the agreement, export, and print the owner's summary. | Replaces the 186-line hand-written agreement of the R3b trial. Export's own check proves the automatic choice of files: the Box must fail the test the same way the repository does. |
| **C3** | **The hand-off and the return.** A command an agent calls when stuck: it prepares the Box, shows the summary, waits for the owner's yes, and puts the Box where it was told. A second command takes a returned solution, verifies it in the real repository and applies it. | Destination is a local folder in this wave. Nothing goes outside. |
| **C4** | **The kitchen uses it.** A cook that is stuck on one of this repository's own failing tests hands a Box to a solver that has never seen the repository, and the result is verified and merged the normal way. | Real use on private code. Uses the blind taster role. |
| **C5** | **The first Box posted outside.** | Needs the owner's separate approval and a choice of where. Not designed yet. |

**Later, each needing its own decision:** posting to existing agent bounty markets; payment; a second language; a failing test the agent wrote itself as the anchor; a map of which test runs which code, so a Box can be made without a fresh run.

## What was dropped, and why it is safe to drop

- **Handing work to human contractors as the lead product, the "useful" milestone, replays on public projects (R1 to R3b):** served their purpose. They produced the Box format and its checks, which are kept.
- **The Box as a search or reading aid for agents (the draft milestone B), and the lab's trial of it:** measured for a week. A capable agent's own search already matches it. Its one lasting result, the tracer, is reused here.
- **The web console and intake (D1, D3.2):** not needed for a command-line hand-off. The code stays in the repository, untouched by this milestone.
- **Kitchen speed work (K7 leftovers, K9):** only if it blocks a wave.

## How we will know it works

Not by a benchmark. By use: C4 is the first real hand-off, on our own code. After C4 the owner decides whether to post one outside.

## The lab

Paused entirely by the owner on 10 October 2026. The kitchen does not read its brief, answer it or sync it. Its instruments stay on the `lab` branch; the kitchen may read the tracer prototype there as a reference and rebuilds what it needs as reviewed product code.
