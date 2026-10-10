# Status

Replaced by the CTO on 10 October 2026, at the close of wave BT3 (two fix rounds: the return path's boundary needed three passes — `.boxignore` bypass, wrong verify file set, autocrlf breaks, ignored-file clobber, a restore-crash on untracked `.box/` — all closed and regression-tested).

## Now

- **BT3 is done and merged** (`8c7d4e9`, PASS ui-verified): the full journey works end to end. `box bounty answer <id> --from <dir>` binds the returned folder (id + snapshot commit), extracts the change against recorded hashes, refuses owner-listed files (`answer-never-ship`), verifies a mechanical answer on the shipped file set through the declared check, and merges it onto current code with a real merge commit — or rejects it with a reason. `apply`/`reject` cover reviewed bounties and conflict retries; conflicts abort byte-identical and are recorded with named paths. `create --job <file>` keeps owner context in the record only.
- **Known limits for later:** `status` next-step for `answered`+conflicts doesn't echo the recorded conflict paths; stray junk in a returned `repo/` lands as `added` (spec-conformant); pre-BT3 records bind the manifest on id+commit only; plus the BT1/BT2 set — `--to` nonexistent-under-junction residual, forgeable-record convention (events expose it), `secrets` basename over-removal, untracked-via-junction live bytes, git-lfs pointer stubs, wrong-verb message for `status` outside a checkout.
- **The off-machine run now tests the product** (bounty, trace, package suites on pinned `ubuntu-24.04`). Whether to keep the 14 earlier-platform suites off-machine is the owner's open call.
- **Milestone BT is approved** (BT1 to BT6); BT1–BT3 are merged. Each wave cooks only when the owner names it, and the kitchen stops after each. BT6 needs a separate approval and a choice of site.
- **C1's `box trace` is kept but not used by milestone BT.** The smaller Box is a later decision.
- **The lab is paused entirely.** Do not read its brief, answer it or run a sync.
- **Left as they are, not merged and not deleted:** local branches `wave/A6` and `wave/K7`. Deleting an unmerged branch is the owner's call.
- Master is clean and published. Nothing is running.

## Off-machine checks (looked at by the CTO on 10 October 2026)

- K10 merge run green on master with the product suites (6m29s); the BT2 merge run was in progress at BT3 kickoff — read the latest before the next merge.

## Roadmap updated (CTO, 10 October 2026, after BT3)

From the owner's decisions in discussion: the tool does everything mechanical and the agent supplies only judgement; it reports facts about an answer and never a verdict; using it is always at the agent's discretion; every bounty records one line of why. PLAN.md has all of it. Two small waves now come before BT4:

- **BT3a, report, do not judge.** Changes two things BT3 shipped: a passing answer waits for a decision instead of being applied automatically, and a failing answer no longer ends the bounty. Adds the facts report, flags, an optional guard command, several answers, and `undo`.
- **BT3b, fewer things to supply.** The one line of why, defaults, evidence gathered by the tool, `help`, and the known rough edges above.

BT4 is now accepted by constructed scenarios (PLAN.md, "How BT4 is accepted"), and BT5 has three parts: the journey, judgement, and open observation.

## Next

**BT3a: report, do not judge.** Brief at [waves/BT3a.md](waves/BT3a.md), station packaging. Send `START.md` (or `START.md: BT3a`). The kitchen cooks that wave and stops.
