# Status

Replaced by the CTO on 10 October 2026, at the close of wave BT4.

## Now

- **BT4 is done and merged** (`2122ddd`, PASS ui-verified on `45ac0ea`, second candidate): the agent-facing surface exists. `box bounty describe` prints the canonical description (what / when worth it / when not / the facts to choose: cost, expected wait, limits, how an answer is judged, "create a draft any time; the owner's yes gates posting"); `describe --rules` emits the pasteable rules block with markers; `.box/bounties/OPEN` and any limits-named `rulesFile`'s marked block stay current on every mutation; `remind` supplies the difficulty-moment line, off by default; `.box/limits.json` carries the owner's limits (`reminders`, `rulesFile`, `cost`, `expectedAnswer`, `allowedDestinations` — enforced canonically on `post --to`).
- **Accepted by constructed scenarios:** `kitchen/scenarios/bt4.md` — 5 scenarios, both directions, each with the sensible behaviour stated and every other reasonable move + true reason. 15 comparative probes (3 wordings × 5 scenarios) produced no overuse and no false-success claims; wording A confirmed. One fix round: S2's premise is now a shown fact, and `describe` says the draft is free — the two re-runs closed both prior declines exactly as predicted.
- **BT1–BT4 are merged.** The whole journey exists end to end and is discoverable: describe → create (why + task, rest defaults) → record → confirm → post → answer (facts) → apply/reject/undo; `help` and the rules block tell an agent it exists.
- **Known limits for later:** junction indistinguishability family from BT3b (documented in `waves/BT3b.md`); probe runs are n=1, directional, and transcripts are the head chef's record; `allowedDestinations: []` renders a dangling line (nit, recorded in `waves/BT4.md`); junction attacks proven on Windows only; solver-controlled check output can carry a banned word inside the quoted tail; `deltaPaths` folds (backstopped); plus the standing set — forgeable-record convention, `secrets` basename over-removal, untracked-via-junction bytes, git-lfs stubs, autocrlf stat-flag cosmetic.
- **The off-machine run tests the product** and is green on master. Whether to keep the 14 earlier-platform suites off-machine is the owner's open call.
- **Milestone BT is approved** (BT1 to BT6). Each wave cooks only when the owner names it. BT6 needs a separate approval and a site.
- **C1's `box trace` is kept but not used by milestone BT.** The lab is paused entirely.
- **Left as they are:** unmerged local branches `wave/A6` and `wave/K7` (owner's call).
- Master is clean and published. Nothing is running.

## Roadmap (owner decisions of 10 October 2026, in PLAN.md)

- The tool does everything mechanical and reports facts about an answer, never a verdict; using it is always at the agent's discretion; every bounty records one line of why.
- BT5 has three parts: the journey (a real bounty on this repository's own work, solved cold, collected from the record), judgement (the BT4 scenario pack climbed rung by rung), and open observation (the tool installed during ordinary waves, reasons read afterwards).

## Off-machine checks (looked at 10 October 2026)

- Green on master: BT2, BT3, BT3a merge runs passed with the product suites (~6m30s). The BT3b/BT4 merge runs land in the same shape — check `gh run list` after each.

## Next

**BT5: the kitchen uses it.** Three parts in one wave: (1) a person asks for a bounty on this repository's own work — a solver that has never seen the repository answers, a different session collects it from the record; (2) judgement — the BT4 scenario pack run in full, climbing description → rules note → reminder, stopping at the first rung where the agent chooses sensibly; (3) open — the tool stays installed during ordinary waves, nobody mentions it, the recorded reasons are read afterwards. Parts two and three are reported honestly, including "nobody used it". No brief yet — the CTO writes it when named. Send `START.md: BT5`.
