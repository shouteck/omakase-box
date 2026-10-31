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

## Result

- CTO: Claude Code desktop on Windows / Claude Opus 5.5
- Commit: `b1f1a43`.
- Verify: `verify b1f1a43 PASS check=0 build=0 test:platform=0 test:kitchen=0(selected 18 of 18 kitchen files) db=none 139s`. The first candidate, `370b6c8`, also passed; the later commit changes one line found in my own run.
- Level: `ui-verified` locally: real Chromium journeys against the same `handle()` and a stand-in OAuth server, plus my own run in the app's browser. New: `tests/platform/account.test.ts` (59 tests) and two page journeys. Real GitHub OAuth was not exercised; it needs the owner's app (PF6).
- Checks:
  - The diff does what the brief says, inside the reconciled write paths. No existing test's expected outcome changed; two lists gained entries (pages checked for money claims, bytes barred from the export).
  - Verify passes on this commit.
  - Bites, each in the working tree and restored, each went red in the account tests: restricted made public (8 failed, the brief's); dispute never reopens (3); poster check off (7); token stored (1); Origin check off (3); state check off (1); session kept at sign-out (1); payee check off (1); shape check off (16); receipts not purged (1).
- Done when: verify exits 0; the diff scan for token shapes found none, and the stand-in's client word is not a secret; the owner's setup steps are in the README; hosted CI is read after merge (STATUS.md).
- Lenses:
  - **Security:** Authorize address carries no `scope`. Token sentinel absent from every row of every table; the cookie's own value absent too, only its hash stored. Cookies `__Host-`, Secure, HttpOnly, SameSite=Lax. Writes refuse a missing, foreign or look-alike Origin, a non-JSON type and an oversized body. A stolen cookie after sign-out and an expired session are refused; wrong state and a reused code sign nobody in. `javascript:` and look-alike hosts refused for every kind; stored rows are parsed again on read; the sign-in error shows fixed words, tried with a script in the address. A sentinel owner-only value is absent from the feed, details, RSS, MCP, public APIs and profiles, read anonymously, as a third party, as the owner and as the payee. **Limits:** the token is discarded, not revoked at GitHub. A renamed login keeps a live session up to 30 days, and the earlier holder's methods stay under that login until the new holder signs in. No rate limit on sign-in or writes.
  - **User experience:** in the browser, signed out, `/me/` offers one action; after sign-in it shows the form on that page. Paste and Save: two steps, kind and visibility preselected; a wrong shape is refused in place with its next step. My run found one fault, fixed in `b1f1a43`: "Pay the author directly" showed to everyone, the payee included. Screenshots timed out with the window hidden, so I read this run as page text; the visual-rule test measures only the board and bounty pages, not the new ones.
- Method: feature playbook and Prove It Works, read before code. Prove It Works changed one decision: the browser run after verify passed, which found the wording fault no test covered. `architect` skipped: K43 and the owner's decision settled the design. Throughput checkpoint n/a: one writer.
- Findings and departures:
  - **Ahead of PF4, by the brief's dispute test:** the payee's "received" and "not received" exist now, visible only to the payee and that owner. The record comes only from the chain's `paid` event. The owner's button, public payment facts, counts, `owner.record`, `payment` and `owner_record` stay PF4's.
  - **PF4's brief says push access decides who records paid; K43 says the issue's author, because the board cannot read push access.** PF3 uses K43's rule. PF4 must reconcile its brief.
  - `how_to_get_paid` now points at `/me/`, with the pull request as fallback. K43's three steps wait for PF4's confirm receipt.
  - Secure cookies work on `http://localhost` in Chromium, which is what was tested; other browsers were not tried locally.
- Merged: `9a04467` · Verify cost: `verify: 3 runs, total 287s`, local run history; one of the three was refused on a dirty tree at 0s · Resources removed: board and browser pane stopped. `kitchen-stats` exited 1 at close and I merged without reading it: my station-card line had put the card over its size limit. Fixed on master right after the merge by removing that line. A `MISSING` line remains for the 22 October `--full` run's summary, which predates this wave.
- Reflect: a PowerShell here-string with double quotes in a commit message broke `git commit` when passed to a native program, and verify refused the dirty tree -> kitchen: INBOX line. The refresh's anonymous budget hid a new chain event from my tests -> wave: a comment at the rig call in `account.test.ts`; the station card is full. The close command chained the merge after `kitchen-stats` without stopping on its exit code -> kitchen: INBOX line.
