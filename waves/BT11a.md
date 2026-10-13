# BT11a: a bounty states the owner's reward

Milestone: BT · Station: packaging (also evidence) · Base: master at dispatch · Branch: `wave/BT11a` · Timebox: 120 minutes; at expiry the cook stops and reports where it is, whatever state that is

**Written by the CTO on 13 October 2026**, the first half of the old BT11, rewritten clean against the tool as it stands after BT10. The decisions are the owner's (11 to 13 October 2026). The second half, the solver's payment link, is [BT11b](BT11b.md). The head chef checks names against master at dispatch.

## What is true today

Every bounty states $0. The public format's version 1 accepts no other amount. The owner's settings hold their allowed repositories and two lists, shown and changed through `config`; nothing about money.

## Outcome

The owner states one reward and every bounty carries it, in the listing a person reads and in the block a program reads. The agent is asked nothing about money. What is promised at any moment cannot pass a limit the owner set.

## Scope

- Write: `packages/box-bounty/**`, `packages/box-cli/**` (the `bounty` commands), `tests/box/bounty/**`, `docs/box-v4/BOUNTY.md`, `docs/box-v4/BOUNTY-FORMAT.md`.
- Read for context: PLAN.md ("The three hard stops", "Other rules of the product"); the Results of `waves/BT8a.md` (`config`, `allow`, the first-use message) and `waves/BT10.md` (the block, the format page, the outside reader); `kitchen/stations/packaging.md`.
- Do not touch: anything about a payment link or who is paid (BT11b); the never-ship table; `.execution/`, `docs/legacy/`.

## Done when

- `node scripts/verify.mjs test:box-bounty test:box-package` exits 0 on the final commit; the suites reach no network. The K14 start budgets are re-measured and stated.

**The reward**

- One setting in the owner's `config`: the reward each bounty states, in US dollars as a whole number, 0 by default. No command is added. Bare `config` shows it with the command that changes it.
- Every bounty posted carries the amount in force at posting, in the listing and in the block. A bounty keeps the amount it was posted with; changing the setting changes later bounties only, and the tool says so when it changes while bounties are open.
- **The agent is asked nothing about money.** No command, flag or file lets an agent choose, change or raise an amount, for one bounty or for all. A reward claimed from inside the project is refused by name and grants nothing.
- The tool states no preference about amounts and suggests none.

**The limit on what is promised at once**

- A second setting: the most that may be promised across open bounties. The tool refuses to accept a reward above 0 without it, and says why.
- A post that would pass the limit is a named refusal that says both numbers and changes nothing.
- The limit counts open bounties only: when a bounty closes, merged or not, its amount no longer counts. The tool keeps no record of what was paid and has no command for it.
- `status` and bare `config` show the reward, the limit, what open bounties promise and what is left.

**Asked as part of the one decision**

- The first-use message and `allow` state the reward each bounty will carry and how to set it. Leaving it at $0 is a valid answer and needs no number. An owner who names an amount above 0 is asked for the limit in the same breath.
- An owner who allowed the tool before this wave is not interrupted: their bounties keep stating $0, and the tool says once, as a fact, that a reward can now be set and gives the command. No bounty is held to ask.
- The first time the owner states any amount above 0, the tool says once, in plain words, what that is: a promise, made in the owner's name, that the owner pays by hand. The fourth fact joins the three the agent is asked to pass on at first use: what each bounty promises to pay.

**The public format**

- The block's `reward` field carries the amount. The format's version changes, the page says what changed, and a version 1 block still reads. The outside reader that uses none of our code reads both. `terms` is unchanged: the merged solution earns all of it.
- The listing a person reads states the reward plainly and, above $0, that payment is the poster's to make by hand and that posting a solution does not guarantee it. A test pins the wording: no sentence promises payment, timing or selection.
- `describe` gains the money side of when a bounty is worth it, in a sentence or two, generated from the setting.

**Cases that must fail, each a named refusal that changes nothing:** an amount that is not a whole number of dollars at or above 0; a reward above 0 with no limit; a limit below the reward; a post that would pass the limit; a reward or limit claimed from a project file; any attempt to pass an amount to `create` or `post`.

- Bounties, records and settings written before this wave load and read as $0.
- The three hard stops are unchanged by a reward.

## Review lenses

- [x] **Security:** the reviewer plays an agent that wants a bounty to state more than the owner set, or to post past the limit: odd arguments, a project file, an edited record, a solution that carries a settings file, a block edited on GitHub, two posts racing the limit. For each: prevented, or permitted but visible. It checks the block and the listing can never disagree about the amount.
- [x] **User experience:** tested with fresh agents, never with the owner. The two-agent check from K15: one agent relays the first-use message for a repository whose owner is about to set a reward; a second, who has never seen the tool, writes down what it is agreeing to; a check looks for public, merged, this repository only, and what each bounty promises. Five runs, sentences word for word. Then a stranger with only a posted issue says what the reward is and what has and has not been promised.
- [ ] **Measurement fairness:** not applicable.

## Notes for the worker

- Feature playbook. Small on purpose: two settings, one field, one refusal.
- A new setting never adds a command (owner, 13 October 2026). It goes in `config`.
- Left out on purpose and in BACKLOG.md: an agent pricing each bounty within a budget, and raising a posted reward. The owner judged it too early.
- No real-GitHub step here; BT11b has the real run, in the sandbox.
- Report at the timebox. Do not run on.

---

## Result

- Worker: · Reviewer:
- Commit:
- Verify:
- Verdict: · Level:
- Lenses:
- Two-agent runs (count, sentences):
- Findings and limits:
- Merged: · Resources removed:
- Reflect:
