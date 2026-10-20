# Status

Updated by the CTO on 21 October 2026 at the K42 close.

## Now

- **K42 merged** (`e7ab507`); independent PASS on `a6f0ec2` (verdict 4) after three corrections, the third by a fresh cook. Documents only: `docs/box-v4/PLATFORM.md`.
- **The design:** nobody holds money while a bounty is open. The owner's card is saved with Stripe and charged once, after the platform itself checks on GitHub that exactly one bounty pull request is marked merged with its head on the default branch; Stripe passes the charge straight to the solver (destination charge). The payee comes from GitHub facts only; when two qualify, or work lands by plain Git with nothing marked merged, the owner decides and nothing is paid automatically.
- **Hosting finding:** Vercel's free plan forbids taking payments, so the recommendation is Cloudflare Workers Free with D1 on `*.workers.dev`, at $0. Owner setup: nine steps, seven at $0; a lawyer's review of terms and possibly a legal entity are not $0.
- **Build waves proposed:** PF1 board, PF2 CLI login and hints, PF3 cards and solver onboarding (Stripe test mode), PF4 pay, PF5 format and docs, PF6 one real $1 payment. None briefed.
- **Verify/cost:** `verify: 10 runs, total 832s`; 9 PASS, 1 FAIL (stale ignored `dist/cli.js` on the first run), 0 missing summaries. Off-machine run on master green at kickoff; the post-merge run not awaited.
- Master clean and pushed at close.

## Next

This run stops after K42. No wave is in flight or starts automatically.

- **Owner decisions D1–D7** are in PLATFORM.md section 9, each with one recommendation. PF1 needs D2 (hosting); PF3 onward needs D1 (legal entity and country). K43 (what the platform shows) can run on the design as it stands.
- **K43 and K44 briefed**, waiting to be named. K41 (film) and publishing stay held until the platform's first version exists.
- **New in BACKLOG:** K42's code reading suggests the CLI's merge recognition may accept a PR whose head is already on the owner's branch; unproven, needs a reproducing test first.
- BT33 stays parked; remaining performance limits in BACKLOG.
- **K42b briefed** (21 October 2026): the owner is in Singapore, so K42's Stripe Connect route would pay Singapore solvers only. K42b finds the money route and recommends D1. It gates PF3 onward only.
