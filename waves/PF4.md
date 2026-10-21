# PF4: public payment facts and track records

Milestone: PF (the platform) · Station: packaging · Base: `master at dispatch` · Branch: `wave/PF4` · Timebox: 240 minutes; at expiry, report partial findings and stop
Owner decisions: D-2026-10-21-platform-v1 (feature 4, owner payment facts; facts-only track records); D-2026-10-21-no-platform-money; spend no money

**Brief.** Written ahead by the CTO on 21 October 2026. Before dispatch, the CTO reconciles it with K43's payment-facts design (`PLATFORM-UX.md`, question 4) and corrects names only. **After PF1 and PF3.** Cook: high; reviewer: high.

## Staffing (Claude Code, coordinator on Opus 5.5)

Dispatch each role with the Agent tool, passing `model` and `effort` exactly as written here. This brief is the explicit instruction those settings need.

- **Cook:** `box-worker`, **Opus 5.5**, effort **high**: attribution, push-access checks and self-dealing rules.
- **The pass:** `box-reviewer`, fresh, **Opus 5.5**, effort **high**. Never the agent that cooked.
- **Corrections:** a correction round uses a fresh cook at the same model and effort. After two FAILs on the same finding, the next correction steps up one level (Sonnet 5.5 to Opus 5.5 high, or Opus 5.5 high to Opus 5.5 xhigh) and the Result says so. Fable 5.1 is never used without the owner's word.
- **Record** the host, model and effort of every role in the Result (KITCHEN.md).

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

## Review lenses

- [x] **Security:** only the owner (push access) records paid; only the payee confirms; counts resist self-dealing.
- [x] **User experience:** the pass reads an owner profile and a bounty page as a solver would and answers "would this owner pay me?" from facts only.
- [x] **Measurement fairness:** the pass seeds disagreements and self-dealing in the stand-in and checks every count.

## Notes for the worker

- Feature playbook; principles: prove-it-works.
- Do not edit `waves/PF4.md` while a verify runs. Report at the timebox.
