# Portable Box delegation plan

**Product:** turn a bounded change in an existing codebase into a runnable work package (a Box) that a chosen developer or agent can implement without the owner repository, then verify and integrate the patch in the original repository.

**What must be proven, in order of risk:**

1. A selected-source package really builds and passes its checks with the rest of the repository absent.
2. A recipient who has never seen the repository can finish the change from the package alone.
3. That costs the owner less total effort than ordinary delegation, or discloses far less source for similar effort.
4. Someone chooses it again for their next delegation, and will pay.

Details are in [DELEGATION-MAP.md](docs/box-v4/DELEGATION-MAP.md) and [VALIDATION-PLAN.md](docs/box-v4/delegation/VALIDATION-PLAN.md). Tasks are in [the delegation graph](tasks/box-delegation-task-graph.json). Current state is in [STATUS.md](STATUS.md).

## The milestone we steer by: useful

Agreed with the owner on 6 October 2026. The product is useful when all of this is true at once:

- a real issue from **someone else's** repository,
- a Box prepared for it **in minutes, with no code written for that request**,
- solved by an agent or person that **has never seen the repository**,
- and accepted by the owner-side check, with the evidence stated honestly.

Everything before that is a working mechanism, not a useful product. The route so far: **R2** (a real request of our own, no request-specific code), **R3** (a public repository; it could not prepare a Box), **milestone A** (a core that works on any repository) and **R3b** (a replay of a fixed public issue). The route from here is in "Where we are and what comes next" below. Until the milestone is met, kitchen improvements pause (except fixing something that blocks it) and the lab stays on its first line of research, plus the reading for its third. The owner's conversations with people who hand work to outsiders run alongside.

## Milestone A: a repository-agnostic core

Approved by the owner on 6 October 2026, after R3 could not prepare a Box for a project outside the product's own ecosystem. The product should work on any repository. The principle: **the core knows files, commands, exit codes and patches, and nothing else.** Anything that understands a language, a package manager or a test runner is an optional helper that makes a Box leaner or easier to prepare, never a requirement for making one.

| Wave | Outcome |
|---|---|
| A1 | A neutral agreement format: the owner declares setup commands and check commands for any program, and what the solver needs installed. No required tool versions, no fixed list of tools. Existing agreements and tests move to it in the same wave; the old format is deleted. |
| A2 | Neutral file selection: the owner lists the files, and export proves the list by running the checks in a clean folder. Following TypeScript imports becomes an optional helper that proposes files. The project's own dependency files travel unchanged. |
| A3 | Export and owner-side verify run the declared setup and checks, whatever they are. No hard-coded package manager anywhere in the core; generated TypeScript scaffolding leaves the core. |
| A4 | Proof on two projects that are not like ours: one managed by npm, and one that is not JavaScript at all (Python is installed on this machine). The whole loop on each: export, base checks, a blind recipient, owner-side verify, a do-nothing submission rejected. |

**What the A0 prototype showed (6 October 2026), and what it changes.** The neutral loop worked on an npm project, a Python project and a multi-package repository under both npm and pnpm, on small projects with no outside dependencies. Four things go into the waves above:

- *Setup succeeding proves nothing.* A locked install exits 0 even when a needed sibling package is missing. Only the checks prove a Box, so A2 never treats a clean setup as evidence.
- *A check must fail for the right reason.* "Fails on the untouched code" is not enough: a check that fails because a file is missing looks the same. A2 runs each outcome check in the owner's full repository as well as in the Box and requires the same result in both.
- *Starting a program is an operating-system problem.* On Windows, `npm` is not a program that can be started directly. A1 fixes one rule for how a declared program is started, checks before running that every declared program can be found, and names any that cannot.
- *Outside dependencies are untested.* A4 adds a multi-package project with real outside dependencies, which needs a small download with install scripts disabled.

Also noted: a Box carries the project's dependency file unchanged, so it names packages that were left out even though their source is not included. That is stated to the owner as part of what a Box discloses.

Known limits, stated up front: the product's own command-line tool still needs Node to run, though the repository it works on can be anything. Without a language helper a Box is less lean. "Any repository" means any whose setup and checks can run in a clean folder; projects that need running services are harder.

