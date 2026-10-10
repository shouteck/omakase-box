# BT3b: fewer things to supply

Milestone: BT · Station: packaging · Base: `c6be31b` · Branch: `wave/BT3b` · Timebox: 60 minutes; at expiry, report partial findings and stop

## Outcome

`create` needs less from the agent. One line of why is recorded on every bounty; the title comes from the task when none is given; a sensible place to write is chosen; when no note is supplied the tool writes one from evidence it gathers itself. `box bounty help` shows the whole journey on one screen, and every success line ends with the exact next command. Two recorded rough edges are closed.

## Scope

- Write: `packages/box-bounty/**`, `packages/box-cli/src/cli.ts`, `tests/box/bounty/**`, `docs/box-v4/BOUNTY.md`.
- Read for context: `PLAN.md` (the design rule: the tool does everything mechanical, the agent supplies only judgement), `waves/BT3a.md` Result, `kitchen/stations/packaging.md`.
- Do not touch: the never-ship rule table, the snapshot identifier, the manifest binding, the merge/undo boundary, `export`/`submit`/`verify`/`trace`, `.execution/`, `docs/legacy/`.

## Done when

- `node scripts/verify.mjs test:box-bounty` exits 0 on the final commit.
- **One line of why, always.** `create --why "<one line>"` is required — without it, a named refusal (`missing-why`), not a usage wall. It lives only in the record (like `--job`: never in `bounty.json`, the listing or the shipped folder), so the reasons for handing off can be learned from use.
- **Title from the task.** When `--title` is absent the title is derived from the task text (first non-empty line, trimmed); `--title` still wins when given.
- **A sensible place to write.** When `--out` is absent the folder goes to a path *outside* the repository derived from the title (pick the shape, document it); the existing `out-inside-repo` and existing-destination refusals still apply.
- **The note writes itself when none is given.** Without `--note`, `create` composes the note from evidence it gathers: the declared check with its recorded failing exit and output tail (when a check exists), and the files changed relative to `snapshot.baseCommit`. With `--note` the file is used as today. Evidence-gathering never crashes `create` — a repo with nothing to report gets a plain note, not an error.
- **`box bounty help`** prints the whole journey on one screen — stages, each command one line, what ends a bounty — and works outside a checkout too. A bare `box bounty` still errors as usage, pointing at `help`.
- **Every success line ends with the exact next command.** Audit every command's output; a terminal state names the job instead. Nothing prints nothing.
- **Rough edges closed:** (a) the `not-a-repository` refusal names the command actually run, not `bounty create`; (b) `post --to` resolves the nearest *existing* ancestor before the inside-repo check — a nonexistent `--to` under a junction can no longer land inside the repository (the residual the pass proved in BT2; the `--out` same-class residual gets the same treatment if it is one line, else say why it is left).
- **Cases that must fail:** `create` without `--why` refused by name; a default `--out` that would land inside the repository refused; `help` prints a journey, never nothing; the wrong-verb message names the command run.
- BOUNTY.md updated for all of it.

## Review lenses

- [x] **Security:** the `--to` junction fix is a boundary fix — the reviewer attacks it with junctions at several depths, a `--to` that is itself a junction, and the same trick against `--out`.
- [x] **User experience:** this wave is the agent-facing surface. The reviewer creates a bounty cold with the minimum possible command and judges whether `create`'s output, the auto-written note and `help` let a fresh agent act without asking.
- [ ] **Measurement fairness:** not applicable.

## Notes for the worker

- Feature playbook. Small wave: prefer the fewest lines that satisfy each Done-when; do not redesign parsing.
- The `not-a-repository` message comes from `resolveRepoRoot` — give the command name through, or make the wording command-neutral.
- Out of scope: the deep limits (`secrets` basename over-removal, forgeable-record convention, untracked-via-junction live bytes, git-lfs stubs) — each is its own decision, not a rough edge. The `answered`+conflicts status gap is already closed by BT3a; verify, don't redo.

---

## Result

<One or two lines per item. Detail goes in a notes file next to the evidence, linked from here.>

- Worker: · Reviewer:
- Commit:
- Verify:
- Verdict: · Level:
- Lenses:
- Method:
- Findings and limits:
- Merged: · Resources removed:
- Reflect:
