---
description: Box kitchen entrypoint for Devin
trigger: always_on
---

Read AGENTS.md, then STATUS.md. They are the rules and the current state; this file adds only what is specific to Devin.

- A bare START.md request means: act as CTO and follow START.md.
- The team is flat. Dispatch `box-worker` and then a distinct `box-reviewer` with run_subagent, one at a time, each with the wave file path and a complete standalone prompt. The lead profiles in `.devin/agents/` are for parallel work only.
- The `box-pstack` plugin skills are reference material. Where their text mentions station leads, per-wave CEO approval or docs that no longer exist, AGENTS.md and docs/box-v4/KITCHEN.md win.
- Run commands in the foreground and let them finish. If output is lost, run the command again.
- Use `git -c safe.directory=C:/Users/shout/Desktop/Projects/private-task-mvp <arguments>` for every Git call.
