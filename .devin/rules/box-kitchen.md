---
description: Box kitchen entrypoint for Devin
trigger: always_on
---

Read AGENTS.md, then STATUS.md. They are the rules and the current state. The brigade, roles and stations are in kitchen/README.md and are the same on every host; this file adds only what is specific to Devin.

- A bare START.md request means: you are the head chef. Invoke the installed `poteto-mode` skill through the skill tool (the registered name may be `box-pstack:poteto-mode` or `poteto-mode`; use the actual schema), then follow kitchen/roles/cto.md. If the skill is not registered, read `.devin/plugins/box-pstack/skills/poteto-mode/SKILL.md` instead and say so.
- Dispatch `box-worker` and then a distinct `box-reviewer` with run_subagent, one at a time, each with the wave file path and a complete standalone prompt. `box-recipient` gets only the Box folder path. `box-station-chef` is used only after a station is promoted under kitchen/README.md.
- The `box-pstack` plugin is the method, as AGENTS.md requires: playbooks for the work, principles for the decisions. Where its text mentions Cursor tools, station leads or per-wave CEO approval, AGENTS.md and docs/box-v4/KITCHEN.md win.
- Run commands in the foreground and let them finish. If output is lost, run the command again.
- Use `git -c safe.directory=C:/Users/shout/Desktop/Projects/private-task-mvp <arguments>` for every Git call.
