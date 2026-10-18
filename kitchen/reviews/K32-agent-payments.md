# K32 review: agents paying solvers, within the owner's mandate

Wave K32, branch `wave/K32`, base `0f2af02`, 19 October 2026. Cook: Claude Code worker (Opus 5.5). Research and design investigation: no product code or test changed, no account created, no key or wallet made, no money moved, real or test. Every web source was read on **19 October 2026** with `curl` (text only, copies in a scratch folder outside the checkout, removed at close) and is listed with its key in "Sources" at the end. Every protocol claim below carries a source key. No vendor comparison blog was used. One source describes other companies' products (Mastercard's page on Visa and American Express) and is marked secondary wherever it is used for them. The prototype and its stand-in are in `kitchen/payments/` and rerun with `node kitchen/payments/run.mjs`.

## The owner's page (read this first)

**How an agent would pay a solver.** When a solution is merged, the bounty owes its reward to the person who wrote it. Today the tool tells you whom to pay and you pay by hand through the solver's Stripe page. The proposal keeps that as the default and adds one way for the tool to pay by itself: digital dollars (USDC, a coin pegged to the dollar) sent from your own wallet straight to the wallet the solver named in their pull request. A payment service carries the signed payment to the network and pays the network's small charge, but it cannot change the amount or the recipient and never holds the money. The money goes from you to the solver and sits with nobody in between.

**What you decide, once.** For each repository: whether the tool may pay at all, and if it may, whether it asks you before every payment (the default) or pays by itself inside limits you set. The limits are the most for one bounty, the most in a period (for example $50 in 30 days), optionally the most for one solver and a lifetime total, and an end date after which it asks you again. Anything outside the limits waits for your answer, the same way a held merge waits today. Every payment is recorded with what was paid, to whom, when, and under which of your settings, and the solver is told on the issue that payment was sent.

**What you set up.** If you stay with paying by hand, nothing new: you pay as today, and you can tell your agent "I paid it", and the record will say so. For the tool to pay, four steps: get a wallet that can sign payments (ideally one that can cap its own spending), put USDC in it, which means buying it somewhere outside the tool, tell the tool which wallet and which payment service to use, and write your limits. A fifth step, switching from "ask me each time" to "pay within my limits", is optional.

**What the solver needs.** A wallet address that can receive USDC, written as one line in their pull request. They need no account with us. Turning USDC into money in a bank is their own business with an exchange. Solvers who prefer a Stripe page keep giving one, and you keep paying those by hand.

**What it costs.** Several of the payment services listed in the protocol's own documentation say they charge nothing, and the network charge is paid by the service. Your cost is buying USDC and any fee your exchange charges, which this wave did not examine. Paying by hand through Stripe costs you nothing extra; Stripe's fee comes out of what the solver receives.

**The risks.** A sent payment cannot be pulled back: a refund only happens if the solver sends the money back. A wrong or tampered address loses the money, so the tool waits for you whenever the address line was edited by anyone other than the solver, or the same address appears for two different accounts. If your agent could make your wallet sign anything at all, the tool's limits would only stop the tool, not an agent working around it; a wallet that caps its own spending closes that gap, and this wave did not test one. The payment protocol is young: its current version dates from December 2025 and its foundation launched in July 2026.

**The decision needed.** Do you want to keep USDC in a wallet for bounty rewards? That is the only route found where the tool can pay a person without you approving each payment, and without anyone holding the money in between. Every other agent-payment system examined pays shops, not people. If the answer is no, the next build records what is owed and paid and keeps paying by hand. If the answer is yes, the build after it adds the wallet route, starting with one test payment with play money that you approve before anything else is built on it.

---

## Step 1: the pay stage's questions, as criteria

From PLAN.md (the pay stage; "Autonomy with guardrails"; the reward row) and MEMORY-SPEC.md (M8, M11, M12; F-reward, F-payee, F-paid):

| Actor, moment | Question | Criterion an option is held to |
|---|---|---|
| Owner, before | How much, to whom, within what limit? | The amount is the bound reward (`boundAmount`), never typed by an agent; limits per bounty, per solver, per period, total and a time limit are expressible and checked before any payment |
| Owner, after | Was it paid? | A proof from the rail (its own reference) is recorded; a by-hand payment can be recorded on the owner's word (BT36) |
| Agent | May I pay, under which mandate? | The mode (agent decides, ask me each time, off) is the owner's per repository; "ask" is the default; the answer is a named state, never silence |
| Solver | How do I get paid, and will I? | What the payee must have (an account, a wallet address, a merchant setup) and whether they are told |
| Later reader (M11, M12) | What was paid, in my name, under which authority? | The record names amount, payee, rail reference, who decided (agent within the mandate, or the owner) and which mandate |
| All | Constraints from the brief | No custody; no credential seen by an agent; one-file package with no dependencies; facts not verdicts; real payments the owner's alone until the owner decides otherwise |

## Step 2: the options, from primary sources

### Summary

| Option | Pays a person, not a shop? | Payee needs | Limits and mandate | Human present / not present | Who holds money between | Dependencies for a one-file Node package | Maturity |
|---|---|---|---|---|---|---|---|
| Stripe Payment Link, paid by the owner (today) | yes, if the solver has a Stripe account | a Stripe account and link [S1] | none; the owner decides each time | present only | Stripe, as the solver's processor | none (the tool reads a URL) | in production |
| Stripe Link Agent Wallet paying that link | yes, same | same | the customer's Link spend limits per transaction, day, 30 days [S4]; approval of every spend request [S4] | present only (each spend request is approved) [S4] | Stripe | `link-cli` or SDK install, an OAuth token, a browser to complete the checkout [S3][S4] | available to US and Canadian customers [S3] |
| **x402 `exact` (USDC, EIP-3009)** | **yes: pays a wallet address** [X1][X2] | a wallet address [X5] | not in the protocol: "client-side budget management" is out of scope [X1]; ours to build, optionally a wallet-enforced limit [X2][M3] | both: ours to build | nobody: "The facilitator does not hold funds" [X3]; it "cannot modify the amount or destination" [X2] | none if a separate signer signs (typed data is JSON) [E1]; the official SDK pulls viem and zod [X11] | spec v2, 2025-12-09 [X1]; Linux Foundation project since July 2026 [X10] |
| MPP (Stripe and Tempo) | no: payee runs a 402 server [S7][M1] | a server; for Stripe settlement a Stripe profile [S7] | spend controls built on top; Tempo access keys enforce limits, recipients, expiry [M2][M3] | both | Stripe or the chain | `mppx` SDK [S7] | IETF Internet-Draft [M1] |
| AP2 v0.2 | no: payee is a Merchant role [A1] | merchant, credential provider, processor roles [A1] | yes, open mandates with constraints: amount range, budget, recurrence, allowed payees, execution date [A2] | both, named "direct" and "autonomous" [A1] | not AP2's concern: "AP2 operates as a security feature within a Commerce Protocol" [A1] | SD-JWT signing; "We are working on an SDK" [A4] | v0.2.0 released 2026-04-28 [A5] |
| ACP | no: merchant checkout [C1] | a business with checkout endpoints and a PSP [C1][C2] | allowance on a delegated token: one-time, max amount, expiry [C2] | present (buyer in an AI surface) | the merchant's PSP [C2] | signed requests, idempotency keys [C2] | "currently in beta" [C1] |
| Card networks' agent tokens (Visa Intelligent Commerce, Mastercard Agent Pay) | no: registered merchants [MC1] | merchant registration through an acquirer or PSP [MC1] | consumer intent data, issuer controls [MC1] | consumer authorises [MC1] | the card system | certified agent registration [MC1]; Visa's documentation is gated [V1] | Mastercard says it "has completed live agentic transactions in multiple markets" [MC1] |
| GitHub Sponsors, one-time (found) | yes: the PR author's GitHub account | a Sponsors profile in a supported region [G1] | none | present | GitHub | none (gh already signed in) | API one-time sponsorship does not work today [G2] |

**The decisive fact.** Every agent-payment protocol examined is built for an agent buying from a seller: the payee runs an HTTP endpoint that answers `402` (x402, MPP), a checkout (ACP), or is a registered merchant (AP2's Merchant role, card networks). A bounty reward is the opposite shape: a push from the owner to a person who runs nothing. Two rails push to a person without a merchant setup: a stablecoin transfer to the person's wallet, which x402's `exact` scheme performs through ERC-3009 and a facilitator; and GitHub Sponsors, whose API cannot make one-time payments today [G2]. Today's Stripe link works because the solver is their own Stripe merchant, and only a human (or Link Agent Wallet with a human approving each payment and a browser completing the checkout) can pay it.

### Today's Stripe Payment Link (BT11b), by hand

- What it is: a Stripe-hosted payment page the solver creates; "Create a payment link and share it" [S1]. The solver needs a Stripe account ("If you don't have a Stripe account, sign up") [S1]. The tool only recognises `https://buy.stripe.com/<id>` and never opens it (pay.ts).
- Who pays and how: the owner, in a browser, by card or the page's methods (40+ payment methods listed) [S1]. Refunds are the seller's: "No-code refunds" [S1]. Fees: Stripe charges the seller per successful transaction; the rate did not render to text on this host (`curl` crashed on stripe.com and the page's numbers are rendered by script), so no figure is given.
- Money in between: Stripe as the solver's processor; not us.
- Mandate: none; every payment is a human decision. Human not present: not possible.
- Credential: the owner's card, entered by the owner. Test mode: `test_` links (pay.ts).
- Risk the design must keep: the solver sets the price on their own page; pay.ts already tells the owner to check the page asks for the bound amount.

### Stripe Link Agent Wallet (paying the solver's Stripe link)

- An agent creates a spend request for a specific amount and seller; "The customer approves it on the Link website or in the mobile app"; Link returns a one-time credential [S4]. `--no-request-approval` only defers the request ("call `spend-request request-approval <id>` when you're ready") [S4]. No documented mode pays without approval, so it is human-present only.
- For Stripe checkouts it returns a Link Pay Token that an agent injects into the checkout page's DOM; otherwise a one-time virtual card number written to a file [S4]. Either way the agent handles a payment credential and drives a browser, which breaks two constraints (no credential seen by an agent; one file, no browser).
- Limits: `agent_wallet_spend_limits` with `per_transaction`, `daily` and `thirty_day` [S4]; idempotency keys on spend requests [S4]. Availability: "Agent payments: US and Canadian customers" [S3]. Authentication: an OAuth access token per customer, not a Stripe key [S3]. Test mode: `--test` [S4].
- Fit: a good human-present tool for paying today's links, but it needs a browser and an install, so it does not fit a one-file tool. Not recommended for the tool; an owner may use it by hand.

### x402 (`exact` scheme, EIP-3009)

- What it is: "an open standard for internet native payments", contributed by Coinbase; the repository moved to the x402 Foundation [X9]; the Linux Foundation announced the Foundation's operational launch on 14 July 2026 with 40 members, Cloudflare, Coinbase, Google, Mastercard, Stripe and Visa among them [X10] (the Foundation's own site). Specification v2 dated 2025-12-09 [X1]; TypeScript `@x402/core` at 2.28.0 [X11].
- Who pays and how: the client signs an ERC-3009 `transferWithAuthorization` (from, to, value, validAfter, validBefore, nonce) [X1 §5.2][E1]; a facilitator verifies (`POST /verify`, read-only) and settles (`POST /settle`) [X1 §7]. On EVM `exact`, "the Facilitator (server) pays the gas, but the Client (user) controls the exact flow of funds"; "the Facilitator cannot modify the amount or destination" [X2]. USDC on Base is listed with EIP-3009 support, 6 decimals [X8].
- Payee needs: a wallet address. Wallets let buyers "transact without account creation or credential management" [X5]; the seller's wallet address is in the payment requirements as `payTo` [X1][X5].
- Limits and mandates: out of the protocol's scope ("Client-side budget management") [X1]; "Budget management and spending controls (implementation-specific)" [X1 §12.1]. Ours to build. A wallet-enforced limit is possible with smart-account delegation (ERC-7710 is one of the scheme's transfer methods) [X2] or, on Tempo, access keys with spending limits, recipient scopes and expiry [M3]; neither was tested here.
- Human present or not: either; the protocol does not care who decides to sign.
- Irreversibility: "The `exact` scheme is a push payment, irreversible once executed"; refunds are "a new token transfer back to the buyer" [X4].
- Fees: Base and Base Sepolia "fee-free"; "Gas paid onchain; many facilitators offer zero facilitator fees" [X4]; listed facilitators include several stating no fees or no API keys, and Coinbase's "with KYT/OFAC checks on every transaction" [X6].
- Who holds money: nobody: "The facilitator does not hold funds or act as a custodian" [X3].
- Credentials: the payer's signing key. The tool need not hold it: ERC-3009 obtains the signature "using a web3 provider with the `eth_signTypedData{_v4}` method" [E1], so the tool builds JSON typed data and a separate signer the owner set up signs it.
- Test mode: Base Sepolia `eip155:84532` [X1 §11.1]; "the public `x402.org` facilitator is intended for development and testnet workflows" [X3].
- Idempotency: ERC-3009 nonces are 32 bytes chosen by the payer and a used one never transfers again (`authorizationState`) [E1]; "EIP-3009 contracts inherently prevent nonce reuse at the smart contract level" [X1 §10.1]; a `settlement_pending` response carries the broadcast transaction hash "so the caller can reconcile on chain before retrying" [X1 §9][X3]. An optional `payment-identifier` extension caches by payment ID on servers [X7].
- Dependencies: the official EVM package depends on `viem` and `zod` [X11]. Without it, the tool needs only `fetch` and `node:crypto` sha256 if the signer signs; validating an address's EIP-55 checksum would need Keccak-256, which Node does not ship (its `sha3-256` is the NIST variant).
- Regulatory notes the documentation itself raises: private facilitators "for enterprises that need custom KYT / KYC flows" [X4]; Coinbase's facilitator screens KYT/OFAC [X6]; Stripe's stablecoin acceptance is "available to businesses in all US states, except New York" [S6]. No legal advice is given or implied.
- Fit: the only protocol whose primitive is a push to a bare address. It is used here outside its documented flow: x402 expects the payee's resource server to call the facilitator; here the tool, acting for the payer, calls `/verify` and `/settle` itself with the solver's address as `payTo`. The request shapes allow it (`PaymentPayload.resource` is optional [X1 §5.2]), but **no real facilitator was contacted**, so whether a production facilitator settles a request that no resource server sent is unverified.

### MPP, the Machine Payments Protocol

- "an open protocol that lets agents pay for your APIs and services programmatically", co-authored by Stripe and Tempo [S7]; the core is "submitted to the IETF standards track" as the Payment HTTP Authentication Scheme draft [M1]. The payee runs a server that answers `402` with a `WWW-Authenticate` challenge [S5][S7]; Stripe settles card (Shared Payment Tokens, minimum US$0.50) or stablecoin payments to the seller's Stripe balance [S6].
- The useful lesson is spend control: "Spend management is independent of any one payment rail" and Tempo access keys set "token spending limits", "recipient restrictions" and "future-dated expiration dates" [M2], with per-period limits [M3]; "Each key can have its own expiry, budget, scopes, recipients, and revocation path" [M2].
- Fit: payee must run a server; not for paying a person. Its spend-control model informs the design's second lock.

### AP2 v0.2

- AP2 now defines a Checkout Mandate and a Payment Mandate, each "open" (constraints the user approved) or "closed" (a specific transaction) [A1]. The brief's first look described intent and cart mandates, which is the v0.1 vocabulary: v0.1.0's specification names "the Cart Mandate", "the Intent Mandate and the Payment Mandate" [A6] (v0.1.0 released 2025-09-16, v0.2.0 on 2026-04-28) [A5].
- Modes: "Human Present (Direct): The User directly sees the closed Checkout and approves it"; "Human Not Present (Autonomous): The User sees and approves a set of constraints"; the agent then signs closed mandates with its own key, bound by a `cnf` claim, and it is "RECOMMENDED to set the `exp` claim ... to the smallest value" [A1].
- Constraints on an open Payment Mandate: `payment.amount_range`, `payment.budget` (a running total), `payment.agent_recurrence` (frequency, max occurrences), `payment.allowed_payees`, `payment.allowed_payment_instruments`, `payment.execution_date` (not before, not after) [A2]. The closed mandate's required fields: `transaction_id`, `payee`, `payment_amount` (integer minor units with ISO 4217 currency), `payment_instrument` [A3].
- An agent "MUST NOT present any subsequent open Payment or Checkout Mandates without receiving a rejection receipt from the previous one" [A1], AP2's own guard against double use.
- AP2 moves no money; it "operates as a security feature within a Commerce Protocol" [A1]; the payee is a Merchant; on an SDK the FAQ says "We are working on an SDK and a MCP server right now" [A4]; trying it without money means "internal environments where you may already have ways to invoke fake payment methods" [A4].
- Fit: not a rail. Its constraint vocabulary is what the mandate below borrows, name for name.

### ACP, the Agentic Commerce Protocol

- Maintained by OpenAI and Stripe, "currently in `beta`", date-versioned, latest stable `2026-04-17` [C1]. Buyers' agents complete purchases with businesses "without being the merchant of record" [C1].
- The delegate payment API issues a vault token usable "only within explicit Allowance constraints": `reason` must be `one_time`, `max_amount`, `currency`, `checkout_session_id`, `merchant_id`, `expires_at` [C2]. Its idempotency rules are worth copying: a required `Idempotency-Key`, `422 idempotency_conflict` for the same key with a different body, `409 idempotency_in_flight`, responses kept "for at least 24 hours", and servers "MUST NOT re-execute side effects ... on replay" [C2].
- Fit: merchant checkout through the merchant's PSP; a solver is not a merchant. Not a rail for bounties.

### Card networks' agent tokens

- Mastercard's developer documentation: "Only registered agents can transact through the network. Each agent goes through a security review before being certified"; agents "use secure tokens", "a one-time or limited-use credential"; "Merchants should be registered to participate in Mastercard Agent Pay, Visa Intelligent Commerce, and American Express ACE. This registration is typically handled by your acquirer or Payment Service Provider" [MC1]. Its statements about Visa and American Express are secondary (Mastercard describing others).
- Visa: Visa Intelligent Commerce is "our strategic portfolio for the age of AI agents" [V2]; the developer documentation says "Access to this product is limited to authorized users ... create an account, add this product to your project, and request access" [V1]; Visa's reference agent notes "VIC ... is Visa card network centric" and integrates Visa Token Service and payment passkeys [V3].
- Fit: payees must be card-accepting merchants and agents must be certified; neither a CLI tool nor a solver qualifies. Mastercard Agent Pay's own product page did not render to text (a script-only page, and the business page answered 403), so nothing beyond [MC1] was read.

### Found: GitHub Sponsors, one-time

- The payee is the merged pull request's author account, already known to the tool from GitHub, so no stranger's line needs parsing. "GitHub Sponsors does not charge any fees for sponsorships from personal accounts"; up to 6% from organisations [G1]; receiving requires residing in a supported region [G1]. The GraphQL `createSponsorship` mutation takes `amount` (US dollars, 1 to 12000) and `isRecurring` [G3], but GitHub's own guide says "The `createSponsorship` mutation currently does not work for one-time payments" [G2].
- Fit: the tidiest payee identity of all, and free, but the tool cannot make the payment today. Worth one sentence in a future pay message ("this solver has a GitHub Sponsors profile") only if real use asks; not built here.

## Step 3: the design

**Recommended rail:** x402 `exact`, USDC, from the owner's own wallet to the solver's wallet address, with the owner's mandate checked by the tool before anything is signed, the signature made by a signer the owner set up (never by the tool or the agent), and the payment's proof recorded. **The default stays "ask me each time", and the first rail built is "by hand"** (today's Stripe link plus BT36's manual record), because the x402 rail needs the owner's decision to hold USDC and one real test-network payment before it is trusted.

### The mandate (the owner, once, through `config`)

Per repository, beside the reward and its limit (money is per repository, PLAN.md). Names follow AP2's constraints [A2]. The owner's surface stays `allow`, `deny`, `config`.

| Setting | Values | Default | AP2 counterpart |
|---|---|---|---|
| `pay` (the mode) | `ask` (ask me each time), `agent` (the agent decides within the limits), `off` | `ask` | human present / human not present |
| `pay-rail` | `by-hand`, `usdc-base` (x402 `exact` on `eip155:8453`) | `by-hand` | `payment.allowed_payment_instruments` |
| `pay-limit` | `per-bounty=<$>`, `per-period=<$>/<days>`, optional `per-solver=<$>/<days>`, optional `total=<$>`, `until=<date>` | none | `payment.amount_range.max`, `payment.budget` with `payment.agent_recurrence`, `payment.execution_date.not_after` |
| `pay-from` | the owner's wallet address (public, not a secret) | none | the payer |
| `pay-signer` | where signing happens: a local JSON-RPC endpoint answering `eth_signTypedData_v4` [E1], or the signer the build wave settles on | none | the Trusted Surface (ask) or the agent key under the open mandate (agent) |
| `paid <id>` / `paid <id> no` | the owner's word that a payment was made by hand, and its withdrawal (BT36) | none | none |

Rules on writing them, enforced in `config`: `agent` is refused until `per-bounty`, `per-period` and `until` are all set (an open-ended mandate is no mandate); `per-bounty` below the repository's reward is stated as a fact ("bounties here state $X; the agent may pay up to $Y, so each payment will wait for you"); `off` and `until` in the past both take effect at once, also for payments already waiting.

### The flow

1. **Merge recognised** (`apply`, or any merge recognised later, BT7b). The bounty closes as today; **closing never waits on payment** (PLAN.md). The payment owed is a separate fact: amount from `boundAmount` (the posted issue body, BT11a), payee from the merged attempt's `pay-to:` fact read at collection and re-read at close (BT11b already re-reads and records `editedBy`).
2. **Decide** with one pure function, `checkMandate(mandate, ledger, owed, answer)`, rules in this order, first match wins (the prototype's order):
   1. already paid or pending for this bounty → refuse `pay-duplicate` (a fact, with the proof);
   2. not merged, or reward $0 → refuse `paid-nothing-owed`;
   3. mode `off` or rail `by-hand` → the pay message as today, payment owed;
   4. no recognised address on the rail's network → hold `pay-no-address`;
   5. an owner answer bound to exactly this bounty, amount and address → pay, recorded as the owner's;
   6. address edited by someone other than the solver → hold `pay-payee-edited`; address paid before for a different account → hold `pay-payee-shared`;
   7. mode `ask` → hold `pay-ask`;
   8. mandate past `until` → hold `pay-mandate-expired`;
   9. over `per-bounty`, then `per-solver`, `per-period`, `total` (counting payments the agent made under the mandate, including any in flight) → hold with the named limit.
   10. otherwise pay, recorded as the agent's under the mandate of `<date>`.
3. **Hold** exactly as merges are held (BT13): the record's `waiting` names the payment; the owner's lines say in plain words whom, how much, where, and why it waits; the owner answers with the same `allow <id>`; the answer lives in the owner's settings outside the repository, bound to the bounty, amount, address and nonce (like `mergeAnswers`), so a changed address is asked again. The agent is told the payment waits and carries on; nothing blocks on the owner.
4. **Pay** (the rail module, the only code that touches the network): read the chain state of this bounty's nonce first; write a `paying` intent to the record; build the ERC-3009 typed data; ask the owner's signer to sign it; `POST /verify` and check the returned `payer` is `pay-from`; `POST /settle`; record `paid` with the rail's proof.
5. **Proof recorded**: a `paid` event `{ amount, by: 'agent' | 'owner' | 'owner-record', rail, network, transaction, payer, payTo, nonce, mandateAt, at }`. BT32's reserved shared `paid` event (`amount, by, withdrawn`) gains `rail` and `reference`; the transaction is public on the chain anyway.
6. **The solver told**: one marked comment from the tool on the issue: "Payment for this bounty was sent to the address in the merged pull request: transaction `<hash>` on Base." No amount beyond what the issue states. Nothing is posted for a by-hand record (BT36: payment between owner and solver is private).

### What the solver provides

One line in the pull request description, beside or instead of the Stripe link: `pay-to: eip155:8453:0x<40 hex digits>` (a CAIP-10 account id: network, then address). It is read by the same allow-list rules as BT11b's Stripe line: first `pay-to:` line only, exactly one space, one value, end of line, at most 200 characters, no control or bidirectional characters, the network must be the rail's own; anything else is "a line was given that is not a recognised payment address" and is never echoed. The agent sees only the tool's fact ("a recognised wallet address on Base was given"); the owner's hold lines show the address itself, which is tool-validated hex, not free text. Open item for the build wave: EIP-55 checksum validation needs Keccak-256, a non-secret computation that could be bundled with published test vectors; without it a mistyped address passes the shape check.

### Failure and safety

| Case | What happens | Why it holds |
|---|---|---|
| Duplicate payment, same machine | refused `pay-duplicate` with the proof | the ledger's latest entry for the bounty |
| Duplicate from a second machine, or a lost record | nothing is signed: the chain check finds the nonce spent | the nonce is `sha256("box-bounty-pay/v1", repository, bounty id)`, the same on every machine, and ERC-3009 never moves money for a used nonce [E1][X1 §10.1] |
| Every tool check bypassed | the second signature carries the same nonce; the token contract refuses it | the chain is the second lock (prototype outcome 2b) |
| A payment failing midway (settled, then the process dies) | `paying` intent left, named state "may or may not have gone through, run it again"; the rerun finds the nonce spent and records `paid` | write-ahead before signing; reconcile before resending; `settlement_pending` carries the hash [X1 §9] |
| A forged payee line | held when the description was edited by someone else, or the address was paid for another account; never paid on an unrecognised line | BT11b's `editedBy`; the allow-list |
| A mandate exhausted | held with the named limit; the owner answers once or raises the limit | limits counted before signing, in-flight payments included |
| The owner revokes it | `off` refuses at once; waiting payments stay owed; an expired `until` holds | rules 3 and 8 run before any signing |
| An agent goes around the tool | the tool's checks do not stop an agent that can ask the signer directly | only a wallet-enforced limit does (ERC-7710 delegation [X2], Tempo access keys [M3]); the build wave should prefer such a signer and say plainly when the signer has no limit of its own |
| The solver's page or address asks for more | the amount is always the bound reward, never read from the payee | `boundAmount`; x402 `value` must equal `amount` [X1 §9] |

### Where it lives

| Module | Change |
|---|---|
| `settings.ts` | the mandate fields on each repository entry; `payAnswers` beside `mergeAnswers` |
| `money.ts` | `checkMandate` (pure) and the period sums |
| `pay.ts` | the address line parser beside the Stripe one; the owed fact; the pay message gains "paid", "waiting" and "by hand" forms |
| `gate.ts` | the pay hold, shaped like the merge hold |
| new `pay-rail.ts` | the x402 calls, the signer call, the chain check; the only network code of the pay stage |
| `record.ts`, `store.ts` | `paying` (machine tier) and `paid` events |
| `owner.ts` | `config set pay…` and `config set paid <id> [no]` |
| `render.ts`, `json.ts` | `payment: owed $n to <solver>` / `paid $n on <date>` / `waiting for the owner`; `status --json` `payment` object; the overview's one owed line (BT36) |
| BT32 chain events | `paid` gains `rail`, `reference` |

**MEMORY-SPEC.md gains** (with the moment that needs each): F-paid filled (M8, M11, M12: written by the tool at payment or by the owner's record; project tier; forever; `paid` events); F-mandate (M7, M8, M12: the owner's pay settings; owner tier; settings); F-paying (M8 recovery: the write-ahead intent; machine tier; until settled); F-payee gains the address form beside the Stripe link; M12's question "what was promised in money" extends to "what was paid in my name, by whom, under which mandate".

## Step 4: the prototype against a stand-in

`kitchen/payments/` (README there). The stand-in is written by hand from the x402 v2 specification, the `exact` EVM scheme and ERC-3009, with every copied shape quoted in its header: `POST /verify`, `POST /settle`, `GET /supported`, a JSON-RPC `eth_signTypedData_v4` signer, balances and used nonces. What is not real is stated there: the signature is an HMAC with a per-run secret, not secp256k1 ECDSA; transactions are random ids; the nonce lookup stands in for an `eth_call` to `authorizationState`. Nothing was installed; the official SDK was not downloaded.

Run on base `0f2af02`, Windows, Node 24.11.0, exit 0, **24/24 outcomes as expected** (`kitchen/payments/evidence/run-2026-10-19.log`):

| # | Brief's step 4 | Outcome |
|---|---|---|
| 1 | a $5 reward under a $20 mandate is paid once | paid; owner −5 USDC, solver +5 USDC, one settle |
| 2 | a second payment for the same bounty is refused as a duplicate | refused `pay-duplicate`, nothing signed; 2a from a second machine with an empty ledger: nothing signed, found paid on the chain; 2b with the tool's checks bypassed: signed again, the stand-in contract refused the reused nonce, nothing moved |
| 3 | a $25 reward exceeds the mandate and is held for the owner | held `pay-over-bounty-limit`, nothing signed |
| 4 | a revoked mandate refuses | refused `pay-by-hand`, nothing signed; 4a expired: held `pay-mandate-expired` |
| 5 | the proof is recorded | amount, solver, address, network, transaction, nonce, `by: agent`, mandate date |

Beyond the brief: ask me each time holds, an answer bound to another address does not pay, the bound answer pays and is recorded as the owner's (6); a crash after settling leaves a named state and the rerun moves no more money (7); an edited payee line and a shared address are held, and seven malformed or foreign lines are unrecognised (8); per-period and per-solver limits count earlier payments and roll after 30 days (9); BT36's owner record takes the bound amount, refuses a second record, withdraws, and refuses when nothing is owed (10); the stand-in's total movement, 40 USDC in 6 transfers, equals the ledgers (11).

**The run can fail.** In a scratch copy, replacing the derived nonce with a random one turned 2a, 2b, 5, 7a and 11 red (19/24, exit 1); also removing the per-bounty rule added 3 (18/24). Limits of this evidence: one stand-in, written by the same agent that wrote the design, so it proves the design's logic, not any real facilitator's behaviour. The evidence station's rule applies: a stand-in that answers is not one that answers correctly; the build wave compares it with one real test-network transcript before trusting it.

## Step 5: the recommendation, its cost and risks, and the build outline

**Recommendation.** Build the pay stage's mandate, hold and payment record now with "by hand" as the only rail, folding in BT36's manual record, so every merged bounty states owed or paid and the default "ask me each time" holds money exactly as it holds merges. Add x402 `exact` (USDC, owner's wallet to the solver's address, a facilitator broadcasting, nobody holding the money) as the first automatic rail only after the owner decides to hold USDC, and only after one real test-network payment the owner approves.

**Cost.** By hand: nothing new. The x402 rail: the owner buys USDC (exchange and its fees not examined); facilitator and network costs are listed as zero on Base by the protocol's own documentation [X4]; a solver needs only an address. For the package: no dependency if the signer signs (the tool sends JSON typed data and uses `fetch` and sha256); an optional Keccak for address checksums.

**Risks.** Irreversible payments [X4]; a mistyped address passes the shape check without EIP-55; a facilitator settling a payer-sent request is unverified; the tool's limits do not bind an agent that can reach the signer directly unless the wallet caps itself; ERC-3009 is still a Draft ERC [E1] though USDC implements it [X8]; regulatory screening by some facilitators [X6] and regional limits on stablecoin services [S6]; the protocol is young [X1][X10].

**The owner's one-time setup, counted.** By hand: 0 steps (the owner's one sentence "I paid it" is relayed as `config set paid <id>`). x402 with ask me each time: 4 steps: (1) a wallet on Base that signs typed data, preferably one that caps its own spending; (2) fund it with USDC; (3) one `config` line naming the rail, the wallet address and the signer; (4) one `config` line with the limits. Agent decides: a 5th, `config set pay agent`.

**What changes in PLAN.md** (proposed text for the CTO; not edited by this wave):
- "What is settled", Reward: "The tool never pays" becomes "The tool pays only through a rail the owner set up, from the owner's own wallet straight to the solver, inside the owner's mandate, asking the owner before each payment by default; it records every payment, and the owner's own by-hand payments on their word."
- Engineering roadmap, Pay stage: states `names whom to pay` → `owed` → `paid` / `waiting for the owner`; guarantees add "one payment per bounty, ever; every limit checked before anything is signed; no credential in the tool or in front of the agent; closing never waits on payment".
- "Not in this plan" keeps "holding anyone's money" and adds "any rail where a party other than the owner and the solver holds the money in between".
- "What we know": "An agent paying by itself depends on agent payment products that are still early" gains: "K32 found every agent-payment protocol built for paying shops; only a stablecoin push to a wallet pays a person without a merchant setup."

**Build outline.**

| Wave | Outcome | Needs | Tests (minimum) |
|---|---|---|---|
| **BT37** the pay stage records and holds, by hand | `config set pay ask/agent/off`, `pay-rail by-hand`, `pay-limit …`, `config set paid <id> [no]` (BT36 folded in: amount from `boundAmount`, refused `paid-nothing-owed` unless merged with reward above $0, a withdrawal event keeps history); `status` `payment: owed $n to <solver> (<link state>)` / `paid $n on <date>`; `status --json` `payment: { owed, solver, paidAt, by, rail, reference }`; the overview's `<k> payment(s) owed` line only when k > 0; shared `paid` event; MEMORY-SPEC updated; `checkMandate` in `money.ts` as a pure function with the rule order above | the owner's confirmation of the `config set paid` wording (BT36 decision 1) | BT36's seven rows; `checkMandate` table: each of the ten rules, first-match order, in-flight payments counted, period roll; `agent` refused without `per-bounty`/`per-period`/`until`; no GitHub call from `config set paid`; a by-hand record never posts |
| **BT38** the x402 rail | `pay-rail usdc-base`; the `pay-to: eip155:8453:0x…` line; `pay-rail.ts` (signer JSON-RPC, `/verify`, `/settle`, the nonce check); write-ahead and reconcile; the pay hold and `allow <id>` for payments; the solver's issue comment | the owner's "go" to hold USDC and to name a facilitator and signer (new remote destinations); a first real payment on Base Sepolia with a test wallet, transcript saved, before the stand-in is trusted | the K32 run's 24 outcomes promoted to tests against a stand-in checked against that real transcript; the parser's allow-list; a dropped settle response; the chain-lock case with tool checks bypassed |
| **K-wave** one real payment | one real $1 payment in the sandbox repository, owner-approved, ask me each time | BT38; the owner's go for real money | the record, the issue comment and the chain transaction agree |

## Principles that changed a decision

- **make-operations-idempotent**: I had first planned an idempotency key kept in the ledger, as ACP and Link do [C2][S4]. Asking "what if the ledger is lost or a second machine runs it?" moved idempotency onto the chain: the nonce is derived from the bounty, so the token contract itself refuses a second payment (outcome 2b), and every crash point converges (outcome 7).
- **boundary-discipline**: the solver's line is parsed once at the boundary into an address or a named state; `checkMandate` is a pure function over typed inputs; all network code sits in one rail module. The prototype is laid out that way so the build wave can test the rules without a network.
- **never-block-on-the-human**: the default "ask" holds the payment, not the bounty; closing and the agent's next work never wait for the owner's answer, matching PLAN.md's "closing never waits".
- **prove-it-works**: the run asserts the stand-in's balances, not the tool's own claims, and a mutation check shows the run fails when the nonce rule or a limit rule is broken.

## What was not examined, and why

- **Any real facilitator, wallet, signer or network**: the brief forbids accounts, keys and payments; whether a production facilitator settles a payer-sent request is the build wave's first fact to establish.
- **Concrete signer products** (Coinbase's wallet API recommended by the x402 docs [X5], Privy shown by the MPP docs [M2], smart-account spend permissions on Base): only the lines cited were read; their policies, accounts and keys were not examined.
- **Buying and cashing out USDC** (exchanges, their fees and identity checks), **tax**, and **money-transmission law**: outside a documentation read; no legal advice.
- **Stripe's card fee figure**: the pricing page did not render to text on this host.
- **Visa's developer documentation** (gated behind an account) and **Mastercard Agent Pay's product pages** (script-only, or 403); American Express ACE beyond Mastercard's secondary mention.
- **Other push rails**: PayPal or Venmo payouts, Wise, Lightning (MPP lists it), Stripe Connect payouts (the owner would become a platform and each solver a connected account), Open Collective. Not read; each needs the payee to hold an account with that service.
- **The x402 SDK's code**: not downloaded or run, by the brief's no-install rule; the stand-in is from the specifications only.

## Sources (all read 19 October 2026; primary unless marked)

- [X1] x402 Protocol Specification v2 (version history: v2.0 2025-12-9): https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md
- [X2] Scheme `exact` on EVM: https://github.com/x402-foundation/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md
- [X3] Facilitator (published at docs.x402.org/core-concepts/facilitator): https://github.com/x402-foundation/x402/blob/main/docs/core-concepts/facilitator.md
- [X4] x402 FAQ: https://github.com/x402-foundation/x402/blob/main/docs/faq.md
- [X5] Wallet: https://github.com/x402-foundation/x402/blob/main/docs/core-concepts/wallet.md
- [X6] Facilitators directory: https://github.com/x402-foundation/x402/blob/main/docs/dev-tools/facilitators.md
- [X7] Payment-identifier extension: https://github.com/x402-foundation/x402/blob/main/docs/extensions/payment-identifier.mdx
- [X8] Networks and token support: https://github.com/x402-foundation/x402/blob/main/docs/core-concepts/network-and-token-support.mdx
- [X9] Repository READMEs, x402-foundation/x402 and coinbase/x402 ("now a development fork"): https://github.com/x402-foundation/x402 , https://github.com/coinbase/x402
- [X10] Linux Foundation announcement of the x402 Foundation's operational launch, 14 July 2026, on the Foundation's site: https://x402.org/linux-foundation-announces-operational-launch-of-x402-foundation-to-standardize-internet-native-payments-for-ai-agents-and-applications/
- [X11] Package manifests: https://github.com/x402-foundation/x402/blob/main/typescript/packages/core/package.json (2.28.0), https://github.com/x402-foundation/x402/blob/main/typescript/packages/mechanisms/evm/package.json (depends on viem, zod)
- [E1] ERC-3009 Transfer With Authorization (status: Draft): https://github.com/ethereum/ERCs/blob/master/ERCS/erc-3009.md
- [A1] AP2 specification v0.2: https://github.com/google-agentic-commerce/AP2/blob/main/docs/ap2/specification.md (site: https://ap2-protocol.org/)
- [A2] AP2 Payment Mandate: https://github.com/google-agentic-commerce/AP2/blob/main/docs/ap2/payment_mandate.md
- [A3] AP2 payment mandate schema: https://github.com/google-agentic-commerce/AP2/blob/main/code/sdk/schemas/ap2/payment_mandate.json
- [A4] AP2 FAQ: https://github.com/google-agentic-commerce/AP2/blob/main/docs/faq.md
- [A5] AP2 releases (v0.1.0 2025-09-16, v0.2.0 2026-04-28): https://github.com/google-agentic-commerce/AP2/releases
- [A6] AP2 v0.1.0 specification (section 4.1): https://github.com/google-agentic-commerce/AP2/blob/v0.1.0/docs/specification.md
- [C1] ACP README: https://github.com/agentic-commerce-protocol/agentic-commerce-protocol
- [C2] ACP delegate payment RFC: https://github.com/agentic-commerce-protocol/agentic-commerce-protocol/blob/main/rfcs/rfc.delegate_payment.md
- [S1] Stripe Payment Links: https://docs.stripe.com/payment-links
- [S2] Stripe agentic commerce: https://docs.stripe.com/agentic-commerce
- [S3] Link Agent Wallet: https://docs.stripe.com/agentic-commerce/agents/link-agent-wallet
- [S4] Enable agents to spend: https://docs.stripe.com/agentic-commerce/agents/link-agent-wallet/use-link-wallet-pay-online
- [S5] Pay machine-payment businesses: https://docs.stripe.com/agentic-commerce/agents/link-agent-wallet/machine-payments
- [S6] Machine payments: https://docs.stripe.com/payments/machine
- [S7] MPP on Stripe: https://docs.stripe.com/payments/machine/mpp (and x402 on Stripe: https://docs.stripe.com/payments/machine/x402)
- [M1] MPP protocol overview and governance: https://mpp.dev/protocol.md , https://mpp.dev/governance.md
- [M2] Managing agent spend: https://mpp.dev/guides/managing-agent-spend.md
- [M3] Tempo access keys: https://docs.tempo.xyz/guide/use-accounts/authorize-access-keys
- [V1] Visa developer page (redirects to /docs/visa-intelligent-commerce, access-gated): https://developer.visa.com/capabilities/visa-intelligent-commerce
- [V2] Visa Intelligent Commerce: https://corporate.visa.com/en/products/intelligent-commerce.html
- [V3] Visa reference agent: https://github.com/visa/vic-reference-agent
- [MC1] Mastercard developer guide, "The Rails for Agentic Commerce" (primary for Mastercard; **secondary** for its statements about Visa and American Express): https://developer.mastercard.com/merchant-cloud/documentation/tutorials-and-guides/ai-revolution/14/index.md
- [G1] About GitHub Sponsors: https://docs.github.com/en/sponsors/getting-started-with-github-sponsors/about-github-sponsors
- [G2] Getting started with the Sponsors GraphQL API (known issue): https://docs.github.com/en/sponsors/integrating-with-github-sponsors/getting-started-with-the-sponsors-graphql-api
- [G3] GitHub GraphQL schema, `CreateSponsorshipInput`: https://docs.github.com/public/fpt/schema.docs.graphql
- In the repository: `packages/box-bounty/pay.ts`, `money.ts`, `settings.ts`, `gate.ts`; PLAN.md; `docs/box-v4/MEMORY-SPEC.md`; `waves/BT36.md`.
