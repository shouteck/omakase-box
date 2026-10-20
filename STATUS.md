# Status

Updated by the CTO on 21 October 2026 at the K42b close.

## Now

- **K42b merged** (`eb4eeb2`); independent PASS on `51ff720` (verdict 4) after three corrections, the third a CTO scope cut done by a fresh cook. Documents only: `docs/box-v4/PLATFORM-MONEY-SG.md`, plus a revision note at the top of PLATFORM.md.
- **D1 recommendation:** a Stripe Connect platform account in Singapore, held by the owner, using destination charges with `on_behalf_of` the solver. Solvers in 37 countries confirmed on Stripe's pages; Thailand and the UAE unknown, tested in PF3; not India, Indonesia, the Philippines, Vietnam, Pakistan, Nigeria or Ukraine. Those are reached later by owner-paid Wise batches (49 destinations). The `on_behalf_of` route is documented but unproven: PF3 proves it in Stripe's sandbox at $0.
- **Cost:** $0 to start; S$115 once + S$30 a year if Stripe needs a sole proprietorship. Per payment (Singapore edition): 3.4% + $0.50, +0.5% international card, +2% FX; Connect $2 per active solver a month, 0.25% + $0.50 per payout, 0.25% funds routing. Disputes still debit the platform.
- **For a lawyer before live mode:** whether the platform "arranges" cross-border transfers or provides "merchant acquisition" under the Payment Services Act; a sole proprietor's unlimited liability; stablecoins stay parked.
- **Rejected:** a US company (US$500 + at least US$325 a year, a $25,000 IRS penalty risk, no extra Asian reach); Airwallex and Adyen are sales-only.
- **Verify/cost:** `verify: 10 runs, total 788s`; 10 PASS, 0 missing summaries. Off-machine run on master green before merge; the post-merge run not awaited.
- Master clean and pushed at close.

## Next

This run stops after K42b. No wave is in flight or starts automatically.

- **Owner decisions D1–D7:** PLATFORM.md section 9, with D1, D4–D7 revised by PLATFORM-MONEY-SG.md. Its proposed text is folded into PLATFORM.md once the owner decides D1. PF1 needs D2 (hosting); PF3 onward needs D1.
- **Owner's go-to-market thesis** (D-2026-10-21-gtm-thesis): free for everyone, agents on both sides, long-running autonomy as the demand. K44 rewritten around it; K43 designs agents first and runs after K44. Both briefed, waiting to be named.
- K41 (film) and publishing stay held until the platform's first version exists.
- **In BACKLOG:** the CLI merge-recognition finding from K42 (unproven, needs a reproducing test first) and two notes for the PF4 brief.
- BT33 stays parked; remaining performance limits in BACKLOG.
