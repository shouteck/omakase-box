# BT7c: fewer commands

Milestone: BT · Station: packaging (also evidence) · Base: master at dispatch, after BT7b · Branch: `wave/BT7c` · Timebox: 120 minutes; at expiry the cook stops and reports where it is, whatever state that is

**Pre-brief.** Written by the CTO on 12 October 2026 from the owner's rule of that day: a command or feature exists only if an agent could not do the same with what it already has (Git, the GitHub command line, its editor) without losing something only the tool guarantees. **This wave removes things, so it waits for the owner's "go" on the list below.** The head chef checks the list against master at dispatch.

## Outcome

The bounty tool has about half the commands it had, an agent's journey is shorter in commands and in what it has to read, and nothing only the tool can guarantee is lost.

## Scope

- Write: `packages/box-bounty/**`, `packages/box-cli/**` (the `bounty` commands), `tests/box/bounty/**`, `docs/box-v4/BOUNTY.md`, and the tool-kept lines the tool itself writes into instruction files.
- Read for context: PLAN.md "Other rules of the product"; the Results of BT7a and BT7b; `kitchen/stations/packaging.md`.
- Do not touch: the never-ship table; `export`, `submit`, `verify`, `trace`; `.execution/`, `docs/legacy/`. `AGENTS.md` and `PLAN.md` are the head chef's to update at close.

## The list

Before changing anything, the cook reads each command in the code and reports, in one line each, what it does that the agent could not do without it. The head chef settles any surprise with the owner before the cut. Expected:

| Command | Change | Why |
|---|---|---|
| `undo` | removed | a merge is one ordinary commit; ordinary Git reverses it. `apply` and the closing line name that commit |
| `reply` | removed | the agent can comment on the issue itself, in its own words |
| `answer` | folded away | `look <n>` and `apply <n>` take a pull request's number and collect it themselves, with the same refusals for forbidden and unsafe paths. Collecting is a step, not a decision |
| `questions` | folded into `status` | `status` already states how many comments there are; `status --comments` prints them, marked as written by others |
| `reject`, `withdraw` | one command | both close a bounty with nothing merged. The cook checks first what `reject` does that `withdraw` does not, and reports it |
| `remind` | removed if nothing depends on it | the cook reports what uses it; if BT8's instruction-file lines need it, it stays and the Result says so |
| `confirm` | stays here | it is the owner's yes for each bounty until BT8's standing rules replace it; BT8 removes it |

Kept: `create`, `post`, `status`, `look`, `apply`, the one closing command, `help`, `describe`, and `confirm` until BT8.

## Done when

- `node scripts/verify.mjs test:box-bounty test:box-package` exits 0 on the final commit; the suites reach no network.
- Each removed command, typed, gives a named refusal that says what replaced it or that the tool no longer does it, with the plain way to do it. No silent failure and no alias kept.
- Tests for a removed command are removed with it. Tests of a guarantee move to the command that now carries the guarantee; the report lists each one and where it went. No expected outcome of a surviving guarantee changes.
- Every refusal for forbidden or unsafe paths that `answer` gave is given by `look <n>` and `apply <n>`, before anything is written. A test for each.
- Records written before this wave still load. One in a state that only a removed command could leave (for example `undone`) is shown as what it is, with a next step that exists.
- Every output still names the next command, and names none that was removed. A test searches every message the tool can print for the removed names.
- `help` fits what an agent needs to post and to collect, and lists only what exists.
- **Measured, before and after,** on the same two journeys run by fresh agents with only the tool's output (post a bounty; collect one with three solutions): the number of tool commands run, the characters of tool output the agent received, and whether it finished. Three runs each side.

## Review lenses

- [x] **Security:** the guarantees that moved are attacked where they now live: a hostile tree, a forbidden path and a nested repository layout through `look <n>` and `apply <n>` on a pull request never collected before; a comment shaped like the tool's own output through `status --comments`.
- [x] **User experience:** the measured journeys above. The reviewer reads the transcripts and reports every hesitation, every command the output had not named, and anything an agent wanted that a removed command used to give.
- [x] **Measurement fairness:** both sides ran the same journeys from the same fixtures, every run is counted including any that did not finish, and each number comes with its spread.

## Notes for the worker

- Refactoring playbook, with subtract-before-you-add and migrate-callers-then-delete: move each guarantee first, prove it where it now lives, then delete.
- A command's code that nothing reaches is deleted, not left behind a flag.
- Report at the timebox. Do not run on.
- Not in this wave: `confirm` (BT8), anything about installing the tool or what it depends on (BT12).

---

## Result

- Worker: · Reviewer:
- Commit:
- Verify:
- Verdict: · Level:
- Lenses:
- Method:
- Findings and limits:
- Merged: · Resources removed:
- Reflect:
