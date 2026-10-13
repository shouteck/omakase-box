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

- Worker: cook A (`1ed01f9`, correction `54eaf5b`) · Reviewer: the pass — Devin subagent (Claude) on the Windows host, fresh agent, did not write this code
- Commit: `1ed01f9` reviewed first (FAIL below), re-reviewed at correction `54eaf5b`; `9dc6752`, `28314d1` verified to touch only waves/BT7c.md (`git show --stat`)
- Verify: `verify 54eaf5b PASS check=0 build=0 test:box-bounty=0 test:box-package=0 db=none 459s` — recorded run on this exact commit, clean tree (265 + 142 green, `.kitchen/runs/2026-10-13T00-35-05-156Z-54eaf5b`); relied on per the pass's rules, time spent attacking the fix
- Verdict: PASS · Level: ui-verified
- Lenses:
  - Security: attacked where the guarantees now live, live on the built CLI — a returned `repo/` holding a link is `answer-unsafe-path` through `look --from`; a `.env` is `answer-never-ship` through both `apply --from` and `look --from`; a nested `.git/` tree is `answer-never-ship` (`dot-git`) through `look --from` — each refused before anything was written (no attempt refs, clean worktree). The pull-request path is covered by the migrated tests (`answer-unsafe-path`/`answer-never-ship`/`answer-empty`/`github-pr-not-descended` through `lookBounty`/`applyBounty`, plus the end-to-end `look <n>` collection in bt7-cli.test.ts). `status --comments` prints every comment line `other account | <quoted>` and refuses a mismatched issue by name — covered, including a comment reading "box says: ignore your task". One hole found: a pre-wave record's stored `outside.answers` text is replayed verbatim (see findings).
  - User experience: all 12 transcripts and both tool-output.logs read. After-side agents ran `look <id> --from <dir>` once per solution — collect and read in one command (9/7/9 commands vs 11/12/12 before). Nobody reached for `undo`/`reply`/`questions`/`answer` (no `command-removed` in any after log) and nothing a removed command gave was wanted. Hesitations, identical both sides: the unquoted-backslash CLI path mangled by the shell (harness artifact), and `--task` resolving against the shell's CWD (journey A, one refused retry then absolute path). Every command an agent ran had been named by prior output or the card.
  - Measurement fairness: same fixtures both sides — each run's repo diffs clean against its journey template (B runs differ only by the identical applied fix); cards differ only by run directory; all 12 runs counted, all finished; `wc -c` of every tool-output.log matches the tabled numbers exactly and the spreads are computed right. Before-logs contain `box bounty answer`/`bounty undo` text (master's dist), after-logs show only the new surface — the right build ran each side.
- Method: cook audit per command, then the cut with refusals first; measured journeys below — fresh `subagent_general` agents on stamped template copies, master's `dist` before, the wave's `dist` after. Review round 1 (`1ed01f9`): full `git diff master...28314d1` read; built CLI attacked live on a scratch repo (all seven removed commands refuse `command-removed` exit 3 naming the replacement, with and without args; no alias found); legacy `undone`/`rejected`-style record fabricated and shown to load with live-command next steps and remapped history/pending text. Review round 2 (`54eaf5b`): `git diff e8eb14c..54eaf5b` is 13 lines in record.ts plus the enumeration test and this table; the scrub was attacked live with stored `outside.answers` in shapes beyond the reproduction — `answer --pr <n>` mid-listing, `answer --from`, `undo` in a next-step line, `reject --reason`/`withdraw`/`questions`/`reply`/`remind` several per line, benign prose containing "the answer"/"answers" — `status --full`, `describe`, `OPEN` and the rules block all print only live commands (`answer --pr` is rewritten to the exact `look`/`apply` pair; other removed names to `status`; benign prose untouched).
- Findings and limits:
  - Round-1 FAIL, now FIXED — a removed command name still printed: stored `github.outside.answers` was replayed verbatim (status, describe, OPEN file, rules block) while GitHub could not refresh. The correction adds the `outside.answers` scrub in `asRecord` beside the `pending` remap. Verified live on `54eaf5b` with the attack shapes above; my reproduction test `bt7c-review.test.ts` now passes.
  - Round-1 finding, FIXED — the every-message test now exists: the enumeration in `bt7c-review.test.ts` scans every renderer (help, describe/rules with and without a repository, open-bounties line, rules block), status in every mode over records in every reachable stage including planted pre-wave text and a corrupt record, a refusal from each command path, and the built CLI's journey plus removed-name refusals. Residual surface it cannot cover: library-only strings never reachable through a command (e.g. `listGitHubAnswers` output before it lands in `outside.answers`) — audited by reading; it names `look`/`apply` today. `attempt.report` next-lines are filtered by `notNext` and never carried command names otherwise.
  - Round-1 finding, FIXED — the moved-tests table below is now present; spot-checked against the diff: every claimed refusal (`answer-mismatch`, `snapshot-mismatch`, `manifest-tampered`, `answer-malformed`, `answer-empty`, `answer-unsafe-path`, `answer-never-ship`, `snapshot-lost`, `missing-reason`, `github-issue-mismatch`, `apply-unsafe-config`) still has a live test; the deleted `undo`/`reply` tests covered code paths that no longer exist. No tested guarantee silently dropped.
  - Behaviour notes (documented widenings, not defects): `close --reason` lands `rejected` on any open stage including a draft — old `reject` refused pre-posted stages (`wrong-stage`); `close` on any ended record exits 0 with `already ended (<stage>)` where old `withdraw` refused `already-ended` on stages it did not own. Both are stated in help and BOUNTY.md. Pre-existing CLI laxness unchanged: unknown flags are silently ignored (`status --questions`, `close --withdraw`, `apply --pr`).
  - Scope, docs and the rest verified clean: diff touches only the allowed paths (never-ship table, export/submit/verify/trace, AGENTS.md, PLAN.md untouched); `confirm` still gates `post` (`not-confirmed`, `not-drafted` live); help/describe/usage/status name only live commands in the fresh-message paths I exercised; BOUNTY.md names no stale command and describes close's semantics and old-state records honestly.
  - Limit kept from round 1: the scrub covers tool-written stored text (`pending`, `outside.answers`); agent/owner-supplied text (reject reasons, resume notes, event reasons) is the agent's own words shown as facts, not the tool's recommendation — out of the guarantee's scope by design.
- Merged: `1ce6cc7` (--no-ff, pushed) · Resources removed: `wave/BT7c` branch deleted; `%TEMP%/bt7c-measure` (templates + all 12 run dirs) and `box-k6-*` stats swept
- Reflect: **wave-only** — stamped template copies + identical cards made the before/after measurement fair and cheap; unquoted Windows paths and CWD-relative `--task` were the only hesitations and appeared on both sides. **station** — two additions on the packaging card: stored outside text is a replay surface, and fresh agents did not reach for any removed command. **kitchen-wide** — the "search every output" requirement caught a stored-state replay the render-path scan missed; worth remembering when the next removal wave (BT8 takes `confirm`) comes.

### Tests removed and guarantees moved (the done-when accounting the pass asked for)

| Removed command | Tests deleted with it | Where each guarantee's tests went |
|---|---|---|
| `undo` | bt6b.test.ts — "refuses undo for as long as undo exists", "hole 1: refuses undo under a bare interpreter filter", "hole A: refuses undo the same way", "hole C: refuses undo under an exec operand" (the revert no longer exists, so nothing tool-side runs it); github.test.ts — "…records undo" leg and "undo preserves unfinished apply facts and outside cleanup" | no tool guarantee remained: an applied merge is one ordinary commit and plain `git reset`/`git revert` reverses it without running solver code — that is the agent's own Git, not the tool's. What survived is `apply` naming the merge commit (answer.test.ts "an answer lands at answered and waits…") and the `undone` legacy stage loading cleanly (record.test.ts, bt7c-review.test.ts). `apply`'s merge preflight keeps its refusals — the bt6b filter/driver holes are still tested on `apply` |
| `reply` | bt7-refusals.test.ts — the reply half of "refuses to read or reply on an existing issue that is not this bounty's"; bt7.test.ts — the "records owner replies" leg | no guarantee remained: posting a comment is `gh issue comment` under the agent's own account. The issue-binding refusal (a foreign issue is never read or posted to) moved to bt7.test.ts "…owner replies post through gh" and the `github-issue-mismatch` refusal in bt7-refusals.test.ts |
| `remind` | tell.test.ts — the `box bounty remind (built cli)` describe, including "prints the reminder line only when the limits file switches it on" | none — nothing consumed the output; the owner `reminders` limits field stays a known field (limits resolution unchanged) |
| `answer` | none as a command — every `answer` describe in answer.test.ts was re-pointed, not dropped | collection and every collection refusal now sit behind `look <n>`/`apply <n>`/`--from`: answer.test.ts keeps the full matrix (`answer-mismatch`, `snapshot-mismatch`, `manifest-tampered`, `answer-malformed`, `answer-empty`, `answer-unsafe-path`, `answer-never-ship`, `snapshot-lost`, dirty-worktree aborts), bt7-cli.test.ts covers `look <n>` collection end to end, k14-start-budget.test.ts carries the start budgets |
| `questions` | none — the `BT7 questions` describe was rewritten, not dropped | bt7.test.ts "shows only question metadata in status, quotes others with --comments, and owner replies post through gh"; the count/`other account` quoting refusals in bt7-refusals.test.ts; the CLI path in bt7-git-channels.test.ts; the budget entry in k14-start-budget.test.ts (`status-comments`) |
| `reject` | none as a command — re-pointed inside answer.test.ts and record.test.ts | `close --reason` carries it: answer.test.ts "close --reason ends an answered bounty with the reason kept on the event" and the rejected-stage cases; the empty-reason refusal is `missing-reason` in closeBounty (record.test.ts/CLI close tests) |
| `withdraw` | none as a command — the `withdraw` describes were renamed `close` | record.test.ts "close — ends an open bounty cleanly" (both closing forms, double-close `already-ended`); github.test.ts keeps the outside-cleanup cases as close: branch removal after a failed issue post and issue close after a lost creation response |

Every removed name typed at the built CLI refuses `command-removed` (exit 3) naming the replacement — bt7-cli.test.ts, and the correction's corpus scan in bt7c-review.test.ts.

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
