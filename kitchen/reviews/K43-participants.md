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
