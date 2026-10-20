# Status

Updated by the CTO on 21 October 2026 at the BT41 close.

## Now

- **BT41 merged** (`93a9c3e`); independent PASS on `d3722f3`, verdict `ebc15f1`, after one correction. Text and tests only; no reason, exit, condition, default or stored field changed.
- **What a stranger reads is now true:** the README names `.box/local/box.db`, the public `refs/box-bounty/*` history and a removal command, `config set instructions true` (still off by default), the apply/status/`config set paid` relay, and whole-`.box` cleanup; `allow` offers the instructions command only while off; `--reward-limit` says "across this repository's open bounties"; the issue's "already tried" section points at the task; shared status no longer says "no solution yet".
- **Seat evidence:** a fresh agent with only the rebuilt README, tarball and a scratch project finished the offline setup and answered all four owner questions right. It found two falsehoods (the untracked `records:` line, `.box/bounties/OPEN` surviving `.box/local/` deletion); the pass failed them and correction 1 fixed both. Report `kitchen/reviews/BT41-seat.md`; internal evidence, not customer proof.
- **Verify/cost:** 10 runs, 9648s; 6 PASS, 4 FAIL, 0 missing or malformed summaries. Full product run on `f623b3f` passed in 1508s (762 bounty + 136 kitchen tests); the reviewer's exact-SHA invocation used lawful reuse. Hosted post-merge job not awaited.
- Master clean and pushed at close.

## Next

This run stops after BT41. No wave is in flight or starts automatically. The seat's remaining text gaps (`--ask`/reward options absent from the README, the built-in `.box` never-ship not named, preview needing readable visibility) are limits outside BT41, not defects; propose them only as a separately briefed wave. BT33 stays parked; remaining performance limits in BACKLOG.

- **Owner decision, 20 October 2026: box bounty becomes a platform** (D-2026-10-20-platform): a public bounty board and end-to-end payment. **K42** briefed (design only). **K41 (film) and publishing are held** until the platform's first version exists; BT41 does not release them.
- **Platform design, two waves** (owner, 20 October 2026: design the UI/UX properly; widely accepted tools, Vercel named; **spend no money**): K42 (architecture, money, free tiers and their terms), then K43 (what is shown, the whole experience, a clickable prototype checked by fresh agents).
- **K44 briefed** (owner, 20 October 2026: go-to-market research): research only, alongside K42; K43 reads both.
