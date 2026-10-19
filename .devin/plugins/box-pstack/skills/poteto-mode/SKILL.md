---
name: poteto-mode
description: Route START.md and Box kitchen work through AGENTS.md, a flat worker and reviewer team, and the retained pstack skills. Use for Box kitchen coordination and bounded task execution.
triggers:
- user
- model
metadata:
  source: https://github.com/HustleCoding/pstack/tree/e9e225bb1f3362a51ac4e489d16f2d7b13c248ff/skills/poteto-mode
---

# Box kitchen poteto mode for Devin

This is the Box project's replacement router, derived from poteto's principles. It is not Cursor-native Orchestrate. Use only in the Box repository containing START.md and the selected box-v4 plan. Outside it, stop this plugin workflow. Read [the compatibility map](../../DEVIN-COMPATIBILITY.md) before applying retained skills.

## Route

A bare START.md means: act as CTO and follow START.md in the repository root. Read AGENTS.md, STATUS.md and docs/box-v4/KITCHEN.md; they are the rules, the state and the procedure. This skill adds only how to use the retained pstack material on Devin.

The team is flat: dispatch `box-worker`, then a distinct `box-reviewer`, with run_subagent, one at a time, each given the wave file and a complete standalone prompt. `box-recipient` is for package-only attempts from D2.2. There is no lead layer: the CTO staffs every role this same way, never by nesting workers. The CTO writes briefs, status and kitchen tooling, never product code.

## Using the retained skills

Pick what the task needs and skip the rest: how and why to ground an existing system before changing it; architect and arena for a design with no precedent (see "Design decisions with no precedent" in KITCHEN.md); interrogate for an adversarial review; tdd, unslop and the principle skills while implementing; reflect at wave close. Read a principle's leaf skill before citing it, and say which decision it changed.

Use the playbook that fits one wave (feature, bug fix, refactoring, investigation, prototype, session pickup, pause safely). Use [the orchestrate playbook](playbooks/orchestrate.md) only for the cross-wave loop. Where any retained text conflicts with AGENTS.md, AGENTS.md wins.

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
