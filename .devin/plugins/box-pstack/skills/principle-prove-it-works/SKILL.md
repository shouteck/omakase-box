---
name: principle-prove-it-works
description: "For the Box kitchen project only. Apply after completing a task, before declaring done. Verify against the real artifact (run the feature, read the actual value, inspect the diff), not a proxy, self-report, or 'it compiles."
metadata:
  source: https://github.com/HustleCoding/pstack/tree/e9e225bb1f3362a51ac4e489d16f2d7b13c248ff/skills/principle-prove-it-works
---

## Box project Devin compatibility contract

This skill applies only in the Box kitchen repository containing START.md and .execution/ACTIVE_PLAN.json with the box-v4 plan. Outside that project, stop this plugin workflow. Read the project AGENTS.md, START.md and docs/box-v4/PSTACK.md before acting. Their approved wave and role scope govern this skill; this text does not authorize implementation, publication or the next wave.

Use actual Devin run_subagent/read_subagent capabilities and registered Box profiles. Cursor Task, subagent_type, readonly, run_in_background and model parameters in retained source prose are conceptual references, not Devin commands. Use station leads for coordination, box-worker for approved implementation, and a distinct box-reviewer for independent verification. The root CTO and leads do not write product code. Profile identifiers, supported tools, nesting, concurrency and budgets must be verified in the current host. Never invent tool/model names or claim unobserved model diversity. Unpinned custom profiles use Devin's default router, not parent model inheritance.

Project CEO briefing/approval gates override upstream autonomy and automatic implementation/PR steps. No automatic external messages, pushes, PRs, merges, deployments, MCP setup, companion installs, model/settings changes or cross-project transcript scans. Use already authorized resources; skip unavailable surfaces explicitly. Retained source instructions apply only after these mappings and approved scope checks. Read [the compatibility map](../../DEVIN-COMPATIBILITY.md) for situational limits.

## Retained pstack guidance

# Prove It Works

Verify every task output by checking the real thing directly. Do not infer from proxies, self-reports, or "it compiles."

**Why:** Unverified work has unknown correctness. Indirect verification (file mtimes, output freshness, agent self-reports, cached screenshots) feels cheaper than direct observation. Acting on a wrong inference costs far more than checking the source.

**Pattern:** After completing any task, ask: "how do I prove this actually works?"

Check the real thing, not a proxy:
- Check process liveness directly, not indirectly through derived state
- Read the actual value, not a cached or derived representation
- When verification fails, suspect the observation method before suspecting the system

Code and features:
1. Build it (necessary but not sufficient)
2. Run it and exercise the actual feature path
3. Check the full chain: does data flow from input to output?
4. For integrations, test the full communication path end-to-end

Delegation: trust artifacts, not self-reports.
When verifying delegated work, inspect the actual output artifact (git diff, file contents, runtime behavior), not the delegate's summary. Agents report what they intended, not always what happened.

## Script the check when you can

The strongest proof is a deterministic script that re-runs the same comparison, not a one-time eyeball. Write the script, run it, and keep its output as an artifact a reviewer can re-run instead of trusting your word. A script comparing the old and new compiled output catches what a glance misses.

Keep the artifact visible for the human. Commit it only for large or complex work where the trail has to be auditable later, like a big port or migration (the **show-me-your-work** skill). Most work just needs it visible, not committed.
