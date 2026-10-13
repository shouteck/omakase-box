# Status

Updated by the CTO on 13 October 2026, at the BT9 close.

## Now

- **BT9 merged and pushed** (merge `425ad90`). `box bounty hook` gives a session bounty awareness through the host's own hook settings: `start` reports open state in one line, `pause`/`finish` report each new arrival once, `finish` names a left merge conflict, and a run that just recognised a merged solution says so. Silent, exit 0, no `.box` written when nothing is open. GitHub is asked at most once per five minutes, each `gh` call capped at 8 s, each run bounded by call count and wall clock inside the host's 30 s entry timeout. `hook on|off --host devin|claude` writes/removes only project settings, with full disclosure and a `--confirm` gate; `off` restores the file byte for byte.
- Acceptance: fresh pass **PASS** on `ecf2479` after one correction (`verify ecf2479 PASS check=0 build=0 test:box-bounty=0 test:box-package=0 db=none 420s`; 376 bounty + 142 package tests). First round FAILED `031b8b5` on five live-demonstrated defects — dangling settings symlink escaping the project, tampered record text injected into agent context, dead merge-recognition notices, unbounded `gh` pagination, `hook off` byte drift on empty shapes; all fixed and re-proven.
- **Unmet criterion, unwaived:** the brief's "proved on at least two real hosts" could not be met on this machine — Devin CLI is unauthenticated, Cursor is GUI-only, no `claude`/`codex`/`gemini` on PATH. Adapters are built to installed documentation and file/command-tested; no host has fired the hook in a live session. A real run happens the first time the owner or an agent switches it on in a drivable host.
- Nonblocking items in [BACKLOG.md](BACKLOG.md): the reviewer's owner-facing observation that `syncGitHubDecision` ignores withdrawn authority (still closes a posted issue on a recognised merge), plus the carried BT8b/BT8c lists.
- This run stopped after BT9 as named. Latest hosted run to read at next kickoff is the merge push on `425ad90`; the BT8c merge run was in flight at that close.
- The lab remains paused. Owner-held unmerged branches retained: `wave/A6`, `wave/K7`, `wave/BT7`, `wave/BT8-held`. About 109 older `box-bt1-*` temp directories remain outside cleanup authority. This repo's own `AGENTS.md` still carries the pre-wave block wording and `.box/limits.json` still sits there — refreshing or deleting either is the owner's. Switching the hook on here (`box bounty hook on --host devin`) is likewise the owner's.

## Next

No wave is named for a next run. The queue order per plan: **BT10** with a real first-time owner setup, and **BT11** after that use.
