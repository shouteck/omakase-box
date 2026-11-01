# Pay on merge: what K46 proved in Stripe's test mode

Written by the CTO on 1 November 2026. Everything ran in the owner's Stripe sandbox with published test cards. No real money moved. Stripe's pages were read the same day.

## The owner's page

**Does it work?** Yes in test mode, with one gap and one question for live. A saved card was charged with nobody present, directly into a solver's own account, from a Singapore platform. The platform's balance stayed at 0 and it recorded no transactions.

**The gap.** The setup that keeps you at $0 needs each solver to accept Stripe's terms on Stripe's own page, and an agent cannot do that through the API. So those test accounts were never activated, and the sandbox charged them anyway. Fully activated accounts (AU, US, DE, GB) were proven only in a different setup, where the platform carries fees and losses. Close this first in PF11: one solver completes Stripe's page in test mode and a charge runs with the readiness check on.

**The question for live.** Stripe's terms say a user "must be a business (including sole proprietor)". A Singapore individual trading under their own full name need not register (K42b), but whether Stripe accepts that for a live platform was not found. The sandbox reached a test key with no card, payment or business details reported. Answering costs nothing: fill in Stripe's live activation form. **If Stripe asks for a registration number, that is S$115 and a named blocker under the $0 rule.**

**What you set up, once:** a free Stripe account and Connect. In the sandbox that was all it took. Live also needs Stripe's activation form and the key stored as a secret on the board. You also save your card and set a limit. "Ask me each time" stays the default.

**What a solver does, once:** clicks "Connect Stripe" and completes Stripe's page. Stripe treats them as a merchant: it asked for a business category, description, website, support phone and bank account. A solver without Stripe gives plain payment details and the owner pays by hand.

**What it costs**

| Who | On a $45 reward |
|---|---|
| Platform (you) | **$0.** Balance 0, 0 balance transactions and 0 application fees in the test. Stripe's page: no Connect fees in this setup |
| US solver | Fee $1.61; **$43.39 arrives** |
| Singapore solver | Fees S$3.89, including S$1.15 conversion; S$53.63 arrives, about **$41.96** |

The fee comes out of the reward unless the owner chooses to add it. Other countries' fees were not measured.

**What could go wrong**
- **A dispute lands on the solver.** The owner's bank can reverse a payment after the merge. In the test the solver's account took the $11 dispute plus a $15 fee; the platform took nothing. Solvers should be told this plainly.
- **The platform's key is the real danger.** It can charge any saved card to any connected account and refund any charge. The owner's limit and the correct payee are enforced by our code, not by Stripe. Whoever steals the key bypasses both.
- **Reach has edges.** 44 countries took a charge in test mode; India and 13 others were refused (below).
- **A card can ask for authentication at merge.** Nothing is charged, and the owner must return to finish it. The tool states this and sends no reminders.

**Recommendation:** build it in PF11, opening with the activated-solver check and the live activation form. If Stripe demands a paid registration, stop there: solvers then use plain payment details, and the owner pays by hand.

## Answers

### Reach: can a Singapore platform make direct charges abroad?

No page read states this; K42b's list was for another charge type. The sweep created one account in each of 58 countries in the $0 setup and charged it with the saved card (run 30 in the transcript).

| Result | Countries |
|---|---|
| **Charged, activated in the other setup** | AU, US, DE, GB |
| **Charged, not activated** (40) | AT, BE, BG, CA, CH, CY, CZ, DK, EE, ES, FI, FR, GR, HK, HU, IE, IT, JP, LT, LU, LV, MT, MX, NL, NO, NZ, PL, PT, RO, SE, SG, SI, SK, TH, AE, BR, HR, GI, LI, MY |
| **Refused** (14) | IN (`card_payments` not supported for this account type and country); ID, PH, VN, PK, NG, UA, KR, TW, IL, ZA, AR, CO, CL ("not currently supported by Stripe") |

"Not activated" means Stripe allowed the account and the charge, not that a person there can finish onboarding. Sandboxes [may not enforce capabilities](https://docs.stripe.com/connect/testing). Thailand and Brazil ask for proof of liveness, Japan for a compliance survey and kana and kanji names. The UAE refused an individual ("'individual' is not a supported business type") although an account with no type was allowed, so treat it as closed to individuals. SG itself was not activated in either setup: the other setup still wanted `individual.full_name_aliases`, which the bench did not supply. Would find the rest: real onboarding in each country.

The platform's setup changes reach: Brazil and India were refused for platforms in Singapore when the platform carried the losses, while Brazil was allowed in the $0 setup.

### The saved card

**Yes.** Saved once on the platform, [cloned to the solver's account](https://docs.stripe.com/connect/direct-charges-multiple-accounts) and charged with `off_session=true`; the original stays usable. Stripe warns that a platform in another country may need `on_behalf_of` on the setup so it meets the solver's country's rules. That was not tested, because no test card separates the cases without a browser step.

### A card that asks for authentication at merge

Off-session charge returned 402 `authentication_required`; the PaymentIntent stays `requires_payment_method`. State: **owner must authenticate**. Next step: the owner opens a Stripe page with that payment's client secret ([Stripe](https://docs.stripe.com/payments/save-and-reuse)). The tool does not retry off-session. Completing that page was not run. Cards needing authentication also returned `requires_action` at saving, when the owner is present. Saving was not completed in a browser, so "authenticate once on saving, then charge freely" was not proven.

### Solvers

An individual can have an account: `business_type=individual` was accepted in 8 of the 10 countries first tried (AE and IN were not). **Checks:** identity, address, bank account, business details and terms, all Stripe's. Terms [cannot be accepted by the platform](#transcript) in this setup. A solver without Stripe uses plain payment details and the owner pays by hand.

### The owner

See the owner's page. Sources: Stripe's [services terms](https://stripe.com/en-sg/legal/ssa-services-terms), modified 28 September 2026, section 2.1; K42b's ACRA reading. The Connect section of those terms was not read to the end. Not found: whether Stripe accepts an unregistered individual as a live platform. Would find it: the live activation form, at $0. Fees: [no platform fees when Stripe bills accounts directly](https://stripe.com/en-sg/connect/pricing); Singapore cards from [3.4% + $0.50](https://stripe.com/en-sg/pricing), +0.5% international, +2% conversion, $15 dispute. "Stripe handles pricing" holds: fee payer `account`. Negative balances are [Stripe's](https://docs.stripe.com/connect/risk-management).

### Failures

Every state below was reached in the bench. Charges were counted by listing them on the connected account.

| Case | Named state | Charges |
|---|---|---|
| Declined at merge | `declined` | 0 |
| Same retry | `declined`, replayed by the same key | 0 |
| Owner fixes the card, next attempt | `paid` | 1 |
| Over the limit | `refused-over-limit`, no call to Stripe | 0 |
| Duplicate `apply` | `already-paid` | 1 |
| Same key without the lookup | `paid`, marked as a replay | 1 |
| Three `apply`s at once, 5 runs | one `paid`; others refused as busy | 1 in each of 5 |
| Solver not ready | `solver-not-ready` | 0 |
| Solver disconnected | `solver-disconnected` | 0 |
| Refund | charge marked `refunded`, from the solver's balance | 1, refunded |
| Dispute | `needs_response` on the solver's account; 0 on the platform's | 1, disputed |

Insufficient funds and the plain decline cards failed at saving, so they were never charged. The disconnected case deleted the account from the platform's side; a solver's own disconnect could not be run without a browser. Stripe's error reads "Application access may have been revoked"; whether a solver's own disconnect gives the same error is unknown.

### Stripe tells the board

Partly proven. The solver's account recorded `payment_intent.succeeded` with the bounty's id, read through the Events API, and Stripe accepted a Connect webhook endpoint. Live delivery to the board was not run, because the bench has no public address. PF11 proves it on the deployed board.

## Security lens

- **Pay over the limit:** the guard refused it with no Stripe call. With the guard removed, the same $101 charged, so the guard is the only thing stopping it.
- **Pay twice:** the lookup and the key held. With the lookup removed and a new key, as after a key's 24-hour minimum, two charges went through. Both are needed.
- **Pay an account named in a solver's text:** the record decided, and 0 charges reached the named account. Nothing in Stripe stops it: the control charge paid another connected account when handed its id. PF11 must take the payee only from the account tied to the merged pull request's author.
- **The test key:** it never reached a commit or this report. One finding: Stripe's own error echoes a masked key with its last 6 characters, which passed the first redaction and appeared once in the local log and this session's output. The bench now masks that form, and a search of the transcript finds no key. PF11 must redact Stripe's error text before showing or logging it.
- **Live keys:** none used.

## Transcript

Excerpts, with key and client secrets removed. The account ids are test objects and were deleted at close.

```text
=== activate SG (the $0 setup)
POST /v1/accounts/acct_1UWs67FSLC3Vj9ji -> 400 You cannot accept the Terms of Service on behalf of accounts where `controller[requirement_collection]=stripe`

=== paid custom-US (activated, readiness check on)
RESULT paid merge $45: {"state":"paid","pi":"pi_3UWsGx2a3kC4ZJdo1RFwgXfm","charge":"ch_3UWsGx2a3kC4ZJdo1mK7VLUb"}
platform balance before=0 sgd after=0 sgd

=== paid SG (not activated, readiness check on)
RESULT paid merge $45: {"state":"solver-not-ready"}

=== limit US
saved pm_card_visa: setup=succeeded
RESULT over the limit ($101 against $100): {"state":"refused-over-limit"}
GET /v1/charges as acct_1UWs7UF2V0fBKlTh -> 200
charges on the account for limit-15: 0

=== duplicate US
POST /v1/payment_intents as acct_1UWs7UF2V0fBKlTh key=k46/16/dup-seq-16/1/pay -> 200
RESULT first apply: {"state":"paid","pi":"pi_3UWs97F2V0fBKlTh0CBzUZJY"}
RESULT second apply, lookup on: {"state":"already-paid"}
POST /v1/payment_intents as acct_1UWs7UF2V0fBKlTh key=k46/16/dup-seq-16/1/pay -> 200
RESULT third apply, lookup off, same key: {"state":"paid","pi":"pi_3UWs97F2V0fBKlTh0CBzUZJY","replayed":"true"}
charges for dup-seq-16: 1

=== race custom-AU 5
RESULT 5 races of three applies: 5 charges

=== breakguards custom-AU
over-limit charges without the guard: 1
charges without the lookup, as after an expired key: 2

=== auth US
POST /v1/payment_intents -> 402 authentication_required
RESULT authenticate at merge: {"state":"owner-must-authenticate","piStatus":"requires_payment_method"}

=== fees
US: amount=4500 fee=161 net=4339 usd
SG: amount=5752 fee=389 net=5363 sgd rate=1.27824 [conversion 115, processing 274]
platform balance transactions: 0
platform application fees: 0

=== dispute US
dispute on the solver's account: status=needs_response reason=fraudulent amount=1100 fees=[1500]
disputes on the platform's account: 0
```

## What PF11 would contain

**First, two checks:** one solver completes Stripe's page in test mode and is charged with the readiness check on; the owner fills in the live activation form. A demand for money stops the wave.

1. **Connect:** "Connect Stripe" for solvers, in the $0 setup (fee payer `account`, Stripe liable for losses, full Dashboard, Stripe collects requirements). Decide then between these v1 properties and Stripe's newer v2 accounts.
2. **Saved card and limit:** saved once on Stripe's page, using the reward limit the tool already has.
3. **Pay on merge behind `config`, never a new command.** "Ask me each time" stays the default. Every attempt re-checks the limit, the solver's readiness and existing payments, then uses a stable key. Each state above gets its own words on the board and in `status`.
4. **Payee:** only the account tied to the merged pull request's author, never anything in a solver's text.
5. **Webhooks:** proven on the deployed board, with the key held as a board secret and Stripe's error text redacted.
6. **Provider tiles for solvers without Stripe:** PayPal, Stripe link, GitHub Sponsors, Wise; no Ko-fi. Each has a button to check the link and says "from your GitHub" or "you typed this".
7. **"Agents welcome" and the first facts** on every bounty and in the feed: reward, solutions so far, whether it pays on merge, the owner's record (D-2026-11-01-solver-distributor).
8. **Words that must change:** the front page's "Touch your money" and "carries no money" lines, since the site can now start a charge. New wording to say: it can start a charge from your saved card to the solver's own account and never holds money. The solver's page also states fees and disputes. The board's own "carries no money" text is in `packages/box-platform/src/feed.ts`, `mcp.ts` and its README, and `tests/platform` pins those words, so PF11 states that test change in its brief.

## Limits of this proof

Test mode only. Not proven: live activation for an unregistered individual, real cards, real bank behaviour, onboarding by a real person in any country, charges on an activated account in the $0 setup, a solver's own disconnect, webhook delivery, fees outside the US and Singapore. The cost of $0 is shown for test mode and stated by Stripe for live; it holds unless Stripe requires a paid registration.
