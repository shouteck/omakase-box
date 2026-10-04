---
name: principle-redesign-from-first-principles
description: "For the Box kitchen project only. Apply when integrating a new requirement into an existing design. Redesign as if the requirement had been a foundational assumption from day one, instead of bolting it on."
metadata:
  source: https://github.com/HustleCoding/pstack/tree/e9e225bb1f3362a51ac4e489d16f2d7b13c248ff/skills/principle-redesign-from-first-principles
---

## Box project Devin compatibility contract

This skill applies only in the Box kitchen repository containing START.md and .execution/ACTIVE_PLAN.json with the box-v4 plan. Outside that project, stop this plugin workflow. Read the project AGENTS.md, START.md and docs/box-v4/PSTACK.md before acting. Their approved wave and role scope govern this skill; this text does not authorize implementation, publication or the next wave.

Use actual Devin run_subagent/read_subagent capabilities and registered Box profiles. Cursor Task, subagent_type, readonly, run_in_background and model parameters in retained source prose are conceptual references, not Devin commands. Use station leads for coordination, box-worker for approved implementation, and a distinct box-reviewer for independent verification. The root CTO and leads do not write product code. Profile identifiers, supported tools, nesting, concurrency and budgets must be verified in the current host. Never invent tool/model names or claim unobserved model diversity. Unpinned custom profiles use Devin's default router, not parent model inheritance.

Project CEO briefing/approval gates override upstream autonomy and automatic implementation/PR steps. No automatic external messages, pushes, PRs, merges, deployments, MCP setup, companion installs, model/settings changes or cross-project transcript scans. Use already authorized resources; skip unavailable surfaces explicitly. Retained source instructions apply only after these mappings and approved scope checks. Read [the compatibility map](../../DEVIN-COMPATIBILITY.md) for situational limits.

## Retained pstack guidance

# Redesign From First Principles

When integrating a change, don't bolt it onto the existing design. Redesign as if the requirement had been there from the start. The result should look like what we would have built if we'd known on day one.

- Read all affected files and understand the current design holistically
- Ask: "if we were writing this from scratch with this new requirement, what would we build?"
- Propagate the change through every reference: types, docs, examples, rationale sections
- Think about the redesign holistically, then deliver it incrementally

This is the method for preserving option value when integrating changes into an existing design.
