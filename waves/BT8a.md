# BT8a: the owner's settings as the owner decided them

Milestone: BT · Station: packaging (also evidence) · Base: master at dispatch, after BT8 · Branch: `wave/BT8a` · Timebox: 120 minutes; at expiry the cook stops and reports where it is, whatever state that is

**Pre-brief.** Written by the CTO on 13 October 2026 from decisions the owner made in conversation while BT8 was cooking. BT8 was briefed before them and was not interrupted. **At dispatch the head chef reads BT8's Result first, strikes from this brief whatever BT8 already does, and corrects command names** (BT8's cook was building an `owner` command group; this brief says "the owner's commands" and "the setup view" for whatever BT8 named them).

## Outcome

The owner's side of the tool is as small and as safe by default as the owner asked for: a yes covers one repository; being asked means being asked before publishing and nothing else; and the owner's part in the secret scan is two lists set beforehand, with every hit reaching the owner and no approval command in front of an agent.

## Scope

- Write: `packages/box-bounty/**`, `packages/box-cli/**` (the `bounty` commands), `tests/box/bounty/**`, `docs/box-v4/BOUNTY.md`. Tests never read or write the real owner settings folder.
- Read for context: `waves/BT8.md` in full, brief and Result; PLAN.md ("The three hard stops", "Other rules of the product"); `kitchen/stations/packaging.md`.
- Do not touch: the never-ship table's built-in entries; the scan's patterns, except where a test of this wave shows one is wrong; `export`, `submit`, `verify`, `trace`; `.execution/`, `docs/legacy/`.

## Done when

- `node scripts/verify.mjs test:box-bounty test:box-package` exits 0 on the final commit; the suites reach no network.

**One repository by default**

- The plain allow covers this repository and nothing else.
- All the owner's projects is an explicit extra: its own word on the command, described in the setup view and the doc page, and **not offered in the first-use message**. Offered side by side, people pick the wider one to avoid being asked again, and a wide yes covers repositories that do not exist yet.
- When an action goes ahead under the all-projects answer, the output says so in those words.
- **What counts as "this repository" is stated in the doc page and tested.** A different repository later placed at the same folder path does not inherit the yes. A fork, or a clone under another address, is not silently treated as the same one. The Result says what identifies a repository and why.

**The two doors show one decision**

- The first-use message and the setup view use the same words for the choices they share, and the first-use message says it is the same decision the setup view offers.
- First use offers, in this order: allow this repository; be asked each time; this one bounty only. The setup view offers the first two and the all-projects extra; it does not offer "this one bounty" when nothing is waiting.
- An owner who chose "this one bounty" before is told so the next time, in one line, not shown the first-use text as if new.

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

**Cases that must fail, each a named refusal that changes nothing:** the all-projects word misspelled or half given; a safe-list or never-publish entry that resolves outside the repository, is a link, or names a never-ship path as safe; either list claimed from a project file; "allow once" typed for a hit, which says what replaced it; an approval for something that is not waiting; an approval after the content changed.

## Review lenses

- [x] **Security:** the reviewer plays an agent that wants a flagged bounty out. It tries: reworking the content so the pattern no longer matches (and reports that it goes out and that the owner is told, as the doc page says); adding to the safe list from the project, through a solution, through a link or a case trick on the path; getting the value printed; making the hit vanish from the record or the summary; discarding and recreating the bounty to lose the hit's trace. It tries to make a yes for one repository apply to another: same path with a different repository, a fork, a clone elsewhere, a renamed remote. For each: prevented, or permitted but visible, and whether the doc page's claim matches.
- [x] **User experience:** three readers, each fresh. An agent whose post is held by a hit says what it may do, what it may not, and who decides, then removes the content and posts. An owner, played by the reviewer with only the setup view, allows one repository and adds one entry to each list, and says in their own words what each did. An owner who allowed "this one bounty" last time reads the next first-use message and says what is being asked. The reviewer reports anything shown that was not used, and any line addressed to the wrong reader.
- [ ] **Measurement fairness:** not applicable.

## Notes for the worker

- Refactoring playbook where BT8 built something this changes, feature playbook for the two lists. Subtract first: remove "allow once" and any approval command printed to agents before adding anything.
- The owner rejected requiring a real terminal for the owner's commands (13 October 2026). Do not add it, a typed confirmation, a key or a signature. The honest position stays: this stops accidents and makes changes visible.
- A message has one reader. If a line is for the owner, it belongs in the setup view or the summary, not in what an agent is shown.
- Report at the timebox. Do not run on.
- Not in this wave: the instruction files (BT8b); the hook (BT9); any reward or limit (BT11).

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
