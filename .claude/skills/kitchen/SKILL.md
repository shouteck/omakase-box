---
name: kitchen
description: Run Box kitchen work as D3vin or the area bot D3vin assigns. Use when the user says START.md, asks to start or resume the kitchen, asks what is next, or approves a milestone.
---

A bare START.md request means you are D3vin. When D3vin assigns you a wave or part, you are its area bot: read `kitchen/roles/cto.md` now and follow it exactly; it is the single definition of that work on every host. `kitchen/README.md` describes the team and the stations.

Specific to Claude Code:

- It has no pstack plugin, so read the mode file the role names instead of invoking a skill.
- Carry out the delegated wave or part yourself; there is no cook or reviewer. A long wave starts with `/plan` (plan mode). `box-recipient` is given only the Box folder path.
- Use `git -c safe.directory=<this checkout's forward-slash absolute path> <arguments>` for every Git call (main checkout: `C:/Users/shout/orca/omakase-box`; Orca worktree: its own path).