The next attempt on an outside repository (R3b, a replay of recently fixed issues) followed milestone A; its result is below.

## Where we are and what comes next

Written by the CTO on 7 October 2026, after R3b and the paired-check fix.

**What R3b showed.** One closed issue from `tj/commander.js` went through the product end to end. The hand-over and the acceptance worked: a Box of 39 files went out, a solver working from that folder changed one line, and the owner-side check accepted it and rejected a do-nothing submission. Preparing the Box did not work cleanly: export refused five times, twice because the "does the Box behave like the repository" check could not cope with a test tool that prints run times. That check has since been fixed (`waves/fix-paired-check.md`).

**Against the four things to prove:**

| What must be proven | State |
|---|---|
| A Box runs with the rest of the repository absent | Shown on our own code, small fixtures and one outside project |
| A stranger can finish from the Box alone | Shown once on outside code, with a solver that was not properly isolated and was shown the test |
| It costs the owner less than ordinary delegation | Not shown. Preparation is the weak point: the agreement was 186 hand-written lines |
| Someone chooses it again and will pay | Untested. No kitchen wave can test it; only the owner's conversations can |

**The order from here.** Each step depends on the one before it. There are no dates.

| Step | Outcome | Why here |
|---|---|---|
| A6 | The tool starts cleanly on a machine that is not ours: the three first-run failures from R3b are gone, and what the Box tells a solver is correct (which commands are theirs to run, how to submit). | The next replay runs the product in a clean container. Without this, every run begins with the same workarounds. |
| R3c | A stricter replay: several fixed issues across two public projects, one of them not commander.js. The solver runs in a container with nothing but the Box. Some cases hide the acceptance test from the solver. Each case includes one answer that is wrong in substance but well-formed, to see whether it is accepted. | Turns one anecdote into a count, and tests the two things R3b could not: real isolation, and whether wrong work gets through. |
| P1 | Preparing a Box is cheap for a person: a command drafts the agreement from the repository (files by a stated rule, the setup and test commands it can find), and the owner edits it. | "Prepared in minutes" has to be true for a requester, not for an agent that has read the format. After R3c, so two projects inform it. |
| R4 | A live attempt: an open issue, with a project owner who has agreed. | The useful milestone itself. **Owner's decision** when we get there, since it means contact with an outside party. |

**Held back, on purpose:**

- *The web journey (D3.2) and a GitHub integration* wait until R4 has worked.
- *Leaner slicing* (steps 2 and 3 of the ladder below) waits for the lab's third line to say it is worth it. R3b shipped 36% of the repository's bytes, which is acceptable for public code.
- *Kitchen improvements* (K9, the leftovers of K7) only when they block a step above.
- *D4* is retired as a separate step. Its questions are answered inside the steps above: counterexamples in R3c, effort against ordinary delegation in P1 and R4.

**The lab, alongside.** It runs beside the kitchen and does not wait for it. Its next work feeds two steps directly: how often a request and its check disagree, and whether that can be seen before hand-off (shapes how R3c hides the test); and what the field knows about whether a slice contains what a change needs (shapes P1's file rule).

## Sequence

| Step | Outcome | Form |
|---|---|---|
| D1 | A direct request or pasted issue becomes an owner-approved completion agreement. | Existing web console and API (D1.2, in flight) |
| K1 | The kitchen verifies on the host with no Docker. | Kitchen tooling |
| D2 | A Box exports as a plain folder, proves itself in a clean directory, and a recipient submits a patch from it. | Command line and file format |
| D3.1 | The owner verifies the patch in the original repository and merges it. | Command line |
| D4 | Retired as a separate step on 7 October 2026; its questions moved into R3c, P1 and R4 (see above). | Not run |
| R1 | A real request of our own goes through the whole loop. Done; it showed preparation cost is the main risk. | Command line |
| R2 | A second real request prepared with no request-specific code; every check run on the untouched code at export. | Command line |
| R3 | A real issue from a public repository that is not ours, prepared in minutes, solved from the Box alone, accepted by the owner-side check. | Command line; nothing sent to that project |
| R3b | A replay of a fixed public issue through the whole product. Done; hand-over and acceptance worked, preparation did not work cleanly. | Command line, in containers; nothing sent to that project |
| D3.2 | A minimal web journey for prepare, delegate, accept. | Web, only after R4 has worked |

Why this order: D2 is where the idea can fail, so it comes before more screens. A Box that is a folder plus three commands (`export`, `submit`, `verify`) needs no server, database, accounts or containers, and can be tested this week. The web journey is worth building once D4 shows what users actually need from it.

## Decisions built into the plan

- **Format first.** A Box is `box.json` plus selected source, lockfile, tool versions and fixtures. Any editor or agent can open it. The recipe is "this Node version, this lockfile"; a container is optional and never required.
- **Selection is prototyped before it is built.** How a Box chooses its source has no precedent here, so D2.1 opens with two or three small throwaway attempts compared on the same checks.
- **Selection is checked by execution.** Start from an owner-reviewed manifest, follow imports to find what leaves the selection, then install and run the checks in a clean directory. What fails there is a named preparation gap. Excluded modules may be replaced by type-only stubs.
- **The kitchen is the first customer.** Every wave brief already has an outcome, a base commit, editable paths and checks. From D2.2 on, workers receive their briefs as Boxes. That produces real delegation data with no outreach.
- **Two measurable wedges.** Limited disclosure (how little source the recipient needed) and agent context (same agent, Box versus full repository: success, tokens, time). Self-service and human/agent support are not differentiators on their own.
- **The existing platform is kept, not extended.** B1.1's versioned Box store and D1.2's intake stay as they are. The bounty, reservation, release and hostile-runner code from M0-M9 is frozen for later stages and is not run in ordinary verification.

## In parallel, by the CEO

Five to ten conversations with engineering leads who use contractors for bounded work. They need nothing from D1-D4. Ask what they hand over today, how long onboarding takes, what they refuse to share, and how they decide the work is acceptable. This is not a kitchen task and no agent sends messages.

## Slicing: where it is going

How a Box selects its source is on the roadmap as a ladder. Each step makes the Box leaner and its guarantee stronger; each is taken when the evidence calls for it, in this order.

| Step | What goes in the Box | Guarantee | Status |
|---|---|---|---|
| 1 | Whole files the edited files import | It builds and its checks pass in a clean directory | Built (D2.1). Next: fail loudly at export when something is missing |
| 2 | Only the functions and types actually used from those files | Same | Not started. Uses existing build tooling |
| 3 | Type-only stand-ins for everything the recipient does not edit | Same shape as the original, checked by the compiler | Prototyped once (D2.1 prototype C), not chosen then |
| 4 | A reduced program shown to behave the same as the original where it matters | Behaviour preserved, by proof where possible and by stated evidence otherwise | Research. The lab holds it; see `lab/PROGRAMME.md` on the `lab` branch |

The lab's third line of research (does the slice contain what a change needs) decides when to move: it replays real past changes and counts what step 1 misses and how much it discloses. Steps 2 and 3 are kitchen work once that count says they are worth it. Step 4 goes as far as can be reduced to an algorithm, and no further than can be stated honestly.

## Later, each needing its own decision

An ecosystem for handing work out (owner's direction, 6 October 2026): the product is not a solver, since anyone can point an agent at their own code. It is the handover layer. A project becomes ready to hand work out, and any outside solver the owner chooses (a specialised agent they cannot give repository access to, a contractor, another team) can pick up a Box, do the work and return it with evidence. Public projects are the proving ground and the showcase. Teams with code they will not share are the market. R3 is its first experiment. Open it once R3 has worked on several issues across more than one project, and only with an owner who has agreed. Restricted proprietary packaging with a disclosure policy; hostile-code execution in disposable VMs; bounty distribution and payments; tracker and backlog integrations; automatic selection; a customer pilot with real participants.

## History

B0, B1.1 and D1.1 are accepted. The original B0-B8 platform ladder is in [tasks/box-v4-task-graph.json](tasks/box-v4-task-graph.json) and `milestones/box-v4/`; it is a parts list to reuse from, not a backlog to finish. M0-M9 material is under `docs/legacy/`.
