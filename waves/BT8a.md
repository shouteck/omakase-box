# BT8a: the owner's settings as the owner decided them

Milestone: BT · Station: packaging (also evidence) · Base: master at dispatch, after BT8 · Branch: `wave/BT8a` · Timebox: 150 minutes; at expiry the cook stops and reports where it is, whatever state that is

**Pre-brief.** Written by the CTO on 13 October 2026 from decisions the owner made in conversation while BT8 was cooking. This wave reshapes what BT8 built on the owner's side as well as correcting it, so it is a refactoring of fresh code and its timebox is 150 minutes, not 120. BT8 was briefed before them and was not interrupted. **At dispatch the head chef reads BT8's Result first, strikes from this brief whatever BT8 already does, and corrects command names** (BT8's cook was building an `owner` command group; this brief says "the owner's commands" and "the setup view" for whatever BT8 named them).

## Outcome

The owner's side of the tool is as small and as safe by default as the owner asked for: a yes covers one repository; being asked means being asked before publishing and nothing else; and the owner's part in the secret scan is two lists set beforehand, with every hit reaching the owner and no approval command in front of an agent.

## Scope

- Write: `packages/box-bounty/**`, `packages/box-cli/**` (the `bounty` commands), `tests/box/bounty/**`, `docs/box-v4/BOUNTY.md`. Tests never read or write the real owner settings folder.
- Read for context: `waves/BT8.md` in full, brief and Result; PLAN.md ("The three hard stops", "Other rules of the product"); `kitchen/stations/packaging.md`.
- Do not touch: the never-ship table's built-in entries; the scan's patterns, except where a test of this wave shows one is wrong; `export`, `submit`, `verify`, `trace`; `.execution/`, `docs/legacy/`.

## Done when

- `node scripts/verify.mjs test:box-bounty test:box-package` exits 0 on the final commit; the suites reach no network.

**The owner's side is three words (owner, 13 October 2026)**

The owner does not want to be handed a pile of commands. Most owners will not type these at all: they will tell their agent "allow bounties on this repository" and the agent will run it. So the surface is small, and one command says everything that can be set. It follows tools people already know: `direnv allow` and `direnv deny` for trust; `git config`, `npm config` and `gh config` for everything else; a status command for where things stand.

| Command | What it does |
|---|---|
| `allow [repository]` | Adds a repository to the owner's list; with no name, the one it is run in. Prints what that allows before writing. One option makes the entry "ask me each time". |
| `deny [repository]` | Takes a repository off the list. |
| `config` | Bare: prints everything that is set and can be set, each with its current value and the exact command that changes it. With `set`, `add` or `remove`: changes one thing. |
| `status` | Exists already and is shared with agents. Shows what is waiting for the owner, and with an option what was done since a given time. |

- **Nothing else is the owner's.** BT8's `owner` group, its setup view, and separate commands for asking, switching off and on, listing, removing and summarising are folded into these. Each folded command, typed, is a named refusal that says what replaced it; none is kept as an alias.
- **`config` holds every setting, and a new setting adds no command:** the never-publish and safe-to-publish lists here; whether the yes extends to all the owner's projects, off by default; the reward and the limit when BT11 adds them.
- **Bare `config` is written for an agent to act on.** It is complete (every setting, including ones not set), each line carries the command that changes it, and it says in one line what the owner has not decided yet. An agent asked by its owner to change something needs nothing but this output. A test gives a fresh agent only the bare output and one instruction from the owner for each setting, and checks the command it runs.
- Switching off is `deny`; switching back on is `allow`. The dated history of changes stays, so what was there before is still visible.
- The words "the setup view" and "the owner's commands" elsewhere in this brief mean bare `config` and these three.
- The head chef settles the exact spelling against BT8's Result at dispatch; the count does not grow.

**A list of allowed repositories (owner, 13 October 2026)**

- The owner's yes is a list of repositories, and the owner can manage it as one: add the repository they are in; add a repository by naming it, without being inside it; show the list, with when each was added and whether it is allowed or "ask me each time"; remove one. First use's "allow this repository" adds it to the list.
- **A repository is named by its GitHub address** (owner and name), not by its folder. The yes is about bounties being posted publicly to that repository under the owner's account, so that is what is listed. Every copy of the repository on this machine is covered; a different repository at the same folder path is not; a fork is a different repository. The cook may argue for another identity in the Result only by showing this one fails a case below.
- A repository with no GitHub address cannot be listed, and the refusal says so by name. An entry written by BT8 under a folder path is read once, moved to the address of the repository at that path if there is exactly one and it can be read, and otherwise reported with the command that re-adds it; it is never silently kept as a yes for whatever sits at that path.
- Removing a repository from the list returns it to "nothing written"; bounties already open are untouched and `status` says the repository is no longer allowed.

**One repository at a time by default**

- The plain allow covers this repository and nothing else.
- All the owner's projects is an explicit extra: its own word on the command, described in the setup view and the doc page, and **not offered in the first-use message**. Offered side by side, people pick the wider one to avoid being asked again, and a wide yes covers repositories that do not exist yet.
- When an action goes ahead under the all-projects answer, the output says so in those words.
- **What counts as "this repository" is stated in the doc page and tested:** the cases above, plus a remote renamed after the yes, two remotes pointing at different repositories, and an address differing only in letter case or a trailing `.git`.

**The two doors show one decision**

- The first-use message and the setup view use the same words for the choices they share, and the first-use message says it is the same decision the setup view offers.
- First use offers, in this order: allow this repository; be asked each time; this one bounty only. The setup view offers the first two and the all-projects extra; it does not offer "this one bounty" when nothing is waiting.
- An owner who chose "this one bounty" before is told so the next time, in one line, not shown the first-use text as if new.

**What the yes means has to reach the owner (owner, 13 October 2026)**

The owner's understanding of what they agree to comes through their agent's own words. The tool supplies the words; it cannot make an agent repeat them. This is the largest risk in the first-time setup, so it is tested and the wording is shaped by the test.

- The first-use message gives the agent what to tell the owner in three short facts that survive paraphrase: bounties are **public**, under the owner's GitHub account; a solution the agent chooses is **merged** into the owner's code; and it is **this repository** only. From BT11 a fourth: what each bounty promises to pay.
- **The relay is measured.** In the trial below, the reviewer plays an owner who sees only what the agent says in the conversation, never the tool's output, and then writes down what they believe they agreed to. Three runs with fresh agents. If "public", "merged" or "this repository" is missing from what the owner understood in any run, the message is made shorter and blunter and the runs are repeated. The Result gives each run's relayed sentence word for word.
- **The first merge of a stranger's solution in a repository is said to the owner once.** The output of that `apply`, or of the command that recognises that merge, tells the agent to say in its closing message that a solution written by someone outside was merged into the owner's code, naming the commit. Once per repository, recorded so it is not said again, and never a question. `status` shows it too.

**"Ask me each time" covers publishing only**

- The owner is asked before each post. Nothing else waits on this setting.
- The tool closes a bounty whose solution is merged without asking, in every mode: by then the merge has happened, and a held close only leaves a stale open issue and solvers without an outcome.
- The setup view and the doc page say in plain words that this setting covers publishing and nothing else, and that merging is not gated, since an agent can merge with its own Git.
- An approval is bound to exactly what was shown: if what would be published changes afterwards, the approval does not carry over, and the tool's own bookkeeping between approval and posting does not count as a change (the `github-preview-stale` finding carried since BT6a is closed here or reported as still open, with a test either way).
- Approving a waiting post posts it. The owner does not have to wait for an agent to return.

**The secret scan: the owner's part is set beforehand**

- Two lists in the owner's settings, shown and changed through the owner's commands:
  - **never publish:** the owner's additions to never-ship. A listed path is kept out of every bounty.
  - **safe to publish:** paths the scan does not hold a bounty over, for known false alarms such as test fixtures with made-up keys.
- Both live in the owner's settings and never in the project. A project file that claims either is refused by name and grants nothing. A path on the safe list still cannot carry a never-ship file.
- **"Allow it once" is not offered and, if BT8 built it, is removed.** The safe list replaces it.

**A hit waits for the owner, and the owner is always told**

- There is no setting for this. The bounty is held in a named waiting state that `status` and the summary show.
- While it waits, whoever acts first settles it: the owner marks the file safe or never-publish; or the agent removes the content and posts again; or either stops the bounty.
- **The hit message shows the agent only what an agent may do:** remove it and post again; or stop and not post this bounty at all. No approval command appears in it. One line says it is waiting for the owner, who decides in the setup view, and tells the agent to tell them.
- Stopping uses the ordinary closing command, but the message does not say "close": nothing was posted, so it says that nothing was published, nothing will be, and the owner's files are untouched.
- **The hit says where the secret is, as a fact,** and never prints the value: the file and line, and, when the content is in a commit not yet pushed, that commit and that an ordinary push would publish it too.
- **A hit stays in the record and in the summary after it is settled,** including when the agent fixed it and the bounty went out: what was flagged, and what happened. The owner should know a secret was sitting in their working files.
- **`create` previews it.** It states what would be published for the first time, and any hit, so the agent can fix it before `post`. A hit at `create` holds nothing and is recorded the same way.
- Removing the flagged content and running `post` again is enough to send the bounty. If the content was captured earlier, the tool recaptures it or says exactly what the agent must redo; a test proves which.
- **Said plainly in the doc page:** waiting for the owner cannot be enforced. Content reworked until the scan passes goes out. What the tool guarantees is that the owner is told every time and can read what was published.

**Waiting is not failing**

- A command that leaves a bounty waiting says so in its first line and exits in a way an agent host does not read as a crash; the Result states the exit status chosen for waiting states and why. No command waits for typed input.

**Cases that must fail, each a named refusal that changes nothing:** each command BT8 offered that this wave folds away; `config set` of a name the tool does not know, or of a hard stop; adding a repository with no GitHub address, or a name that is not a repository address; removing one that is not listed; the all-projects word misspelled or half given; a safe-list or never-publish entry that resolves outside the repository, is a link, or names a never-ship path as safe; either list claimed from a project file; "allow once" typed for a hit, which says what replaced it; an approval for something that is not waiting; an approval after the content changed.

## Review lenses

- [x] **Security:** the reviewer plays an agent that wants a flagged bounty out. It tries: reworking the content so the pattern no longer matches (and reports that it goes out and that the owner is told, as the doc page says); adding to the safe list from the project, through a solution, through a link or a case trick on the path; getting the value printed; making the hit vanish from the record or the summary; discarding and recreating the bounty to lose the hit's trace. It tries to make a yes for one repository apply to another: same path with a different repository, a fork, a second remote, a remote edited to claim a listed address while the bounty would go elsewhere, a lookalike address. For each: prevented, or permitted but visible, and whether the doc page's claim matches.
- [x] **User experience:** the relay trial above, three runs, reported word for word. Then three readers, each fresh. An agent whose post is held by a hit says what it may do, what it may not, and who decides, then removes the content and posts. An owner, played by the reviewer with only bare `config`, allows one repository and adds one entry to each list, and says in their own words what each did. A fresh agent given only bare `config` and an owner's plain request ("stop bounties on this repository", "never publish the fixtures folder") runs the right command first time. An owner who allowed "this one bounty" last time reads the next first-use message and says what is being asked. The reviewer reports anything shown that was not used, and any line addressed to the wrong reader.
- [ ] **Measurement fairness:** not applicable.

## Notes for the worker

- Refactoring playbook where BT8 built something this changes, feature playbook for the two lists. Subtract first: remove "allow once" and any approval command printed to agents before adding anything.
- The owner rejected requiring a real terminal for the owner's commands (13 October 2026). Do not add it, a typed confirmation, a key or a signature. The honest position stays: this stops accidents and makes changes visible.
- A message has one reader. If a line is for the owner, it belongs in the setup view or the summary, not in what an agent is shown.
- Report at the timebox. Do not run on.
- Not in this wave: the instruction files (BT8b); the hook (BT9); any reward or limit (BT11).
- The owner's side is not designed further until this wave has run (owner and head chef, 13 October 2026): the next useful information is what a fresh agent and a first-time owner do with it, not another decision made in talk.

---

## Result

- Worker: · Reviewer:
- Struck at dispatch as already done by BT8:
- Commit:
- Verify:
- Verdict: · Level:
- Lenses:
- What identifies a repository:
- Exit status for waiting states:
- Findings and limits:
- Merged: · Resources removed:
- Reflect:
