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
