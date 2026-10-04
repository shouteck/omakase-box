---
name: principle-encode-lessons-in-structure
description: "For the Box kitchen project only. Apply when you catch yourself writing the same instruction a second time, or notice a recurring correction. Encode the rule as a lint, metadata flag, runtime check, or script instead of more text."
metadata:
  source: https://github.com/HustleCoding/pstack/tree/e9e225bb1f3362a51ac4e489d16f2d7b13c248ff/skills/principle-encode-lessons-in-structure
---

## Box project Devin compatibility contract

This skill applies only in the Box kitchen repository containing START.md and .execution/ACTIVE_PLAN.json with the box-v4 plan. Outside that project, stop this plugin workflow. Read the project AGENTS.md, START.md and docs/box-v4/PSTACK.md before acting. Their approved wave and role scope govern this skill; this text does not authorize implementation, publication or the next wave.

Use actual Devin run_subagent/read_subagent capabilities and registered Box profiles. Cursor Task, subagent_type, readonly, run_in_background and model parameters in retained source prose are conceptual references, not Devin commands. Use station leads for coordination, box-worker for approved implementation, and a distinct box-reviewer for independent verification. The root CTO and leads do not write product code. Profile identifiers, supported tools, nesting, concurrency and budgets must be verified in the current host. Never invent tool/model names or claim unobserved model diversity. Unpinned custom profiles use Devin's default router, not parent model inheritance.

Project CEO briefing/approval gates override upstream autonomy and automatic implementation/PR steps. No automatic external messages, pushes, PRs, merges, deployments, MCP setup, companion installs, model/settings changes or cross-project transcript scans. Use already authorized resources; skip unavailable surfaces explicitly. Retained source instructions apply only after these mappings and approved scope checks. Read [the compatibility map](../../DEVIN-COMPATIBILITY.md) for situational limits.

## Retained pstack guidance

# Encode Lessons in Structure

Encode recurring fixes in mechanisms (tools, code, metadata, automation) instead of textual instructions. Every error, human correction, and unexpected outcome is a learning signal. Capture it, route it, and close the loop.

**Why:** Textual instructions are easy to miss. They require the reader to notice, remember, and comply. Structural mechanisms (lint rules, metadata flags, runtime checks, automation scripts) enforce the rule without cooperation.

**Pattern:**
When you catch yourself writing the same instruction a second time:
1. Ask: can this be a lint rule, a metadata flag, a runtime check, or a script?
2. If yes, encode it. Delete the instruction
3. If no (genuinely requires judgment), make the instruction more prominent and add an example of the failure mode

**Pick the strongest rung.** When more than one mechanism would work, choose the strongest the situation allows (an unrepresentable state that cannot compile, then a lint or banned API that fails CI, then a canonical helper, then a runtime check), because agents copy whatever the surrounding code already does and a weaker guard becomes the next template.

**Corollary:** Don't paper over symptoms. If the fix is structural, ONLY use the structural fix. The instruction IS the symptom.

**Feedback loop:**
- **Capture every correction.** When the human intervenes or tests fail, decide if it's a one-off or a pattern.
- **Route to the right layer.** One-off -> brain note. Recurring fix -> skill or lint rule. Systemic issue -> principle.
- **Close the loop.** Don't just record. Apply now or create a concrete todo.

**Anti-patterns:**
- Acknowledging without recording ("I'll keep that in mind" does not persist)
- Recording without routing (a brain note about a lint rule that should exist is wasted unless the lint rule gets implemented)
- Fixing without generalizing (fixing one instance while leaving the recurring pattern intact)
