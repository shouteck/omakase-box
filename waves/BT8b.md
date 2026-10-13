# BT8b: every host's agent learns of the tool

Milestone: BT · Station: packaging (also evidence) · Base: master at dispatch, after BT8a · Branch: `wave/BT8b` · Timebox: 90 minutes; at expiry the cook stops and reports where it is, whatever state that is

**Split out of BT8 by the CTO on 13 October 2026** so each wave is small enough to review once. The content is the owner's decision of 11 October 2026, unchanged: the tool must not depend on one agent host. The head chef checks names against master at dispatch. The corrections to BT8 that were briefly carried here are their own waves, [BT8a](BT8a.md) and [BT8c](BT8c.md). Checked against BT8's Result on 13 October 2026: BT8 left the instruction files and `.box/limits.json` as they were, apart from refusing an authority claim in the limits file and reporting its old destination entry once, so nothing here is already done.

## Outcome

Whichever host an agent runs on, it learns at the start of a session that the tool exists and whether a bounty is open or has a new solution, from the instruction file that host loads. The tool keeps one identical block in each such file and says no more there than that.

## Scope

- Write: `packages/box-bounty/**`, `packages/box-cli/**` (the `bounty` commands), `tests/box/bounty/**`, `docs/box-v4/BOUNTY.md`.
- Read for context: `waves/BT8a.md` Result; `waves/BT4.md` Result (the tool-kept lines and how their wording was chosen); `waves/BT8.md` Result; PLAN.md ("Memory without demand", "Host agnostic"); `kitchen/stations/packaging.md`.
- Do not touch: anything in an instruction file outside the tool's own marked block; the owner's settings; `.execution/`, `docs/legacy/`.

## Done when

- `node scripts/verify.mjs test:box-bounty test:box-package` exits 0 on the final commit; the suites reach no network.
- **Finding the files.** Bare `config` (BT8a) shows which instruction files the tool found; it looks in the project for the instruction files hosts are known to load and states which it found. The list is in one place in the code and in the doc page, with the host each belongs to. The cook confirms each against that host's own documentation and lists in the Result what was confirmed and when. As understood on 11 October 2026, not confirmed: `AGENTS.md`, `CLAUDE.md`, files under `.cursor/rules`, `GEMINI.md`, `.github/copilot-instructions.md`.
- **Keeping the block.** With the owner's yes, one `config` setting given once, the tool keeps its block in each file it found, identical in all, and changes them together. Where one file already pulls in another (as this repository's `CLAUDE.md` pulls in `AGENTS.md`), it writes the block once and says so.
- It creates no instruction file, and changes nothing outside its own marked block, byte for byte. A file it cannot update safely is a named refusal for that file only; the others are still updated and the output says which was not.
- **The list of files is not stored.** The tool finds its own marked block in the known instruction files each time it needs to. Only an owner's choice of a file outside the known list is kept, in the owner's settings for that repository.
- When a new instruction file appears later, `status` says once that a host's file lacks the block and gives the command that adds it. It adds nothing by itself.
- A host that loads none of these is not left out: the owner can name any file.
- **What the block says.** That the tool exists and how to learn more. While any bounty is open, one further line in one of two fixed wordings, each naming the command that shows more: a bounty is open; or a bounty has a new solution. New means no agent in this project has been shown it. Once shown, the line returns to the first wording. With none open the line is absent. It never carries a count, an identifier, a state or anything about a solution beyond that one exists. So a file changes at four moments at most: the first bounty opening, a new solution found, that solution shown, the last bounty closing.
- The doc page says what the line can and cannot know: it is as fresh as the last time the tool looked at GitHub, since nothing runs in the background.
- **One command to remember.** `box bounty` with nothing after it prints what an agent arriving cold needs: what is open, what needs attention, the next command. A solution seen and not decided is stated with its age.
- Nothing in the tool's wording, commands or output names or favours a host outside the one list. A test checks.
- Tests: a project with two unlinked instruction files gets the block in both, and both follow the four moments and stay byte-identical otherwise; a project where one file pulls in the other gets it once; a file with other content, other tools' blocks and odd line endings round-trips unchanged outside the block.
- **One settings file: the project's `.box/limits.json` is retired (owner, 13 October 2026).** Everything the tool needs to be told lives in the owner's `settings.json`; nothing is configured in the project.
  - First the cook lists every place the code reads the limits file and what it reads, and the Result carries that list.
  - `allowedDestinations`: dropped; the owner's yes replaced it in BT8.
  - `reminders`: dropped, unless the list shows something still depends on it, in which case the Result says what and it moves to the owner's settings.
  - `rulesFile`: replaced by finding the marked block, as above.
  - `cost` and `expectedAnswer`: generated from facts each time `describe` runs, not stored: what posting costs and the reward a bounty would state, and how long this project's past bounties waited and how many ended with a solution merged, or that there is no history yet. The sentences an agent reads keep doing the job BT4 tuned them for; a test compares what an agent is told before and after on a project with no history.
  - A project that still has the file keeps working. The tool says once, as a fact, that the file is no longer read and can be deleted, names anything in it that the owner would have to set again, and never fails because of it. The tool does not delete or rewrite it.
  - This repository's own `.box/limits.json` is the owner's to delete.
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
