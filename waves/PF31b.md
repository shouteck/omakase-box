# PF31b: the solver confirms only a payment made by hand

Milestone: PF (the platform) · Station: packaging · Base: `master at dispatch` · Branch: `wave/PF31b` · Timebox: 120 minutes; at expiry, report partial findings and stop
Owner decisions: D-2026-11-02-three-ways-to-pay, D-2026-11-02-site-looks-need-approval
Horizon: short: one rule in the payment answer and the solver's page. Bug-fix playbook; principles: subtract-before-you-add, prove-it-works

**Brief.** Written by the CTO on 4 November 2026, from the owner's point after PF31 went live: the owner confirms only a payment made by hand ("I've paid"), because the other ways are known from the provider; the solver was still asked to confirm all three. Before PF32.

## Outcome

A payment through Stripe or PayPal (pay on merge or one click) is shown as the provider's word, with no "Confirm I received" and no "not yet confirmed". Only a payment the owner recorded by hand asks the solver to confirm, on the bounty and on the solver's Your page.

## Rules

1. `can_answer` in the payment answer is true only for the payee of a payment the owner recorded (source `board` or the project's record), never one Stripe or PayPal made.
2. The solver's `to_confirm` list leaves out provider payments.
3. The card's line for a provider payment names the provider's word and nothing about confirmation; Payment details drops "Not confirmed received" for it.
4. Unchanged: the receipt route, who is paid, what counts as paid, the owner's record and the numbers (provider payments already count on the provider's word).

## Done when

- `node scripts/verify.mjs test:box-bounty test:platform test:kitchen` exits 0 on the final commit.
- Tests, each failing once when its guard is broken: a provider payment offers the solver no Confirm and is not on their Your page; a by-hand payment still does both.
- Before-and-after of every state touched, approved by the owner before merge; deploy on the owner's word.

## Result

- CTO: Claude Code desktop, Windows / Claude Opus 5.5
- Commit: `a47ae16f` · Verify: `verify a47ae16 PASS check=0 build=0 test:box-bounty=0 test:platform=0 test:kitchen=0(selected 18 of 18 kitchen files) db=none 1999s` (later commits on the branch are wave files only)
- Level: ui-verified on the local board; the owner approved the before-and-after of every touched state ("Approve and merge").
- **What shipped:** `can_answer` is true only for a payment the owner recorded by hand; the solver's `to_confirm` leaves out Stripe and PayPal payments; a provider payment's line reads "Stripe's word: paid to <solver>'s own account" (or PayPal's) and Payment details no longer says "Not confirmed received" for it. The receipt route, who is paid, what counts as paid, the owner's record and the numbers are unchanged.
- **Tests:** a new page test (a Stripe payment asks the solver nothing: no Confirm on the bounty, nothing to confirm on their page); page suite 51 of 51, account and payment suites 115 of 115. No expectation changed.
- **Guards shown failing once each:** the solver asked after a provider payment; a provider payment listed to confirm; a provider payment's line speaking of confirming.
- **Deployed 4 November 2026, on the owner's word** ("Yes, deploy it"): Worker version `c835dc50-1aa2-4ddb-86fe-89742047ef39`, no migration; the pages, the feed and `/api/me` answer. `exceededCpu` from `wrangler tail`: before, 2 runs, ok, 41 ms; after, 7 runs, ok, median 2 ms, max 7 ms; 0 both times. Bench removed.
- **Reflect:** none new.
