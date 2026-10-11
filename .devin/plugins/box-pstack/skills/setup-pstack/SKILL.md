---
name: setup-pstack
description: Inspect and verify the project-local Box pstack plugin and Devin profiles, then run only an explicitly authorized setup rehearsal. Does not change models, permissions or product-wave approval.
triggers:
- user
- model
metadata:
  source: https://github.com/HustleCoding/pstack/tree/e9e225bb1f3362a51ac4e489d16f2d7b13c248ff/skills/setup-pstack
---

# Inspect Box pstack setup in Devin

This replaces Cursor's model-rule writer. Use only in the Box kitchen repository. Read [the compatibility map](../../DEVIN-COMPATIBILITY.md), project AGENTS.md and docs/box-v4/DEVIN-SETUP.md if present. Installation and a live rehearsal require actual human setup authorization; they never approve W001 or B-series implementation.

1. Inspect the installed box-pstack source, manifest, pinned provenance and available namespaced skills. Use the current CLI's actual help/list/info behavior; do not guess arguments. Loading skill text is not a passed live invocation.
2. Inspect registered project profiles and actual run_subagent/read_subagent capabilities. Verify tool limits and max-nesting. The intended tree is CTO depth0, lead depth1, worker/reviewer depth2. If unavailable, report a labeled flat adaptation; do not claim nesting proved.
3. Preserve configured models. Omitted custom-profile model is router-selected default. Never copy upstream slugs, write ~/.cursor rules, change user/global settings, grant permissions, install companion plugins or download weights.
4. If explicitly authorized, perform the documented S001 synthetic read-only rehearsal through box-rehearsal-lead and distinct worker/reviewer children, at most three child dispatches. Use existing authenticated resources. The CTO persists genuine receipts and independently compares the fixture/candidate/verdict. Never create product changes or accept B0 tasks.
5. Record separately: source packaging, installation, actual skill invocation, profile availability, observed nested dispatch, independent verdict, receipt durability and START.md resumption. Missing evidence remains unverified. Keep W001 approval and digest untouched.

The plugin is instruction guidance, not a permission boundary or unattended scheduler. Installation at user level may expose skills in other projects; this plugin's project-scope check must stop there. No hooks, MCP servers or dependencies are supplied.
