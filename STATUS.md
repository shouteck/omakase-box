# Status

Updated by the CTO on 13 October 2026, at the K15 close.

## Now

- **K15 merged and pushed** (`7b5fcca`). The kitchen has its own throwaway public repository: `shouteck/box-bounty-sandbox`, plainly labelled a test area, cloned beside this checkout at `Projects\kitchen-sandbox`. It is `allowed` in the owner's settings (one-time `allow`, 14:03:43Z) while `shouteck/omakase-box` stays "ask me each time". Real-GitHub steps now run there with nobody asked — the rules are in `kitchen/sandbox.md` and `templates/wave.md`, and `tests/kitchen/k15-sandbox-guard.test.ts` fails any future wave that points a real post at the working repository.
- **Proven live in the sandbox:** a full journey with nobody asked — bounty posted (issue #1), two blind solvers PR'd (#2, #3, one asked a real question), a fresh collector discovered the bounty from the AGENTS.md block injected by the host, `apply` refused the clash, it merged by hand, and the tool closed the bounty, the PRs and the branch. The owner-facing wording test ran 5× through two fresh agents — all carried the three facts (public, merged, this repository only); verbatim relays are in the wave file.
- **Hook proof — still owed, honestly:** the block line fired live on a Devin session; the hook's `additionalContext` was never observed (Devin loads project hooks from the session's working directory; a subagent does not start in the sandbox dir). Deferred to a session opened on the sandbox itself. See [waves/K15.md](waves/K15.md).
- Acceptance: pass **PASS, live-verified** — reviewer's own `verify e0d8e6d --full test:kitchen` green; sandbox content, owner settings, guard test and journey all checked against live state.
- Nonblocking findings in [BACKLOG.md](BACKLOG.md): stat-dirty file after `apply`'s aborted merge on Windows; guard-test limits (tracked-files-only, loose prohibition matcher).
- Left on GitHub by exact name: the sandbox repo itself; closed issue #1; closed PRs #2 and #3; solver branches `fix/bt-212eb1764bf7-stale-fruit-count` and `fix/inventory-fruit-count`; plus the earlier BT10 artifacts on omakase-box (closed #5/#6, PRs #7/#8, two solver branches).
- This run stopped after K15 as named. The lab remains paused. Owner-held unmerged branches retained: `wave/A6`, `wave/K7`, `wave/BT7`, `wave/BT8-held`. `.box/limits.json` still sits in this repo — deleting it is the owner's.

## Next

No wave is named. Briefed and ready, in order: **BT11a** (a bounty states the owner's reward, with a limit on what is promised at once) then **BT11b** (the solver's payment link; real run in the sandbox). The owner's instruction stands: a test must not need the owner's input.
