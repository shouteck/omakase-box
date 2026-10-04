---
name: poteto-mode
description: Route START.md and approved Box kitchen work through Devin pstack skills, project wave approval, station leads, workers and independent review. Use for Box kitchen coordination and bounded task execution.
triggers:
- user
- model
metadata:
  source: https://github.com/HustleCoding/pstack/tree/e9e225bb1f3362a51ac4e489d16f2d7b13c248ff/skills/poteto-mode
---

# Box kitchen poteto mode for Devin

This is the Box project's replacement router, derived from poteto's principles. It is not Cursor-native Orchestrate. Use only in the Box repository containing START.md and the selected box-v4 plan. Outside it, stop this plugin workflow. Read [the compatibility map](../../DEVIN-COMPATIBILITY.md) before applying retained skills.

## Route and reconcile

A bare START.md invokes the project briefing process, not implementation. Read AGENTS.md, START.md, docs/box-v4/PSTACK.md and the active plan/state. Inspect the actual plugin version, loaded skills, registered profiles, tools and approval evidence. Report missing capabilities explicitly. Reading this file does not prove skill invocation or delegation.

Use [the Box Orchestrate playbook](playbooks/orchestrate.md) for programme coordination. This playbook was added by this project; it is absent from the pinned community port. Root CTO and station leads coordinate only. They may author governance artifacts within approved scope, but never product code. Box workers implement only under an approved, bounded wave; independent reviewers inspect immutable candidates they did not author.

Use actual Devin run_subagent/read_subagent profiles. Station routes are box-product-lead, box-platform-lead and box-assurance-lead. Approved implementation uses box-worker; independent checks use box-reviewer. Setup rehearsal uses box-rehearsal-lead, box-rehearsal-worker and box-rehearsal-reviewer. Do not call Cursor Task or guess its argument mapping. Nesting and tools come from observed host capabilities/profile configuration, not role labels. Omitted custom-profile model uses the router/default policy; never claim parent inheritance or multi-model diversity without evidence.

## Authority and situational work

The CEO must approve each new product wave. START.md, upstream autonomy prose, old approval or a child report cannot authorize a new wave. Holds stop dispatch; exact held wave requires CEO resume authorization. Setup S001 is separate from W001 and cannot accept B0 tasks. No automatic external messages, cloud workers, purchases, pushes, PRs, merges, deployments, dependencies, MCP setup or user/global model settings. Honor specific existing authorization without repeatedly asking.

Within approved scope, choose the relevant retained playbook: Investigation for cited read-only questions; Feature or Bug fix for bounded worker tasks; Refactoring for authorized behavior-preserving changes; Session pickup and Pause safely for actual interruptions. Use how/why to ground existing systems; architect/arena for design alternatives only within the approved budget and isolated ownership; interrogate for independent critique. Apply the compatibility map before following their source instructions. Proposed prototypes or architecture sketches containing product code belong to workers and an approved implementation scope.

Read principles that materially affect the task. State the decisions they changed, rather than mechanically citing every principle. Keep an evidence-backed decision trail for sustained work. Use existing tests/user-surface tools when approved; missing companion skills are capability gaps, not permission to install them. Never claim unavailable model, human, native-orch or real-product validation.

## Retained principle index


Read the leaf skill in full for any principle you apply. Each entry names when it applies.

**Core**

- **Laziness Protocol** (**principle-laziness-protocol**). Refactoring, sizing a diff, or tempted to add abstractions, layers, or signal threading. Bias to deletion and the smallest change that solves the problem.
- **Foundational Thinking** (**principle-foundational-thinking**). Before writing logic: core types and data structures, scaffold-vs-feature sequencing, what concurrent actors share.
- **Redesign from First Principles** (**principle-redesign-from-first-principles**). Integrating a new requirement into an existing design. Redesign as if it had been foundational from day one.
- **Subtract Before You Add** (**principle-subtract-before-you-add**). Sequencing an addition, refactor, or rewrite. Remove dead weight first, then build on the simpler base.
- **Minimize Reader Load** (**principle-minimize-reader-load**). Reviewing or shaping code that's hard to trace. Count layers and hidden state, collapse one-caller wrappers, shrink mutable scope.
- **Outcome-Oriented Execution** (**principle-outcome-oriented-execution**). Planned rewrites and migrations with explicit phase boundaries. Converge on the target architecture, don't preserve throwaway compatibility states.
- **Experience First** (**principle-experience-first**). Product, UX, or feature-scope tradeoffs. Choose user delight over implementation convenience.
- **Exhaust the Design Space** (**principle-exhaust-the-design-space**). A novel interaction or architectural decision with no precedent. Build 2-3 competing prototypes and compare before committing.
- **Build the Lever** (**principle-build-the-lever**). Any non-trivial work. Build the tool that does or proves it (codemod, script, generator), not by hand; the tool is the artifact a reviewer reruns.

**Architecture**

- **Model the Domain** (**principle-model-the-domain**). Writing stateful logic, or code that branches a lot or repeats a shape assumption across files. Encode the domain in a structure (state machine, typed model, table or registry, reducer, boundary, the right collection) instead of scattered conditionals.
- **Boundary Discipline** (**principle-boundary-discipline**). Wiring validation, error handling, or framework adapters. Guards at system boundaries, trust internal types, keep business logic pure.
- **Type System Discipline** (**principle-type-system-discipline**). Designing types or a signature in any typed language. Make illegal states unrepresentable, brand primitives, parse external data at boundaries.
- **Make Operations Idempotent** (**principle-make-operations-idempotent**). Designing commands, lifecycle steps, or loops that run amid crashes and retries. Converge to the same end state.
- **Migrate Callers Then Delete Legacy APIs** (**principle-migrate-callers-then-delete-legacy-apis**). Introducing a new internal API while old callers exist. Migrate and delete in one wave.
- **Separate Before Serializing Shared State** (**principle-separate-before-serializing-shared-state**). Concurrent actors might write the same file, branch, key, or object. Eliminate the sharing first.

**Verification**

- **Prove It Works** (**principle-prove-it-works**). After a task, before declaring done. Verify against the real artifact, not a proxy or "it compiles".
- **Fix Root Causes** (**principle-fix-root-causes**). Debugging. Trace each symptom to its root cause, reproduce first, ask why until you reach it.
- **Sequence Work into Verifiable Units** (**principle-sequence-verifiable-units**). Multi-step work (sweeps, migrations, runs of similar edits) and how you stack commits and PRs. Break work into small units that each end in a check, verify each before the next, and order delivery so the sequence proves itself.

**Delegation**

- **Guard the Context Window** (**principle-guard-the-context-window**). Context fills up: large outputs, long files, repeated reads, fan-out planning. Route bulk to subagents, keep summaries in the main thread.
- **Never Block on the Human** (**principle-never-block-on-the-human**). Tempted to ask "should I do X?" on reversible work. Proceed, present the result, let the human course-correct.

**Meta**

- **Encode Lessons in Structure** (**principle-encode-lessons-in-structure**). You catch yourself writing the same instruction a second time. Encode it as a lint, metadata flag, runtime check, or script instead of more text.


## Principle scope clarification

The retained Never Block on the Human principle applies to routine choices inside approved scope. It does not remove CEO wave gates. Subtract/migrate/delete principles do not authorize destroying preserved legacy assets. Build the Lever does not authorize unsolicited runtime code, automation or purchases. Separate independent agent identity and immutable evidence are required even when model diversity is unavailable.
