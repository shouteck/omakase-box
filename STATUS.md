# Status

Updated by the CTO on 13 October 2026, at the BT8b close.

## Now

- **BT8b merged and pushed** (merge `37d34c5`). An owner can opt in once (`box bounty config set instructions true`) and the tool keeps one identical block in each discovered host instruction file — Codex, Claude Code, Cursor, Gemini CLI, Copilot — saying the tool exists, plus one fixed line while a bounty is open or has an unseen solution. One file importing another gets the block once. `.box/limits.json` is retired: destinations, reminders and rulesFile are gone, cost and expected answer are generated from record facts. Bare `box bounty` prints the cold overview.
- Acceptance: fresh pass **PASS, test-verified**, on `e4ebc13` (`verify e4ebc13 PASS check=0 build=0 test:box-bounty=0 test:box-package=0 db=none 557s`). A fresh agent on a second host reported the tool and the open bounty from its instruction file alone; six measurement runs showed zero off-task pull. Security probes on the frozen built CLI all refused or stayed inside the block.
- One non-blocking finding in [BACKLOG.md](BACKLOG.md): `config set instruction-file` accepts `.git/` and `.box/` internals; a `.git/config` block bricks git in that repo. A refuse-list is the cheap fix.
- This run stopped after BT8b as named. The wave's cook session died mid-report; committed work plus verify records carried the state and a fresh pass finished it. Latest hosted run to read at next kickoff is the merge push on `37d34c5`; the preceding master run was green.
- The lab remains paused. Owner-held unmerged branches retained: `wave/A6`, `wave/K7`, `wave/BT7`, `wave/BT8-held`. About 109 older `box-bt1-*` temp directories remain outside cleanup authority. This repo's own `AGENTS.md` still carries the pre-wave block wording and `.box/limits.json` still sits there — refreshing or deleting either is the owner's.

## Next

No wave is named for a next run. The queue order per plan: **BT8c** (the secret scan split out of BT8), then **BT9** (the hook), **BT10** with a real first-time owner setup, and **BT11** after that use.
