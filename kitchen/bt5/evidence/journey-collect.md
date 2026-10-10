# BT5 journey — collect leg, recorded by the collector session

A fresh session (no prior context) was pointed at this clone. It found the
open bounty through the marked block in AGENTS.md and `.box/bounties/OPEN`,
read the record, and ran the journey's return leg with the tool — nothing
else. `bounty status` itself names `answer --from <dir>` as the next step.

## What the solver handed back

`%TEMP%\bt5-journey\delivered\bt-e197a6998847` came back with the fix applied
and the declared setup run inside `repo/` (timestamps: `record.ts`/`tell.ts`
edited 21:20, `node_modules/` + `dist/` trees created 21:17–21:19; the rest of
the folder is the byte-identical ship of 21:16–21:17). The only content change:
2 files, `packages/box-bounty/record.ts` and `packages/box-bounty/tell.ts`.

## Journey finding #2 — a solver that follows the README cannot hand the folder back

`bounty answer --from <the returned folder>` refused `answer-unsafe-path`: the
solver's own `pnpm install` left junction links (`apps/contributor-portal/node_modules/react`, …)
inside `repo/`, and an answer carries plain files only. Even without links,
every install/build artifact would be extracted as an "added" file into the
answer commit. The solver-facing README declares setup+check inside `repo/`
but never says to remove what setup creates before handing back — so the
documented happy path produces an unreturnable answer. Fix direction: the
packaging/README should tell the solver to hand back a clean folder (or the
answer side should ignore paths outside the manifest's set that a never-ship-
style "derived artifacts" rule names). Not fixed here — product decision.

## What this session did about it

Reconstructed the folder the solver would have handed back had it cleaned up:
a byte copy of the pristine staging folder
(`%TEMP%\bt5-journey\bounties\fix-the-dangling-rendering-of-an-empty-a`)
plus the solver's two edited files. Verified: `diff -r` against the returned
folder (excluding `node_modules/` and `dist/`, which do not exist in the
staging ship) shows no other differences; `bounty.json` byte-identical. The
reconstruction sits at `%TEMP%\bt5-collect\bt-e197a6998847` — delete at wave
close. The original returned folder was left untouched.

## The facts the tool reported (answer run, 2026-10-10 ~13:36Z)

    bt-e197a6998847 — attempt 1 recorded: the check exits 0 on the snapshot it
    was made for (verified — nothing is applied)
      check: node kitchen/bt5/check.mjs — exited 1 at create; on the answer it exits 0
      guard: none declared
      change: 2 changed, 0 added, 0 deleted — 13 lines added, 2 removed
      current code: the answer would merge cleanly onto the current branch
      flags: none
      next: box bounty apply bt-e197a6998847 1 — or reject --reason "<why>"

Answer commit `a3281e3` (ref `refs/box-bounty/bt-e197a6998847-answer-1`) holds
exactly the two files; `git show --stat` matches the report. The record now
reads drafted → confirmed → posted → taken → answered → **verified**.

## The collector's read of the diff (not the verdict — the pass's)

- `tell.ts`: `allowedDestinations: []` now renders
  `where post --to may deliver: nowhere — the owner's "allowedDestinations" is an empty list, so no destination is allowed`
  — no dangling "only inside ", no `()`, and it does not claim "any local folder".
- `record.ts`: the `destination-not-allowed` refusal on an empty list names
  the empty-list fact in prose instead of printing `()`. Non-empty list keeps
  the join; absent field keeps "any local folder"; empty still refuses every
  `--to` (semantics kept, per TASK.md "Done when").

## Decision

Session constraint: no commits to any branch — `apply` creates a merge commit
on `wave/BT5`, so it was not run. The bounty sits at `verified`, attempt 1
waiting. Recommendation to the head chef: the facts support
`box bounty apply bt-e197a6998847 1`; the diff then gets the pass's normal
review like any code.

## What this session did NOT see (blindness statement, collector side)

No solver transcript, no conversation with the solver, no instruction beyond
the returned folder and this repository — the collector's evidence is the
folder's bytes plus the tool's facts report. The solver-side blindness
(folder-only, no repository access) is attested by the staging/delivered
trees, not re-verified here.
