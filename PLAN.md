# Portable Box delegation plan

**Product:** turn a bounded change in an existing codebase into a runnable work package (a Box) that a chosen developer or agent can implement without the owner repository, then verify and integrate the patch in the original repository.

**What must be proven, in order of risk:**

1. A selected-source package really builds and passes its checks with the rest of the repository absent.
2. A recipient who has never seen the repository can finish the change from the package alone.
3. That costs the owner less total effort than ordinary delegation, or discloses far less source for similar effort.
4. Someone chooses it again for their next delegation, and will pay.

Details are in [DELEGATION-MAP.md](docs/box-v4/DELEGATION-MAP.md) and [VALIDATION-PLAN.md](docs/box-v4/delegation/VALIDATION-PLAN.md). Tasks are in [the delegation graph](tasks/box-delegation-task-graph.json). Current state is in [STATUS.md](STATUS.md).

> **Direction since 8 October 2026:** the product is the Box as a tool for coding agents, built in milestone B (see "Where we are and what comes next"). The "useful" milestone and milestone A below describe the earlier direction, handing work to outsiders without the repository. They are kept as the record of how the Box format and its checks came to exist.

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

## Where we are and what comes next: milestone B, the Box as a tool for agents

**On hold. No wave of milestone B is to be cooked.** The CTO wrote this section on 8 October 2026 having misread the owner, and corrected it the same day. The owner's decision is that the ideal Box is designed and finalised in the lab first, and that product work does not resume before that. What follows is the CTO's draft of what the kitchen might build afterwards. It is not approved, its waves and their order are provisional, and the lab's design will replace it. It still replaces the order A6, R3c, P1, R4, which is retired. The earlier text of this section is in Git history.

**What changed.** Three days of research (the `lab` branch, `lab/lines/`) tested the Box from several sides. What it settled:

- A program can make a Box from one failing test in about two seconds: the functions that test ran, a median of 5% of a large project's source, containing the real fix on 28 of 29 replayed bugs. The plain error trace names the fix on only 6 of 29.
- Handing work to outsiders without the repository, the product this plan was written for, has no customer anyone could show from public evidence. That direction is set aside, not abandoned: a sealed Box remains possible later for an owner who needs a boundary.
- Strong agents on well-known public projects already find the right place in a few steps. So a Box that only says where to look adds little there. That is a fact about those agents and that code; it is not a test of a working Box with a live agent, which has not yet been run once.

**The owner's decision.** Build the Box as a tool an agent uses, make it as good as the state of the art allows, and then test it properly. The reasoning: an open tool that gives an agent a small, relevant place to start and takes nothing away cannot make it worse; even a small gain is large across everyone's usage; and research cannot say more until the real thing exists. The CTO's reservation, on record: the gain may be too small to notice for strong agents on familiar code. The milestone is shaped to find out where it is not small.

**What the Box is now.** A plain program, with no model inside it:

- *Open.* It never confines the agent. The whole repository stays reachable.
- *Made from evidence.* What ran when the test failed, and later how it ran: order, path to the failure, what differs from passing runs.
- *Built into what the agent already does.* Its ordinary search, with what the failing test ran listed first. Nothing new to learn and nothing to ignore.
- *Light.* Seconds to make, almost nothing to carry.
- *Honest about itself.* It marks only what it observed and says what it could not see.

**Where it is aimed,** because that is where the research left room: cheaper and weaker agents; code a model has never seen, which includes every private repository; and understanding what the code did when it failed, not only finding where.

| Wave | Outcome | Why here |
|---|---|---|
| B1 | **The Box core.** One command takes a failing test and writes the Box: every function that test ran, identified exactly, in the order first called. Python first. | Everything else reads this. The lab's tracer proved the method and had one identity fault to fix. |
| B2 | **Box search.** The ordinary search commands, whole repository, same matches, with matches inside the Box first and marked. | The form that cannot return less than a normal search and cannot be ignored. |
| B3 | **The path to the failure.** One command shows the route from the test to where it failed, in order. | A runtime fact an agent cannot get by reading. Aimed at understanding, where agents spend most of their reading and where they fail. |
| B4 | **One-step use.** Packaged so an agent picks it up with no setup, on any host the kitchen runs on. | A small gain only counts if nobody has to remember to use it. |
| B5 | **The kitchen uses it.** Cooks get the Box on this repository's own failing tests. | Real use on private code, at no extra cost, before any outside claim. |
| B6 | **The fair test.** A working Box, a live agent, tasks with room to improve, code the model has not memorised, one pilot pair first, a token ceiling fixed in advance. | The test the research never ran. The owner approves it separately because it spends tokens. |
| B7 | **A second language.** JavaScript and TypeScript, same Box format. | After the first language has shown whether it is worth widening. |

**How each wave is checked without spending agent tokens.** The lab's replay scripts and its thirty public tasks score a Box by script (is the fix in it, where does it rank, how long it took). The kitchen may run them; it does not change them.

**What is kept from before.** The Box folder format, export, submit and owner-side verify from milestones D and A stay as they are, tested and unused by this milestone. Nothing is deleted.

**Held back, on purpose:** a sealed Box; a trained model that makes Boxes; ranking by a learned ranker; any marketplace; conversations with possible customers. Each needs its own decision.

**The lab.** It is working out what the ideal Box is (`lab/PROGRAMME.md` on the `lab` branch). The kitchen waits for that.

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
