# BT8a: the owner's side is three words and a list

Milestone: BT · Station: packaging (also evidence) · Base: master at dispatch · Branch: `wave/BT8a` · Timebox: 150 minutes; at expiry the cook stops and reports where it is, whatever state that is

**Rewritten by the CTO on 13 October 2026 against BT8's Result (merged `e8e1038`).** The owner made these decisions in conversation while BT8 cooked. The earlier draft of this brief also carried the secret scan; that is now its own wave, [BT8c](BT8c.md), so each can be reviewed once. Order: BT8a, then [BT8b](BT8b.md), then BT8c.

## What BT8 built that this wave changes

- A `bounty owner` group of seven commands: `setup`, `allow [--project|--all] [--yes]`, `ask`, `off`, `on`, `answer <id>`, `summary`.
- The owner's yes stored in `settings.json` under the repository's folder path, with an all-projects default beside it.
- A first-use message that prints the commands for this project, for all projects, and for that one bounty.
- Under "ask me each time", each post **and each closing** waits.

## Outcome

An owner has three words to know and usually types none of them: they tell their agent what they want and the agent runs it. The yes is a list of repositories the owner can read and change. What the yes means reaches the owner through their agent's own words, and that is tested.

## Scope

- Write: `packages/box-bounty/**`, `packages/box-cli/**` (the `bounty` commands), `tests/box/bounty/**`, `docs/box-v4/BOUNTY.md`. Tests never read or write the real owner settings folder.
- Read for context: `waves/BT8.md` Result, all of it; PLAN.md ("The three hard stops", "Other rules of the product"); `kitchen/stations/packaging.md`.
- Do not touch: the secret scan, its patterns, what a hit offers (BT8c); the never-ship table; `export`, `submit`, `verify`, `trace`; `.execution/`, `docs/legacy/`.

## Done when

- `node scripts/verify.mjs test:box-bounty test:box-package` exits 0 on the final commit; the suites reach no network. The K14 start budgets are re-measured and stated.

**Three words**

After tools people already know: `direnv allow` and `direnv deny` for trust; `git config`, `npm config` and `gh config` for everything else; a status command for where things stand.

| Command | What it does |
|---|---|
| `allow [repository]` | Adds a repository to the owner's list; with no name, the one it is run in. Prints what that allows before writing. One option makes the entry "ask me each time". `allow <bounty>` lets one waiting post go out and decides nothing else. |
| `deny [repository]` | Takes a repository off the list. |
| `config` | Bare: prints every setting, set or not, with its value and the exact command that changes it. With `set`, `add` or `remove`: changes one thing. |
| `status` | Exists and is shared with agents. Shows what is waiting for the owner; with an option, what was done since a given time. |

- **Nothing else is the owner's.** `owner setup` becomes bare `config`; `owner ask` an option of `allow`; `owner off` and `owner on` become `deny` and `allow`; `owner answer <id>` becomes `allow <bounty>`; `owner summary` becomes an option of `status`. Each old spelling, typed, is a named refusal that says what replaced it. None is kept as an alias.
- **A new setting never adds a command.** Whether the yes extends to all the owner's projects is one `config` setting, off by default. BT8c and BT11 add theirs the same way.
- **Bare `config` is written for an agent to act on:** complete, each line carrying its command, and one line saying what the owner has not decided yet.
- The dated history of changes stays in the settings file, so what was there before a `deny` is still visible.

**A list of repositories**

- The owner can add the repository they are in, add one by naming it without being inside it, see the list (when each was added, allowed or "ask me each time") in bare `config`, and remove one with `deny`.
- **A repository is named by its GitHub address** (owner and name), not its folder. The yes is about bounties being posted publicly to that repository under the owner's account. Every copy on this machine is covered; a different repository at the same folder path is not; a fork is a different repository. The cook may argue for another identity in the Result only by showing this one fails a case below.
- A repository with no GitHub address cannot be listed, and the refusal says so by name.
- **Entries BT8 wrote under a folder path are moved once:** to the address of the repository at that path if there is exactly one and it can be read; otherwise reported with the command that re-adds it. Never silently kept as a yes for whatever sits at that path.
- `deny` returns a repository to "nothing written". Open bounties are untouched and `status` says the repository is no longer allowed.
- Tested: the same path holding a different repository; a fork; a remote renamed after the yes; two remotes pointing at different repositories; an address differing only in letter case or a trailing `.git`.

