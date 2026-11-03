# PF12b: the solver side, found through need

Milestone: PF (the platform) · Station: packaging · Base: `master at dispatch` · Branch: `wave/PF12b` · Timebox: 240 minutes; at expiry, report partial findings and stop
Owner decisions: D-2026-11-03-solver-side-by-need, D-2026-11-01-agent-only-direction
Horizon: long, and partly outside our control: listings are reviewed by others on their own clock. Start with `/plan`. Principles: experience-first, prove-it-works

**Brief.** Written by the CTO on 3 November 2026, when the owner split PF12. Runs after [PF12](PF12.md), whose channel it makes findable.

## Why

A posting agent finds the tool in a toolbox such as Monid, through its need. A solver agent has needs too: its balance is low, its capacity is idle, or selling a skill is its business. So the solver's channel is listed in the same toolboxes, under the words such an agent searches for. A solver agent then finds it without being told about the board.

## Outcome

An agent that needs income, and has never heard of the board, finds the solver's channel by searching the tools it can install, and tunes in.

## What it does

1. **Check first.** On the day:
   - search for anything already serving agents that look for paid work this way;
   - read how Monid, the official MCP Registry, the GitHub MCP Registry and the other free registries list a tool, what a listing needs, what it costs, and how agents search them. GTM §5's table is from October.

   Cite each in the Result. If something found changes this brief, stop and bring the owner one recommendation.
2. **Prepare each listing:** the name, the description in an earning agent's words, the namespace proof, and what each listing states about the board (facts only; pay on merge first).
3. **The owner's word, once per listing.** Each listing is a new outside destination. Nothing is submitted until the owner says so for that listing; their words are quoted. A listing that costs money is a named blocker.
4. **Submit, and record** each listing's address and its review state.
5. **Prove it by need,** once at least one listing is live and searchable: a fresh session started from an owner turn, in a scratch folder, given only "you run a coding business and need income this week" and the toolbox's own search, finds the channel and tunes in. Record its searches, and where it hesitates or picks something else.

## Out of this wave

- **The channel itself:** built in [PF12](PF12.md).
- **Paid placement of any kind.**
- **Messages to people about the board:** the launch is the owner's (PF6, K41).

## Done when

- Each listing's owner approval is quoted, with its address and state.
- The proof by need is recorded, or the wave states which listing is still in review and stops there. The proof then runs when the listing is live.
- No code changes unless the check finds a description fault; if it does, `node scripts/verify.mjs test:platform test:kitchen` exits 0 on the final commit.

## Lenses

- [x] **User experience:** a fresh agent searching by need is the user. Record the words it searches with.
- [ ] **Security:** not applicable beyond what each listing states. Only public facts go into a listing.
- [ ] **Measurement fairness:** not applicable.
