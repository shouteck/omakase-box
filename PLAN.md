# Portable Box delegation plan

**Product:** turn a bounded change in an existing codebase into a runnable work package (a Box) that a chosen developer or agent can implement without the owner repository, then verify and integrate the patch in the original repository.

**What must be proven, in order of risk:**

1. A selected-source package really builds and passes its checks with the rest of the repository absent.
2. A recipient who has never seen the repository can finish the change from the package alone.
3. That costs the owner less total effort than ordinary delegation, or discloses far less source for similar effort.
4. Someone chooses it again for their next delegation, and will pay.

Details are in [DELEGATION-MAP.md](docs/box-v4/DELEGATION-MAP.md) and [VALIDATION-PLAN.md](docs/box-v4/delegation/VALIDATION-PLAN.md). Tasks are in [the delegation graph](tasks/box-delegation-task-graph.json). Current state is in [STATUS.md](STATUS.md).

## Sequence

| Step | Outcome | Form |
|---|---|---|
| D1 | A direct request or pasted issue becomes an owner-approved completion agreement. | Existing web console and API (D1.2, in flight) |
| K1 | The kitchen verifies on the host with no Docker. | Kitchen tooling |
| D2 | A Box exports as a plain folder, proves itself in a clean directory, and a recipient submits a patch from it. | Command line and file format |
| D3.1 | The owner verifies the patch in the original repository and merges it. | Command line |
| D4 | Fresh recipients complete real Boxes; counterexamples fail honestly; effort and disclosure are compared with ordinary delegation. A recommendation follows. | Measured runs and a report |
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

## Later, each needing its own decision

Restricted proprietary packaging with a disclosure policy; hostile-code execution in disposable VMs; bounty distribution and payments; tracker and backlog integrations; automatic selection; a customer pilot with real participants.

## History

B0, B1.1 and D1.1 are accepted. The original B0-B8 platform ladder is in [tasks/box-v4-task-graph.json](tasks/box-v4-task-graph.json) and `milestones/box-v4/`; it is a parts list to reuse from, not a backlog to finish. M0-M9 material is under `docs/legacy/`.
