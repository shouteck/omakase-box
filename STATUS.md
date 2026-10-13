# Status

Updated by the CTO on 13 October 2026, at the BT8c close.

## Now

- **BT8c merged and pushed** (merge `a4d4306`). The secret scan now answers to two lists set beforehand in the owner's `config`: `never-publish` (owner additions to never-ship) and `safe-to-publish` (known false alarms). A hit always waits for the owner in a named `secrets` hold, shows file and line never the value, previews at `create`, and stays visible in the record and every `status` form after it is settled. "Allow once" no longer releases a scan hold — `allow <bounty>` still releases permission waits. An approval binds to exactly what was shown (`github-preview-stale` closes the BT6a shape). Binary files are named "not scanned", never held.
- Acceptance: fresh pass **PASS** on `d03165f` after one correction (`verify d03165f PASS check=0 build=0 test:box-bounty=0 test:box-package=0 db=none 636s`). First round FAILED `fc90d84` on two live-demonstrated record/status defects; both fixed and re-verified live.
- Nonblocking findings in [BACKLOG.md](BACKLOG.md): the BT8b `instruction-file` internals gap plus three BT8c nits (claim filename coverage, `scanBinary` not re-shown in `status`, shared settle text).
- This run stopped after BT8c as named. Latest hosted run to read at next kickoff is the merge push on `a4d4306`; the run on the BT8b merge was still in flight at dispatch.
- The lab remains paused. Owner-held unmerged branches retained: `wave/A6`, `wave/K7`, `wave/BT7`, `wave/BT8-held`. About 109 older `box-bt1-*` temp directories remain outside cleanup authority. This repo's own `AGENTS.md` still carries the pre-wave block wording and `.box/limits.json` still sits there — refreshing or deleting either is the owner's.

## Next

No wave is named for a next run. The queue order per plan: **BT9** (the hook), **BT10** with a real first-time owner setup, and **BT11** after that use.
