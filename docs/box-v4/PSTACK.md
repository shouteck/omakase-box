# Hosts and the pstack method

The kitchen borrows its method from Lauren Tan's (poteto) pstack: small verifiable units, proof against the real artifact, lessons encoded in tools, a human who supervises instead of gating every step. The rules in [AGENTS.md](../../AGENTS.md) and the procedure in [KITCHEN.md](KITCHEN.md) are the same on every host. Where a host's plugin text disagrees with them (station leads, per-wave CEO approval, nested dispatch), AGENTS.md wins.

Any host can take any role. Record who did what in the wave file. Never claim a model, tool or diversity that was not actually used. A reviewer from a different model family is preferred where the brief asks for it, as far as usage allows; a wave never waits for one.

| Host | CTO | Worker | Reviewer | Recipient | Setup in this repository |
|---|---|---|---|---|---|
| Claude Code | yes | `box-worker` | `box-reviewer` | `box-recipient` | `CLAUDE.md`, `.claude/agents/`, `.claude/skills/kitchen/` |
| Devin | yes | `box-worker` | `box-reviewer` | `box-recipient` | `.devin/rules/`, `.devin/agents/`, `.devin/plugins/box-pstack/` |
| Cursor | yes | built-in agent | built-in agent | built-in agent, given the folder only | `.cursor/rules/box-kitchen.mdc`; native pstack is not installed on this machine |
| Codex | yes | collaboration tools | collaboration tools | collaboration tools, given the folder only | reads `AGENTS.md` directly |

Notes:

- The Devin plugin is a community port (HustleCoding/pstack at a pinned commit) with project adaptations; see its `PROVENANCE.json`. Its skills are useful as reference. Its station-lead routing and lead profiles are no longer the default; use them only for genuinely parallel work.
- Installing native Cursor pstack, changing models or adding cloud workers is a CEO decision.
- Switching host mid-wave is fine: the branch and the wave file carry everything. Say so in the wave file.
