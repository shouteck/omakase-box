# Status

Replaced by the CTO on 10 October 2026, at the close of wave BT5.

## Now

- **BT5-ci is in flight** (11 October 2026). Kickoff for BT6 found the latest master Actions run red: 38057786379 fails because `bt5.test.ts` assumes PHP is absent, while Ubuntu has PHP. START.md gives this run to the repair and stops after it. BT6 has not started; no public post is made.

- **BT5 is done and merged** (`751c480`, PASS ui-verified on `bac1ca4`, first candidate): the kitchen used the tool for real. A blind solver fixed the recorded `allowedDestinations: []` rendering nit inside the delivered folder only; an independent collector found the bounty from `.box/bounties/OPEN`, read the facts-only report and judged apply — the tool's own merge landed the fix (`tell.ts`, `record.ts`). Check red before, green after; suite 142/142.
- **The rungs:** 3 fresh agents, 2 fixtures — zero overuse, zero underuse failures. The doable agent ignored the tool and quoted its own "not worth it" line; both needs-toolchain agents declined on real cost/wait reasoning and provisioned PHP themselves. The fixture's "missing capability" premise did not bind (php is downloadable) — recorded as a fixture flaw.
- **The tool stays installed.** `.box/limits.json` (reminders off, honest cost/wait) and the marked AGENTS.md block are on master; future waves' `create --why` lines are the observation measure — whether agents hand off for real reasons.
- **Findings for later:** a returned folder polluted by its own setup is unanswerable (`answer-unsafe-path` — solver cleanup vs an answer-side artifact rule is a product decision); the empty-list rendering has no permanent suite test (kitchen check guards it); a missing *local* toolchain is unbountyable — `answer` verifies where the capability is absent; BOUNTY.md lacks the cold-copy bootstrap caveat; the `#`-leading task title slug.
- **BT1–BT5 are merged.** The whole journey exists and is proven by use: describe → create → record → confirm → post → blind solver → facts report → human/agent decision → tool's merge → undo path.
- **Known limits for later:** junction indistinguishability family from BT3b; probe runs are n=1, directional; junction attacks proven on Windows only; solver-controlled check output can carry a banned word inside the quoted tail; `deltaPaths` folds (backstopped); plus the standing set — forgeable-record convention, `secrets` basename over-removal, untracked-via-junction bytes, git-lfs stubs, autocrlf stat-flag cosmetic.
- **The off-machine run tests the product** and is red after BT5, as described above. Whether to keep the 14 earlier-platform suites off-machine is the owner's open call.
- **Milestone BT is approved** (BT1 to BT6). Each wave cooks only when the owner names it. BT6 needs a separate approval and a site.
- **C1's `box trace` is kept but not used by milestone BT.** The lab is paused entirely.
- **Left as they are:** unmerged local branches `wave/A6` and `wave/K7` (owner's call).
- Master is clean and published. Nothing is running.

## Roadmap (owner decisions of 10 October 2026, in PLAN.md)

- The tool does everything mechanical and reports facts about an answer, never a verdict; using it is always at the agent's discretion; every bounty records one line of why.
- BT5's open observation continues past the wave: the install is live, and the `why` lines of any future `create` calls get read at review.

## Off-machine checks (looked at 10 October 2026)

- Green on master: BT2, BT3, BT3a merge runs passed with the product suites (~6m30s). The BT5 merge run lands in the same shape — check `gh run list` after the push.

## BT6 set up (CTO, 11 October 2026)

- The owner made the repository public on 11 October 2026 and chose a GitHub issue as the first outside destination: no money, and the same issue is what paid sites (Algora, TaskBounty) build on later.
- The brief is [waves/BT6.md](waves/BT6.md). It posts one real public issue on this repository, and only after the owner has seen its exact text and said "go".
- An answer from any account other than the one signed in here is fetched and reported but its code is not run on this machine. A contained run is a later wave.
- **Public repositories only** (owner, 11 October 2026): the tool refuses to post a private repository outside and says so in its description, help and doc page. No override.
- Not in BT6: any bounty site, any reward, payment rules.

## Next

**BT6: the first bounty posted outside, as a GitHub issue.** Send `START.md: BT6`. The kitchen cooks that wave and stops.
