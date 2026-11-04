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

## Mock-up approval

The mock-up (today's Solver tab with "Your solutions" applied, each stage selected, desktop and phone) was approved by the owner on 4 November 2026: "ok i approve". The stages work like the owner's: each card selects its list; "All" shows every row; no separate Closed link (Not merged is a stage); the list opens on the stage that waits on the solver.

## As-built approval

The as-built page (today, the approved mock-up and the build, each stage clicked) was approved by the owner on 5 November 2026: "Yeah, I agree. We can keep it as it is, and I approve of the design." The owner asked what each side's stages hold; kept as built: the owner's Closed is only "closed with nothing merged" (a merge goes to Payment due, then Paid); the solver's Not merged holds a pull request closed without a merge or one whose bounty went to another solution, each row's line saying which.

## Result

- CTO: Claude Code desktop, Windows / Claude Opus 5.5
- Commit: `ca3ad259` · Verify: `verify ca3ad25 PASS check=0 build=0 test:box-bounty=0 test:platform=0 test:kitchen=0(selected 18 of 18 kitchen files) db=none 1892s` (later commits are wave files only)
- Level: ui-verified on the local board; mock-up and as-built approved by the owner (quoted above).
- **What shipped:** `/api/me` gains `solutions` (every bounty the person opened a pull request on, by GitHub author id, their latest pull request, newest first, bounded like the owner's list, listed repositories only, never their own bounty), each with one stage decided in `solutionsOf`: progress, due, paid (with `needs_confirm` for a by-hand payment only), closed (closed without a merge, or another solution merged or paid). `Solutions.jsx` renders it with the owner's list parts (`Glyph`, `ago` exported from `Bounties.jsx`), opening on the stage that waits; a by-hand Paid row's amount is the Confirm button and opens PF31's confirm window. The Solver tab's "Coming to you" and PF31's "to confirm" table are folded into it; "Owed to you" stays. `to_confirm` stays in `/api/me` (no route change).
- **Changed expectations:** the sign-in answer's shape includes `solutions`; two page checks that read the "Coming to you" table and its words now read the Your solutions rows; two selectors narrowed (the role tabs, the visible Confirm), since the Solver tab now has its own stage tabs and, like the owner's Pay, a Confirm for phones.
- **Tests:** two new account tests (each stage from its facts, provider payment needs no confirming; never their own bounty, never an unlisted repository); page suite 51 of 51; account suite passing.
- **Guards shown failing once each:** owed shown as Payment due; a provider payment needing no confirming; never the solver's own bounty (both guards together: the query by id and the filter by login); never an unlisted repository. The list's bound is shared with the owner's list and not separately tested.
- **Deployed 5 November 2026, on the owner's word** ("Yes, deploy it"): Worker version `ffce3e4d-4428-4561-b70a-2e80d5bb280e`, no migration; the pages, the feed and `/api/me` answer, and the served Your page carries the new list. `exceededCpu` from `wrangler tail`: before, 1 run, ok, 5 ms; after, 4 runs, ok, median 1 ms, max 8 ms; 0 both times. Bench removed.
- **Reflect:** the mock-up was built from the owner's list's own markup, so the build matched it on the first try -> nothing new; that is the PF31 lesson applied.
