# BT11c: the reward belongs to a repository, and is part of saying yes

Milestone: BT · Station: packaging (also evidence) · Base: master at dispatch · Branch: `wave/BT11c` · Timebox: 120 minutes; at expiry the cook stops and reports where it is, whatever state that is

**Pre-brief.** Written by the CTO on 14 October 2026. The owner's decision of that day: the reward should be per repository, and setting it should be part of the tool's simple, intuitive setup. The head chef checks names against master at dispatch.

## What is true today

BT11a made the reward one setting for everything: `config set reward <n>` and `config set reward-limit <n>` apply to every repository the owner has allowed. The limit already counts each repository's open bounties separately, but its value is shared. On 14 October a demo run in the sandbox left a $5 reward in force for the owner's working repository as well, which nobody intended. Permission is already per repository; money is not.

## Outcome

Each repository on the owner's list carries its own reward and its own limit, $0 unless the owner said otherwise for that repository. The owner sets them in the same breath as allowing the repository, with one command and no new one to learn. A reward set for one repository never reaches another.

## Scope

- Write: `packages/box-bounty/**`, `packages/box-cli/**` (the `bounty` commands), `tests/box/bounty/**`, `docs/box-v4/BOUNTY.md`.
- Read for context: the Results of `waves/BT8a.md` (`allow`, `deny`, `config`, the repository list, the first-use message), `waves/BT11a.md` (the reward, the limit, the format's version) and `waves/BT11b.md` (the pay message); PLAN.md "Other rules of the product"; `kitchen/stations/packaging.md`.
- Do not touch: the public format (a bounty still states one amount; where the owner keeps it is not the format's business); the payment link and pay message beyond where they read the amount; the never-ship table; `.execution/`, `docs/legacy/`.

## Done when

- `node scripts/verify.mjs test:box-bounty test:box-package` exits 0 on the final commit; the suites reach no network. The K14 start budgets are re-measured and stated.

**One reward and one limit per repository**

- Each entry in the owner's list of repositories holds: allowed or ask-me-each-time, the reward each bounty there states, and the most that may be promised across that repository's open bounties. A repository with no reward written states $0.
- A bounty states the reward of the repository it is posted to, in force at posting, and keeps it. The limit that applies is that repository's.
- Changing one repository's reward or limit changes nothing for any other. A test sets a reward on one, posts on another, and reads $0.
- The rules BT11a gave still hold, per repository: whole US dollars at or above 0; a reward above 0 needs a limit; a limit below the reward is refused; a post that would pass the limit is a named refusal that says both numbers; the agent is asked nothing about money and can pass no amount to any command; a reward or limit claimed from inside the project is refused by name.

**Part of saying yes**

- `allow` takes the reward and the limit as options: allowing a repository and stating what its bounties promise is one command. With neither, the repository is allowed at $0, exactly as today.
- What `allow` prints before it writes names the repository and the reward together, in the same plain sentences as the three facts: bounties are public under the owner's account; a solution the agent chooses is merged; this repository only; and each bounty promises this amount, paid by the owner by hand.
- The first-use message tells the agent the same: what the owner is deciding for this repository, including that the reward is $0 unless the owner names one, with the one command written out both ways (at $0, and with an amount and its limit).
- Changing it later is `config set reward <n>` and `config set reward-limit <n>`, for the repository the command is run in, or for one named with the same option `allow` and `deny` already take. No command is added.
- **Bare `config` shows the list as a small table,** one line per repository: its address, allowed or ask, its reward, its limit, what its open bounties promise now and what is left; under it, the commands that change each. It is still complete and still written for an agent to act on.
- `status` in a repository shows that repository's reward and limit and nothing about any other.

**The setting written before this wave**

- A reward and limit written by BT11a for everything are **not applied to any repository**. The owner did not choose them per repository, and one of them was written by a demo. On the first command after this wave the tool says once, as a fact: what the old setting was, that every repository now states $0 until the owner sets its own, and the command that sets it. Open bounties keep the amount they were posted with.
- The all-projects extra never carries a reward above 0. A repository allowed only through it states $0; money is promised only for a repository the owner named.
- Settings and records written before this wave load.

**Cases that must fail, each a named refusal that changes nothing:** a reward above 0 with no limit for that repository; a reward or limit for a repository not on the list; `allow` with an amount that is not a whole number at or above 0; an amount passed to `create` or `post`; a reward claimed from a project file; setting a reward on the all-projects extra.

## Review lenses

- [x] **Security:** the reviewer tries to make one repository's reward or limit apply to another (the same folder holding a different repository, a fork, a renamed remote, a second remote, an address differing in letter case), to make the old shared setting apply to anything, to get an amount into a bounty from anywhere but the owner's entry for that repository, and to post past a repository's limit by posting from another. For each: prevented, or permitted but visible.
- [x] **User experience:** tested with fresh agents, never with the owner. The two-agent check: one agent relays the first-use message; a second that has never seen the tool writes down what it is agreeing to; a check looks for public, merged, this repository only, and what each bounty promises. Five runs, sentences word for word. Then an agent given only bare `config` and an owner's plain requests ("make bounties here pay ten dollars, twenty at most", "stop paying on the shop repository", "allow the docs repository, no reward") runs the right command first time for each.
- [ ] **Measurement fairness:** not applicable.

## Notes for the worker

- Refactoring playbook: BT11a's rules are reviewed and right; this wave moves where the numbers live. Migrate the readers, then remove the shared setting.
- A new setting never adds a command (owner, 13 October 2026). The reward is an option of `allow` and a line in `config`.
- Count the words an owner has to read at first use before and after. If it grew, cut it.
- The demo in `kitchen/demo/` sets the reward the old way; it is K17's to change, after this wave.
- Report at the timebox. Do not run on.
- Not in this wave: an agent pricing bounties (in the backlog); different rewards for different bounties in one repository; anything about how the owner pays.

---

## Result

- Worker: · Reviewer:
- Commit:
- Verify:
- Verdict: · Level:
- Lenses:
- Two-agent runs (count, sentences):
- Words at first use, before and after:
- Findings and limits:
- Merged: · Resources removed:
- Reflect:
