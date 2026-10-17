# Roadmap draft: the bounty tool, defined stage by stage

Draft by the CTO, 18 October 2026, at the owner's request: "our product can be concretely defined into very precise parts… create an engineering roadmap to properly define it and scale up these processes and also keep it lean… and a product roadmap where we focus on the main use case to see if we missed anything… we should be able to figure things out methodically." **Not yet approved.** When the owner approves it, it replaces the top of PLAN.md (PLAN.md stays the only roadmap; its wave table becomes history below it). The memory sections are finalised after K28 reports.

## 1. The method

Everything below is derived the same way, so it can be checked and redone:

1. **The model.** The product is one loop of six stages, carried by two foundations:

   ```
   create → post → track → review → decide (merge or close) → pay
      └──────── memory: the delegation record (K28) ────────┘
      └──────── the owner's permission and money ───────────┘
   ```
   Underneath sits the platform: the Git and GitHub layers, the command line, the package.
2. **The actors and their jobs.** Each stage is judged from every actor who touches it: the **posting agent** (hands work off), the **owner** (allows, pays), the **solver** (finds, solves, gets paid), the **later agent** (another machine or session, continues the work), and the **outside reader** (sees only what is public).
3. **The same questions for every stage:** its job; trigger; inputs and outputs; the states it moves a bounty between; its guarantees (what it must never break); its refusals; where it lives in the code; how it is proven; what must hold at scale; known debt.
4. **Gaps are scored, not argued.** Each gap gets: **L**, does it block the main loop for the main use case (yes or no); **F**, how often an actor meets it (always, often, rarely); **C**, the cost to close it (small, medium, large). Order: L first, then F, then cheaper C.
5. **The lean rule.** Every command, module, option and output line must serve one stage or foundation and answer a stated question for an actor. Anything that serves none is a removal candidate. No feature is added without naming its stage, its actor's question and its gap score.

## 2. Product roadmap: the main use case, from every side

**The main use case:** an agent meets work it cannot or should not do, hands it off with one command, a solver somewhere does it, and the agent brings the result home: merged, credited and paid, with the whole project understanding what happened.

### The loop, walked per stage

| Stage | The actor's question | Today | Gap |
|---|---|---|---|
| Create | Agent: "can I hand this off safely, without thinking about packaging?" | `create`: task, why, part-of, saved job; secret scan; never-ship; local draft, no network | none blocking |
| Post | Agent: "is it public now, and exactly what became public?" Owner: "did I allow this?" | `post`, `--preview`; owner gate (allow, ask, deny); public repositories only; issue plus branch | private repositories impossible (G2) |
| Track | Agent: "is anyone working on it? Has anything arrived?" | `status`, `find`, `--json`, the hook, the instruction-file line; bounded | **nobody is told the bounty exists (G1)**; stale bounties never age (G3) |
| Review | Agent: "which solution is good, and what does it change?" | `look`: the change and a facts-only report; nothing a solver wrote is run | many or low-quality solutions have no triage (G4) |
| Decide | Agent: "merge the right one; end the rest" | `apply` (real merge, clash stops), `close`, any merge recognised; ask-me-each-time holds merges | none blocking |
| Pay | Owner: "whom do I pay, how much, and is it settled?" Solver: "will I be paid?" | per-repository reward; the solver's `pay-to:` Stripe link read; one owner message names whom and how much | nothing records that payment happened (G5) |
| Memory | Later agent: "what was handed off, why, what was tried, how did it end?" | local SQLite (BT31); shared part designed (K26), store under research (K28) | other machines see nothing yet (G8) |
| Solver's side | Solver: "how do I find bounties, know the terms, and get paid?" | GitHub issue with terms, branch, `pay-to:` line | **no discovery (G1)**; no solver-side help at all |
| Getting the tool | Agent: "how do I get it?" | package built and tested (BT12); not published | nobody outside can install it (G7) |

### The gaps, scored

| # | Gap | L | F | C | Note |
|---|---|---|---|---|---|
| **G1** | **Solvers cannot find bounties.** Every issue says nobody is known to be watching; nothing advertises a bounty beyond its own repository | **yes** | always | medium | Without solvers the loop never completes. Candidates: a GitHub search any solver can run (`label:box-bounty`), the public format page, a listing; and a real test of whether anyone answers |
| **G7** | **Nobody outside can install it** (publishing deferred) | **yes** for any outside use | always | small (owner's one command) | The owner decided: when the tool is more ready |
| **G2** | **Private repositories cannot be used** (a hard stop) | **yes** for commercial code | often | large, and a product decision | The hard stop is the owner's; reopening it changes the product |
| G8 | Memory does not reach other machines | no (one machine works) | often for teams | medium | K28 then BT32 |
| G3 | Open bounties never age out or prompt anyone | no | often | small | An age fact in `status`, said once; the tool offers, never enforces |
| G5 | Nothing records that a solver was paid | no | per merge | small | A recorded owner fact ("paid"), never verified by the tool |
| G4 | No triage when many solutions arrive | no | rarely now | medium | Defer until real use shows it |
| G9 | Nobody knows how often agents choose to hand off, or whether solvers answer | no, but every priority rests on it | always | small | Real use, measured |

### Owner decisions this surfaces

1. **G1, solver discovery:** is finding solvers part of this product, or does the product assume the owner brings them? This is the largest open question in the product.
2. **G2, private repositories:** keep the hard stop (public projects only) or design a private route.
3. **G7, publishing:** stays deferred; this roadmap suggests it follows G1, since installing a tool whose bounties nobody sees has little value.

## 3. Engineering roadmap: each stage defined

For each: job; states; guarantees; code; proof; scale target; debt (from BACKLOG.md).

| Stage | States moved | Guarantees | Code (modules) | Proof today | Scale target | Debt |
|---|---|---|---|---|---|---|
| **Create** | none → `drafted` | never-ship files never enter; secret scan; no network; nothing outside the authority | `create.ts`, `snapshot.ts`, `never-ship.ts`, `scan.ts`, `args.ts` | `create`, `snapshot`, `never-ship`, `scan`, `bt15`, `bt20` tests; K14 budget (15 Git, 0 gh) | under 1 s on a 10,000-file repository | task-text scan boundary (BT15) |
| **Post** | `drafted` → `waiting` / `posted` | public repositories only; only what is named becomes public; the owner's yes; the issue states exactly what was published | `post.ts`, `publish-plan.ts`, `gate.ts`, `format.ts`, `repository.ts`, `gh.ts` | `github*`, `bt8*`, `bt16`, `bt6b*` tests | one post under 30 s; GitHub rate limits respected | planned work can drift during post (BT6b to BT8) |
| **Track** | reads; marks attempts seen | unasked text constant; overview bounded; others' text marked as theirs; a read changes nothing shared | `render.ts`, `json.ts`, `find.ts`, `hook.ts`, `instructions.ts`, `collect.ts` (refresh) | `bt17`, `bt19`, `bt28`, `bt29`, `json-agreement`, `hook` tests; `kitchen/memory/measure.mjs` | flat output from 100 to 1,000 bounties (met); `find` under 0.5 s at 100,000 | `find` scan layout (BT31-ci); `status --comments` drops same-account questions (BT10) |
| **Review** | `posted` → `taken` / `answered` | nothing a solver wrote is run; facts, never verdicts; never-ship in solutions refused | `look.ts`, `collect.ts`, `answer.ts` (report) | `answer`, `report`, `bt7*` tests | 100 solutions per bounty without slowing `status` | — |
| **Decide** | → `applied` / `rejected` / `withdrawn` | a merge is one ordinary commit; a clash stops; any merge is recognised; ask-me-each-time holds merges; closing up on GitHub says when it was not asked | `answer.ts` (apply), `merged.ts`, `close.ts`, `commands.ts` | `bt7b`, `bt13`, `first-merge`, `bt21` tests | recognising merges stays cheap at 1,000 records | stale index after a clash (guarded, not reproduced) |
| **Pay** | records whom to pay | the money is the owner's, set per repository; the agent never sets an amount; the tool never moves money | `pay.ts`, `money.ts`, `settings.ts` (reward) | `bt11*` tests | — | no paid fact (G5) |
| **Memory** | every stage writes | the record outlives the session; machine detail stays local; drafts never shared | `record.ts`, `store.ts` | `bt23`, `bt31`, `bt31-ci`, `record-access` tests | 100,000 records; writes under 1 ms (met) | shared store (K28 → BT32) |
| **Owner** | gates post and merge | involved once; three words (`allow`, `deny`, `config`); settings hold only choices | `owner.ts`, `owner-text.ts`, `settings.ts`, `gate.ts` | `bt8a`, `bt22`, `bt16` tests | — | — |
| **Platform** | — | Git and `gh` required and checked; one bundled file, no dependencies; Node 22.13 or later; every refusal named | `git.ts`, `gh.ts`, `args.ts`, `wording.ts`, `index.ts`, `packages/box-cli` | `bt12*`, `bt18`, `k14-start-budget` tests; hosted `verify` and `install-node22` | — | — |

### Lean: what serves no stage

| # | Finding | Size | Proposal |
|---|---|---|---|
| **E1** | **The older Box platform still lives on master:** `services/` (external-api, private-api, runner-controller), `apps/` (contributor portal, private console), `packages/analyzer`, `evaluation`, `planner`, `compiler`, `contracts`, `runner-protocol`, `box-contracts`, `box-trace`, most of `box-package`, and the `box export`, `submit`, `verify` and `trace` commands. The bounty tool uses one function from it (`resolveProgram` in `box-package`) | about 21,000 lines; about 15 of the hosted check's suites; roughly half of BACKLOG.md | **Owner decision:** retire it from master (it stays in Git history and could be kept on an archive branch). Move `resolveProgram` into the bounty package first. The hosted check, the backlog and the repository shrink to the product |
| E2 | Backlog items about the older platform | about half of BACKLOG.md | move with E1 |
| E3 | `hook.ts` is about 800 lines (half is a tolerant JSON rewriter, K21 S11); `settings.ts` about 860 | — | review against the lean rule after E1 |
| E4 | Two stray empty folders at the repository root (`kitchenmemorystorage`, `packagesbox-clisrc`), left by a cook's path mistake, untracked | 0 | remove when no wave is cooking |

### Sequencing (dependency order, no dates)

1. **K28 finishes** → the memory sections here are finalised → **BT32** (shared memory) is rewritten and built.
2. **E1, if the owner approves:** retire the older platform, so every later wave is cheaper.
3. **A real-use wave** in the sandbox repository: genuine small bounties, measured against this roadmap's actor questions (closes G9, tests G1).
4. **G1** designed from what real use shows, then G3 and G5 (small).
5. **G7**, publishing, when G1 has an answer.

## 4. What the owner is asked

1. Is the model right (six stages, two foundations, five actors)?
2. G1: is finding solvers part of the product?
3. G2: keep public projects only?
4. E1: retire the older Box platform from master?
5. Approve folding this into PLAN.md.
