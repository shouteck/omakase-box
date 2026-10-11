# What W002 taught the kitchen

Written 5 October 2026 from the kitchen's own records. W002 delivered one backend task, B1.1: about 660 lines of product code and one migration.

## What it cost

| | |
|---|---|
| Elapsed | about 21 hours (4 Oct 16:35 to 5 Oct 13:39) |
| Brief revisions | 13 |
| CEO approvals and holds | 16 |
| Runtime handovers | 3 (Devin, Codex, Devin) |
| Evidence files | 969 (18 MB) |
| Verification harness | about three times the size of the feature |

The follow-on wave W005 repeated the pattern: 24 review rounds and 7 runtime runs in one evening.

## Causes and what replaced them

| What happened | Why | Now |
|---|---|---|
| Almost every failure was in the environment, not the product. | The first coding task was also the orchestration pilot and the first use of a hardened Linux container route on Windows. Three unknowns in one wave. | A product wave never also introduces a new runtime, verification route or host. Environment fixes are their own small wave. |
| A staging, relay and manifest system grew around the tests. | A rule written for hostile strangers' code ("no candidate code on this workstation") was applied to the kitchen's own code, whose authors already had a shell on the host. | First-party code runs on the host. Containers and VMs are for untrusted third-party code only. |
| A lost exit code blocked the wave. | Backgrounded commands lost output, and the rules forbade rerunning because every run consumed one of twelve preserved databases. | Databases are disposable per run. Rerunning is always allowed. |
| Ordinary debugging came back to the CEO as revisions r2 to r9. | Caps such as "one correction, zero reruns" turned each failure into a scope amendment. | The CEO approves milestones. Corrections inside one are the CTO's job. |
| Handovers stalled on proving the old team had stopped. | Ownership was tied to agent IDs the tools could no longer look up. | Ownership is a branch. Whoever the CTO assigns the branch to owns it. |
| 16 containers ran for up to 46 hours on a 16 GB machine; the database cap became the next wave's blocker. | Nothing could be removed without separate authority, including synthetic fixtures. | Every resource is named for its wave and removed at close. |
| Agents started from instructions three waves out of date. | Status was appended to the rulebook as dated paragraphs; history lived in "historical..." fields. | Rules and status are separate files. Status is replaced, never appended. Git is the history. |
| 456-file hash manifests and source tarballs bound each review. | The candidate lived uncommitted in a shared working tree. | The candidate is a commit. The SHA is the binding. |
| A CEO-approved wave proved an agent could write a 96-byte file. | Capability checks were treated as waves. | Capability checks are routine CTO work. |
| Each lesson became another paragraph every agent had to read. | Lessons were recorded as prose. | Lessons go into `scripts/verify.mjs`, the wave template or a check. Prose is the last resort. |

## What worked and stays

- A reviewer who is not the author, judging an exact revision.
- Never editing expected outcomes to bless a candidate.
- Reporting unknown as unknown.
- The short outcome-first card for the CEO.
- The flat root, worker, reviewer team that finally closed B1.1.

## Where Docker came from

The product needs Node, Git and Postgres. It does not need Docker. Docker entered three ways:

1. **As the only Postgres on the machine.** Legitimate, and replaceable by an embedded Postgres installed as a development dependency.
2. **As the sandbox for hostile code** in the earlier bounty design (`services/runner-controller`, `infra/runner`). That stage is deferred; nothing on the current roadmap runs untrusted code.
3. **As the place tests had to run**, because of the host-execution rule above. This is the part that hurt: read-only dependency mounts, path translation between Windows and Linux, `docker exec` output loss, PowerShell quoting, and a mailbox relay so in-container tests could reach fixture services.

Removing the third use removes most of the pain. Removing the first removes Docker from daily development altogether.
