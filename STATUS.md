# Status

Updated by the CTO on 13 October 2026, at the BT11a close.

## Now

- **BT11a merged and pushed** (`3df4203`). The owner now states the money: `box bounty config set reward <whole dollars>` puts one amount on every bounty posted, in the listing a person reads and the v2 machine block a program reads; `config set reward-limit` caps what may be promised across open bounties at once, and posting past it refuses with both numbers named. Agents cannot set, claim or pass an amount — every spelling is refused by name. Rewards are promises in the owner's name, paid by hand; the tool never moves money. Payment links and payee identity are BT11b.
- **Checked:** pass **PASS, live-verified** on `bf5bcd0` after one correction — the first review caught a forged `record.reward` reaching the public block at close (listing/block disagreement), a real two-post race past the promise limit, and a refused folder post mutating the draft. All fixed and re-proven live: the bound amount now reads the posted artifact, `withPromiseLock` serializes check-and-write, and refused posts change nothing. Verify green on `bf5bcd0` (`verify bf5bcd0 PASS check=0 build=0 test:box-bounty=0 test:box-package=0 db=none 637s`).
- **UX:** the two-agent relay ran 5× on real output — every relay carried all four facts (public under the owner's account, chosen solution merged into owner code, this repository only, $50 promise paid by hand) and all five second agents restated the agreement correctly; a stranger given only the rendered issue read the amount, the hand-payment and the non-promises correctly. Verbatim record in [waves/BT11a.md](waves/BT11a.md).
- **Format:** public blocks are now `schemaVersion: 2` with `reward.amount`; v1 blocks still read as $0 through the standalone reader. K14 budgets re-measured and under.
- Nonblocking findings in [BACKLOG.md](BACKLOG.md): promise-limit horizon trusts editable record content (forgery-down undercounts — same class as deleting records), the `github.body` resume-replay surface, and lock edges. Earlier BT10/K15/BT8 leftovers stand.
- No live GitHub state was created this wave — the real run is BT11b in `shouteck/box-bounty-sandbox`.
- This run stopped after BT11a as named. The lab remains paused. Owner-held unmerged branches retained: `wave/A6`, `wave/K7`, `wave/BT7`, `wave/BT8-held`. `.box/limits.json` still sits in this repo — deleting it is the owner's.

## Next

No wave is named. Briefed and ready: **BT11b** — the solver's payment link and the real sandbox run of the now-paid bounty flow. The owner's instruction stands: a test must not need the owner's input.
