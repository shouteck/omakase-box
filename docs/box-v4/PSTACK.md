# Hosts and the pstack method

Every kitchen follows Lauren Tan's (poteto) pstack; AGENTS.md makes that a rule on every host. The method: go deep before going fast, small verifiable units, proof against the real artifact, lessons encoded in tools, a human who supervises instead of gating every step. The skills, playbooks and principles are kept in one place, `.devin/plugins/box-pstack/skills/`, and every host reads them from there. The rules in [AGENTS.md](../../AGENTS.md) and the procedure in [KITCHEN.md](KITCHEN.md) are the same on every host. Where a host's plugin text disagrees with them (station leads, per-wave CEO approval, nested dispatch), AGENTS.md wins.

Any host can take any role. Record who did what in the wave file. Never claim a model, tool or diversity that was not actually used. Cook and pass are usually the same model family; the kitchen does not depend on having a second one.

| Host | Reads the rules from | How it staffs cook, pass and taster | Tried here |
|---|---|---|---|
| Claude Code | `CLAUDE.md` (imports AGENTS.md) | Named subagents in `.claude/agents/`, which point at `kitchen/roles/` | Yes: head chef, cook and pass on K1 |
| Devin | `.devin/rules/`, AGENTS.md | Named profiles in `.devin/agents/`, which point at `kitchen/roles/`; has the pstack plugin | Under the old rules only |
| Codex | AGENTS.md | Fresh agent given the role file, wave file and station card | Under the old rules only |
| OpenCode | AGENTS.md | Fresh agent given the role file, wave file and station card | No |
| Cursor | `.cursor/rules/`, AGENTS.md | Fresh agent given the role file, wave file and station card | No |
| Anything else | AGENTS.md | The same: it only needs to read files and start a fresh agent | No |

The structure is in [kitchen/README.md](../../kitchen/README.md) and does not change with the host. Thin host files exist only where a host needs them to find the role files; they never define a role themselves, except the recipient's, which must carry its text because the recipient may not read this repository.

Notes:

- The Devin plugin is a community port (HustleCoding/pstack at a pinned commit, version 0.11.3) with project adaptations; see its `PROVENANCE.json`. The official plugin (cursor/plugins, pstack) was at 0.15.10 on 5 October 2026 and is built around Cursor's own tools, cloud workers and stacked pull requests, none of which this kitchen uses. The port's principle and investigation skills are useful as reference on any host. Its mode and orchestrate entrypoints were rewritten on 5 October 2026 to point at AGENTS.md.
- Three official principles are newer than the port and are written into KITCHEN.md and the reviewer profiles instead: test behaviour not implementation, explain the number, attack the premise.
- What this kitchen deliberately does differently from the official orchestrate playbook: the CEO approves each milestone (upstream asks the human only about irreversible actions and real product calls); the status page is written by the CTO, not derived from tables; there is no cloud fan-out, since one machine runs one heavy job at a time. Upstream itself says to drop its orchestration machinery when one agent could finish the work in a session, which is the usual case here.
- Installing native Cursor pstack, changing models or adding cloud workers is a CEO decision.
- Switching host mid-wave is fine: the branch and the wave file carry everything. Say so in the wave file.
