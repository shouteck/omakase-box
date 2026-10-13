# BT8: the owner says yes once

Milestone: BT · Station: packaging (also evidence) · Base: master at dispatch · Branch: `wave/BT8` · Timebox: 120 minutes; at expiry the cook stops and reports where it is, whatever state that is

**Rewritten by the CTO on 13 October 2026** from the owner's decisions of 12 and 13 October. It replaces the brief of 11 October, which asked the owner three permission questions and carried a reward field. What changed and why:

- **Posting, merging and closing need no approval once the owner has allowed the tool.** That is what the tool is for, and the tool could not prevent an agent with Git and the GitHub command line from doing either by itself. Asking three questions would show a control the tool does not have.
- **One decision remains, made once: "my agents may use this tool."** Without it an agent could install the tool and post public issues under the owner's account with the owner never knowing; the hard stop "nothing happens outside the authority the owner granted" has to mean something.
- **No money here.** The reward, and who sets it, is BT11.
- **The instruction files for every host moved to [BT8b](BT8b.md)**, so this wave is small enough to review once.

The head chef checks command names against master at dispatch. On master today the bounty commands are `create`, `confirm`, `post`, `status`, `look`, `apply`, `close`, `help`, `describe`.

## Outcome

The owner allows the tool once and is not asked again. From then on an agent posts a bounty, merges a solution and the tool closes the bounty, with nobody asked. An owner who wants to be asked can say so. Because nobody sees a preview any more, what is about to be published for the first time is checked for secrets before it goes out.

## Scope

- Write: `packages/box-bounty/**`, `packages/box-cli/**` (the `bounty` commands), `tests/box/bounty/**`, `docs/box-v4/BOUNTY.md`; `.box/limits.json` in this repository only as the migration below requires. Tests never read or write the real owner settings folder: they point the tool at a temporary one.
- Read for context: PLAN.md ("The three hard stops", "Other rules of the product"); `waves/BT4.md` Result (the limits file); `waves/BT6a.md` Result (exactly what a post publishes); `waves/BT7b.md` and `waves/BT7c.md` Results; `kitchen/stations/packaging.md`.
- Do not touch: the never-ship table; `export`, `submit`, `verify`, `trace`; `.execution/`, `docs/legacy/`.

## Done when

- `node scripts/verify.mjs test:box-bounty test:box-package` exits 0 on the final commit; the suites reach no network.

**The one decision**

- It is kept in the owner's own settings folder on this machine, outside every repository: never committed, never cloned, out of reach of a solution, a pull request or a collaborator. A project file that claims to allow anything grants nothing and is refused by name.
- Two levels, both the owner's: this project, or all the owner's projects. The tool reads the project's first, then the default.
- Three states, never guessed: written **allowed**; written **ask me each time**; **nothing written**. Nothing written is never read as allowed.
- Allowing prints, before anything is written, what it allows, in plain words: bounties are posted publicly under the owner's GitHub account; a solution an agent chooses is merged into the owner's code on the agent's judgement, the tool runs nothing from it but the owner's next build will; the tool closes the issue when it finds a solution merged; and, once rewards exist, money is promised within what the owner sets (BT11). It changes nothing unless the owner's command carries an explicit yes.
- `confirm` is removed. No command an agent runs in the normal journey writes or widens the decision; the commands that do are a separate, plainly named group that the description never offers to an agent.
- Every change to it is recorded with the time, and `status` says when it last changed.
- The doc page says honestly what this is: it stops accidents and makes a change visible. It is not a lock against an agent that sets out to edit a file it can reach.

**First use, when nothing is written**

- The bounty is prepared as usual and stops in a named state. The output is addressed to the agent: the owner has not allowed the tool; this is the owner's to decide; here are the few lines to put to them and the one command they run, for this project or for all their projects, and the command that allows this one bounty only.
- The owner answers once; the waiting bounty goes out; no later bounty asks. `status` shows the waiting state until then. Silence is never a yes and the tool does not nag.
- An owner who allowed the tool beforehand is never asked.

**Allowed: nothing waits**

- `create` then `post` goes out with no question. The record says which answer of the owner's allowed it, with its date and level.
- `apply` merges and the tool closes; a merge the agent made itself is recognised and closed as in BT7b.

**Ask me each time**

- Each post, and each closing the tool is about to do, is a named waiting state for that one action; the owner answers with one command. The agent is not told to propose setup again.
- A merge the agent made itself is stated as a fact; the tool closes nothing until the owner answers.

**Before anything is published unasked**

- The tool scans everything that would be published for the first time (commits not yet pushed, uncommitted changes the agent chose to include, any untracked file it named) for things shaped like secrets: private key blocks, well-known token and key formats, connection strings with a password, and long random strings assigned to names such as key, secret, token or password. A small stated list, given in the doc page with the plain statement that it is not proof of absence.
- It states as facts what is new: how many commits are published for the first time, whether uncommitted changes are included and in how many files, and any untracked file named.
- A hit, or an untracked file named for publishing, makes that one bounty wait for the owner, naming the file and line and never printing the value. The owner allows it once, adds the path to never-ship, or closes the bounty. Nothing else is held up.
- No setting switches the scan off. It is a protection of the owner's, like never-ship, not a judgement on the agent.
- Tests plant each kind of secret in an unpushed commit, an uncommitted change and a named untracked file, and show each stops the post; and show that ordinary code using words like token and key does not.

**The owner can see and stop**

- A summary prints what was done since a given time: bounties posted, solutions merged, bounties closed with none, anything waiting. Facts from the record.
- One command turns the permission off (everything returns to asking, the answer stays on file marked off); one turns it back on.
- `setup` with no arguments prints where things stand and the exact command for each remaining step; with arguments it does one step. It is never interactive.

**Cases that must fail, each a named refusal that changes nothing:** a malformed settings file; a setting the tool does not know (refused, not ignored); posting a private repository with the tool allowed (the hard stop wins); a setting that tries to allow never-ship paths; answering a decision that is not waiting; `confirm`, typed, says what replaced it.

- The three hard stops cannot be expressed as settings or switched off by one. A test tries.
- Records and limits files written before this wave load. A limits file carrying an old destination allowance is reported once, with the command that moves it; it is not treated as a yes.
- This repository's own `.box/limits.json` stays the owner's: the kitchen does not allow itself to post. The journey is proved on a trial repository with a stand-in.

## Review lenses

- [x] **Security:** the reviewer plays an agent that wants the tool allowed when it is not, using only what an agent can do: the normal commands with odd arguments; the owner's commands; editing the file and seeing whether that shows afterwards; a solution carrying a settings file; a junction, a case trick or an environment setting that points the tool at another settings folder; a project file that claims permission; a settings file shaped to confuse. For each: prevented, or permitted but visible, and whether the doc page's claim matches. It also tries to get a planted secret past the scan and to make the scan print one.
- [x] **User experience:** a fresh agent on a repository where the tool is allowed hands off a task from start to posted with nobody asked, and says what it was allowed to do and how it knew. A fresh agent where nothing is written reaches the waiting state and says what it waits for and who decides; the reviewer, as the owner with only that output, allows the tool with one command and says in their own words what they have just allowed.
- [ ] **Measurement fairness:** not applicable.

## Notes for the worker

- Feature playbook. Write the table first: which actions exist, which the owner's yes covers, which no setting can allow.
- The owner's yes is a fact the owner stated. The tool never infers it and never widens it.
- Report at the timebox. Do not run on.
- Not in this wave: any reward, budget or price (BT11); the instruction files (BT8b); the hook (BT9); a key or signature scheme for the settings.

---

## Result

- Worker: · Reviewer:
- Commit:
- Verify:
- Verdict: · Level:
- Lenses:
- How strong "only the owner allows the tool" is:
- Findings and limits:
- Merged: · Resources removed:
- Reflect:
