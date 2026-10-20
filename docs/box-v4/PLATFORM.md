# The platform: design (K42)

Written by the K42 cook on 21 October 2026 for milestone PF (D-2026-10-20-platform). Research and design only: no account was created, no key made, no money moved. Every source was read on **21 October 2026**; references are numbered at the end. Where no primary source was found the claim is under "Not found". Where an answer needs a lawyer or a tax adviser, it says so. K43 decides what is shown and how; this document names the data, the flows and who holds money.

## The owner's page (read this first)

**What the platform does.** It lists open bounties on a public page, and when a solution is merged it charges the owner's saved card and pays the solver, through Stripe. The owner never clicks a solver's link again. The CLI stays the main tool; the platform is the place bounties can be seen and the money moves.

**The money, in one sentence.** Nobody holds money while a bounty is open: the owner's card is only saved with Stripe, and it is charged once, after the platform has checked on GitHub itself that GitHub records exactly one solution pull request as merged and that its commits are on the repository's default branch, and Stripe passes that charge straight to the solver's Stripe account in the same operation.

**What that trades away.** Because nothing is held in advance, a solver cannot be sure the card will work at the end. The board says so as a fact ("payment method on file, limit $X") instead of promising "funded". Holding money in advance is what Bountysource did before it stopped paying [1], and what Upwork does only through a licensed escrow company [15]; neither fits a project that spends nothing.

**What you set up, once.** Nine steps, seven of them at $0 (section 7). Two are not $0 as far as we can tell: a lawyer's look at the terms and privacy policy, and possibly a legal entity for the Stripe platform account. Those are decisions D1 and D6.

**The hosting finding.** Vercel's free plan forbids "any method of requesting or processing payment from visitors of the site" [H2], so the platform cannot run on it. The recommendation is Cloudflare's free Workers plan with its built-in database [H3][H4] (decision D2).

**Decisions for you** are in section 9: seven, each with one recommendation.

## 1. What others learned

Facts only, with sources in each cell. "Solver trust" means what made solvers believe they would be paid.

| Platform | Money model | Solver trust / poster trust | What went wrong or changed |
|---|---|---|---|
| **Bountysource** | Backers' money was posted to the site and held there until a claim was accepted [1][2]. | Trust rested on the site paying out. | In June 2020 a terms change would have let it keep money on bounties unsolved after two years; it was withdrawn after projects objected, and elementary withdrew its funds and left [2]. From early 2023, users on Bountysource's own tracker reported cash-outs unpaid for months (amounts from $139 to about $4,000) and no replies from support [1]. |
| **Polar** | Issue funding: pledges on GitHub issues (the feature its own pull requests removed [3][4]). | — | Creating new pledges was removed on 20 March 2025 [3]; "Remove Issue Funding" was merged on 14 April 2025 [4]. Its 2.0 roadmap describes a billing platform for software businesses [5]. The announcement that explained why returned 404 (Not found, N1). |
| **Algora** | Nothing is charged at posting: the poster pays when it rewards a solution, through a Stripe Checkout carrying the reward and fee lines, or with autopay, where a merged pull request charges a saved payment method [6]. Fees are added on top: a platform fee (9 % community tier; 19 % falling to 5 % by volume on the expert tier) plus a 4 % transaction fee, labelled "includes all platform and payment processing fees" [6]. Separate charges and transfers: the transfer to the solver uses the charge as `source_transaction` and an idempotency key `credit_<id>`; credits wait until the solver's payout account is active [6]. Express accounts (Standard for Brazil); its list holds 119 payout countries [6]. | Solver receives the full reward; the poster sees one total. | Its site now presents a hiring service, not bounties [7]; its repository's README says "Hire the top 1% open source engineers." [6]. (The brief's count of its GitHub activity falling to one issue a month is the CTO's, not re-measured here.) |
| **Gitcoin** | Bounties ran on Ethereum; the StandardBounties contracts lock funds in an escrow contract, but bounty issuers "have the power to drain the bounty" [9]. Whether Gitcoin used these contracts was not verified (N2). | — | Its bounties and hackathons were handed to Buidlbox so Gitcoin could focus on grants [8]. |
| **IssueHunt** | — | — | Its site now describes a vulnerability-disclosure (security bug bounty) platform paying "via bank or PayPal"; open-source issue funding is not offered there [10]. |
| **Opire** | Opire publishes and tracks bounties and claims; "a claim does not create an automatic payment"; each creator reviews and "arranges payment" for their own bounty; minimum $20 [11][12]. | Trust rests on the creator. | Opire does not move the money; creators arrange payment themselves [12]. |
| **Mechanical Turk** | Requesters kept a balance with MTurk, refunded in full at closure [13]; an assignment not rejected within `AutoApprovalDelayInSeconds` is approved automatically [14]. | Automatic approval: silence pays the worker. | **Closed permanently on 30 September 2026**; balances refunded within 30 days; unreviewed work auto-approved if the requester did nothing by 30 October 2026 [13]. |
| **Upwork** | Payments are held by Payment Escrow Inc., "a licensed Internet escrow agent" (California licence), and a charge to the client is non-refundable once made [15]; for fixed-price Any Hire contracts, if the client takes no action for 14 days after submission, the milestone is released [15]; dispute assistance, then arbitration [15]. | Money is held before work starts, by a licensed company. | — |
| **RentAHuman** (study [16]) | Agents post by REST API or MCP; "escrow payments are released upon task completion" [16]. | Weak: in the sample, 35 of 37 "completed" bounties had zero spots filled; the study calls this "engage-then-ghost" (that no one was paid is our inference) [16]. | Six abuse classes at a median $25 per worker: credential and account fraud, identity proxy, reconnaissance, social-media manipulation, OTP/2FA solicitation, referral fraud. Seven screening rules flagged 52 of 303 bounties with one false positive [16]. |
| **Monid** | One USD balance topped up in its web app and paid through Stripe [19]; each endpoint's price is shown in discovery and inspection, and each run returns "the actual cost charged" [18]. | The agent sees the price before it spends. | Whether failed calls are charged: not found (N3). |

**What this design takes from them.**

1. **Do not hold money.** Holding it is where Bountysource failed [1], and doing it properly takes a licensed escrow agent (Upwork [15]). Stripe itself says escrow "has a precise legal definition" and that it does not provide escrow [S3].
2. **Charge at merge, from a saved card, fees on top, solver receives the whole reward** — Algora's model [6], the nearest working precedent.
3. **Silence must not block payment once the owner's own rule allows it** — MTurk's auto-approval [14] and Upwork's 14-day release [15]. Here the rule is the owner's mode: "agent decides within limits" pays without a click; "ask me" waits.
4. **Show the full cost before money moves**, as Monid does [18].
5. **Rate-limit agent posting, label who posted, screen for the six abuse classes** — the study's recommendations [16].

## 2. How the money moves

### Stripe Connect, point by point

- **Solver accounts.** Express accounts: "Stripe handles the onboarding and identity verification" [S6]; solvers get the Express Dashboard to see balance, payouts and change their bank account [S7]. Fraud and dispute liability for Express accounts is the platform's [S6].
- **Charge type: destination charges.** Stripe's table names "a business services marketplace, such as a website that matches contractors with homeowners" as the example [S1]. The charge is created on the platform and a portion "immediately transfers" to the connected account; refunds and chargebacks reduce the platform's balance; Stripe debits fees from the platform [S1]. Stripe advises separate charges and transfers only when a case needs them, such as charging before the payee is known [S1]; here the payee is known at merge, so the simpler type is enough. If the solver has not finished payout setup, the card is **not charged** until they have, so the platform never holds a balance for them (Algora holds it [6]; we choose not to).
- **Funding at posting versus charging at merge.** A card authorisation for an online payment lasts 5 to 7 days depending on the card network [S10], far shorter than a bounty. Charging at posting would put the money in the platform's balance for weeks: with manual payouts Stripe allows funds to wait 90 days (2 years in the US) [S3], but the platform would then be holding other people's money. A refund on close would not return Stripe's processing fee [S11]. **Recommended: charge at merge** from a payment method saved with a Setup Intent; off-session charges can fail with `authentication_required`, which then needs the owner present [S13].
- **Countries.** Separate charges and transfers are supported for platforms in 43 listed countries [S2]. Both destination charges and separate charges and transfers cross regions only in certain regions [S1]: transfers work between the US, Canada, the UK, the EEA and Switzerland; otherwise "your platform and any connected account must be in the same region" [S2][S4]. So **the platform's country decides which solvers can be paid** (D1). Algora's 119-country list [6] does not match Stripe's current page; why is unexplained (N4). Payouts to recipient-only accounts across borders need Global Payouts, which is for businesses that "already hold the Money Transmitter Licence" [S5][S8].
- **Currencies.** First version charges in USD only (the format's reward is USD [BF]); conversion fees apply where currencies differ [S16]. Settlement currencies by country were not read (N5).
- **Tax.** Where the platform controls pricing (destination charges), "the platform is responsible for filing any relevant 1099 forms"; 1099-NEC applies to US payees with $2,000 or more in a year [S9]. Stripe "recommends that you consult a tax advisor" [S9]. Obligations for a non-US platform or non-US solvers: **needs a tax adviser** (N6).
- **Fees and who bears them.** Card fees are a percentage plus a fixed amount per successful charge; international cards and currency conversion add a percentage; a dispute costs a fee, the countering fee returned only if won [S16]. Connect where the platform handles pricing: a fee per monthly active account, a percentage plus fixed fee per payout, 0.25 % funds routing, cross-border payouts from 0.25 %, Instant Payouts 1 % [S15]. Stripe's pricing pages redirect by visitor location and the US edition could not be read from this host, so no dollar figures are quoted here (N7). **Recommended:** the poster pays the reward plus every Stripe fee for that payment, shown as one total before approval (Algora [6], Monid [18]); the solver receives the whole reward; the platform takes no margin in the first version (D4).
- **Disputes after the solver was paid.** With destination charges the platform balance "is automatically debited for the disputed amount and fee"; the platform can try to reverse the transfer [S1], only while the solver's Stripe balance covers it [S2]. **Liability: the platform**, so a lost dispute is the owner's cost (D4); Stripe says a platform using indirect charges should hold negative-balance responsibility itself [S12]. Limits (per bounty, per period) cap it.
- **Business requirements.** Stripe lists as restricted "Crowdfunding platforms", "Escrow services", "Money transmitters ... and other money service businesses", "Payment facilitation and aggregation"; as prohibited "Peer-to-peer money transmission" and paid competitions for prizes [S17]. A bounty paid for merged work, one funder per bounty, is none of these on its face; whether Stripe agrees is answered only by Stripe's review of the platform. Whether the platform account needs a registered legal entity: not found in a primary source (N8).

### Alternatives on the same points

| Rail | Payee needs | Holds money in between | Fit |
|---|---|---|---|
| **Stripe Connect (recommended)** | Express account, Stripe onboarding [S6] | Stripe, inside the charge-and-transfer [S1] | Self-serve; region limits [S2][S4] |
| PayPal Payouts | A PayPal or Venmo account to claim [P1] | **The sender's PayPal balance must be prefunded** [P1] | Needs PayPal's approval; prefunding means holding money [P1] |
| PayPal multiparty | Seller onboarding | Not stated | "Apply for live credentials and go live after your platform or marketplace has been approved" [P2] |
| Wise Platform | — | — | For banks and enterprises; "Get in touch", no self-serve route [W1] |
| Stablecoin push (K32's x402 design) | A wallet address | Nobody; "the facilitator does not hold funds" [K32] | Owner must hold USDC; irreversible; young protocol [K32]. A second rail later (D7) |

### Who holds funds at every step (recommended flow)

| Step | What moves | Who holds it |
|---|---|---|
| Owner saves a card (Stripe Checkout in setup mode) | Nothing | Nobody; Stripe stores the card, the platform stores only Stripe's ids [S13] |
| Bounty posted, open, solutions arrive | Nothing | Nobody |
| Merge verified on GitHub; payment waits for the owner ("ask me") or passes the limits ("agent decides") | Nothing | Nobody |
| Solver not yet onboarded | Nothing; payment stays "owed" | Nobody |
| Destination charge succeeds | Owner's card → platform's Stripe balance → solver's Stripe balance in one operation [S1] | Stripe, on the platform's account for the moment of transfer, then on the solver's account until settlement |
| Payout | Solver's Stripe balance → solver's bank on their schedule [S7] | Stripe, then the solver's bank |
| Dispute later | Platform balance debited [S1] | Platform liable; transfer reversal only if the solver's balance covers it [S2] |
| Bounty closed without a merge | Nothing was charged; nothing to refund | Nobody |

**Duties.** Stripe: card processing, solver identity checks and onboarding, payouts, 1099-K where it controls pricing [S6][S9]. Platform: the merge check, the owner's limits, one payment per bounty, receipts, dispute liability, 1099 filing where it controls pricing [S1][S9]. Owner: the card, the limits, the approvals, the terms. Solver: their Stripe account and their own taxes. **Whether the platform is a money transmitter in its country, and what its terms must say, needs a lawyer.** Stripe's own comparison says Connect cross-border payouts "shift legal and compliance requirements to Stripe", while for Global Payouts "this might require a Money Transmitter license if you manage your customers' funds" [S4]; that is Stripe's description, not legal advice.

## 3. What the platform is

### 3.1 The bounty board

A public list of open bounties and a page per bounty. Each page states: task title, repository, reward (USD), **payment readiness** (one of: "no reward", "payment method on file, within the owner's limit", "no payment method": a fact, never "guaranteed"), mode ("pays when merged, owner approves each payment" or "pays when merged within the owner's limits"), state (open, closed with a merged solution, closed without one, paid on a date), age, and the solutions: count, each author's GitHub login and a link to the pull request.

It reads, all from GitHub, **without any token that can see private code** [G4][G5][G6]:

- the issue's `box-bounty-format` block (identity, branch, work commit, reward, state) [BF], treated as the poster's statement, never as proof of a merge or payment [BF];
- the issue's open/closed state and title; the pull requests targeting `box-bounty/<id>`, their authors and head commits [G2];
- the repository's `visibility` [G4] and default branch.

Its own records: owners, solvers, the reward amount registered at posting, payment states and receipts. What stays only on GitHub: the task text beyond the title, solution code and diffs, comments (never read [BF]), and the Git-ref memory under `refs/box-bounty/*`, which the platform does not need. K43 decides how much task text to show and how it is marked as the poster's words.

### 3.2 Accounts

- **Owner:** signs in with GitHub (OAuth with no scope, which "grants read-only access to public information", so it can never read private code [G6]); saves a card on a Stripe-hosted page; for each repository: allow (with reward and limit, as the CLI's `allow` does), deny, and config (mode `ask` / `agent` / `off`, per-bounty and per-period limits, an end date: K32's mandate names [K32]). The platform checks the owner can push to the repository (`permissions` on the repository read with the owner's token [G4]). Surface: allow, deny, config, plus approving waiting payments and revoking agent tokens. Nothing else.
- **Solver:** signs in with GitHub; onboards once on Stripe's hosted Express flow [S6]. The payee of a bounty is **the GitHub author of the merged pull request**, so solvers write no payment line.
- **Agent:** a platform token issued to the owner's CLI through GitHub's device flow, the flow GitHub names for CLI tools [G1]. It can register a bounty, send hints and read state. It **cannot** change limits, approve a waiting payment or allow a repository: those need the owner's web session. Revoked by the owner at any time.

### 3.3 The loop

1. **Post.** `create` and `post` as today. After the issue exists, `post` sends a hint `{repository, issue, bounty id}`. The platform reads the issue and block from GitHub itself, checks the repository is public and the owner can push to it, and records the reward amount from the block at that moment (a later edit of the issue never raises it). The bounty appears on the board. A bounty above $0 shows its payment readiness.
2. **Solve.** The solver opens a pull request against `box-bounty/<id>`, as today. The platform lists those pull requests from GitHub (`base` filter on the list endpoint [G2]) whenever it refreshes the bounty; nothing depends on when it first saw one.
3. **Decide.** `apply` merges; the owner or agent publishes the merge (BT37: `apply` does not push). Any later merge is recognised as today (`merged.ts`). **New in the CLI:** when it publishes the chosen solution it also moves `box-bounty/<id>` forward to that pull request's head and pushes it (a fast-forward: `collect` already requires the head to descend from the bounty branch). GitHub marks a pull request merged when its commits reach its base branch "by another pull request (or directly)" [G7], so GitHub itself then records which pull request was merged. The CLI sends a hint `{bounty id}`.
4. **Pay.** The platform verifies on GitHub, never on the hint. **The payee is fixed by two GitHub facts:** (a) among the pull requests whose base is `box-bounty/<id>`, the ones GitHub records as merged (`merged_at` set; "Check if a pull request has been merged" answers by status code [G2]); (b) that pull request's head commit is an ancestor of the repository's **default branch** (compare API [G3]). Exactly one pull request passing both: its GitHub author is the payee [G2]. **More than one** (for example a second pull request opened on the same head commit, which GitHub also marks merged): the platform pays nobody automatically, in any mode, and asks the owner to choose. None: nothing is owed yet. The repository must still be public [G4]. Then it applies the owner's mandate in K32's rule order (duplicate, nothing owed, off, ask, expired, limits) [K32]. "Ask me" (the default) shows the owner a page with the total cost and one "Pay" button; "agent decides" pays inside the limits with nobody asked. Payment is one destination charge, off-session, with the idempotency key `box-pay/<repository>/<bounty id>`, so a retry can never pay twice [S14]. If the card needs the owner present (`authentication_required` [S13]) the payment waits for the owner on a Stripe-hosted page.
5. **Record.** A public receipt page on the platform (amount, bounty, solver login, verified merge commit, date); one marked comment from the platform on the issue linking it; the CLI writes a `paid` event to the bounty's shared memory with `rail` and `reference` (the receipt id), as K32 proposed [K32]. `status` shows owed or paid.
6. **Close without a merge.** The CLI's `close` sends a hint; the platform reads the issue closed on GitHub and marks the bounty closed. Nothing was charged, so nothing is refunded.

### 3.4 How the CLI talks to the platform

- **Authentication:** `box bounty login` runs GitHub's device flow (a code the owner enters at github.com/login/device within 15 minutes [G1]); the platform exchanges the GitHub identity for its own agent token and discards the GitHub token. The token lives in the owner's settings folder beside the existing settings, never in the project.
- **What is sent and when:** three hints, each a fixed allow-listed shape of identifiers only: after `post`, after a merge is recognised, after `close`. A hint only tells the platform to look; the payee never comes from it. No file, diff, path, task text or branch name is ever sent.
- **Offline or platform down:** the platform is never on the path of posting, merging or closing; those finish on GitHub as today ("closing never waits", PLAN.md). A hint that fails is kept locally and resent by the next command; `status` names the state ("the platform has not been told yet: <reason>; next: run any command when online"). The platform also finds bounties by GitHub search for the label [BF], so a lost hint only delays: a bounty found that way goes through the same registration checks as a hint (issue author is a platform owner who can push to the repository, repository public, valid block), all read from GitHub; one that fails them is neither shown nor paid.
- **Nothing silent:** every hint outcome is a named state in `status` and `--json`.

### 3.5 The three hard stops, with a server

| Hard stop | How it holds |
|---|---|
| Never-ship files | The platform receives only identifiers; the hint builder is a fixed schema at the CLI boundary, tested so that no file content or path can enter it. It reads only issue metadata, pull request metadata and commit ancestry, and never fetches code. |
| Private repositories | The OAuth token has no scope, so it reads public information only [G6]; the platform reads repository facts with tokens that see public data [G5] and checks `visibility` [G4] at registration, at every board refresh of that bounty and again before paying. A repository that turns private disappears from the board. The CLI still refuses private repositories. |
| The owner's authority | Limits and mode live on the server and are written only from the owner's web session; the agent token cannot write them; every payment runs the mandate rules first; default "ask me"; `deny`, `off` and token revocation take effect at once. |
| Runs nothing a solver wrote | No checkout, build or execution of any solution, anywhere on the platform. |
| Does not judge solutions | It pays the merged solution because the owner or agent merged it; the merge is a fact it verifies, not a verdict it makes. |

**Every point where the platform trusts GitHub** (and nothing else): (1) who the owner and solver are (OAuth identity) [G1][G6]; (2) whether a repository is public [G4]; (3) whether the owner can push to it [G4]; (4) who authored a pull request and its head commit [G2]; (5) which pull requests on the bounty branch are merged [G2][G7]; (6) whether a merged head is on the default branch [G3]; (7) the issue's block as the poster's statement at registration [BF]. It never trusts the CLI's hints (which only say "look now"), the block's `state` field, the issue body after registration, or the poster's word that something was merged or paid.

### 3.6 Abuse

| Abuse | Answer |
|---|---|
| Fake claim | There is no claim to fake: the payee is the merged pull request's GitHub author, read from GitHub [G2]. |
| Claiming another's work (a copied pull request) | The tool's rule stands: the merged solution earns the whole reward. A copy on a different commit is not marked merged when the original is, so it is never the payee [G7]. A second pull request on the honest solver's exact head commit is marked merged too; two merged pull requests stop automatic payment and the owner chooses (3.3 step 4). |
| A pull request whose head is already on the default branch (a "pre-merged" head) | Not payable by itself: GitHub marks it merged only if its commits reach `box-bounty/<id>`, which moves only when the owner publishes a chosen solution; if that also merges the other pull request, two qualify and the owner chooses. No rule depends on when the platform first looked. **Note for the CTO:** the CLI's own merge recognition (`merged.ts`, `collect.ts`) appears to accept such a head; this was read, not tested. |
| Poster refuses to pay after merging | The merge check ends the "it was not merged" argument. The remaining risk, a removed or failing card, is not eliminated without holding money; it is shown as a fact on the bounty page ("owed since <date>"), and in "agent decides" mode no human can refuse inside the limits. |
| Laundering by self-dealing (owner pays their own second account) | Both sides pass Stripe's identity checks [S6]; the platform refuses a payee whose GitHub account is the poster or has push access to the repository; per-period limits; Stripe's own monitoring. What the platform must do beyond this under anti-money-laundering law: **needs a lawyer**. |
| RentAHuman's six classes [16] | Bounties are code changes to a public repository, paid only when merged into it; credential, identity-proxy, reconnaissance, social-media and referral tasks have no merge to verify. Engage-then-ghost is answered by the merge check and auto-pay mode. Posting is rate-limited per agent token, each bounty states it was posted by an agent for its owner, and the study's screening rules R3 (off-platform payment or contact) and R4 (OTP language) run on the task title and text, raising a fact for the owner, never a verdict. |

## 4. The smallest first version

**In:** the board (list and bounty page, public repositories only); GitHub sign-in; owner: save card, allow/deny/config per repository, approve waiting payments, revoke tokens; solver: Stripe Express onboarding; CLI: `login`, three hints, payment state in `status`; pay: merge verification, mandate rules, destination charge in USD, receipt, issue comment, `paid` memory event.

**Out (later waves, if real use asks):** funding at posting; a platform fee or margin; stablecoins; currencies other than USD; organisations as owners; GitHub webhooks (hints and search suffice); notifications by email; dispute and refund screens (Stripe's dashboards serve); search and filters; a custom domain.

**Steps, counted** (each "step" is one thing the person does; Stripe's own onboarding screens count as one):

| Person | Once | Per bounty |
|---|---|---|
| Owner | 4: sign in with GitHub; save a card; set the repository's payment mode and limits on the site (only the owner's web session writes them; the reward itself still comes from the CLI's `allow`, as today); enter the CLI's device code | "Ask me" (default): 2 per payment, because the first version sends no notification: open the waiting-payment page (the agent's `status` names it), then approve. "Agent decides": 0. Two merged pull requests: 2 (open, choose) |
| Solver | 2: sign in with GitHub; Stripe payout onboarding | 1: open the pull request (as today). No payment line |
| Agent | 1: run `box bounty login` and relay the code to the owner | 0 new: `create`, `post`, `apply` as today; hints are automatic |

Today's owner pays by hand: open the solver's link, check the amount and name, pay (BT11b). The first version replaces that with two steps, or none.

**When the CLI and the platform disagree.** The CLI recognises a merge locally, on the branch the bounty was created on, and closes the bounty; the platform pays only on the GitHub facts in 3.3 step 4. **The platform governs payment.** If the CLI has closed a bounty but GitHub does not yet show exactly one merged pull request whose head is on the default branch, the bounty page and `status` say "merged according to the poster's tool; not yet on GitHub's default branch, so not yet payable", to owner and solver alike.

## 5. Running it at zero cost

**Vercel does not fit.** Hobby is "restricted to non-commercial personal use only", and commercial use includes "any method of requesting or processing payment from visitors of the site" [H2][H1]. The platform charges owners through the site. Vercel Pro is $20 per developer seat a month [H1]: not $0.

**Recommended: Cloudflare Workers Free with D1** (one account for site, functions and database). Its Self-Serve Subscription Agreement has no non-commercial clause, but forbids processing or collecting "credit card information on any web property that is receiving Free Services" [H5]. In this design card details are only ever entered on Stripe-hosted pages (Checkout and Express onboarding), never on ours; that this satisfies the clause is our reading of it, not Cloudflare's confirmation. The free `workers.dev` subdomain "is treated as a Free website" and is "intended for personal or hobby projects that aren't business-critical"; Cloudflare recommends a custom domain for production [H13]. That is advice, not a prohibition, and a custom domain is a purchase, so the first version stays on `workers.dev` until the owner decides otherwise. Next.js runs on Workers through Cloudflare's own adapter path (vinext, or OpenNext for existing apps) [H6]; Worker size is limited to 64 MiB uncompressed, with no compressed limit [H4].

| Option | Terms for free use | Free limits read | Fit |
|---|---|---|---|
| Vercel Hobby | Non-commercial only; payments are commercial [H2] | 1M function invocations, 4 active CPU-hours, 100 GB transfer a month [H1] | **No** |
| **Cloudflare Workers + D1** | No non-commercial clause; card data not on free properties [H5] | 100,000 requests/day, 10 ms CPU per request, error 1027 past the daily limit [H3][H4]; D1 500 MB per database, 5 GB per account, 5M rows read and 100,000 written per day [H3][H14] | **Yes** (recommended) |
| Netlify Free | Service agreement (2020): a free customer exceeding capacity "will incur and agrees to pay additional fees" [H12] | 300 credits [H11] | No: overage can cost money |
| Neon Free (database) | No non-commercial clause found in its schedule [H8] | 1 GB per project; 100 CU-hours a month, compute suspended when used up; scale to zero after 5 minutes [H7] | Possible second account |
| Supabase Free (database) | Terms mention non-commercial use only for arbitration costs [H10] | 500 MB; "paused after 1 week of inactivity" [H9] | No: a quiet board would go down |

**Limits at 0, 100 and 10,000 bounties** (arithmetic on the limits above; the per-bounty figures are this design's, not measured):

- **Requests.** CLI hints are about 3 per bounty and GitHub reads about 10 per bounty over its life: 10,000 bounties is about 130,000 requests in total, far inside 100,000 a day. **Page views decide**: above 100,000 requests a day Cloudflare returns error 1027 if the route is set to fail closed, or bypasses the Worker if it is set to fail open [H4]; either way the board stops working, at any bounty count.
- **CPU.** 10 ms per request [H4] is the first limit we expect to meet: server-rendered pages can exceed it. Not measured; the first build wave measures it and serves the board as static or cached pages if needed.
- **Database.** A bounty with its solutions and payment is a few kilobytes: 10,000 bounties is tens of megabytes against D1's 500 MB per database on the free plan [H14]. Rows read per day: a board page that scans every open bounty reads 10,000 rows per view at 10,000 bounties, so 500 views a day would reach 5M rows [H3]; paged 50 at a time with an index, the same limit allows about 100,000 views. On Neon instead, an always-busy site never scales to zero, and the 100 CU-hours [H7] would run out within the month if the smallest compute is 0.25 CU (0.25 × 730 hours ≈ 183 CU-hours; the minimum size was not on the page read, N9).
- **Bandwidth.** Cloudflare states "no data transfer (egress) or throughput (bandwidth) charges for data accessed from D1" [H3]; its Workers pricing names no bandwidth charge or free-plan bandwidth limit for Worker responses (N10). At 0, 100 and 10,000 bounties the limit we can name is requests, not bytes.
- **Database connections.** "You can open up to six connections (to D1) simultaneously for each invocation of your Worker"; each database is "single-threaded, and processes queries one at a time", so at 1 ms a query it serves at most about 1,000 queries a second, queueing and then returning "overloaded" beyond that; the free plan allows 50 queries per Worker invocation [H14]. A board page needs a handful of queries, so this binds only far above the 100,000-requests-a-day limit, at any bounty count. Neon's and Supabase's free connection limits were not on the pages read (N10).
- **GitHub API.** 5,000 requests an hour for an authenticated user or app [G5]; at about 10 reads per bounty, 10,000 bounties a year is far inside it.

**Money we never pay versus money the platform moves.** Hosting, database, GitHub OAuth and a `*.workers.dev` subdomain: $0. Stripe: no setup or monthly fee [S16]; per-payment card, payout and active-account fees are passed to the poster in the total (D4). **Costs that would fall on the platform:** lost disputes and their fees [S1][S16]; any Connect fee not recovered from a payment; lawyer and tax adviser fees; a legal entity if one is required (D1, D6).

## 6. What changes in the CLI and its docs

- New: `box bounty login` (device flow) and `logout`; three hints; publishing a chosen solution also fast-forwards and pushes `box-bounty/<id>` to its head, so GitHub records the pull request as merged (3.3 step 3); a `payment` object in `status --json` (owed, waiting for the owner, waiting for the solver's payout setup, paid with receipt) and one line in `status`.
- The issue text and format: a version 4 block whose `payment` is `{"method":"box-platform","where":"platform","url":"<bounty page>"}`; the issue says "paid through the platform when merged; sign in with GitHub to receive payment"; BOUNTY-FORMAT.md documents it.
- **Becomes legacy:** the `pay-to:` Stripe link line (still read on version 3 bounties until they close; never asked for on new ones) and `config set paid` (kept only for payments made by hand outside the platform, when the owner's mode is `off`). Their removal is a separate wave with the owner's go.
- Docs: BOUNTY.md, CONTRACTS.md (pay stage), MEMORY-SPEC.md (`paid` gains `rail` and `reference`, as K32 proposed), the README, and PLAN.md's money rows (the CTO folds this design in).

## 7. What the owner must set up, counted

| # | Step | Cost |
|---|---|---|
| 1 | Cloudflare account (Workers Free) | $0 [H3] |
| 2 | GitHub OAuth app, device flow enabled | $0: no fee is mentioned in GitHub's OAuth documentation [G1] |
| 3 | Stripe account, then Connect platform setup and its review | $0 to open: no setup or monthly fees [S16]; **a legal entity: unknown, not possible at $0 if required** (N8, D1) |
| 4 | Express onboarding branding (name, icon) | $0 [S16] |
| 5 | Stripe webhook endpoint to the platform | $0 [S16] |
| 6 | Secrets (Stripe key, webhook secret, GitHub client secret) into Cloudflare by the owner; no agent sees them | $0 |
| 7 | Deploy to the account's `workers.dev` subdomain from the repository | $0 [H3][H13] |
| 8 | Terms of service | **Not possible at $0 if a lawyer reviews them** (D6) |
| 9 | Privacy policy | **Not possible at $0 if a lawyer reviews it** (D6) |

No database account is needed with D1 (one fewer step than Neon or Supabase). All build waves run in Stripe test mode with the owner's test keys; whether test keys are usable before Stripe's platform review is complete was not confirmed (N8).

## 8. Build waves

Each is small enough to review once and proven without real money.

| Wave | Outcome | Proven by |
|---|---|---|
| **PF1** | The board on Workers with D1: bounties from GitHub search of public repositories, a page per bounty, GitHub sign-in. CPU per request measured against 10 ms. | Sandbox repository; a private repository never appears (test with a stand-in); measured CPU |
| **PF2** | CLI `login` (device flow), agent tokens, the three hints with local retry, `status` platform state | Tests against a stand-in platform; hint payload allow-list test that must fail on any path or text |
| **PF3** | Owner card saving (setup mode), allow/deny/config on the site, solver Express onboarding | Stripe test mode with the owner's test keys |
| **PF4** | Pay: the CLI fast-forwards and pushes `box-bounty/<id>` to the chosen head when it publishes; payee selection as a pure function over GitHub facts (merged pull requests on the bounty branch, head on the default branch); the mandate rules (K32), "ask me" approval, owner choice when two qualify, off-session destination charge, idempotency, receipt, issue comment, `paid` memory event | Stripe test mode end to end in the sandbox; cases: one merged pull request paid; a second pull request on the same head goes to the owner and nothing is paid automatically; pre-merged head not paid alone; merged but not on the default branch not payable; duplicate refused; private repository refused; limits held |
| **PF5** | Format version 4, the issue text, docs, the legacy marks | Fresh-agent read of the docs; format reader test |
| **PF6** | One real payment of $1 in the sandbox, owner-approved | Receipt, Stripe dashboard and issue comment agree (owner's go for real money) |

## 9. Decisions for the owner

| # | Decision | Recommendation | Cost | Blocks |
|---|---|---|---|---|
| D1 | Legal entity and country of the Stripe platform account | Ask Stripe (and a lawyer) whether an individual may run a Connect platform in your country; choose the country knowing it decides which solvers can be paid: only same-region, or the US/UK/EEA/Canada/Switzerland group [S2][S4] | $0 if allowed as an individual; otherwise forming an entity (not $0) | PF3 onward |
| D2 | Hosting | Cloudflare Workers Free with D1 on a `*.workers.dev` subdomain; Vercel's free plan forbids taking payments [H2] | $0 (Vercel Pro would be $20 a seat a month [H1]) | PF1 |
| D3 | Fund at posting or charge at merge | Charge at merge from a saved card; nobody holds money; the board says "payment method on file", never "funded" | $0; solvers carry the risk of a failing card | PF3, PF4 |
| D4 | Who pays fees, and a platform fee | Poster pays reward plus all Stripe fees as one total shown before approval; solver gets the whole reward; no margin. Accept lost disputes as your cost, capped by limits | Dispute losses and fees (bounded by your limits) | PF4 |
| D5 | Currencies and solver countries at start | USD only; solvers in the regions your platform country can pay; others are told and can be paid by hand | $0 | PF3 |
| D6 | Terms of service and privacy policy | Draft them in PF3; have a lawyer review before the first real payment (PF6), not before test mode | Lawyer fees (not $0) | PF6 |
| D7 | Stablecoins as a second rail | Not in the first version; keep K32's design parked until a solver outside the supported regions asks | $0 | Nothing |

## Not found

- **N1** Polar's reason for dropping issue funding: the announcement discussion (`github.com/orgs/polarsource/discussions/3998`) returned 404; only the removal PRs were read [3][4]. Would find it: an archived copy or Polar's own blog.
- **N2** Whether Gitcoin's bounties used StandardBounties escrow, and what happened to open bounty funds at hand-over. Would find it: Gitcoin's archived docs or the gitcoinco/web contracts code.
- **N3** Whether Monid charges failed calls: its FAQ question rendered without an answer [17]. Would find it: Monid's docs or terms.
- **N4** Why Algora's code lists 119 payout countries [6] while Stripe's current cross-border page lists five regions [S4]. Would find it: Stripe sales, or Stripe's past cross-border documentation.
- **N5** Stripe settlement currencies per country for connected accounts. Would find it: `docs.stripe.com/connect/payouts-connected-accounts`, read for the chosen country.
- **N6** Tax duties of a non-US platform paying solvers, and of paying non-US solvers. Would find it: a tax adviser.
- **N7** US Stripe fee amounts: `stripe.com/pricing` and `stripe.com/connect/pricing` redirected to another regional edition from this host. Would find it: reading the edition for the owner's country.
- **N8** Whether a Stripe Connect platform account requires a registered legal entity, and what Stripe's platform review checks. Would find it: Stripe's support pages for the owner's country, or Stripe directly (owner's contact).
- **N9** Neon's smallest compute size on the free plan, and whether Workers static assets count toward the 100,000 daily requests. Would find it: Neon's compute docs and Cloudflare's static assets pricing page.
- **N10** A free-plan bandwidth limit for Worker responses (the Workers pricing section names none), and Neon's and Supabase's free connection limits. Would find them: Cloudflare's Workers support or fair-use terms, and Neon's and Supabase's connection-limit docs.
- **Gitcoin, IssueHunt and Opire fees, disputes and partial-solution rules:** Gitcoin's and IssueHunt's bounty pages are gone or changed [8][10]; Opire's pages state no fee and say only that another solution "may be accepted instead" [11]. Would find them: archived copies of their docs.
- **MTurk and Upwork fee percentages:** MTurk's pricing page now shows only the closure notice [13]; Upwork's fee pages were not read.
- **Money transmission and anti-money-laundering duties** of the platform in its country: **needs a lawyer.**

## References (all read 21 October 2026)

Platforms

- [1] Bountysource core issue #1586, "[CRITICAL] Bountysource is Insolvent, do not use!", opened 18 May 2023 (user reports on Bountysource's own tracker): https://github.com/bountysource/core/issues/1586
- [2] elementary blog, "Goodbye, Bountysource", 24 June 2020: https://blog.elementary.io/goodbye-bountysource-hello-github-sponsors/
- [3] polarsource/polar PR #5319, "clients/web: remove ability to create new pledges", merged 2025-03-20: https://github.com/polarsource/polar/pull/5319
- [4] polarsource/polar PR #5460, "Remove Issue Funding", merged 2025-04-14: https://github.com/polarsource/polar/pull/5460
- [5] polarsource/polar issue #5227, "Polar 2.0 Roadmap", 2025-03-10: https://github.com/polarsource/polar/issues/5227
- [6] algora-io/algora at commit `74a49d7` (2026-07-18): README; `lib/algora/shared/fee_tier.ex`; `lib/algora/bounties/bounties.ex` (fee line items, "includes all platform and payment processing fees"); `lib/algora/payments/payments.ex` (`get_transaction_fee_pct` 0.04, `execute_transfer` with `source_transaction` and idempotency key); `lib/algora/psp/connect_countries.ex` (119 entries; Express, Standard for BR); `lib/algora_web/components/autopay.ex`: https://github.com/algora-io/algora/tree/74a49d7728400152f5d640ac8d461e6664b7c2eb
- [7] Algora home page: https://algora.io/
- [8] Gitcoin knowledge base, "What's happening to the Hackathons and the Bounties program?": https://support.gitcoin.co/gitcoin-knowledge-base/misc/cgrants-bounties-and-hackathons-sunsetting-faq/whats-happening-to-the-hackathons-and-the-bounties-program
- [9] Bounties-Network/StandardBounties README (v2.4): https://github.com/Bounties-Network/StandardBounties
- [10] IssueHunt home page: https://issuehunt.io
- [11] Opire home page: https://opire.dev
- [12] Opire docs, Costs and payments and Lifecycle: https://docs.opire.dev/rewards/pricing , https://docs.opire.dev/rewards/lifecycle
- [13] Amazon Mechanical Turk home page and FAQ (closure notice): https://www.mturk.com/ , https://www.mturk.com/help
- [14] AWS SDK for Python reference, MTurk `create_hit`, `AutoApprovalDelayInSeconds`: https://boto3.readthedocs.io/reference/services/mturk/client/create_hit.html
- [15] Upwork legal: Payment Escrow Inc. (formerly Upwork Escrow Inc.), version 3.0 effective 21 November 2025, §6.1; Any Hire escrow instructions (14-day release); Dispute Assistance Program: https://www.upwork.com/legal
- [16] P. Mehta, "Security Risks of AI Agents Hiring Humans: An Empirical Marketplace Study", arXiv:2602.19514, 23 February 2026: https://arxiv.org/abs/2602.19514 (HTML: https://arxiv.org/html/2602.19514)
- [17] Monid home page: https://monid.ai
- [18] Monid docs, Pricing: https://docs.monid.ai/guide/pricing.html
- [19] Monid docs, Wallet API: https://docs.monid.ai/api/wallet.html

Stripe (documentation pages read as Markdown from `docs.stripe.com/<path>.md`)

- [S1] Understand how charges work in a Connect integration: https://docs.stripe.com/connect/charges
- [S2] Create separate charges and transfers (Stripe-hosted Checkout variant): supported regions, cross-border transfers, `source_transaction`, reversals: https://docs.stripe.com/connect/separate-charges-and-transfers
- [S3] Using manual payouts (holding periods; "Stripe doesn't provide escrow services"): https://docs.stripe.com/connect/manual-payouts
- [S4] Cross-border payouts (availability; comparison with Global Payouts): https://docs.stripe.com/connect/cross-border-payouts
- [S5] Global Payouts: https://docs.stripe.com/global-payouts
- [S6] Connected account types (liability, onboarding, Express): https://docs.stripe.com/connect/accounts
- [S7] Express Dashboard: https://docs.stripe.com/connect/express-dashboard
- [S8] Service agreement types: https://docs.stripe.com/connect/service-agreement-types
- [S9] US tax reporting for Connect platforms: https://docs.stripe.com/connect/tax-reporting
- [S10] Place a hold on a payment method (authorisation windows): https://docs.stripe.com/payments/place-a-hold-on-a-payment-method
- [S11] Refunds ("Stripe's processing fees from the original transaction aren't returned"): https://docs.stripe.com/refunds
- [S12] Risk and liability management with Connect: https://docs.stripe.com/connect/risk-management
- [S13] Save a payment method without making a payment (Setup Intents; `off_session`; `authentication_required`): https://docs.stripe.com/payments/save-and-reuse?payment-ui=elements
- [S14] Idempotent requests: https://docs.stripe.com/api/idempotent_requests
- [S15] Connect pricing (regional edition served by location): https://stripe.com/connect/pricing
- [S16] Pricing (regional edition served by location; no setup or monthly fees; dispute fee returned for won disputes): https://stripe.com/pricing
- [S17] Restricted and prohibited businesses: https://stripe.com/legal/restricted-businesses

Other payment rails

- [P1] PayPal Payouts: https://developer.paypal.com/docs/payouts/standard/
- [P2] PayPal multiparty: https://developer.paypal.com/docs/multiparty/
- [W1] Wise Platform: https://wise.com/platform/
- [K32] `kitchen/reviews/K32-agent-payments.md` in this repository (its sources read 19 October 2026)

Hosting and data

- [H1] Vercel Hobby plan (page last updated 2026-09-14): https://vercel.com/docs/plans/hobby
- [H2] Vercel Fair Use Guidelines, "Commercial usage": https://vercel.com/docs/limits/fair-use-guidelines
- [H3] Cloudflare Workers pricing (Workers, KV, D1 free limits): https://developers.cloudflare.com/workers/platform/pricing/
- [H4] Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- [H5] Cloudflare Self-Serve Subscription Agreement, last updated 12 September 2025, §2.2.1(h) and §2.6: https://www.cloudflare.com/terms/
- [H6] Cloudflare, Next.js on Workers: https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- [H7] Neon pricing: https://neon.com/pricing
- [H8] Neon product-specific schedule, last updated 14 October 2026: https://neon.com/terms-of-service
- [H9] Supabase pricing: https://supabase.com/pricing
- [H10] Supabase terms: https://supabase.com/terms
- [H11] Netlify pricing: https://www.netlify.com/pricing/
- [H12] Netlify Self-Serve Subscription Agreement, last updated 8 September 2020: https://www.netlify.com/legal/self-serve-subscription-agreement/
- [H13] Cloudflare, `workers.dev` subdomain: https://developers.cloudflare.com/workers/configuration/routing/workers-dev/
- [H14] Cloudflare D1 limits (database size, queries per invocation, concurrency, simultaneous connections): https://developers.cloudflare.com/d1/platform/limits/

GitHub

- [G1] Authorizing OAuth apps (device flow for CLI tools, 15-minute code): https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
- [G2] REST API, pull requests: https://docs.github.com/en/rest/pulls/pulls
- [G3] REST API, compare two commits: https://docs.github.com/en/rest/commits/commits
- [G4] REST API, repositories (`visibility`, `permissions`): https://docs.github.com/en/rest/repos/repos
- [G5] REST API rate limits (60 an hour unauthenticated, public data only; 5,000 an hour authenticated): https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
- [G7] GitHub changelog, 26 September 2023, "More details provided when a pull request is merged indirectly or is still processing updates" (a pull request is still marked merged when its commits reach the base branch by another pull request or directly): https://github.blog/changelog/2023-09-26-more-details-provided-when-a-pull-request-is-merged-indirectly-or-is-still-processing-updates/
- [G6] Scopes for OAuth apps ("(no scope)": read-only access to public information): https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps

In this repository

- [BF] `docs/box-v4/BOUNTY-FORMAT.md`; also `PLAN.md`, `packages/box-bounty/merged.ts`, `packages/box-bounty/collect.ts`.
