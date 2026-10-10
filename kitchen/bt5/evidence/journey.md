# BT5 journey — the whole leg, by session

A real bounty on this repository's own recorded nit (the empty
`allowedDestinations` rendering the BT4 pass flagged), run end to end with
the built CLI. Bounty id `bt-e197a6998847`; record at
`.box/bounties/bt-e197a6998847.json` (stage: applied, ended).

## Poster — the head chef's session, inside a cold clone

Clone `%TEMP%\bt5-journey\clone` at `wave/BT5`. First `bounty create` failed
in `setup`: the shipped snapshot has no `node_modules`, and `setup.mjs`
assumed repository-local pnpm was already installed — a real solver would
have hit exactly this. **Journey finding #1**, fixed by the cook in `c0746e0`
(bootstrap `scripts/tooling` via npm first; TASK.md, PROTOCOL.md, check and
fixture diagnostics updated). Second create previewed the full package (3
never-ship files removed, 3,883 files shipped), proved the declared check
failing on the snapshot, and drafted. `confirm` (chef standing in for the
owner), then `post --to %TEMP%\bt5-journey\delivered`.

Rough edge recorded: the title derived verbatim from TASK.md keeps its
leading `#`, so the slug and listing read "# Fix the dangling…". Cosmetic;
not fixed in this wave.

## Solver — a fresh `box-recipient`, given only the delivered folder

Saw: `delivered/bt-e197a6998847/` — README, `bounty.json`, the task, `repo/`.
Did NOT see: this repository, the wave brief, this protocol, or the fix.

It ran the declared setup cold (npm ci → pnpm install → build — finding #1's
fix is what made that possible), reproduced both failures, fixed the two
render sites (`packages/box-bounty/tell.ts` — empty list now reads "nowhere —
the owner's \"allowedDestinations\" is an empty list…"; `record.ts` — the
refusal drops the empty parens), re-ran the declared check to green (11/11)
and the whole `test:box-bounty` suite (142 tests) inside `repo/`.

Disclosures it volunteered: an early `grep` without a path argument defaulted
to the shell's cwd — the origin checkout on this host — and listed matching
file *paths* (no contents opened; it re-ran scoped to the folder). It also
asked two things a real solver would ask: is the phrasing acceptable
(verbatim wording is product in this codebase), and should a permanent
regression test ship (it added none — the declared check covers the fix and
the task asked for none). Both flagged for the pass's wording review.

## Collector — a different fresh session on the clone, no prior context

Saw: the clone's working state — the marked `open bounties:` line in
AGENTS.md and `.box/bounties/OPEN` led it to the record; `bounty status`
named the next command itself. Did NOT see: the poster's reasoning, the
solver's transcript, anything outside the clone.

`answer --from <delivered folder>` refused `answer-unsafe-path`: the solver's
`pnpm install` left junctions and build trees inside `repo/`, and an answer
carries plain files only. **Journey finding #2** — the README never tells a
solver to clean what setup creates before hand-back, so the documented happy
path produces an unreturnable answer. The collector reconstructed the folder
the solver would have returned had it cleaned (pristine staging copy + the 2
edited files, `diff -r` verified, `bounty.json` identical), re-ran `answer`,
got `verified` — check exits 0 on the snapshot (1 at create), +13/−2, clean
merge read, no flags — and judged **apply** in its own words, held only by
its own session's no-commit constraint. Its writeup: `journey-collect.md`.

## Apply and verify — the head chef, mechanically

The collector supplied the judgement; the chef ran the tool:
`bounty apply bt-e197a6998847 1` merged attempt 1 as `e720caa` on the clone's
`wave/BT5`, record to stage `applied`, durability refs removed, undo path
named. The merge and the record commit `7912e1a` were fetched into this
checkout and fast-forwarded onto `wave/BT5` — the solver's diff arrived
through the tool's own merge path, reviewable like any code.

On this checkout after rebuild: `node kitchen/bt5/check.mjs` → PASS, all 11
assertions (`check-postfix.txt`); `node scripts/suite.mjs box --suite bounty`
→ 142/142 green.

## What the journey actually proved

- A blind solver fixed a real defect using only what the folder carried.
- A fresh collector found the bounty from the record alone, got a facts-only
  report, and made the decision — the tool never did.
- Two findings the wave existed to catch: cold-copy setup (fixed, `c0746e0`)
  and the unreturnable polluted hand-back (recorded — needs a product
  decision on solver-cleanup docs vs an answer-side artifact rule).
- The check never passed for the wrong reason: red before, green only after
  the applied fix, controls green throughout.
