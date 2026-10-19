---
description: Box kitchen entrypoint for Devin
trigger: always_on
---

Read AGENTS.md, then STATUS.md. They are the rules and the current state. The brigade, roles and stations are in kitchen/README.md and are the same on every host; this file adds only what is specific to Devin.

- A bare START.md request means: you are the head chef. Invoke the installed `poteto-mode` skill through the skill tool (the registered name may be `box-pstack:poteto-mode` or `poteto-mode`; use the actual schema), then follow kitchen/roles/cto.md. If the skill is not registered, read `.devin/plugins/box-pstack/skills/poteto-mode/SKILL.md` instead and say so.
- Dispatch `box-worker` and then a distinct `box-reviewer` with run_subagent, one at a time, each with the wave file path and a complete standalone prompt. `box-recipient` gets only the Box folder path.
- The `box-pstack` plugin is the method, as AGENTS.md requires: playbooks for the work, principles for the decisions. Where its text mentions Cursor tools, station leads or per-wave CEO approval, AGENTS.md and docs/box-v4/KITCHEN.md win.
- Standing owner approval, 6 October 2026: at wave close, delete the wave's local branch with `git branch -d` once it is fully merged into master, without asking. This covers that one command on a merged wave branch and nothing else; `-D`, unmerged branches and every other deletion still need confirmation. If the host still insists on a confirmation for that one command, skip the deletion silently: never hold a close for it, and never list it as a held item or a decision for the owner. The next kickoff sweeps merged wave branches.
- Standing owner approval, 6 October 2026: at every wave close, with no test running, delete the items in the system temp folder named `box-d21-*`, `box-k6-*` and `kitchen-verify-pg*`, and stop any embedded test database a killed verify left running (its own `pg_ctl stop` on that data folder). Only this kitchen's tests create them. Do not ask and do not hold a close for it. Nothing else in the temp folder is covered.
- Run commands in the foreground and let them finish. If output is lost, run the command again.
- Use `git -c safe.directory=C:/Users/shout/Desktop/Projects/private-task-mvp <arguments>` for every Git call.
