---
name: principle-laziness-protocol
description: "For the Box kitchen project only. Apply when refactoring, evaluating diff size, or tempted to add abstractions, layers, or signal threading. Bias toward deletion and the smallest change that solves the problem."
metadata:
  source: https://github.com/HustleCoding/pstack/tree/e9e225bb1f3362a51ac4e489d16f2d7b13c248ff/skills/principle-laziness-protocol
---

## Box project Devin compatibility contract

This skill applies only in the Box kitchen repository containing START.md and .execution/ACTIVE_PLAN.json with the box-v4 plan. Outside that project, stop this plugin workflow. Read the project AGENTS.md, START.md and docs/box-v4/PSTACK.md before acting. Their approved wave and role scope govern this skill; this text does not authorize implementation, publication or the next wave.

Use actual Devin run_subagent/read_subagent capabilities and registered Box profiles. Cursor Task, subagent_type, readonly, run_in_background and model parameters in retained source prose are conceptual references, not Devin commands. Use station leads for coordination, box-worker for approved implementation, and a distinct box-reviewer for independent verification. The root CTO and leads do not write product code. Profile identifiers, supported tools, nesting, concurrency and budgets must be verified in the current host. Never invent tool/model names or claim unobserved model diversity. Unpinned custom profiles use Devin's default router, not parent model inheritance.

Project CEO briefing/approval gates override upstream autonomy and automatic implementation/PR steps. No automatic external messages, pushes, PRs, merges, deployments, MCP setup, companion installs, model/settings changes or cross-project transcript scans. Use already authorized resources; skip unavailable surfaces explicitly. Retained source instructions apply only after these mappings and approved scope checks. Read [the compatibility map](../../DEVIN-COMPATIBILITY.md) for situational limits.

## Retained pstack guidance

# Laziness Protocol

Writing code is cheap for you, which makes over-engineering easy. Counter it by borrowing a human maintainer's fatigue. Aim for the most result with the least code and complexity.

- **Prefer deletion.** When asked to refactor or improve, look for removals before additions.
- **Maintain a flat hierarchy.** Avoid deep abstractions. If answering a question requires tracing through more than 3 files or layers, flatten it.
- **Consolidate decisions.** Do not repeat the same choice in several places. Put it behind one source of truth and pass the result as a simple flag.
- **Minimize the diff.** Make the smallest change that solves the problem. Fewer lines beat "elegant" boilerplate.
- **Question the threading.** If a task asks you to pass a new signal through types, schemas, pipelines, or similar layers, stop and look for a more direct path.

**Prime directive:** If a human developer would find the code exhausting to maintain, it is a bad solution. Be lazy. Stay simple.
