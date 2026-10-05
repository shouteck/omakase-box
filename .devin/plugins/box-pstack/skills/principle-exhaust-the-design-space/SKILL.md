---
name: principle-exhaust-the-design-space
description: "For the Box kitchen project only. Apply when facing a novel UI interaction or architectural decision with no precedent in the codebase. Build 2-3 competing prototypes and compare side by side before committing."
metadata:
  source: https://github.com/HustleCoding/pstack/tree/e9e225bb1f3362a51ac4e489d16f2d7b13c248ff/skills/principle-exhaust-the-design-space
---

## Box project Devin compatibility contract

Reference material for the Box kitchen only. AGENTS.md and docs/box-v4/KITCHEN.md are the rules; this skill never grants authority, approves work or changes who decides what. Where the retained text below names Cursor tools, cloud workers, pull requests, model slugs or automatic shipping, treat it as an idea and use what this host actually has. Never claim a tool, model or review that was not actually used.

## Retained pstack guidance

# Exhaust the Design Space

When a novel interaction or architectural decision has no established precedent, explore several concrete alternatives before implementation. Building the wrong thing costs more than exploring three options.

**The rule:** When the right answer is not obvious, build 2-3 competing prototypes or sketches. Compare them side by side. Only then commit.

**When it applies:**
- Novel UI interactions (no prior art in the codebase)
- Architectural choices with multiple viable approaches
- Product design decisions where user experience depends on feel, not logic

**When it doesn't:**
- Mechanical implementation where the pattern is established
- Bug fixes or refactors with a clear target state
- Changes where constraints dictate a single viable approach
