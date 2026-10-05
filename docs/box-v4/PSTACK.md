# Hosts and the pstack method

Every kitchen follows Lauren Tan's (poteto) pstack; AGENTS.md makes that a rule on every host. The method: go deep before going fast, small verifiable units, proof against the real artifact, lessons encoded in tools, a human who supervises instead of gating every step. The skills, playbooks and principles are kept in one place, `.devin/plugins/box-pstack/skills/`, and every host reads them from there. The rules in [AGENTS.md](../../AGENTS.md) and the procedure in [KITCHEN.md](KITCHEN.md) are the same on every host. Where a host's plugin text disagrees with them (station leads, per-wave CEO approval, nested dispatch), AGENTS.md wins.

Any host can take any role. Record who did what in the wave file. Never claim a model, tool or diversity that was not actually used. A reviewer from a different model family is preferred where the brief asks for it, as far as usage allows; a wave never waits for one.

| Host | CTO | Worker | Reviewer | Recipient | Setup in this repository |
|---|---|---|---|---|---|
| Claude Code | yes | `box-worker` | `box-reviewer` | `box-recipient` | `CLAUDE.md`, `.claude/agents/`, `.claude/skills/kitchen/` |
| Devin | yes | `box-worker` | `box-reviewer` | `box-recipient` | `.devin/rules/`, `.devin/agents/`, `.devin/plugins/box-pstack/` |
| Cursor | yes | built-in agent | built-in agent | built-in agent, given the folder only | `.cursor/rules/box-kitchen.mdc`; native pstack is not installed on this machine |
| Codex | yes | collaboration tools | collaboration tools | collaboration tools, given the folder only | reads `AGENTS.md` directly |

Notes:

- The Devin plugin is a community port (HustleCoding/pstack at a pinned commit, version 0.11.3) with project adaptations; see its `PROVENANCE.json`. The official plugin (cursor/plugins, pstack) was at 0.15.10 on 5 October 2026 and is built around Cursor's own tools, cloud workers and stacked pull requests, none of which this kitchen uses. The port's principle and investigation skills are useful as reference on any host. Its mode and orchestrate entrypoints were rewritten on 5 October 2026 to point at AGENTS.md.
- Three official principles are newer than the port and are written into KITCHEN.md and the reviewer profiles instead: test behaviour not implementation, explain the number, attack the premise.
- What this kitchen deliberately does differently from the official orchestrate playbook: the CEO approves each milestone (upstream asks the human only about irreversible actions and real product calls); the status page is written by the CTO, not derived from tables; there is no cloud fan-out, since one machine runs one heavy job at a time. Upstream itself says to drop its orchestration machinery when one agent could finish the work in a session, which is the usual case here.
- Installing native Cursor pstack, changing models or adding cloud workers is a CEO decision.
- Switching host mid-wave is fine: the branch and the wave file carry everything. Say so in the wave file.
