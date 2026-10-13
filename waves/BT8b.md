# BT8b: every host's agent learns of the tool

Milestone: BT · Station: packaging (also evidence) · Base: master at dispatch, after BT8 · Branch: `wave/BT8b` · Timebox: 90 minutes; at expiry the cook stops and reports where it is, whatever state that is

**Split out of BT8 by the CTO on 13 October 2026** so each wave is small enough to review once. The content is the owner's decision of 11 October 2026, unchanged: the tool must not depend on one agent host. The head chef checks names against master at dispatch.

## Carried in from the owner, 13 October 2026 (decided while BT8 was cooking)

The head chef reads BT8's Result first and keeps here only what BT8 did not already do.

- **Allowing the tool means one repository by default.** The plain allow command covers this repository and nothing else.
- **All the owner's projects is an extra, never the default.** It needs its own explicit word on the command, is described in `setup` and the doc page, and is **not offered in the first-use message**, which shows only "allow for this repository" and "allow this one bounty". Offered side by side, people pick the wider one to avoid being asked again, and a wide yes covers repositories that do not exist yet.
- When an action goes ahead under the all-projects answer, the output says so in those words, so an owner who gave it sees where it reached.
- **"Ask me each time" covers publishing only.** The owner is asked before each post, and before a post the secret scan has held. The tool closes a bounty whose solution is merged without asking, in every mode: by then the merge has happened, and a held close only leaves a stale open issue and solvers without an outcome. `setup` and the doc page say in plain words that this setting covers publishing and nothing else; merging is not gated, since an agent can merge with its own Git. Whether closing should wait once it names who earns money is a question for BT11's dispatch, not here.
- **The owner's part in the secret scan is set beforehand, not asked at each hit** (owner, 13 October 2026). In the owner's settings, set through `setup`, at the same levels as the yes:
  - **never publish:** the owner's own additions to never-ship. A file listed here is kept out of every bounty.
  - **safe to publish:** paths the scan does not hold a bounty over, for known false alarms such as test fixtures with made-up keys. Kept in the owner's settings and never in the project, so a solution, a pull request or a collaborator cannot add to it; a project file that claims it is refused by name.
  - **what a hit does:** by default the bounty is held and only changing the content or stopping gets past it, with the owner not asked. An owner who wants to judge each hit can choose to be asked, which then waits like any post under "ask me each time".
- **By default the hit message is addressed to the agent only** and offers exactly two things: remove it and post again; or stop and not post this bounty at all. The second discards the draft with the ordinary closing command, and the message does not say "close": nothing was posted, so it says nothing was published, nothing will be, and the owner's files are untouched. No approval command appears in it. One line says a false alarm is settled by the owner marking the file safe in `setup`.
- **"Allow it once" is not built.** The safe list replaces it: slower the first time, and not asked again.
- **The hit says where the secret is, as a fact.** If the flagged content is in a commit not yet pushed, the message names the commit and says an ordinary push would publish it too.
- The pass checks that removing the flagged content and running `post` again is enough, or says what else is needed if the content was captured earlier; that a safe-list entry cannot be widened from inside the project; and that a path on the safe list still cannot carry a never-ship file.
- **The agent learns of a hit as early as it can.** `create` states the same facts about what would be published for the first time, and any hit, as a preview, so the agent can fix it before `post` and before the owner is involved.
- **What counts as "this repository" is stated and tested.** A different repository later placed at the same folder path does not inherit the yes, and a fork or a clone under another address is not silently treated as the same one. The pass tries both.

## Outcome

Whichever host an agent runs on, it learns at the start of a session that the tool exists and whether a bounty is open or has a new solution, from the instruction file that host loads. The tool keeps one identical block in each such file and says no more there than that.

## Scope

- Write (the carried items touch the owner's commands and the first-use message from BT8): `packages/box-bounty/**`, `packages/box-cli/**` (the `bounty` commands), `tests/box/bounty/**`, `docs/box-v4/BOUNTY.md`.
- Read for context: `waves/BT4.md` Result (the tool-kept lines and how their wording was chosen); `waves/BT8.md` Result (`setup`); PLAN.md ("Memory without demand", "Host agnostic"); `kitchen/stations/packaging.md`.
- Do not touch: anything in an instruction file outside the tool's own marked block; the owner's settings; `.execution/`, `docs/legacy/`.

## Done when

- `node scripts/verify.mjs test:box-bounty test:box-package` exits 0 on the final commit; the suites reach no network.
- **Finding the files.** At `setup`, the tool looks in the project for the instruction files hosts are known to load and states which it found. The list is in one place in the code and in the doc page, with the host each belongs to. The cook confirms each against that host's own documentation and lists in the Result what was confirmed and when. As understood on 11 October 2026, not confirmed: `AGENTS.md`, `CLAUDE.md`, files under `.cursor/rules`, `GEMINI.md`, `.github/copilot-instructions.md`.
- **Keeping the block.** With the owner's yes, given once at setup, the tool keeps its block in each file it found, identical in all, and changes them together. Where one file already pulls in another (as this repository's `CLAUDE.md` pulls in `AGENTS.md`), it writes the block once and says so.
- It creates no instruction file, and changes nothing outside its own marked block, byte for byte. A file it cannot update safely is a named refusal for that file only; the others are still updated and the output says which was not.
- The list of files is a shared fact kept in the project. It grants nothing.
- When a new instruction file appears later, `status` says once that a host's file lacks the block and gives the command that adds it. It adds nothing by itself.
- A host that loads none of these is not left out: the owner can name any file.
- **What the block says.** That the tool exists and how to learn more. While any bounty is open, one further line in one of two fixed wordings, each naming the command that shows more: a bounty is open; or a bounty has a new solution. New means no agent in this project has been shown it. Once shown, the line returns to the first wording. With none open the line is absent. It never carries a count, an identifier, a state or anything about a solution beyond that one exists. So a file changes at four moments at most: the first bounty opening, a new solution found, that solution shown, the last bounty closing.
- The doc page says what the line can and cannot know: it is as fresh as the last time the tool looked at GitHub, since nothing runs in the background.
- **One command to remember.** `box bounty` with nothing after it prints what an agent arriving cold needs: what is open, what needs attention, the next command. A solution seen and not decided is stated with its age.
- Nothing in the tool's wording, commands or output names or favours a host outside the one list. A test checks.
- Tests: a project with two unlinked instruction files gets the block in both, and both follow the four moments and stay byte-identical otherwise; a project where one file pulls in the other gets it once; a file with other content, other tools' blocks and odd line endings round-trips unchanged outside the block.
- **Cases that must fail, each a named refusal that changes nothing:** a file whose block markers are damaged; a path that resolves outside the project; a file that is a link.

## Review lenses

- [x] **Security:** the reviewer tries to get text of its choosing into an instruction file through the block (a bounty title, an account name, a branch name), and to make the tool write outside the block or outside the project.
- [x] **User experience:** a fresh agent started under a host other than the one that set the tool up, in a project with two instruction files, says what it knows about the tool and about open bounties before doing anything.
- [x] **Measurement fairness:** one cheap check of whether the block costs agents anything on unrelated work. The same small task is given to fresh agents with no block, the block with nothing open, and the block with a bounty open. Report steps and tool output received, whether the agent did anything bounty-related, the run count and the spread, and say plainly that a handful of runs shows a direction and not a rate. If the block pulls agents off the task, that is a finding for the owner, not something to tune away here.

## Notes for the worker

- Feature playbook. The block's bytes are the product here: write the round-trip tests first.
- Report at the timebox. Do not run on.
- Not in this wave: the hook (BT9); any permission or money.

---

## Result

- Worker: · Reviewer:
- Commit:
- Verify:
- Verdict: · Level:
- Lenses:
- Hosts confirmed, and when:
- Findings and limits:
- Merged: · Resources removed:
- Reflect:
