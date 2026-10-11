# Reviewed sources and provenance

## Product direction

User-supplied Product Vision Supplement V4, 16 pages, dated 4 October 2026, is copied unchanged to docs/research/box_native_product_vision_supplement_v4.pdf. SHA-256 is da3196adc5f2b21c586b981d092c24633c3d5bc935d46bf2269109fe5ccc9e2d. The roadmap and schema/lifecycle sections ground the Open Box-first plan. The 35-page companion at docs/research/source.pdf remains deeper research background; it is not a new execution authority.

CEO setup answers confirmed Cursor native pstack plus Codex fallback, explicit approval each new wave, and Open Boxes first while preserving existing work. These preferences override third-party workflow defaults.

## Primary pstack material reviewed on 4 October 2026

- [Official README](https://github.com/cursor/plugins/blob/main/pstack/README.md) and [manifest](https://github.com/cursor/plugins/blob/main/pstack/.cursor-plugin/plugin.json). Installation/setup and observed version 0.15.9. Mutable source, installed version unverified.
- [Poteto mode](https://github.com/cursor/plugins/blob/main/pstack/skills/poteto-mode/SKILL.md). Role routing, configurable models and workflow boundaries.
- [Orchestrate](https://github.com/cursor/plugins/blob/main/pstack/skills/poteto-mode/playbooks/orchestrate.md). Programme-level coordination, scoped delegation, dispatch receipts and revision-aware verification.
- [Swarm](https://github.com/cursor/plugins/blob/main/pstack/skills/swarm/SKILL.md). Bounded coverage and explicit missing-result gaps.
- [Setup pstack](https://github.com/cursor/plugins/blob/main/pstack/skills/setup-pstack/SKILL.md). User-level role configuration is a separate setup action.
- [Architect](https://github.com/cursor/plugins/blob/main/pstack/skills/architect/SKILL.md), [Interrogate](https://github.com/cursor/plugins/blob/main/pstack/skills/interrogate/SKILL.md) and [Show me your work](https://github.com/cursor/plugins/blob/main/pstack/skills/show-me-your-work/SKILL.md). Situational design, independent challenge and decision evidence.
- [Multi-phase planning](https://github.com/cursor/plugins/blob/main/pstack/skills/poteto-mode/playbooks/multi-phase-plan.md) and [plan checker](https://github.com/cursor/plugins/blob/main/pstack/skills/poteto-mode/scripts/check-plan.mjs). Reviewed as references; not copied/executed. This project intentionally uses adapted task-specific verification, not a claim of conformance to the upstream ten-lane PR template.
- [Cursor rules](https://cursor.com/docs/rules), [subagents](https://cursor.com/docs/subagents) and [plugins](https://cursor.com/docs/plugins). Native project rule/task capabilities must still be checked in the actual installed runtime.

No third-party code is vendored, installed or run. Reviewed plugin documentation does not grant external actions. Local file inventories and Git inspections ground the reuse assessment; no product suite was run in this instruction-only revision.
