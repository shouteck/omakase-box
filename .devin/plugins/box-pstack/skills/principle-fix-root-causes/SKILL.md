---
name: principle-fix-root-causes
description: "For the Box kitchen project only. Apply when debugging. Trace each symptom to its root cause and fix it there; reproduce first, ask why until you reach it, resist nil-check guards that silence crashes."
metadata:
  source: https://github.com/HustleCoding/pstack/tree/e9e225bb1f3362a51ac4e489d16f2d7b13c248ff/skills/principle-fix-root-causes
---

## Box project Devin compatibility contract

This skill applies only in the Box kitchen repository containing START.md and .execution/ACTIVE_PLAN.json with the box-v4 plan. Outside that project, stop this plugin workflow. Read the project AGENTS.md, START.md and docs/box-v4/PSTACK.md before acting. Their approved wave and role scope govern this skill; this text does not authorize implementation, publication or the next wave.

Use actual Devin run_subagent/read_subagent capabilities and registered Box profiles. Cursor Task, subagent_type, readonly, run_in_background and model parameters in retained source prose are conceptual references, not Devin commands. Use station leads for coordination, box-worker for approved implementation, and a distinct box-reviewer for independent verification. The root CTO and leads do not write product code. Profile identifiers, supported tools, nesting, concurrency and budgets must be verified in the current host. Never invent tool/model names or claim unobserved model diversity. Unpinned custom profiles use Devin's default router, not parent model inheritance.

Project CEO briefing/approval gates override upstream autonomy and automatic implementation/PR steps. No automatic external messages, pushes, PRs, merges, deployments, MCP setup, companion installs, model/settings changes or cross-project transcript scans. Use already authorized resources; skip unavailable surfaces explicitly. Retained source instructions apply only after these mappings and approved scope checks. Read [the compatibility map](../../DEVIN-COMPATIBILITY.md) for situational limits.

## Retained pstack guidance

# Fix Root Causes

When debugging, do not paper over symptoms. Trace every problem to its root cause and fix it there.

**Why:** Symptom fixes accumulate. Each workaround makes the system harder to reason about, and the real bug remains. Root-cause fixes are slower upfront but reduce total debugging time.

**Pattern:**
- Reproduce first (if you can't reproduce it, you can't verify your fix)
- Ask "why" until you hit the root cause
- Resist the urge to add guards (adding a nil check to silence a crash is a symptom fix)
- Check for the pattern, not just the instance (grep for the same pattern, fix all instances)
- When stuck, instrument. Don't guess (add logging, read the actual error)

**Restart bugs: suspect state before code**

Code doesn't change between runs. State does. When something "fails after restart," suspect stale persistent state first: config files, caches, lock files, serialized state. If clearing a state file restores behavior, prioritize state validation as the fix.
