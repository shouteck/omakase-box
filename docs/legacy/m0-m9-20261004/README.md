# Private Task MVP: implementation packet

This directory contains the build specification, resumable execution records and an implementation in progress. Foundation (M0), typed contracts (M1.1) and transactional persistence (M1.2) have passed independent review. Role/session enforcement and the runner controller are being implemented; the MVP has not been delivered. The specification is based on the 35-page research proposal included at `docs/research/source.pdf`.

Open this directory as the agent's project and give it this single instruction:

    START.md

If the agent is in another working directory, use:

    Follow C:/Users/shout/Desktop/Projects/private-task-mvp/START.md.

The same instruction resumes interrupted work. `START.md` is the execution entry point: it reads the target milestone from `tasks/task-graph.json` and selects the next eligible unfinished tasks from `.execution/state.json`. The user need not repeat the target or choose subsequent milestones. It defines orchestration, independent review and handoffs. `PLAN.md` summarizes milestones. `docs/SPEC.md`, `docs/COMPOSITION.md`, `docs/ARCHITECTURE.md` and `docs/SECURITY.md` specify implementation. Every milestone has detailed task cards in `milestones/`.

The command is an instruction to an agent, not a shell executable. Actual parallel handoffs depend on the agent runtime exposing subagent tools. A sequential fallback is specified. Session limits, unavailable isolation infrastructure and missing private-model configuration can interrupt execution; persisted state must make the exact remaining work clear.

The intended deliverable is a customer-hosted prototype with composable work units, a coherent full-stack task and an executable codebase security-policy task, honest demo/private-model modes, a real isolated runner, a PM console, a contributor portal, private acceptance, a payment-obligation ledger and research instrumentation. A live human pilot and broad abstraction claims are separate research work; agents must not simulate them into existence.
