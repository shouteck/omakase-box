# PF3: sign in with GitHub, and profiles

Milestone: PF (the platform) · Station: packaging · Base: `master at dispatch` · Branch: `wave/PF3` · Timebox: 240 minutes; at expiry, report partial findings and stop
Owner decisions: D-2026-10-21-platform-v1, D-2026-10-21-no-platform-money
Owner context: D-2026-10-21-platform-v1 (feature 5, solver profiles); D-2026-10-21-no-platform-money; spend no money

**Brief.** Written ahead by the CTO on 21 October 2026. Before dispatch, the CTO reconciles it with K43's `PLATFORM-UX.md` (profile content, privacy rules) and corrects names only. **After PF1**; it can run alongside PF2. Cook: high; reviewer: high.

## Staffing (Claude Code, coordinator on Opus 5.5)

Dispatch each role with the Agent tool, passing `model` and `effort` exactly as written here. This brief is the explicit instruction those settings need.

- **Cook:** `box-worker`, **Opus 5.5**, effort **high**: sign-in, sessions and personal data.
- **The pass:** `box-reviewer`, fresh, **Opus 5.5**, effort **high**. Never the agent that cooked.
- **Corrections:** a correction round uses a fresh cook at the same model and effort. After two FAILs on the same finding, the next correction steps up one level (Sonnet 5.5 to Opus 5.5 high, or Opus 5.5 high to Opus 5.5 xhigh) and the Result says so. Fable 5.1 is never used without the owner's word.
- **Record** the host, model and effort of every role in the Result (KITCHEN.md).

## Outcome

Anyone can sign in with GitHub. A solver can list the ways they accept payment, once. An owner has a profile page. The platform stores only the GitHub identity and what each person chose to publish.

## What it does

1. **Sign-in:**
   - GitHub OAuth with **no scope** (public information only; K42 section 3.2).
   - A session cookie that is secure, HTTP-only and same-site.
   - Sign-out.
   - The GitHub token is discarded after reading the identity.
   - The OAuth app's client ID and secret come from the environment. The owner creates the app; tests use a stand-in.
2. **Solver profile:**
   - **Accepted payment methods**, each checked for shape, never followed: a PayPal.me link, a Stripe payment link, a GitHub Sponsors page, a Wise email, a wallet address (chain named).
   - **Visibility per method,** as K43 designs. For example, links public, an email shown only to owners of bounties the solver's work was merged into.
   - The profile page shows their merged solutions (from PF1's facts). Payment facts arrive in PF4.
3. **Owner profile:** their public bounties and, in PF4, their payment facts.
4. **No other personal data,** no email collection, no tracking scripts. A short privacy note on the site says exactly what is stored.

## Tests (`test:platform`)

| Case | Expected |
|---|---|
| Sign-in round trip against a stand-in OAuth server | Session created; the token is not stored |
| A method with the wrong shape (a non-PayPal URL in the PayPal field, `javascript:` anywhere) | Refused, with the reason and the next step |
| Visibility | A restricted method is never in any public page, feed or MCP output; shown only where K43's rule allows |
| Another user editing my profile | Refused |
| Sign-out | Session gone; a stolen cookie after sign-out is refused |

**Bite:** in a scratch copy, make a restricted method public; the visibility test fails. Record it.

## Done when

- `node scripts/verify.mjs test:platform test:kitchen` exits 0; hosted CI green after merge.
- The diff contains no secret. The owner's setup steps (create the GitHub OAuth app, set the environment) are written in the README for PF6.

## Review lenses

- [x] **Security:** session handling, CSRF on writes, input validation, no secret in code, least data stored.
- [x] **User experience:** the solver's setup is a single page and takes at most two steps.
- [ ] **Measurement fairness:** not applicable.

## Notes for the worker

- Feature playbook; principles: prove-it-works.
- Do not edit `waves/PF3.md` while a verify runs. Report at the timebox.
