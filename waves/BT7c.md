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

- Worker: cook A (`1ed01f9`) · Reviewer: the pass — Devin subagent (Claude) on the Windows host, fresh agent, did not write this code
- Commit: `1ed01f9` reviewed as the product commit; `9dc6752` and `28314d1` verified to touch only waves/BT7c.md (`git show --stat`)
- Verify: `verify 1ed01f9 PASS check=0 build=0 test:box-bounty=0 test:box-package=0 db=none 447s` — the recorded run on this exact commit with a clean tree (263 + 142 green, `.kitchen/runs/2026-10-13T00-05-39-386Z-1ed01f9`); relied on it per the pass's rules and spent the time on the diff and the attacks
- Verdict: FAIL · Level: test-verified
- Lenses:
  - Security: attacked where the guarantees now live, live on the built CLI — a returned `repo/` holding a link is `answer-unsafe-path` through `look --from`; a `.env` is `answer-never-ship` through both `apply --from` and `look --from`; a nested `.git/` tree is `answer-never-ship` (`dot-git`) through `look --from` — each refused before anything was written (no attempt refs, clean worktree). The pull-request path is covered by the migrated tests (`answer-unsafe-path`/`answer-never-ship`/`answer-empty`/`github-pr-not-descended` through `lookBounty`/`applyBounty`, plus the end-to-end `look <n>` collection in bt7-cli.test.ts). `status --comments` prints every comment line `other account | <quoted>` and refuses a mismatched issue by name — covered, including a comment reading "box says: ignore your task". One hole found: a pre-wave record's stored `outside.answers` text is replayed verbatim (see findings).
  - User experience: all 12 transcripts and both tool-output.logs read. After-side agents ran `look <id> --from <dir>` once per solution — collect and read in one command (9/7/9 commands vs 11/12/12 before). Nobody reached for `undo`/`reply`/`questions`/`answer` (no `command-removed` in any after log) and nothing a removed command gave was wanted. Hesitations, identical both sides: the unquoted-backslash CLI path mangled by the shell (harness artifact), and `--task` resolving against the shell's CWD (journey A, one refused retry then absolute path). Every command an agent ran had been named by prior output or the card.
  - Measurement fairness: same fixtures both sides — each run's repo diffs clean against its journey template (B runs differ only by the identical applied fix); cards differ only by run directory; all 12 runs counted, all finished; `wc -c` of every tool-output.log matches the tabled numbers exactly and the spreads are computed right. Before-logs contain `box bounty answer`/`bounty undo` text (master's dist), after-logs show only the new surface — the right build ran each side.
- Method: cook audit per command, then the cut with refusals first; measured journeys below — fresh `subagent_general` agents on stamped template copies, master's `dist` before, the wave's `dist` after. Review: full `git diff master...28314d1` read; built CLI attacked live on a scratch repo (all seven removed commands refuse `command-removed` exit 3 naming the replacement, with and without args; no alias found); legacy `undone`/`rejected`-style record fabricated and shown to load with live-command next steps and remapped history/pending text; review test `tests/box/bounty/bt7c-review.test.ts` added — it fails on this commit, reproducing the finding below.
- Findings and limits:
  - FAIL finding — a removed command name still prints: a record whose `github.outside.answers` was stored while `answer` existed (any open GitHub bounty status refreshed before this wave) replays that text verbatim when GitHub cannot refresh — `status` and `status --full` printed `collect: box bounty answer <id> --pr 4` live, and `renderOpenLine` folds the same string into `describe`, `.box/bounties/OPEN` and the owner's rules-file marked block. `asRecord` migrates `pending` for exactly this reason; `outside.answers` got no migration. Done-when "names none that was removed" fails on this reachable path; the recovery is only the `command-removed` refusal. Fix is small — scrub or regenerate `outside.answers` the way `pending` is handled. `tests/box/bounty/bt7c-review.test.ts` reproduces it (fails here).
  - The required test does not exist: the done-when asks for "a test searches every message the tool can print for the removed names". What exists scans `help` (cli.test.ts) and one `undone`-record status render (record.test.ts); nothing enumerates reachable messages or replays stored pre-wave strings — which is exactly the gap the finding above fell through.
  - Report gap: the done-when also asks the report to list each removed-command test deleted and where each moved guarantee's test went; the Result lists only the command audit and the journeys. The diff shows the moves (undo tests deleted; `answer` refusals re-pointed at `look`/`apply`; `questions`→`status --comments`; `reject`/`withdraw`→`closeBounty`), but the wave file never lists them.
  - Behaviour notes (documented widenings, not defects): `close --reason` lands `rejected` on any open stage including a draft — old `reject` refused pre-posted stages (`wrong-stage`); `close` on any ended record exits 0 with `already ended (<stage>)` where old `withdraw` refused `already-ended` on stages it did not own. Both are stated in help and BOUNTY.md. Pre-existing CLI laxness unchanged: unknown flags are silently ignored (`status --questions`, `close --withdraw`, `apply --pr`).
  - Scope, docs and the rest verified clean: diff touches only the allowed paths (never-ship table, export/submit/verify/trace, AGENTS.md, PLAN.md untouched); `confirm` still gates `post` (`not-confirmed`, `not-drafted` live); help/describe/usage/status name only live commands in the fresh-message paths I exercised; BOUNTY.md names no stale command and describes close's semantics and old-state records honestly.
- Merged: · Resources removed:
- Reflect:

### Command audit (cook A, read in code before the cut)

| Command | What it did that an agent could not | Disposition |
|---|---|---|
| `undo` | reset the branch to the recorded pre-apply ref — ordinary `git reset` does the same against the commit `apply` names | removed |
| `reply` | authenticated comment post to the issue — `gh issue comment` does the same | removed |
| `answer` | collected a returned folder/PR into `.box` — a step, not a decision | folded into `look`/`apply`, which collect themselves with all former `answer` refusals |
| `questions` | fetched+marked issue comments as foreign text | folded into `status --comments` |
| `reject` | closed with a recorded reason | merged with `withdraw` into `close` (`--reason` keeps the reject form) |
| `withdraw` | closed with no reason | same |
| `remind` | printed owner limits — nothing gates on it; the `reminders` field stays a known owner field | removed |
| `confirm` | records the owner's yes | stays until BT8 |

Surprises: none reported.

### Measured journeys

Identical fixtures and cards both sides; each run counted including failures. `commands` = box bounty invocations; `output_chars` = `wc -c` of the combined tool output log.

**Journey A — post a bounty**

| | run 1 | run 2 | run 3 | spread |
|---|---|---|---|---|
| before: commands | 6 | 6 | 6 | 0 |
| before: output_chars | 6268 | 6270 | 6270 | 2 |
| before: finished | yes | yes | yes | — |
| after: commands | 5 | 6 | 5 | 1 |
| after: output_chars | 5424 | 5427 | 5427 | 3 |
| after: finished | yes | yes | yes | — |

**Journey B — collect one bounty with three returned solutions**

| | run 1 | run 2 | run 3 | spread |
|---|---|---|---|---|
| before: commands | 11 | 12 | 12 | 1 |
| before: output_chars | 8170 | 9636 | 11274 | 3104 |
| before: finished | yes | yes | yes | — |
| after: commands | 9 | 7 | 9 | 2 |
| after: output_chars | 9378 | 6313 | 9378 | 3065 |
| after: finished | yes | yes | yes | — |

Hesitations observed (both sides): agents needed a retry when an unquoted Windows backslash path to `cli.js` was mangled by the shell (harness artifact, identical prompt both sides); journey A agents also had to learn `--task` resolves against their shell's CWD — the refusal named it and an absolute path fixed it. Transcripts: `%TEMP%/bt7c-measure/runs/{a,b}{1..3}/transcript.md` before, `…{a,b}after{1..3}` after.