**One repository at a time, and one decision behind two doors**

- Plain `allow` covers this repository and nothing else. All projects is an extra the first-use message does not offer.
- First use and bare `config` use the same words for the choices they share, and first use says it is the same decision. First use offers, in this order: allow this repository; be asked each time; this one bounty only.
- An owner who chose "this one bounty" before is told so in one line the next time.
- An action that goes ahead under the all-projects setting says so in those words.

**"Ask me each time" covers publishing only**

- The owner is asked before each post. The tool closes a bounty whose solution is merged without asking, in every mode: the merge has happened, and a held close only leaves a stale open issue.
- Bare `config` and the doc page say plainly that this covers publishing and nothing else, and that merging is not gated.
- `allow <bounty>` posts the waiting bounty; the owner does not wait for an agent to return.

**What the yes means has to reach the owner**

- The first-use message gives the agent three short facts that survive paraphrase: bounties are **public**, under the owner's GitHub account; a solution the agent chooses is **merged** into the owner's code; and it is **this repository** only.
- **The relay is measured.** The reviewer plays an owner who sees only what the agent says in the conversation, never the tool's output, then writes down what they believe they agreed to. Three runs with fresh agents. If "public", "merged" or "this repository" is missing from what the owner understood in any run, the message is made shorter and blunter and the runs are repeated. The Result gives each relayed sentence word for word.
- **The first merge of a stranger's solution in a repository is said to the owner once.** The output of that `apply`, or of the command that recognises that merge, tells the agent to say in its closing message that a solution written by someone outside was merged, naming the commit. Once per repository, recorded, never a question. `status` shows it too.

**Waiting is not failing**

- A command that leaves a bounty waiting says so in its first line and exits in a way an agent host does not read as a crash; the Result states the exit status chosen and why. No command waits for typed input.

**Small things BT8's pass found, closed here:** stray arguments to `allow` are refused, not ignored (F4); a bounty already waiting keeps its first wait time (F5); the owner's permission is checked before any call to GitHub, so a first post with `gh` missing still reaches the waiting state or a refusal that says both (F7).

**Cases that must fail, each a named refusal that changes nothing:** each `owner …` spelling; `config set` of a name the tool does not know, or of a hard stop; `allow` or `deny` with a name that is not a repository address or a waiting bounty; adding a repository with no GitHub address; `deny` of one not listed; `allow <bounty>` for something not waiting.

## Review lenses

- [x] **Security:** the reviewer tries to make a yes for one repository apply to another: same path with a different repository, a fork, a second remote, a remote edited to claim a listed address while the bounty would go elsewhere, a lookalike address, a moved entry that lands on the wrong repository. It replays BT8's attacks on the settings file through the new commands, and reports for each: prevented, or permitted but visible.
- [x] **User experience:** the relay trial, three runs, word for word. Then two readers, each fresh: an agent given only bare `config` and an owner's plain request ("stop bounties on this repository", "allow the shop repository too", "ask me each time here") runs the right command first time; an owner, played by the reviewer with only bare `config`, says what each line means. The reviewer reports anything shown that was not used and any line addressed to the wrong reader.
- [ ] **Measurement fairness:** not applicable.

## Notes for the worker

- Refactoring playbook: BT8's behaviour is reviewed and right; this wave changes its shape. Migrate callers, then delete the old spellings. Subtract before adding.
- The owner rejected requiring a real terminal for the owner's commands. Do not add it, a typed confirmation, a key or a signature. The honest position stays: this stops accidents and makes changes visible.
- A message has one reader. A line for the owner belongs in bare `config` or `status`, not in what an agent is shown, except the three facts it is asked to pass on.
- Never write a token-shaped literal in a tracked file, this one included (BT8's lesson; `secret-literals.test.ts` will fail).
- The owner's side is not designed further until this wave has run: the next useful information is what a fresh agent and a first-time owner do with it.
- Report at the timebox. Do not run on.
- Not in this wave: the scan and what a hit offers (BT8c); the instruction files and `limits.json` (BT8b); the hook (BT9); any reward or limit (BT11).

---

## Result

- Worker: · Reviewer:
- Commit:
- Verify:
- Verdict: · Level:
- Lenses:
- What identifies a repository:
- Exit status for waiting states:
- The relay, three runs, word for word:
- Findings and limits:
- Merged: · Resources removed:
- Reflect:
