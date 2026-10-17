# The memory specification: what the bounty tool must remember, derived from who reads it

Draft by the CTO, 18 October 2026, for the owner's review; part of the engineering roadmap (PLAN.md, "The roadmap", the memory foundation). The owner, that day: "since our product is well defined… it's not difficult to specify the full memory context… let's fully drill down what's required." **Approved by the owner on 18 October 2026 as the memory foundation's definition, and a living document:** "a great start, but we may adapt it as we continue development." A wave that changes what is remembered updates this file in the same commit, with the moment and question that justify the change. K28 is checked against it when it reports; BT32 builds it; K30 audits it.

## How this is derived

Memory exists only to answer someone's question later. So the method runs from reads to facts, never from fields:

1. **Moments** when anyone needs to recall something (section 1).
2. **Readers** at each moment (section 1).
3. **Questions** each reader asks at each moment (section 2).
4. **Facts** that answer them: for each, who writes it and when, its tier (who may see it), how long it is kept, and where it lives today or **MISSING** (section 3).
5. **Requirements** on the store, derived from who reads, how often, from where (section 4).

A fact no question needs is not memory (a removal candidate). A question no fact answers is a gap (section 5).

**Tiers** (K26): **public** (on GitHub for anyone); **project** (every agent of the project, on any machine; public in a public repository by the owner's decision); **machine** (this checkout only); **owner** (the owner's own settings and state, outside every repository).

## 1. Moments and readers

| # | Moment | Readers |
|---|---|---|
| M1 | Session start, before any work (unasked) | any agent on the project |
| M2 | Before starting a piece of work: "is this already handed off?" | the agent about to work |
| M3 | Creating a bounty | the posting agent |
| M4 | Posting | the posting agent; the owner (deciding) |
| M5 | While it is out (tracking) | the posting agent; a later agent; the owner |
| M6 | A solution arrives (review) | the posting agent or a later agent |
| M7 | Deciding (merge or close) | the deciding agent; the owner (ask me each time) |
| M8 | Paying | the owner; the agent relaying |
| M9 | Resuming the larger work after the bounty | the posting agent or a later agent |
| M10 | Reading the code later: "why is it like this?" | any agent or person, with or without the tool |
| M11 | Looking back: "have we handed this off before; how did it go; what did it cost?" | any agent; the owner |
| M12 | The owner's audit: "what did my agents do in my name?" | the owner |
| M13 | A solver reading the bounty | the solver (public only) |

## 2. The questions

| Moment | Question | Facts that answer it (section 3) |
|---|---|---|
| M1 | Is any bounty open? Has anything new arrived? | F-stage, F-solutions, F-told |
| M2 | Has this work, or something like it, been handed off already? What became of it? | F-title, F-task, F-why, F-partof, F-stage, F-outcome |
| M3 | Is a bounty for this already open (avoid duplicates)? | as M2 |
| M3 | What must I write so a later reader understands? | (the tool's prompt: F-why, F-tried, F-done, F-followup) |
| M4 | Did the owner allow this? What exactly becomes public? | F-allowedby, F-published |
| M5 | What is outstanding, since when, and is anyone working on it? | F-stage, F-posted, F-solutions, F-age, F-questions |
| M5 | What did solvers ask? | F-questions (public comments) |
| M6 | What does each solution change, and does it do what was wanted? | F-solutions, F-done, F-tried |
| M6 | Which solutions have I already seen? | F-seen |
| M7 | Which one do I merge, and is the owner asked? | F-solutions, F-done, F-decision-mode |
| M7 | Why was this one chosen, or why was the bounty ended without one? | F-outcome, F-closereason |
| M8 | Whom do I pay, how much, through what? Is it settled? | F-reward, F-payee, F-paid |
| M9 | What was I doing when I handed this off, and what is next? | F-followup, F-partof, F-localstate |
| M10 | Why does this line of code exist? Who wrote it? Why was it delegated? | F-mergecommit, F-why, F-task, F-author |
| M11 | How many bounties, how long did they take, how many got solutions, what did they cost? | F-posted, F-outcome-at, F-solutions, F-reward, F-paid |
| M12 | What was posted publicly in my name, merged without my asking, promised in money? | F-published, F-allowedby, F-unasked, F-reward, F-promised |
| M13 | What is wanted, against which code, on what terms? | F-task, F-done, F-base, F-reward (public) |

## 3. The facts

| Fact | Meaning | Written by, when | Tier | Kept | Where today |
|---|---|---|---|---|---|
| F-id, F-title | identity | tool, create | public once posted | forever | `id`, `title` |
| F-task | the work wanted | agent, create | public once posted | forever | `content.task` |
| F-done | what "done" looks like | agent, create | public once posted | forever | **MISSING as its own fact** (inside the task, if the agent wrote it) |
| F-why | why delegate rather than do it here | agent, create | project | forever | `why` |
| F-tried | what was already tried and suspected | agent, create | project (public helps solvers) | forever | **MISSING as its own fact** (inside the task, or the generated `content.note` of local changes) |
| F-followup | what happens when it comes back | agent, create | project | until the bounty ends, then history | `resume.note` |
| F-partof | the larger job | agent, create | project | forever | `partOf` |
| F-localstate | branch, commit, uncommitted files at create | tool, create | machine | until the bounty ends | `resume.branch/commit/changed` |
| F-stage | where it is in the loop | tool, every milestone | project | forever | `stage` |
| F-posted | when and where it went public | tool, post | public | forever | `events` (posted), `github` |
| F-published | exactly what became public | tool, post | public | forever | `github` (base, pushed, wip, body) |
| F-base | the code to work from | tool, post | public | forever | `github.commit`, `github.branch` |
| F-allowedby | the owner's decision that allowed it | tool, post | project | forever | `allowedBy` |
| F-reward | what it states it pays | owner's setting, bound at post | public | forever | `reward` |
| F-promised | money promised across open bounties | derived | owner | while open | derived (`promisedTotal`) |
| F-questions | what solvers asked | solvers, on GitHub | public | GitHub's | read live (`status --comments`) |
| F-solutions | each solution: who, which commit, what changed, facts | tool, collection | public facts; their text is the solver's | forever (merged); rejected ones' text machine only | `attempts[]` |
| F-seen | which solutions this agent has looked at | tool, look | machine | while open | `attempts[].seenAt` |
| F-decision-mode | whether the owner is asked before merge | owner's setting | owner | — | settings |
| F-unasked | a merge or close-up the owner was not asked about | tool, at that event | project | forever | `events[].unasked` |
| F-outcome | merged which solution, or closed without | tool, decide | project | forever | `events` (applied, rejected, withdrawn), `stage` |
| F-closereason | why it was ended without a merge | agent, close | project | forever | `events[].reason` |
| F-outcome-at | when it ended | tool, decide | project | forever | `events[].at` |
| F-mergecommit | the commit that carries the outcome in the code | tool, apply or merge recognition | public (in Git) | forever | `events[].merge`; K28 confirmed `answer.ts` already writes `box bounty <id>: <title>` plus attempt/solution in the merge message. **MISSING: the short delegation why in that message and cross-machine resolution of the id to the full record.** |
| F-author | who solved it | GitHub | public | forever | `attempts[].author` |
| F-payee | whom to pay and through what | solver's `pay-to:` line, read at collection | project | forever | `attempts[].payTo`, `github.pay` |
| F-paid | the owner says it is paid | owner | project | forever | **MISSING** (BT36) |
| F-age | how long it has waited | derived | project | — | **MISSING** (BT35) |
| F-told | what each agent has already been told | tool | machine | per machine | `hook-told.json`, `said` |
| F-scan | secret-scan findings and how they were settled | tool, create and post | machine | until settled, then history | `scanFindings` |
| F-wait | a held action waiting for the owner | tool | machine | until answered | `waiting` |

## 4. Requirements on the store, derived

| Requirement | From | Value |
|---|---|---|
| R1 Unasked reads stay constant in size | M1, every session | K25's bars (met) |
| R2 The overview stays bounded | M2, M5 | open in full; ended as count plus five (met) |
| R3 Search by purpose across all history | M2, M3, M11 | `find` over F-title, F-task, F-why, F-tried, F-partof (F-tried missing) |
| R4 Every project fact reaches every machine | M2, M5, M9, M11 | **the open requirement**: K28 then BT32 |
| R5 Survives deletion of any one copy | M10, M11 | at least two independent copies of project facts |
| R6 Only the project's own accounts can write project facts; strangers' text never shown as the tool's | M5, M6, M13 | trust rule (K28) |
| R7 Two machines changing one bounty never lose a fact | M5 to M8 on teams | merge rule (K28) |
| R8 Machine facts never leave the machine; drafts never shared | all | K26 |
| R9 Works offline from the last copy, and says so | M1 to M9 | BT31 local store |
| R10 The code links back to the bounty without the tool | M10 | F-mergecommit link |
| R11 Facts written only at milestones, never on reads | all | K25, K26 |
| R12 Kept forever for project facts; machine facts compacted after the bounty ends | M11 | compaction rule |

## 5. Gaps, scored like the roadmap's

| Gap | Questions it leaves unanswered | L | F | C | Plan |
|---|---|---|---|---|---|
| R4: project facts do not reach other machines | M2, M5, M9, M11 for any second machine | no | often | medium | K28 → BT32 |
| F-mergecommit link incomplete | M10 | no | often | small | K28 confirmed the id link exists; retain it and complete the short why and cross-machine record lookup in BT32 |
| F-done not asked for | M6, M7, M13 (judging solutions) | no | always | small | the `create` prompt and help ask for it, in the task (no new option) |
| F-tried not its own fact | M2, M6, M13 | no | always | small | the same prompt; whether it becomes its own field is a design question for BT32 |
| F-paid missing | M8, M11, M12 | no | per merge | small | BT36 |
| F-age missing | M5 | no | often | small | BT35 |
| M11 aggregates (how many, how long, cost) | M11, M12 | no | rarely now | small | one `status --since` summary already exists; extend only if real use (K31) asks |
| M12 owner's audit view | M12 | no | rarely | small | `config` and `status --since`; extend only if asked |

## 6. Changing this specification

Add a moment, question or fact only with the actor's question it answers; remove a fact only when no question in section 2 needs it. Record each change in the wave that makes it.
