# PF31c: the solver's own list, like the owner's

Milestone: PF (the platform) · Station: packaging · Base: `master at dispatch` · Branch: `wave/PF31c` · Timebox: 240 minutes; at expiry, report partial findings and stop
Owner decisions: D-2026-11-02-site-looks-need-approval, D-2026-11-02-design-references-big-companies
Horizon: medium: one list on Your page's Solver tab, built on the owner's; a mock-up gate before code. Feature playbook; principles: experience-first, subtract-before-you-add, prove-it-works

**Brief.** Written by the CTO on 4 November 2026, from the owner's point after PF31b: the owner's Your page keeps every bounty in its stage, but the solver's drops a payment once it is settled, so a solver has no lasting record of their work. After PF31b, before PF32.

## Outcome

The Solver tab has "Your solutions": every bounty on which this person opened a pull request, in the stage it is in, kept for good, built the same way as the owner's "Your bounties" (the stage figures, one table shape, the amount last).

## The stages

| Stage | When | The one fact under it |
|---|---|---|
| In progress | their pull request is open | draft or ready for review; GitHub's checks |
| Payment due | merged, not yet paid | owed by whom, since when |
| Paid | paid through Stripe or PayPal, or recorded by hand | by which way; a by-hand payment keeps "Confirm $X" until confirmed |
| Not merged | their pull request closed without a merge, or another solution was merged | closed when, or "another solution was merged" |

## Rules

1. One row per bounty the person opened a pull request on, from what the board already stores (`pull_requests` by author); never a bounty the person posted themselves (that is the Owner tab), and never a repository the board does not list.
2. The stage is a function of the stored facts (the pull request's state, the payment state of PF31 and PF31b); one place decides it, as `Bounties.jsx` does for the owner.
3. Subtract first: the PF31 "to confirm" table and the "Coming to you" table fold into this list (Payment due and Paid); the figure "Owed to you" stays as today.
4. No new route: the list is a field of `/api/me`, bounded like the owner's (newest first, the same limit), and read only what is stored.
5. Words are facts and whose word each is, as everywhere; nothing ranks or judges a solution.

## Gates, in order

1. **Mock-up:** today's Solver tab with the list applied in the browser, each stage, desktop and phone, light and dark, on one before-and-after page. No code until the owner approves, their words quoted here.
2. **Build, then the as-built page:** every built screen compared with its approved mock-up side by side before the owner sees it; anything that drifts is fixed and pinned in a test.

## Done when

- `node scripts/verify.mjs test:box-bounty test:platform test:kitchen` exits 0 on the final commit.
- Tests, each failing once when its guard is broken: each stage from its facts; a by-hand Paid row keeps Confirm and a provider Paid row has none; the person's own bounties are not in the list; an unlisted repository's bounty is not in it; the list is bounded.
- The as-built before-and-after approved by the owner before merge; deploy on the owner's word, `exceededCpu` before and after.

## Lenses

- [ ] **Experience:** one list, the same shape as the owner's; nothing a solver did disappears.
- [ ] **Facts, not verdicts:** "another solution was merged" states GitHub's fact; no ranking.
