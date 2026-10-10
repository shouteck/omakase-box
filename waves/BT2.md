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

- Worker: box-cook · Reviewer: the pass (fresh agent; host: Windows, Git Bash; model: Claude/Anthropic)
- Commit: `40f370786d64acce4c1ba4c2c3e6752d2f30494f`
- Verify: `verify 40f3707 PASS check=reused@2026-10-10T04-14-42-628Z-40f3707 build=reused@2026-10-10T04-14-42-628Z-40f3707 test:box-bounty=reused@2026-10-10T04-14-42-628Z-40f3707 db=embedded 8s` — my own invocation exited 0 at run `2026-10-10T04-22-39-158Z-40f3707`, clean tree, all steps reused recorded PASSes on this exact SHA
- Verdict: **PASS** · Level: ui-verified (built `dist/cli.js` driven end-to-end on a scratch repo, plus hostile in-band probes)
- Lenses:
  - **Security:** the `confirmed` gate holds through the tool — post-before-confirm, double-post and post-after-withdraw all refuse `not-confirmed` (exit 3), nothing is copied. `dot-box` holds: `.BOX`/`.Box`/nested `deep/.box/` all removed (canonical path is lower-cased; on Windows the spellings collapse to `.box` anyway), `.boxignore` still ships and its owner list still removes, and `.box/bounties/*.json` never entered a second bounty (proved). Destination escapes refused by name: literal in-repo `--to`, an existing junction realpathing into the repo, an existing `<dir>/<id>`. Residuals below.
  - **User experience:** read cold as a fresh agent — `status` on a bounty-less project names the state and the exact `create` command; every transition prints `stage N of 7` plus the next command; every refusal names itself, its remedy and exits 3; a corrupt record file is named, not dropped; `already withdrawn` is a named exit-0 state. Unclear: `post`/`status` say "the answer comes back through this tool" but no answer command exists until BT3 (BOUNTY.md does say so); `status` outside a checkout refuses `not-a-repository` but the message says "bounty create needs a repository" — wrong verb for the command run.
- Method: diffed `master...40f3707` (all touched paths inside the brief's Write scope); read `record.ts`, `create.ts`, `never-ship.ts`, `snapshot.ts`, `cli.ts`, the new tests and the `fingerprint` edit; ran `node scripts/verify.mjs test:box-bounty` myself (reused recorded PASSes on this SHA — nothing about the record was in doubt, no `--fresh` needed); built with `node scripts/workspace.mjs build`; then attacked a real scratch repo in `%TEMP%` with junctions, forged and swapped record/manifest files, deleted folders and case-spelled `.box` dirs.
- Findings and limits (all non-blocking):
  - **`--to` nonexistent-under-junction residual (proved):** `--to` is realpath'd only when it exists, so `J\newdir` where junction `J` points into the repo bypasses `destination-inside-repo` — the delivered copy landed inside the checkout and then shipped inside the next bounty (proved end-to-end). Same class as BT1's accepted `--out` junction residual, and narrower: an existing `--to` is realpath'd correctly. Fix direction: realpath the nearest existing ancestor of `--to`.
  - **The record is a plain JSON the agent can forge:** flipping `stage` to `confirmed` by hand lets `post` deliver without a real confirm (proved). The gate is a workflow convention, not confinement — the same agent could copy the folder directly — and forgery leaves a forensic trace (events show `drafted → posted` with no `confirmed` event). Worth a documented limit, not a block.
  - **`fingerprint` support edit weighed:** excluding `.box` is required — create now writes `.box/bounties/<id>.json` on purpose — and the intent (everything else untouched: HEAD, index bytes, status, file hashes) is preserved. Minor asymmetry: the file walk skips `.box` at any depth while the status filter hides only root `.box/`; a stray write under root `.box/` outside `bounties/` would be invisible to the helper. Acceptable.
  - **Test quality checked:** every new test would fail if the code under test did nothing — `expectRefusal` asserts a thrown `BountyRefused` with the exact reason (`expect.unreachable` otherwise), success paths assert on-disk bytes, recorded events and the git ref (gc-survival is a real `gc --prune=now`). All must-fail cases the brief lists are tested and were re-probed live through the CLI.
- Merged: — (reviewer's call: mergeable) · Resources removed: scratch repo, junctions and delivered copies under `%TEMP%\bt2-review-9ZrSXF` removed; no product code edited, no tests added or weakened.
- Reflect: the record-as-state-machine and the gated post match the brief; the two residuals are the honest kind — flagged or forgery-visible — and the `.box` never-ship attack surface held under every spelling tried.
