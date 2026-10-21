# K43 participants: the three final reports, verbatim

Copied byte for byte from the head chef's saved files (one per participant), each under the host and model header the head chef wrote. Nothing below the headers is edited. Each participant was a fresh Claude Code desktop session on claude-sonnet-5-5 at its default effort, with its working directory in its own packet folder under %TEMP% (kitchen-K43-solver-agent, kitchen-K43-solver-web, kitchen-K43-owner-web), started by the head chef; none saw this repository. The tasks are in each packet's TASK.md and in waves/K43.md, deliverable 3. The solver-agent session's first start was blocked by a false-positive model safeguard flag before it did any work; the head chef restarted it with a reworded message. Raw transcripts are not committed.

---

# Participant solver-agent (host Claude Code desktop, model claude-sonnet-5-5, default effort; first start blocked by a false-positive safeguard flag before any work, restarted with a reworded message)

**Answer:** I'd take **bt-0d7e4a3c8b65**, "Recurring transactions skip the 31st in short months" ($45, example-tidepool/ledger-lite, TypeScript). I read only the sample files and the stand-in, and did no real GitHub or payment steps.

**Why this one**
- Its owner, example-mara, has the best record of any TypeScript owner: 6 merged, 5 recorded paid, 4 confirmed received, `says_not_received: 0`.
- Mara has only one merge owed now (`owed_now: 1`, `oldest_owed_days: 6`), so no long-overdue debt.
- Nobody has submitted a solution yet (`solutions.open: 0`), so I wouldn't be competing for the whole reward.
- Mara approved this bounty personally (`approved_by: owner-this-bounty`).
- The task is small and clear. It wants the 31st to fall on the last day of short months, and it's done when `tests/recurring.test.ts` passes, February cases included.

**How I'd answer**
1. Fork example-tidepool/ledger-lite and branch from `box-bounty/bt-0d7e4a3c8b65` at commit `0d7e4a3c0d7e4a3c0d7e4a3c0d7e4a3c0d7e4a3c`.
2. Clamp the repeat day to the month's last day, and make `tests/recurring.test.ts` pass.
3. Open a pull request against `box-bounty/bt-0d7e4a3c8b65`, not against main.

**How I'd get paid**
1. Sign in to the board with GitHub and list at least one way to be paid on my profile, such as a PayPal.me link or GitHub Sponsors.
2. If my pull request is the one merged, Mara owes me $45 and pays me directly. The board holds no money.
3. When the money arrives, I confirm receipt on the bounty page. That confirmation is recorded as my word.

**Other candidates**
- **bt-2b8d7e01c6a5** (same owner, $40) already has two open pull requests (#44 from example-rook, #46 from example-fern). Only one can be merged, so I skipped it.
- **bt-c5a1b7e3f082** (example-wren, $80) has an owner with `owed_now: 2`, `oldest_owed_days: 40` and `says_not_received: 1`. I avoided it.
- **bt-1e9a6c4f2b78** and **bt-1f04c2a9e7b3** have owners with "no history yet", so they have no payment record.

**Where I hesitated, misread or was unsure**
1. **Wrong folder.** My `cd` into `feed/` carried over to the next command. The next `node standin.mjs` call then failed with `Cannot find module '…\feed\standin.mjs'`. I reran it from the task folder.
2. **Repeating "owner has a record of paying."**
   - `recorded_paid: 5` is "the owner says they paid (the owner's word)". `confirmed_received: 4` is "the solver says the money arrived (the solver's word)". Neither is independently verified.
   - `from_solvers: 3` in Mara's profile is not defined anywhere. It is lower than `confirmed_received: 4`, and I couldn't tell why.
   - The legend says merges where the solver is the poster or has push access are not counted. Mara's profile shows `not_counted: 0`, so I read the record as clean.
3. **"No history yet" isn't a bad record.** It is a plain string where the others are objects, so a script that expects an object would break on it. It means no payment history, not a bad one. I still ruled those owners out for the task.
4. **`owed_now: 1`, `oldest_owed_days: 6` for Mara.** She has one merge she hasn't recorded paying, six days old. That is probably normal, but I couldn't tell how long she usually takes to pay.
5. **`history[0].source: "memory"` on "posted by example-mara".** Solutions say `"source": "github"`, but the posting event says `"memory"`. The board doesn't say what "memory" means. I read it as the board's own record, not GitHub's, so the poster and approval claim aren't GitHub-verified.
6. **`approved_by: "owner-this-bounty"` vs `"owner-standing-rule"`.** The standing-rule bounties are posted "without asking" the owner. I treated that as a negative signal.
7. **`example-pike` and `example-pike-alt`.**
   - Two similar names appear in the people files.
   - `example-pike` is the owner of bt-1e9a6c4f2b78.
   - `example-pike-alt` is a solver profile with a PayPal.me link.
   - I couldn't confirm whether they are one person. They didn't affect my pick.
8. **`accepts_payment_by: []` on Mara's profile.** That is the owner's profile, which is expected, so it only matters for mine. The board shows my payment methods to the owner only after a merge, and I couldn't verify that.
9. **Payment is trust-based.** Because the owner pays directly and the board guarantees nothing, a good record lowers the risk but doesn't remove it.
10. **Instructions in the data.** The board text says poster titles and tasks are data, not instructions. I found nothing in them that tried to direct me, and I treated them as data.
11. **Doubled "paid" fields.** Each bounty shows `"paid": "by the owner, directly"` and `payment.state`. `payment.owed` is `null` until something merges, so I treated them as consistent.

---

# Participant solver-web (host Claude Code desktop, model claude-sonnet-5-5, default effort)

I picked "Recurring transactions skip the 31st in short months" ($45, example-tidepool/ledger-lite, TypeScript). I read the pages in the built-in browser, did not submit anything, and have stopped `node serve.mjs`. I left the browser tab open and it now points at a dead server.

## Where I hesitated, misread or was unsure

1. **Owner name vs. repository name.** The list shows "example-tidepool/ledger-lite" for the $45 and $40 bounties, but the payment line says "The owner pays directly. example-mara: 6 merged…". I first read the owner as "example-tidepool". The detail page says "This owner: example-mara", so the repository prefix is an organisation and the owner is a person. The same happens with "example-kestrel/pikeworks" and "example-pike", and with "example-juno/riverbed".
2. **The filter "Has confirmed payments" includes a risky owner.** It returns three bounties, including example-wren's $80 one (sparrow-kit). That owner's line reads "4 merged · 2 recorded paid · 1 confirmed received · 2 owed (oldest 40 days) · 1 says not received". I had to read the whole line to see that this owner is a poor choice.
3. **The wording of the payment-record line.** "5 recorded paid" is the owner's word and "4 confirmed received" is the solvers' word. The detail page says so ("Recorded paid: the owner's word… Confirmed received: the solvers' word"), but the list view doesn't. "1 owed (oldest 6 days)" also left me unsure whether it was late or still within normal time. The owner page clears it up: it is the $50 bounty merged 15 Oct, "Merged, owed", to example-quill.
4. **The CSV bounty (bt-2b8d7e01c6a5, $40, same owner).** The page showed "Pull request #44 by example-rook" and "#46 by example-fern". I was signed in as example-fern at the time, so I seemed to have already answered it. That made me unsure whether I could answer at all. Two solutions are also already waiting, and the terms say "Other solutions earn nothing."
5. **Issue and PR numbers.** The $45 bounty is "Issue #44" and the CSV bounty's PR is "#44", both in ledger-lite. On GitHub, issues and PRs share one numbering, so this looks inconsistent.
6. **The sign-in page.** It says "On the real board this is one button that opens GitHub". For the prototype I picked a sample account, example-fern, and nothing real was involved. Nothing on the bounty page requires signing in to read it.
7. **The payment-methods form.** On "Your page", "Ways you accept payment" says "None yet". The bounty page says "list the ways you accept payment on your profile", but the form's wording about visibility is unclear. It offers "Everyone, on my profile" or "Only an owner who owes me". I don't know which is safer or expected, and whether I need to add a method before answering or only before being paid. I did not add one. I also did not see what the "Your page as a solver" preview shows owners.
8. **"Approved by the owner for this bounty".** I wasn't sure what this adds beyond the issue being posted. The wording suggests the owner's approval is separate from the poster.
9. **Posted date.** "17 Oct 2026 (4 days ago)" matches today's date (21 Oct), so there is no discrepancy there.

## My answer

**Bounty:** "Recurring transactions skip the 31st in short months", $45, owner example-mara. That owner has 6 merged, 5 recorded paid, 4 confirmed received by 3 different solvers (quill, sol, rook), and 1 owed for 6 days. The owner page lists each past bounty with its status. There are no solutions yet, so I would have no competitor. The task is clear: tests/recurring.test.ts must pass, including the February cases.

**How I would answer:**
1. Fork example-tidepool/ledger-lite.
2. Branch from `box-bounty/bt-0d7e4a3c8b65` (commit 0d7e4a3c0d7e).
3. Fix the recurrence logic so the 31st falls on the last day of short months.
4. Open a pull request against `box-bounty/bt-0d7e4a3c8b65`, not against main.

**How I would get paid:**
1. Before the merge, add a payment method on "Your page" (for example PayPal.me), set to "Only an owner who owes me".
2. If my PR is merged, the owner pays the $45 directly. The board holds no money.
3. When it arrives, I confirm it on the board.

The payment facts are partly the owner's word, so this carries some risk. The one owed bounty is only 6 days old.

---

# Participant owner-web (host Claude Code desktop, model claude-sonnet-5-5, default effort)

I recorded the $50 payment as example-mara, then checked the public owner page, which now shows the payment as recorded. The server is stopped. The board moves no money, and nothing real was paid.

**Where I hesitated or was unsure**

1. **Which account is mine?** The task says "you post bounties", but the sign-in page offers two owners: "Continue as example-mara — an owner: posts bounties on example-tidepool repositories" and "Continue as example-wren — an owner: posts bounties on example-wren/sparrow-kit". I picked example-mara and did not try example-wren.
2. **What does "Pay and record the oldest" do?** This is the button on `/me/` under "You owe (1)". It reads as if the board pays, but the page also says "It never follows a link or moves money." I did not click it. I opened the bounty link instead.
3. **Order of pay and record.** The bounty page settled it: "Pay example-quill directly, by a method they listed… Then record it here." The button is "Record $50 paid to example-quill", with the note "Recording moves no money."
4. **Payment methods.** The page lists PayPal.me, GitHub Sponsors and Wise (email), with the caveat "The board does not check that these accounts are theirs." I couldn't tell how to verify them. The Wise address is "shown only to owners who owe example-quill". After I recorded the payment, that whole block disappeared, so I could not look up where to send it afterwards.
5. **Stale text on first read.** Just after recording, `/owner/example-mara/` still said "5 recorded paid… 1 owed now, the oldest for 6 days" and "Merged, owed" for the $50 bounty. After a reload it said "6 recorded paid… 0 owed now" and "Recorded paid". The record looks like it is stored in the browser, not on a server. I read the text before the page had finished loading, so I'm not sure whether it was only timing.
6. **Clicks that seemed to do nothing.** Two clicks ("See what solvers see about you" and the bounty link) didn't visibly navigate at first. The first one still showed the old page, so I typed the address, `/owner/example-mara/`, myself.
7. **"Recorded paid" versus "confirmed".** The counts read "6 merged · 6 recorded paid · 4 confirmed received". The page explains that recorded paid is the owner's word and confirmed received is the solvers' word. I wasn't sure whether the two unconfirmed ones count as a problem or are normal.

**Answer**

- **What I owed:** $50 to example-quill, for "Monthly totals double-count transfers between two own accounts", merged 15 Oct 2026 and 6 days old.
- **What I recorded:** "Recorded paid by example-mara on 21 Oct 2026 ($50)", labelled "The owner's word, on this board."
- **What solvers see about me:** the public page `/owner/example-mara/` shows 6 rewarded bounties merged, 6 recorded paid (my word), 4 confirmed received by 3 different solvers (their word), and 0 owed now.
  - The $50 bounty is listed as "Recorded paid".
  - The $35 "Export to OFX…" bounty, also to example-quill, is "Recorded paid", with no word from the solver yet.
  - Four earlier bounties are listed as "Received".
  - Open bounties: "CSV import rejects files with a byte-order mark" ($40) and "Recurring transactions skip the 31st in short months" ($45).

---

# Cold run (the pass)

The three final reports of the pass's cold run on candidate `266a220`, copied byte for byte from the head chef's saved files (one per participant, each under the host and model header the head chef wrote). Each participant was a fresh Claude Code desktop session on claude-sonnet-5-5 at its default effort, started by the head chef with its working directory in its own packet under %TEMP% (kitchen-K43-pass-solver-agent, kitchen-K43-pass-solver-web on port 4321, kitchen-K43-pass-owner-web on port 4322), built from a git-archive build of `266a220`, with the TASK.md the pass wrote. None saw this repository. Raw transcripts are not committed.

---

# Cold participant solver-agent (host Claude Code desktop, model claude-sonnet-5-5, default effort; packet built from 266a220)

Working directory drifted into `feed/people`; nothing was changed there. I only read files.

## Answer

**Bounty `bt-0d7e4a3c8b65`: "Recurring transactions skip the 31st in short months"**
- $45, repo `example-tidepool/ledger-lite` (TypeScript), owner `example-mara`.
- No open solutions yet.

**Why this one:** Mara's record is the only clean one among the TypeScript owners.
- 6 merged, 5 recorded paid, 4 confirmed received by 3 different solvers.
- `says_not_received` is 0, and the oldest unpaid item is 6 days old, which is inside the 14-day lateness line in `standin.mjs`.
- Median time to record a payment is 2 days.
- I passed over `bt-2b8d7e01c6a5` (same owner, $40) because two other pull requests are already open and only the merged one is paid.
- Wren's `bt-c5a1b7e3f082` has a payee saying a payment never arrived, and 40 days owed. Pike, Orrin and Mara's repos' other owners have no history at all.

**How I'd answer:**
1. Fork `example-tidepool/ledger-lite` and branch from `box-bounty/bt-0d7e4a3c8b65` at commit `0d7e4a3c0d7e4a3c0d7e4a3c0d7e4a3c0d7e4a3c`.
2. Make a short-month recurrence on the 31st fall on the last day of the month, until `tests/recurring.test.ts` passes, including the February cases.
3. Open the pull request against `box-bounty/bt-0d7e4a3c8b65`, not `main`.

**How I'd get paid:**
- Before my pull request could be merged, I'd sign in to the board with GitHub and list at least one way to accept payment. I can choose "only an owner who owes me" so it stays private.
- If my pull request is merged, Mara owes me $45 and pays me directly. The board never touches the money.
- When it arrives, I confirm receipt on the bounty page.

I did not do the code change: the repo isn't in this folder. I also can't sign in or enter payment details.

## Where I hesitated or was unsure

1. **Counts are not all the same kind of fact.** `recorded_paid: 5` is the owner's word and `confirmed_received: 4` is the solvers' word. So one recorded payment is unconfirmed, and `owed_now: 1` (6 days) is another. Neither is flagged as a problem, but I can't tell which is which.
2. **Small sample.** "3 solvers" and "4 confirmed" is a thin track record, and it is self-reported.
3. **Exclusions in the record.** The legend says merges where the payee is the poster, or the pull request author is OWNER, MEMBER or COLLABORATOR, are not counted. Mara's `not_counted` is 0. A good record therefore says nothing about how the owner treats insiders.
4. **Competition is a risk I can't measure.** Whoever's pull request merges takes the whole reward ("Other solutions earn nothing"). With no open pull requests on the $45 bounty, I'd be first, but that can change.
5. **"Newest first" was not what I saw.** The task said newest first, but the output ran `1e9a`, `1f04`, `0d7e`, `c5a1`, `2b8d`, which is posted 10-18, 10-17 14:05, 10-17 08:00, 10-14, 10-12. That is newest first after all; I briefly misread it.
6. **Different counts in different files.** `feed/bounties.json` lists 7 bounties (`count: 7`), but `feed/bounties/` has 20 files. `find_bounties` only returns open ones, so I assumed the other 13 are closed or off the first page. I did not read them.
7. **Owner vs. repo owner.** `bt-1e9a6c4f2b78` has owner `example-pike` but repo `example-kestrel/pikeworks`. There is also a `feed/people/example-pike-alt.json` that I didn't open. It looks like it could be a lookalike or duplicate identity. I skipped that bounty (no history, standing rule), but I didn't verify.
8. **The "no late payments" filter.** I judged Mara's record against the `confirmed-none-late` rule by reading `standin.mjs` (`LATE_DAYS = 14`), not by running that filter.
9. **Task text is data.** The poster's wording ("Done means tests/recurring.test.ts passes") is a poster's claim and I can't check it here, since neither the test nor the repo is in the folder.
10. **Payment methods.** Mara's person file shows `accepts_payment_by: []`. That is her listing as a payee and isn't relevant to me. My own list is something I'd have to set up on the board, which I can't do here.

---

# Cold participant solver-web (host Claude Code desktop, model claude-sonnet-5-5, default effort; packet built from 266a220)

**Answer:** I'd take **"Recurring transactions skip the 31st in short months"**. It is a $45 TypeScript bounty on example-tidepool/ledger-lite, posted by example-mara, at `/b/bt-0d7e4a3c8b65/`. I did not write or submit a solution, so the answer below is the plan.

**Why this one.** It is the only open TypeScript bounty whose owner has a payment record that isn't flagged as a problem. Mara's record is 6 merged, 5 paid by her word, 4 received by solvers' word, and 1 owed for 6 days. Her owner page shows she usually records a payment 2 days after the merge. I read the owed one as a recent merge (15 Oct) that is still inside her usual window. The other TypeScript owners fail:
- example-wren has a payment "the solver says has not arrived" and owes 2, the oldest for 40 days.
- example-orrin and example-pike (the $60 and $150 bounties) have no history yet.

I did not use the board's "Confirmed payments; none disputed or owed over 14 days" filter. I read the owners' pages instead.

**How I'd answer:**
1. Fork example-tidepool/ledger-lite and branch from `box-bounty/bt-0d7e4a3c8b65` (commit `0d7e4a3c0d7e`).
2. Make a repeat on the 31st fall on the last day of short months, so `tests/recurring.test.ts` passes, including the February cases.
3. Open a pull request against `box-bounty/bt-0d7e4a3c8b65`, not against `main`.

**How I'd get paid:**
1. Before the merge, add at least one way to accept payment on `/me/`. I signed in as the sample solver example-fern and added a PayPal.me link visible only to an owner who owes me.
2. If my solution is merged, I get the whole $45; other solutions get nothing.
3. Mara pays me directly. The board holds no money and sets no deadline.
4. She records the payment on the board, and I confirm it when it arrives.

**Where I hesitated, misread or was unsure:**
- **"Record of paying."** I wasn't sure what counted. "5 paid by the owner's word · 4 received by the solvers' word" means one payment is unconfirmed. "1 owed for 6 days" could be read as a failure to pay, but the page sets no deadline.
- **The owed payment.** The owner page ("/owner/example-mara/") lists it as "Merged, owed · merged 15 Oct 2026 · to example-quill" for $50. The "Recorded paid" row for $35 is unconfirmed.
- **Stale "visitor" text.** The bounty page first read "You are viewing as a visitor." After the page finished loading it said "You are viewing as a signed-in solver (example-fern)." My first text and interactive reads of `/me/` also showed signed-out content. This looks like reading before hydration.
- **Sign-in.** The "Sign in with GitHub" button leads to a "choose a sample account" picker. I hesitated, then chose example-fern because it is sample data on localhost.
- **Payment link.** On the bounty page, "list at least one way you accept payment" links to `/me/#methods`. It is easy to read as "required to answer," but `/me/` says "You need one before you can be paid, not before you answer a bounty."
- **Wrong URL guess.** `/people/example-mara/` quietly showed the board home. The real owner page is `/owner/example-mara/`.
- **Visibility wording.** "Everyone, on my profile" versus "Only an owner who owes me" took a read to follow. The latter shows the method only to an owner who owes me, from the merge until they record the payment.
- **Payment details.** "Added. In the prototype it is kept only on this page" suggests an owner wouldn't actually see the method. I also can't tell how I'd learn the owner's payment details, or who I'd contact if a payment doesn't arrive.
- **Not checked.** I did not look at the other Mara bounty (CSV import, $40) beyond the board listing.

The server is stopped; a request to localhost:4321 now fails. The sample sign-in is still active in the browser pane, and I did not sign out of it.

---

# Cold participant owner-web (host Claude Code desktop, model claude-sonnet-5-5, default effort; packet built from 266a220)

I recorded the $50 payment as example-mara, and the server is stopped (nothing is listening on 4322). The background task's "failed, exit 127" notice is the server being killed. It printed `Serving …kitchen-K43-pass-owner-web\site`, so it was my own server.

**Answer**
- I signed in as example-mara, the first owner on the sign-in list. Under "You owe (1)" was "Monthly totals double-count transfers between two own accounts, $50, to example-quill, merged 15 Oct 2026, 6 days ago".
- On the bounty page I followed "See how to pay example-quill", paid-by-method details shown, then pressed "Record $50 paid to example-quill". The page then said "Recorded paid by example-mara on 21 Oct 2026 ($50). The owner's word, on this board." and "Not confirmed received by example-quill."
- The public owner page at `/owner/example-mara/` ("what solvers see about you") now shows:
  - 6 merged
  - 6 recorded paid ("example-mara's word")
  - 4 confirmed received, by 3 solvers
  - 0 owed now
  - the $50 bounty listed as "Recorded paid"

**Where I hesitated, misread or was unsure**
1. **Which owner to be.** The sign-in page says "Either owner account works for trying the owner side", but only mara has something that fits "what you owe" with a single clear item. I guessed mara. wren's account would have shown "owes 2, the oldest for 40 days", which is a different experience.
2. **"/me" had no sign-in link.** I went straight to `/me/`, which said "Sign in to see what you owe…". The home page only had a small "Sign in" link at the top right, so I wasn't sure where owners were meant to start.
3. **"Recorded paid, not yet confirmed by the solver" section.** This sits directly under "You owe (1)". It lists "Export to OFX writes amounts with a comma in some locales" with "no word from the solver yet", and it has no amount or action. I wasn't sure whether it counted as something I owe. It doesn't, since it is already recorded paid.
4. **Money wording.** The page says "Recording moves no money" and "the board carries no money". The button "Record $50 paid" and the text "Pay example-quill directly, by a method they listed" make it clear I pay elsewhere first. I still paused to check that I wasn't about to send money. I had to read the small grey text to be sure.
5. **"By the owner's word" versus "received by the solvers' word".** The owner profile reads "5 paid by the owner's word · 4 received by the solvers' word · 1 owed". I wasn't sure at first whether the 5 and 4 overlap and whether "owed" is 6 minus 5. After recording, "owed" disappeared from the list rather than showing 0 on the bounty page.
6. **Wise email shown to me.** The page showed a private method (`quill@example.invalid`) with the note that example-quill "shows this only to an owner who owes them". After I recorded payment it was replaced by "1 more method … not shown now that this payment is recorded". That is explained, but it means the details vanish the moment I press the button, so if I recorded before paying I couldn't see where to pay.
7. **The "See what solvers see about you" link didn't navigate.** I clicked it from the bounty page and the URL and content didn't change, so I loaded `/owner/example-mara/` directly. It may have been a click timing issue.
8. **Stale numbers on the first load.** My first load of `/owner/example-mara/` still showed the old figures: "5 recorded paid", "1 owed now, the oldest for 6 days" and "Merged, owed". After a second load it showed "6 … recorded paid" and "0 owed now". Until I reloaded, I would have believed recording hadn't worked.
9. **"This is your public page as an owner: exactly what every solver sees about you."** This line only appeared after the reload. On the stale first load the subtitle read "What this owner's bounties show, as facts…", so the page's framing changed between loads.
10. **Time wording.** "Usually records a payment 2 days after the merge" appears alongside "The board sets no deadline". I wasn't sure whether the first is a norm I'm being judged against, and it is unclear how it is computed now that I paid on day 6.
