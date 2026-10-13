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

- Worker: · Reviewer: the pass — Devin agent (Claude) on the Windows host, fresh agent, did not write this code
- Commit: `fc975591378719154a2757e820e31b1939a07932`
- Verify: `verify fc97559 PASS check=reused@2026-10-13T01-56-00-010Z-fc97559 build=reused@2026-10-13T01-56-00-010Z-fc97559 test:box-bounty=reused@2026-10-13T01-56-00-010Z-fc97559 test:box-package=reused@2026-10-13T01-56-00-010Z-fc97559 db=none 2s` — my own foreground invocation `.kitchen/runs/2026-10-13T02-14-34-619Z-fc97559` reused the recorded 519s PASS on this exact commit with a clean tree (305 bounty + 142 package); relied on per the pass's rules. I additionally ran a targeted vitest probe file of my own (5 scan-attack probes, now removed) — passed.
- Verdict: PASS · Level: ui-verified
- Lenses:
  - **Security** — attacked live on the built CLI against a scratch repo + scratch `BOX_BOUNTY_SETTINGS_DIR`: `confirm` with old args/flags → `command-removed` (exit 3) naming `post`/`--preview`; the every-output enumeration test now covers `confirm` in `REMOVED_NAME` and per-command CLI refusals. `owner` commands ARE invocable by an agent — `owner answer <id>` posted the held bounty (once only; second answer → `owner-answer-not-waiting`; no standing decision written) and `owner allow --all --yes` writes the widest authority: **permitted but visible** — recorded with a time, never offered by help/describe, and the fresh agent's transcript shows the wording steered it away. Hand edits to the settings file: `"ALWAYS"`, malformed JSON, wrong `kind`, non-string `at`, unknown names all refuse by name; hard-stop names → `settings-hard-stop`; a hand-written `"allowed"` silently works (by design — the `at`/`changes` it shows are whatever the editor wrote). A repo-carried `settings.json` is never read; `.box/limits.json` `authority`/`permission` → `limits-authority`; a legacy `"github"` destination prints one named notice and grants nothing. Project keys can't be aliased: junction at the repo realpaths to the same canonical key; `C:`/`c:` fold together. Junction at the settings dir or an attacker-controlled `BOX_BOUNTY_SETTINGS_DIR` reads through to `allowed` — agent-reachable, matching the doc's "stops accidents, not a lock". Scan: each planted kind holds the post naming path:line, hit objects carry no value; a never-ship-covered path refuses `github-never-ship` before scanning (never-ship wins, consistent). Private repo with the tool allowed → `github-private-repository`. Waiting states hold: no double-post, once-only answer cannot be reused, `off` returns to asking, agent `close` ends a wait cleanly. Evasions and nits under Findings.
  - **User experience** — both transcripts and logs read fully. allowed-repo: 6 commands, posted with nobody asked; `describe` named the owner state (`allowed for all projects (changed …)`) and the post printed `allowed by: the owner's default-level "allowed" written …`. Two hesitations, both self-describing refusals (relative `--task` resolves against the shell's CWD; `out-dir-not-empty`). norules-repo: reached `waiting` in 7 commands, quoted the owner lines verbatim, and explicitly declined to run `owner allow` itself ("the owner's to decide, and nothing else can decide it"). Nothing an agent wanted that `confirm` used to give — output names `post` and `--preview` everywhere. Owner legs completed live: (a) on a scratch copy of norules-repo with empty settings, one command `owner allow --project --yes` printed the disclosure, wrote `allowed`, and the waiting bounty went out to its recorded destination — what I allowed, in my words: agents on this project may post bounties publicly under my GitHub account, merge solutions on their judgement (the tool runs nothing from them but my next build will), and close issues on merges, with future money within my set limits — disclosure matched reality; (b) `owner setup` from nothing named every step with exact commands; `owner ask --project` wrote `ask`, setup then showed it and re-listed remaining steps; `owner summary` printed record facts. Rules-in-force in two commands.
  - **Measurement fairness** — not ticked.
- How strong "only the owner allows the tool" is: an accident-stop and a tripwire, not a lock — exactly what BOUNTY.md claims. Every tool path is honest: the decision is never inferred and never widened, project level beats default, nothing-written is never allowed, malformed/unknown/hard-stop shapes refuse loudly before anything mutates, and every tool write is recorded with a time. But nothing is a boundary against a deliberate agent: it can run `owner allow --all --yes`, write the file itself (with fabricated `at`/`changes`), or point `BOX_BOUNTY_SETTINGS_DIR`/a junction at a folder it made — all same-user-reachable, recorded only as timestamps the editor controls. The wording does the real protective work, and in the fresh-agent transcript it worked.
- Findings and limits:
  - F1 (medium, documented limit verified live): the owner commands, the settings file, and `BOX_BOUNTY_SETTINGS_DIR` are all agent-reachable — self-authorization takes one command or one file write, visible afterwards only via `status`'s editor-controllable `changed` timestamp and the `changes` list (which records tool writes only). Consistent with the honesty paragraph; stated for the record.
  - F2 (low, scan gap): a secret in a file Git treats as binary escapes the scan entirely — one NUL byte in a private-key file makes `git diff -p` print "Binary files differ" with zero `+` lines, so the post goes out unflagged and silent. Proven at the diff layer. "Not proof of absence" covers it in wording, but this evasion is total per-file and gives no signal.
  - F3 (low, scan gaps, verified on `scanText`): unquoted `NAME=value` assignments (the pattern requires quotes), a token split across two lines, a base64-wrapped key block, and a long random string under a non-secret-like name all produce no hit — the stated list's stated shape, named here as the evasion surface.
  - F4 (nit): `owner allow <junk-positional> --yes` silently ignores stray arguments and writes; a bare `owner allow --yes` defaults to project level (usage shows `[--project|--all]` optional — correct but worth knowing).
  - F5 (nit): re-running `post` while waiting does not double-post but overwrites `waiting.at` — the code comment says "a bounty already waiting keeps its first wait time"; observed `at` moving 45.911 → 47.530. Status therefore shows the agent's last try, not first wait.
  - F6 (nit): duplicate keys in the settings file silently last-win (`{"bounty":"off","bounty":"allowed"}` → `allowed`) — the file itself shows the trick; a `projects` key spelled with Windows backslashes is silently dead (canonical keys are forward-slash/lowercase — cannot grant, only fails to apply, an owner hand-edit footgun); extra keys inside `changes` entries are ignored while sibling level fields refuse unknowns.
  - F7 (nit): on `post --to github`, `publicRepository`/`signedAccount` run `gh` calls before the owner gate — with `gh` missing the first post gets a `github-cli-*` refusal rather than the waiting state; a named refusal either way.
  - F8 (nit): `status --full` prints `"command":"confirm"` verbatim from pre-wave history events (`EVENT_COMMAND_VIEW` not extended; `asRecord`'s pending/answers scrub not extended either — verified on master that no stored tool text could contain `box bounty confirm`, so harmless; a fact-record rendering that self-corrects via `command-removed`).
  - Verified clean: `git diff master...fc97559` touches only the allowed scope; this repo's own `.box/limits.json` untouched (still names `"github"` → reported once, the kitchen did not allow itself); K14 budgets re-measured and green in the recorded run; `confirmed`/`undone`/`githubApproval` records still load and post under the recorded yes; the disclosure, waiting lines, `allowedBy` record, summary, setup and honesty paragraph all match behaviour I ran.
- Merged: · Resources removed:
- Reflect:
