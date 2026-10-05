---
name: principle-encode-lessons-in-structure
description: "For the Box kitchen project only. Apply when you catch yourself writing the same instruction a second time, or notice a recurring correction. Encode the rule as a lint, metadata flag, runtime check, or script instead of more text."
metadata:
  source: https://github.com/HustleCoding/pstack/tree/e9e225bb1f3362a51ac4e489d16f2d7b13c248ff/skills/principle-encode-lessons-in-structure
---

## Box project Devin compatibility contract

Reference material for the Box kitchen only. AGENTS.md and docs/box-v4/KITCHEN.md are the rules; this skill never grants authority, approves work or changes who decides what. Where the retained text below names Cursor tools, cloud workers, pull requests, model slugs or automatic shipping, treat it as an idea and use what this host actually has. Never claim a tool, model or review that was not actually used.

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
