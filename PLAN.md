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

Everything before that is a working mechanism, not a useful product. Two steps get there, in order: **R2**, a real request of our own prepared without request-specific code; then **R3**, the same on a public repository that is not ours. Until both are done, kitchen improvements pause (except fixing something that blocks them) and the lab stays on its first line of research. The owner's conversations with people who hand work to outsiders run alongside.

## Sequence

| Step | Outcome | Form |
|---|---|---|
| D1 | A direct request or pasted issue becomes an owner-approved completion agreement. | Existing web console and API (D1.2, in flight) |
| K1 | The kitchen verifies on the host with no Docker. | Kitchen tooling |
| D2 | A Box exports as a plain folder, proves itself in a clean directory, and a recipient submits a patch from it. | Command line and file format |
| D3.1 | The owner verifies the patch in the original repository and merges it. | Command line |
| D4 | Fresh recipients complete real Boxes; counterexamples fail honestly; effort and disclosure are compared with ordinary delegation. A recommendation follows. | Measured runs and a report |
| R1 | A real request of our own goes through the whole loop. Done; it showed preparation cost is the main risk. | Command line |
| R2 | A second real request prepared with no request-specific code; every check run on the untouched code at export. | Command line |
| R3 | A real issue from a public repository that is not ours, prepared in minutes, solved from the Box alone, accepted by the owner-side check. | Command line; nothing sent to that project |
| D3.2 | A minimal web journey for prepare, delegate, accept. | Web, only if D4 says continue |

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

A public-issue programme (owner's idea, 6 October 2026): maintainers of public projects opt in, their open issues are prepared as Boxes, and solutions come back with the evidence attached. R3 is its first experiment. Consider it once R3 has worked on several issues across more than one project; it starts only with a maintainer who has agreed, never by sending unrequested work to a project. Restricted proprietary packaging with a disclosure policy; hostile-code execution in disposable VMs; bounty distribution and payments; tracker and backlog integrations; automatic selection; a customer pilot with real participants.

## History

B0, B1.1 and D1.1 are accepted. The original B0-B8 platform ladder is in [tasks/box-v4-task-graph.json](tasks/box-v4-task-graph.json) and `milestones/box-v4/`; it is a parts list to reuse from, not a backlog to finish. M0-M9 material is under `docs/legacy/`.
