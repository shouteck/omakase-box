# PF3: sign in with GitHub, and profiles

Milestone: PF (the platform) · Station: packaging · Base: `master at dispatch` · Branch: `wave/PF3` · Timebox: 240 minutes; at expiry, report partial findings and stop
Owner decisions: D-2026-10-21-platform-v1, D-2026-10-21-no-platform-money, D-2026-10-22-k43-decisions
Owner context: D-2026-10-21-platform-v1 (feature 5, solver profiles); D-2026-10-21-no-platform-money; spend no money
Horizon: long: start with `/plan` and keep the plan in this file

**Brief.** Written ahead by the CTO on 21 October 2026. Before starting, the CTO reconciles it with K43's `PLATFORM-UX.md` (profile content, privacy rules) and corrects names only. **After PF1**; it can run alongside PF2.

**Reconciled with K43 (31 October 2026).** Pages: `/sign-in/`, `/me/`, `/solver/<login>/`, `/owner/<login>/`, and `/privacy/` for the note. Visibility choices in K43's words: "Everyone, on my profile", "Only an owner who owes me". Owner means the issue's author, K43's rule; the owner's "not received" change overrides K43's last sentence on methods. Write paths: `packages/box-platform/`, `tests/platform/`, `waves/PF3.md`.

## Plan

Agreed with the owner in plan mode, 31 October 2026. Read before code: feature playbook, Prove It Works. `architect` skipped: K43 and D-2026-10-22-k43-decisions settled the design. One writer.

1. **Dependency on PF4:** the record comes from the chain's stored `paid` events; PF3 adds only the payee's receipt answer, visible to the payee and that owner. PF4 keeps the paid button, public payment facts, counts, `owner.record`, `payment`, `owner_record`.
2. **Store:** `sessions` (SHA-256 of the cookie value, GitHub id, login, expiry), `methods` (by GitHub id, at most 10), `receipts` (tied to the `paid` event's `at`; purged with the bounty). A login held under another id is deleted at sign-in.
3. **`src/methods.ts`:** a table per kind: label, default visibility, shape, refusal with next step. Rows parsed again on read. **`src/visibility.ts`:** the only place the rule lives.
4. **`src/account.ts`:** routes for sign-in, callback, sign-out, `/api/me`, `/api/me/methods`, `/api/solver/<login>`, `/api/owner/<login>`, `/api/b/<id>/payment`, `/api/b/<id>/receipt`. `__Host-` cookies; every write needs same `Origin`, JSON and at most 16 KB. Feed, MCP, RSS and public detail never read `methods`.
5. **Stand-in** gains OAuth and `/user`. **Pages:** one-page `/me/`, payment view on the bounty page, nav and footer links, `how_to_get_paid`, README setup for PF6.
6. **Steps:** pure rules and table tests; schema and sign-in; routes; pages and browser journey; bites (restricted public, dispute never reopens, token stored, Origin off, state off); verify; own browser run; close.

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
   - **Visibility per method,** as K43 designs (PLATFORM-UX.md section 5), with the owner's change (D-2026-10-22-k43-decisions): when the payee says a recorded payment has not arrived, their owner-only methods are shown again to that owner, on that bounty's page only, until the payee confirms receipt or withdraws the claim. For example, links public, an email shown only to owners of bounties the solver's work was merged into.
   - The profile page shows their merged solutions (from PF1's facts). Payment facts arrive in PF4.
3. **Owner profile:** their public bounties and, in PF4, their payment facts.
4. **No other personal data,** no email collection, no tracking scripts. A short privacy note on the site says exactly what is stored.

## Tests (`test:platform`)

| Case | Expected |
|---|---|
| Sign-in round trip against a stand-in OAuth server | Session created; the token is not stored |
| A method with the wrong shape (a non-PayPal URL in the PayPal field, `javascript:` anywhere) | Refused, with the reason and the next step |
| Visibility | A restricted method is never in any public page, feed or MCP output; shown only where K43's rule allows |
| Disputed payment | After the payee says "not received", the owner-only method shows again to that owner on that bounty's page; it hides again on "received" or withdrawal |
| Another user editing my profile | Refused |
| Sign-out | Session gone; a stolen cookie after sign-out is refused |

**Bite:** in a scratch copy, make a restricted method public; the visibility test fails. Record it.

## Done when

- `node scripts/verify.mjs test:platform test:kitchen` exits 0; hosted CI green after merge.
- The diff contains no secret. The owner's setup steps (create the GitHub OAuth app, set the environment) are written in the README for PF6.

## Lenses

- [x] **Security:** session handling, CSRF on writes, input validation, no secret in code, least data stored.
- [x] **User experience:** the solver's setup is a single page and takes at most two steps.
- [ ] **Measurement fairness:** not applicable.

## Notes

- Feature playbook; principles: prove-it-works.
- Do not edit `waves/PF3.md` while a verify runs. Report at the timebox.
