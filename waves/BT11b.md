# BT11b: the solver's payment link, and telling the owner whom to pay

Milestone: BT · Station: packaging (also evidence) · Base: master at dispatch, after BT11a and K15 · Branch: `wave/BT11b` · Timebox: 150 minutes; at expiry the cook stops and reports where it is, whatever state that is

**Written by the CTO on 13 October 2026**, the second half of the old BT11, rewritten clean against the tool as it stands after BT10. The idea is the owner's (11 October 2026) and the decisions since are theirs. The head chef checks names against master at dispatch.

## The idea, as the owner put it

No bounty site in the middle. A bounty can state a reward. The issue tells the solver to put their own payment link in their pull request, Stripe links only to start. **The tool never pays, never opens the link, and never holds or moves anyone's money.** It carries two facts: the amount the owner set, and where the merged solver asked for it to be sent.

**The merge decides. The owner pays, by opening the solver's link.** The agent's judgement is which solution it merges; being merged is what makes a solution the worthy one. Nobody awards anyone, nobody is asked to confirm, and the tool does not track whether a payment happened: it cannot know.

## Outcome

1. With a reward above $0, the issue asks a solver who wants paying for one fixed line in their pull request.
2. Next to each solution the agent sees, as a fact, whether a recognised payment link was given.
3. When a solution is merged and the tool closes the bounty, it gives the agent the message to pass to the owner: whom to pay, how much, and where.

## Scope

- Write: `packages/box-bounty/**`, `packages/box-cli/**` (the `bounty` commands), `tests/box/bounty/**`, `docs/box-v4/BOUNTY.md`, `docs/box-v4/BOUNTY-FORMAT.md`. On GitHub: the sandbox repository only (K15).
- Read for context: the Results of `waves/BT11a.md` (the reward, the limit, the format's version), `waves/BT7b.md` (how the tool recognises a merge and closes), `waves/BT9.md` (the hook's slot for the moment an agent is about to finish), `waves/BT6a.md` (how a pull request and its text are handled), `waves/K15.md` (the sandbox and how a wave uses it); `kitchen/stations/packaging.md`.
- Do not touch: the reward and limit settings (BT11a); the never-ship table; `shouteck/omakase-box` on GitHub; `.execution/`, `docs/legacy/`.

## Done when

- `node scripts/verify.mjs test:box-bounty test:box-package` exits 0 on the final commit; the suites reach no network. The K14 start budgets are re-measured and stated.

**What the issue tells the solver**

- When the reward is above $0, the "how to answer" part of the listing adds, in plain words: that a solver who wants to be paid adds one line to their pull request description, `pay-to:` followed by their Stripe payment link, with a worked example; and that payment is the poster's to make by hand and posting a solution does not guarantee it. The block says the same in fields a program can use, with the format page updated.
- At $0 none of this appears. A test pins the wording: no sentence promises payment, timing or selection.

**Reading the solver's line**

- The line is text written by a stranger and is treated as that. The tool reads only the pull request description, takes only the first line that starts with `pay-to:`, and accepts what follows only if it is exactly one address of the recognised kind: `https`, the host Stripe uses for its payment links, and a path of the shape those links have, with nothing after it. The cook confirms the current shapes from Stripe's own documentation and lists them in the doc page; anything not on that list is not recognised.
- Next to each solution, `look` and `status` show one of four facts and nothing else from that line: a recognised payment link was given; a test-mode payment link was given (no real money moves through it); a `pay-to:` line was given that is not a recognised payment link; none was given. Unrecognised text is never echoed.
- **The tool never opens, fetches or follows the link,** at any step, in any mode. A test proves no network call is made with it. So the tool cannot know what amount the link asks for, and says so wherever it shows one.

**Telling the owner whom to pay**

- No command awards anyone. When the tool closes a bounty because a solution was merged, and that bounty's reward is above $0, the closing output carries the message for the owner, whichever command noticed the merge.
- The message is addressed to the agent, ready to relay as it stands:
  - the bounty, by title and identifier, with the address of its issue;
  - the solver, as their GitHub account, and **the address of their pull request**, the one thing worth opening before paying. Both addresses are built by the tool from the repository and the numbers it recorded, never copied from text a stranger wrote;
  - the commit in which the solution was merged;
  - the amount, marked as coming from the owner's setting;
  - the solver's link, on its own line, marked as supplied by the solver, with one sentence to check that the checkout shows that amount and the account name shown there;
  - who last edited the pull request description the link was read from, when that was not the solver.
- If the merged solution gave no recognised link, the message says so as a fact and gives the pull request's address. Nobody is asked anything.
- At $0, or when a bounty is closed with nothing merged, there is no message.
- The message is a statement, not a question. It asks for no approval, reply or confirmation.
- **The agent then treats the matter as settled.** No waiting state, no reminder, no command to record a payment or a refusal.
- **The owner is told twice, in the same session, and that is all:** once when the bounty closes; once more at the end of the agent's work, where the closing output tells the agent to repeat it, and where a host's hook has a slot for the moment an agent is about to finish, the hook shows it there. Nothing is carried to a later session.
- `status` lists, for a closed bounty with a reward, which solution was merged and whom to pay, as a record the owner can read whenever they wish. It is not a reminder.
- The tool's closing comment on the issue states only what is in the record: which solution was merged. It does not say that anyone was or will be paid.
- The tool sends nothing by itself: no email, no message, no comment addressed to the owner.

**Cases that must fail, each a named refusal that changes nothing or an output that says only "not a recognised payment link":** a second address on the line; text after the address; another scheme; a lookalike host; user-info in the address; control or bidirectional characters; a very long line; a line placed in a comment or a file and not in the description; a description edited by someone other than the solver, which is stated and not hidden.

- A stranger's words never reach the hook, `status` or the issue comment from that line.
- Bounties and records written before this wave load; a bounty posted at $0 never carries a pay message.
- The doc page says in plain words what the tool does not do: pay, know whether a payment was made, hold money, or protect a solver from not being paid.

## The real use, in the sandbox, with nobody asked

The owner's instruction for testing: prove the flow, spend nothing, the kitchen is the solver. Since 13 October 2026 it also runs without the owner: in the sandbox repository from K15, which the owner allowed once.

1. With the sandbox's reward set to $1 and a limit above it, one bounty is posted there. Its title and first line say it is a test bounty by the repository's owner, to be solved by the owner's own agents, and that no real money will be paid: real people can read it and must not be misled.
2. Two blind solvers each open a pull request. One carries a `pay-to:` line with the **test-mode** Stripe link the owner made for this on 11 October 2026: `https://buy.stripe.com/test_28E7sLbHrbu70eC5C5afS00`. Use exactly that; it moves no real money and is safe in a public pull request. The other carries hostile text on the line. No agent creates a Stripe account, signs in to one or makes a link. If the link has stopped working, say so in the Result and prove the rest with the fact "a test-mode payment link was given"; do not substitute another and do not stop to ask.
3. A collecting session, new and told nothing, sees the fact next to each solution, merges the one with the link, and passes on the message the tool gives when it closes the bounty. **No agent opens the link, enters any payment detail or completes any checkout.**
4. The Result quotes the message as the agent passed it on, and lists by exact name what is left on GitHub.

What this proves: every step the tool takes around a reward, on real GitHub. What it does not prove: that a real stranger will supply a link, that a real payment completes, or anything about an agent paying by itself. The Result says exactly that. Whether the owner ever opens the test link is the owner's own business and is not part of the wave.

## Review lenses

- [x] **Security:** the `pay-to:` line is the first place a stranger's text sits next to money. The reviewer tries to get a link of its choosing shown as recognised (lookalike hosts, mixed scripts, user-info, redirects written into the path, a second line, encoded characters), to get any text from the line into `status`, the hook or the issue comment, to make the tool fetch the address, to get the pay message to name a solver whose solution was not the merged one, and to get an amount from anywhere but the owner's setting into a message.
- [x] **User experience:** tested with fresh agents, never with the owner. A stranger with only the issue says exactly what line to add and where, and what has and has not been promised. An agent with two solutions waiting and only the tool's output says which gave a usable link, merges one, and says what happens next and who does it. A fresh agent playing an owner, given only the message the first agent passed on, says whom to pay, how much, how they know it is the right person, and what to check before paying. Three runs of the last; sentences word for word.
- [ ] **Measurement fairness:** not applicable.

## Notes for the worker

- Feature playbook. If this wave grows a wallet, a verifier, an escrow or a second payment provider, it has gone wrong.
- The parser for the line is the security boundary. Write it as an allow-list of exact shapes, with the tests first, and reject by default.
- Every output about money is a fact with its source: "from the owner's setting", "supplied by the solver".
- No step asks the owner anything. A step that seems to need the owner is skipped and recorded.
- Report at the timebox. Do not run on.
- Out of scope, each a later decision of the owner's: an agent paying by itself; any provider other than Stripe links; checking that a payment happened; disputes; any bounty site.

---

## Result

- Worker: · Reviewer:
- Commit:
- Verify:
- Verdict: · Level:
- Lenses:
- Stripe link shapes accepted, and where they were confirmed:
- Real use in the sandbox, step by step:
- The pay message as relayed:
- Left on GitHub, by exact name:
- Findings and limits:
- Merged: · Resources removed:
- Reflect:
