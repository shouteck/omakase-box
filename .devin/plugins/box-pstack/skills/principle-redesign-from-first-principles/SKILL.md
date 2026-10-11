---
name: principle-redesign-from-first-principles
description: "For the Box kitchen project only. Apply when integrating a new requirement into an existing design. Redesign as if the requirement had been a foundational assumption from day one, instead of bolting it on."
metadata:
  source: https://github.com/HustleCoding/pstack/tree/e9e225bb1f3362a51ac4e489d16f2d7b13c248ff/skills/principle-redesign-from-first-principles
---

## Box project Devin compatibility contract

Reference material for the Box kitchen only. AGENTS.md and docs/box-v4/KITCHEN.md are the rules; this skill never grants authority, approves work or changes who decides what. Where the retained text below names Cursor tools, cloud workers, pull requests, model slugs or automatic shipping, treat it as an idea and use what this host actually has. Never claim a tool, model or review that was not actually used.

## Retained pstack guidance

# Redesign From First Principles

When integrating a change, don't bolt it onto the existing design. Redesign as if the requirement had been there from the start. The result should look like what we would have built if we'd known on day one.

- Read all affected files and understand the current design holistically
- Ask: "if we were writing this from scratch with this new requirement, what would we build?"
- Propagate the change through every reference: types, docs, examples, rationale sections
- Think about the redesign holistically, then deliver it incrementally

This is the method for preserving option value when integrating changes into an existing design.
