# BT2: remember — the bounty's record lives in the project and moves through named stages

Milestone: BT · Station: packaging · Base: `e7089d1` · Branch: `wave/BT2` · Timebox: 50 minutes; at expiry, report partial findings and stop

## Outcome

Any later agent arriving in this repository can run `box bounty status`, see every open bounty with its stage and what to do next, and carry it forward — without inheriting the creating session. The bounty moves `drafted → confirmed → posted` through recorded events, the owner's yes is a recorded fact before anything is delivered, and `withdraw` ends one cleanly.

## Scope

- Write: `packages/box-bounty/**` (new record/lifecycle module, the never-ship addition below), `packages/box-cli/src/cli.ts`, `tests/box/bounty/**`, `docs/box-v4/BOUNTY.md`.
- Read for context: PLAN.md's journey table, `waves/BT1.md`, `packages/box-bounty/{manifest,git,create}.ts`, `kitchen/stations/packaging.md`.
- Do not touch: `.github/workflows/**`, `packages/box-package`, `box-trace`, or any other package; existing tests' expected outcomes; snapshot emission semantics.

## Done when

- `node scripts/verify.mjs test:box-bounty` exits 0 on the final commit.
- **A record per bounty, in the project.** `bounty create` also writes `.box/bounties/<id>.json` inside the repository (stage `drafted`, created timestamp, title, level, snapshot commit+tree, and the absolute path of the bounty folder it wrote). The tool writes the file; it does not commit — committing is the agent's normal flow.
- **The record makes the snapshot durable.** Create keeps a git ref `refs/box-bounty/<id>` pointing at `snapshot.commit`, so `git gc --prune=now` cannot take the bytes the identifier names. `withdraw` removes the ref. (BOUNTY.md already warns the unreferenced commit can be pruned; this is the wave that closes that.)
- **`status` lists every open bounty** with id, title, stage and next step — and never prints nothing: an empty `.box/bounties/` says so and says what to do. Ended bounties may be a compact line or a count, not silence.
- **`confirm <id>` records the owner's yes** (drafted → confirmed) with a timestamp. Confirming a bounty that is not drafted is a named refusal, not a crash.
- **`post <id> --to <dir>` is the first delivery** and it is gated: unconfirmed → `not-confirmed`; the recorded folder gone or its `bounty.json` not matching the id → a named refusal; destination inside the repository or already existing → a named refusal. On success it copies the bounty folder to `<dir>/<id>/` (copy, not move) and marks the bounty `posted` with the destination recorded.
- **`withdraw <id>` ends any open stage** → `withdrawn`, removes the ref, and is safe to repeat (already-withdrawn is a named state, not an error).
- **Bounty records never ship inside a bounty.** A `.box` path segment is removed by a new built-in never-ship rule (exact segment `.box` — the `.boxignore` file must still match nothing). Prove it: create a second bounty in a repo that already holds `.box/bounties/` and the record files do not appear in it.
- **Must-fail cases are tested:** post before confirm refused; post to an existing or in-repo destination refused; post with the folder deleted refused by name; status on an empty project prints a next step; double-withdraw is a named state.
- Stage names are exactly the journey's: `drafted, confirmed, posted, taken, answered, verified, applied`, ended early as `rejected, withdrawn, expired`. This wave's commands only ever reach `posted`/`withdrawn`, but the record model knows the whole set so BT3 extends it rather than redesigning it.

## Review lenses

- [x] **Security:** the `confirmed` gate is the owner's-yes boundary — nothing is delivered before it. The reviewer tries to get bytes to a destination without it, attacks the `.box` never-ship rule (spelling, case, link), and tries destination escapes.
- [x] **User experience:** this is the agent-facing surface — every outcome a named state with a next step. The reviewer reads `status` output cold, as a fresh agent would, and says what was unclear.
- [ ] **Measurement fairness:** not applicable.

## Notes for the worker

- Feature playbook. Reuse `git()` in `git.ts` for ref writes (`update-ref`/`delete-ref`); reuse the `BountyRefused` named-refusal convention and the exit-code split already in `cli.ts` (refusals 3, usage 2, operational 1).
- The record shape is yours to design within the Done-when lines — append a stage event per transition rather than rewriting state. Absolute folder paths are acceptable: the record lives on the machine that made the bounty.
- `bounty create`'s success line already says "stage 1 of 7: drafted"; keep that, and let it also say where the record was written.
- Document the record location, the commands and the ref in BOUNTY.md, including that `.box/` never ships.

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
