# BT8: standing rules, the owner hands over once

Milestone: BT · Station: packaging (also evidence) · Base: master at the time this cooks, after BT7 is merged · Branch: `wave/BT8` · Timebox: 180 minutes; at expiry, report partial findings and stop

**Pre-brief.** Written by the CTO on 11 October 2026, before BT6's second run. The outcome and the acceptance are settled with the owner. Command names, field names and file paths below follow the design discussion; the head chef revises this file against the Results of BT6 and BT7 before dispatching, and says in the pre-cook card what changed.

## Outcome

The owner sets the tool up once and is not asked again. Their standing rules say what the agent may do; inside them the agent runs the whole journey with nobody asked; outside them the agent asks, and the owner's answer can become a rule. Only the owner can write the rules: an agent cannot grant itself authority.

This replaces the yes for each bounty, and closes the known gap that the yes is a command an agent could run itself.

## Scope

- Write: `packages/box-bounty/**`, `packages/box-cli/**` (the `bounty` commands), `tests/box/bounty/**`, `docs/box-v4/BOUNTY.md`; `.box/limits.json` in this repository only as the migration below requires.
- Read for context: `PLAN.md` ("The design rule", "What is settled", "The three hard stops"); `waves/BT4.md` Result (the limits file as built); `waves/BT2.md` Result (confirm and the stages); `waves/BT6.md` and `waves/BT7.md` Results; `kitchen/stations/packaging.md`.
- Do not touch: the never-ship table, the snapshot identifier, the manifest binding, the merge boundary. `export`, `submit`, `verify`, `trace`. `.execution/`, `docs/legacy/`.

## Done when

- `node scripts/verify.mjs test:box-bounty test:box-package` exits 0 on the final commit.

**The rules**

- One file the owner writes holds the standing rules, growing from today's limits file. It says, in plain fields: whether bounties may be posted to GitHub without asking; whether a chosen solution may be merged without asking (today it may; the field exists so an owner can say no); and **the reward each bounty states**. That last field is the owner's pricing rule, set once so nobody is asked for an amount per bounty. No payment is implemented (owner, 11 October 2026), so today the only value it accepts is 0, and 0 is its default; any other amount is a named refusal that says payment is not implemented and changes nothing. There is no ceiling or budget field, because nothing can be spent. Existing limits files keep working unchanged and mean what they meant.
- **With no rules written, nothing gets looser.** The default is today's behaviour: each post waits for the owner.
- `rules` (or the name BT6 and BT7 leave room for) prints the rules in force, in a few lines, as facts, with the file they came from. An agent can read at any time what it is allowed to do.

**Inside the rules, nothing waits**

- When the rules allow posting, `create` then `post` goes out with no confirm step and no question, stating the reward the rules give ($0). The preview is still produced and kept in the record, so what went out can be read afterwards.
- The record states, for every action taken under a rule, which rule allowed it.

**Outside the rules, the agent asks, once**

- An action the rules do not allow is a named state, not a failure: it says what is not allowed, which rule would allow it, and that the owner decides. The bounty waits there and everything else carries on.
- `status` and the open-bounties line show that a decision is waiting for the owner, so the owner and any later agent see it.
- The owner answers with one command that allows this one action. The same command with one more word saves the answer as a rule, and prints the exact line it wrote to the rules file.

**Only the owner writes the rules**

- This is the part the pass attacks hardest, and the worker must say honestly how strong it is. The tool and the agent run as the same user on the same machine, so a file permission alone proves little. The floor that must hold:
  - No `box bounty` command that an agent runs in the normal journey writes or widens the rules. The commands that do are a separate, clearly named group the description never offers to the agent.
  - Every change to the rules is recorded with the time and what changed, and `status` shows when the rules last changed, so a change nobody approved is visible.
  - The rules file is on the never-ship list (it already is, under `.box`), so a solution cannot change it; a test proves a solution that tries is refused.
  - The doc page states plainly what this does and does not prevent: it stops accidents and makes tampering visible; it is not a lock against an agent that sets out to edit a file it can reach.
- If the worker finds a stronger, simple guarantee on this host (for example the owner's approval living somewhere the agent's session cannot write), propose it in the Result; do not build a key or signature scheme inside this wave.

**The owner can see and stop**

- `summary` (or equivalent) prints what was done under the rules since a given time: bounties posted, solutions merged, anything undone, anything waiting. Facts from the record, nothing else.
- One command withdraws the authority: the rules stay on file, marked off, and everything returns to asking. A second turns it back on.

**Setup in one sitting**

- `setup` walks the owner through it without being interactive in a way that blocks agents: run with no arguments it prints the current state and the exact commands for each remaining step (sign in to GitHub, write the rules, the hook once BT9 exists); run with arguments it does one step. It says what each choice will let the agent do, as a fact.

**Everything else**

- **Cases that must fail, each a named refusal that changes nothing:** a rules file that is malformed; a rule naming something the tool does not know (refused, not ignored, so a typo cannot silently widen or narrow authority); a post allowed by the rules on a private repository (the hard stop wins; no rule overrides it); a rule that tries to allow never-ship paths (same); answering a decision that is not waiting.
- The three hard stops are not expressible as rules and cannot be switched off by one. A test tries.
- Records and limits files written before this wave load.
- This repository's own `.box/limits.json` is left as the owner's: the kitchen does not grant itself posting authority. If the wave needs a rules file to prove the journey, it uses a trial repository of its own.
- The description shown to agents says in one line that the owner's rules decide what happens without asking and where to read them. It does not get longer than it is.
- Works on this Windows host from Git Bash and PowerShell, and on the off-machine runner.

## Review lenses

- [x] **Security:** the reviewer plays an agent that wants more authority than it was given, using only what an agent can do. It tries: the normal commands with odd arguments; the owner's commands; editing the file directly and seeing whether that is visible afterwards; a solution that carries a rules file; a junction or case trick on the rules path; a rules file that is valid JSON but shaped to confuse (duplicate keys, huge numbers, unknown fields). For each it reports whether the action was prevented, or permitted but visible, and whether the doc page's claim matches.
- [x] **User experience:** two readers. A fresh agent on a repository whose rules allow posting hands off a task from start to posted with nobody asked, and says what it was allowed to do and how it knew. A fresh agent on a repository with no rules reaches the waiting state and says what it is waiting for and who decides. Separately, the reviewer acts as an owner with only the `setup` output and gets from nothing to rules in force.
- [ ] **Measurement fairness:** not applicable.

## Notes for the worker

- Feature playbook. Model the authority first: what actions exist, which are always the agent's, which need a rule, which no rule can allow. Write that table in the doc page before the code.
- A rule is a fact the owner stated. The tool never infers, widens or suggests one, and never suggests an amount.
- Keep the field set small. Every field is something an owner must understand to hand over safely; if a field needs a paragraph to explain, it is the wrong field.
- The reward field is the only field about money and accepts only 0. `create` takes the amount a bounty states from it, never from the agent, and the listing shows it. Do not add a ceiling, a budget or any payment behaviour.
- Out of scope, each a later wave: the hook (BT9); the open format (BT10); any reward or payment, which no wave implements; any cryptographic proof of who wrote the rules.
- Nothing in this wave happens overnight if it would post outside; the trial repository's posts go to a local folder or a stand-in.
- Everything the wave creates in the temp folder is named for the wave and removed at close.

---

## Result

- Worker: · Reviewer:
- Commit:
- Verify:
- Verdict: · Level:
- Lenses:
- How strong "only the owner writes the rules" is:
- Findings and limits:
- Merged: · Resources removed:
- Reflect:
