# The platform's money route from Singapore (K42b)

Written by the K42b cook on 21 October 2026 for decision D1 in `PLATFORM.md` section 9. Research only: no account, sign-up, key, message, form or money. Every source was read on **21 October 2026**; the edition read is named in each reference (Singapore edition where the provider has one). References are numbered at the end. Where only a lawyer or tax adviser can answer, this document says so and stops.

## The owner's page (read this first)

**The finding that changes K42.** A Singapore Stripe platform cannot *transfer* money to solvers outside Singapore: cross-border transfers work only between the US, Canada, the UK, the EEA and Switzerland, "In other scenarios, your platform and any connected account must be in the same region" [S2]. But Stripe documents one exception on every charge page: the same-region rule applies "unless using `on_behalf_of`" [S4], which makes the solver's Stripe account the business of record for the payment [S4]. Platforms in Singapore "can create Express accounts for most countries Stripe supports" [S7]. So a Singapore platform can pay solvers in the countries where Stripe itself is available, if each solver's account can take card payments. That path is documented, not yet proven: the first build wave proves it in Stripe's sandbox at $0 [S16].

**Recommendation for D1.**

- **Start:** a Stripe Connect platform account in Singapore, held by you, with one charge shape: a destination charge with `on_behalf_of` set to the solver. Solvers: 37 countries confirmed on Stripe's pages (its self-serve countries that are also on its Express list [S6][S11]), Singapore included. Thailand and the UAE are on both lists too, but Stripe's sentence about them is ambiguous [S7][S25][S26]: unknown, not excluded, and tested in PF3. Not India, Indonesia, the Philippines, Vietnam, Pakistan, Nigeria or Ukraine.
- **Add later:** for solvers Stripe cannot reach, Wise Business batch payments "Send by email" from your own Wise balance [W3][W4]. It reaches 49 destinations [W8], including all seven above. The platform only writes the batch file; no money or bank details pass through it.

**Cost.** To start: $0 (Stripe has no setup or monthly fee [S14], and its sandbox works before your business is verified [S16]). If Stripe asks for a registered business: S$115 once and S$30 a year for an ACRA sole proprietorship [L4][L5]. Per payment, Singapore edition: 3.4% + $0.50 per domestic card charge, +0.5% for international cards, +2% if currency conversion is required [S14]; Connect, when the platform handles pricing: $2 per monthly active solver account, 0.25% + $0.50 per payout, and 0.25% of payout volume for "Funds routing and platform management" [S15]. With `on_behalf_of`, Stripe applies the fee structure of the solver's country [S4]. Those per-country rates were not read (N3). Disputes still cost the platform: with destination charges, "with or without `on_behalf_of`, your platform balance is automatically debited for the disputed amount and fee" [S4] (D4). A lawyer's review before the first real payment is not $0 (D6, unchanged).

**Open legal questions, for a lawyer before live mode.**

1. Singapore's Payment Services Act now covers "any service of arranging for the transmission of money from any country or territory to another country or territory" [L1]. Does the platform do that? Or is it outside the Act as a technical service provider that "does not at any time enter into possession of any money" [L1]? The Stripe route creates each charge on the platform's account [S3]. The Act's "merchant acquisition service" also applies "regardless whether the provider of the service comes into possession of any money" [L1]. Does the platform provide one?
2. As a sole proprietor you have "unlimited liability" [L6], and Stripe's Connect terms do not limit the platform's liability for its connected accounts [S12]. When should you switch to a Pte Ltd (S$315, then S$60 a year for the annual return [L6][L8])?
3. Stablecoins: the Act also covers "arranging ... for the transmission of digital payment tokens" [L1]. A Singapore business serving only customers outside Singapore needs a licence that MAS "will generally not issue" [L2]. Keep stablecoins parked until a lawyer answers.

**What was rejected, in one line each.** A US company with Stripe Atlas costs US$500 once, then at least US$325 a year (US$100 registered agent, US$175 minimum Delaware franchise tax and US$50 annual report for a C corporation [S20][L10]), and risks a $25,000 IRS penalty for a missed form [L11]. It adds no Asian country that `on_behalf_of` from Singapore does not already reach, and without `on_behalf_of` it cannot pay Singapore at all [S1]. Airwallex and Adyen are sales-only, and PayPal's platform product needs PayPal's approval as a partner [A8][A9][AD1][P3]. Payoneer Mass Payouts, like PayPal Payouts, is funded from a prefunded balance [Y1][P1]. As a platform route that balance would be the platform's, so it is dropped. As an owner-paid route Payoneer has the same shape as PayPal, but its page shows no fees, so it is not kept beside Wise (N7).

## Routes

| Route | Who can be paid, and where | Who holds money, and when | Owner's setup (counted below) | Cost: start / per year / per payment | Still needs a lawyer |
|---|---|---|---|---|---|
| **Stripe Connect from Singapore** (recommended start) | Without `on_behalf_of`: Singapore only [S1][S2]. With it: solvers whose Express account can take card payments, in 37 confirmed countries; Thailand and the UAE unknown, not excluded, tested in PF3 [S6][S7][S11][S3][S25][S26]. Individuals: yes [S7] | Nobody while a bounty is open. At payment, Stripe holds it: the charge is on the platform's account and moves to the solver's balance at once [S3]; then the solver's payout schedule | 7 steps in the sandbox, +1 for live, +1 only if a UEN is needed | $0 / $0 (S$115 once + S$30/yr if registered [L4][L5]) / 3.4% + $0.50 (+0.5% intl, +2% FX) [S14] plus $2 per active account, 0.25% + $0.50 per payout and 0.25% of payout volume for funds routing [S15]; the solver's country's rates with `on_behalf_of` [S4] (N3); disputes debit the platform [S4] | PS Act "arranging" vs the technical-service exclusion, and "merchant acquisition" [L1]; unlimited liability [L6][S12] |
| **Wise Business, owner pays** (recommended later) | 49 destinations [W8]; recipients need no Wise account [W2]; "Send by email" asks each solver for bank details by a link [W4] | Your own Wise balance until you pay the batch; unclaimed email payments are cancelled and refunded after 1 week [W4] | 2 once; 4 per batch | Free to register [W1] / not found / "From 0.19%", varies by currency [W1] | Whether preparing the batch is "arranging" [L1] |
| Airwallex Payments for Platforms | Full connected accounts in 55 markets [A1]; individuals: yes [A2][A5]; ledger accounts in 200+ markets leave the funds the platform's [A2] | The platform account owns the payment; FundsSplit divides it before settlement [A7]; timing not public | Not public: "Contact sales" [A8][A9] | Not public [A9] | Same as Stripe |
| PayPal Payouts, owner pays | "96 countries" [P1]; recipient needs a PayPal (or US Venmo) account [P1] | Your PayPal balance, prefunded [P1]; unclaimed returned after 30 days [P2] | Business account + "Request access to PayPal Payouts", decided by PayPal [P1] | Not read / not read / 2%; for USD payouts capped at 1.00 USD domestic and 50.00 USD international (SGD: 1.60 / 80.00) [P4] | Same as Wise |
| US company + Stripe (Atlas) | US, UK, EEA, Canada, Switzerland without `on_behalf_of` [S1]; others only through `on_behalf_of`, as from Singapore | As Stripe | Atlas incorporation, then Stripe as above | US$500 [S20] / US$100 agent [S20] + Delaware franchise tax: C corp from $175 or $400 (by method) + $50 report; LLC $400 [L10] / as Stripe US (not read) | Tax adviser: Form 5472, $25,000 penalty [L11]; transfer pricing [S21] |
| Stablecoins (K32) | Any wallet address [K32] | Nobody: owner's wallet to solver's wallet [K32] | 4 steps [K32] | Owner buys USDC (not examined) / — / zero facilitator fees listed on Base [K32] | DPT "arranging" limb and the overseas-only licence regime [L1][L2]; **stop here until a lawyer answers** |

Dropped, with the reason: **PayPal multiparty** ("only available to approved partners" [P3]); **Payoneer Mass Payouts** (funds must be transferred to "your regulated Payoneer account" before the payout run [Y1]. As a platform route that is a platform-held balance. As an owner-paid route it has PayPal Payouts' shape, but no fees are shown, so it is listed under N7 rather than kept); **Adyen for Platforms** ("Get in touch" only, and "a minimum invoice depending on industry or business model" [AD1]); **Stripe Global Payouts** (senders in the US and UK only; it needs a funded Treasury account; Stripe calls it best for businesses "that already hold the Money Transmitter Licence" [S9]).

### Setup steps on the recommended route, counted

**Owner, Stripe from Singapore** (each step is one thing you do; Stripe's own screens count as one):

1. Create a Stripe account (country Singapore). "After creating a Stripe account, you can test Stripe services in a sandbox" [S16].
2. Register your platform [S17, step 1].
3. Complete your platform profile [S17, step 3].
4. Set the brand: business name, icon, colour. "Stripe-hosted onboarding requires this information" [S17, step 4][S18].
5. Turn on onboarding for each solver country in Connect settings ("on a per-country basis" [S7]).
6. Add the webhook endpoint to the platform (K42 section 7, step 5).
7. Put the keys and the webhook secret into Cloudflare yourself (K42 section 7, step 6).
8. For live mode only: "verify your business and complete its activation requirements" [S16]; "Verify and add business details" [S17, step 2].
9. Only if Stripe asks for a UEN in step 8: register a sole proprietorship with ACRA, S$15 for the name and S$100 for one year [L5]. Trading under your full NRIC name alone needs no registration [L7], but then you have no UEN.

That is 7 steps at $0 that work in the sandbox, 1 more for live, and 1 conditional at S$115. K42's section 7 counted steps 1 to 7 as four; this list counts them at the granularity of Stripe's own pages.

**Solver, Stripe:** once, 2 steps: sign in to the board with GitHub (K42), then Stripe-hosted onboarding through an Account Link [S18]. With `on_behalf_of`, that onboarding must also enable card payments [S3]. Per bounty: 1 step, opening the pull request, as today. Privacy point for K43's onboarding text: when the solver is in another country, the owner's card statement shows "the connected account's address and phone number" [S4].

**Owner, Wise (later route):** once, 2 steps: register a Wise Business account [W1]; verify the business (UEN from ACRA, ID) [W7]. Per batch, 4 steps: click "Export batch" on the board (section 8), upload the file to Wise, review the transfers, pay for the batch [W3]. **Solver, Wise:** 1 step per payment: open Wise's emailed link and enter bank details within a week [W4]. Whether a returning recipient must enter them again was not found (N6).

## 1. Stripe from Singapore

- **Connect from Singapore, account and charge types.** Singapore is on the platform-country lists for Express and for Custom accounts [S7]. It is also on the list of regions supporting separate charges and transfers (43 codes, `SG` among them) [S2]. Destination charges are supported [S3]. Within Singapore, any of these works. Across borders, see the next point.
- **Which countries connected accounts may be in.** The cross-border payouts page (the same text in the `en-US`, `en-GB` and `es-419` editions): "Platforms based in the US, UK, EEA, Canada or Switzerland can transfer funds to connected accounts in any of those regions ... Stripe doesn't support self-serve cross-border payouts to countries outside the listed regions. Contact sales to discuss alternatives, or use Global Payouts" [S1]. The capabilities page repeats the same-region rule for transfers [S5]. On the charge pages: "For other regions, the platform and connected account must be in the same region unless using `on_behalf_of`" [S4]. For destination charges: "if your platform and a connected account aren't in the same region, you must specify the connected account as the settlement merchant using the `on_behalf_of` parameter" [S3]. And "The `on_behalf_of` parameter is supported only for connected accounts with a payments capability such as card_payments. Accounts under the recipient service agreement can't request `card_payments`" [S3][S2]. Recipient-agreement accounts reach other countries only through Global Payouts [S8].
  - With `on_behalf_of`, Stripe "Settles charges in the country of the specified account", "Uses the fee structure for the connected account's country" and shows the connected account's descriptor and address on the owner's statement [S4].
  - Countries: Stripe's Singapore availability page lists 44 countries without a "Preview" or "Extended network" badge [S11]. Of these, 39 are also on the Express list [S6].
    - **37 confirmed:** AT, AU, BE, BG, CA, CH, CY, CZ, DE, DK, EE, ES, FI, FR, GB, GR, HK, HU, IE, IT, JP, LT, LU, LV, MT, MX, NL, NO, NZ, PL, PT, RO, SE, SG, SI, SK, US.
    - **Thailand and the UAE: unknown, not excluded.**
      - Stripe's Express page, under its *platform* requirements, says: "Due to restrictions that apply when using Connect in the United Arab Emirates and Thailand, platform users in these countries can't self-serve Express connected accounts. To begin onboarding for Express connected accounts in these countries, contact us" [S7]. The sentence is ambiguous. "Platform users in these countries" reads as platforms based there; "Express connected accounts in these countries" reads as solvers there.
      - Stripe's UAE page lists "Foreign platform with UAE connected accounts" as supported, "Available only with" direct charges or destination charges with `on_behalf_of`, and adds that "some configurations may require you to contact our sales team" [S25].
      - Stripe's Thailand page says "We do not support separate charges and transfer" and does not address destination charges or `on_behalf_of` [S26].
      - Both countries go into the PF3 sandbox gate (section 8).
    - BR, HR, GI, LI and MY are Stripe countries missing from the Express list read.
    - India and Indonesia are "Preview" and link to sales [S11].
  - The Express list names 103 country codes, "Some countries are available only when using cross-border payouts" [S6]. For a Singapore platform that list therefore overstates reach.
  - Disputes under `on_behalf_of`: still the platform's. "with or without `on_behalf_of`, your platform balance is automatically debited for the disputed amount and fee" [S4]. Stripe also advises: "wait to recover disputed cross-border payment transfers for destination charges with `on_behalf_of` until after a dispute is lost", because re-transferring a reversal "is subject to cross-border transfer restrictions" [S3]. This belongs with D4: a lost dispute on a foreign solver's bounty is the platform's cost, and recovering it from the solver may not be possible.
  - **Not proven:** that a Singapore platform can create these cross-region charges in practice. That is PF3's first gate, in the sandbox.
- **An individual as platform holder.** Stripe's Financial Services Terms, which its Connect Terms incorporate [S12], read: "User must be a business (including sole proprietor), governmental or public sector entity, or non-profit organization" (Singapore edition, last modified 28 September 2026) [S12]. Stripe's Singapore pages distinguish "non-individual Singapore accounts, including sole proprietorships" from Individual accounts [S13]. Under Singapore law, an individual trading under their own full name is a sole proprietor who need not register [L7]. Whether Stripe accepts such a person as a *platform* without a UEN was not found (N1). It is answered at $0 in step 8 of the owner's setup.
- **What "contact sales for alternatives" covers, from public pages.** Only two pointers. The cross-border page says "Contact sales to discuss alternatives, or use Global Payouts" [S1]. The Connect pricing page says "If you're looking to customise your payment solution as your platform or marketplace grows, reach out to our sales team" [S15]. Global Payouts lets businesses in GB and US send, with a private preview for EU countries and Australia, not Singapore [S9][S10]. Beyond that, what sales offers is not public (N2).

## 2. Airwallex: Payments for Platforms, connected accounts and Payouts

- **Individuals, and where.** "Every connected account is either a business account or an individual account"; individual accounts are for "Sole traders or freelancers", "Gig economy workers" and "Service providers operating as individuals" [A2][A5]. The regional page lists markets by account type and gives the connected account country as "the country where the business or individual is *registered*" [A1]. Full accounts, where the funds belong to the holder, cover 55 markets; ledger accounts cover 218 [A1]. A separate individual-only list was not found; the regional page is the one list for both (N4).
  - Full accounts in Asia: China, Hong Kong, Macau, Malaysia, Singapore, Vietnam [A1]. Japan is ledger-only. India, Indonesia, the Philippines, Korea and Pakistan are not full-account markets [A1].
  - In ledger accounts "funds remain the property of the platform" [A2]; the marketplace guide gives the trade as "Light screening only" and 200+ countries against 50+ for full accounts [A6]. That is holding money, so ledger accounts are excluded.
- **Equivalent of a destination charge.** "Collect payments directly": "payments belong to the platform account solely. The platform account is responsible for Payments fees, refunds, and chargebacks". FundsSplit "will be divided between multiple destinations ... before settling to the account that owns the original payment" [A7]. That is close to Stripe's destination charge. The platform account owns the payment, and settlement times are not public (N4). Payments to a full account land in that account's own wallet, from which the platform triggers its payout with `x-on-behalf-of` [A3].
- **Funds, KYC, disputes, tax.** "Airwallex defines the compliance requirements and runs the verification and screening processes"; the platform collects and submits the information and handles requests for information [A4]. AML and sanctions screening are Airwallex's [A4]. Chargebacks fall on the platform in the direct model [A7]. Tax: an embedded component collects W-9/W-8 and offers "Electronic delivery of the filed 1099-K or 1099-NEC form" [A12]. Who files is not stated (N4).
- **Access.** The Singapore pricing page reads "For Platform API & Embedded Finance use cases get in touch with us to discuss custom pricing — Contact Sales" [A9]. The Singapore product page's only action is "Contact sales" [A8]. Whether a sole proprietorship qualifies, and any minimum volume: not public (N4).
- **Fees.** Platform pricing: "not public" [A9]. For reference only, the Singapore business-account rates are domestic cards 3.30% + $0.50, international 3.60% + $0.50, FX 0.4% above interbank for major currencies and 0.6% for others [A9]. Payouts: "local and SWIFT payouts over 200 countries/regions", local in over 120 [A11].
- **Test mode.** The sandbox gives "access to all products ... (except Connected Account APIs)"; "To test Connected Account APIs for Embedded Finance use cases, please contact the Airwallex Sales team" [A10]. No sandbox for this product before sales.

## 3. Other routes

- **Wise Business batch payments (owner pays from their own balance).**
  - Batches: up to 1,000 payouts per file, "Your recipients won't need an account with Wise to get paid" [W2]. The "Send by email" template needs only email, amount and currency; Wise then sends "a secure link to provide their bank details", and after a week it will "cancel and refund the payment" [W4].
  - Destinations: 49 entries on Wise's list [W8]. Whether each takes *business* transfers is per country [W8].
  - Fees, Singapore edition: registering is "Free"; sending "From 0.19%", fee varies by currency [W1]. The page also offers "All in for 99 SGD ... one set-up fee" for every feature, including account details for receiving. Whether batch sending needs that fee was not found (N6).
  - Eligibility: "sole traders and freelancers" can use Wise [W6]. In Singapore it asks for a UEN issued by ACRA [W7].
  - API: a personal token can create quotes, recipients, transfers and batch groups. Funding by API "not supported except for accounts based in the US, Canada, Australia, New Zealand, Singapore, and Malaysia" [W5]. Funding by token would put your Wise credential in the platform or the agent's hands, so the proposal keeps funding as your own action.
  - Who holds money: you, in your Wise balance; the platform never does.
  - Identity checks: Wise verifies the business before it can "make a business transfer from Singapore in Singapore dollars (SGD), or activate any other currency". It asks for ID, proof of address, the ACRA or UEN number, and the directors and owners above 25% [W9]. Solvers paid by "Send by email" give only their bank details [W4]. Whether Wise also checks recipients was not found (N6).
  - Disputes: a Wise transfer is not a card payment. "You cannot cancel your Money Transfer once your funds have been converted and transfer initiated" [W10, 20.16]. So there is no chargeback route between owner and solver through Wise. A wrong payment is between them.
  - Tax reporting: Wise reports on the account holder (you) under CRS and FATCA [W10, 6.5]. Whether it issues any form for recipients was not found (N6).
  - Test mode: the payouts page offers "a sandbox account to start testing and building with our API" [W2]. Whether the batch-file upload can be tried there was not found (N6).
- **PayPal.** Payouts reach "multiple recipients in 96 countries" [P1]. It needs "A PayPal business account", "Access to PayPal Payouts", which you request and PayPal decides on, and "Sufficient funds in your PayPal business account" [P1]. Singapore is "Fully localized" for payouts [P2]. Fees, Singapore edition (last updated 28 September 2026): 2% of the payout. For USD payouts the cap is "1.00 USD" domestic and "50.00 USD" international; for SGD, 1.60 and 80.00 [P4]. Recipients claim through a PayPal or Venmo account [P1].
  - Identity checks: you must "Confirm your identity. PayPal verifies your identity to secure your account and comply with rules and regulations in your country" [P1]. Recipients need a PayPal account [P1]; PayPal's checks on them were not read (N7).
  - Disputes: a batch can show `CANCELED` ("PayPal has canceled the payout batch"), and unclaimed items return after 30 days [P5][P2]. Whether the owner can reverse a claimed payout was not found (N7).
  - Tax reporting: not found (N7).
  - Test mode: "you can set up and test your integration in your sandbox accounts" while PayPal decides on access [P1][P5].
  - Kept only as an owner-pays alternative to Wise: it needs PayPal's approval, a prefunded balance and a PayPal account for every solver. Multiparty: dropped, see the routes table [P3].
- **Payoneer Mass Payouts:** dropped. Funds must be transferred "to your regulated Payoneer account, ready for your payout run" [Y1]. In a platform role that is a prefunded balance the platform holds. Used by the owner it would have PayPal Payouts' shape (an owner-prefunded balance), so the two are judged on the same terms. PayPal is kept because its fees and access path are public [P1][P4]; Payoneer's page shows no fee amounts and no access terms beyond "Get started" [Y1] (N7).
- **Adyen for Platforms:** dropped. Singapore pricing: "We do have a minimum invoice depending on industry or business model", and the only route in is "Get in touch" [AD1]. The platform model page names no self-serve path [AD2].

## 4. A US company with Stripe (Stripe Atlas)

- **One-time and yearly cost.** Atlas, Singapore edition: "US$500 one-time setup fee (includes government fees and your first year of registered agent services)", then "US$100 annually after your first year" [S20].
  - Delaware, C corporation: minimum franchise tax $175 (Authorized Shares method) or $400 (Assumed Par Value Capital method), plus a $50 annual report fee, due 1 March, with a $200 late penalty [L10].
  - Delaware, LLC: "$400.00" a year, due 1 June [L10]. Stripe's Atlas tax page still says "a flat rate of 300 USD" [S21]; the state's page governs.
  - Accountant and tax adviser: not $0, not read.
- **US filing duties for a foreign-owned company.** A foreign-owned single-member LLC (a "foreign-owned U.S. DE") must file a pro forma Form 1120 with Form 5472 [L11]. A 25% foreign-owned corporation files Form 5472 with its return [L11]. Penalty: "$25,000 ... on any reporting corporation that fails to file Form 5472", plus $25,000 for each further 30 days after 90 days' notice [L11]. Atlas names transfer pricing as a question "if you're based outside the US" [S21]. **Tax adviser needed**; stop here.
- **Which solvers it can pay.** Without `on_behalf_of`: the US, UK, EEA, Canada and Switzerland only [S1]. With it: the same Stripe countries as from Singapore [S3][S4][S11].
- **Singapore and the rest of Asia** stay excluded without `on_behalf_of`, because Singapore is not in the five-region group [S1]. A US company therefore *loses* plain transfers to Singapore solvers and gains no Asian country.

## 5. Stablecoins (K32's design) under Singapore law

- **The licence rule.** "A person must not carry on a business of providing any type of payment service in Singapore, unless the person" holds a licence or is exempt [L1, s 5(1)].
- **Digital payment token service.** Since 4 April 2024 it includes "(c) any service of accepting ... digital payment tokens from one digital payment token account ... for the purposes of transmitting, or arranging for the transmission of" them, and "(d) any service of arranging (whether as principal or agent) for the transmission of digital payment tokens from one digital payment token account ... to another" [L1, First Schedule Part 3].
  - The owner paying their own bounties from their own wallet is a payer, not obviously someone "carrying on a business of providing" a service. **Whether that holds: lawyer.**
  - The tool, or the platform, building the transfer for the owner to sign and sending it to a facilitator [K32] is close to the words "arranging ... for the transmission". **Whether it is, and whether the technical-service exclusion ("does not at any time enter into possession of any money" [L1, Part 2 para 2(h)]) reaches tokens: lawyer.**
- **The overseas-only regime.** "From 30 June 2025, DTSPs providing services solely to customers outside of Singapore relating to digital payment tokens ... will need to be licensed. MAS has set the bar high for licensing and will generally not issue a licence" [L2]. A Singapore-based platform paying mostly foreign solvers in tokens would sit next to this. **Lawyer.**
- **Stablecoins specifically.** The framework covers "single-currency stablecoins (SCS) issued in Singapore that are pegged to the value of the Singapore Dollar or any G10 currency"; "Non-MAS-regulated stablecoins will be treated as Digital Payment Tokens" [L3]. USDC, issued outside Singapore, therefore falls under the DPT rules above (our reading). The amendments were under consultation until 16 October 2026 [L3] and are not yet law.
- **Conclusion.** Keep D7 parked; ask the lawyer the two DPT questions above before any stablecoin wave.

## 6. Singapore business basics (ACRA)

- **Sole proprietorship.** S$15 name application and S$100 registration for one year, or S$160 for three years "only available if the conditions set by the CPF Board are met"; renewal S$30 [L4][L5]. Requirements: age 18 or above, a citizen, permanent resident or eligible FIN holder, and Medisave contributions up to date [L6]. Unlimited personal liability [L6]. "Any individual proprietor carrying on business under only the individual proprietor's full name is not required to be registered" [L7].
- **Private limited company.** "$315 ($15 name application fee and $300 incorporation fee)" [L6]; S$60 per annual return [L8]. It also needs a company secretary, an auditor unless exempt, registers and an AGM [L6], none of them free.
- **What changes.**
  - Wise asks a Singapore business for a UEN [W7], so a sole proprietorship (S$115) is the cheapest way in. Airwallex's requirement for a platform is not public (N4).
  - Stripe has Individual accounts in Singapore [S13], so for the start it may cost nothing (N1).
  - The PS Act's licence rule speaks of "a person" [L1, s 5(1)]. Whether incorporating changes anything in the licensing analysis is a question for the lawyer (N9).
  - A Pte Ltd limits personal liability, which matters because Connect leaves the platform's liability for its connected accounts unlimited [S12]. Recommended when real volume begins, not before.
- **Tax note (IRAS).** "The non-resident professional will not be subject to withholding tax on income attributable to services rendered wholly outside Singapore, even though his/her income may be paid by a company in Singapore" [L9]. Whether a bounty is such a service, and the owner's own income-tax treatment: **tax adviser**.

## 7. Who can be paid, compared

| Route | Solver countries | Individuals? | Solver onboarding |
|---|---|---|---|
| Stripe from Singapore, no `on_behalf_of` | Singapore [S1][S2] | Yes [S7] | Stripe-hosted onboarding [S18] |
| Stripe from Singapore, `on_behalf_of` | 37 confirmed countries (listed in section 1) [S6][S11]; Thailand and the UAE unknown, not excluded, because Stripe's wording is ambiguous [S7][S25][S26]; all to be proven in PF3 | Yes [S7] | Stripe-hosted onboarding with card payments enabled [S3][S18] |
| Airwallex | 55 full-account markets [A1] | Yes [A2] | Airwallex KYC through the platform: hosted flow, embedded component or API [A4] |
| Wise, owner pays | 49 destinations [W8] | Yes, no Wise account needed [W2] | Email link, bank details within a week [W4] |
| PayPal Payouts, owner pays | "96 countries" [P1]; per-country features [P2] | Yes, with a PayPal account [P1] | A PayPal account |
| US company + Stripe | US, UK, EEA, Canada, Switzerland [S1]; more via `on_behalf_of` | Yes | Stripe onboarding |
| Stablecoins | Any wallet [K32] | Yes | A wallet address [K32] |

## 8. PF3 and PF4 payment steps, with their triggers

Each step names the command that fires it, what a refusal leaves and what a retry finds (the evidence station's K42 lesson).

- **PF3 gate: country proof in the sandbox.**
  - Fired by: a PF3 test script, using the owner's sandbox keys.
  - What it does: creates Express test accounts in SG, JP, AU, US, DE, TH and AE, requesting `card_payments` and `transfers`, and runs a USD destination charge with `on_behalf_of` to each. TH and AE settle the ambiguity in [S7]: an account Stripe refuses to create, or a charge it refuses, puts that country on the Wise list.
  - A refusal leaves: no charge, and the account's Stripe error, recorded per country. That country goes to the Wise list.
  - A retry finds: the same accounts, read back by id. Nothing is created twice.
  - The PF3 result fixes the solver-country list D5 shows on the board.
- **Payment readiness** (before any charge). The solver's `card_payments` and `transfers` capabilities must be `active`. Otherwise the board shows "waiting for the solver's payout setup" and nothing is charged.
- **Paying (PF4): five invariants, each proven by a PF4 test.** The payment state machine (records, idempotency keys, which Stripe state leads where) is designed in the PF4 brief, not here. Its triggers are the owner's "Pay" (ask me) and the platform's pay check after a hint (agent decides), as in K42 section 3.3.
  1. **One payable PaymentIntent per bounty, ever.**
     - Stripe: a create retried under the same key returns the first result only until the key is pruned, at least 24 hours on; after that "We generate a new request" [S19]. So the design must find an existing PaymentIntent before creating one (for example in the owner's `customer` list [S24]). "Cancellation invalidates the PaymentIntent for future payment attempts" [S23].
     - Test: crash after each step of a payment and retry, inside and after the key window, and cancel one; the bounty never has two PaymentIntents that are not `canceled`.
  2. **Every confirm, retries and crash recovery included, re-runs the mandate rules (PLATFORM.md 3.5: limits, `deny`, `off`, revocation) and the payee checks (3.3, item 4) at the moment of the call.** A refusal charges nothing, leaves the PaymentIntent as it is, and is shown on the board and in `status`.
     - Stripe: a PaymentIntent with its payment method waits in `requires_confirmation`, "ready to confirm" [S23]; the confirm is the call that charges [S22].
     - Test: between a crash and its retry, set `off`, add a `deny`, revoke the token, lower the limit below the amount, or make the payee ambiguous; each retry makes no confirm, the PaymentIntent is unchanged, and the refusal is named on the board and in `status`.
  3. **The board tells apart: never attempted, declined, owner authentication required, outcome unknown.**
     - Stripe: never attempted is `requires_confirmation` [S23][S27]. A failed confirm leaves `requires_payment_method` [S22] with `last_payment_error` set, which Stripe clears "if the PaymentIntent is later updated for any reason" [S28]. An off-session failure that needs authentication arrives the same way: "the status of the PaymentIntent is `requires_payment_method`", with the `authentication_required` code [S29][S30]. Outcome unknown is a call with no response (invariant 4).
     - "Owner must authenticate" is finished by the owner on a Stripe page, with "the declined PaymentIntent's client secret" [S29], never by an off-session retry.
     - Test: each of the four states gets its own words on the board and in `status`; `authentication_required` sends no further off-session confirm.
  4. **An unknown-outcome retry reads the PaymentIntent first and never charges twice.** Retries under the same key "return the saved response, including `500` errors" [S19], so a stored error moves to a new key only after the read shows nothing was attempted (`requires_confirmation`, no `last_payment_error`); `succeeded` is recorded as paid with no call.
     - Test: a lost response after a success is retried with no charge; a saved `500` with nothing attempted pays once under a new key; the same `500` with `succeeded` behind it makes no call.
  5. **Each trigger names what fires it, what a refusal leaves and what a retry finds.** Source: the evidence station's K42 lesson; Stripe's behaviour is in 1 to 4.
     - Test: one test per trigger in the PF4 brief's table, firing it, refusing it and retrying it.
- **Wise export (later wave).**
  - Fired by: the owner's "Export batch" on the board, for owed bounties whose solver is outside the Stripe list.
  - Output: a file in Wise's "Send by email" template [W4]. The bounties are marked "exported, not paid".
  - A refusal (Wise rejects the upload) leaves: nothing paid, the bounties still owed.
  - A retry finds: the same owed bounties, and exports them again.
  - Paid is recorded only on the owner's word (BT36's record), never from the export.

## Not found

- **N1** Whether Stripe accepts an individual with no UEN as a Connect *platform* in Singapore. Would find it: the owner's own Stripe account at step 8 ($0), or Stripe support.
- **N2** What Stripe sales offers Singapore platforms beyond the public pages. Would find it: Stripe sales (owner's contact).
- **N3** Stripe's card and Connect fees in each solver country (`on_behalf_of` uses them [S4]), and whether a USD charge to a non-USD account converts at the 2% FX fee. Would find it: each country's `stripe.com/<locale>/pricing` page, and the PF3 sandbox balance transactions.
- **N4** Airwallex: an individual-only market list, settlement timing for FundsSplit, who files 1099s, eligibility of a Singapore sole proprietorship, minimum volume, pricing. Would find it: Airwallex sales (owner's contact).
- **N5** Why Stripe's Express list keeps 103 country codes "available only when using cross-border payouts" [S6] while self-serve cross-border is five regions [S1] (K42's N4 about Algora's 119 countries is the same gap). Would find it: Stripe's changelog history or Stripe sales.
- **N6** Wise: whether batch sending needs the 99 SGD set-up fee; the per-currency fee for USD to each destination; whether a returning email recipient must re-enter bank details; the template's exact columns (downloadable only inside a business account); whether Wise checks email recipients' identity; whether it issues any tax form for recipients; whether batch upload works in the sandbox. Would find it: the owner's Wise Business account at $0, Wise's pricing calculator, and Wise support.
- **N7** PayPal: Singapore payout-access approval criteria, recipient fees, identity checks on recipients, whether a claimed payout can be reversed, and tax reporting for payouts. Payoneer: fees and access terms for an owner-paid account. Would find them: PayPal's Payouts application and its Singapore User Agreement; Payoneer's fee page or sales (owner's contact).
- **N8** US company: accountant cost, state taxes beyond Delaware, BOI reporting status. Would find it: a US tax adviser.
- **N9** Whether the owner's platform, on any route, is "arranging for the transmission of money" under the PS Act, or provides a "merchant acquisition service" (which applies "regardless whether the provider of the service comes into possession of any money"), or is excluded under First Schedule Part 2 para 2(a) or (h) [L1]; and whether running the platform as a sole proprietor or a Pte Ltd changes that analysis. Also whether a foreign solver, as business of record under `on_behalf_of` [S4], owes GST or VAT (tax adviser). **Needs a Singapore lawyer.**

## Proposed changes to PLATFORM.md (for the CTO; not applied)

1. **Owner's page, "What the platform does":** "through Stripe" becomes "through a Stripe platform account in Singapore; solvers in the Stripe countries PF3 proves (37 confirmed on Stripe's pages; Thailand and the UAE to be tested) are paid automatically; others are paid from the owner's own Wise account by a batch the platform prepares".
2. **Section 2, "Charge type":** "Destination charges" becomes "destination charges with `on_behalf_of` set to the solver, always: the only cross-region path open to a Singapore platform [S3][S4]; the solver's account must have `card_payments` [S3]; Stripe applies the solver's country's fees [S4]". Also add the readiness rule from this document's section 8.
3. **Section 2, "Countries":** replace the last three sentences with: "A Singapore platform transfers only within Singapore [S1][S2]; with `on_behalf_of` it reaches the 37 countries confirmed on both Stripe's availability page and its Express list (PLATFORM-MONEY-SG section 1). Thailand and the UAE are also on both lists, but Stripe's sentence about them is ambiguous [S7]. Its UAE page supports foreign platforms "only with" direct charges or destination charges with `on_behalf_of` [S25]. So they are unknown, not excluded, until PF3's sandbox gate tests them. Global Payouts is US/UK only and assumes a money transmitter licence [S9]."
4. **Section 2, "Fees":** add the Singapore edition figures: 3.4% + $0.50 domestic, +0.5% international, +2% FX, $15 dispute fee [S14]; $2 per monthly active account, 0.25% + $0.50 per payout, and 0.25% of payout volume for "Funds routing and platform management" [S15]. Keep the existing "0.25 % funds routing" line. Under `on_behalf_of`, the solver's country's rates apply [S4], so N7 is closed only for Singapore-settled payments.
5. **Section 7, step 3:** "a legal entity: unknown" becomes "an individual account if Stripe accepts it ($0), otherwise an ACRA sole proprietorship (S$115, then S$30 a year); a Pte Ltd (S$315 + S$60 a year) when real volume begins, because Connect liability is unlimited". Add: "the sandbox works before business verification [S16]" (closes K42's N8 test-mode half).
6. **Section 8:**
   - **PF3** gains the country-proof gate (SG, JP, AU, US, DE, plus TH and AE to settle Stripe's ambiguous sentence) and the capability readiness rule.
   - **PF4** replaces the single key `box-pay/<repository>/<bounty id>` with a payment state machine designed in the PF4 brief and held to five invariants, each proven by a PF4 test (section 8 above):
     1. one payable PaymentIntent per bounty, ever [S19][S23];
     2. every confirm, retries and crash recovery included, re-runs the mandate rules (3.5) and the payee checks (3.3) at the moment of the call; a refusal charges nothing, leaves the PaymentIntent as it is, and is shown on the board and in `status`;
     3. the board tells apart never attempted, declined, owner authentication required and outcome unknown; authentication arrives as `requires_payment_method` with `authentication_required` and is finished by the owner on a Stripe page, never by an off-session retry [S29];
     4. an unknown-outcome retry reads the PaymentIntent first and never charges twice; a stored error replayed under a key [S19] moves to a new key only after the read shows nothing was attempted;
     5. each trigger names what fires it, what a refusal leaves and what a retry finds.
   - New **PF7** (after PF6): the Wise "Send by email" export for owed bounties outside the Stripe list, recorded paid only on the owner's word.
7. **Section 9:**
   - **D1** becomes this document's recommendation.
   - **D5** becomes "USD; Stripe for the PF3-proven countries, Wise export for the rest".
   - **D7** adds "the PS Act's DPT 'arranging' limb and the overseas-only DTSP regime need a lawyer's answer first [L1][L2]".
   - **D4** adds: "under `on_behalf_of` the platform is still debited for disputes, and Stripe advises recovering cross-border transfers only after a dispute is lost [S4][S3]".
   - **D6**'s lawyer brief adds N9, including "merchant acquisition service".
   - **K43** note: under `on_behalf_of`, a foreign solver's address and phone number appear on the owner's card statement [S4]. Say so in the solver's onboarding text.

## References (all read 21 October 2026)

Stripe documentation (read as Markdown from `docs.stripe.com/<path>.md`; the server served British spelling; the cross-border page was compared across `en-US`, `en-GB` and `es-419` and carries the same text)

- [S1] Cross-border payouts: https://docs.stripe.com/connect/cross-border-payouts
- [S2] Create separate charges and transfers, Stripe-hosted Checkout variant (supported regions; cross-border transfers; `on_behalf_of` capability note): https://docs.stripe.com/connect/separate-charges-and-transfers?platform=web&integration=checkout&ui=stripe-hosted
- [S3] Create destination charges, Stripe-hosted variant (cross-region needs `on_behalf_of`; `on_behalf_of` only with a payments capability): https://docs.stripe.com/connect/destination-charges?platform=web&ui=stripe-hosted
- [S4] Understand how charges work in a Connect integration ("unless using `on_behalf_of`"; settlement, fees and statement under `on_behalf_of`; disputes debit the platform): https://docs.stripe.com/connect/charges
- [S5] Account capabilities, cross-border transfers: https://docs.stripe.com/connect/account-capabilities
- [S6] Connected account types, Express availability (103 country codes; "Some countries are available only when using cross-border payouts"): https://docs.stripe.com/connect/accounts
- [S7] Using Express connected accounts (platform countries including Singapore "can create Express accounts for most countries Stripe supports"; the ambiguous UAE and Thailand sentence under platform requirements; per-country onboarding in Connect Settings; `business_type=individual`). The Custom accounts page carries the same platform-country list: https://docs.stripe.com/connect/express-accounts , https://docs.stripe.com/connect/custom-accounts
- [S8] Service agreement types (recipient agreement cannot request `card_payments`): https://docs.stripe.com/connect/service-agreement-types
- [S9] Global Payouts (senders GB, US; private preview list; "already hold the Money Transmitter Licence"; Treasury funding): https://docs.stripe.com/global-payouts
- [S10] Global Payouts recipient requirements (sender countries United States and United Kingdom only; recipients include Singapore, India, the Philippines): https://docs.stripe.com/global-payouts/recipient-requirements
- [S11] Stripe global availability, **Singapore edition** (`stripe.com/global` redirected to `/en-sg/global`): https://stripe.com/en-sg/global
- [S12] Stripe Services Agreement, **Singapore edition**: Financial Services Terms §2.1 and Singapore Regional Terms; Stripe Connect Terms ("User's liability for all Connected Accounts ... is not limited or excluded in any way"); last modified 28 September 2026: https://stripe.com/en-sg/legal/ssa-services-terms (served at `/en-sg/legal/ssa-service-terms`)
- [S13] Stripe support, "2026 updates to Singapore verification requirements" (read by summarising fetch): https://support.stripe.com/questions/2026-updates-to-singapore-verification-requirements
- [S14] Pricing, **Singapore edition** (3.4% + $0.50 domestic; 3.4% + US$0.50 settled in USD; +0.5% international; +2% conversion; $15.00 dispute fee; no setup or monthly fees): https://stripe.com/en-sg/pricing
- [S15] Connect pricing, **Singapore edition** ($2 per monthly active account; 0.25% + $0.50 per payout; "Funds routing and platform management" 0.25% of payout volume; sales for custom options): https://stripe.com/en-sg/connect/pricing
- [S16] Activate your account (sandbox before verification): https://docs.stripe.com/get-started/account/activate ; sandboxes: https://docs.stripe.com/sandboxes
- [S17] Marketplace essential integration tasks, "Before you begin" steps 1 to 4: https://docs.stripe.com/connect/marketplace/essential-tasks
- [S18] Stripe-hosted onboarding (branding required; Account Links): https://docs.stripe.com/connect/hosted-onboarding
- [S19] Idempotent requests (first result saved and returned on retry; keys pruned after at least 24 hours): https://docs.stripe.com/api/idempotent_requests
- [S20] Stripe Atlas, **Singapore edition** (US$500 one-time; US$100 a year): https://stripe.com/en-sg/atlas
- [S21] Atlas business taxes (Delaware LLC "flat rate of 300 USD"; transfer pricing): https://docs.stripe.com/atlas/business-taxes
- [S22] API reference, Confirm a PaymentIntent (failure moves it to `requires_payment_method`, or `canceled` at the confirmation limit): https://docs.stripe.com/api/payment_intents/confirm
- [S23] The PaymentIntent lifecycle ("Cancellation invalidates the PaymentIntent for future payment attempts"): https://docs.stripe.com/payments/paymentintents/lifecycle
- [S24] API reference, List all PaymentIntents (`customer` filter): https://docs.stripe.com/api/payment_intents/list
- [S25] Stripe support, "Connect availability in the UAE" ("Foreign platform with UAE connected accounts", "Available only with" direct charges or destination charges with `on_behalf_of`; "some configurations may require you to contact our sales team"; read by summarising fetch, the page renders by script): https://support.stripe.com/questions/connect-availability-in-the-uae
- [S26] Stripe support, Thailand support for marketplaces ("We do not support separate charges and transfer"; destination charges and `on_behalf_of` not addressed; read by summarising fetch, the page renders by script): https://support.stripe.com/questions/stripe-thailand-support-for-marketplace
- [S27] API reference, Create a PaymentIntent (`payment_method` "to attach to this PaymentIntent"; `customer` required for a saved method): https://docs.stripe.com/api/payment_intents/create
- [S28] API reference, The PaymentIntent object (`last_payment_error`: "The payment error encountered in the previous PaymentIntent confirmation. It will be cleared if the PaymentIntent is later updated for any reason."): https://docs.stripe.com/api/payment_intents/object
- [S29] Save a customer's payment method without making a payment, Setup Intents variant, "Charge the saved payment method later" (an off-session failure "fails with a 402 HTTP status code and the status of the PaymentIntent is `requires_payment_method`"; for the `authentication_required` decline code, "use the declined PaymentIntent's client secret with confirmPayment to allow the customer to authenticate the payment"): https://docs.stripe.com/payments/save-and-reuse?payment-ui=elements
- [S30] Error codes (`authentication_required`: "If your customer is off session, notify your customer to return to your application and complete the payment"): https://docs.stripe.com/error-codes

Airwallex (documentation read as Markdown from `airwallex.com/docs/<path>.md`; marketing pages in the **Singapore edition** `/en-sg/`)

- [A1] Connected accounts, regional availability: https://www.airwallex.com/docs/connected-accounts/about/regional-availability
- [A2] Account types (business and individual; ledger, withdrawal, full): https://www.airwallex.com/docs/connected-accounts/about/account-types
- [A3] Wallets and funds flow: https://www.airwallex.com/docs/connected-accounts/about/wallets-and-funds-flow
- [A4] Compliance and risk overview: https://www.airwallex.com/docs/connected-accounts/about/compliance-and-risk-overview
- [A5] Get started with connected accounts: https://www.airwallex.com/docs/connected-accounts/get-started/get-started-with-connected-accounts
- [A6] Payments for marketplaces (full vs ledger model; 50+ vs 200+ countries): https://www.airwallex.com/docs/payments-for-platforms/use-cases/payments-for-marketplaces
- [A7] Process payments and manage funds; Collect payments directly (FundsSplit): https://www.airwallex.com/docs/payments-for-platforms/airwallex-gateway/process-payments-and-manage-funds , https://www.airwallex.com/docs/payments-for-platforms/airwallex-gateway/process-payments-and-manage-funds/collect-payments-directly
- [A8] Payments for Platforms, **Singapore edition** ("Contact sales"): https://www.airwallex.com/en-sg/platform-api-and-embedded-finance/payments-for-platforms
- [A9] Plans & Pricing, **Singapore edition** (Platform API: "Contact Sales"; card, FX, transfer rates): https://www.airwallex.com/en-sg/pricing
- [A10] Sandbox environment overview (connected account APIs: contact sales): https://www.airwallex.com/docs/developer-tools/sandbox-environment
- [A11] Bank account payout network: https://www.airwallex.com/docs/payouts/payout-network/bank-accounts
- [A12] Embedded Tax Form component: https://www.airwallex.com/docs/payouts/tax-filing/embedded-tax-form-component

Wise (**Singapore edition** `/sg/` where one exists; help centre and API docs are global)

- [W1] Wise Business pricing, Singapore: https://wise.com/sg/pricing/business
- [W2] Payouts for businesses, Singapore (from `/sg/business/batch-payments`): https://wise.com/sg/business/payouts
- [W3] How do I make a batch payment?: https://wise.com/help/articles/2663295/how-do-i-make-a-batch-payment
- [W4] What's a batch payment template? ("Send by email"; one week; cancel and refund): https://wise.com/help/articles/2663296/whats-a-batch-payment-template
- [W5] Personal API tokens: https://docs.wise.com/guides/developer/auth-and-security/personal-api-token
- [W6] Can my business use Wise?: https://wise.com/help/articles/2977974/can-my-business-use-wise
- [W7] Wise Business account requirements, Singapore (Wise's own blog, last updated 30 January 2026; UEN issued by ACRA): https://wise.com/sg/blog/wise-business-account-requirements
- [W8] What countries/regions can I send to? (49 entries): https://wise.com/help/articles/2571942/what-currencies-can-i-send-to-and-from
- [W9] How do I verify my business in Singapore? (help): https://wise.com/help/articles/2666678/what-do-i-need-to-verify-my-singapore-business
- [W10] Wise Business Customer Agreement, **Singapore**, last updated 21 August 2026 (6.5 tax information requests; 20.16 cancelling a Money Transfer): https://wise.com/sg/legal/terms-of-use-business

PayPal, Payoneer, Adyen

- [P1] PayPal Standard Payouts (96 countries; prerequisites; balance funding): https://developer.paypal.com/docs/payouts/standard/
- [P2] Payouts countries and supported features (Singapore "Fully localized"; unclaimed returned after 30 days): https://developer.paypal.com/docs/payouts/standard/reference/country-feature/
- [P3] PayPal multiparty and its get-started page ("only available to approved partners"; sandbox before approval): https://developer.paypal.com/docs/multiparty/ , https://developer.paypal.com/docs/multiparty/get-started/
- [P4] PayPal business fees, **Singapore edition**, last updated 28 September 2026 (read by summarising fetch; `curl` crashed on paypal.com; payout caps: USD 1.00 domestic / 50.00 international, SGD 1.60 / 80.00): https://www.paypal.com/sg/business/paypal-business-fees
- [P5] PayPal Payouts, integrate with the API (sandbox; batch status `CANCELED`; `UNCLAIMED` items): https://developer.paypal.com/docs/payouts/standard/integrate-api/
- [Y1] Payoneer Mass Payouts (read by summarising fetch): https://www.payoneer.com/mass-payouts/
- [AD1] Adyen pricing, **Singapore edition** (read by summarising fetch): https://www.adyen.com/en_SG/pricing
- [AD2] Adyen, platform model page (read by summarising fetch): https://docs.adyen.com/adyen-for-platforms-model

Singapore and US law, regulators and registries

- [L1] Payment Services Act 2019, current version as at 21 October 2026: s 5(1); First Schedule Part 1, Part 2 para 2(a) and (h), Part 3 definitions of "cross-border money transfer service" and "digital payment token service": https://sso.agc.gov.sg/Act/PSA2019
- [L2] MAS media release, "MAS Clarifies Regulatory Regime for Digital Token Service Providers", 6 June 2025: https://www.mas.gov.sg/news/media-releases/2025/mas-clarifies-regulatory-regime-for-digital-token-service-providers
- [L3] MAS media release, "MAS Consults on Legislative Amendments to Implement Stablecoin Regulatory Framework", 1 September 2026: https://www.mas.gov.sg/news/media-releases/2026/mas-consults-on-legislative-amendments-to-implement-stablecoin-regulatory-framework
- [L4] ACRA, Registering a sole proprietorship or partnership: https://www.acra.gov.sg/register/business/registering-different-business-structures/sole-proprietorship-or-partnership/
- [L5] ACRA, Service & transaction fees: sole proprietorships & partnerships: https://www.acra.gov.sg/how-to-guides/sole-proprietor-and-partnership-fees
- [L6] ACRA, Choosing a business structure (requirements, liability, Pte Ltd S$315): https://www.acra.gov.sg/register/business/choosing-business-structure/
- [L7] ACRA, Business Names Registration Act 2014 (own full name exemption): https://www.acra.gov.sg/regulations/legislation/business-names-registration-act/
- [L8] ACRA, Service & transaction fees: companies (annual return S$60): https://www.acra.gov.sg/manage/companies/service-transaction-fees/
- [L9] IRAS, Tax obligations for non-resident professional: https://www.iras.gov.sg/taxes/withholding-tax/payments-to-non-resident-professional-(consultant-trainer-coach-etc-)/tax-obligations-for-non-resident-professional
- [L10] Delaware Division of Corporations, Franchise Tax (read by summarising fetch; `curl` was rejected by the site): https://corp.delaware.gov/frtax/
- [L11] IRS, Instructions for Form 5472 (12/2024): https://www.irs.gov/instructions/i5472

In this repository

- [K32] `kitchen/reviews/K32-agent-payments.md`; `docs/box-v4/PLATFORM.md` (K42).
