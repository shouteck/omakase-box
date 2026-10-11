# BT8: standing rules, the owner hands over once

Milestone: BT · Station: packaging (also evidence) · Base: master at the time this cooks, after BT7 is merged · Branch: `wave/BT8` · Timebox: 180 minutes; at expiry, report partial findings and stop

**Pre-brief.** Written by the CTO on 11 October 2026, before BT6's second run. The outcome and the acceptance are settled with the owner. Command names, field names and file paths below follow the design discussion; the head chef revises this file against the Results of BT6 and BT7 before dispatching, and says in the pre-cook card what changed.

## Outcome

The owner sets the tool up once and is not asked again. Their standing rules say what the agent may do; inside them the agent runs the whole journey with nobody asked; outside them the agent asks, and the owner's answer can become a rule. Only the owner can write the rules: an agent cannot grant itself authority.

This replaces the yes for each bounty, and closes the known gap that the yes is a command an agent could run itself.

## Scope

- Write: `packages/box-bounty/**`, `packages/box-cli/**` (the `bounty` commands), `tests/box/bounty/**`, `docs/box-v4/BOUNTY.md`; `.box/limits.json` in this repository only as the migration below requires. Tests never read or write the real owner settings folder: they point the tool at a temporary one.
- Read for context: `PLAN.md` ("The design rule", "What is settled", "The three hard stops"); `waves/BT4.md` Result (the limits file as built); `waves/BT2.md` Result (confirm and the stages); `waves/BT6.md` and `waves/BT7.md` Results; `kitchen/stations/packaging.md`.
- Do not touch: the never-ship table, the snapshot identifier, the manifest binding, the merge boundary. `export`, `submit`, `verify`, `trace`. `.execution/`, `docs/legacy/`.

## Done when

- `node scripts/verify.mjs test:box-bounty test:box-package` exits 0 on the final commit.

**The rules**

- **Where the rules live: in the owner's own settings, outside the project.** This is the standard split that agent hosts use for their own permissions: what is shared with the project stays in the project; what one person allows their agent to do is personal and stays with that person. So:
  - **Authority** (may post without asking, may merge without asking, the reward each bounty states) is kept in the owner's settings folder on this machine, outside every repository. It is never committed, never cloned, and cannot be changed by a collaborator or a pull request.
  - **Shared, harmless facts** stay in the project where BT4 put them: the lines that tell an agent the tool exists, the cost and wait lines, whether reminders are on. Nothing in the project file can grant authority; an authority field found there is refused by name and grants nothing.
  - Because hosts normally let an agent write only inside its working folder, rules kept outside it are out of the agent's reach by default. Say in the Result how far that holds on the hosts that cook here.
- **Two levels, both the owner's.** A rule for this project, and a default for all the owner's projects. The tool checks in this order: the rule for this project; otherwise the owner's default; otherwise nothing is set.
- **Three states, never guessed.** The tool ships with no rules and writes none until the owner answers, so what it finds is always one of:
  - a written **allowed**: the agent goes ahead with no question;
  - a written **ask me each time**: the agent asks for a yes on this bounty only and does not propose setup again;
  - **nothing written** at either level: the owner has never decided, and the agent asks them to set the rules up.
  A missing entry is never read as allowed. Only a written "allowed" is.
- **Each rule carries when it was set and at which level.** When the agent goes ahead under a rule, the tool says which: for example, allowed by the owner's default for all projects, set on a given date. An owner surprised by an action can see exactly which answer of theirs caused it.
- The fields: whether bounties may be posted to GitHub without asking; whether a chosen solution may be merged without asking; and **the reward each bounty states**. That last field is the owner's pricing rule, set once so nobody is asked for an amount per bounty. No payment is implemented (owner, 11 October 2026), so today the only value it accepts is 0; any other amount is a named refusal that says payment is not implemented and changes nothing. There is no ceiling or budget field, because nothing can be spent.
- Existing project limits files keep working for what they still hold. If one carries a destination allowance from before this wave, the tool says once, as a fact, that authority now lives in the owner's settings and gives the command that moves it; it does not move it silently and does not treat it as a grant.
- **With no rules written, nothing gets looser,** and the first use is where the owner is asked (next section).
- `rules` (or the name BT6 and BT7 leave room for) prints the rules in force, in a few lines, as facts, with the file they came from. An agent can read at any time what it is allowed to do.

**Two ways in: the owner sets the rules up beforehand, or the agent asks them to at first use**

- An owner who has already set the rules up (with `setup`, below) is never asked: the agent's first bounty simply goes ahead under them.
- Otherwise the agent that wants to use the tool is the one who asks. The tool's output is addressed to the agent: it says the rules are not set up, that this is the owner's to decide, and gives the agent the few lines to put to the owner and the command the owner runs.
- The owner does not have to know the tool exists beforehand. When an agent first tries to hand work off in a project that has no standing rules, the bounty is prepared as usual and then stops in a named state: the rules have not been set up, and the owner decides.
- That state shows the owner, in a few plain lines, exactly what they are being asked to set and what each choice lets the agent do from then on: whether bounties may be posted to GitHub without asking; whether a chosen solution may be merged without asking; the reward each bounty states ($0 is the only amount available). It gives the command that sets them for this project, the same command for all the owner's projects, each written out with those values, and the command that allows only this one bounty and decides nothing else.
- The agent may propose values (that is its line of why, and the facts of the bounty in front of the owner); it cannot set them. The tool states no preference among the choices.
- The owner answers once. The rules are written, the waiting bounty goes ahead under them, and no later bounty asks again. `status` and the open-bounties line show the waiting state until then, so the owner or any later agent sees it.
- If the owner answers only for the one bounty, the next first-use asks again; the tool does not nag in between and does not treat silence as a yes.
- A test runs it from nothing: a project with no rules, an agent's first bounty, the waiting state, the owner's one answer, the bounty posted, and a second bounty that goes out with nobody asked. A second test sets only a default for all projects and shows a brand-new project posting with nobody asked; a third sets "ask me each time" and shows the agent asking for a yes without proposing setup.

**What is about to be published is checked before it goes out with nobody asked**

Once posting needs no yes, no person sees the preview. From BT6a a bounty publishes only what is not already public: commits not yet pushed, uncommitted changes the agent chose to include, and any untracked file it named. The scan and the facts below apply to exactly that list. (Before BT6a a bounty shipped the whole working state.) The never-ship list works on file names and does not look inside files. So, before a bounty is posted under a rule:

- The tool scans the content of what would be shipped for things shaped like secrets: private key blocks, well-known token and key formats, connection strings with a password in them, and long high-randomness strings assigned to names like key, secret, token or password. Use a small, stated list of patterns; say in the doc page what is looked for and that it is not proof of absence.
- It states as facts how many files being shipped are untracked, and how many differ from the last commit, with their names kept in the record.
- A hit on the scan, or an untracked file being shipped, makes **that one bounty** wait for the owner, in the same waiting state as anything outside the rules, saying exactly which file and line triggered it (never printing the suspect value itself). The owner allows it once, adds the path to their never-ship list, or withdraws the bounty. Nothing else is held up.
- An owner who wants untracked files shipped without asking can say so in their rules, as its own explicit field; there is no rule that switches the secret scan off.
- This is a protection of the owner's, like never-ship, not a judgement on the agent. It runs on every post, including ones the owner confirms by hand, where it is shown as facts in the preview.
- Tests plant each kind of secret in a tracked file, an uncommitted change and an untracked file, and show each one stops the post; and show that ordinary code with words like token and key in it does not.

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
  - The rules are outside the repository, so no solution, pull request or collaborator can change them; a test proves a solution or a commit that adds an authority field to the project file grants nothing.
  - The doc page states plainly what this does and does not prevent: it stops accidents and makes tampering visible; it is not a lock against an agent that sets out to edit a file it can reach.
- Keeping the rules outside the project is the stronger, simple guarantee this wave builds. Do not add a key or signature scheme on top of it.

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

- [x] **Security:** the reviewer plays an agent that wants more authority than it was given, using only what an agent can do. It tries: the normal commands with odd arguments; the owner's commands; editing the file directly and seeing whether that is visible afterwards; a solution that carries a rules file; a junction or case trick on the rules path, or an environment setting that points the tool at a different settings folder; a project file that claims authority; a rules file that is valid JSON but shaped to confuse (duplicate keys, huge numbers, unknown fields). For each it reports whether the action was prevented, or permitted but visible, and whether the doc page's claim matches.
- [x] **User experience:** two readers. A fresh agent on a repository whose rules allow posting hands off a task from start to posted with nobody asked, and says what it was allowed to do and how it knew. A fresh agent on a repository with no rules reaches the first-use waiting state and says what it is waiting for and who decides; the reviewer, as the owner with only that state's output in front of them, sets the rules with one command and says what they have just allowed. Separately, the reviewer acts as an owner with only the `setup` output and gets from nothing to rules in force.
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
