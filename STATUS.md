# Status

Updated by the CTO on 13 October 2026, at the BT10 close.

## Now

- **BT10 complete, merged and pushed.** Software gate: PASS on `c61c07f`, merged `2d0b8b4`. Real journey: run end-to-end on the public repo and live-verified by the pass — issue #5 posted, two blind solvers answered as PRs #7/#8 (one asked a real question), the collector found the bounty via the AGENTS.md block, `apply` refused the engineered clash, it merged `7d94c4e` itself (`d493dbe`), and the tool closed the bounty — block reads `closed-merged` naming PR 8. Reader bounty #6 closed `closed-none`; the outside reader found 2 open then 0. All three block states proven live.
- Journey evidence and per-step record: [waves/BT10.md](waves/BT10.md). Journey-review verdict: PASS, live-verified (commit `9e20e5a` on master).
- Owner decisions made this wave: "ask me each time" authority for this repo (recorded in owner settings); owner-comprehension UX step deliberately skipped (owner designed the flow); instruction block enabled, hook declined — its live-host proof deferred to a sandbox run.
- This repository's authority is now ask-mode: every post pauses for the owner. Instruction blocks are on in AGENTS.md and .cursor/rules/box-kitchen.mdc (CLAUDE.md imports AGENTS.md — block kept once).
- Nonblocking findings in [BACKLOG.md](BACKLOG.md): same-account comments are invisible to `status --comments`; closed-by-branch-deletion PRs read "not merged" externally — only the block records which solution merged; plus the carried BT8/BT9 lists.
- Left on GitHub by exact name: closed issues #5 and #6, closed PRs #7 and #8, solver branches `solve/bt-22f3b1723a38` and `solver/bt-22f3b1723a38-backlog-correction` (public evidence of the solutions; deleting them is the owner's).
- This run stopped after BT10 as named. The lab remains paused. Owner-held unmerged branches retained: `wave/A6`, `wave/K7`, `wave/BT7`, `wave/BT8-held`. About 109 older `box-bt1-*` temp directories remain outside cleanup authority. `.box/limits.json` still sits in this repo — deleting it is the owner's.

## Next

No wave is named. Briefed on 13 October 2026 and ready, in this order:

1. **K15** — a sandbox repository the owner allows once, so real runs never need the owner again; also the hook's live-host proof owed since BT9 and a two-agent check of owner-facing wording. Creates a new public repository on the owner's account, so its pre-cook card waits for the owner's go. [waves/K15.md](waves/K15.md)
2. **BT11a** — a bounty states the owner's reward, with a limit on what is promised at once. [waves/BT11a.md](waves/BT11a.md)
3. **BT11b** — the solver's payment link and the message telling the owner whom to pay; real run in the sandbox. [waves/BT11b.md](waves/BT11b.md)

The old BT11 was split and rewritten; its condition that BT11 waits for a real first use by the owner is withdrawn (see [waves/BT11.md](waves/BT11.md)). The owner's instruction of 13 October: a test must not need the owner's input.
