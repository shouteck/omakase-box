# PF4: public payment facts and track records

Milestone: PF (the platform) · Station: packaging · Base: `master at dispatch` · Branch: `wave/PF4` · Timebox: 240 minutes; at expiry, report partial findings and stop
Owner decisions: D-2026-10-21-platform-v1, D-2026-10-21-no-platform-money
Owner context: D-2026-10-21-platform-v1 (feature 4, owner payment facts; facts-only track records); D-2026-10-21-no-platform-money; spend no money
Horizon: long: start with `/plan` and keep the plan in this file

**Brief.** Written ahead by the CTO on 21 October 2026. Before starting, the CTO reconciles it with K43's payment-facts design (`PLATFORM-UX.md`, question 4) and corrects names only. **After PF1 and PF3.**

**Reconciled with K43 (31 October 2026).** Where this brief and K43 differ, K43 is built. Write paths: `packages/box-platform/`, `tests/platform/`, `waves/PF4.md`.

| Brief says | Built as | Why |
|---|---|---|
| Paid button needs push access | Only the account signed in as the issue's author | The board cannot read push access (K43 section 5; PF3 used this) |
| Self-dealing: poster or push access | Poster, or the merged pull request's `author_association` is OWNER, MEMBER or COLLABORATOR, kept from the first read after merge | What GitHub shows without a token. Wording: "GitHub lists them as ...", never "has push access" |
| Merged = GitHub records it merged | Merged and head on the default branch (compare API), as K42 3.3 step 4 and K43 say | A merge into the bounty branch alone owes nothing yet; the page says so |
| Two merged: nothing owed to either | Counts once as owed, `to: null`, `to_one_of`, until the owner's click names one merged author | K43's rule; same meaning |

## Plan

Agreed with the owner in plan mode, 31 October 2026. Read before code: feature playbook, Prove It Works. `architect` skipped: K43 settled the design. One writer.

1. **Compute on read, no stored counts.** `src/payments.ts` holds every rule as pure functions (`paymentOf` with one named state, `ownerRecord`, `solverRecord`, `excluded`) and one loader. Nothing goes stale after a click, refresh or purge. Cost: the `owner_record` filter reads all merged rewarded bounties.
2. **Decisions:** a chain `paid` event has no payee, so only the click settles a two-merge bounty (`to` on the event is PF5's). `median_days_to_record_paid` is `null` when nothing is recorded, because 0 would be a false fact.
3. **Store:** `pull_requests` gains `association`, `head_sha`, `on_default`; new `paid_clicks`, purged with the bounty. `standingRecord` takes chain and click, latest wins; `payeeOf` honours a record's `to`.
4. **Routes:** `POST /api/b/<id>/paid` (`{to}` or `{withdraw: true}`); the amount is the bounty's; the same click twice changes nothing; a different payee must withdraw first. Receipts become public.
5. **Surfaces:** feed, detail, MCP, `owner_record` filter, board card and filter, bounty page, profiles, `how`, `privacy`, README.
6. **Not built, each a BACKLOG line:** landed but not marked merged; solvers' GitHub account age; `/me/` owe and owed sections; the real-GitHub test of private organisation membership (PF6).
7. **Steps:** pure rules and table tests; schema, stand-in, refresh; routes and machine interface; pages and browser journey; bites; verify; own browser run; close.

## Outcome

Every bounty with a reward shows, as attributed facts:

- what is owed, and since when;
- whether the owner recorded it paid;
- whether the solver confirmed it received.

Each owner and solver profile shows the counts. The platform never moves money and never decides who is right.

## What it does

1. **Owed:** a rewarded bounty whose solution GitHub records as merged is owed to that pull request's author, from the merge date. Payee rules follow K42 section 3.3 step 4 (exactly one merged bounty pull request; otherwise "the owner decides").
2. **Recorded paid, the owner's word, from two sources:**
   - **the shared memory's `paid` event** under `refs/box-bounty/<id>`, written by the CLI's `box bounty config set paid <id>` and pushed to the repository. GitHub only accepts that push from someone with push access, so the platform reads it as the owner's word without any login;
   - **a "paid" button** for the signed-in owner (PF3), shown only to an account with push access to the repository (checked on GitHub).
3. **Confirmed received, the solver's word:** a button for the signed-in payee only. They can withdraw it.
4. **When they disagree:** both facts are shown, each attributed to its author ("recorded paid by @owner on <date>"; "not confirmed by @solver"). The platform states no verdict.
5. **Counts:**
   - per owner: merged with a reward, recorded paid, confirmed received, owed and its oldest age;
   - per solver: merged solutions, confirmed payments.
   - **Self-dealing excluded:** a payee who is the poster or has push access to the repository is not counted (checked on GitHub).
6. **Shown** on the bounty page, the profiles, the feed and MCP (PF2's `get_bounty`), and the board card where K43 places it. New accounts read "no history yet", never zero stars.

## Tests (`test:platform`)

| Case | Expected |
|---|---|
| A merged rewarded bounty, nothing recorded | "Owed to @a since <date>" |
| The `paid` event in the chain | "Recorded paid by @owner", with the date from the event |
| The paid button by someone without push access | Refused |
| The solver confirms, then withdraws | Shown, then removed; counts follow |
| Owner says paid, solver silent | Both facts, attributed; no verdict |
| Payee is the poster, or has push access | Not counted anywhere |
| Two merged bounty pull requests | "The owner decides"; nothing owed to either until the owner records it |
| A $0 bounty | No payment facts; the merged count only |

**Bite:** remove the self-dealing exclusion in a scratch copy; its test fails. Record it.

## Done when

- `node scripts/verify.mjs test:platform test:kitchen` exits 0; hosted CI green after merge.
- Every payment word on every surface is checked against the rule "never funded, guaranteed or escrow".

## Lenses

- [x] **Security:** only the owner (push access) records paid; only the payee confirms; counts resist self-dealing.
- [x] **User experience:** the CTO reads an owner profile and a bounty page as a solver would and answers "would this owner pay me?" from facts only.
- [x] **Measurement fairness:** the CTO seeds disagreements and self-dealing in the stand-in and checks every count.

## Notes

- Feature playbook; principles: prove-it-works.
- Do not edit `waves/PF4.md` while a verify runs. Report at the timebox.
